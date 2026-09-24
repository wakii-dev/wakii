#!/usr/bin/env node
// story-impact tests — map reverse-import + area grouping + vitest seam.
// Hermetic: temp git repo mỗi case, VITEST_BIN seam (không chạy vitest thật).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const bin = resolve(import.meta.dirname, '../kit/bin/story-impact')
let pass = 0, fail = 0
function check(caseId, name, cond, detail = '') {
  const ok = cond === true
  if (ok) pass++
  else fail++, console.log(`  [FAIL] ${caseId} ${name} — ${detail}`)
}
function run(args, cwd, env = {}) {
  try {
    const out = execFileSync('node', [bin, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') }
  }
}
function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}
function tempRepo(tag, files) {
  const dir = mkdtempSync(join(tmpdir(), `story-impact-${tag}-`))
  git(dir, 'init', '-q')
  git(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main')
  git(dir, 'config', 'user.email', 't@t')
  git(dir, 'config', 'user.name', 't')
  for (const [rel, content] of Object.entries(files.main)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), content)
  }
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'main')
  git(dir, 'checkout', '-qb', 'feature')
  for (const [rel, content] of Object.entries(files.branch)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), content)
  }
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'branch')
  return dir
}

// ══ case 1: reverse-import map + area grouping ══
{
  const dir = tempRepo('map', {
    main: {
      'src/feature-a/component-a.tsx': 'export const A = 1\n',
      'src/feature-a/component-a.test.ts': 'import { A } from "./component-a"\n',
      'src/feature-b/screen-b.tsx': 'import { A } from "../feature-a/component-a"\n',
      'src/feature-c/panel.tsx': 'import { A } from "@/feature-a/component-a"\n',
    },
    branch: { 'src/feature-a/component-a.tsx': 'export const A = 2\n' },
  })
  const r = run(['--base', 'main'], dir)
  check('c1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('c1', '1 file đổi', r.out.includes('1 file đổi'), r.out)
  check('c1', 'importer từ feature-b', r.out.includes('feature-b'), r.out)
  check('c1', 'importer qua alias @/ (feature-c)', r.out.includes('feature-c'), r.out)
  check('c1', 'test file được đếm riêng', r.out.includes('0 test)') || r.out.includes('test)'), r.out)
  check('c1', 'areas bị chạm nêu đủ', r.out.includes('feature-c') && r.out.includes('feature-b'), r.out)
  check('c1', 'in lưới vitest --related', r.out.includes('--related'), r.out)
  check('c1', 'limitation ghi thẳng', r.out.includes('TRỰC TIẾP'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

// ══ case 2: --json machine-readable ══
{
  const dir = tempRepo('json', {
    main: { 'src/x/lib.ts': 'export const k = 1\n', 'src/x/use.ts': 'import { k } from "./lib"\n' },
    branch: { 'src/x/lib.ts': 'export const k = 2\n' },
  })
  const r = run(['--base', 'main', '--json'], dir)
  check('c2', 'exit 0', r.code === 0, `code=${r.code}`)
  const data = JSON.parse(r.out)
  check('c2', 'changed đúng file', data.changed.length === 1 && data.changed[0].endsWith('lib.ts'), JSON.stringify(data.changed))
  check('c2', 'importer tìm thấy use.ts', data.impact[0].importers.some(g => g.files.some(f => f.endsWith('use.ts'))), JSON.stringify(data.impact))
  check('c2', 'affectedAreas có src/x', data.affectedAreas.includes('src/x'), JSON.stringify(data.affectedAreas))
  rmSync(dir, { recursive: true, force: true })
}

// ══ case 3: --run-tests qua VITEST_BIN seam (không vitest thật) ══
{
  const dir = tempRepo('run', {
    main: { 'src/y/lib.ts': 'export const v = 1\n' },
    branch: { 'src/y/lib.ts': 'export const v = 2\n' },
  })
  const stub = join(dir, 'fake-vitest.sh')
  writeFileSync(stub, '#!/bin/sh\necho "VITEST-STUB-RAN $*"\n')
  chmodSync(stub, 0o755)
  const r = run(['--base', 'main', '--run-tests', '--vitest-config', 'c.toml'], dir, { VITEST_BIN: stub })
  check('c3', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('c3', 'seam được gọi', r.out.includes('VITEST-STUB-RAN'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

// ══ case 4: snapshot dir (.cross-version-checkouts) KHÔNG bị đếm làm importer ══
{
  const dir = tempRepo('snapshot', {
    main: {
      'src/a/lib.ts': 'export const s = 1\n',
      'tests/e2e/.cross-version-checkouts/abc/x/src/a/lib.ts': 'export const s = 1\n',
    },
    branch: { 'src/a/lib.ts': 'export const s = 2\n' },
  })
  const r = run(['--base', 'main', '--json'], dir)
  const data = JSON.parse(r.out)
  const snapshotImporters = data.impact[0].importers.flatMap(g => g.files).filter(f => f.includes('.cross-version-checkouts'))
  check('c4', 'exit 0', r.code === 0, `code=${r.code}`)
  check('c4', 'snapshot không là importer (dogfood bug 24/09)', snapshotImporters.length === 0, JSON.stringify(data.impact[0]))
  rmSync(dir, { recursive: true, force: true })
}

// ══ case 5: --base sai → exit != 0, không im lặng ══
{
  const dir = tempRepo('bad', {
    main: { 'src/z/lib.ts': 'export const q = 1\n' },
    branch: { 'src/z/lib.ts': 'export const q = 2\n' },
  })
  const r = run(['--base', 'ref-khong-ton-tai'], dir)
  check('c4', 'exit != 0', r.code !== 0, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass + fail} asserts — ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
