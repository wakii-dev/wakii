#!/usr/bin/env node
/* eslint-disable curly, no-control-regex, no-unused-vars, prefer-template, no-useless-escape */ // one-shot rebrand tooling
// P1: revert lowercase \bwakii\b → orca trong VALUE locale (CLI refs GT); giữ KEY-wakii + '.wakii' mindmap.
import { readFileSync, writeFileSync } from 'node:fs'

const FILES = ['en', 'vi', 'de', 'fr', 'es', 'pt', 'ru', 'ko', 'ja', 'zh', 'zh-Hant', 'tr']
  .map((l) => `src/renderer/src/i18n/locales/${l}.json`)
  .concat(['src/renderer/src/i18n/en-runtime-required.json'])

let n = 0
for (const f of FILES) {
  const lines = readFileSync(f, 'utf8').split('\n')
  const out = lines.map((line) => {
    if (!/\bwakii\b/.test(line)) {
      return line
    }
    // KEY chứa wakii ("wakii": {, "wakii-graph-nodes": …) — skip
    if (/"[A-Za-z0-9_-]*wakii[A-Za-z0-9_-]*"\s*:/.test(line) && !/:\s*"[^"]*\bwakii\b/.test(line)) {
      return line
    }
    // value chứa '.wakii' (mindmap file) — skip cả dòng
    if (/\.wakii/.test(line)) {
      return line
    }
    const after = line.replace(/\bwakii\b/g, 'orca')
    if (after !== line) {
      n++
    }
    return after
  })
  if (out.some((l, i) => l !== lines[i])) {
    writeFileSync(f, out.join('\n'))
  }
}
console.log(`${n} locale value lines reverted`)
