#!/usr/bin/env node
/* eslint-disable curly, no-control-regex, no-unused-vars, prefer-template, no-useless-escape */ // one-shot rebrand tooling
// Align CLI-prose tokens về HEAD state (commit 566d5c2 đã Wakii-hóa 1 phần có chủ đích;
// tests at HEAD là ground truth). Chỉ đụng token CLI-prose, giữ nguyên rename khác trên cùng dòng.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

// [orca-form, wakii-form] — nào cũng thế nào thì HEAD dùng form đó
const CLASSES = [
  ['non-Orca command', 'non-Wakii command'],
  ['non-orca command', 'non-wakii command'],
  ['use Orca from', 'use Wakii from'],
  ['use orca from', 'use wakii from'],
  ['Orca launcher', 'Wakii launcher'],
  ['orca launcher', 'wakii launcher'],
  ['Orca dispatcher', 'Wakii dispatcher'],
  ['orca dispatcher', 'wakii dispatcher'],
  ['not managed by Orca', 'not managed by Wakii'],
  ['Orca CLI', 'Wakii CLI'],
  ['orca CLI', 'wakii CLI'],
  ['`orca`', '`wakii`'],
  ['orca plugin', 'wakii plugin'],
  ['orca serve', 'wakii serve'],
  ['orca.cmd', 'wakii.cmd'],
  ['orca.exe', 'wakii.exe']
]

const files = execSync('git diff --name-only src/', { maxBuffer: 1e8, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))

let nFiles = 0,
  nLines = 0
for (const f of files) {
  const diff = execSync(`git diff -U0 -- ${JSON.stringify(f)}`, {
    maxBuffer: 1e8,
    encoding: 'utf8'
  })
  if (!diff) {
    continue
  }
  const lines = readFileSync(f, 'utf8').split('\n')
  const fixes = new Map()
  let curLine = 0
  const removed = []
  const added = []
  const flush = () => {
    const n = Math.min(removed.length, added.length)
    for (let i = 0; i < n; i++) {
      const R = removed[i].text
      const A = added[i]
      if (!/wakii|Wakii/i.test(R) && !/[Oo]rca/.test(R)) {
        continue
      }
      for (const [orcaF, wakiiF] of CLASSES) {
        if (R.includes(wakiiF) && A.text.includes(orcaF)) {
          fixes.set(A.lineNo, { from: orcaF, to: wakiiF })
        } else if (R.includes(orcaF) && A.text.includes(wakiiF)) {
          fixes.set(A.lineNo, { from: wakiiF, to: orcaF })
        }
      }
    }
    removed.length = 0
    added.length = 0
  }
  for (const dl of diff.split('\n')) {
    const hunk = dl.match(/^@@ -\d+(?:,\d+)? \+(\d+)/)
    if (hunk) {
      flush()
      curLine = Number(hunk[1])
      continue
    }
    if (dl.startsWith('---') || dl.startsWith('+++') || dl.startsWith('diff ')) {
      continue
    }
    if (dl.startsWith('-')) {
      removed.push({ text: dl.slice(1) })
      continue
    }
    if (dl.startsWith('+')) {
      added.push({ text: dl.slice(1), lineNo: curLine })
      curLine++
      continue
    }
    if (dl.startsWith(' ')) {
      flush()
      curLine++
    }
  }
  flush()
  if (!fixes.size) {
    continue
  }
  let changedFlag = false
  for (const [lineNo, { from, to }] of fixes) {
    const idx = lineNo - 1
    if (idx < lines.length && lines[idx].includes(from)) {
      lines[idx] = lines[idx].split(from).join(to)
      changedFlag = true
      nLines++
    }
  }
  if (changedFlag) {
    writeFileSync(f, lines.join('\n'))
    nFiles++
    console.log('AL', f)
  }
}
console.log(`\n${nFiles} files aligned, ${nLines} lines`)
