/**
 * Wire contract for `.wakii` files the OS handed to the app, pushed main → renderer as
 * `ui:openWakiiFile` / pulled via `ui:consumePendingWakiiFileOpens`. The envelope lives
 * here once; the schema types it references come from wakii-mindmap-types.
 *
 * Main owns the file read (cap 5MB, plain JSON.parse) and the required-field validation
 * from the schema v1 table; the renderer never touches fs. Enum values and graph
 * references are not re-checked here — the viewer degrades them (kind filter, edge
 * visibility) instead of rendering a broken graph (spec §8: no partial render).
 */
import type { WakiiMindmap } from './wakii-mindmap-types'

export type WakiiFileOpenErrorCode = 'io' | 'schema' | 'too-large'

export type WakiiFileOpenError = {
  code: WakiiFileOpenErrorCode
  message: string
}

export type WakiiFileOpenPayload =
  | { path: string; mindmap: WakiiMindmap }
  | { path: string; error: WakiiFileOpenError }
