import { describe, expect, it } from 'vitest'
import { buildPluginWorkerEnv } from './plugin-worker-env'

describe('buildPluginWorkerEnv', () => {
  it('matches allowlisted keys case-sensitively on POSIX', () => {
    expect(
      buildPluginWorkerEnv(
        { PATH: '/safe', path: '/wrong', HOME: '/home', NODE_OPTIONS: '--inspect' },
        'linux'
      )
    ).toEqual({
      PATH: '/safe',
      HOME: '/home',
      ELECTRON_RUN_AS_NODE: '1',
      ORCA_BIN: '/usr/local/bin/orca'
    })
  })

  it('matches Windows environment keys case-insensitively', () => {
    expect(buildPluginWorkerEnv({ Path: 'C:\\safe', systemroot: 'C:\\Windows' }, 'win32')).toEqual({
      PATH: 'C:\\safe',
      SystemRoot: 'C:\\Windows',
      ELECTRON_RUN_AS_NODE: '1',
      ORCA_BIN: '/usr/local/bin/orca'
    })
  })
})

describe('ORCA_BIN injection', () => {
  it('pins ORCA_BIN to the first existing app CLI', () => {
    const env = buildPluginWorkerEnv({ PATH: '/usr/bin' })
    expect(env.ORCA_BIN).toBe('/usr/local/bin/orca')
  })

  it('respects a caller-provided ORCA_BIN', () => {
    const env = buildPluginWorkerEnv({ PATH: '/usr/bin', ORCA_BIN: '/custom/orca' })
    expect(env.ORCA_BIN).toBe('/custom/orca')
  })
})
