import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

type SeveredDaemonStatus = {
  pid: number
  linuxStartTicks: string
  bootId: string
  liveSessionCount: number | null
}

type SeveredStatusResult = { severed: SeveredDaemonStatus | null }

type RestartResult =
  | { status: 'restarted'; killedCount: number }
  | { status: 'refused'; reason: 'not-severed' | 'replaced' | 'unverifiable' }

const REFUSAL_MESSAGES: Record<Extract<RestartResult, { status: 'refused' }>['reason'], string> = {
  'not-severed': 'The terminal daemon has its program files; nothing to restart.',
  replaced: 'The terminal daemon was already replaced; nothing was stopped.',
  unverifiable: 'The host could not verify the daemon process, so nothing was stopped.'
}

function describeSessions(count: number | null): string {
  return count === null
    ? 'an unknown number of running terminals'
    : `${count} running terminal${count === 1 ? '' : 's'}`
}

export function formatSeveredDaemonStatus(result: SeveredStatusResult): string {
  const severed = result.severed
  if (!severed) {
    return 'Terminal daemon: OK.'
  }
  return [
    `Terminal daemon PID ${severed.pid} is running without its program files (the AppImage it started from is gone).`,
    `It still hosts ${describeSessions(severed.liveSessionCount)}. New terminals are not kept across restarts until it is restarted.`,
    'Restarting ENDS those processes. Agents that support resume can be resumed afterwards; shells and other jobs cannot.',
    'Run `orca terminal-daemon restart --yes` when your agents are idle.'
  ].join('\n')
}

export const TERMINAL_DAEMON_HANDLERS: Record<string, CommandHandler> = {
  'terminal-daemon status': async ({ client, json }) => {
    const result = await client.call<SeveredStatusResult>('terminalDaemon.severedStatus')
    printResult(result, json, formatSeveredDaemonStatus)
  },
  'terminal-daemon restart': async ({ client, json, flags }) => {
    const status = await client.call<SeveredStatusResult>('terminalDaemon.severedStatus')
    const severed = status.result.severed
    if (!severed) {
      printResult(status, json, () => REFUSAL_MESSAGES['not-severed'])
      return
    }
    if (flags.get('yes') !== true) {
      throw new RuntimeClientError(
        'confirmation_required',
        `Restarting the terminal daemon ends ${describeSessions(severed.liveSessionCount)}. Re-run with --yes to confirm.`
      )
    }
    const result = await client.call<RestartResult>('terminalDaemon.restartSevered', {
      pid: severed.pid,
      linuxStartTicks: severed.linuxStartTicks,
      bootId: severed.bootId
    })
    printResult(result, json, (value) =>
      value.status === 'restarted'
        ? `Restarted the terminal daemon; ended ${describeSessions(value.killedCount)}.`
        : REFUSAL_MESSAGES[value.reason]
    )
  }
}
