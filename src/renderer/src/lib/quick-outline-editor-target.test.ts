// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

import {
  QUICK_OUTLINE_EDITOR_ATTRIBUTE,
  hasQuickOutlineSymbols,
  isQuickOutlineEditorTarget
} from './quick-outline-editor-target'

describe('hasQuickOutlineSymbols', () => {
  it('matches the languages Monaco ships a DocumentSymbolProvider for', () => {
    // Probe (FI-33 task 1): tsMode (ts/js), jsonMode, cssMode (css/scss/less), htmlMode.
    for (const language of [
      'typescript',
      'javascript',
      'json',
      'css',
      'scss',
      'less',
      'html'
    ]) {
      expect(hasQuickOutlineSymbols(language), language).toBe(true)
    }
  })

  it('excludes languages without a provider — the chord keeps its current owner there', () => {
    for (const language of ['markdown', 'mermaid', 'csv', 'tsv', 'notebook', 'shell', 'python']) {
      expect(hasQuickOutlineSymbols(language), language).toBe(false)
    }
  })
})

describe('isQuickOutlineEditorTarget', () => {
  function mountQuickOutlineEditor(): { container: HTMLDivElement; inner: HTMLSpanElement } {
    const container = document.createElement('div')
    container.setAttribute(QUICK_OUTLINE_EDITOR_ATTRIBUTE, 'true')
    const inner = document.createElement('span')
    container.appendChild(inner)
    document.body.appendChild(container)
    return { container, inner }
  }

  it('is true for a target inside an editor that owns the quick-outline chord', () => {
    const { inner } = mountQuickOutlineEditor()
    expect(isQuickOutlineEditorTarget(inner)).toBe(true)
    inner.parentElement?.remove()
  })

  it('is true for Monaco widget children (.monaco-editor descendants count as the editor)', () => {
    const { container } = mountQuickOutlineEditor()
    // Suggest/find widgets render as deep descendants of the editor container.
    const widget = document.createElement('div')
    widget.className = 'monaco-suggest-widget'
    container.appendChild(widget)
    const leaf = document.createElement('div')
    widget.appendChild(leaf)
    expect(isQuickOutlineEditorTarget(leaf)).toBe(true)
    container.remove()
  })

  it('is false outside quick-outline editors — markdown preview and xterm keep their chords', () => {
    const outside = document.createElement('div')
    const leaf = document.createElement('span')
    outside.appendChild(leaf)
    document.body.appendChild(outside)
    expect(isQuickOutlineEditorTarget(leaf)).toBe(false)
    outside.remove()
  })

  it('is false for null and non-element targets', () => {
    expect(isQuickOutlineEditorTarget(null)).toBe(false)
    expect(isQuickOutlineEditorTarget(document)).toBe(false)
  })

  it('resolves the owning instance when two editors are mounted (no focus-blind global)', () => {
    const ownerA = document.createElement('div')
    ownerA.setAttribute(QUICK_OUTLINE_EDITOR_ATTRIBUTE, 'a')
    const ownerB = document.createElement('div')
    ownerB.setAttribute(QUICK_OUTLINE_EDITOR_ATTRIBUTE, 'b')
    const leafB = document.createElement('span')
    ownerB.appendChild(leafB)
    document.body.appendChild(ownerA)
    document.body.appendChild(ownerB)

    // The target gates via its own ancestor chain: only the editor containing
    // the event target yields, the sibling editor is irrelevant.
    expect(isQuickOutlineEditorTarget(leafB)).toBe(true)
    expect(isQuickOutlineEditorTarget(ownerA)).toBe(true)
    const orphan = document.createElement('span')
    document.body.appendChild(orphan)
    expect(isQuickOutlineEditorTarget(orphan)).toBe(false)
    ownerA.remove()
    ownerB.remove()
    orphan.remove()
  })
})
