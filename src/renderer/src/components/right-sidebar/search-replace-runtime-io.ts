import { recordSelfWrite, clearSelfWrite, SELF_WRITE_REMOTE_TTL_MS } from '@/components/editor/editor-self-write-registry'
import {
  readRuntimeFileContent
} from '@/runtime/runtime-file-read-client'
import { statRuntimePath } from '@/runtime/runtime-file-metadata-client'
import { writeRuntimeFile } from '@/runtime/runtime-file-mutation-client'
import { getRelativePathInsideWorktree } from '@/runtime/runtime-file-routing'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { useAppStore } from '@/store'
import type { ReplaceAllIo } from './search-replace-all-runner'

// Wires the replace-all runner's IO ports to the same SSH-aware runtime
// clients the explorer's create/rename/delete already use — no new wire
// surface, so SSH worktrees behave exactly like those proven flows.
export function buildReplaceAllIo(context: RuntimeFileOperationArgs): ReplaceAllIo {
  const runtimeEnvironmentId = context.settings?.activeRuntimeEnvironmentId?.trim() || null
  const remoteEcho = Boolean(context.connectionId || runtimeEnvironmentId)

  return {
    stat: (filePath) => statRuntimePath(context, filePath),
    read: async (filePath) =>
      readRuntimeFileContent({
        settings: context.settings,
        filePath,
        relativePath: getRelativePathInsideWorktree(context.worktreePath, filePath) ?? filePath,
        worktreeId: context.worktreeId ?? undefined,
        connectionId: context.connectionId,
        expectedExternalSshTargetId: context.expectedExternalSshTargetId
      }),
    write: async (filePath, content) => {
      try {
        await writeRuntimeFile(context, filePath, content)
      } catch (error) {
        // Why: the stamp is only valid after a real write (editor-save-queue convention).
        clearSelfWrite(filePath, runtimeEnvironmentId)
        throw error
      }
    },
    isDirty: (filePath) =>
      useAppStore
        .getState()
        .openFiles.some(
          (file) =>
            file.worktreeId === context.worktreeId && file.filePath === filePath && file.isDirty
        ),
    stamp: (filePath, content) =>
      recordSelfWrite(filePath, content, runtimeEnvironmentId, remoteEcho ? SELF_WRITE_REMOTE_TTL_MS : undefined)
  }
}
