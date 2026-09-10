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
    expect(
      buildPluginWorkerEnv(
        { Path: 'C:\\safe', systemroot: 'C:\\Windows', AppData: 'C:\\Users\\u\\AppData\\Roaming' },
        'win32'
      )
    ).toEqual({
      PATH: 'C:\\safe',
      SystemRoot: 'C:\\Windows',
      APPDATA: 'C:\\Users\\u\\AppData\\Roaming',
      ELECTRON_RUN_AS_NODE: '1',
      ORCA_BIN: '/usr/local/bin/orca'
    })
  })

  it('passes APPDATA through so plugin-spawned orca CLI can resolve its runtime', () => {
    const env = buildPluginWorkerEnv(
      {
        PATH: '/usr/bin',
        APPDATA: 'C:\\Users\\u\\AppData\\Roaming',
        LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local'
      },
      'win32'
    )
    expect(env.APPDATA).toBe('C:\\Users\\u\\AppData\\Roaming')
    expect(env.LOCALAPPDATA).toBe('C:\\Users\\u\\AppData\\Local')
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
