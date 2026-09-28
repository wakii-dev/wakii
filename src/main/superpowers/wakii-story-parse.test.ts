import { describe, expect, it } from 'vitest'
import { parseWakiiStory, type WakiiStoryDoc } from './wakii-story-parse'

// Golden .wakii fixture (schema v1, spec 2026-09-27 §3) — mirrors what
// story-mindmap --generate/--bootstrap writes: sf node ids lowercase 'sf-N',
// depends-on edges carry the dependency, meta.dest is the target branch.
const GOLDEN = JSON.stringify({
  wakiiMindmap: 1,
  meta: {
    story: 'WI-9 — Golden story',
    epic: 'WI-9',
    dest: 'story/wi-9',
    generatedAt: '2026-09-28T00:00:00Z',
    generator: 'story-mindmap'
  },
  nodes: [
    { id: 'epic', kind: 'epic', title: 'WI-9 — Golden story' },
    {
      id: 'sf-1',
      kind: 'sf',
      title: 'First SF',
      tier: 1,
      summary: 'RPC foundation',
      linear: 'FI-901'
    },
    { id: 'sf-2', kind: 'sf', title: 'Second SF', tier: 2, summary: 'Client UI' },
    { id: 'task-1', kind: 'task', title: 'A task', parent: 'sf-1' }
  ],
  edges: [
    { from: 'epic', to: 'sf-1', rel: 'contains' },
    { from: 'epic', to: 'sf-2', rel: 'contains' },
    { from: 'sf-2', to: 'sf-1', rel: 'depends-on' },
    { from: 'task-1', to: 'sf-1', rel: 'writes' }
  ],
  decodeWarnings: ['node 7: unknown kind "widget" dropped']
})

function expectDoc(text: string): WakiiStoryDoc {
  const doc = parseWakiiStory(text)
  if (doc === 'parse-error') {
    throw new Error('expected a parsed story doc')
  }
  return doc
}

describe('parseWakiiStory', () => {
  it('projects golden .wakii into the story doc: title/epic/destination/sfs', () => {
    const doc = expectDoc(GOLDEN)
    expect(doc.title).toBe('WI-9 — Golden story')
    expect(doc.epicId).toBe('WI-9')
    expect(doc.destination).toBe('story/wi-9')
    expect(doc.sfs).toHaveLength(2)
  })

  it('normalizes sf node ids to SF-N names with tier/what/linear', () => {
    const doc = expectDoc(GOLDEN)
    expect(doc.sfs[0]).toEqual({
      name: 'SF-1',
      title: 'First SF',
      tier: 1,
      what: 'RPC foundation',
      dependsOn: [],
      linear: 'FI-901'
    })
    expect(doc.sfs[1]?.name).toBe('SF-2')
  })

  it('derives dependsOn from depends-on edges pointing at the sf node', () => {
    const doc = expectDoc(GOLDEN)
    expect(doc.sfs[0]?.dependsOn).toEqual([])
    expect(doc.sfs[1]?.dependsOn).toEqual(['SF-1'])
  })

  it('passes decodeWarnings through for the Story tab', () => {
    expect(expectDoc(GOLDEN).decodeWarnings).toEqual(['node 7: unknown kind "widget" dropped'])
  })

  it('treats broken JSON as parse-error', () => {
    expect(parseWakiiStory('{ vỡ')).toBe('parse-error')
  })

  it('treats a structurally invalid document (missing magic/epic) as parse-error', () => {
    expect(parseWakiiStory('{"wakiiMindmap": 2, "meta": {}, "nodes": [], "edges": []}')).toBe(
      'parse-error'
    )
    expect(
      parseWakiiStory(
        JSON.stringify({
          wakiiMindmap: 1,
          meta: { story: 'x', generatedAt: 't', generator: 'g' },
          nodes: [{ id: 'sf-1', kind: 'sf', title: 'lonely' }],
          edges: []
        })
      )
    ).toBe('parse-error')
  })

  it('keeps a valid doc with zero sf nodes (caller flags parseError)', () => {
    const doc = expectDoc(
      JSON.stringify({
        wakiiMindmap: 1,
        meta: { story: 'Empty', epic: 'WI-0', generatedAt: 't', generator: 'g' },
        nodes: [{ id: 'epic', kind: 'epic', title: 'Empty' }],
        edges: []
      })
    )
    expect(doc.sfs).toEqual([])
  })

  it('defaults destination to null when meta.dest is absent', () => {
    const doc = expectDoc(
      JSON.stringify({
        wakiiMindmap: 1,
        meta: { story: 'No dest', epic: 'WI-1', generatedAt: 't', generator: 'g' },
        nodes: [
          { id: 'epic', kind: 'epic', title: 'No dest' },
          { id: 'sf-1', kind: 'sf', title: 'S' }
        ],
        edges: [{ from: 'epic', to: 'sf-1', rel: 'contains' }]
      })
    )
    expect(doc.destination).toBeNull()
  })
})
