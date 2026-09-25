import { languages, type editor, type IRange, type IMarkdownString } from 'monaco-editor'
import { useEffect, useRef } from 'react'
import {
  getRuntimeGitBlame,
  isGitBlameSupportedForHost
} from '@/runtime/runtime-git-blame-client'
import { useAppStore } from '@/store'
import type { GitBlameLine } from '../../../../shared/git-blame-types'
import {
  appendGitBlameHover,
  formatInlineBlameAnnotation,
  getBlameSkipReason,
  GitBlameCache,
  type BlameSkipReason,
  type HoverTextSink
} from './git-blame-annotation-model'
import { getGitBlameStrings } from './git-blame-strings'

// Module-level: blame survives editor remounts and is shared across surfaces.
const blameCache = new GitBlameCache()

/** Eviction hook for worktree removal — wired by the store teardown flow. */
export function clearGitBlameCacheForWorktree(worktreeId: string): void {
  blameCache.clearWorktree(worktreeId)
}

/** Eviction hook for tab close — wired by the editor teardown flow. */
export function clearGitBlameCacheForFile(worktreeId: string, filePath: string): void {
  blameCache.clearFile(worktreeId, filePath)
}

export type UseMonacoGitBlameArgs = {
  enabled: boolean
  mountedEditor: editor.IStandaloneCodeEditor | null
  worktreeId: string | null
  worktreePath: string | null
  relativePath: string | null
  connectionId?: string | null
  content: string
  isDirty: boolean
}

type BlameView = {
  lineByNumber: Map<number, GitBlameLine>
  skipReason: BlameSkipReason | null
  isDirty: boolean
}

const ANNOTATION_CLASS = 'orca-git-blame-annotation'

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

export function useMonacoGitBlame(args: UseMonacoGitBlameArgs): void {
  const headSha = useAppStore((state) =>
    args.worktreeId ? state.gitStatusHeadByWorktree[args.worktreeId] : undefined
  )
  const activeRuntimeEnvironmentId = useAppStore(
    (state) => state.settings?.activeRuntimeEnvironmentId
  )

  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const viewRef = useRef<BlameView>({ lineByNumber: new Map(), skipReason: null, isDirty: false })

  // Keep the live view's dirty flag in sync so cursor repaints (imperative,
  // outside React) mark the annotation stale while the buffer has unsaved edits.
  useEffect(() => {
    viewRef.current.isDirty = args.isDirty
  }, [args.isDirty])

  const applyDecorationForLine = (lineNumber: number): void => {
    const collection = decorationsRef.current
    if (!collection) {
      return
    }
    const view = viewRef.current
    const line = lineNumber > 0 ? view.lineByNumber.get(lineNumber) : undefined
    if (!line) {
      // Spec: a newly inserted line blame has never seen reads as "You" while
      // the buffer has unsaved edits; a clean buffer only has the EOF-only
      // tail line unknown, which stays silent.
      if (!view.isDirty || lineNumber <= 0) {
        collection.set([])
        return
      }
      collection.set([
        {
          range: makeWholeLineRange(lineNumber),
          options: {
            showIfCollapsed: true,
            after: {
              content: ` ${formatInlineBlameAnnotation(
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
              )}`,
              inlineClassName: ANNOTATION_CLASS
            }
          }
        }
      ])
      return
    }
    const content = formatInlineBlameAnnotation(line, {
      isDirty: view.isDirty,
      strings: getGitBlameStrings()
    })
    collection.set([
      {
        range: makeWholeLineRange(lineNumber),
        options: {
          // Why: a whole-line range at column 1 is collapsed, and Monaco hides
          // injected text on collapsed ranges unless this flag is set.
          showIfCollapsed: true,
          after: { content: ` ${content}`, inlineClassName: ANNOTATION_CLASS }
        }
      }
    ])
  }

  // Cursor-follow is imperative on purpose: decoration repaints come from the
  // in-memory blame view — zero git calls, zero React re-renders.
  const cursorHandlerRef = useRef(applyDecorationForLine)
  cursorHandlerRef.current = applyDecorationForLine

  // Fetch effect — mount, HEAD change, save/external reload (buffer re-becomes
  // clean with new content), host and path changes.
  const cleanRevision = args.isDirty ? null : args.content
  useEffect(() => {
    const { enabled, mountedEditor, worktreeId, worktreePath, relativePath, isDirty } = args
    const activeEditor = enabled ? mountedEditor : null
    if (!activeEditor || !worktreeId || !worktreePath || !relativePath) {
      return
    }
    if (!decorationsRef.current) {
      decorationsRef.current = activeEditor.createDecorationsCollection()
    }
    if (!headSha) {
      // Empty repository (unborn HEAD) — nothing to blame against, stay silent.
      return
    }

    const context = {
      settings: { activeRuntimeEnvironmentId },
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
    // content) invalidates; a revert to an already-blamed HEAD is a hit.
    const cached = blameCache.get(worktreeId, relativePath, headSha, cleanRevision ?? '')
    if (cached) {
      viewRef.current = viewFromResult(cached, isDirty)
      applyDecorationForLine(activeEditor.getPosition()?.lineNumber ?? 0)
      return
    }

    const skipReason = getBlameSkipReason(args.content)
    viewRef.current = { lineByNumber: new Map(), skipReason, isDirty }
    if (skipReason) {
      // Oversized — no git call; the hover answers with the skip reason.
      return
    }

    let requestAlive = true
    getRuntimeGitBlame(context, relativePath)
      .then((result) => {
        if (!requestAlive) {
          return
        }
        blameCache.set(worktreeId, relativePath, headSha, result, cleanRevision ?? '')
        viewRef.current = viewFromResult(result, isDirty)
        applyDecorationForLine(activeEditor.getPosition()?.lineNumber ?? 0)
      })
      .catch(() => {
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
    activeRuntimeEnvironmentId
  ])

  // Hover provider + cursor subscription — one registration per editor mount.
  useEffect(() => {
    const activeEditor = args.enabled ? args.mountedEditor : null
    if (!activeEditor) {
      return
    }

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
      cursorHandlerRef.current(event.position.lineNumber)
    })

    return () => {
      hoverDisposable.dispose()
      cursorDisposable.dispose()
    }
  }, [args.enabled, args.mountedEditor])

  // Clear the painted annotation when the feature turns off.
  useEffect(() => {
    if (!args.enabled) {
      decorationsRef.current?.set([])
    }
  }, [args.enabled])
}
