import { useEffect, useRef, useState } from 'react'
import type { SearchFileResult } from '../../../../shared/code-search-types'
import {
  runReplaceAllAcrossFiles,
  type ReplaceAllIo,
  type ReplaceAllRunSummary
} from './search-replace-all-runner'
import type { SearchReplaceFlags } from './search-replace-engine'

export type FileSearchReplacePreviewParams = {
  open: boolean
  candidates: SearchFileResult[]
  query: string
  replaceTerm: string
  flags: SearchReplaceFlags
  buildIo: () => ReplaceAllIo
}

export type FileSearchReplacePreview = {
  loading: boolean
  summary: ReplaceAllRunSummary | null
  dismiss: () => void
}

// Why: the preview is a real dry-run over fresh disk content — counts come
// from re-derivation, never from the stored search match list (P0).
export function useFileSearchReplacePreview(params: FileSearchReplacePreviewParams): FileSearchReplacePreview {
  const { open } = params
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<ReplaceAllRunSummary | null>(null)
  const runIdRef = useRef(0)
  const paramsRef = useRef(params)
  paramsRef.current = params

  useEffect(() => {
    if (!open) {
      return
    }
    const runId = ++runIdRef.current
    setLoading(true)
    setSummary(null)
    const { candidates, query, replaceTerm, flags, buildIo } = paramsRef.current
    // Why: buildIo captures the workspace owner — an ownership change between
    // the button guard and this effect must degrade to an empty modal, not
    // crash the renderer from inside the effect.
    Promise.resolve()
      .then(() =>
        runReplaceAllAcrossFiles({
          candidates,
          query,
          replaceTerm,
          flags,
          io: buildIo(),
          cancelRequested: () => false,
          mode: 'dry-run'
        })
      )
      .then((result) => {
        if (runIdRef.current === runId) {
          setSummary(result)
        }
      })
      .catch(() => {
        if (runIdRef.current === runId) {
          setSummary(null)
        }
      })
      .finally(() => {
        if (runIdRef.current === runId) {
          setLoading(false)
        }
      })
  }, [open])

  const dismiss = () => {
    runIdRef.current += 1
    setSummary(null)
    setLoading(false)
  }

  return { loading, summary, dismiss }
}
