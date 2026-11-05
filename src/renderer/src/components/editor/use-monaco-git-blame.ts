import { languages, type editor, type IRange, type IMarkdownString } from 'monaco-editor'
import { useEffect, useRef, useState } from 'react'
import { getRuntimeGitBlame, isGitBlameSupportedForHost } from '@/runtime/runtime-git-blame-client'
import {
  getRuntimeGitBlameAtRevision,
  GitBlameRevisionUnsupportedError,
  isGitBlamePreviousSupportedForHost
} from '@/runtime/runtime-git-blame-previous-client'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import { useAppStore } from '@/store'
import { requireRuntimeTargetForFileOwner } from '@/lib/file-owner-runtime-target'
import type { GitBlameLine } from '../../../../shared/git-blame-types'
import {
  appendGitBlameHover,
  formatInlineBlameAnnotation,
  getBlameSkipReason,
  type BlameSkipReason,
  type HoverTextSink
} from './git-blame-annotation-model'
import {
  clearGitBlameCacheForFile,
  clearGitBlameCacheForWorktree,
  gitBlameCache
} from './git-blame-cache'
import { getGitBlameStrings } from './git-blame-strings'

// Re-exports keep the established import path for tests and future callers.
export { clearGitBlameCacheForFile, clearGitBlameCacheForWorktree }

const blameCache = gitBlameCache

export type UseMonacoGitBlameArgs = {
  enabled: boolean
  mountedEditor: editor.IStandaloneCodeEditor | null
  worktreeId: string | null
  worktreePath: string | null
  relativePath: string | null
  connectionId?: string | null
  content: string
  isDirty: boolean
  /**
   * GitLens-parity SF-1: when the hover card owns line hovers, the markdown
   * hover for known blame lines stays silent — the card replaces it. The
   * skip-reason markdown always answers.
   */
  suppressMarkdownHover?: boolean
}

/** Blame surface the hover overlay consumes (GitLens-parity SF-1). */
export type MonacoGitBlameApi = {
  /** The blame line painted at this editor line, if any. */
  getBlameLineAt(lineNumber: number): GitBlameLine | undefined
  /** Runtime context for lazy git reads (message body, commit diff); null outside a worktree. */
  getRuntimeContext(): RuntimeGitContext | null
  /** Non-null while the whole blame view walks a past revision. */
  blameRevision: string | null
  /** False once a host answered a revision request without the echo. */
  blamePreviousSupported: boolean
  requestBlamePrevious(previousHash: string): void
  returnBlameToHead(): void
}

type BlameView = {
  lineByNumber: Map<number, GitBlameLine>
  skipReason: BlameSkipReason | null
  isDirty: boolean
}

const OVERLAY_CLASS = 'orca-git-blame-overlay'
// 11px text on a taller line box — used to center the overlay vertically.
const OVERLAY_TEXT_LINE_BOX_PX = 16

function makeWholeLineRange(lineNumber: number): IRange {
  return { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 }
}

/**
 * Monaco ships no public MarkdownString class, so the hover builds the
 * IMarkdownString value itself using the same escaping appendText performs —
 * blame metadata stays literal text, never live markdown.
 */
function escapeMarkdownSyntaxTokens(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!>]/g, (match) => `\\${match}`)
}

function createLiteralMarkdownSink(): { value: string } & HoverTextSink {
  let value = ''
  return {
    get value() {
      return value
    },
    appendText(text: string): unknown {
      value += escapeMarkdownSyntaxTokens(text).replace(/\n/g, '\n\n')
      return undefined
    },
    appendCodeblock(code: string): unknown {
      const longestBacktickRun = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length))
      const fence = '`'.repeat(longestBacktickRun + 3)
      value += `\n${fence}\n${code}\n${fence}\n`
      return undefined
    }
  }
}

function viewFromResult(result: { lines: GitBlameLine[] }, isDirty: boolean): BlameView {
  return {
    lineByNumber: new Map(result.lines.map((line) => [line.lineNumber, line])),
    skipReason: null,
    isDirty
  }
}

export function useMonacoGitBlame(args: UseMonacoGitBlameArgs): MonacoGitBlameApi {
  const headSha = useAppStore((state) =>
    args.worktreeId ? state.gitStatusHeadByWorktree[args.worktreeId] : undefined
  )
  const activeRuntimeEnvironmentId = useAppStore(
    (state) => state.settings?.activeRuntimeEnvironmentId
  )

  const overlayRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<BlameView>({ lineByNumber: new Map(), skipReason: null, isDirty: false })
  // A revision walk is bound to one file view: the key check resets it when a
  // different file opens, without an adjust-state-on-prop-change effect.
  const [revisionState, setRevisionState] = useState<{ key: string; revision: string | null }>({
    key: '',
    revision: null
  })
  const [revisionSupported, setRevisionSupported] = useState(true)
  const viewKey = `${args.worktreeId ?? ''}\u0000${args.relativePath ?? ''}`
  const blameRevision = revisionState.key === viewKey ? revisionState.revision : null

  // Keep the live view's dirty flag in sync so cursor repaints (imperative,
  // outside React) mark the annotation stale while the buffer has unsaved edits.
  useEffect(() => {
    viewRef.current.isDirty = args.isDirty
  }, [args.isDirty])

  // One overlay div anchored to the editor DOM (right edge), moved to the
  // cursor line's scrolled-visible position. Never an injected span: Monaco
  // token spans break absolute positioning (wrong containing block), and an
  // in-flow span reflows code. Right-anchored content cannot shift the layout.
  const paintAnnotationForLine = (
    activeEditor: editor.IStandaloneCodeEditor,
    lineNumber: number
  ): void => {
    const overlay = overlayRef.current
    if (!overlay) {
      return
    }
    const view = viewRef.current
    const line = lineNumber > 0 ? view.lineByNumber.get(lineNumber) : undefined
    let content: string | null
    if (line) {
      content = formatInlineBlameAnnotation(line, {
        isDirty: view.isDirty,
        strings: getGitBlameStrings()
      })
    } else if (view.isDirty && lineNumber > 0) {
      // Spec: a newly inserted line blame has never seen reads as "You" while
      // the buffer has unsaved edits; a clean buffer only has the EOF-only
      // tail line unknown, which stays silent.
      content = formatInlineBlameAnnotation(
        {
          lineNumber,
          hash: '',
          abbreviatedHash: '',
          author: '',
          authorTime: 0,
          summary: '',
          committed: false
        },
        { isDirty: view.isDirty, strings: getGitBlameStrings() }
      )
    } else {
      content = null
    }
    const visible = content
      ? activeEditor.getScrolledVisiblePosition({
          lineNumber,
          column: activeEditor.getModel()?.getLineMaxColumn(lineNumber) ?? 1
        })
      : null
    if (content === null || !visible) {
      overlay.style.display = 'none'
      return
    }
    overlay.textContent = content
    overlay.style.top = `${visible.top + Math.max(0, Math.round(((visible.height ?? OVERLAY_TEXT_LINE_BOX_PX) - OVERLAY_TEXT_LINE_BOX_PX) / 2))}px`
    overlay.style.display = ''
  }

  // Cursor-follow is imperative on purpose: overlay repaints come from the
  // in-memory blame view — zero git calls, zero React re-renders.
  const paintHandlerRef = useRef(paintAnnotationForLine)
  paintHandlerRef.current = paintAnnotationForLine

  // Fetch effect — mount, HEAD change, save/external reload (buffer re-becomes
  // clean with new content), host and path changes.
  const cleanRevision = args.isDirty ? null : args.content
  useEffect(() => {
    const { enabled, mountedEditor, worktreeId, worktreePath, relativePath, isDirty } = args
    const activeEditor = enabled ? mountedEditor : null
    if (!activeEditor || !worktreeId || !worktreePath || !relativePath) {
      return
    }
    if (!headSha) {
      // Empty repository (unborn HEAD) — nothing to blame against, stay silent.
      return
    }

    const context = {
      target: requireRuntimeTargetForFileOwner(
        useAppStore.getState(),
        worktreeId,
        activeRuntimeEnvironmentId
      ),
      worktreeId,
      worktreePath,
      connectionId: args.connectionId ?? undefined
    } as const
    if (!isGitBlameSupportedForHost(context)) {
      return
    }

    // While typing, the existing blame view (stale-marked) is the answer —
    // keystrokes must never cost a git call.
    const existingView = viewRef.current
    if (isDirty && (existingView.lineByNumber.size > 0 || existingView.skipReason)) {
      return
    }

    // Cache key includes the clean buffer revision: a save (same HEAD, new
    // content) invalidates; a revert to an already-blamed HEAD is a hit. A
    // revision walk folds into the same slot so past-revision views cache apart.
    const revisionKey = blameRevision
      ? `${blameRevision}\u0000${cleanRevision ?? ''}`
      : (cleanRevision ?? '')
    const cached = blameCache.get(worktreeId, relativePath, headSha, revisionKey)
    if (cached) {
      viewRef.current = viewFromResult(cached, isDirty)
      paintHandlerRef.current(activeEditor, activeEditor.getPosition()?.lineNumber ?? 0)
      return
    }

    const skipReason = getBlameSkipReason(args.content)
    viewRef.current = { lineByNumber: new Map(), skipReason, isDirty }
    if (skipReason) {
      // Oversized — no git call; the hover answers with the skip reason.
      return
    }

    let requestAlive = true
    const fetch = blameRevision
      ? getRuntimeGitBlameAtRevision(context, relativePath, blameRevision)
      : getRuntimeGitBlame(context, relativePath)
    fetch
      .then((result) => {
        if (!requestAlive) {
          return
        }
        blameCache.set(worktreeId, relativePath, headSha, result, revisionKey)
        viewRef.current = viewFromResult(result, isDirty)
        paintHandlerRef.current(activeEditor, activeEditor.getPosition()?.lineNumber ?? 0)
      })
      .catch((error) => {
        if (!requestAlive) {
          return
        }
        if (error instanceof GitBlameRevisionUnsupportedError) {
          // Echo contract failed: back to HEAD silently, never render HEAD data
          // as if it were the old revision.
          setRevisionState({ key: viewKey, revision: null })
          setRevisionSupported(false)
          return
        }
        // Taxonomy is client-level: a host-unsupported answer was disabled
        // there; ordinary git failures skip this file silently while the
        // feature stays alive for the next HEAD change.
      })

    return () => {
      requestAlive = false
    }
    // `content` enters via cleanRevision: refetch on save/external reload only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    args.enabled,
    args.mountedEditor,
    args.worktreeId,
    args.worktreePath,
    args.relativePath,
    headSha,
    cleanRevision,
    activeRuntimeEnvironmentId,
    blameRevision
  ])

  // Overlay lifecycle + hover provider + subscriptions — one per editor mount.
  // Cleanup removes the overlay node, so a settings toggle (enabled flip)
  // hides it and re-enabling recreates it fresh on the current editor DOM.
  useEffect(() => {
    const activeEditor = args.enabled ? args.mountedEditor : null
    if (!activeEditor) {
      return
    }
    const domNode = activeEditor.getDomNode()
    if (!domNode) {
      return
    }
    const overlay = document.createElement('div')
    overlay.className = OVERLAY_CLASS
    overlay.style.display = 'none'
    domNode.appendChild(overlay)
    overlayRef.current = overlay

    const provideHover = (
      model: editor.ITextModel,
      position: { lineNumber: number }
    ): { contents: IMarkdownString[]; range: IRange } | null => {
      if (model !== activeEditor.getModel()) {
        // Only the surface this provider was mounted for may answer.
        return null
      }
      const view = viewRef.current
      const strings = getGitBlameStrings()
      const sink = createLiteralMarkdownSink()
      const line = position.lineNumber > 0 ? view.lineByNumber.get(position.lineNumber) : undefined
      if (line) {
        if (args.suppressMarkdownHover) {
          // The editorial hover card owns known-line hovers now.
          return null
        }
        appendGitBlameHover(sink, line, strings)
        return { contents: [sink], range: makeWholeLineRange(position.lineNumber) }
      }
      if (view.skipReason) {
        sink.appendText(
          view.skipReason === 'file-too-large'
            ? strings.skipReasonTooLarge
            : strings.skipReasonTooManyLines
        )
        return { contents: [sink], range: makeWholeLineRange(position.lineNumber) }
      }
      return null
    }

    const hoverDisposable = languages.registerHoverProvider('*', {
      provideHover: (model, position, _token) => provideHover(model, position)
    })
    const cursorDisposable = activeEditor.onDidChangeCursorPosition((event) => {
      paintHandlerRef.current(activeEditor, event.position.lineNumber)
    })
    // Scroll and layout move the scrolled-visible position of the cursor line
    // without a cursor event — re-pin the overlay or it drifts off its line.
    const repaintCurrentLine = (): void => {
      paintHandlerRef.current(activeEditor, activeEditor.getPosition()?.lineNumber ?? 0)
    }
    const scrollDisposable = activeEditor.onDidScrollChange(repaintCurrentLine)
    const layoutDisposable = activeEditor.onDidLayoutChange(repaintCurrentLine)
    repaintCurrentLine()

    return () => {
      hoverDisposable.dispose()
      cursorDisposable.dispose()
      scrollDisposable.dispose()
      layoutDisposable.dispose()
      overlay.remove()
      overlayRef.current = null
    }
  }, [args.enabled, args.mountedEditor, args.suppressMarkdownHover])

  // Latest values behind a stable API object: the hover overlay registers
  // editor listeners once and must not go stale after file switches.
  const latestRef = useRef({ args, activeRuntimeEnvironmentId, revisionSupported })
  latestRef.current = { args, activeRuntimeEnvironmentId, revisionSupported }

  const api = useRef<MonacoGitBlameApi>({
    getBlameLineAt: () => undefined,
    getRuntimeContext: () => null,
    blameRevision: null,
    blamePreviousSupported: true,
    requestBlamePrevious: () => undefined,
    returnBlameToHead: () => undefined
  }).current

  api.getBlameLineAt = (lineNumber: number): GitBlameLine | undefined =>
    lineNumber > 0 ? viewRef.current.lineByNumber.get(lineNumber) : undefined
  api.getRuntimeContext = (): RuntimeGitContext | null => {
    const { args: currentArgs, activeRuntimeEnvironmentId: envId } = latestRef.current
    const { worktreeId, worktreePath } = currentArgs
    if (!worktreeId || !worktreePath) {
      return null
    }
    return {
      target: requireRuntimeTargetForFileOwner(useAppStore.getState(), worktreeId, envId),
      worktreeId,
      worktreePath,
      connectionId: currentArgs.connectionId ?? undefined
    }
  }
  api.requestBlamePrevious = (previousHash: string): void => {
    const {
      args: currentArgs,
      activeRuntimeEnvironmentId: envId,
      revisionSupported: supported
    } = latestRef.current
    const worktreeId = currentArgs.worktreeId
    if (!worktreeId || !supported) {
      return
    }
    const context = {
      target: requireRuntimeTargetForFileOwner(useAppStore.getState(), worktreeId, envId),
      worktreeId,
      worktreePath: currentArgs.worktreePath ?? '',
      connectionId: currentArgs.connectionId ?? undefined
    } as const
    if (!isGitBlamePreviousSupportedForHost(context)) {
      setRevisionSupported(false)
      return
    }
    setRevisionState({ key: viewKey, revision: previousHash })
  }
  api.returnBlameToHead = (): void => {
    setRevisionState({ key: viewKey, revision: null })
  }

  return {
    getBlameLineAt: api.getBlameLineAt,
    getRuntimeContext: api.getRuntimeContext,
    blameRevision,
    blamePreviousSupported: revisionSupported,
    requestBlamePrevious: api.requestBlamePrevious,
    returnBlameToHead: api.returnBlameToHead
  }
}
