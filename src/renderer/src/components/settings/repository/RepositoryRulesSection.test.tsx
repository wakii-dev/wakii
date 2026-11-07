// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../../shared/repo-types'
import { RepositoryRulesSection } from './RepositoryRulesSection'
const { state } = vi.hoisted(() => {
  const repos: Repo[] = []
  return { state: { repos, settingsSearchQuery: '' } }
})
vi.mock('@/store/index', () => {
  const useAppStore = (selector: (store: typeof state) => unknown) => selector(state)
  useAppStore.getState = () => state
  return { useAppStore }
})
afterEach(cleanup)
beforeEach(() => {
  state.repos = [
    {
      id: 'repo',
      path: '/repo',
      displayName: 'Alpha',
      badgeColor: '',
      addedAt: 0,
      rulesDeclaration: 'rules/projects/alpha.json'
    }
  ]
})
describe('repository rules declaration setting', () => {
  it('shows the stored declaration and saves an edited path', () => {
    const update = vi.fn()
    render(<RepositoryRulesSection repo={state.repos[0]} updateRepo={update} />)
    const input = screen.getByLabelText('Rules Declaration') as HTMLInputElement
    expect(input.value).toBe('rules/projects/alpha.json')
    fireEvent.change(input, { target: { value: 'rules/projects/next.json' } })
    expect(update).toHaveBeenCalledWith('repo', { rulesDeclaration: 'rules/projects/next.json' })
  })
  it('clears the declaration when the input is emptied', () => {
    const update = vi.fn()
    render(<RepositoryRulesSection repo={state.repos[0]} updateRepo={update} />)
    const input = screen.getByLabelText('Rules Declaration') as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    expect(update).toHaveBeenCalledWith('repo', { rulesDeclaration: undefined })
  })
})
