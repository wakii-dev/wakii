import { TerminalDaemonRestartSeveredParams } from '../../../../shared/rpc-contract/terminal-daemon-params'
import {
  readSeveredDaemonStatus,
  restartSeveredDaemon
} from '../../../daemon/daemon-host-image-state'
import { defineMethod } from '../core'

export const TERMINAL_DAEMON_METHODS = [
  defineMethod({
    name: 'terminalDaemon.severedStatus',
    permission: 'workspace',
    params: null,
    handler: async () => ({ severed: await readSeveredDaemonStatus() })
  }),
  defineMethod({
    name: 'terminalDaemon.restartSevered',
    permission: 'host-admin',
    params: TerminalDaemonRestartSeveredParams,
    handler: async (params) => restartSeveredDaemon(params)
  })
]
