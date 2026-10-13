import { EventEmitter } from 'node:events'
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WindowsProcessEvidence } from '../daemon/daemon-incarnation-evidence-types'
import {
  buildWslDistroHolderArgs,
  isWslDistroHolderCommandLine,
  WSL_DISTRO_HOLDER_MARKER
} from './wsl-distro-holder-command'
import {
  createWslDistroHolder,
  type WslDistroHolderChild,
  type WslDistroHolderDependencies
} from './wsl-distro-holder'
import { wslDistroHolderDirectory, type WslDistroHolderRecord } from './wsl-distro-holder-record'

const HOLDER_COMMAND = (distro: string): string =>
  `C:\\Windows\\System32\\wsl.exe -d ${distro} --exec /bin/sh -c "while :; do sleep 3600; done" ${WSL_DISTRO_HOLDER_MARKER}`

type FakeProcess = { commandLine: string | null; startedAtMs: number | null }

class FakeHost {
  processes = new Map<number, FakeProcess>()
  running = new Set<string>()
  tableFails = false
  nextPid = 4000
  spawned: string[] = []
  killed: number[] = []
  children: (EventEmitter & { pid?: number; unref: () => void })[] = []

  query = async (pid: number): Promise<WindowsProcessEvidence> => {
    if (this.tableFails) {
      return { status: 'unavailable' }
    }
    const row = this.processes.get(pid)
    return row ? { status: 'present', ...row } : { status: 'missing' }
  }

  spawn = (distro: string): WslDistroHolderChild => {
    const pid = this.nextPid++
    this.spawned.push(distro)
    const child = Object.assign(new EventEmitter(), { pid, unref: vi.fn() })
    this.children.push(child)
    this.processes.set(pid, { commandLine: HOLDER_COMMAND(distro), startedAtMs: 1_000 + pid })
    this.running.add(distro.toLowerCase())
    queueMicrotask(() => child.emit('spawn'))
    return child
  }

  kill = (pid: number): void => {
    this.killed.push(pid)
    this.processes.delete(pid)
  }
}

let userDataPath: string
let host: FakeHost

function makeHolder(overrides: Partial<WslDistroHolderDependencies> = {}) {
  return createWslDistroHolder({
    userDataPath,
    spawnHolder: host.spawn,
    queryProcess: host.query,
    killProcess: host.kill,
    listRunningDistros: async () => [...host.running],
    sleep: async () => {},
    ...overrides
  })
}

async function writeRecord(record: WslDistroHolderRecord): Promise<void> {
  const directory = wslDistroHolderDirectory(userDataPath)
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, `${encodeURIComponent(record.distro.toLowerCase())}.json`),
    JSON.stringify(record)
  )
}

async function recordFiles(): Promise<string[]> {
  return readdir(wslDistroHolderDirectory(userDataPath)).catch(() => [])
}

function record(overrides: Partial<WslDistroHolderRecord> = {}): WslDistroHolderRecord {
  return {
    version: 1,
    distro: 'Alpine',
    pid: 77,
    creationTimeMs: 5_000,
    startedAtMs: 5_001,
    ...overrides
  }
}

beforeEach(async () => {
  userDataPath = await mkdtemp(join(tmpdir(), 'wsl-distro-holder-'))
  host = new FakeHost()
})

afterEach(async () => {
  await rm(userDataPath, { recursive: true, force: true })
})

describe('holder command line', () => {
  it('runs a busybox-safe loop through --exec and names the distro', () => {
    expect(buildWslDistroHolderArgs('Alpine')).toEqual([
      '-d',
      'Alpine',
      '--exec',
      '/bin/sh',
      '-c',
      'while :; do sleep 3600; done',
      WSL_DISTRO_HOLDER_MARKER
    ])
  })

  it('matches only our holder for the same distro', () => {
    expect(isWslDistroHolderCommandLine(HOLDER_COMMAND('Alpine'), 'alpine')).toBe(true)
    expect(isWslDistroHolderCommandLine(HOLDER_COMMAND('Alpine-2'), 'Alpine')).toBe(false)
    expect(isWslDistroHolderCommandLine('wsl.exe -d Alpine --exec sleep 9', 'Alpine')).toBe(false)
    expect(
      isWslDistroHolderCommandLine(`node x.js -d Alpine ${WSL_DISTRO_HOLDER_MARKER}`, 'Alpine')
    ).toBe(false)
  })
})

describe('createWslDistroHolder', () => {
  it('spawns a detached-style holder, records it, and waits for the distro to run', async () => {
    const holder = makeHolder()
    const result = await holder.ensureHeld('Alpine')
    expect(result.outcome).toBe('spawned')
    expect(host.children[0]?.unref).toHaveBeenCalled()
    const saved = JSON.parse(
      await readFile(join(wslDistroHolderDirectory(userDataPath), 'alpine.json'), 'utf8')
    )
    expect(saved).toMatchObject({ version: 1, distro: 'Alpine', pid: 4000, creationTimeMs: 5_000 })
    expect(await holder.holderState('Alpine')).toBe('live')
  })

  it('single-flights concurrent ensures for one distro', async () => {
    const holder = makeHolder()
    const [a, b] = await Promise.all([holder.ensureHeld('Alpine'), holder.ensureHeld('alpine')])
    expect(a).toBe(b)
    expect(host.spawned).toEqual(['Alpine'])
    expect((await holder.ensureHeld('Alpine')).outcome).toBe('adopted')
    expect(host.spawned).toHaveLength(1)
  })

  it('adopts a valid holder left by a previous run without spawning another', async () => {
    host.processes.set(77, { commandLine: HOLDER_COMMAND('Alpine'), startedAtMs: 5_000 })
    await writeRecord(record())
    const holder = makeHolder()
    expect(await holder.adoptHolders()).toEqual([{ distro: 'alpine', state: 'live' }])
    expect((await holder.ensureHeld('Alpine')).outcome).toBe('adopted')
    expect(host.spawned).toEqual([])
  })

  it('rejects a reused pid (creation time differs) and drops the record', async () => {
    host.processes.set(77, { commandLine: HOLDER_COMMAND('Alpine'), startedAtMs: 9_999 })
    await writeRecord(record())
    const holder = makeHolder()
    expect(await holder.adoptHolders()).toEqual([{ distro: 'alpine', state: 'exited' }])
    expect(await recordFiles()).toEqual([])
    expect(host.killed).toEqual([])
  })

  it('rejects a pid whose command line is not our holder for that distro', async () => {
    host.processes.set(77, { commandLine: HOLDER_COMMAND('Ubuntu'), startedAtMs: 5_000 })
    await writeRecord(record())
    expect(await makeHolder().adoptHolders()).toEqual([{ distro: 'alpine', state: 'exited' }])
    expect(await recordFiles()).toEqual([])
  })

  it('cleans up stale and corrupt records', async () => {
    await writeRecord(record({ distro: 'Gone', pid: 12 }))
    const directory = wslDistroHolderDirectory(userDataPath)
    await writeFile(join(directory, 'broken.json'), '{nope')
    const holder = makeHolder()
    const adopted = await holder.adoptHolders()
    expect(adopted.sort((a, b) => a.distro.localeCompare(b.distro))).toEqual([
      { distro: 'broken', state: 'exited' },
      { distro: 'gone', state: 'exited' }
    ])
    expect(await recordFiles()).toEqual([])
  })

  it('keeps the record and reports unverifiable when the process table fails', async () => {
    host.processes.set(77, { commandLine: HOLDER_COMMAND('Alpine'), startedAtMs: 5_000 })
    await writeRecord(record())
    host.tableFails = true
    const holder = makeHolder()
    expect(await holder.adoptHolders()).toEqual([{ distro: 'alpine', state: 'unverifiable' }])
    expect(await holder.holderState('Alpine')).toBe('unverifiable')
    expect((await holder.ensureHeld('Alpine')).outcome).toBe('unverifiable')
    expect(await holder.release('Alpine')).toBe('unverifiable')
    expect(host.spawned).toEqual([])
    expect(host.killed).toEqual([])
    expect(await recordFiles()).toEqual(['alpine.json'])
  })

  it('reports unverifiable when the command line is unreadable even with a matching pid', async () => {
    host.processes.set(77, { commandLine: null, startedAtMs: 5_000 })
    await writeRecord(record())
    expect(await makeHolder().holderState('Alpine')).toBe('unverifiable')
  })

  it('release kills a verified holder and removes its record', async () => {
    const holder = makeHolder()
    await holder.ensureHeld('Alpine')
    expect(await holder.release('Alpine')).toBe('exited')
    expect(host.killed).toEqual([4000])
    expect(await recordFiles()).toEqual([])
    expect(await holder.holderState('Alpine')).toBe('exited')
  })

  it('release never kills a pid that is no longer our holder', async () => {
    host.processes.set(77, { commandLine: 'C:\\Windows\\notepad.exe', startedAtMs: 5_000 })
    await writeRecord(record())
    expect(await makeHolder().release('Alpine')).toBe('exited')
    expect(host.killed).toEqual([])
  })

  it('fails and cleans up when the holder exits before its record is written', async () => {
    const holder = makeHolder({
      listRunningDistros: async () => [],
      spawnHolder: (distro) => {
        const child = host.spawn(distro)
        // Right after 'spawn', before the process-table lookup resolves (a bad distro name).
        queueMicrotask(() => {
          host.processes.delete(child.pid ?? 0)
          child.emit('exit', 1, null)
        })
        return child
      },
      bootTimeoutMs: 1_000_000
    })
    await expect(holder.ensureHeld('Missing')).rejects.toThrow(/exited before the distro started/)
    expect(await recordFiles()).toEqual([])
  })

  it('stops the holder when the distro never starts', async () => {
    let clock = 0
    const holder = makeHolder({
      listRunningDistros: async () => [],
      now: () => (clock += 1_000),
      bootTimeoutMs: 3_000
    })
    await expect(holder.ensureHeld('Alpine')).rejects.toThrow(/did not start/)
    expect(host.killed).toEqual([4000])
    expect(await recordFiles()).toEqual([])
  })

  it('release keeps polling through an unverifiable window until the exit is proven', async () => {
    const holder = makeHolder()
    await holder.ensureHeld('Alpine')
    // Mid-exit: the pid is still listed but its command line is already unreadable.
    let midExitReads = 2
    host.kill = (pid) => {
      host.killed.push(pid)
      host.processes.set(pid, { commandLine: null, startedAtMs: 5_000 })
    }
    const query = host.query
    host.query = async (pid) => {
      if (host.killed.includes(pid) && midExitReads-- <= 0) {
        host.processes.delete(pid)
      }
      return query(pid)
    }
    const released = createWslDistroHolder({
      userDataPath,
      queryProcess: (pid) => host.query(pid),
      killProcess: (pid) => host.kill(pid),
      sleep: async () => {}
    })
    expect(await released.release('Alpine')).toBe('exited')
    expect(midExitReads).toBeLessThan(0)
    expect(await recordFiles()).toEqual([])
    expect(await holder.holderState('Alpine')).toBe('exited')
  })

  it('release reports unverifiable and keeps the record when the exit is never proven', async () => {
    const holder = makeHolder()
    await holder.ensureHeld('Alpine')
    let clock = 0
    const released = makeHolder({
      killProcess: (pid) => {
        host.killed.push(pid)
        host.processes.set(pid, { commandLine: null, startedAtMs: 5_000 })
      },
      now: () => (clock += 1_000)
    })
    expect(await released.release('Alpine')).toBe('unverifiable')
    expect(host.killed).toEqual([4000])
    expect(await recordFiles()).toEqual(['alpine.json'])
  })

  it('serializes release behind an in-flight ensure', async () => {
    const holder = makeHolder()
    const ensure = holder.ensureHeld('Alpine')
    const release = holder.release('Alpine')
    await ensure
    expect(await release).toBe('exited')
    expect(host.killed).toEqual([4000])
  })
})
