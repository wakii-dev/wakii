// @vitest-environment happy-dom
// The quick-outline yield needs a real DOM (instanceof Element + closest), so it
// lives apart from the node-env shortcut-policy tests.
import { describe, expect, it } from 'vitest'

import { matchFloatingWorkspacePanelOwnedAction } from './floating-workspace-shortcut-policy'
import { QUICK_OUTLINE_EDITOR_ATTRIBUTE } from './quick-outline-editor-target'

function shortcutEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    key: 't',
    metaKey: false,
    shiftKey: false,
    ...overrides
  } as KeyboardEvent
}

function editorTarget(attributeValue: string | null): HTMLElement {
  const editor = document.createElement('div')
  if (attributeValue !== null) {
    editor.setAttribute(QUICK_OUTLINE_EDITOR_ATTRIBUTE, attributeValue)
  }
  const leaf = document.createElement('span')
  editor.appendChild(leaf)
  document.body.appendChild(editor)
  return leaf
}

describe('matchFloatingWorkspacePanelOwnedAction quick-outline yield', () => {
  it('yields Mod+Shift+O to the Monaco quick outline when the target is inside a symbol-provider editor', () => {
    const target = editorTarget('true')
    expect(
      matchFloatingWorkspacePanelOwnedAction(
        shortcutEvent({ key: 'o', code: 'KeyO', ctrlKey: true, shiftKey: true, target }),
        'linux',
        undefined,
        { context: 'app' }
      )
    ).toBeNull()
    target.parentElement?.remove()
  })

  it('keeps claiming Mod+Shift+O outside quick-outline editors (markdown new-tab unchanged)', () => {
    const target = editorTarget(null)
    expect(
      matchFloatingWorkspacePanelOwnedAction(
        shortcutEvent({ key: 'o', code: 'KeyO', ctrlKey: true, shiftKey: true, target }),
        'linux',
        undefined,
        { context: 'app' }
      )
    ).toBe('tab.openMarkdown')
    target.parentElement?.remove()
  })

  it('still claims other creation chords inside a quick-outline editor', () => {
    const target = editorTarget('true')
    expect(
      matchFloatingWorkspacePanelOwnedAction(
        shortcutEvent({ key: 't', code: 'KeyT', ctrlKey: true, target }),
        'linux',
        undefined,
        { context: 'app' }
      )
    ).toBe('tab.newTerminal')
    target.parentElement?.remove()
  })
})
