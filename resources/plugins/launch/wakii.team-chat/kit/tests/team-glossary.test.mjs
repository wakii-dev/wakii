#!/usr/bin/env node
// Glossary guard (FI-95 SF-A): mỗi mục GLOSSARY phải có dòng "Trong code"
// và mọi identifier nó trỏ tới phải tồn tại thật trong tree (file/identifier/
// commit) — không cho thuật ngữ sống chỉ trong docs.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const KIT = join(HERE, '..')
const PLUGIN = dirname(KIT)
const ok = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1) } }

const md = readFileSync(join(KIT, 'GLOSSARY.md'), 'utf8')

// 1) Bảng thuật ngữ: mọi dòng hàng có **Term** ở cột 1
const tableTerms = [...md.matchAll(/^\| \*\*(.+?)\*\* \|/gm)].map((m) => m[1])
ok(tableTerms.length >= 11, `bảng đủ 11 mục (got ${tableTerms.length}): ${tableTerms.join(',')}`)
ok(new Set(tableTerms).size === tableTerms.length, 'không trùng thuật ngữ')

// 2) Mục nào cũng có dòng "Trong code"
const codeLines = [...md.matchAll(/^- \*\*(.+?)\*\* — (.+)$/gm)]
const codeMap = new Map(codeLines.map((m) => [m[1], m[2]]))
const missing = tableTerms.filter((t) => !codeMap.has(t))
ok(missing.length === 0, `mục thiếu "Trong code": ${missing.join(',') || '(không)'}`)
const extra = [...codeMap.keys()].filter((t) => !tableTerms.includes(t))
ok(extra.length === 0, `"Trong code" thừa (không có trong bảng): ${extra.join(',') || '(không)'}`)

// 3) Mọi identifier trỏ tới phải tồn tại thật
const treeBlob = (() => {
  let blob = readFileSync(join(PLUGIN, 'main.mjs'), 'utf8')
  for (const sub of ['bin', 'agents', 'skills', 'tests']) {
    const walk = (dir) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name)
        if (ent.isDirectory()) walk(p)
        else blob += '\n' + readFileSync(p, 'utf8')
      }
    }
    walk(join(KIT, sub))
  }
  return blob
})()

for (const [term, ref] of codeMap) {
  const tokens = [...ref.matchAll(/`([^`]+)`/g)].map((m) => m[1])
  ok(tokens.length > 0, `"${term}" dòng Trong code có ít nhất 1 identifier backtick`)
  for (const tk of tokens) {
    if (/^kit\//.test(tk)) {
      ok(existsSync(join(KIT, tk.slice(4))), `"${term}": file ${tk} tồn tại`)
    } else if (/^[0-9a-f]{9,40}$/.test(tk)) {
      try { execFileSync('git', ['cat-file', '-e', `${tk}^{commit}`]) } catch {
        ok(false, `"${term}": commit ${tk} không tồn tại trong repo`)
      }
    } else if (/[/.]/.test(tk)) {
      const p = PLUGIN + '/' + tk
      ok(existsSync(p) || treeBlob.includes(tk), `"${term}": ${tk} là file thật hoặc literal trong code`)
    } else {
      ok(treeBlob.includes(tk), `"${term}": identifier \`${tk}\` có thật trong kit/main.mjs`)
    }
  }
}

console.log(`team-glossary: PASS (${tableTerms.length} mục, mọi "Trong code" trỏ identifier thật)`)
