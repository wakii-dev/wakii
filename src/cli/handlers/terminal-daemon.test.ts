import { describe, expect, it } from 'vitest'
import { formatSeveredDaemonStatus } from './terminal-daemon'

describe('terminal-daemon status', () => {
  it('says OK when nothing is severed', () => {
    expect(formatSeveredDaemonStatus({ severed: null })).toBe('Terminal daemon: OK.')
  })

  it('says a restart ends running processes and only resumable agents come back', () => {
    const text = formatSeveredDaemonStatus({
      severed: { pid: 4288, linuxStartTicks: '777', bootId: 'b', liveSessionCount: 3 }
    })
    expect(text).toContain('PID 4288')
    expect(text).toContain('3 running terminals')
    expect(text).toContain('ENDS')
    expect(text).toContain('Agents that support resume can be resumed')
    expect(text).toContain('shells and other jobs cannot')
  })
})
