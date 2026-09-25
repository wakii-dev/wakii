// @vitest-environment happy-dom

import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: { settingsSearchQuery: string }) => unknown) =>
    selector({ settingsSearchQuery: '' })
}))

import { EditorRenderWhitespaceSetting } from './EditorRenderWhitespaceSetting'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  root = null
  container = null
})

function renderSetting(
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all' | undefined,
  updateSettings = vi.fn()
) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <EditorRenderWhitespaceSetting
        settings={{ ...getDefaultSettings(join('test', 'home')), editorRenderWhitespace: renderWhitespace }}
        updateSettings={updateSettings}
      />
    )
  })
  return { container, updateSettings }
}

describe('EditorRenderWhitespaceSetting', () => {
  it('shows Selection as active for profiles saved before the preference existed', () => {
    const { container } = renderSetting(undefined)
    const selection = [...container.querySelectorAll('[role="radio"]')].find(
      (button) => button.textContent === 'Selection'
    )

    expect(selection?.getAttribute('aria-checked')).toBe('true')
  })

  it('persists the all choice', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting('selection', updateSettings)
    const all = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (button) => button.textContent === 'All'
    )

    act(() => all?.click())

    expect(updateSettings).toHaveBeenCalledWith({ editorRenderWhitespace: 'all' })
  })

  it('persists the none choice', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting('selection', updateSettings)
    const none = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (button) => button.textContent === 'None'
    )

    act(() => none?.click())

    expect(updateSettings).toHaveBeenCalledWith({ editorRenderWhitespace: 'none' })
  })
})
