#!/usr/bin/env node
/* eslint-disable curly, no-control-regex, no-unused-vars, prefer-template, no-useless-escape */ // one-shot rebrand tooling
// Warden P0-4 + Captain Q2: revert CLI-command/binary/token references về orca-naming
// (binary chưa rename — tier sau). Chỉ áp vào file ĐÃ modified (HEAD không có các token wakii-này).
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RULES = [
  [/com\.stablyai\.wakii/g, 'com.stablyai.orca'], // P0-2 identity
  [/com\.wakii\./g, 'com.orca.'], // native messaging host names
  [/app\.wakii\.local/g, 'app.orca.local'], // dev domains
  [/'wakii\.local'/g, "'orca.local'"],
  [/wakii\.d\.ts/g, 'orca.d.ts'],
  [/wakii\.exe/g, 'orca.exe'], // P0-4 bundled launcher / process names
  [/wakii\.cmd/g, 'orca.cmd'],
  [/wakii\.sh\b/g, 'orca.sh'],
  [/`wakii`/g, '`orca`'], // backticked CLI mentions
  [/wakii\.panels/g, 'orca.panels'],
  [/wakii plugin/g, 'orca plugin'],
  [/wakii serve/g, 'orca serve'],
  [/wakii profile/g, 'orca profile'],
  [/wakii worktree/g, 'orca worktree'],
  [/wakii account/g, 'orca account'],
  [/non-Wakii command/g, 'non-Orca command'],
  [/\ban Wakii launcher\b/g, 'an Orca launcher'],
  [/\ba Wakii launcher\b/g, 'an Orca launcher'],
  [/\bWakii launcher\b/g, 'Orca launcher'],
  [/\bWakii dispatcher\b/g, 'Orca dispatcher'],
  [/\bwakii dispatcher\b/g, 'orca dispatcher'],
  [/not managed by Wakii/g, 'not managed by Orca'],
  [/use Wakii from/g, 'use Orca from'],
  [/\bWakii shim\b/g, 'Orca shim'],
  [/\bwakii shim\b/g, 'orca shim'],
  [/Wakii suffixes/g, 'Orca suffixes'],
  [/\bWakii CLI\b/g, 'Orca CLI']
]

const files = execSync('git diff --name-only src/', { maxBuffer: 1e8, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))

let nFiles = 0,
  nLines = 0
for (const f of files) {
  const before = readFileSync(f, 'utf8')
  let after = before
  for (const [re, rep] of RULES) {
    after = after.replace(re, rep)
  }
  if (after !== before) {
    nLines += before.split('\n').filter((l, i) => l !== after.split('\n')[i]).length
    writeFileSync(f, after)
    nFiles++
    console.log('RV', f)
  }
}
console.log(`\n${nFiles} files reverted`)
