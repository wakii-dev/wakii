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

import { EditorCaretAnimationSetting } from './EditorCaretAnimationSetting'

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
  caretAnimation: 'on' | 'explicit' | 'off' | undefined,
  updateSettings = vi.fn()
) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <EditorCaretAnimationSetting
        settings={{ ...getDefaultSettings(join('test', 'home')), editorCursorSmoothCaretAnimation: caretAnimation }}
        updateSettings={updateSettings}
      />
    )
  })
  return { container, updateSettings }
}

describe('EditorCaretAnimationSetting', () => {
  it('shows On as active for profiles saved before the preference existed', () => {
    const { container } = renderSetting(undefined)
    const on = [...container.querySelectorAll('[role="radio"]')].find(
      (button) => button.textContent === 'On'
    )

    expect(on?.getAttribute('aria-checked')).toBe('true')
  })

  it('persists the explicit choice', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting('on', updateSettings)
    const explicit = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (button) => button.textContent === 'Explicit'
    )

    act(() => explicit?.click())

    expect(updateSettings).toHaveBeenCalledWith({ editorCursorSmoothCaretAnimation: 'explicit' })
  })

  it('persists the off choice', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting('on', updateSettings)
    const off = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (button) => button.textContent === 'Off'
    )

    act(() => off?.click())

    expect(updateSettings).toHaveBeenCalledWith({ editorCursorSmoothCaretAnimation: 'off' })
  })
})
