import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'

function stringFlag(flags: Map<string, string | boolean>, name: string): string | undefined {
  const value = flags.get(name)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const NOTIFICATION_HANDLERS: Record<string, CommandHandler> = {
  'notifications show': async ({ client, flags, json }) => {
    const title = stringFlag(flags, 'title')
    if (!title) {
      throw new RuntimeClientError('invalid_argument', 'Missing required --title.')
    }
    const body = stringFlag(flags, 'body')
    const response = await client.call<{ delivered: boolean }>(
      'notifications.show',
      body ? { title, body } : { title }
    )
    if (json) {
      console.log(JSON.stringify(response.result, null, 2))
      return
    }
    console.log(
      response.result?.delivered
        ? '✓ Notification shown'
        : '• Notification relayed (desktop away or suppressed)'
    )
  }
}
