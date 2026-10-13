import type { SshTarget } from '../../shared/ssh-types'
import type { WslOrcadHostTarget } from '../wsl/wsl-orcad-host-target'
import type { RemoteInstallTransport } from './remote-install-transport'

/** The host an orcad transport reaches; only `id` and `label` mean the same for every kind. */
export type OrcadHostTarget = SshTarget | WslOrcadHostTarget

export function isWslOrcadHostTarget(target: OrcadHostTarget): target is WslOrcadHostTarget {
  return 'kind' in target && target.kind === 'wsl'
}

/** The host connection orcad deploy, activation, serving and lifecycle code runs over. */
export type OrcadHostTransport = RemoteInstallTransport & {
  /** Keys per-host state (remote context, wake dedupe) to the target it reaches. */
  getTarget(): OrcadHostTarget
}
