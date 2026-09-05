import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseBracketHeading } from './bracket-file-parse'

const FIXTURE_PATH = join(import.meta.dirname, '__fixtures__', 'fi305-bracket-fixture.md')
const PLUGIN_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'resources',
  'plugins',
  'launch',
  'stablyai.orca-superpowers-launcher',
  'main.mjs'
)

// Verbatim reimplementation of parseBracketFile from
// resources/plugins/launch/stablyai.orca-superpowers-launcher/main.mjs:228-234.
// Never import the .mjs — the plugin bundle has side effects. Deviations from
// the source: unused `lines` local omitted; pre-slice title surfaced for the
// pre-slice parity assertion below.
function pluginParseBracketFile(text: string, file: string) {
  let linear: string | null = null
  let title = basename(file).replace(/\.md$/, '')
  const hm = text.match(/^#\s+Story:\s*([A-Z]+-\d+)\s*[—–-]\s*(.+)$/m)
  if (hm) {
    linear = hm[1]
    title = hm[2].trim()
  }
  return {
    linear,
    preSliceTitle: title,
    // Exact plugin return shape: title sliced to 60 chars.
    result: { linear, title: title.slice(0, 60), file }
  }
}

describe('bracket parser parity: desktop shared vs launcher plugin', () => {
  it('plugin source still carries the regex + slice the test reimplements', () => {
    // Drift guard: a plugin regex/slice change FAILS here and forces a manual
    // parity re-check against the reimplementation above.
    const pluginSource = readFileSync(PLUGIN_PATH, 'utf8')
    expect(pluginSource).toContain('[A-Z]+-\\d+') // drift guard — regex parity
    // Full main.mjs:231 literal — a separator-class/prefix/tail change must
    // FAIL here too, not just a charset change.
    expect(pluginSource).toContain('/^#\\s+Story:\\s*([A-Z]+-\\d+)\\s*[—–-]\\s*(.+)$/m')
    expect(pluginSource).toContain('title.slice(0, 60)')
  })

  it('extracts identical {linear, title, file} from the fixture bracket', () => {
    const fixtureText = readFileSync(FIXTURE_PATH, 'utf8')
    const fileName = basename(FIXTURE_PATH)

    // Shared parser is intentionally a superset: [A-Za-z]+-\d+ vs plugin
    // [A-Z]+-\d+ (plugin uses [A-Za-z] itself at main.mjs:359/:397/:502/:661).
    // Parity passes because fixture ids are uppercase. If the plugin changes
    // charset, the drift guard above FAILS → re-check parity manually.
    const shared = parseBracketHeading(fixtureText, fileName)
    const plugin = pluginParseBracketFile(fixtureText, FIXTURE_PATH)

    // Fixture sanity: uppercase FI-305 and a title longer than the plugin's
    // 60-char slice so the slice convention is actually exercised.
    expect(shared.epicId).toBe('FI-305')
    expect(shared.title.length).toBeGreaterThan(60)

    // Pre-slice parity (shared does not slice; its caller slices 80).
    expect(plugin.linear).toBe(shared.epicId)
    expect(plugin.preSliceTitle).toBe(shared.title)

    // Verbatim plugin return shape {linear, title(sliced 60), file}.
    expect(plugin.result).toEqual({
      linear: shared.epicId,
      title: shared.title.slice(0, 60),
      file: FIXTURE_PATH
    })
  })

  it.each(['—', '–', '-'])('handles separator %s identically on both sides', (sep) => {
    const text = `# Story: FI-7 ${sep} Neutral separator title`
    const shared = parseBracketHeading(text, 'x.md')
    const plugin = pluginParseBracketFile(text, 'x.md')
    expect(shared.epicId).toBe('FI-7')
    expect(plugin.linear).toBe(shared.epicId)
    expect(plugin.preSliceTitle).toBe(shared.title)
    expect(plugin.result.title).toBe(shared.title.slice(0, 60))
  })

  it('falls back to the file name on both sides when the heading is missing', () => {
    const noHeading = 'Destination: story/unknown\n\n## SF-1 Orphan section\nTier: 0\n'
    // Long name so the plugin's slice on the fallback path is exercised too.
    const fileName =
      'fi305-bracket-fixture-no-heading-fallback-name-longer-than-the-plugin-slice-limit.md'

    const shared = parseBracketHeading(noHeading, fileName)
    const plugin = pluginParseBracketFile(noHeading, fileName)

    expect(shared).toEqual({ epicId: null, title: fileName.replace(/\.md$/, '') })
    // Plugin slices the fallback title as well — hence slice(0, 60) here.
    expect(plugin.result).toEqual({
      linear: null,
      title: shared.title.slice(0, 60),
      file: fileName
    })
  })
})
