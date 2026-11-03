import type { Mock } from 'vitest'

export type UpdaterSpy = Mock<(...args: unknown[]) => unknown>
export type LinuxPackageType = 'deb' | 'rpm' | 'non-root' | 'unusable'

export type AutoUpdaterMock = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  autoRunAppAfterInstall: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  disableDifferentialDownload: boolean
  logger: { error: (message: unknown) => void } | undefined
  on: Mock<(event: string, handler: (...args: unknown[]) => void) => AutoUpdaterMock>
  checkForUpdates: UpdaterSpy
  downloadUpdate: UpdaterSpy
  quitAndInstall: UpdaterSpy
  setFeedURL: UpdaterSpy
  updateConfigPath: string | undefined
  emit: (event: string, ...args: unknown[]) => void
  reset: () => void
}

export type AppMock = {
  isPackaged: boolean
  getVersion: Mock<() => string>
  on: Mock<(event: string, handler: (...args: unknown[]) => void) => AppMock>
  prependListener: Mock<(event: string, handler: (...args: unknown[]) => void) => AppMock>
  emit: (event: string, ...args: unknown[]) => void
  quit: UpdaterSpy
}

export type UpdaterModuleFactories = {
  electron: () => {
    app: AppMock
    BrowserWindow: { getAllWindows: Mock<() => unknown[]> }
    autoUpdater: { on: UpdaterSpy }
    powerMonitor: { on: UpdaterSpy }
    shell: { showItemInFolder: UpdaterSpy }
    net: { fetch: UpdaterSpy }
  }
  electronUpdater: () => { autoUpdater: AutoUpdaterMock }
  electronUpdaterLoader: () => { loadElectronAutoUpdater: () => AutoUpdaterMock }
  ptyKillAll: () => { killAllPty: UpdaterSpy }
  linuxUpdatePackageType: () => {
    getLinuxPackageType: Mock<() => LinuxPackageType>
    getLinuxRootPackageType: Mock<() => 'deb' | 'rpm' | null>
    isExternallyManagedLinuxInstall: Mock<() => boolean>
  }
  updaterLifecycleDiagnostics: () => { recordUpdaterLifecycle: UpdaterSpy }
  updaterChangelog: () => { fetchChangelog: UpdaterSpy }
  updaterNudge: () => { fetchNudge: UpdaterSpy; shouldApplyNudge: UpdaterSpy }
  updateInstallExitWatchdog: () => {
    armUpdateInstallExitWatchdog: UpdaterSpy
    disarmUpdateInstallExitWatchdog: UpdaterSpy
  }
  updaterPrereleaseFeed: () => {
    RELEASE_FEED_REPO: { owner: string; repo: string }
    fetchNewerReleaseTagsWithReadiness: (...args: unknown[]) => Promise<unknown>
    fetchLatestStableReleaseTag: () => Promise<string | null>
    getReleaseDownloadUrl: (tag: string) => string
  }
  localBuildSwitch: () => { chooseLocalBuild: UpdaterSpy }
  localBuildFeedServer: () => { startLocalBuildFeed: UpdaterSpy }
}

export type UpdaterMocks = {
  appMock: AppMock
  browserWindowMock: { getAllWindows: Mock<() => unknown[]> }
  nativeUpdaterMock: { on: UpdaterSpy }
  autoUpdaterMock: AutoUpdaterMock
  killAllPtyMock: UpdaterSpy
  powerMonitorOnMock: UpdaterSpy
  getLinuxPackageTypeMock: Mock<() => LinuxPackageType>
  getLinuxRootPackageTypeMock: Mock<() => 'deb' | 'rpm' | null>
  isExternallyManagedLinuxInstallMock: Mock<() => boolean>
  recordUpdaterLifecycleMock: UpdaterSpy
  fetchChangelogMock: UpdaterSpy
  fetchNudgeMock: UpdaterSpy
  shouldApplyNudgeMock: UpdaterSpy
  armExitWatchdogMock: UpdaterSpy
  disarmExitWatchdogMock: UpdaterSpy
  fetchNewerReleaseTagsMock: UpdaterSpy
  fetchLatestStableReleaseTagMock: Mock<() => Promise<string | null>>
  chooseLocalBuildMock: UpdaterSpy
  startLocalBuildFeedMock: UpdaterSpy
  closeLocalBuildFeedMock: UpdaterSpy
  moduleFactories: UpdaterModuleFactories
  resetUpdaterMocks: () => void
}
