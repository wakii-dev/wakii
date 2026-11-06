// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectStructuredItemsToNativeChat } from '../../../../shared/agent-session/view/structured-agent-session-projection'
import type { AgentJournalStatusItem } from '../../../../shared/agent-session/journal/agent-session-journal-types'

import { TooltipProvider } from '@/components/ui/tooltip'
import { MessageRow } from './NativeChatMessageRow'
import { NativeChatNoticeRow } from './NativeChatNoticeRow'

import { i18n } from '@/i18n/i18n'
import { agentSessionFailureWords } from '../../../../shared/agent-session/failures/agent-session-failure-words'

import {
  NativeChatOrcaStopContext,
  type NativeChatOrcaStopView
} from './native-chat-orca-stop-context'

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

type ContinueOffer = Pick<NativeChatOrcaStopView, 'offeredTurnItemId' | 'continueNow'> &
  Partial<Pick<NativeChatOrcaStopView, 'usageLimitTurnItemId' | 'continueUsageLimit'>>

function orcaStopView(
  hostLabel: string | null,
  continueAvailable: boolean,
  remoteHost: boolean,
  offer: ContinueOffer
): NativeChatOrcaStopView {
  return {
    hostLabel,
    remoteHost,
    continueAvailable,
    usageLimitTurnItemId: null,
    continueUsageLimit: () => {},
    ...offer
  }
}

const NO_OFFER = { offeredTurnItemId: null, continueNow: () => {} }

function renderStatus(
  body: AgentJournalStatusItem,
  hostLabel: string | null = null,
  continueAvailable = false,
  remoteHost = false,
  agentName?: string,
  offer: ContinueOffer = NO_OFFER
) {
  const [message] = projectStructuredItemsToNativeChat([
    {
      itemId: 'notice',
      sequence: 1,
      revision: 1,
      observedAt: 1,
      body,
      turnScope: { kind: 'turn', turnItemId: 'cut-turn' }
    }
  ])
  const view = orcaStopView(hostLabel, continueAvailable, remoteHost, offer)
  return render(
    <TooltipProvider>
      <NativeChatOrcaStopContext.Provider value={view}>
        <MessageRow
          message={message!}
          agentName={agentName}
          expandSignal={false}
          onScrollMessageToTop={vi.fn()}
        />
      </NativeChatOrcaStopContext.Provider>
    </TooltipProvider>
  )
}

const LEGACY_TEXT =
  'Codex stopped while this response was in progress. You can continue in this conversation.'

function orcaStopRow(cause: string): AgentJournalStatusItem {
  return {
    kind: 'status',
    text: LEGACY_TEXT,
    tone: 'error',
    presentation: 'orca-stop',
    orcaStop: { cause }
  }
}

describe('the row a Wakii stop leaves', () => {
  it.each([
    ['update', 'Wakii on studio-mac restarted for an update while this response was in progress.'],
    ['quit', 'Wakii on studio-mac was closed while this response was in progress.'],
    ['crash', 'Wakii on studio-mac stopped unexpectedly while this response was in progress.']
  ])('names a %s and the machine, muted', (cause, sentence) => {
    renderStatus(orcaStopRow(cause), 'studio-mac')
    const row = screen.getByText(`${sentence} You can continue in this conversation.`)
    expect(row.parentElement?.parentElement).toHaveClass('text-chat-foreground-faint')
    expect(screen.queryByText(LEGACY_TEXT)).toBeNull()
  })

  it('leaves the way on to Continue wherever its host can continue a cut', () => {
    renderStatus(orcaStopRow('update'), 'studio-mac', true)
    expect(
      screen.getByText(
        'Wakii on studio-mac restarted for an update while this response was in progress.'
      )
    ).toBeInTheDocument()
  })

  it('carries Continue on the cut it is offered for, and only there', () => {
    const continueNow = vi.fn()
    renderStatus(orcaStopRow('quit'), 'studio-mac', true, false, undefined, {
      offeredTurnItemId: 'cut-turn',
      continueNow
    })
    const sentence = screen.getByText(
      'Wakii on studio-mac was closed while this response was in progress.'
    )
    const button = screen.getByRole('button', { name: 'Continue' })
    expect(sentence.parentElement).toContainElement(button)
    fireEvent.click(button)
    expect(continueNow).toHaveBeenCalledOnce()
    cleanup()

    renderStatus(orcaStopRow('quit'), 'studio-mac', true, false, undefined, {
      offeredTurnItemId: 'another-turn',
      continueNow
    })
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })

  it("says a remote host's Wakii stopped, not that it was closed", () => {
    renderStatus(orcaStopRow('quit'), 'QA SSH', true, true)
    expect(
      screen.getByText('Wakii on QA SSH stopped while this response was in progress.').parentElement
        ?.parentElement
    ).toHaveClass('text-chat-foreground-faint')
    expect(screen.queryByText(/was closed/)).toBeNull()
  })

  it("keeps this desktop's quit as closed", () => {
    renderStatus(orcaStopRow('quit'), 'studio-mac', true, false)
    expect(
      screen.getByText('Wakii on studio-mac was closed while this response was in progress.')
    ).toBeInTheDocument()
  })

  it.each([
    ['update', 'Wakii on QA SSH restarted for an update while this response was in progress.'],
    ['crash', 'Wakii on QA SSH stopped unexpectedly while this response was in progress.']
  ])("keeps a remote host's %s words", (cause, sentence) => {
    renderStatus(orcaStopRow(cause), 'QA SSH', true, true)
    expect(screen.getByText(sentence)).toBeInTheDocument()
  })

  it('stays neutral, naming the cause, as a reader that re-presented it neutral hands it on', () => {
    const represented: AgentJournalStatusItem = {
      kind: 'status',
      text: 'This response was interrupted. You can continue in this conversation.',
      tone: 'notice',
      presentation: 'orca-stop',
      orcaStop: { cause: 'crash' }
    }
    renderStatus(represented, 'studio-mac', true)
    expect(
      screen.getByText(
        'Wakii on studio-mac stopped unexpectedly while this response was in progress.'
      ).parentElement?.parentElement
    ).toHaveClass('text-chat-foreground-faint')
    cleanup()
    renderStatus(represented, null, true)
    expect(
      screen.getByText('This response was interrupted. You can continue in this conversation.')
        .parentElement?.parentElement
    ).toHaveClass('text-chat-foreground-faint')
  })

  it('keeps the host words for a cause this build does not know', () => {
    renderStatus(orcaStopRow('power-loss'), 'studio-mac')
    expect(screen.getByText(LEGACY_TEXT)).toBeInTheDocument()
  })

  it('keeps the host words when the chat has no machine to name, muted all the same', () => {
    renderStatus(orcaStopRow('update'), null)
    expect(screen.getByText(LEGACY_TEXT).parentElement?.parentElement).toHaveClass(
      'text-chat-foreground-faint'
    )
  })

  it('calls a paired server with no name the remote server, so its words match the button', () => {
    renderStatus(orcaStopRow('update'), null, true, true)
    expect(
      screen.getByText(
        'Wakii on the remote server restarted for an update while this response was in progress.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(LEGACY_TEXT)).toBeNull()
  })

  it('keeps the host words for a stop Wakii did not cause', () => {
    const { orcaStop: _orcaStop, presentation: _presentation, ...agentExit } = orcaStopRow('update')
    renderStatus(agentExit, 'studio-mac')
    expect(screen.getByText(LEGACY_TEXT).parentElement?.parentElement).toHaveClass(
      'text-destructive'
    )
  })
})

describe('the row a usage limit leaves', () => {
  const resetsAt = new Date(2026, 9, 18, 15, 0).getTime()
  const row = {
    kind: 'status',
    tone: 'warning',
    text: 'Claude hit its session limit. Send a message once it resets to continue.',
    failure: { kind: 'usageLimitReached', usageLimit: { window: 'session', resetsAt } }
  } as const

  it('says when the limit resets in this clock, and offers Continue Now only once it has', () => {
    if (!isAdmissibleAgentJournalItemBody(row) || row.kind !== 'status') {
      throw new Error('Historical status fixture was not admitted')
    }
    vi.useFakeTimers({
      now: new Date(2026, 9, 18, 12, 30),
      toFake: ['Date', 'setTimeout', 'clearTimeout']
    })
    const continueUsageLimit = vi.fn()
    renderStatus(row, null, false, false, 'Claude', {
      ...NO_OFFER,
      usageLimitTurnItemId: 'cut-turn',
      continueUsageLimit
    })
    const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
      resetsAt
    )
    expect(
      screen.getByText(`Claude hit its session limit. It resets at ${clock}.`)
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue Now' })).toBeNull()
    act(() => {
      vi.advanceTimersByTime(resetsAt - Date.now() - 1)
    })
    expect(screen.queryByRole('button', { name: 'Continue Now' })).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    vi.useRealTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Continue Now' }))
    expect(continueUsageLimit).toHaveBeenCalledTimes(1)
  })

  it.each(['typed', 'text-only', 'unknown'] as const)(
    'renders historical usage-limit text with a %s fact',
    (fact) => {
      const historicalRow: unknown =
        fact === 'text-only'
          ? { ...row, failure: undefined }
          : fact === 'unknown'
            ? {
                ...row,
                failure: {
                  ...row.failure,
                  kind: 'usageLimitReached' as const,
                  futureLimit: true
                }
              }
            : row
      if (!isAdmissibleAgentJournalItemBody(historicalRow) || historicalRow.kind !== 'status') {
        throw new Error('Historical status fixture was not admitted')
      }
      if (fact === 'unknown') {
        expect(historicalRow.failure).toEqual({ ...row.failure, futureLimit: true })
      }
      renderStatus(historicalRow, null, false, false, 'Claude')
      if (fact === 'typed') {
        expect(
          screen.getByText(/^Claude hit its session limit\. It resets at \S.*\.$/u)
        ).toBeInTheDocument()
        expect(screen.queryByText(/Send a message once it resets/)).toBeNull()
      } else {
        expect(screen.getByText(row.text)).toBeInTheDocument()
      }
      expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    }
  )
})

describe('usage-limit reset clock changes', () => {
  const start = new Date(2026, 9, 18, 12).getTime()
  const hour = 60 * 60 * 1000
  const continueUsageLimit = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers({ now: start, toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    continueUsageLimit.mockClear()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function notice(resetsAt?: number, count = 1) {
    const view = orcaStopView(null, false, false, {
      ...NO_OFFER,
      usageLimitTurnItemId: 'cut-turn',
      continueUsageLimit
    })
    return (
      <TooltipProvider>
        <NativeChatOrcaStopContext.Provider value={view}>
          {Array.from({ length: count }, (_, index) => (
            <NativeChatNoticeRow
              key={`chat-${index}`}
              agentName="Claude"
              block={{
                type: 'text',
                tone: 'warning',
                text: 'Claude hit its usage limit.',
                usageLimitTurnItemId: 'cut-turn',
                failure: { kind: 'usageLimitReached', usageLimit: { window: 'session', resetsAt } }
              }}
            />
          ))}
        </NativeChatOrcaStopContext.Provider>
      </TooltipProvider>
    )
  }

  it('keeps unknown resets hidden and uses replacement resets immediately, including on remount', () => {
    const row = render(notice())
    expect(screen.queryByRole('button', { name: 'Continue Now' })).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    row.rerender(notice(start + 6 * hour))
    vi.setSystemTime(start + 3 * hour)
    row.rerender(notice(start + 4 * hour))
    act(() => vi.advanceTimersByTime(hour))
    expect(screen.getByRole('button', { name: 'Continue Now' })).toBeInTheDocument()
    row.rerender(notice(start + 6 * hour))
    expect(screen.queryByRole('button', { name: 'Continue Now' })).toBeNull()
    row.rerender(notice(start + 2 * hour))
    expect(screen.getByRole('button', { name: 'Continue Now' })).toBeInTheDocument()
    row.rerender(notice())
    expect(screen.queryByRole('button', { name: 'Continue Now' })).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    row.unmount()
    render(notice(start + 2 * hour))
    expect(screen.getByRole('button', { name: 'Continue Now' })).toBeInTheDocument()
    expect(continueUsageLimit).not.toHaveBeenCalled()
  })

  it.each(['rerender', 'focus', 'visibilitychange'] as const)(
    'rechecks forward and backward clock corrections on %s',
    (signal) => {
      const row = render(notice(start + hour))
      const refresh = () => {
        if (signal === 'rerender') {
          row.rerender(notice(start + hour))
        } else if (signal === 'focus') {
          fireEvent(window, new Event('focus'))
        } else {
          fireEvent(document, new Event('visibilitychange'))
        }
      }
      vi.setSystemTime(start + 2 * hour)
      refresh()
      expect(screen.getByRole('button', { name: 'Continue Now' })).toBeInTheDocument()
      vi.setSystemTime(start)
      refresh()
      expect(screen.queryByRole('button', { name: 'Continue Now' })).toBeNull()
      act(() => vi.advanceTimersByTime(hour))
      expect(screen.getByRole('button', { name: 'Continue Now' })).toBeInTheDocument()
      expect(continueUsageLimit).not.toHaveBeenCalled()
    }
  )

  it.each([1, 10])('bounds 30-day reset work for %i mounted chats and cleans up', (count) => {
    const duration = 30 * 24 * hour
    const maxDelay = 2_147_483_647
    const schedule = vi.spyOn(globalThis, 'setTimeout')
    const row = render(notice(start + duration, count))
    expect(schedule).toHaveBeenCalledTimes(count)
    expect(vi.getTimerCount()).toBe(count)
    act(() => vi.advanceTimersByTime(maxDelay))
    expect(screen.queryAllByRole('button', { name: 'Continue Now' })).toHaveLength(0)
    expect(schedule).toHaveBeenCalledTimes(2 * count)
    expect(vi.getTimerCount()).toBe(count)
    act(() => vi.advanceTimersByTime(duration - maxDelay - 1))
    expect(screen.queryAllByRole('button', { name: 'Continue Now' })).toHaveLength(0)
    expect(schedule).toHaveBeenCalledTimes(2 * count)
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getAllByRole('button', { name: 'Continue Now' })).toHaveLength(count)
    expect(schedule).toHaveBeenCalledTimes(2 * count)
    expect(schedule.mock.calls.every(([, delay]) => delay !== undefined && delay <= maxDelay)).toBe(
      true
    )
    expect(continueUsageLimit).not.toHaveBeenCalled()
    row.rerender(notice(start + 2 * duration, count))
    expect(vi.getTimerCount()).toBe(count)
    row.unmount()
    expect(vi.getTimerCount()).toBe(0)
    const scheduledBeforeCleanup = schedule.mock.calls.length
    fireEvent(window, new Event('focus'))
    fireEvent(document, new Event('visibilitychange'))
    expect(schedule).toHaveBeenCalledTimes(scheduledBeforeCleanup)
  })
})

describe('notice rows', () => {
  it('updates a mounted auth row when the reader changes language', async () => {
    renderStatus(
      {
        kind: 'status',
        tone: 'error',
        ...agentSessionFailureWords({ kind: 'notSignedIn' }, { agentName: 'Grok', surface: 'row' })
      },
      null,
      false,
      false,
      'Grok'
    )
    expect(
      screen.getByText('Sign in to Grok with `grok login` on the computer running this chat.')
    ).toBeInTheDocument()
    await act(() => i18n.changeLanguage('fr'))
    expect(
      screen.getByText(
        'Connectez-vous à Grok avec `grok login` sur l’ordinateur qui exécute ce chat.'
      )
    ).toBeInTheDocument()
  })
})

// Protocol-shaped synthetic notices; no exact recorded review/denial capture is available.
it.each([
  [
    'codex',
    'notification:guardianWarning',
    'warning',
    'Codex reported a safety review warning. View details.',
    'Codex a signalé un avertissement de sécurité. Voir les détails.'
  ],
  [
    'claude',
    'message:system:permission_denied',
    'error',
    'Claude denied permission. View details.',
    'Claude a refusé la permission. Voir les détails.'
  ]
] as const)(
  'compacts the declared %s notice while retaining every available diagnostic',
  async (provider, kind, tone, heading, french) => {
    const text = `${'安全 '.repeat(1500)}EXPLANATION_SENTINEL`
    const head = `{"partial":"${'é'.repeat(4500)}PAYLOAD_SENTINEL`
    renderStatus({
      kind: 'status',
      tone,
      text,
      providerFrame: {
        provider,
        kind,
        payload: { head, byteLength: 99999, digest: 'synthetic', truncated: true }
      }
    })
    const summary = screen.getByText(heading).closest('summary')!
    const disclosure = summary.closest('details')!
    expect(disclosure.open).toBe(false)
    expect(summary).not.toHaveTextContent(/SENTINEL|99999/)
    expect(disclosure.parentElement).not.toHaveClass('text-destructive', 'text-chat-warning')
    fireEvent.click(summary)
    expect(disclosure.open).toBe(true)
    const detail = disclosure.querySelector('pre')!
    expect(detail.textContent).toContain(text)
    expect(detail.textContent).toContain(head)
    expect(detail).toHaveTextContent('Provider response truncated (original size: 99999 bytes).')
    expect(detail).toHaveClass(tone === 'error' ? 'text-destructive' : 'text-chat-warning')
    expect(screen.queryByText('Show full output')).toBeNull()
    await act(() => i18n.changeLanguage('fr'))
    expect(summary).toHaveTextContent(french)
    expect(detail).toHaveTextContent(
      'Réponse du fournisseur tronquée (taille d’origine : 99999 octets).'
    )
    expect(disclosure.open).toBe(true)
  }
)
