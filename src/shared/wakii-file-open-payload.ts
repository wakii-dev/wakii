/**
 * Wire contract for `.wakii` files the OS handed to the app, pushed main → renderer as
 * `ui:openWakiiFile` / pulled via `ui:consumePendingWakiiFileOpens`.
 *
 * Main owns the file read (cap 5MB, plain JSON.parse) and the required-field validation from
 * the schema v1 table; the renderer never touches fs. The deep decoder (enums, graph
 * structure, decodeWarnings) belongs to the viewer slice and narrows `mindmap` further.
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
