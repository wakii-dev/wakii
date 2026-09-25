import { describe, expect, it } from 'vitest'
import { GIT_METHODS } from './git'
import { isBackgroundRuntimeMethod } from '../../../../shared/runtime-rpc-call-queue'
import { registerGitHandlers } from '../../../../relay/git-handler-registration'
import type { GitHandlerOperationSet } from '../../../../relay/git-handler-operation-set'
import type { RelayDispatcher } from '../../../../relay/dispatcher'

// Boundary (docs/reference/remote-wire-compatibility.md — "Known hazard" section):
// the relay surface is a deliberately narrow registration subset of the desktop
// GIT_METHODS (precedent: git.remoteFileUrl / git.remoteCommitUrl never registered
// there). git.blame stays desktop+web runtime-scoped: old relays answer unknown
// methods with -32601 and the renderer degrades silently, so widening the relay
// surface is a wire-compat decision, not an accident of method reuse.
describe('git.blame surface policy', () => {
  it('is registered on the desktop runtime GIT_METHODS surface', () => {
    expect(GIT_METHODS.map((method) => method.name)).toContain('git.blame')
  })

  it('is NOT registered on the relay surface (desktop-only MVP)', () => {
    const registered: string[] = []
    const dispatcher = {
      onRequest: (method: string) => {
        registered.push(method)
      },
      onNotification: () => {}
    } as unknown as RelayDispatcher
    const noOpHandlers = new Proxy(
      {},
      {
        get: () => () => {}
      }
    ) as GitHandlerOperationSet

    registerGitHandlers(dispatcher, noOpHandlers, () => {}, () => {})

    expect(registered).toContain('git.history')
    expect(registered).toContain('git.status')
    expect(registered).not.toContain('git.blame')
    // Precedent companions stay out too.
    expect(registered).not.toContain('git.remoteFileUrl')
    expect(registered).not.toContain('git.remoteCommitUrl')
  })

  it('stays foreground on purpose — user-waiting, not pooled with background refreshes', () => {
    expect(isBackgroundRuntimeMethod('git.blame')).toBe(false)
  })
})
