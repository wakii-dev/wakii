import { once } from 'node:events'
import { spawnProcess } from '@orca/process-host'
import type { PipedProcessSpawner } from '@orca/process-host/process-spec'
import { buildWslExecArgs } from '../../shared/wsl-login-shell-command'
import { commandLineLength, MAX_COMMAND_LINE_CHARS } from '../../shared/windows-command-line-budget'
import type { OrcadHostTransport } from '../ssh/orcad-host-transport'
import type { RemoteCommandChannel } from '../ssh/remote-install-transport'
import { createSshOperationAbortError, type SshExecOptions } from '../ssh/ssh-connection-utils'
import { writeStringViaExecStdin } from '../ssh/ssh-exec-stdin-file-transfer'
import { resolveWslInteropSpawnCwd } from '../wsl-interop-spawn-directory'
import { wrapWslCommandProcess } from './wsl-command-channel'
import { uploadDirectoryIntoWsl, wslGuestSourcePath } from './wsl-directory-upload'
import { resolveWslExecutablePath } from './wsl-executable-path'
import type { WslOrcadHostTarget } from './wsl-orcad-host-target'

export type WslOrcadHostTransport = OrcadHostTransport & {
  getTarget(): WslOrcadHostTarget
}

type WslOrcadHostTransportOptions = {
  target: WslOrcadHostTarget
  /** Test seam; production spawns through process-host. */
  spawn?: PipedProcessSpawner
}

/**
 * orcad's host connection to a WSL distro: every exec is its own `wsl.exe --exec sh -c` child.
 * The distro is never a Windows host and has no SFTP, so every transfer runs over exec.
 */
export function createWslOrcadHostTransport(
  options: WslOrcadHostTransportOptions
): WslOrcadHostTransport {
  const spawn = options.spawn ?? spawnProcess
  const { target } = options
  const transport: WslOrcadHostTransport = {
    // `wrapCommand` is SSH-only: there is no login shell between wsl.exe and `sh -c`.
    async exec(command: string, execOptions?: SshExecOptions): Promise<RemoteCommandChannel> {
      if (execOptions?.signal?.aborted) {
        throw createSshOperationAbortError()
      }
      const program = resolveWslExecutablePath()
      const args = buildWslExecArgs(target.distro, ['sh', '-c', command])
      if (commandLineLength([program, ...args]) > MAX_COMMAND_LINE_CHARS) {
        throw new Error('WSL command exceeds the Windows command-line limit')
      }
      const child = spawn({
        program,
        args,
        cwd: resolveWslInteropSpawnCwd(),
        // Why WSL_UTF8: otherwise wsl.exe writes its own errors as UTF-16LE.
        env: { ...process.env, WSL_UTF8: '1' }
      })
      const channel = wrapWslCommandProcess(child)
      // Like an SSH channel open: a child that never started rejects here, not as a stream error.
      const spawnError = (error: Error): void => {
        channel.destroy(error)
      }
      channel.on('error', spawnError)
      try {
        await once(child, 'spawn')
      } finally {
        channel.off('error', spawnError)
      }
      return channel
    },
    usesSystemSshTransport: () => false,
    // One transport, one wsl.exe lane: nothing underneath is ever replaced.
    getConnectGeneration: () => 0,
    getTarget: () => target,
    writeFile: (remotePath, contents, fileOptions) =>
      writeStringViaExecStdin(transport, remotePath, contents, { signal: fileOptions?.signal }),
    uploadDirectory: (localDir, remoteDir, fileOptions) =>
      uploadDirectoryIntoWsl(
        transport,
        localDir,
        wslGuestSourcePath(localDir, target.distro),
        remoteDir,
        { signal: fileOptions?.signal }
      )
  }
  return transport
}
