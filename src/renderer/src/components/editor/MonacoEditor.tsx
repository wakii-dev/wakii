/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: selection annotations are synchronized from Monaco editor selection and layout APIs, not derived React props. */
import React, { useRef, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import type { MarkdownDocument } from '../../../../shared/filesystem-entry-types'
import { useAppStore } from '@/store'
import '@/lib/monaco-setup'
import { computeEditorFontSize, resolveEditorFontFamily } from '@/lib/editor-font-zoom'

import { useContextualCopySetup } from './useContextualCopySetup'
import { MonacoGutterContextMenu } from './MonacoGutterContextMenu'
import { isLinuxUserAgent } from '../terminal-pane/pane-helpers'
import { MAX_TOKENIZATION_LINE_LENGTH } from '@/lib/monaco-languages/monarch-embed-entry-budget'
import { buildFileEditorWordWrapOptions } from './file-editor-word-wrap-options'
import { toEditorModelUri } from './editor-model-uri'
import { getEditorModelOwnerKey } from './editor-model-owner'
import { getMonacoAutoHeightForContent, isMonacoAutoHeightCapped } from './monaco-auto-height'
import { monacoFindOptions } from './monaco-find-options'
import { useMonacoRevealScheduler } from './use-monaco-reveal-scheduler'
import type { MonacoContentSyncMode } from './monaco-content-sync'
import { useMonacoContentSyncBridge } from './use-monaco-content-sync-bridge'
import { useMonacoMarkdownAnnotations } from './use-monaco-markdown-annotations'
import { useMonacoEditorDecorations } from './use-monaco-editor-decorations'
import { useMonacoEditorMount } from './use-monaco-editor-mount'
import { EditorBreadcrumbs } from './EditorBreadcrumbs'
import { QUICK_OUTLINE_EDITOR_ATTRIBUTE, hasQuickOutlineSymbols } from '@/lib/quick-outline-editor-target'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { snapshotMonacoViewState } from './monaco-view-state-persistence'
import { MonacoMarkdownAnnotationOverlay } from './MonacoMarkdownAnnotationOverlay'
import { getWorktreeMapFromState } from '@/store/selectors'
import { getConnectionId } from '@/lib/connection-context'
import { useMonacoGitBlame } from './use-monaco-git-blame'

type MonacoEditorProps = {
  fileId: string
  filePath: string
  viewStateKey: string
  // Why: identifies the pane for explicit open focus handoffs; omit on surfaces that never receive one.
  viewStateId?: string
  relativePath: string
  content: string
  language: string
  onContentChange: (content: string) => void
  onSave: (content: string) => void
  revealLine?: number
  revealColumn?: number
  revealMatchLength?: number
  markdownDocuments?: MarkdownDocument[]
  worktreeId?: string
  markdownAnnotationsEnabled?: boolean
  conflictDecorationsEnabled?: boolean
  // Why opt-in: only surfaces with a real worktree file context (edit surface) show blame;
  // diff/conflict/preview surfaces stay annotation-free.
  inlineBlameEnabled?: boolean
  // Why here: dirty lives on the open tab, not the editor model; blame uses it to skip fetches while typing.
  isDirty?: boolean
  readOnly?: boolean
  liveTail?: boolean
  autoHeight?: boolean
}

export default function MonacoEditor({
  fileId,
  filePath,
  viewStateKey,
  viewStateId,
  relativePath,
  content,
  language,
  onContentChange,
  onSave,
  revealLine,
  revealColumn,
  revealMatchLength,
  markdownDocuments,
  worktreeId,
  markdownAnnotationsEnabled = false,
  conflictDecorationsEnabled = false,
  inlineBlameEnabled = false,
  isDirty = false,
  readOnly = false,
  liveTail = false,
  autoHeight = false
}: MonacoEditorProps): React.JSX.Element {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const editorContainerRef = useRef<HTMLDivElement | null>(null)
  const [mountedEditor, setMountedEditor] = useState<editor.IStandaloneCodeEditor | null>(null)
  const [autoHeightContentHeight, setAutoHeightContentHeight] = useState<number | null>(null)
  const languageRef = useRef(language)
  languageRef.current = language
  const unregisterFileSearchSelectionRef = useRef<(() => void) | null>(null)
  const { setupCopy, toastNode } = useContextualCopySetup()
  // Why: hold the throttle timer in a ref so unmount cleanup can cancel a pending write before snapshotting the final scroll position.
  const scrollThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const propsRef = useRef({ relativePath, language, onSave, onContentChange })
  // Why: assign during render so the ref is current before any handler reads it (a useEffect would leave a one-render stale window).
  propsRef.current = { relativePath, language, onSave, onContentChange }
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  const contentSyncModeRef = useRef<MonacoContentSyncMode>('undoable')
  contentSyncModeRef.current = readOnly && liveTail ? 'read-only-live-tail' : 'undoable'

  const settings = useAppStore((s) => s.settings)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const setPendingEditorReveal = useAppStore((s) => s.setPendingEditorReveal)
  const setEditorCursorLine = useAppStore((s) => s.setEditorCursorLine)
  const revealInExplorer = useAppStore((s) => s.revealInExplorer)
  const editorFontSize = computeEditorFontSize(
    settings?.terminalFontSize ?? 13,
    editorFontZoomLevel
  )
  const editorFontFamily = resolveEditorFontFamily(settings)
  const editorWordWrap = settings?.editorWordWrap
  const modelOwnerKey = useAppStore((state) => {
    const file = state.openFiles?.find((entry) => entry.id === fileId)
    return file
      ? getEditorModelOwnerKey(file, state)
      : JSON.stringify([null, `unresolved:${fileId}`])
  })
  const modelUri = useMemo(
    () => toEditorModelUri(filePath, modelOwnerKey),
    [filePath, modelOwnerKey]
  )
  const estimatedAutoHeight = useMemo(() => {
    if (!autoHeight) {
      return null
    }
    return getMonacoAutoHeightForContent(content, Math.ceil(editorFontSize * 1.45))
  }, [autoHeight, content, editorFontSize])
  const renderedEditorHeight = autoHeight
    ? (autoHeightContentHeight ?? estimatedAutoHeight ?? 80)
    : null
  const autoHeightLineHeight = Math.ceil(editorFontSize * 1.45)
  const autoHeightUsesInternalScroll =
    autoHeight && isMonacoAutoHeightCapped(renderedEditorHeight, autoHeightLineHeight)
  // Why: @monaco-editor/react skips its value→model sync on the first post-remount render, so retained models need an explicit sync or they show stale text.
  // Invariant: the mount path must read `contentRef.current` (guaranteed latest), never `lastSyncedContentRef.current` (may be stale pre-mount).
  const contentRef = useRef(content)
  contentRef.current = content
  // Gutter context menu state
  const [gutterMenuOpen, setGutterMenuOpen] = useState(false)
  const [gutterMenuPoint, setGutterMenuPoint] = useState({ x: 0, y: 0 })
  const [gutterMenuLine, setGutterMenuLine] = useState(1)
  const isDark = useDocumentDarkTheme()

  const { queueReveal, cancelScheduledReveal, clearTransientRevealHighlight } =
    useMonacoRevealScheduler()
  const contentSync = useMonacoContentSyncBridge({
    editorRef,
    content,
    contentRef,
    contentSyncModeRef,
    modelKey: modelUri,
    onContentChange
  })
  const annotations = useMonacoMarkdownAnnotations({
    mountedEditor,
    editorContainerRef,
    relativePath,
    content,
    language,
    worktreeId,
    markdownAnnotationsEnabled
  })

  // Why useLayoutEffect: cleanup runs before @monaco-editor/react disposes the editor, so getScrollTop() still reads valid state on unmount.
  useLayoutEffect(() => {
    return () => {
      // Why: cancel the pending throttled write so it can't fire after this snapshot and overwrite the final position with a stale value.
      if (scrollThrottleTimerRef.current !== null) {
        clearTimeout(scrollThrottleTimerRef.current)
        scrollThrottleTimerRef.current = null
      }
      snapshotMonacoViewState(editorRef, viewStateKey)
      cancelScheduledReveal()
      clearTransientRevealHighlight()
      unregisterFileSearchSelectionRef.current?.()
      unregisterFileSearchSelectionRef.current = null
    }
  }, [cancelScheduledReveal, clearTransientRevealHighlight, modelUri, viewStateKey])

  // Update editor options when settings change
  useEffect(() => {
    if (!editorRef.current) {
      return
    }
    editorRef.current.updateOptions({
      fontSize: editorFontSize,
      fontFamily: editorFontFamily,
      ...buildFileEditorWordWrapOptions(editorWordWrap),
      cursorSmoothCaretAnimation: settings?.editorCursorSmoothCaretAnimation ?? 'on',
      renderWhitespace: settings?.editorRenderWhitespace ?? 'selection',
      // Keep a retained Monaco instance aligned when a tab changes between
      // a read-only surface and a normal editable file.
      readOnly
    })
  }, [
    editorFontFamily,
    editorFontSize,
    editorWordWrap,
    readOnly,
    settings?.editorCursorSmoothCaretAnimation,
    settings?.editorRenderWhitespace
  ])

  const decorations = useMonacoEditorDecorations({
    editorRef,
    mountedEditor,
    content,
    language,
    markdownDocuments,
    conflictDecorationsEnabled
  })

  // Why store-select: PTY activity replaces worktree metadata; subscribe by id like markdown documents do.
  const blameWorktreePath = useAppStore((s) =>
    worktreeId ? (getWorktreeMapFromState(s).get(worktreeId)?.path ?? null) : null
  )

  useMonacoGitBlame({
    enabled: inlineBlameEnabled && (settings?.editorInlineBlameEnabled ?? true),
    mountedEditor,
    worktreeId: worktreeId ?? null,
    worktreePath: blameWorktreePath,
    relativePath,
    connectionId: worktreeId ? getConnectionId(worktreeId) : null,
    content,
    isDirty
  })

  const handleMount = useMonacoEditorMount({
    fileId,
    filePath,
    modelOwnerKey,
    viewStateKey,
    viewStateId,
    worktreeId,
    autoHeight,
    autoHeightLineHeight,
    editorRef,
    editorContainerRef,
    languageRef,
    propsRef,
    readOnlyRef,
    scrollThrottleTimerRef,
    unregisterFileSearchSelectionRef,
    setMountedEditor,
    setAutoHeightContentHeight,
    setEditorCursorLine,
    setupCopy,
    queueReveal,
    contentSync,
    decorations,
    annotations,
    gutterMenu: { setGutterMenuOpen, setGutterMenuPoint, setGutterMenuLine }
  })

  // Navigate to line and highlight match when requested (for already-mounted editor)
  useEffect(() => {
    if (!revealLine || !editorRef.current) {
      return
    }
    queueReveal(editorRef.current, revealLine, revealColumn ?? 1, revealMatchLength ?? 0, () => {
      // Why: clear the pending payload only after the queued reveal runs, so navigation isn't lost if the editor unmounts first.
      setPendingEditorReveal(null)
    })
  }, [queueReveal, revealLine, revealColumn, revealMatchLength, setPendingEditorReveal])

  return (
    <div
      ref={editorContainerRef}
      className={
        autoHeight ? 'relative flex flex-col' : 'relative flex h-full flex-col'
      }
      style={renderedEditorHeight === null ? undefined : { height: renderedEditorHeight }}
      // Why: shortcut eaters (floating panel, markdown preview) yield Mod+Shift+O to
      // Monaco's built-in quick outline only when the target lives in a symbol-provider editor.
      {...(hasQuickOutlineSymbols(language) ? { [QUICK_OUTLINE_EDITOR_ATTRIBUTE]: 'true' } : {})}
    >
      {/* Why gated on !autoHeight: the inline-overview pin renders compact excerpts, not file surfaces. */}
      {!autoHeight && (settings?.editorBreadcrumbsEnabled ?? true) ? (
        <EditorBreadcrumbs
          filePath={filePath}
          relativePath={relativePath}
          worktreeId={worktreeId}
          onReveal={revealInExplorer}
        />
      ) : null}
      <div className="relative min-h-0 flex-1">
        <MonacoMarkdownAnnotationOverlay
        shouldShowMarkdownAnnotations={annotations.shouldShowMarkdownAnnotations}
        commentPopover={annotations.commentPopover}
        setCommentPopover={annotations.setCommentPopover}
        selectionAnnotationTarget={annotations.selectionAnnotationTarget}
        setSelectionAnnotationTarget={annotations.setSelectionAnnotationTarget}
        onSubmitMarkdownComment={annotations.handleSubmitMarkdownComment}
      />
      <Editor
        key={modelUri}
        height={renderedEditorHeight === null ? '100%' : `${renderedEditorHeight}px`}
        language={language}
        // Why: defaultValue, not controlled value — Orca owns post-mount content sync; a controlled path would double setValue.
        defaultValue={content}
        theme={isDark ? 'vs-dark' : 'vs'}
        onChange={contentSync.handleChange}
        onMount={handleMount}
        options={{
          dropIntoEditor: { enabled: false },
          // `IGlobalEditorOptions`, not per-editor: setting it here pins it for every
          // Monaco surface (diff, Peek) too, so this is the only site that needs it.
          // Defense-in-depth only — it does NOT guard the Monarch embed recursion,
          // which overflowed at ~17_000 chars, under this cap. See the budget module.
          maxTokenizationLineLength: MAX_TOKENIZATION_LINE_LENGTH,
          // Why: only the file editor honors this; Monaco 0.55 DiffEditor hard-overrides minimap.enabled=false on sub-editors (see diffEditorEditors._adjustOptionsForSubEditor).
          // Why `?? true`: pre-hydration renders must not flash the minimap off before settings arrive.
          minimap: { enabled: settings?.editorMinimapEnabled ?? true },
          // Why: sticky scroll defaults off (VS Code parity is opt-in here); diff editors pin it separately.
          stickyScroll: { enabled: settings?.editorStickyScroll ?? false },
          // Why explicit: pin VS Code-parity suggest behavior on the file editor (Monaco defaults
          // match today; explicit values guarantee it survives Monaco upgrades).
          quickSuggestions: { other: 'on', comments: 'off', strings: 'off' },
          wordBasedSuggestions: 'currentDocument',
          snippetSuggestions: 'inline',
          // Why explicit: bracket colorization is Monaco's model default today (textModelDefaults
          // enabled:true); pinning it here guarantees the VS Code-parity visuals survive upgrades.
          bracketPairColorization: { enabled: true },
          cursorSmoothCaretAnimation: settings?.editorCursorSmoothCaretAnimation ?? 'on',
          renderWhitespace: settings?.editorRenderWhitespace ?? 'selection',
          scrollBeyondLastLine: false,
          ...buildFileEditorWordWrapOptions(editorWordWrap),
          fontSize: editorFontSize,
          fontFamily: editorFontFamily,
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          automaticLayout: true,
          tabSize: 2,
          readOnly,
          scrollbar: autoHeight
            ? {
                vertical: autoHeightUsesInternalScroll ? 'auto' : 'hidden',
                handleMouseWheel: autoHeightUsesInternalScroll
              }
            : undefined,
          smoothScrolling: true,
          padding: { top: 0 },
          find: monacoFindOptions,
          // Why: Monaco owns its rendered line surface, so align its selection-clipboard with the app opt-out (the global DOM hook can't).
          selectionClipboard: settings?.primarySelectionMiddleClickPaste ?? isLinuxUserAgent()
        }}
        // Why the helper: `@monaco-editor/react` calls `Uri.parse` on this, which mis-reads a Windows drive path as its own scheme.
        path={modelUri}
        // Why: Orca owns cursor/scroll restoration, so disable @monaco-editor/react's competing view-state Map.
        saveViewState={false}
        keepCurrentModel
      />
      </div>

      {toastNode}
      <MonacoGutterContextMenu
        open={gutterMenuOpen}
        onOpenChange={setGutterMenuOpen}
        point={gutterMenuPoint}
        line={gutterMenuLine}
        filePath={filePath}
        relativePath={relativePath}
      />
    </div>
  )
}
