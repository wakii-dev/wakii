import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readRoomInfo } from './room-info.mjs'

// Sample đúng FORMAT KỲ VỌNG ghi ở header room-info.mjs
const SAMPLE = JSON.stringify({
  room: 'orca-test',
  updatedAt: '2026-11-07T10:00:00.000Z',
  linearIssue: {
    identifier: 'HOI-18',
    title: 'Captain Activity Log — knowledge base',
    state: 'Backlog',
    url: 'https://linear.app/hoivu123/issue/HOI-18',
    updatedAt: '2026-11-07T09:00:00.000Z',
  },
  mindmap: { path: 'docs/mindmap.wakii', progress: { done: 2, total: 6 } },
  tcGate: { status: 'green', baseline: '721bb9e1d3b', checkedAt: '2026-11-07T10:30:00.000Z' },
  screenshot: { id: 'a1b2c3', path: '~/.claude/chat/media/a1b2c3.jpg', capturedAt: '2026-11-07T10:31:00.000Z' },
})

function withRoom(name, content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'room-info-'))
  if (content !== null) writeFileSync(join(dir, `${name}.json`), content, 'utf8')
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('readRoomInfo', () => {
  it('json hợp lệ — trả nguyên object đã parse', () => {
    const info = withRoom('orca-test', SAMPLE, (dir) => readRoomInfo('orca-test', { dir }))
    expect(info).toEqual(JSON.parse(SAMPLE))
    expect(info.linearIssue.identifier).toBe('HOI-18')
    expect(info.tcGate.status).toBe('green')
  })

  it('file thiếu → null, không throw', () => {
    const info = withRoom('orca-test', null, (dir) => readRoomInfo('orca-test', { dir }))
    expect(info).toBeNull()
    expect(readRoomInfo('', { dir: tmpdir() })).toBeNull()
  })

  it('json hỏng / rỗng / không phải object → null, không throw', () => {
    expect(withRoom('orca-test', '{ không đóng ngoặc', (dir) => readRoomInfo('orca-test', { dir }))).toBeNull()
    expect(withRoom('orca-test', '', (dir) => readRoomInfo('orca-test', { dir }))).toBeNull()
    expect(withRoom('orca-test', '"chuỗi trần"', (dir) => readRoomInfo('orca-test', { dir }))).toBeNull()
    expect(withRoom('orca-test', '[1,2]', (dir) => readRoomInfo('orca-test', { dir }))).toBeNull()
  })
})
