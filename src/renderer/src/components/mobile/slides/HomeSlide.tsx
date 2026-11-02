import { cn } from '../../../lib/utils'
import { translate } from '@/i18n/i18n'

type AgentIndicator = 'waiting' | 'done' | 'working' | 'idle'

type JumpBackInRowProps = {
  className?: string
  indicator: AgentIndicator
  name: string
  status: string
  desktop: string
  time: string
}

const AGENT_DOT: Record<Exclude<AgentIndicator, 'working'>, string> = {
  waiting: 'is-red',
  done: 'is-green',
  idle: 'is-muted'
}

// Waiting and done ask something of the user, so only they tint the status word (mobile parity).
const STATUS_TONE: Partial<Record<AgentIndicator, string>> = {
  waiting: 'is-waiting',
  done: 'is-done'
}

export function HomeSlide({ tapping }: { tapping: boolean }): React.JSX.Element {
  const macbookPro = translate('auto.components.mobile.slides.HomeSlide.19c212e25e', 'MacBook Pro')
  return (
    <div className="mp-device-screen">
      <div className="mp-app-topbar">
        <div className="mp-app-brand">
          <OrcaLogo />
          <span className="mp-app-brand-name">
            {translate('auto.components.mobile.slides.HomeSlide.5d94e8ddcc', 'Wakii')}
          </span>
        </div>
        <button
          type="button"
          className="mp-icon-button"
          aria-label={translate('auto.components.mobile.slides.HomeSlide.af761a0c0d', 'Settings')}
        >
          <SettingsIcon />
        </button>
      </div>

      <div className="mp-scroll-region">
        <div className="mp-home-heading is-first">
          {translate('auto.components.mobile.slides.HomeSlide.dc1f3f5535', 'Jump back in')}
        </div>
        <div className="mp-home-group">
          <JumpBackInRow
            indicator="waiting"
            name="fix-auth-redirect"
            status={translate(
              'auto.components.mobile.slides.HomeSlide.c2a0215163',
              'Waiting for input'
            )}
            desktop={macbookPro}
            time={translate('auto.components.mobile.slides.HomeSlide.0c14dac908', '2m')}
          />
          <JumpBackInRow
            className="is-tall-only"
            indicator="working"
            name="relay-reconnect-backoff"
            status={translate('auto.components.mobile.slides.HomeSlide.609517273b', 'Working')}
            desktop={macbookPro}
            time={translate('auto.components.mobile.slides.HomeSlide.005afbad3d', 'now')}
          />
        </div>

        <div className="mp-home-heading">
          {translate('auto.components.mobile.slides.HomeSlide.2f1a1d10c4', 'Desktops')}
        </div>
        <div className="mp-home-group">
          {/* The carousel's next slide is this desktop's worktree list, so the tap lands here. */}
          <div className={cn('mp-home-row', tapping && 'is-tapping')}>
            <div className="mp-home-status">
              <span className="mp-status-dot is-green" />
            </div>
            <div className="mp-home-text">
              <div className="mp-home-title">{macbookPro}</div>
              <div className="mp-home-subtitle">
                {translate(
                  'auto.components.mobile.slides.HomeSlide.04a94cadee',
                  '40 worktrees · 5 active'
                )}
              </div>
            </div>
            <div className="mp-home-trailing">
              <ChevronIcon />
            </div>
          </div>
          <div className="mp-home-row is-tall-only">
            <div className="mp-home-status">
              <span className="mp-status-dot is-muted" />
            </div>
            <div className="mp-home-text">
              <div className="mp-home-title">
                {translate('auto.components.mobile.slides.HomeSlide.b5308d5e2c', 'M1 Mini')}
              </div>
              <div className="mp-home-subtitle">
                {translate('auto.components.mobile.slides.HomeSlide.cf3f98fa3f', 'Disconnected')}
              </div>
            </div>
            <div className="mp-home-trailing">
              <ChevronIcon />
            </div>
          </div>
          <div className="mp-home-action-row is-tall-only">
            <PlusIcon />
            {translate('auto.components.mobile.slides.HomeSlide.aefd110ea5', 'Pair a desktop')}
          </div>
        </div>

        <HomeSectionRow
          icon={<ListTodoIcon />}
          title={translate('auto.components.mobile.slides.HomeSlide.a4c3f7b7aa', 'Tasks')}
          subtitle={translate(
            'auto.components.mobile.slides.HomeSlide.aa44b4a6b2',
            'Browse your issues and reviews'
          )}
        />
        <HomeSectionRow
          icon={<CalendarClockIcon />}
          title={translate('auto.components.mobile.slides.HomeSlide.eda5c8d01b', 'Automations')}
          subtitle={translate(
            'auto.components.mobile.slides.HomeSlide.cd2ad5b641',
            'Schedule agent work and view runs'
          )}
        />
      </div>

      <div className="mp-home-bottom-bar">
        <div className="mp-home-bar-button is-primary">
          <PlusIcon />
          <span>
            {translate('auto.components.mobile.slides.HomeSlide.d08ee9c466', 'New workspace')}
          </span>
        </div>
      </div>
    </div>
  )
}

function JumpBackInRow({
  className,
  indicator,
  name,
  status,
  desktop,
  time
}: JumpBackInRowProps): React.JSX.Element {
  return (
    <div className={cn('mp-home-row', className)}>
      <div className="mp-home-status">
        {indicator === 'working' ? (
          <div className="mp-wl-spinner" />
        ) : (
          <div className={cn('mp-wl-dot', AGENT_DOT[indicator])} />
        )}
      </div>
      <div className="mp-home-text">
        <div className="mp-home-title">{name}</div>
        <div className="mp-home-subtitle">
          <span className={STATUS_TONE[indicator]}>{status}</span> · {desktop}
        </div>
      </div>
      <div className="mp-home-trailing">
        {time}
        <ChevronIcon />
      </div>
    </div>
  )
}

// Phone Home's Tasks and Automations sections: a heading over a one-row group.
function HomeSectionRow({
  icon,
  title,
  subtitle
}: {
  icon: React.JSX.Element
  title: string
  subtitle: string
}): React.JSX.Element {
  return (
    <>
      <div className="mp-home-heading">{title}</div>
      <div className="mp-home-group">
        <div className="mp-home-row">
          <div className="mp-home-status">{icon}</div>
          <div className="mp-home-text">
            <div className="mp-home-title">{title}</div>
            <div className="mp-home-subtitle">{subtitle}</div>
          </div>
          <div className="mp-home-trailing">
            <ChevronIcon />
          </div>
        </div>
      </div>
    </>
  )
}

function OrcaLogo(): React.JSX.Element {
  return (
    <svg viewBox="0 0 128 128" fill="none" aria-hidden>
      <path d="M26 42 L44 88 L64 48 L84 88 L102 42" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" transform="translate(-3 -1)" />
      <circle cx="106" cy="86" r="8.5" fill="currentColor" />
    </svg>
  )
}

function SettingsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function ListTodoIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="m3 17 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </svg>
  )
}

function CalendarClockIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h5" />
      <path d="M17.5 17.5 16 16.3V14" />
      <circle cx="16" cy="16" r="6" />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}
