import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { WakiiMindmap } from '../../shared/wakii-mindmap-types'
import {
  MAX_PENDING_OS_OPENED_WAKII_FILES,
  OsOpenedWakiiFileState,
  filterUnchangedWakiiFiles,
  recordDeliveredWakiiFiles,
  resolveOpenedWakiiFiles,
  wakiiPathsFromArguments,
  type ResolvedWakiiFileOpen
} from './os-opened-wakii-files'

const validWakiiJson = JSON.stringify({
  wakiiMindmap: 1,
  meta: { story: 's', generatedAt: '2026-09-27T13:00:00Z', generator: 'g' },
  nodes: [{ id: 'epic', kind: 'epic', title: 'E' }],
  edges: []
})

function wakiiOpen(path: string, contentHash: string | null): ResolvedWakiiFileOpen {
  return { payload: { path, mindmap: validWakiiMindmap() }, contentHash }
}

function validWakiiMindmap(): WakiiMindmap {
  return {
    wakiiMindmap: 1,
    meta: { story: 's', generatedAt: '2026-09-27T13:00:00Z', generator: 'g' },
    nodes: [{ id: 'epic', kind: 'epic', title: 'E' }],
    edges: []
  }
}

function wakiiError(path: string): ResolvedWakiiFileOpen {
  return { payload: { path, error: { code: 'io', message: 'x' } }, contentHash: null }
}

let scratchDir: string

beforeAll(async () => {
  scratchDir = join(tmpdir(), `os-opened-wakii-test-${process.pid}-${Date.now()}`)
  await mkdir(scratchDir, { recursive: true })
})

afterAll(async () => {
  await rm(scratchDir, { recursive: true, force: true })
})

describe('wakiiPathsFromArguments', () => {
  it('keeps only absolute .wakii paths and dedupes them', () => {
    expect(
      wakiiPathsFromArguments([
        '--flag',
        'relative.wakii',
        join(scratchDir, 'a.wakii'),
        join(scratchDir, 'a.wakii'),
        join(scratchDir, 'notes.md')
      ])
    ).toEqual([join(scratchDir, 'a.wakii')])
  })

  it('decodes a file:// URI defensively like the markdown argv path', () => {
    expect(wakiiPathsFromArguments([`file://${join(scratchDir, 'a.wakii')}`])).toEqual([
      join(scratchDir, 'a.wakii')
    ])
  })

  it('lowercases the dedupe key on win32 so one path cannot open twice', () => {
    expect(wakiiPathsFromArguments(['C:\\Maps\\A.wakii', 'C:\\maps\\a.wakii'], 'win32')).toEqual([
      'C:\\Maps\\A.wakii'
    ])
  })
})

describe('OsOpenedWakiiFileState', () => {
  it('captures, consumes once, and restores an undelivered batch at the front', () => {
    const state = new OsOpenedWakiiFileState()
    expect(state.capture([join(scratchDir, 'a.wakii')])).toBe(true)
    expect(state.consume()).toEqual([join(scratchDir, 'a.wakii')])
    // Acceptance: a second consume sees an empty queue.
    expect(state.consume()).toEqual([])

    state.restore([join(scratchDir, 'b.wakii')])
    state.capture([join(scratchDir, 'c.wakii')])
    expect(state.consume()).toEqual([join(scratchDir, 'b.wakii'), join(scratchDir, 'c.wakii')])
  })

  it('never queues the same path twice, including across captures', () => {
    const state = new OsOpenedWakiiFileState()
    const coldStartArgv = [join(scratchDir, 'a.wakii')]
    state.capture(coldStartArgv)
    // The macOS open-file event can repeat the same path the argv already carried.
    state.captureFilePaths([join(scratchDir, 'a.wakii')])
    expect(state.consume()).toEqual([join(scratchDir, 'a.wakii')])
  })

  it('caps the queue and drops the tail of an oversized selection with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const state = new OsOpenedWakiiFileState()
    const overflow = Array.from(
      { length: MAX_PENDING_OS_OPENED_WAKII_FILES + 2 },
      (_, index) => `/maps/${index}.wakii`
    )
    state.capture(overflow)
    const consumed = state.consume()
    expect(consumed).toHaveLength(MAX_PENDING_OS_OPENED_WAKII_FILES)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('holds the batch until publish proves the queue is deliverable', () => {
    const state = new OsOpenedWakiiFileState()
    const publish = vi.fn()
    state.capture([join(scratchDir, 'a.wakii')], publish)
    expect(publish).toHaveBeenCalledOnce()
  })
})

describe('resolveOpenedWakiiFiles', () => {
  it('resolves a mixed batch into per-file payloads without throwing', async () => {
    const validPath = join(scratchDir, 'valid.wakii')
    await writeFile(validPath, validWakiiJson, 'utf8')
    const brokenPath = join(scratchDir, 'broken.wakii')
    await writeFile(brokenPath, '{nope', 'utf8')

    const resolved = await resolveOpenedWakiiFiles([
      validPath,
      brokenPath,
      join(scratchDir, 'gone.wakii')
    ])

    expect(resolved).toHaveLength(3)
    expect(resolved[0]).toMatchObject({
      payload: { path: validPath },
      contentHash: createHash('sha256').update(validWakiiJson).digest('hex')
    })
    // Readable but invalid: hashed, yet dedupe must not swallow the error on a retry.
    expect(resolved[1]).toMatchObject({
      payload: { error: { code: 'schema' } },
      contentHash: createHash('sha256').update('{nope').digest('hex')
    })
    expect(resolved[2]).toMatchObject({ payload: { error: { code: 'io' } }, contentHash: null })
  })

  it('rejects an oversized file via stat BEFORE reading it into memory', async () => {
    const hugePath = join(scratchDir, 'huge.wakii')
    await writeFile(hugePath, 'x'.repeat(6 * 1024 * 1024), 'utf8')

    const resolved = await resolveOpenedWakiiFiles([hugePath])

    // contentHash stays null: nothing was read, so the size guard fired pre-read.
    expect(resolved[0]).toMatchObject({
      payload: { path: hugePath, error: { code: 'too-large' } },
      contentHash: null
    })
  })

  it('reports an unreadable file as an io error', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      // Root reads through permission bits; the io shape is covered by the missing-file case.
      return
    }
    const lockedPath = join(scratchDir, 'locked.wakii')
    await writeFile(lockedPath, validWakiiJson, 'utf8')
    await chmod(lockedPath, 0o000)
    try {
      const resolved = await resolveOpenedWakiiFiles([lockedPath])
      expect(resolved[0]).toMatchObject({ payload: { error: { code: 'io' } }, contentHash: null })
    } finally {
      await chmod(lockedPath, 0o644)
    }
  })

  it('resolves an empty batch to nothing', async () => {
    await expect(resolveOpenedWakiiFiles([])).resolves.toEqual([])
  })
})

describe('hash dedupe (refresh owner = main)', () => {
  it('drops a repeat of the same path and content, keeps changed content and errors', () => {
    const deliveredHashes = new Map<string, string>()
    const first = wakiiOpen('/maps/a.wakii', 'hash-1')
    recordDeliveredWakiiFiles([first], deliveredHashes)

    expect(filterUnchangedWakiiFiles([first], deliveredHashes)).toEqual([])
    const changed = wakiiOpen('/maps/a.wakii', 'hash-2')
    const failed = wakiiError('/maps/a.wakii')
    // A changed file is a refresh; a failed read must surface again on retry.
    expect(filterUnchangedWakiiFiles([changed, failed], deliveredHashes)).toEqual([changed, failed])

    recordDeliveredWakiiFiles([changed, failed], deliveredHashes)
    expect(deliveredHashes.get('/maps/a.wakii')).toBe('hash-2')
    expect(filterUnchangedWakiiFiles([failed], deliveredHashes)).toEqual([failed])
  })

  it('never dedupes a readable-but-invalid file by its hash', () => {
    const deliveredHashes = new Map<string, string>()
    const invalid = {
      payload: { path: '/maps/a.wakii', error: { code: 'schema' as const, message: 'x' } },
      contentHash: 'hash-broken'
    }
    recordDeliveredWakiiFiles([invalid], deliveredHashes)
    expect(deliveredHashes.size).toBe(0)
    expect(filterUnchangedWakiiFiles([invalid], deliveredHashes)).toEqual([invalid])
  })

  it('dedupes win32 paths case-insensitively like the capture queue', () => {
    const deliveredHashes = new Map<string, string>()
    recordDeliveredWakiiFiles([wakiiOpen('C:\\Maps\\A.wakii', 'hash-1')], deliveredHashes, 'win32')
    // Same file spelled with different casing must not re-deliver...
    expect(
      filterUnchangedWakiiFiles(
        [wakiiOpen('C:\\maps\\a.wakii', 'hash-1')],
        deliveredHashes,
        'win32'
      )
    ).toEqual([])
    // ...but changed content still does.
    expect(
      filterUnchangedWakiiFiles(
        [wakiiOpen('C:\\Maps\\A.wakii', 'hash-2')],
        deliveredHashes,
        'win32'
      )
    ).toHaveLength(1)
  })

  it('treats differing path casing as distinct on case-sensitive platforms', () => {
    const deliveredHashes = new Map<string, string>()
    recordDeliveredWakiiFiles([wakiiOpen('/Maps/A.wakii', 'hash-1')], deliveredHashes, 'darwin')
    expect(
      filterUnchangedWakiiFiles([wakiiOpen('/maps/a.wakii', 'hash-1')], deliveredHashes, 'darwin')
    ).toHaveLength(1)
  })

  it('passes everything through while the delivered map is empty', () => {
    const first = wakiiOpen('/maps/a.wakii', 'hash-1')
    expect(filterUnchangedWakiiFiles([first], new Map())).toEqual([first])
  })
})
