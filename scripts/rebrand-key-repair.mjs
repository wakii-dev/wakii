#!/usr/bin/env node
/* eslint-disable curly, no-control-regex, no-unused-vars, prefer-template, no-useless-escape */ // one-shot rebrand tooling
// Repair locale key renames: derive từ HEAD, đúng case camel, restore false-positive substring.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const FILES = ['en', 'vi', 'de', 'fr', 'es', 'pt', 'ru', 'ko', 'ja', 'zh', 'zh-Hant', 'tr']
  .map((l) => `src/renderer/src/i18n/locales/${l}.json`)
  .concat(['src/renderer/src/i18n/en-runtime-required.json'])

// rename đúng luật segment: Orca→Wakii mọi vị trí camel; orca→wakii chỉ khi đầu segment & không theo chữ thường
const renameKey = (k) =>
  k
    .replace(/Orca/g, 'Wakii')
    .replace(/ORCA/g, 'WAKII')
    .replace(/(^|[^A-Za-z])orca(?![a-z])/g, '$1wakii')

const flatKeys = (o, p = '', m = []) => {
  for (const [k, v] of Object.entries(o)) {
    const path = p ? `${p}.${k}` : k
    if (v && typeof v === 'object') {
      flatKeys(v, path, m)
    } else {
      m.push(path)
    }
  }
  return m
}

const renameObjectKeys = (node, fixMap, p = '') => {
  if (!node || typeof node !== 'object') {
    return node
  }
  const out = Array.isArray(node) ? [] : {}
  for (const [k, v] of Object.entries(node)) {
    const path = p ? `${p}.${k}` : k
    const nk = fixMap.get(path) ?? k
    out[nk] = renameObjectKeys(v, fixMap, path)
  }
  return out
}

const allSegRenames = new Map()
const summary = []
for (const f of FILES) {
  const headRaw = execSync(`git show HEAD:${f}`, { maxBuffer: 1e8 }).toString()
  const head = JSON.parse(headRaw)
  const headKeys = flatKeys(head)
  const headSet = new Set(headKeys)
  const cur = JSON.parse(readFileSync(f, 'utf8'))
  const curKeys = flatKeys(cur)

  // fixMap: full-path → new full path (đổi key cuối + rebuild path cha)
  // Cách làm: map per-leaf-path rồi suy ra per-node rename (key cuối cùng trong path).
  const leafRenames = new Map() // curLeafPath → newLeafPath
  const segCounts = new Map()
  for (const ck of curKeys) {
    if (headSet.has(ck) || !/wakii/i.test(ck)) {
      continue
    }
    // tìm HEAD key: thay wakii/Wakii/WAKII về biến thể orca
    const pat = ck.replace(/wakii/gi, '[Oo][Rr][Cc][Aa]').replace(/[.]/g, '\\.')
    const re = new RegExp(`^${pat}$`)
    const matches = headKeys.filter((hk) => re.test(hk))
    if (matches.length !== 1) {
      console.log(`AMBIGUOUS (${matches.length}) ${f}: ${ck}`)
      continue
    }
    const hk = matches[0]
    const proper = renameKey(hk)
    const target = proper === hk ? hk : proper // false-positive → restore gốc; brand → rename đúng case
    leafRenames.set(ck, target)
    if (target !== hk) {
      const ks = hk.split('.')
      const ts = target.split('.')
      for (let i = 0; i < ks.length; i++) {
        if (ks[i] !== ts[i]) {
          const key = `${f}::${ks.slice(0, i + 1).join('.')}`
          segCounts.set(key, [ks[i], ts[i]])
        }
      }
    }
    summary.push(`${f.split('/').pop()}: ${hk} → ${target}`)
  }
  if (!leafRenames.size) {
    continue
  }

  // build node-level fixMap: path của node cha + key cuối
  const fixMap = new Map() // curNodePath → newKeyForThatNode
  for (const [ck, tk] of leafRenames) {
    const cs = ck.split('.')
    const ts = tk.split('.')
    for (let i = 0; i < cs.length; i++) {
      if (cs[i] !== ts[i]) {
        fixMap.set(cs.slice(0, i + 1).join('.'), ts[i])
      }
    }
  }
  const fixed = renameObjectKeys(cur, fixMap)
  writeFileSync(f, `${JSON.stringify(fixed, null, 2)}\n`)
  for (const [full, [a, b]] of segCounts) {
    allSegRenames.set(full, [a, b])
  }
}
// segment renames (global) cho call-site sync — chỉ lấy cặp segment thuần
const segs = new Map()
for (const [a, b] of allSegRenames.values()) {
  if (!segs.has(a)) segs.set(a, b)
}
writeFileSync(
  'scripts/rebrand-key-renames.json',
  JSON.stringify(
    [...segs.entries()].filter(([, b]) => /wakii|Wakii/.test(b)).map(([a, b]) => [a, b]),
    null,
    2
  )
)
console.log(
  `\n${summary.length} key repaired; ${segs.size} segment renames → scripts/rebrand-key-renames.json`
)
