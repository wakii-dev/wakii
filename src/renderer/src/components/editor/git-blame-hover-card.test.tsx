// @vitest-environment happy-dom
// Acceptance contract — GitLens-parity SF-1 (mindmap: hover card GitLens).
// These tests are intentionally RED until the hover card implementation lands:
// they pin the design in docs/mockups/gitlens-parity/huong-b-final.html —
// full message + author + relative date + SHA, three footer actions
// (View commit / Blame previous / Copy SHA), click SHA opens the commit,
// blame-previous through the currently-unused `previousHash` field.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { GitBlameLine } from '../../../../shared/git-blame-types'
import { GIT_BLAME_STRINGS_EN } from './git-blame-strings'
import { formatRelativeBlameDate } from './git-blame-annotation-model'
import { GIT_BLAME_HOVER_CARD_STRINGS_EN } from './git-blame-hover-card-strings'
import { GitBlameHoverCard } from './git-blame-hover-card'
import { buildBlameHoverCard, getBlamePreviousTarget } from './git-blame-hover-card-model'

const COMMITTED: GitBlameLine = {
  lineNumber: 3,
  hash: 'a'.repeat(40),
  abbreviatedHash: 'abc1234',
  author: 'Jane Dev',
  authorTime: 1_700_000_000_000,
  summary: 'Add blame reader',
  committed: true,
  previousHash: '8'.repeat(40)
}

const ROOT_COMMIT: GitBlameLine = { ...COMMITTED, previousHash: undefined }

const UNCOMMITTED: GitBlameLine = {
  lineNumber: 4,
  hash: '0'.repeat(40),
  abbreviatedHash: '0000000',
  author: 'Not Committed Yet',
  authorTime: 1_700_000_000_000,
  summary: 'src/app.ts',
  committed: false
}

const NOW = 1_700_060_000_000

describe('getBlamePreviousTarget (SF-1: previousHash must stop being unused)', () => {
  it('returns the porcelain previous parent for a committed line', () => {
    expect(getBlamePreviousTarget(COMMITTED)).toBe(COMMITTED.previousHash)
  })

  it('returns null for a root commit with no previous parent', () => {
    expect(getBlamePreviousTarget(ROOT_COMMIT)).toBeNull()
  })

  it('returns null for an uncommitted line — there is no commit to walk back from', () => {
    expect(getBlamePreviousTarget(UNCOMMITTED)).toBeNull()
  })
})

describe('buildBlameHoverCard', () => {
  it('carries the sha pair, author, relative date, headline and full message', () => {
    const card = buildBlameHoverCard(COMMITTED, {
      strings: GIT_BLAME_STRINGS_EN,
      messageBody: 'Add blame reader\n\nThe pipeline used to drop the IPC registration.',
      now: NOW
    })
    expect(card.hash).toBe(COMMITTED.hash)
    expect(card.abbreviatedHash).toBe('abc1234')
    expect(card.author).toBe('Jane Dev')
    expect(card.relativeDate).toBe(formatRelative(COMMITTED.authorTime, NOW))
    expect(card.summary).toBe('Add blame reader')
    expect(card.fullMessage).toContain('The pipeline used to drop the IPC registration.')
    expect(card.previousHash).toBe(COMMITTED.previousHash)
  })

  it('falls back to the summary as the full message when no body was fetched', () => {
    const card = buildBlameHoverCard(COMMITTED, { strings: GIT_BLAME_STRINGS_EN, now: NOW })
    expect(card.fullMessage).toBe('Add blame reader')
  })

  it('labels an uncommitted line as You', () => {
    const card = buildBlameHoverCard(UNCOMMITTED, { strings: GIT_BLAME_STRINGS_EN, now: NOW })
    expect(card.author).toBe(GIT_BLAME_STRINGS_EN.you)
    expect(card.committed).toBe(false)
  })
})

describe('GitBlameHoverCard', () => {
  it('renders headline, full message, author, relative date and abbreviated SHA', () => {
    render(
      <GitBlameHoverCard
        card={buildBlameHoverCard(COMMITTED, {
          strings: GIT_BLAME_STRINGS_EN,
          messageBody: 'Add blame reader\n\nBody paragraph.',
          now: NOW
        })}
        strings={GIT_BLAME_HOVER_CARD_STRINGS_EN}
      />
    )
    expect(screen.getByText('Add blame reader')).toBeInTheDocument()
    expect(screen.getByText(/Body paragraph\./)).toBeInTheDocument()
    expect(screen.getByText('Jane Dev')).toBeInTheDocument()
    expect(screen.getByText(formatRelative(COMMITTED.authorTime, NOW))).toBeInTheDocument()
    expect(screen.getByText('abc1234')).toBeInTheDocument()
  })

  it('opens the commit by full hash when the SHA or View commit is clicked', async () => {
    const onOpenCommit = vi.fn()
    const user = userEvent.setup()
    render(
      <GitBlameHoverCard
        card={buildBlameHoverCard(COMMITTED, { strings: GIT_BLAME_STRINGS_EN, now: NOW })}
        strings={GIT_BLAME_HOVER_CARD_STRINGS_EN}
        onOpenCommit={onOpenCommit}
      />
    )
    await user.click(screen.getByText('abc1234'))
    await user.click(
      screen.getByRole('button', { name: GIT_BLAME_HOVER_CARD_STRINGS_EN.viewCommit })
    )
    expect(onOpenCommit).toHaveBeenCalledTimes(2)
    expect(onOpenCommit).toHaveBeenNthCalledWith(1, COMMITTED.hash)
    expect(onOpenCommit).toHaveBeenNthCalledWith(2, COMMITTED.hash)
  })

  it('blames the parent commit through previousHash when Blame previous is clicked', async () => {
    const onBlamePrevious = vi.fn()
    const user = userEvent.setup()
    render(
      <GitBlameHoverCard
        card={buildBlameHoverCard(COMMITTED, { strings: GIT_BLAME_STRINGS_EN, now: NOW })}
        strings={GIT_BLAME_HOVER_CARD_STRINGS_EN}
        onBlamePrevious={onBlamePrevious}
      />
    )
    await user.click(screen.getByRole('button', { name: /Blame previous/ }))
    expect(onBlamePrevious).toHaveBeenCalledTimes(1)
    expect(onBlamePrevious).toHaveBeenCalledWith(COMMITTED.previousHash)
  })

  it('offers no commit affordances on an uncommitted line', () => {
    const onOpenCommit = vi.fn()
    render(
      <GitBlameHoverCard
        card={buildBlameHoverCard(UNCOMMITTED, { strings: GIT_BLAME_STRINGS_EN, now: NOW })}
        strings={GIT_BLAME_HOVER_CARD_STRINGS_EN}
        onOpenCommit={onOpenCommit}
        onBlamePrevious={vi.fn()}
      />
    )
    expect(
      screen.queryByRole('button', { name: GIT_BLAME_HOVER_CARD_STRINGS_EN.viewCommit })
    ).toBeNull()
    expect(screen.queryByText('abc1234')).toBeNull()
    expect(screen.queryByRole('button', { name: /Blame previous/ })).toBeNull()
  })

  it('offers no Blame previous on a root commit — there is no parent to walk to', () => {
    render(
      <GitBlameHoverCard
        card={buildBlameHoverCard(ROOT_COMMIT, { strings: GIT_BLAME_STRINGS_EN, now: NOW })}
        strings={GIT_BLAME_HOVER_CARD_STRINGS_EN}
        onBlamePrevious={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /Blame previous/ })).toBeNull()
  })

  it('copies the full sha to the clipboard from the Copy SHA action', async () => {
    // Why setup first: userEvent.setup() replaces navigator.clipboard with its
    // own stub, clobbering any mock defined before it.
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(
      <GitBlameHoverCard
        card={buildBlameHoverCard(COMMITTED, { strings: GIT_BLAME_STRINGS_EN, now: NOW })}
        strings={GIT_BLAME_HOVER_CARD_STRINGS_EN}
      />
    )
    await user.click(screen.getByRole('button', { name: GIT_BLAME_HOVER_CARD_STRINGS_EN.copySha }))
    expect(writeText).toHaveBeenCalledWith(COMMITTED.hash)
  })
})

function formatRelative(authorTime: number, now: number): string {
  return formatRelativeBlameDate(authorTime, now)
}
