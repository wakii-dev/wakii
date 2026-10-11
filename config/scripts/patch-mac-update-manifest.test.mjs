import { describe, expect, it } from 'vitest'
import { patchMacUpdateManifest } from './patch-mac-update-manifest.mjs'

const MANIFEST = [
  'version: 1.4.223-local.1791710644440.a2178ce18bc6',
  'files:',
  '  - url: Wakii-1.4.223-local.1791710644440.a2178ce18bc6-mac.zip',
  '    sha512: AAAA',
  '    size: 233036015',
  '  - url: Wakii-1.4.223-local.1791710644440.a2178ce18bc6-arm64-mac.zip',
  '    sha512: BBBB',
  '    size: 226682308',
  '  - url: orca-macos-x64.dmg',
  '    sha512: CCCC',
  '    size: 231025920',
  '  - url: orca-macos-arm64.dmg',
  '    sha512: DDDD',
  '    size: 224731282',
  'path: Wakii-1.4.223-local.1791710644440.a2178ce18bc6-mac.zip',
  'sha512: AAAA',
  "releaseDate: '2026-10-11T09:26:04.419Z'",
  ''
].join('\n')

describe('patchMacUpdateManifest', () => {
  it('rewrites the renamed dmg url entries to the Wakii release names', () => {
    const patched = patchMacUpdateManifest(MANIFEST, '1.4.223')
    expect(patched).toContain('url: Wakii-1.4.223-x64.dmg')
    expect(patched).toContain('url: Wakii-1.4.223-arm64.dmg')
    expect(patched).not.toContain('orca-macos')
  })

  it('leaves the zip entries and the top-level path untouched', () => {
    const patched = patchMacUpdateManifest(MANIFEST, '1.4.223')
    expect(patched).toContain('url: Wakii-1.4.223-local.1791710644440.a2178ce18bc6-mac.zip')
    expect(patched).toContain('url: Wakii-1.4.223-local.1791710644440.a2178ce18bc6-arm64-mac.zip')
    expect(patched).toContain('path: Wakii-1.4.223-local.1791710644440.a2178ce18bc6-mac.zip')
  })

  it('is a no-op when the manifest already names the Wakii assets', () => {
    const patched = patchMacUpdateManifest(MANIFEST, '1.4.223')
    expect(patchMacUpdateManifest(patched, '1.4.223')).toBe(patched)
  })
})
