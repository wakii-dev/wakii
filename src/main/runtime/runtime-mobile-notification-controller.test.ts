import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAppEnvironment } from '../../shared/app-environment'
import type { ResolvedWorktree } from './runtime-worktree-path-identity'
import { OrchestrationDb } from './orchestration/db'
import {
  scanWorktreeBracketMtimes,
  wireGateTransitionNotifications
} from './runtime-gate-transition-notifications'
import {
  RuntimeMobileNotificationController,
  type MobileNotificationDispatchEvent
} from './runtime-mobile-notification-controller'
import { OrcaRuntimeService } from './orca-runtime'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => tmpdir()), isPackaged: false },
  BrowserWindow: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  webContents: { fromId: vi.fn(() => null) }
}))

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const db of openedDbs.splice(0)) {
    db.close()
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

const openedDbs: OrchestrationDb[] = []

function createDb(): OrchestrationDb {
  const db = new OrchestrationDb(':memory:')
  openedDbs.push(db)
  return db
}

function fakeResolvedWorktree(id: string, path: string): ResolvedWorktree {
  // Catalog matching in the listener only reads id + path.
  return { id, path } as unknown as ResolvedWorktree
}

function seedSettledDispatch(db: OrchestrationDb, worktreeId: string | null): string {
  const task = db.createTask({ spec: 'gate notification' })
  const { dispatch } = db.createStartingWorkerDispatch({
    taskId: task.id,
    startOptions: {},
    creator: { kind: 'system' },
    maxDepth: Number.MAX_SAFE_INTEGER
  })
  // createGate fences against an active worker; a settled one passes.
  db.db
    .prepare('UPDATE worker_dispatches SET state = ? WHERE dispatch_id = ?')
    .run('succeeded', dispatch.id)
  if (worktreeId !== null) {
    db.db
      .prepare('UPDATE worker_dispatches SET worktree_id = ? WHERE dispatch_id = ?')
      .run(worktreeId, dispatch.id)
  }
  return task.id
}

type Harness = {
  db: OrchestrationDb
  controller: RuntimeMobileNotificationController
  events: MobileNotificationDispatchEvent[]
  listCatalog: ReturnType<typeof vi.fn>
  scanBracketMtimes: ReturnType<typeof vi.fn>
}

function createWiredHarness(): Harness {
  const db = createDb()
  const controller = new RuntimeMobileNotificationController()
  const events: MobileNotificationDispatchEvent[] = []
  controller.onDispatched((event) => {
    if (event.type === 'notification') {
      events.push(event)
    }
  })
  const listCatalog = vi.fn(async () => [fakeResolvedWorktree('repo::/wt/a', '/wt/a')])
  const scanBracketMtimes = vi.fn((worktreePath: string) =>
    worktreePath === '/wt/a'
      ? [
          { storyId: 'brackets/older.md', mtime: 10 },
          { storyId: 'brackets/newer.md', mtime: 20 }
        ]
      : []
  )
  wireGateTransitionNotifications({
    db,
    listCatalog,
    dispatch: (event) => controller.dispatch(event),
    scanBracketMtimes
  })
  return { db, controller, events, listCatalog, scanBracketMtimes }
}

describe('RuntimeMobileNotificationController gate sources', () => {
  it('forwards gate-open and gate-closed sources to listeners and replay', () => {
    const controller = new RuntimeMobileNotificationController()
    const seen: MobileNotificationDispatchEvent[] = []
    controller.onDispatched((event) => {
      if (event.type === 'notification') {
        seen.push(event)
      }
    })
    controller.dispatch({ type: 'notification', source: 'gate-open', title: 'Proceed?', body: '' })
    controller.dispatch({
      type: 'notification',
      source: 'gate-closed',
      title: 'Proceed?',
      body: 'yes'
    })
    expect(seen.map((event) => event.source)).toEqual(['gate-open', 'gate-closed'])
    const missed = controller.getMissedSince(0)
    expect(missed).toHaveLength(2)
  })
})

describe('wireGateTransitionNotifications', () => {
  it('dispatches gate-open with empty body and routed fields on createGate', async () => {
    const harness = createWiredHarness()
    const taskId = seedSettledDispatch(harness.db, 'repo::/wt/a')

    const gate = harness.db.createGate({ taskId, question: 'Proceed with rollout?' })
    await vi.waitFor(() => expect(harness.events).toHaveLength(1))

    expect(harness.events[0]).toMatchObject({
      type: 'notification',
      source: 'gate-open',
      title: 'Proceed with rollout?',
      body: '',
      gateId: gate.id,
      worktreeId: 'repo::/wt/a',
      storyId: 'brackets/newer.md'
    })
  })

  it('dispatches gate-closed with the resolution as body, once per resolution', async () => {
    const harness = createWiredHarness()
    const taskId = seedSettledDispatch(harness.db, 'repo::/wt/a')
    const gate = harness.db.createGate({ taskId, question: 'Proceed?' })
    await vi.waitFor(() => expect(harness.events).toHaveLength(1))

    harness.db.resolveGate(gate.id, 'Ship it')
    harness.db.resolveGate(gate.id, 'Ship it later')
    await vi.waitFor(() => expect(harness.events).toHaveLength(3))

    expect(harness.events[1]).toMatchObject({
      source: 'gate-closed',
      title: 'Proceed?',
      body: 'Ship it',
      gateId: gate.id,
      worktreeId: 'repo::/wt/a',
      storyId: 'brackets/newer.md'
    })
    // Spec pins duplicates as harmless: no dedupe at the wiring layer.
    expect(harness.events[2]).toMatchObject({ source: 'gate-closed', body: 'Ship it later' })
  })

  it('keeps an empty body when a timed-out gate has null resolution', async () => {
    const harness = createWiredHarness()
    const taskId = seedSettledDispatch(harness.db, 'repo::/wt/a')
    const gate = harness.db.createGate({ taskId, question: 'Proceed?' })
    await vi.waitFor(() => expect(harness.events).toHaveLength(1))

    harness.db.timeoutGate(gate.id)
    await vi.waitFor(() => expect(harness.events).toHaveLength(2))

    expect(harness.events[1]).toMatchObject({ source: 'gate-closed', body: '' })
  })

  it('dispatches without routing fields when the gate has no dispatch row', async () => {
    const harness = createWiredHarness()
    const task = harness.db.createTask({ spec: 'unmapped gate' })

    harness.db.createGate({ taskId: task.id, question: 'Unmapped proceed?' })
    await vi.waitFor(() => expect(harness.events).toHaveLength(1))

    expect(harness.events[0]).toMatchObject({
      source: 'gate-open',
      title: 'Unmapped proceed?',
      body: ''
    })
    expect(harness.events[0]).not.toHaveProperty('worktreeId')
    expect(harness.events[0]).not.toHaveProperty('storyId')
    expect(harness.listCatalog).not.toHaveBeenCalled()
  })

  it('nulls both routing fields when the mapped worktree has no brackets', async () => {
    const db = createDb()
    const events: MobileNotificationDispatchEvent[] = []
    const controller = new RuntimeMobileNotificationController()
    controller.onDispatched((event) => {
      if (event.type === 'notification') {
        events.push(event)
      }
    })
    const taskId = seedSettledDispatch(db, 'repo::/wt/bare')
    wireGateTransitionNotifications({
      db,
      listCatalog: async () => [fakeResolvedWorktree('repo::/wt/bare', '/wt/bare')],
      dispatch: (event) => controller.dispatch(event),
      scanBracketMtimes: () => []
    })

    const gate = db.createGate({ taskId, question: 'Bracketless proceed?' })
    await vi.waitFor(() => expect(events).toHaveLength(1))

    // Spec §3a:87-88 — worktree without brackets routes to the 'khác' group: both null.
    expect(events[0]).toMatchObject({
      source: 'gate-open',
      title: 'Bracketless proceed?',
      body: '',
      gateId: gate.id
    })
    expect(events[0]).not.toHaveProperty('worktreeId')
    expect(events[0]).not.toHaveProperty('storyId')
  })

  it('nulls both routing fields when the catalog has no row for the derived worktree', async () => {
    const harness = createWiredHarness()
    const taskId = seedSettledDispatch(harness.db, 'repo::/wt/unknown')
    harness.listCatalog.mockResolvedValue([fakeResolvedWorktree('repo::/wt/other', '/wt/other')])

    harness.db.createGate({ taskId, question: 'Unrowed proceed?' })
    await vi.waitFor(() => expect(harness.events).toHaveLength(1))

    expect(harness.events[0]).toMatchObject({
      source: 'gate-open',
      title: 'Unrowed proceed?',
      body: ''
    })
    expect(harness.events[0]).not.toHaveProperty('worktreeId')
    expect(harness.events[0]).not.toHaveProperty('storyId')
    expect(harness.scanBracketMtimes).not.toHaveBeenCalled()
  })

  it('keeps routing fields null and still dispatches when the catalog throws', async () => {
    const db = createDb()
    const events: MobileNotificationDispatchEvent[] = []
    const controller = new RuntimeMobileNotificationController()
    controller.onDispatched((event) => {
      if (event.type === 'notification') {
        events.push(event)
      }
    })
    const taskId = seedSettledDispatch(db, 'repo::/wt/gone')
    wireGateTransitionNotifications({
      db,
      listCatalog: async () => {
        throw new Error('catalog unavailable')
      },
      dispatch: (event) => controller.dispatch(event),
      scanBracketMtimes: () => []
    })

    const gate = db.createGate({ taskId, question: 'Degraded proceed?' })
    await vi.waitFor(() => expect(events).toHaveLength(1))

    expect(events[0]).toMatchObject({
      source: 'gate-open',
      title: 'Degraded proceed?',
      body: '',
      gateId: gate.id
    })
    expect(events[0]).not.toHaveProperty('worktreeId')
    expect(events[0]).not.toHaveProperty('storyId')
  })

  it('wires exactly once per db instance', () => {
    const harness = createWiredHarness()
    const setListener = vi.spyOn(harness.db, 'setGateTransitionListener')

    for (let index = 0; index < 2; index += 1) {
      wireGateTransitionNotifications({
        db: harness.db,
        listCatalog: async () => [],
        dispatch: (event) => harness.controller.dispatch(event),
        scanBracketMtimes: () => []
      })
    }

    expect(setListener).not.toHaveBeenCalled()
  })

  it('wires a swapped-in db instance', async () => {
    const harness = createWiredHarness()
    const nextDb = createDb()
    const nextEvents: MobileNotificationDispatchEvent[] = []
    const nextController = new RuntimeMobileNotificationController()
    nextController.onDispatched((event) => {
      if (event.type === 'notification') {
        nextEvents.push(event)
      }
    })
    wireGateTransitionNotifications({
      db: nextDb,
      listCatalog: async () => [],
      dispatch: (event) => nextController.dispatch(event),
      scanBracketMtimes: () => []
    })

    const taskId = seedSettledDispatch(nextDb, 'repo::/wt/b')
    nextDb.createGate({ taskId, question: 'Swapped db proceed?' })
    await vi.waitFor(() => expect(nextEvents).toHaveLength(1))

    expect(nextEvents[0]).toMatchObject({ source: 'gate-open', title: 'Swapped db proceed?' })
    expect(harness.events).toHaveLength(0)
  })

  it('never propagates dispatch failures back into the store', async () => {
    const db = createDb()
    wireGateTransitionNotifications({
      db,
      listCatalog: async () => [],
      dispatch: () => {
        throw new Error('notification channel exploded')
      },
      scanBracketMtimes: () => []
    })
    const taskId = seedSettledDispatch(db, 'repo::/wt/a')

    const gate = db.createGate({ taskId, question: 'Resilient proceed?' })
    await vi.waitFor(() => {})
    expect(gate.id).toBeTruthy()
  })
})

describe('runtime attach-point wiring', () => {
  it('setOrchestrationDb wires gate transitions into mobile notifications', async () => {
    const runtime = new OrcaRuntimeService(null, undefined, {
      attestAgentHookCompatibilityAuthority: () => null
    })
    const db = createDb()
    const taskId = seedSettledDispatch(db, 'repo::/wt/a')

    runtime.setOrchestrationDb(db)
    const events: MobileNotificationDispatchEvent[] = []
    runtime.onNotificationDispatched((event) => {
      if (event.type === 'notification') {
        events.push(event)
      }
    })

    const gate = db.createGate({ taskId, question: 'Via runtime swap?' })
    await vi.waitFor(() => expect(events).toHaveLength(1))

    // Catalog of a store-less runtime is empty → no row → spec §3a:87-88 nulls both fields.
    expect(events[0]).toMatchObject({
      source: 'gate-open',
      title: 'Via runtime swap?',
      body: '',
      gateId: gate.id
    })
    expect(events[0]).not.toHaveProperty('worktreeId')
    expect(events[0]).not.toHaveProperty('storyId')
  })

  it('getOrchestrationDb wires the lazily created db', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'gate-lazy-userdata-'))
    temporaryDirectories.push(userData)
    setAppEnvironment({
      getPath: (name) => (name === 'userData' ? userData : tmpdir()),
      getAppPath: () => tmpdir(),
      getVersion: () => 'test',
      isPackaged: () => false,
      onWillQuit: () => {},
      exit: () => {},
      getAppMetrics: () => []
    })

    const runtime = new OrcaRuntimeService(null, undefined, {
      attestAgentHookCompatibilityAuthority: () => null
    })
    const events: MobileNotificationDispatchEvent[] = []
    runtime.onNotificationDispatched((event) => {
      if (event.type === 'notification') {
        events.push(event)
      }
    })

    const db = runtime.getOrchestrationDb()
    openedDbs.push(db)
    const taskId = seedSettledDispatch(db, 'repo::/wt/a')

    const gate = db.createGate({ taskId, question: 'Via lazy db?' })
    await vi.waitFor(() => expect(events).toHaveLength(1))

    expect(events[0]).toMatchObject({
      source: 'gate-open',
      title: 'Via lazy db?',
      body: '',
      gateId: gate.id
    })
    expect(events[0]).not.toHaveProperty('worktreeId')
    expect(events[0]).not.toHaveProperty('storyId')
  })
})

describe('scanWorktreeBracketMtimes', () => {
  it('lists md files as brackets/<filename> entries with mtimes', () => {
    const root = mkdtempSync(join(tmpdir(), 'gate-bracket-scan-'))
    temporaryDirectories.push(root)
    const bracketsDir = join(root, 'docs', 'superpowers', 'brackets')
    mkdirSync(bracketsDir, { recursive: true })
    writeFileSync(join(bracketsDir, 'fi-305-a.md'), '# Story: A')
    writeFileSync(join(bracketsDir, 'notes.txt'), 'not a bracket')

    const entries = scanWorktreeBracketMtimes(root)

    expect(entries.map((entry) => entry.storyId)).toEqual(['brackets/fi-305-a.md'])
    expect(entries[0]?.mtime).toBeGreaterThan(0)
  })
})
