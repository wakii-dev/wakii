import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildUpdaterReleaseFeedUrls,
  resolvePackagedUpdaterFeedRepo,
  UPDATER_DEFAULT_FEED_REPO
} from './updater-feed-repo'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: process.resourcesPath là field Electron (type string) nhưng vắng mặt lúc runtime trong vitest.
const ORIGINAL_RESOURCES_PATH = (process as { resourcesPath?: string }).resourcesPath

const { netFetchMock, netRequestMock } = vi.hoisted(() => ({
  netFetchMock: vi.fn(),
  netRequestMock: vi.fn()
}))

vi.mock('electron', () => ({
  net: { fetch: netFetchMock, request: netRequestMock }
}))

const WAKII_REPO = { owner: 'wakii-dev', repo: 'wakii' }

describe('buildUpdaterReleaseFeedUrls', () => {
  it('derives atom, download-base and latest URLs from the repo', () => {
    const urls = buildUpdaterReleaseFeedUrls(WAKII_REPO)
    expect(urls.atomFeedUrl).toBe('https://github.com/wakii-dev/wakii/releases.atom')
    expect(urls.releasesDownloadBase).toBe('https://github.com/wakii-dev/wakii/releases/download')
    expect(urls.latestDownloadUrl).toBe(
      'https://github.com/wakii-dev/wakii/releases/latest/download'
    )
  })

  it('regexes match only that repo', () => {
    const urls = buildUpdaterReleaseFeedUrls(WAKII_REPO)
    const wakiiHref = 'href="https://github.com/wakii-dev/wakii/releases/tag/v1.4.222"'
    const upstreamHref = 'href="https://github.com/stablyai/orca/releases/tag/v1.4.224"'
    expect(Array.from(wakiiHref.matchAll(urls.tagHrefRegex))[0]?.[1]).toBe('v1.4.222')
    expect(Array.from(upstreamHref.matchAll(urls.tagHrefRegex))[0]).toBeUndefined()
    expect(
      urls.releaseDownloadUrlRegex.test(
        'https://github.com/wakii-dev/wakii/releases/download/v1.4.222/latest-mac.yml'
      )
    ).toBe(true)
    expect(
      urls.releaseDownloadUrlRegex.test(
        'https://github.com/stablyai/orca/releases/download/v1.4.224/latest-mac.yml'
      )
    ).toBe(false)
  })

  it('defaults to upstream so dev and test behavior is unchanged', () => {
    expect(UPDATER_DEFAULT_FEED_REPO).toEqual({ owner: 'stablyai', repo: 'orca' })
  })
})

describe('resolvePackagedUpdaterFeedRepo', () => {
  const WAKII_UPDATE_YML = [
    'provider: github',
    'owner: wakii-dev',
    'repo: wakii',
    'updaterCacheDirName: orca-updater'
  ].join('\n')

  it('reads app-update.yml from resourcesPath on darwin', () => {
    const probed: string[] = []
    const repo = resolvePackagedUpdaterFeedRepo({
      platform: 'darwin',
      resourcesPath: '/Applications/Wakii.app/Contents/Resources',
      execPathDir: '/Applications/Wakii.app/Contents/MacOS',
      readTextFile: (path) => {
        probed.push(path)
        return WAKII_UPDATE_YML
      }
    })
    expect(probed).toEqual(['/Applications/Wakii.app/Contents/Resources/app-update.yml'])
    expect(repo).toEqual(WAKII_REPO)
  })

  it('reads app-update.yml from exe-dir/resources on win32', () => {
    const probed: string[] = []
    const repo = resolvePackagedUpdaterFeedRepo({
      platform: 'win32',
      resourcesPath: 'C:\\Program Files\\Wakii\\resources',
      execPathDir: 'C:\\Program Files\\Wakii',
      readTextFile: (path) => {
        probed.push(path)
        return WAKII_UPDATE_YML
      }
    })
    // path.join mang semantics của platform đang chạy test (darwin → /) — assert đúng cấu thành, không assert separator.
    expect(probed).toEqual([join('C:\\Program Files\\Wakii', 'resources', 'app-update.yml')])
    expect(repo).toEqual(WAKII_REPO)
  })

  it('returns null when the manifest is unreadable, non-github, or incomplete', () => {
    const noFile = resolvePackagedUpdaterFeedRepo({
      platform: 'darwin',
      resourcesPath: '/no/such/resources',
      execPathDir: '/no/such/MacOS',
      readTextFile: () => null
    })
    expect(noFile).toBeNull()

    const nonGithub = resolvePackagedUpdaterFeedRepo({
      platform: 'darwin',
      resourcesPath: '/r',
      execPathDir: '/m',
      readTextFile: () => ['provider: generic', 'url: https://example.com/feed'].join('\n')
    })
    expect(nonGithub).toBeNull()

    const incomplete = resolvePackagedUpdaterFeedRepo({
      platform: 'darwin',
      resourcesPath: '/r',
      execPathDir: '/m',
      readTextFile: () => 'provider: github\nowner: wakii-dev\n'
    })
    expect(incomplete).toBeNull()
  })

  it('returns null when resourcesPath is absent (dev/test)', () => {
    const repo = resolvePackagedUpdaterFeedRepo({
      platform: 'darwin',
      resourcesPath: undefined,
      execPathDir: '/x',
      readTextFile: () => WAKII_UPDATE_YML
    })
    expect(repo).toBeNull()
  })
})

describe('packaged app-update.yml drives the prerelease feed URLs', () => {
  beforeEach(() => {
    vi.resetModules()
    netFetchMock.mockReset()
    netRequestMock.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process, 'resourcesPath', {
      value: ORIGINAL_RESOURCES_PATH,
      configurable: true
    })
  })

  it('scans the packaged repo feed instead of the upstream default', async () => {
    const resources = await mkdtemp(join(tmpdir(), 'wakii-feed-repo-'))
    await writeFile(
      join(resources, 'app-update.yml'),
      'provider: github\nowner: wakii-dev\nrepo: wakii\n'
    )
    Object.defineProperty(process, 'resourcesPath', {
      value: resources,
      configurable: true
    })

    const atomUrl = 'https://github.com/wakii-dev/wakii/releases.atom'
    netFetchMock.mockImplementation((url: string) => {
      if (url === atomUrl) {
        const body =
          '<entry><link rel="alternate" type="text/html" ' +
          'href="https://github.com/wakii-dev/wakii/releases/tag/v1.4.222"/></entry>'
        return Promise.resolve({ ok: true, text: () => Promise.resolve(body) })
      }
      if (url.endsWith('/v1.4.222/latest-mac.yml')) {
        const manifest = [
          'version: 1.4.222-local.1791642234609.39aed462df22',
          'files:',
          '  - url: Wakii-1.4.222-local.1791642234609.39aed462df22-arm64-mac.zip',
          '    sha512: test'
        ].join('\n')
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(manifest) })
      }
      if (url.includes('/releases/download/')) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') })
      }
      return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') })
    })

    const { fetchNewerReleaseTags } = await import('./updater-prerelease-feed')
    const tags = await fetchNewerReleaseTags('1.4.221-local.1791128510716.8cc525456919', 1)
    expect(tags).toEqual(['v1.4.222'])
    expect(netFetchMock.mock.calls.some(([url]) => url === atomUrl)).toBe(true)
  })
})
