#!/usr/bin/env node
// story-surface-lint tests (GH-30 SF-1) — spawn lint thật trên temp git repos,
// fixture 12 SC: SC1-SC7 + no-op + FAKE_NOW cases. KHÔNG chạm repo thật
// (STORY_LINT_DIR trỏ temp). Chạy: node tests/surface-lint-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-surface-lint')

// Resolve python launcher: Windows spawnSync dính Store alias stub cho
// 'python3' (9009) → fallback 'python' rồi 'py'; macOS/Linux chỉ có 'python3'.
function resolvePython() {
  for (const name of ['python3', 'python', 'py']) {
    const r = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 15000 })
    if (r.status === 0) return name
  }
  throw new Error('không tìm thấy python3/python/py chạy được')
}
const PY = resolvePython()

// ---- runner -----------------------------------------------------------------
let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const ok = cond === true
  if (ok) pass++
  else fail++, failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`)
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${caseId} ${name}${ok ? '' : ' — ' + (detail || 'assert sai')}`)
}

function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 30000 })
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}

function tempDir(tag) {
  const dir = mkdtempSync(join(tmpdir(), `surface-lint-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

// Valid kit.json shape tối thiểu (lint chỉ đọc provides name/alias_of)
function kitJson(entries) {
  return JSON.stringify({ name: 'story-team-kit', version: '1.0.0', provides: entries }, null, 2)
}

function writeRepoFiles(repo, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(repo, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
}

// Repo chuẩn: main có base state; HEAD nhánh feature mang diff. Trả merge-base.
function initRepo(repo, baseFiles, headFiles) {
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeRepoFiles(repo, baseFiles)
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'base')
  const mb = git(repo, 'rev-parse', 'HEAD').out
  git(repo, 'checkout', '-q', '-b', 'feature')
  writeRepoFiles(repo, headFiles)
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'head')
  return mb
}

function runLint(repo, baseRef, { fakeNow } = {}) {
  const env = { ...process.env, STORY_LINT_DIR: repo }
  if (fakeNow) env.FAKE_NOW = fakeNow
  const r = spawnSync(PY, [BIN, baseRef], { encoding: 'utf8', timeout: 60000, env })
  return { code: r.status, out: (r.stdout || ''), err: (r.stderr || '') }
}

// ---- shared fixtures --------------------------------------------------------
const KIT = 'resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/kit.json'
const BIN_DIR = 'resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin'
const META = 'docs/site/content/docs/recipes/meta.json'

const baseKit = kitJson([
  { name: 'old-tool', type: 'bin', description: 'old' },
  { name: 'kept-tool', type: 'bin', description: 'kept' },
])
const metaBase = JSON.stringify({ title: 'Recipes', pages: ['alpha', 'beta'] })

const GOOD_GUIDE = (oldName, newName, expires) => `---
surface: kit-provides
old: ${oldName}
new: ${newName}
expires: ${expires}
---

# Migration guide: ${oldName} → ${newName}

## What changed

Renamed bin.

## Old→New map

| Old | New | Notes |
| --- | --- | --- |
| \`${oldName}\` | \`${newName}\` | — |

## Migration steps

1. Use the new name.

## Notes

- Alias chỉ trỏ.
`

// ---- SC cases ---------------------------------------------------------------

// SC1: rename kit entry thiếu alias → MISSING-ALIAS
{
  console.log('\n== SC1 rename-thieu-alias ==')
  const repo = tempDir('sc1')
  initRepo(repo, { [KIT]: baseKit }, {
    [KIT]: kitJson([
      { name: 'new-tool', type: 'bin', description: 'new' },
      { name: 'kept-tool', type: 'bin', description: 'kept' },
    ]),
  })
  const r = runLint(repo, 'main')
  check('SC1', 'exit 1', r.code === 1, `code=${r.code} out=${r.out.slice(0, 200)}`)
  check('SC1', 'stdout có MISSING-ALIAS old-tool', r.out.includes('MISSING-ALIAS old-tool'), r.out.slice(0, 300))
  rmSync(repo, { recursive: true, force: true })
}

// SC2: đủ alias thiếu guide → MISSING-GUIDE
{
  console.log('\n== SC2 alias-thieu-guide ==')
  const repo = tempDir('sc2')
  initRepo(repo, { [KIT]: baseKit }, {
    [KIT]: kitJson([
      { name: 'new-tool', type: 'bin', description: 'new', alias_of: 'old-tool' },
      { name: 'kept-tool', type: 'bin', description: 'kept' },
    ]),
  })
  const r = runLint(repo, 'main')
  check('SC2', 'exit 1', r.code === 1, `code=${r.code}`)
  check('SC2', 'KHÔNG MISSING-ALIAS', !r.out.includes('MISSING-ALIAS'))
  check('SC2', 'stdout có MISSING-GUIDE old-tool', r.out.includes('MISSING-GUIDE old-tool'), r.out.slice(0, 300))
  rmSync(repo, { recursive: true, force: true })
}

// SC3: alias + guide thiếu expires → exit 0 + WARN default today+90d
{
  console.log('\n== SC3 guide-thieu-expires ==')
  const repo = tempDir('sc3')
  initRepo(repo, { [KIT]: baseKit }, {
    [KIT]: kitJson([
      { name: 'new-tool', type: 'bin', description: 'new', alias_of: 'old-tool' },
      { name: 'kept-tool', type: 'bin', description: 'kept' },
    ]),
    'docs/superpowers/migrations/2026-01-01-old-tool.md': `---
surface: kit-provides
old: old-tool
new: new-tool
---

# Migration guide: old-tool → new-tool

## What changed

Renamed.

## Old→New map

| Old | New | Notes |
| --- | --- | --- |

## Migration steps

1. Rename.

## Notes

- none
`,
  })
  const r = runLint(repo, 'main', { fakeNow: '2026-09-10' })
  check('SC3', 'exit 0 (chỉ WARN)', r.code === 0, `code=${r.code} out=${r.out.slice(0, 200)}`)
  check('SC3', 'WARN sẽ default today+90d (2026-12-09)', r.out.includes('WARN surface-lint:') && r.out.includes('2026-12-09'), r.out.slice(0, 300))
  rmSync(repo, { recursive: true, force: true })
}

// SC4: guide expires sai format → BAD-DATE
{
  console.log('\n== SC4 expires-sai-format ==')
  const repo = tempDir('sc4')
  initRepo(repo, { [KIT]: baseKit }, {
    [KIT]: kitJson([
      { name: 'new-tool', type: 'bin', description: 'new', alias_of: 'old-tool' },
      { name: 'kept-tool', type: 'bin', description: 'kept' },
    ]),
    'docs/superpowers/migrations/2026-01-01-old-tool.md': GOOD_GUIDE('old-tool', 'new-tool', 'next spring'),
  })
  const r = runLint(repo, 'main', { fakeNow: '2026-09-10' })
  check('SC4', 'exit 1', r.code === 1, `code=${r.code}`)
  check('SC4', 'stdout có BAD-DATE old-tool', r.out.includes('BAD-DATE old-tool'), r.out.slice(0, 300))
  rmSync(repo, { recursive: true, force: true })
}

// SC5: FAKE_NOW quá hạn → EXPIRED
{
  console.log('\n== SC5 fake-now-qua-han ==')
  const repo = tempDir('sc5')
  initRepo(repo, { [KIT]: baseKit }, {
    [KIT]: kitJson([
      { name: 'new-tool', type: 'bin', description: 'new', alias_of: 'old-tool' },
      { name: 'kept-tool', type: 'bin', description: 'kept' },
    ]),
    'docs/superpowers/migrations/2026-01-01-old-tool.md': GOOD_GUIDE('old-tool', 'new-tool', '2026-03-01'),
  })
  const r = runLint(repo, 'main', { fakeNow: '2026-09-10' })
  check('SC5', 'exit 1', r.code === 1, `code=${r.code}`)
  check('SC5', 'stdout có EXPIRED old-tool', r.out.includes('EXPIRED old-tool'), r.out.slice(0, 300))
  rmSync(repo, { recursive: true, force: true })
}

// SC6: FAKE_NOW còn <14 ngày → exit 0 + WARN days
{
  console.log('\n== SC6 con-13-ngay ==')
  const repo = tempDir('sc6')
  initRepo(repo, { [KIT]: baseKit }, {
    [KIT]: kitJson([
      { name: 'new-tool', type: 'bin', description: 'new', alias_of: 'old-tool' },
      { name: 'kept-tool', type: 'bin', description: 'kept' },
    ]),
    'docs/superpowers/migrations/2026-01-01-old-tool.md': GOOD_GUIDE('old-tool', 'new-tool', '2026-09-23'),
  })
  const r = runLint(repo, 'main', { fakeNow: '2026-09-10' })
  check('SC6', 'exit 0', r.code === 0, `code=${r.code} out=${r.out.slice(0, 200)}`)
  check('SC6', 'WARN 13 days', r.out.includes('WARN surface-lint:') && r.out.includes('13 days'), r.out.slice(0, 300))
  rmSync(repo, { recursive: true, force: true })
}

// SC7: docs slug đổi thiếu redirect → MISSING-REDIRECT
{
  console.log('\n== SC7 docs-slug-thieu-redirect ==')
  const repo = tempDir('sc7')
  initRepo(repo, { [META]: metaBase }, {
    [META]: JSON.stringify({ title: 'Recipes', pages: ['alpha-renamed', 'beta'] }),
  })
  const r = runLint(repo, 'main')
  check('SC7', 'exit 1', r.code === 1, `code=${r.code} out=${r.out.slice(0, 200)}`)
  check('SC7', 'stdout có MISSING-REDIRECT alpha', r.out.includes('MISSING-REDIRECT alpha'), r.out.slice(0, 300))
  rmSync(repo, { recursive: true, force: true })
}

// SC8: no-op — không diff từ base → exit 0 "no diff"
{
  console.log('\n== SC8 no-op-no-diff ==')
  const repo = tempDir('sc8')
  initRepo(repo, { [KIT]: baseKit, [META]: metaBase }, {})
  git(repo, 'reset', '-q', '--hard', 'main') // feature = main, zero diff
  const r = runLint(repo, 'main')
  check('SC8', 'exit 0', r.code === 0, `code=${r.code} out=${r.out.slice(0, 200)}`)
  check('SC8', 'stdout "no diff from main"', r.out.includes('no diff from main'), r.out.slice(0, 200))
  rmSync(repo, { recursive: true, force: true })
}

// SC9: alias + guide đủ + expires xa → CLEAN exit 0 (đường vui chuẩn)
{
  console.log('\n== SC9 rename-day-du ==')
  const repo = tempDir('sc9')
  initRepo(repo, { [KIT]: baseKit }, {
    [KIT]: kitJson([
      { name: 'new-tool', type: 'bin', description: 'new', alias_of: 'old-tool' },
      { name: 'kept-tool', type: 'bin', description: 'kept' },
    ]),
    'docs/superpowers/migrations/2026-01-01-old-tool.md': GOOD_GUIDE('old-tool', 'new-tool', '2027-01-01'),
  })
  const r = runLint(repo, 'main', { fakeNow: '2026-09-10' })
  check('SC9', 'exit 0 CLEAN', r.code === 0 && r.out.includes('RESULT: CLEAN'), `code=${r.code} out=${r.out.slice(0, 200)}`)
  rmSync(repo, { recursive: true, force: true })
}

// SC10: docs slug có page cũ + redirect_to → không MISSING-REDIRECT, chỉ đòi guide
{
  console.log('\n== SC10 docs-co-redirect ==')
  const repo = tempDir('sc10')
  initRepo(repo, { [META]: metaBase }, {
    [META]: JSON.stringify({ title: 'Recipes', pages: ['alpha-renamed', 'beta'] }),
    'docs/site/content/docs/recipes/alpha.mdx': '---\nredirect_to: /docs/recipes/alpha-renamed\n---\n\nOld page.\n',
    'docs/superpowers/migrations/2026-01-01-alpha.md': GOOD_GUIDE('alpha', 'alpha-renamed', '2027-01-01'),
  })
  const r = runLint(repo, 'main', { fakeNow: '2026-09-10' })
  check('SC10', 'exit 0 (redirect đủ)', r.code === 0, `code=${r.code} out=${r.out.slice(0, 300)}`)
  check('SC10', 'KHÔNG MISSING-REDIRECT', !r.out.includes('MISSING-REDIRECT'))
  rmSync(repo, { recursive: true, force: true })
}

// SC11: guide thiếu 4 section → MISSING-GUIDE (guide có nhưng hỏng)
{
  console.log('\n== SC11 guide-thieu-section ==')
  const repo = tempDir('sc11')
  initRepo(repo, { [KIT]: baseKit }, {
    [KIT]: kitJson([
      { name: 'new-tool', type: 'bin', description: 'new', alias_of: 'old-tool' },
      { name: 'kept-tool', type: 'bin', description: 'kept' },
    ]),
    'docs/superpowers/migrations/2026-01-01-old-tool.md': '---\nsurface: kit\nold: old-tool\nnew: new-tool\nexpires: 2027-01-01\n---\n\nChỉ có text, không heading section.\n',
  })
  const r = runLint(repo, 'main', { fakeNow: '2026-09-10' })
  check('SC11', 'exit 1', r.code === 1, `code=${r.code}`)
  check('SC11', 'stdout có MISSING-GUIDE old-tool', r.out.includes('MISSING-GUIDE old-tool'), r.out.slice(0, 300))
  rmSync(repo, { recursive: true, force: true })
}

// SC12: đổi tên kit.json entry KHÔNG phải rename — thêm mới giữ cũ → CLEAN (thêm entry không xoá)
{
  console.log('\n== SC12 them-entry-moi ==')
  const repo = tempDir('sc12')
  initRepo(repo, { [KIT]: baseKit }, {
    [KIT]: kitJson([
      { name: 'old-tool', type: 'bin', description: 'old' },
      { name: 'kept-tool', type: 'bin', description: 'kept' },
      { name: 'brand-new', type: 'bin', description: 'new' },
    ]),
  })
  const r = runLint(repo, 'main')
  check('SC12', 'exit 0 CLEAN (thêm mới không đòi alias)', r.code === 0 && r.out.includes('RESULT: CLEAN'), `code=${r.code} out=${r.out.slice(0, 200)}`)
  rmSync(repo, { recursive: true, force: true })
}

// EXTRA: bin file deleted (không có trong provides trước) → MISSING-ALIAS theo tên file
{
  console.log('\n== EX bin-file-deleted ==')
  const repo = tempDir('ex1')
  initRepo(repo, { [KIT]: baseKit, [`${BIN_DIR}/ghost-bin`]: '#!/bin/sh\n' }, { [KIT]: baseKit })
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'delete ghost-bin')
  rmSync(join(repo, BIN_DIR, 'ghost-bin'))
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'rm ghost')
  const r = runLint(repo, 'main')
  check('EX', 'exit 1', r.code === 1, `code=${r.code} out=${r.out.slice(0, 300)}`)
  check('EX', 'stdout có MISSING-ALIAS ghost-bin', r.out.includes('MISSING-ALIAS ghost-bin'), r.out.slice(0, 300))
  rmSync(repo, { recursive: true, force: true })
}

// EXTRA: usage 2 args → exit 2
{
  console.log('\n== EX usage-2-args ==')
  const r = spawnSync(PY, [BIN, 'a', 'b'], { encoding: 'utf8', timeout: 15000 })
  check('EX', 'exit 2 usage', r.status === 2 && String(r.stdout || '').includes('usage:'), `status=${r.status} out=${r.stdout}`)
}

// EXTRA: FAKE_NOW sai format → crash fail-loud (không nuốt)
{
  console.log('\n== EX fake-now-bad-format ==')
  const repo = tempDir('ex3')
  initRepo(repo, { [KIT]: baseKit }, { [KIT]: kitJson([{ name: 'x', type: 'bin', description: 'x' }]) })
  const r = runLint(repo, 'main', { fakeNow: 'not-a-date' })
  check('EX', 'crash (exit != 0)', r.code !== 0 && r.code !== null, `code=${r.code}`)
  rmSync(repo, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
