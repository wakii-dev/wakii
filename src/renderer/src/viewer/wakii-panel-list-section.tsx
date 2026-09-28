import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * One collapsible list section in the side panel, shared by acceptance/tests/notes.
 * ≤3 items open by default, more start collapsed; state is local and resets when
 * the selected node changes (parent keys this component by node id).
 */
export function WakiiPanelListSection({
  label,
  items,
  defaultOpen
}: {
  label: string
  items: string[]
  defaultOpen: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="wakii-p-section">
      <button
        type="button"
        className="wakii-p-evh wakii-p-section-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          {label} <span className="wakii-p-count">{`(${items.length})`}</span>
        </span>
        <svg
          viewBox="0 0 24 24"
          width={12}
          height={12}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={cn('wakii-p-chevron', open && 'wakii-p-chevron-open')}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div>
          {items.map((item, i) => (
            <div key={`${item}:${i}`} className="wakii-p-list-item">
              <span className="wakii-p-bullet">–</span>
              {item}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
