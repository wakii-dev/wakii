import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { WakiiFileOpenPayload } from '../../../../shared/wakii-file-open-payload'

const INVALID_MINDMAP_TOAST_KEY =
  'auto.components.right.sidebar.file.explorer.wakii.open.5f05f7de28'
const UNREADABLE_MINDMAP_TOAST_KEY =
  'auto.components.right.sidebar.file.explorer.wakii.open.1661f00e0e'

/** Mirrors main's isWakiiDocumentName; dot > 0 so a bare ".wakii" dotfile has no extension. */
export function isWakiiDocumentFileName(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot > 0 && name.slice(dot).toLowerCase() === '.wakii'
}

/** Read+viewer deps an explorer surface needs to route .wakii rows; null degrades to text. */
export type WakiiExplorerViewerRoute = {
  readDocument: (filePath: string) => Promise<WakiiFileOpenPayload>
  openViewer: (payload: WakiiFileOpenPayload) => void
}

/**
 * Opens an explorer-activated .wakii file in the mindmap viewer. Returns false when the
 * caller must fall back to the plain text editor (decode error, read failure).
 */
export async function activateWakiiExplorerFile(args: {
  filePath: string
  viewer: WakiiExplorerViewerRoute
}): Promise<boolean> {
  let payload: WakiiFileOpenPayload
  try {
    payload = await args.viewer.readDocument(args.filePath)
  } catch (error) {
    console.error('Failed to read the .wakii file:', error)
    toast.error(
      translate(
        UNREADABLE_MINDMAP_TOAST_KEY,
        'Could not read the mindmap file — opening it as text.'
      )
    )
    return false
  }
  if ('error' in payload) {
    toast.error(
      translate(
        INVALID_MINDMAP_TOAST_KEY,
        'This file is not a valid mindmap — opening it as text.'
      )
    )
    return false
  }
  args.viewer.openViewer(payload)
  return true
}
