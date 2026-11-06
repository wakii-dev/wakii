import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractManifestAssetNames,
  getRequiredReleaseAssetNames,
  verifyRequiredReleaseAssets
} from '../release/publication/verify-release-required-assets.mjs'

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn(async () => body),
    text: vi.fn(async () => (typeof body === 'string' ? body : JSON.stringify(body)))
  }
}

function releaseWithAssets(tag, assetNames) {
  return {
    tag_name: tag,
    draft: true,
    prerelease: false,
    assets: assetNames.map((name, index) => ({
      id: index + 1,
      name,
      state: 'uploaded',
      size: 123
    }))
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getRequiredReleaseAssetNames', () => {
  it('requires both arch Wakii DMGs renamed by macos-build', () => {
    expect(getRequiredReleaseAssetNames('v2.1.11')).toEqual(
      expect.arrayContaining(['Wakii-2.1.11-arm64.dmg', 'Wakii-2.1.11-x64.dmg'])
    )
  })

  it('requires the Windows installer pair and the two updater feeds, and no Linux or upstream zip names', () => {
    const names = getRequiredReleaseAssetNames('v2.1.11')
    expect(names).toEqual(
      expect.arrayContaining([
        'wakii-windows-setup.exe',
        'wakii-windows-setup.exe.blockmap',
        'latest-mac.yml',
        'latest.yml'
      ])
    )
    expect(names).not.toEqual(
      expect.arrayContaining(['latest-linux.yml', 'orca-linux.AppImage', `Orca-2.1.11-mac.zip`])
    )
    expect(names).toHaveLength(6)
  })
})

describe('extractManifestAssetNames', () => {
  it('extracts relative and absolute manifest asset names', () => {
    expect(
      extractManifestAssetNames(
        [
          'files:',
          '  - url: Wakii-2.1.11-local.123.abc-arm64-mac.zip',
          '  - url: https://example.com/downloads/wakii-windows-setup.exe',
          'path: wakii-windows-setup.exe.blockmap'
        ].join('\n')
      )
    ).toEqual([
      'Wakii-2.1.11-local.123.abc-arm64-mac.zip',
      'wakii-windows-setup.exe',
      'wakii-windows-setup.exe.blockmap'
    ])
  })
})

describe('verifyRequiredReleaseAssets', () => {
  function releaseFetch(release, manifestAsset, manifestText) {
    return vi.fn(async (url) => {
      const releasesUrl = 'https://api.github.com/repos/wakii-dev/wakii/releases'
      if (url === `${releasesUrl}?per_page=100`) {
        return jsonResponse([release])
      }
      if (url === `${releasesUrl}/assets/${manifestAsset.id}`) {
        return jsonResponse(manifestText)
      }
      if (release.assets.some((asset) => url === `${releasesUrl}/assets/${asset.id}`)) {
        return jsonResponse('version: 2.1.11\n')
      }
      throw new Error(`Unexpected release request: ${url}`)
    })
  }

  it('fails when a manifest-referenced asset has not been uploaded', async () => {
    const tag = 'v2.1.11'
    const release = releaseWithAssets(tag, getRequiredReleaseAssetNames(tag))
    const latestMacAsset = release.assets.find((asset) => asset.name === 'latest-mac.yml')
    vi.stubGlobal(
      'fetch',
      releaseFetch(
        release,
        latestMacAsset,
        [
          'version: 2.1.11',
          'files:',
          '  - url: mac-updater-only.zip',
          '    sha512: test',
          'path: mac-updater-only.zip'
        ].join('\n')
      )
    )

    await expect(
      verifyRequiredReleaseAssets({ repo: 'wakii-dev/wakii', tag, token: 'token' })
    ).rejects.toThrow('Missing: mac-updater-only.zip')
  })

  it('checks mac zip names that only the patched latest-mac.yml references', async () => {
    const tag = 'v2.1.11'
    const required = getRequiredReleaseAssetNames(tag)
    const release = releaseWithAssets(tag, required)
    const macManifest = release.assets.find((asset) => asset.name === 'latest-mac.yml')
    vi.stubGlobal(
      'fetch',
      releaseFetch(
        release,
        macManifest,
        [
          'version: 2.1.11',
          'files:',
          '  - url: Wakii-2.1.11-arm64-mac.zip',
          'path: Wakii-2.1.11-arm64-mac.zip'
        ].join('\n')
      )
    )

    await expect(
      verifyRequiredReleaseAssets({ repo: 'wakii-dev/wakii', tag, token: 'token' })
    ).rejects.toThrow('Missing: Wakii-2.1.11-arm64-mac.zip')
  })
})
