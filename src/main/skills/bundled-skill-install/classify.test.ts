import { chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bundledSkillTextDigest, classifyBundledSkillPath } from './classify'
import { nativeBundledSkillFilesystem } from './filesystem'
import {
  makeSkillHome,
  NAME,
  NEW_SOURCE,
  NEW_TEXT,
  OLD_TEXT,
  removeSkillHomes,
  writeCopy
} from './skill-home.test-support'

afterEach(async () => {
  await removeSkillHomes()
})

const currentDigest = bundledSkillTextDigest(Buffer.from(NEW_TEXT))
const classify = (path: string) =>
  classifyBundledSkillPath(nativeBundledSkillFilesystem, path, NEW_SOURCE, currentDigest)

describe('classifyBundledSkillPath', () => {
  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'reads an unlistable folder as another skill',
    async () => {
      const { root } = await makeSkillHome()
      await writeCopy(join(root, NAME), OLD_TEXT)
      await chmod(join(root, NAME), 0o000)
      try {
        expect(await classify(join(root, NAME))).toEqual({
          folderClass: 'other',
          observed: { kind: 'unreadable' }
        })
      } finally {
        await chmod(join(root, NAME), 0o755)
      }
    }
  )
})

describe('plan digest', () => {
  it('does not traverse auxiliary content in edited or foreign copies left alone', async () => {
    const home = await makeSkillHome()
    await writeCopy(home.shared, `---\nname: ${NAME}\n---\nmine\n`, { 'notes.md': 'mine' })
    await writeCopy(home.claude, 'another skill\n')
    await mkdir(join(home.claude, 'scripts'))
    await writeFile(join(home.claude, 'scripts', 'run.sh'), 'mine')
    const reads: string[] = []
    const filesystem = {
      ...nativeBundledSkillFilesystem,
      readFile: async (path: string, maxBytes?: number) => {
        reads.push(path)
        return nativeBundledSkillFilesystem.readFile(path, maxBytes)
      },
      hashFile: async (path: string) => {
        reads.push(path)
        return nativeBundledSkillFilesystem.hashFile?.(path) ?? null
      },
      listEntries: async (path: string) => {
        expect(path).not.toBe(join(home.claude, 'scripts'))
        return nativeBundledSkillFilesystem.listEntries(path)
      }
    }
    const { plan } = await buildBundledSkillPlan({
      ...serviceInput(home),
      filesystem,
      sources: [NEW_SOURCE]
    })
    expect(plan.skills[0].ops.map((op) => [op.kind, op.reason])).toEqual([
      ['leave', 'edited'],
      ['leave', 'other']
    ])
    expect(reads.map((path) => basename(path))).toEqual(['SKILL.md', 'SKILL.md'])
    expect(reads.map((path) => dirname(path))).toEqual([home.shared, home.claude])
    expect(plan.skills[0].ops.every((op) => !('treeDigest' in op.observed))).toBe(true)
  })

  it('is stable across previews of the same disk and moves when the disk does', async () => {
    const home = await makeSkillHome()
    await writeCopy(home.shared, OLD_TEXT)
    const input = {
      ...serviceInput(home),
      filesystem: nativeBundledSkillFilesystem,
      sources: [NEW_SOURCE]
    }
    const first = await buildBundledSkillPlan(input)
    const second = await buildBundledSkillPlan(input)
    expect(second.plan).toEqual(first.plan)
    expect(JSON.stringify(first.plan)).not.toMatch(/orca-(?:stage|old)-|\d{4}-\d{2}-\d{2}T/u)

    await writeFile(join(home.shared, 'SKILL.md'), NEW_TEXT)
    expect((await buildBundledSkillPlan(input)).plan.planDigest).not.toBe(first.plan.planDigest)
  })

  it('covers the bytes it would write', async () => {
    const home = await makeSkillHome()
    const input = { ...serviceInput(home), filesystem: nativeBundledSkillFilesystem }
    const before = await buildBundledSkillPlan({ ...input, sources: [NEW_SOURCE] })
    const after = await buildBundledSkillPlan({
      ...input,
      sources: [
        { ...NEW_SOURCE, files: [{ path: 'SKILL.md', text: `${NEW_TEXT}more\n` }] }
      ]
    })
    expect(after.plan.planDigest).not.toBe(before.plan.planDigest)
  })
})

describe('swap sibling names', () => {
  it('are hidden from discovery and recognised per skill', () => {
    for (const name of [`.${NAME}.orca-stage-1`, `.${NAME}.orca-old-1`]) {
      expect(isSkillStagingEntryName(name)).toBe(true)
    }
    expect(bundledSkillSiblingKind(NAME, `.${NAME}.orca-stage-1`)).toBe('stage')
    expect(bundledSkillSiblingKind(NAME, `.${NAME}.orca-old-1`)).toBe('old')
    expect(bundledSkillSiblingKind(NAME, `.${NAME}.orca-placement-staging-1`)).toBeNull()
    expect(bundledSkillSiblingKind('other', `.${NAME}.orca-old-1`)).toBeNull()
  })
})
