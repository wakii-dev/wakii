import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const NOTIFICATION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['notifications', 'show'],
    summary: 'Show a desktop notification through the running Orca app',
    usage: 'orca notifications show --title <text> [--body <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'title', 'body'],
    notes: [
      'Routes through the same notification pipeline plugin banners use, so the banner is attributed to Orca (not osascript/Script Editor) and mobile clients subscribed to the notification stream also receive it.',
      'Delivered=false means the desktop toast was suppressed (app focused with suppress-when-focused enabled, or headless host); the event still reaches the notification stream.'
    ],
    examples: [
      'orca notifications show --title "SF-4 done" --body "merged vào wakii-dev"',
      'orca notifications show --title "Gate FAIL" --json'
    ]
  }
]
