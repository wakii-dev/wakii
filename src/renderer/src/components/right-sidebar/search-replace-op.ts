// One replace/undo operation worth of files — the undo closure lives in the
// search-panel store slice (NOT fileExplorerUndoRedo, which owns explorer
// tree ops) so it survives closing and reopening the search panel.
export type SearchReplaceFileRecord = {
  filePath: string
  relativePath: string
  oldContent: string
  newContent: string
}

export type SearchReplaceOp = {
  kind: 'replace-all'
  at: number
  files: SearchReplaceFileRecord[]
}
