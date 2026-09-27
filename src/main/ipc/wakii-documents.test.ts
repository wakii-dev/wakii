import { describe, expect, it } from 'vitest'
import {
  MAX_WAKII_DOCUMENT_BYTES,
  decodeWakiiContents,
  isWakiiDocumentName,
  validateWakiiMindmapFile
} from './wakii-documents'

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
    for (const field of ['story', 'generatedAt', 'generator']) {
      const meta: Record<string, unknown> = {
        story: 's',
        generatedAt: '2026-09-27T13:00:00Z',
        generator: 'g'
      }
      delete meta[field]
      expect(
        validateWakiiMindmapFile({
          wakiiMindmap: 1,
          meta,
          nodes: [{ id: 'epic', kind: 'epic', title: 'E' }],
          edges: []
        }).ok
      ).toBe(false)
    }
  })

  it('rejects documents without an epic node', () => {
    expect(
      validateWakiiMindmapFile({
        wakiiMindmap: 1,
        meta: { story: 's', generatedAt: 'x', generator: 'g' },
        nodes: [{ id: 'sf-1', kind: 'sf', title: 'SF-1', state: 'pending' }],
        edges: []
      }).ok
    ).toBe(false)
  })

  it('rejects nodes without id, kind, or title', () => {
    for (const field of ['id', 'kind', 'title']) {
      const node: Record<string, unknown> = { id: 'epic', kind: 'epic', title: 'VU-14' }
      delete node[field]
      expect(
        validateWakiiMindmapFile({
          wakiiMindmap: 1,
          meta: { story: 's', generatedAt: 'x', generator: 'g' },
          nodes: [node],
          edges: []
        }).ok
      ).toBe(false)
    }
  })

  it('rejects edges without from, to, or rel', () => {
    for (const field of ['from', 'to', 'rel']) {
      const edge: Record<string, unknown> = { from: 'epic', to: 'sf-1', rel: 'contains' }
      delete edge[field]
      expect(
        validateWakiiMindmapFile({
          wakiiMindmap: 1,
          meta: { story: 's', generatedAt: 'x', generator: 'g' },
          nodes: [{ id: 'epic', kind: 'epic', title: 'E' }],
          edges: [edge]
        }).ok
      ).toBe(false)
    }
  })
})

describe('decodeWakiiContents', () => {
  it('decodes a valid document into a mindmap payload', () => {
    const payload = decodeWakiiContents('/maps/valid.wakii', validWakiiJson)
    expect(payload).toEqual({
      path: '/maps/valid.wakii',
      mindmap: expect.objectContaining({ wakiiMindmap: 1 })
    })
  })

  // Why in-memory: this byteLength re-check is the production guard against growth between
  // the caller's stat and read; a regression here must turn red without any fs.
  it('rejects contents past the 5MB cap as too-large without parsing', () => {
    const payload = decodeWakiiContents('/maps/huge.wakii', 'x'.repeat(6 * 1024 * 1024))
    expect(payload).toMatchObject({ error: { code: 'too-large' } })
    expect(MAX_WAKII_DOCUMENT_BYTES).toBeLessThan(6 * 1024 * 1024)
  })

  it('reports broken JSON as a schema error', () => {
    const payload = decodeWakiiContents('/maps/broken.wakii', '{"wakiiMindmap": 1,,,}')
    expect(payload).toMatchObject({ error: { code: 'schema' } })
  })

  it('reports a valid-JSON document failing the required table as a schema error', () => {
    const payload = decodeWakiiContents('/maps/badmeta.wakii', JSON.stringify({ nope: true }))
    expect(payload).toMatchObject({ error: { code: 'schema' } })
  })
})
