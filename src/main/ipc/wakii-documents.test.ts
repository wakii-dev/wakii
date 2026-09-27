import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  MAX_WAKII_DOCUMENT_BYTES,
  decodeWakiiFile,
  isWakiiDocumentName,
  validateWakiiMindmapFile
} from './wakii-documents'

let scratchDir: string

const validWakiiJson = JSON.stringify({
  wakiiMindmap: 1,
  meta: {
    story: 'VU-14 — mindmap.wakii',
    generatedAt: '2026-09-27T13:00:00Z',
    generator: 'story-mindmap 1.0.0'
  },
  nodes: [{ id: 'epic', kind: 'epic', title: 'VU-14', state: 'in-progress' }],
  edges: []
})

async function writeWakiiFile(name: string, contents: string): Promise<string> {
  const filePath = join(scratchDir, name)
  await writeFile(filePath, contents, 'utf8')
  return filePath
}

beforeAll(async () => {
  scratchDir = join(tmpdir(), `wakii-documents-test-${process.pid}-${Date.now()}`)
  await mkdir(scratchDir, { recursive: true })
})

afterAll(async () => {
  await rm(scratchDir, { recursive: true, force: true })
})

describe('isWakiiDocumentName', () => {
  it('claims only the .wakii extension, case-insensitively', () => {
    expect(isWakiiDocumentName('story.wakii')).toBe(true)
    expect(isWakiiDocumentName('STORY.WAKII')).toBe(true)
    expect(isWakiiDocumentName('README.md')).toBe(false)
    expect(isWakiiDocumentName('plan.md.wakii')).toBe(true)
    expect(isWakiiDocumentName('wakii')).toBe(false)
  })
})

describe('validateWakiiMindmapFile', () => {
  it('accepts a minimal schema-v1 document', () => {
    const result = validateWakiiMindmapFile(JSON.parse(validWakiiJson))
    expect(result.ok).toBe(true)
  })

  it('rejects a missing or foreign magic/version marker', () => {
    expect(validateWakiiMindmapFile({}).ok).toBe(false)
    expect(validateWakiiMindmapFile({ wakiiMindmap: 2, meta: {}, nodes: [], edges: [] }).ok).toBe(
      false
    )
  })

  it('rejects missing required meta fields', () => {
    const base = JSON.parse(validWakiiJson) as Record<string, unknown>
    for (const field of ['story', 'generatedAt', 'generator']) {
      const meta = { ...base.meta }
      delete meta[field]
      expect(validateWakiiMindmapFile({ ...base, meta }).ok).toBe(false)
    }
  })

  it('rejects documents without an epic node', () => {
    const base = JSON.parse(validWakiiJson) as Record<string, unknown>
    expect(
      validateWakiiMindmapFile({
        ...base,
        nodes: [{ id: 'sf-1', kind: 'sf', title: 'SF-1', state: 'pending' }]
      }).ok
    ).toBe(false)
  })

  it('rejects nodes without id, kind, or title', () => {
    const base = JSON.parse(validWakiiJson) as Record<string, unknown>
    for (const field of ['id', 'kind', 'title']) {
      const node = { id: 'epic', kind: 'epic', title: 'VU-14' }
      delete node[field as 'id' | 'kind' | 'title']
      expect(validateWakiiMindmapFile({ ...base, nodes: [node] }).ok).toBe(false)
    }
  })

  it('rejects edges without from, to, or rel', () => {
    const base = JSON.parse(validWakiiJson) as Record<string, unknown>
    for (const field of ['from', 'to', 'rel']) {
      const edge = { from: 'epic', to: 'sf-1', rel: 'contains' }
      delete edge[field as 'from' | 'to' | 'rel']
      expect(validateWakiiMindmapFile({ ...base, edges: [edge] }).ok).toBe(false)
    }
  })
})

describe('decodeWakiiFile', () => {
  it('decodes a valid document into a mindmap payload', async () => {
    const filePath = await writeWakiiFile('valid.wakii', validWakiiJson)
    const payload = await decodeWakiiFile(filePath)
    expect(payload).toEqual({
      path: filePath,
      mindmap: expect.objectContaining({ wakiiMindmap: 1 })
    })
  })

  it('reports a missing file as an io error, not a throw', async () => {
    const payload = await decodeWakiiFile(join(scratchDir, 'gone.wakii'))
    expect(payload).toMatchObject({ path: join(scratchDir, 'gone.wakii'), error: { code: 'io' } })
  })

  it('reports an unreadable file as an io error', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      // Root reads through permission bits; the io shape is already covered above.
      return
    }
    const filePath = await writeWakiiFile('locked.wakii', validWakiiJson)
    await chmod(filePath, 0o000)
    try {
      const payload = await decodeWakiiFile(filePath)
      expect(payload).toMatchObject({ error: { code: 'io' } })
    } finally {
      await chmod(filePath, 0o644)
    }
  })

  it('reports a 6MB file as too-large without parsing it', async () => {
    const filePath = await writeWakiiFile('huge.wakii', 'x'.repeat(6 * 1024 * 1024))
    const payload = await decodeWakiiFile(filePath)
    expect(payload).toMatchObject({ error: { code: 'too-large' } })
    expect(MAX_WAKII_DOCUMENT_BYTES).toBeLessThan(6 * 1024 * 1024)
  })

  it('reports broken JSON as a schema error', async () => {
    const filePath = await writeWakiiFile('broken.wakii', '{"wakiiMindmap": 1,,,}')
    const payload = await decodeWakiiFile(filePath)
    expect(payload).toMatchObject({ error: { code: 'schema' } })
  })

  it('reports a valid-JSON document failing the required table as a schema error', async () => {
    const filePath = await writeWakiiFile('badmeta.wakii', JSON.stringify({ nope: true }))
    const payload = await decodeWakiiFile(filePath)
    expect(payload).toMatchObject({ error: { code: 'schema' } })
  })
})
