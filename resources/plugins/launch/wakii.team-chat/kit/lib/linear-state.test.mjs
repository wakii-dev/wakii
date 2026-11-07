import { describe, expect, it } from 'vitest'
import { clearLinearStateCache, linearState } from './linear-state.mjs'

// Mock spawnSync: mỗi lệnh gọi ghi vào .calls rồi chạy `script`
function mockSpawn(script) {
  const calls = []
  const fn = (cmd, args) => {
    calls.push({ cmd, args })
    return script(calls.length, cmd, args)
  }
  fn.calls = calls
  return fn
}

const LINEAR_PAYLOAD = JSON.stringify({
  ok: true,
  result: {
    issue: {
      identifier: 'HOI-18',
      title: 'Captain Activity Log — knowledge base',
      url: 'https://linear.app/hoivu123/issue/HOI-18',
      state: { name: 'Backlog', type: 'backlog' },
      updatedAt: '2026-11-07T10:00:00.000Z',
    },
  },
})

function happySpawn() {
  return mockSpawn((n, cmd, args) => {
    if (args[0] === 'check') return { status: 0 }
    return { status: 0, stdout: LINEAR_PAYLOAD }
  })
}

describe('linearState', () => {
  it('success — ánh xạ đúng issue từ stdout JSON', () => {
    clearLinearStateCache()
    const spawn = happySpawn()
    const state = linearState('HOI-18', { spawnSync: spawn })
    expect(state).toEqual({
      identifier: 'HOI-18',
      title: 'Captain Activity Log — knowledge base',
      state: 'Backlog',
      url: 'https://linear.app/hoivu123/issue/HOI-18',
      updatedAt: '2026-11-07T10:00:00.000Z',
    })
    // Đi qua linear-rate-limit: check trước, rồi run bọc lệnh orca
    expect(spawn.calls[0].args[0]).toBe('check')
    const run = spawn.calls[1]
    expect(run.args.slice(0, 6)).toEqual(['run', '--bin', 'linear-state', '--', 'orca', 'linear'])
    expect(run.args).toContain('HOI-18')
  })

  it('cache 60s — gọi liên tiếp không spawn lại; quá TTL gọi lại', () => {
    clearLinearStateCache()
    const spawn = happySpawn()
    let clock = 1_000
    linearState('HOI-18', { spawnSync: spawn, now: () => clock })
    linearState('HOI-18', { spawnSync: spawn, now: () => clock })
    expect(spawn.calls.length).toBe(2) // check + run, chỉ 1 lần
    clock += 60_001
    linearState('HOI-18', { spawnSync: spawn, now: () => clock })
    expect(spawn.calls.length).toBe(4) // hết TTL → spawn lại
  })

  it('fail-open — rate-limit (check=3 / run exit 3) trả unavailable, không crash', () => {
    clearLinearStateCache()
    // check exit 3 → không gọi Linear
    const gated = mockSpawn(() => ({ status: 3 }))
    expect(linearState('HOI-18', { spawnSync: gated })).toMatchObject({ state: 'unavailable' })
    expect(gated.calls.length).toBe(1)
    // run exit 3
    const runLimited = mockSpawn((n, cmd, args) => (args[0] === 'check' ? { status: 0 } : { status: 3 }))
    expect(linearState('HOI-18', { spawnSync: runLimited })).toMatchObject({ state: 'unavailable', reason: 'rate-limited' })
  })

  it('fail-open — exit lỗi / JSON hỏng / spawn throw trả unavailable', () => {
    clearLinearStateCache() // cache là module-level — clear trước mỗi case tránh ăn giá trị case trước
    const badExit = mockSpawn((n, cmd, args) => (args[0] === 'check' ? { status: 0 } : { status: 1, stderr: 'boom' }))
    expect(linearState('HOI-18', { spawnSync: badExit })).toMatchObject({ state: 'unavailable', reason: 'exit-1' })
    const badJson = mockSpawn((n, cmd, args) => (args[0] === 'check' ? { status: 0 } : { status: 0, stdout: 'không phải json' }))
    expect(linearState('HOI-18', { spawnSync: badJson })).toMatchObject({ state: 'unavailable', reason: 'bad-json' })
    const throwing = mockSpawn(() => {
      throw new Error('ENOENT')
    })
    expect(linearState('HOI-18', { spawnSync: throwing })).toMatchObject({ state: 'unavailable' })
    clearLinearStateCache()
    expect(linearState('', { spawnSync: happySpawn() })).toMatchObject({ state: 'unavailable' })
  })
})
