// @vitest-environment happy-dom
import * as monaco from 'monaco-editor'
import { afterEach, describe, expect, it } from 'vitest'
import type { DocumentFormattingEditProvider, IDisposable } from 'monaco-editor'

// Verifies the Shift+Alt+F contract the file editor relies on WITHOUT re-registering
// the built-in action: a document formatting provider's edits flow through the model,
// the content-sync draft listener observes every intermediate state, and undo
// restores the pre-format draft. The real JSON worker/provider is exercised by the
// ELECTRON walkthrough; this test pins the model-level contract the editor owns.
// Built-in formatter scope (grep-verified in monaco 0.55.1): jsonMode, cssMode
// (css/scss/less), htmlMode register formatters; tsMode does NOT — ts/js format is
// a no-op via the action's hasDocumentFormattingProvider precondition.

const disposables: IDisposable[] = []
const models: monaco.editor.ITextModel[] = []

afterEach(() => {
  for (const d of disposables.splice(0)) {
    d.dispose()
  }
  for (const m of models.splice(0)) {
    m.dispose()
  }
})

function createTestFormatter(formatted: string): DocumentFormattingEditProvider {
  return {
    provideDocumentFormattingEdits(model) {
      return [
        {
          range: model.getFullModelRange(),
          text: formatted
        }
      ]
    }
  }
}

// Mimics the model mutation core of Monaco's built-in editor.action.formatDocument
// (formatActions.js): fetch edits from the provider, apply them as an undoable edit.
function applyProviderFormat(
  model: monaco.editor.ITextModel,
  provider: DocumentFormattingEditProvider
): void {
  const edits = provider.provideDocumentFormattingEdits(
    model,
    { tabSize: 2, insertSpaces: true },
    { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) }
  )
  if (!edits || 'then' in edits) {
    throw new Error('test formatter must return sync edits')
  }
  model.pushEditOperations([], edits, () => null)
}

describe('format document draft integrity (built-in Shift+Alt+F contract)', () => {
  it('keeps the draft in step through format + undo on a JSON model', async () => {
    const model = monaco.editor.createModel('{"a":1,"b":2}', 'json')
    models.push(model)
    // Why normalize: happy-dom resolves the platform default EOL to CRLF; the contract
    // under test is content equality, not the model's platform EOL choice.
    const read = (value: string): string => value.replace(/\r\n/g, '\n')
    const formatted = '{\n  "a": 1,\n  "b": 2\n}\n'
    const formatter = createTestFormatter(formatted)

    // Simulates the content-sync draft: handleChange forwards every model change to onContentChange.
    const draftStates: string[] = []
    model.onDidChangeContent(() => {
      draftStates.push(read(model.getValue()))
    })

    applyProviderFormat(model, formatter)

    expect(read(model.getValue())).toBe(formatted)
    expect(draftStates.at(-1)).toBe(formatted)

    await model.undo()
    expect(read(model.getValue())).toBe('{"a":1,"b":2}')
    expect(draftStates.at(-1)).toBe('{"a":1,"b":2}')
    expect(model.isDisposed()).toBe(false)
  })

  it('exposes the css family whose cssMode registers a document formatter', () => {
    const cssFamily = monaco.languages
      .getLanguages()
      .map((language) => language.id)
      .filter((id) => ['css', 'scss', 'less'].includes(id))
      .sort()
    expect(cssFamily).toEqual(['css', 'less', 'scss'])
  })
})
