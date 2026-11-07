// Tests multi-home kit skills install (CEO multi-home) — chạy node trực tiếp,
// chỉ đụng temp dirs (fake home), không đụng home thật.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const { agentSkillsHomeTargets, installKitSkillsToAgentHomes } = await import(new URL('../lib/kit-install.mjs', import.meta.url))

// kit skills nguồn fake
const kitRoot = mkdtempSync(join(tmpdir(), 'kit-src-'))
mkdirSync(join(kitRoot, 'skills', 'demo-skill'), { recursive: true })
writeFileSync(join(kitRoot, 'skills', 'demo-skill', 'SKILL.md'), '# demo\n')
mkdirSync(join(kitRoot, 'skills', 'other-skill'), { recursive: true })
writeFileSync(join(kitRoot, 'skills', 'other-skill', 'SKILL.md'), '# other\n')

// fake home: có .codex + .gemini + .cursor; KHÔNG có .kiro (test skip)
const home = mkdtempSync(join(tmpdir(), 'kit-home-'))
for (const d of ['.codex', '.gemini', '.cursor']) mkdirSync(join(home, d), { recursive: true })

const done = installKitSkillsToAgentHomes(home, kitRoot)
assert.deepEqual(done.sort(), [
  join(home, '.agents', 'skills'),
  join(home, '.cursor', 'skills'),
  join(home, '.gemini', 'skills'),
].sort(), 'cài đúng 3 target (dedup ~/.agents cho .codex)')
assert.equal(readFileSync(join(home, '.agents', 'skills', 'demo-skill', 'SKILL.md'), 'utf8'), '# demo\n')
assert.ok(existsSync(join(home, '.cursor', 'skills', 'other-skill', 'SKILL.md')))
assert.ok(!existsSync(join(home, '.kiro')), 'home không tồn tại → skip im lặng')

// lỗi 1 home không chặn home khác: target không ghi được (đã tồn tại là FILE, mkdir fail)
rmSync(join(home, '.gemini', 'skills'), { recursive: true, force: true })
writeFileSync(join(home, '.gemini', 'skills'), 'không phải dir')
const logs = []
const done2 = installKitSkillsToAgentHomes(home, kitRoot, (m) => logs.push(m))
assert.ok(!done2.includes(join(home, '.gemini', 'skills')), 'home lỗi bị skip')
assert.ok(done2.includes(join(home, '.cursor', 'skills')), 'home khác vẫn cài')
assert.equal(logs.length, 1, 'ghi log 1 dòng cho home lỗi')

// kitRoot không có skills/ → rỗng, không lỗi
assert.deepEqual(installKitSkillsToAgentHomes(home, join(tmpdir(), 'khong-ton-tai-xyz')), [])

// mapping: entry .codex và .agents cố tình cùng target ~/.agents/skills — install dedup
const targets = agentSkillsHomeTargets(home).map((t) => t.target)
assert.equal(new Set(targets).size, targets.length - 1, 'đúng 1 cặp entry chia sẻ target ~/.agents/skills')

console.log('kit-multihome-tests: 6 asserts PASS')
for (const p of [kitRoot, home]) rmSync(p, { recursive: true, force: true })
