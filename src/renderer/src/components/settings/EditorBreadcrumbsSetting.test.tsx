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

import { EditorBreadcrumbsSetting } from './EditorBreadcrumbsSetting'

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

function renderSetting(breadcrumbs: boolean | undefined, updateSettings = vi.fn()) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <EditorBreadcrumbsSetting
        settings={{ ...getDefaultSettings(join('test', 'home')), editorBreadcrumbsEnabled: breadcrumbs }}
        updateSettings={updateSettings}
      />
    )
  })
  return { container, updateSettings }
}

describe('EditorBreadcrumbsSetting', () => {
  it('shows breadcrumbs as on for profiles saved before the preference existed', () => {
    const { container } = renderSetting(undefined)
    const switchControl = container.querySelector('[role="switch"]')

    expect(switchControl?.getAttribute('aria-checked')).toBe('true')
  })

  it('persists the off choice', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting(true, updateSettings)
    const switchControl = container.querySelector<HTMLButtonElement>('[role="switch"]')

    act(() => switchControl?.click())

    expect(updateSettings).toHaveBeenCalledWith({ editorBreadcrumbsEnabled: false })
  })

  it('ships breadcrumbs on in the default settings', () => {
    expect(getDefaultSettings(join('test', 'home')).editorBreadcrumbsEnabled).toBe(true)
  })
})
