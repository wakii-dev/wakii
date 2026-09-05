import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileHomeStoriesCard } from './MobileHomeStoriesCard'

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View'
}))
vi.mock('lucide-react-native', () => ({ BookOpen: 'BookOpen', ChevronRight: 'ChevronRight' }))

describe('MobileHomeStoriesCard', () => {
  let renderer: ReactTestRenderer | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  async function renderCard(props: {
    enabled: boolean
    hostName: string | null
    onOpen: () => void
  }): Promise<void> {
    await act(async () => {
      renderer = create(createElement(MobileHomeStoriesCard, props))
    })
  }

  function texts(): string[] {
    return renderer!.root
      .findAllByType('Text')
      .flatMap((node) => node.children.filter((child) => typeof child === 'string'))
  }

  it('renders the title and host subtitle', async () => {
    await renderCard({ enabled: true, hostName: 'Studio', onOpen: () => {} })
    expect(texts()).toContain('Stories')
    expect(texts()).toContain('Stories on Studio')
  })

  it('falls back to the no-desktop subtitle without a host', async () => {
    await renderCard({ enabled: false, hostName: null, onOpen: () => {} })
    expect(texts()).toContain('No desktop connected')
  })

  it('opens stories on press', async () => {
    const onOpen = vi.fn()
    await renderCard({ enabled: true, hostName: 'Studio', onOpen })
    const pressable = renderer!.root.findByType('Pressable')
    expect(pressable.props.disabled).toBe(false)
    await act(async () => {
      pressable.props.onPress()
    })
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('disables the card without a connected host', async () => {
    const onOpen = vi.fn()
    await renderCard({ enabled: false, hostName: null, onOpen })
    expect(renderer!.root.findByType('Pressable').props.disabled).toBe(true)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
