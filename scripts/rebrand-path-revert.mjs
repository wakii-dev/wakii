#!/usr/bin/env node
/* eslint-disable curly, no-control-regex, no-unused-vars, prefer-template, no-useless-escape */ // one-shot rebrand tooling
// Revert tcall dot-segment damage: '.orca'→'.wakii' và 'orca.yaml'→'wakii.yaml'
// theo diff-pair matching (+line position trong file hiện tại).
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const files = execSync('git diff --name-only src/', { maxBuffer: 1e8, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

let filesFixed = 0,
  linesFixed = 0
for (const f of files) {
  const diff = execSync(`git diff -U0 -- ${JSON.stringify(f)}`, {
    maxBuffer: 1e8,
    encoding: 'utf8'
  })
  if (!diff) {
    continue
  }
  const lines = readFileSync(f, 'utf8').split('\n')
  const targets = new Map() // lineNo (1-based) → replacement fn
  let curLine = 0
  const removed = []
  const added = []
  const flush = () => {
    // pair removed[i] ↔ added[i] khi counts bằng nhau
    const n = Math.min(removed.length, added.length)
    for (let i = 0; i < n; i++) {
      const R = removed[i],
        A = added[i],
        AText = A.text
      if (!/wakii/i.test(AText)) {
        continue
      }
      const hits = []
      // wakii.yaml → orca.yaml (HEAD zero legitimacy)
      if (/wakii\.yaml/.test(AText)) {
        hits.push([/wakii\.yaml/g, 'orca.yaml'])
      }
      // '.wakii' path tokens (leading-dot dir / .wakii/ in path) khi R có '.orca'
      if (/(^|[^.\w])\.wakii(\/|'| "|$|[,)])/.test(AText) && /\.orca/.test(R.text)) {
        hits.push([/(^|[^.\w])\.wakii(?=\/|'| "|$|[,)])/g, '$1.orca'])
      }
      for (const [re, rep] of hits) {
        // sanity: chỉ revert khi token gốc có trong removed line
        if (new RegExp(re.source).test(AText)) {
          targets.set(A.lineNo, { re, rep, R })
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
  if (!targets.size) {
    continue
  }
  let changedFlag = false
  for (const [lineNo, { re, rep }] of targets) {
    const idx = lineNo - 1
    const fresh = new RegExp(re.source, 'g')
    if (idx < lines.length && fresh.test(lines[idx])) {
      lines[idx] = lines[idx].replace(new RegExp(re.source, 'g'), rep)
      changedFlag = true
      linesFixed++
    }
  }
  if (changedFlag) {
    writeFileSync(f, lines.join('\n'))
    filesFixed++
    console.log('FIX', f)
  }
}
console.log(`\n${filesFixed} files, ${linesFixed} lines reverted`)
