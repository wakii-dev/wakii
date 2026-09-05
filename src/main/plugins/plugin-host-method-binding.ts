import {
  getPluginHostMethodSpec,
  type PluginHostMethodSpec
} from '../../shared/plugins/plugin-host-api'
import type { PluginHostServices } from './plugin-host-method-bindings'

export type BoundPluginHostMethod = {
  spec: PluginHostMethodSpec
  handler: (
    params: unknown,
    ctx: { pluginId: string; services: PluginHostServices }
  ) => Promise<unknown>
}

export function definePluginMethod(
  name: string,
  handler: BoundPluginHostMethod['handler']
): [string, BoundPluginHostMethod] {
  const spec = getPluginHostMethodSpec(name)
  if (!spec) {
    throw new Error(`no host API spec for method ${name}`)
  }
  return [name, { spec, handler }]
}
