import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse } from 'yaml'

export type UpdaterFeedRepo = { owner: string; repo: string }

// No packaged app-update.yml (dev/test) → upstream parity, như hành vi cũ.
export const UPDATER_DEFAULT_FEED_REPO: UpdaterFeedRepo = { owner: 'stablyai', repo: 'orca' }

export type UpdaterReleaseFeedUrls = {
  atomFeedUrl: string
  releasesDownloadBase: string
  latestDownloadUrl: string
  /** `href="…/releases/tag/<tag>"` — 'g' flag; String.matchAll clones, lastIndex không tiến. */
  tagHrefRegex: RegExp
  releaseDownloadUrlRegex: RegExp
}

export function buildUpdaterReleaseFeedUrls(repo: UpdaterFeedRepo): UpdaterReleaseFeedUrls {
  // GitHub owner/repo grammar chỉ gồm [A-Za-z0-9-] — không có regex metachar cần escape.
  const base = `https://github.com/${repo.owner}/${repo.repo}`
  return {
    atomFeedUrl: `${base}/releases.atom`,
    releasesDownloadBase: `${base}/releases/download`,
    latestDownloadUrl: `${base}/releases/latest/download`,
    tagHrefRegex: new RegExp(
      `href="https://github\\.com/${repo.owner}/${repo.repo}/releases/tag/([^"]+)"`,
      'g'
    ),
    releaseDownloadUrlRegex: new RegExp(
      `^https://github\\.com/${repo.owner}/${repo.repo}/releases/download/`,
      'i'
    )
  }
}

export type PackagedUpdaterEnv = {
  platform: NodeJS.Platform
  resourcesPath: string | undefined
  execPathDir: string
  readTextFile: (path: string) => string | null
}

/** Repo feed = app-update.yml đi kèm build (đúng nguồn electron-updater dùng), null khi không đọc được. */
export function resolvePackagedUpdaterFeedRepo(env: PackagedUpdaterEnv): UpdaterFeedRepo | null {
  const manifestPath =
    env.platform === 'win32'
      ? join(env.execPathDir, 'resources', 'app-update.yml')
      : env.resourcesPath
        ? join(env.resourcesPath, 'app-update.yml')
        : null
  if (!manifestPath) {
    return null
  }
  const manifestText = env.readTextFile(manifestPath)
  if (!manifestText) {
    return null
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: yaml.parse trả unknown; manifest do electron-builder sinh từ publish config, các field được kiểm typeof ngay dưới.
  const manifest = parse(manifestText) as {
    provider?: unknown
    owner?: unknown
    repo?: unknown
  } | null
  if (typeof manifest !== 'object' || manifest === null) {
    return null
  }
  if (manifest.provider !== 'github') {
    return null
  }
  if (typeof manifest.owner !== 'string' || !manifest.owner.trim()) {
    return null
  }
  if (typeof manifest.repo !== 'string' || !manifest.repo.trim()) {
    return null
  }
  return { owner: manifest.owner, repo: manifest.repo }
}

function readTextFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

export function resolveCurrentUpdaterFeedRepo(): UpdaterFeedRepo {
  return (
    resolvePackagedUpdaterFeedRepo({
      platform: process.platform,
      resourcesPath: process.resourcesPath,
      execPathDir: dirname(process.execPath),
      readTextFile: readTextFileOrNull
    }) ?? UPDATER_DEFAULT_FEED_REPO
  )
}

/** Single source cho mọi URL feed trong updater — KHÔNG hardcode repo ở chỗ khác. */
export const UPDATER_RELEASE_FEED_URLS = buildUpdaterReleaseFeedUrls(
  resolveCurrentUpdaterFeedRepo()
)
