import React from 'react'
import {
  Search as SearchIcon,
  CaseSensitive,
  WholeWord,
  Regex,
  X,
  Loader2,
  Replace,
  ReplaceAll,
  Undo2,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleButton } from './SearchResultItems'
import { translate } from '@/i18n/i18n'
import { ImeInput } from '@/lib/ime-text-field'

export type ReplaceDisabledReason =
  | 'no-results'
  | 'truncated'
  | 'cap'
  | 'invalid-regex'
  | 'running'

export type SearchQueryRowProps = {
  inputRef: React.Ref<HTMLInputElement>
  query: string
  loading: boolean
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
  history: string[]
  historyOpen: boolean
  replaceVisible: boolean
  replaceQuery: string
  replaceDisabledReason: ReplaceDisabledReason | null
  hasReplaceUndo: boolean
  onReplaceUndo: () => void
  onQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onClearSearch: () => void
  onToggleCaseSensitive: () => void
  onToggleWholeWord: () => void
  onToggleRegex: () => void
  onToggleReplaceVisible: () => void
  onReplaceQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onReplaceAll: () => void
  onHistoryFocus: () => void
  onHistoryBlur: () => void
  onHistorySelect: (query: string) => void
}

export function SearchQueryRow({
  inputRef,
  query,
  loading,
  caseSensitive,
  wholeWord,
  useRegex,
  history,
  historyOpen,
  replaceVisible,
  replaceQuery,
  replaceDisabledReason,
  hasReplaceUndo,
  onReplaceUndo,
  onQueryChange,
  onKeyDown,
  onClearSearch,
  onToggleCaseSensitive,
  onToggleWholeWord,
  onToggleRegex,
  onToggleReplaceVisible,
  onReplaceQueryChange,
  onReplaceAll,
  onHistoryFocus,
  onHistoryBlur,
  onHistorySelect
}: SearchQueryRowProps): React.JSX.Element {
  return (
    <div className="relative" data-testid="search-query-row">
      <div
        className="flex h-7 items-center gap-1 rounded-sm border border-border bg-input/50 px-1.5 focus-within:border-ring"
        data-ignore-file-explorer-keys="true"
      >
        <button
          type="button"
          className="flex shrink-0 items-center rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={translate(
            'auto.components.right.sidebar.SearchQueryRow.toggleReplaceLabel',
            'Toggle Replace'
          )}
          aria-expanded={replaceVisible}
          data-testid="search-replace-toggle"
          onClick={onToggleReplaceVisible}
        >
          {replaceVisible ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <ImeInput
          data-file-search-input="true"
          ref={inputRef}
          type="text"
          className="min-w-0 flex-1 bg-transparent py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
          aria-label={translate(
            'auto.components.right.sidebar.SearchQueryRow.queryLabel',
            'Search files'
          )}
          placeholder={translate('auto.components.right.sidebar.SearchHeader.693cbeadd0', 'Search')}
          value={query}
          onChange={onQueryChange}
          onKeyDown={onKeyDown}
          onFocus={onHistoryFocus}
          onBlur={onHistoryBlur}
          spellCheck={false}
        />
        {loading ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-auto w-auto rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={translate(
              'auto.components.right.sidebar.SearchQueryRow.clearLabel',
              'Clear search'
            )}
            onClick={onClearSearch}
          >
            <X className="size-3" />
          </Button>
        ) : null}
        <ToggleButton
          active={caseSensitive}
          onClick={onToggleCaseSensitive}
          title={translate('auto.components.right.sidebar.SearchHeader.464ae3974f', 'Match Case')}
        >
          <CaseSensitive className="size-3.5" />
        </ToggleButton>
        <ToggleButton
          active={wholeWord}
          onClick={onToggleWholeWord}
          title={translate(
            'auto.components.right.sidebar.SearchHeader.4567e6e0b6',
            'Match Whole Word'
          )}
        >
          <WholeWord className="size-3.5" />
        </ToggleButton>
        <ToggleButton
          active={useRegex}
          onClick={onToggleRegex}
          title={translate(
            'auto.components.right.sidebar.SearchHeader.6234a5ef85',
            'Use Regular Expression'
          )}
        >
          <Regex className="size-3.5" />
        </ToggleButton>
      </div>
      {replaceVisible ? (
        <div
          className="mt-1 flex h-7 items-center gap-1 rounded-sm border border-border bg-input/50 px-1.5 focus-within:border-ring"
          data-ignore-file-explorer-keys="true"
        >
          <Replace className="size-3.5 shrink-0 text-muted-foreground" />
          <ImeInput
            type="text"
            className="min-w-0 flex-1 bg-transparent py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
            aria-label={translate(
              'auto.components.right.sidebar.SearchQueryRow.replaceLabel',
              'Replace'
            )}
            placeholder={translate(
              'auto.components.right.sidebar.SearchQueryRow.replaceLabel',
              'Replace'
            )}
            value={replaceQuery}
            onChange={onReplaceQueryChange}
            spellCheck={false}
            data-testid="search-replace-input"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            aria-label={translate(
              'auto.components.right.sidebar.SearchQueryRow.replaceAllLabel',
              'Replace All'
            )}
            title={translate(
              'auto.components.right.sidebar.SearchQueryRow.replaceAllLabel',
              'Replace All'
            )}
            disabled={replaceDisabledReason !== null}
            aria-disabled={replaceDisabledReason !== null}
            onClick={() => {
              if (replaceDisabledReason === null) {
                onReplaceAll()
              }
            }}
            data-testid="search-replace-all-button"
          >
            {replaceDisabledReason === 'running' ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ReplaceAll className="size-3.5" />
            )}
          </Button>
          {hasReplaceUndo ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              aria-label={translate(
                'auto.components.right.sidebar.SearchQueryRow.undoReplaceLabel',
                'Undo Replace All'
              )}
              title={translate(
                'auto.components.right.sidebar.SearchQueryRow.undoReplaceLabel',
                'Undo Replace All'
              )}
              disabled={replaceDisabledReason === 'running'}
              aria-disabled={replaceDisabledReason === 'running'}
              onClick={onReplaceUndo}
              data-testid="search-replace-undo"
            >
              <Undo2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ) : null}
      {replaceVisible && replaceDisabledReason === 'invalid-regex' ? (
        <div
          className="mt-1 text-[11px] text-destructive"
          data-testid="search-replace-block-message"
        >
          {translate(
            'auto.components.right.sidebar.SearchQueryRow.invalidRegexMessage',
            'Invalid regular expression'
          )}
        </div>
      ) : null}
      {historyOpen && history.length > 0 ? (
        <div
          data-testid="search-history-dropdown"
          className="absolute inset-x-0 top-full z-10 mt-1 rounded-sm border border-border bg-popover py-1 shadow-md"
        >
          {history.map((entry) => (
            <button
              key={entry}
              type="button"
              data-testid="search-history-item"
              // Why: keep input focus on mousedown so the blur-close timer
              // never races the click that fills the query back in.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onHistorySelect(entry)}
              className="block w-full truncate px-2 py-1 text-left text-xs text-foreground hover:bg-accent"
            >
              {entry}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
