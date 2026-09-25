// Mod+Shift+O is Monaco's built-in `editor.action.quickOutline` (VS Code parity):
// the standalone editor registers it with precondition `hasDocumentSymbolProvider`,
// so shortcut eaters only need to know WHICH editor owns the chord to yield it.
export const QUICK_OUTLINE_EDITOR_ATTRIBUTE = 'data-quick-outline-editor'

// Probe (FI-33 task 1): Monaco 0.55 ships DocumentSymbolProviders for tsMode
// (ts/js), jsonMode, cssMode (css/scss/less), htmlMode. Everything else —
// markdown/mermaid/csv/notebook/shell/... — keeps its current chord owner.
const LANGUAGE_IDS_WITH_DOCUMENT_SYMBOLS = new Set([
  'typescript',
  'javascript',
  'json',
  'css',
  'scss',
  'less',
  'html'
])

export function hasQuickOutlineSymbols(language: string): boolean {
  return LANGUAGE_IDS_WITH_DOCUMENT_SYMBOLS.has(language)
}

// Focus-blind by design: resolves through the event target's own ancestor chain,
// so with two mounted editors only the one containing the target yields.
// Why the typeof guard: shortcut-policy tests run in a node env where `Element` is undefined.
export function isQuickOutlineEditorTarget(target: EventTarget | null): boolean {
  return (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    target.closest(`[${QUICK_OUTLINE_EDITOR_ATTRIBUTE}]`) !== null
  )
}
