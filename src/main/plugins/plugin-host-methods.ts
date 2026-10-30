import { getBoundPluginHostMethod, type PluginHostServices } from './plugin-host-method-bindings'
import { isQualifiedPluginKey } from '../../shared/plugins/manifest/plugin-manifest'
import {
  gatePluginHostCall as decidePluginHostCall,
  type PluginGateErrorCode
} from '../../shared/plugins/capabilities/plugin-capability-gate'
import type { PluginSurface } from '../../shared/plugins/frames/plugin-protocol'
import type { PluginCapabilityKind } from '../../shared/plugins/capabilities/plugin-capabilities'
import type {
  PluginPanelActionErrorCode,
  PluginPanelActionOutcome
} from '../../shared/plugins/plugin-panel-bridge'
import type { PluginAuditLog } from './plugin-audit-log'

/**
 * Host API v0 handler bindings — the one place plugin-originated calls
 * (panel bridge, worker hostCall, serve RPC relay) execute. Handlers
 * delegate to runtime services through the structural `PluginHostServices`
 * interface, so this module stays electron-free and the relay conformance
 * suite can run the identical chokepoint against a fake service set.
 */

export type { PluginHostServices } from './plugin-host-method-bindings'

export type ExecutePluginHostCallInput = {
  /** Qualified plugin key, bound host-side from authenticated identity. */
  pluginId: string
  method: string
  params: unknown
  /** True when the call arrives over the sandboxed panel bridge. */
  viaPanel: boolean
  /** Consented capability kinds; null = unknown/disabled/consent-stale. */
  grantedCapabilities: readonly PluginCapabilityKind[] | null
  services: PluginHostServices | null
  audit?: Pick<PluginAuditLog, 'record'>
}

// Upstream gates by surface kind; the fork call sites only know the panel bridge flag.
function surfaceOfCall(input: ExecutePluginHostCallInput): PluginSurface {
  return input.viaPanel ? 'panel' : 'worker'
}

// The panel outcome code is an open wire set; gate codes map 1:1 except surface denials.
const PANEL_CODE_OF_GATE_CODE: Record<PluginGateErrorCode, PluginPanelActionErrorCode> = {
  unknown_method: 'unknown_method',
  capability_denied: 'capability_denied',
  consent_required: 'consent_required',
  not_permitted: 'panel_forbidden'
}

export async function executePluginHostCall(
  input: ExecutePluginHostCallInput
): Promise<PluginPanelActionOutcome> {
  if (!isQualifiedPluginKey(input.pluginId)) {
    return { ok: false, code: 'invalid_request', error: 'invalid qualified plugin key' }
  }
  const gate = decidePluginHostCall(
    { grantedCapabilities: input.grantedCapabilities, surface: surfaceOfCall(input) },
    input.method
  )
  if (!gate.granted) {
    return { ok: false, code: PANEL_CODE_OF_GATE_CODE[gate.code], error: gate.error }
  }
  const bound = getBoundPluginHostMethod(input.method)
  if (!bound) {
    return { ok: false, code: 'unknown_method', error: `unknown host method: ${input.method}` }
  }
  const parsedParams = bound.spec.params.safeParse(input.params)
  if (!parsedParams.success) {
    const issue = parsedParams.error.issues[0]
    const path = issue?.path.join('.') || '(root)'
    return {
      ok: false,
      code: 'invalid_params',
      error: `${path}: ${issue?.message ?? 'invalid params'}`
    }
  }
  if (!input.services) {
    return { ok: false, code: 'unavailable', error: 'runtime is not available' }
  }
  const auditMutation = async (outcome: 'attempt' | 'ok' | 'error'): Promise<void> => {
    if (bound.spec.mutation && input.audit) {
      await input.audit.record({
        ts: Date.now(),
        actor: `plugin:${input.pluginId}`,
        method: input.method,
        summary: summarizeParams(input.method, parsedParams.data),
        outcome
      })
    }
  }
  if (bound.spec.mutation) {
    if (!input.audit) {
      return {
        ok: false,
        code: 'unavailable',
        error: 'mutation audit log is not available'
      }
    }
    try {
      // The intent is appended before the handler. If this write fails, the
      // mutation is never attempted.
      await auditMutation('attempt')
    } catch {
      return {
        ok: false,
        code: 'action_failed',
        error: 'mutation audit log could not be written'
      }
    }
  }
  try {
    const value = await bound.handler(parsedParams.data, {
      pluginId: input.pluginId,
      services: input.services
    })
    const validated = bound.spec.result.safeParse(value)
    if (!validated.success) {
      await auditMutation('error').catch(() => undefined)
      // A result-schema mismatch is a host bug; fail the call rather than
      // leaking an unvalidated shape into plugin-facing transports.
      return {
        ok: false,
        code: 'action_failed',
        error: `internal: malformed ${input.method} result`
      }
    }
    await auditMutation('ok').catch(() => undefined)
    return { ok: true, value: validated.data }
  } catch (error) {
    await auditMutation('error').catch(() => undefined)
    return {
      ok: false,
      code: 'action_failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/** Bounded, content-free summaries for the audit log. */
function summarizeParams(method: string, params: unknown): string {
  const record = (typeof params === 'object' && params !== null ? params : {}) as Record<
    string,
    unknown
  >
  switch (method) {
    case 'terminal.sendText': {
      const text = typeof record.text === 'string' ? record.text : ''
      return `terminal=${String(record.terminalId)} bytes=${Buffer.byteLength(text, 'utf8')} enter=${record.enter === true}`
    }
    case 'notifications.show': {
      const title = typeof record.title === 'string' ? record.title : ''
      return `titleChars=${title.length}`
    }
    case 'storage.set':
    case 'storage.delete':
    case 'secrets.set':
    case 'secrets.delete':
    case 'settings.set':
      return `key=${String(record.key)}`
    default:
      return ''
  }
}
