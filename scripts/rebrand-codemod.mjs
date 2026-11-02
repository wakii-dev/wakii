#!/usr/bin/env node
/* eslint-disable curly, no-control-regex, no-unused-vars, prefer-template, no-useless-escape */ // one-shot rebrand tooling
// Rebrand Wakii Tier 2 — codemod. KHÔNG commit; captain review diff.
// Passes: locales | main | paths | tcall
//   locales : 12 locale JSON + en-runtime-required.json — key+value case-map, mask allowlist/trap
//   main    : src/main string-literal spans — prose Orca/ORCA/orca, mask allowlist/trap/identifier
//   paths   : Wakii.app → Wakii.app path map ngoài locales
//   tcall   : đồng bộ rename key i18n tại call-site translate paths (string spans)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(new URL('..', import.meta.url).pathname)
const mode = process.argv[2]
const DRY = process.argv.includes('--dry')

// ---- allowlist (verifier-synced) ----
const ALLOW = [
  /https?:\/\/[^\s"'`,;()[\]]*stablyai[^\s"'`,;()[\]]*/gi,
  /[^\s"'`,;()[\]]*stablyai[^\s"'`,;()[\]]*/gi,
  /orca:\/\//g,
  /\bORCA_[A-Z_]+\b/g,
  /@orca\/[\w.\-/]*/g
]
// ---- trap classes (never-touch by doctrine — residual report cho captain) ----
const TRAP = [
  /\$\{[^}]*\}/g, // template interpolation — code bên trong, không brand
  /\borca:[\w.-]+/g, // event/RPC channel names (orca:serve-ready) — wire identifiers
  /\b[\w-]*-orca\b/g, // trailing-hyphen enum values (opened-in-orca) — wire
  /\b\w*_orca\b/g, // trailing-underscore identifiers (invalid_orca, coordinator_orca)
  /[A-Za-z]:\\\\Orca\\\\/g, // Windows install dir C:\\Orca\\ (fixture/legacy path)
  /[A-Za-z]:\\Orca\\/g, // Windows install dir C:\Orca\
  /X-Orca-Agent-Hook-Token/g, // wire header — server chi nhan x-orca, khong fallback
  /X-Orca-Agent-Hook-Meta(?:-Encoding)?/g, // wire header metadata
  /# (?:BEGIN|END) ORCA AGENT STATUS HOOKS/g, // legacy profile markers — cleanup phai khop block cu
  /GNOME\s+Orca/g, // external product (GNOME screen reader)
  /\.orca(?![a-z])/g, // data/config dir ~/.orca, .orca/
  /\borca\.ya?ml\b/gi, // SSH remote config filename
  /[\w.-]*orca\.dev[\w./…-]*/gi, // first-party domains app.orca.dev / onorca.dev (onorca.dev approved)
  /\/orca-linear\b/g, // slash command
  /\borca(?:-[a-z]+)+/g, // hyphen compounds orca-linear, orca-shell-start
  /(['"`])orca\1(?!\s*:)/g, // quoted bare 'orca' — protocol values, CLI constants, hash values
  /\borca(?=\s+(?:--|-[a-z]|serve|account|worktree|terminal|orchestration))/g, // CLI invocations
  /\/orca(?![\w-])/g // path segment .../bin/orca, /usr/local/bin/orca
]

const maskSpans = (text, patterns) => {
  const saved = []
  let out = text
  for (const p of patterns) {
    out = out.replace(p, (m) => {
      saved.push(m)
      return `\x00${saved.length - 1}\x00`
    })
  }
  return { out, saved }
}
const unmask = (out, saved) => {
  let cur = out
  // mask lồng nhau (pattern sau nuốt sentinel của pattern trước) → restore nhiều lớp
  for (let i = 0; i < 10 && /\x00(\d+)\x00/.test(cur); i++) {
    cur = cur.replace(/\x00(\d+)\x00/g, (_, n) => saved[Number(n)])
  }
  return cur
}

const applyBrand = (s) =>
  s
    .replace(/\bOrca\b/g, 'Wakii')
    .replace(/\bORCA\b/g, 'WAKII')
    .replace(/\borca\b/g, 'wakii')

const transformLine = (line, { keyAware = false } = {}) => {
  const { out, saved } = maskSpans(line, [...ALLOW, ...TRAP])
  let t = applyBrand(out)
  if (keyAware) {
    // quoted KEYS (theo sau ':') — replace cả intra-word camelCase; bỏ key chứa orcad (never-touch)
    t = t.replace(/"([^"]*)"(?=\s*:)/g, (m, k) =>
      /orcad/i.test(k) ? m : `"${k.replace(/orca/gi, 'wakii')}"`
    )
  }
  return unmask(t, saved)
}

// ---- file walkers ----
const walk = (
  dir,
  exts,
  skip = new Set(['node_modules', 'dist', 'out', '.git', 'docs', 'tests', '__tests__'])
) => {
  const acc = []
  const rec = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name)
      if (e.isDirectory()) {
        if (!skip.has(e.name)) {
          rec(full)
        }
      } else if (!exts || exts.some((x) => e.name.endsWith(x))) {
        acc.push(full)
      }
    }
  }
  rec(dir)
  return acc
}

let changed = 0
const report = (f, before, after) => {
  if (before !== after) {
    changed++
    if (!DRY) {
      writeFileSync(f, after)
    }
    console.log(`M ${relative(ROOT, f)}`)
  }
}

if (mode === 'locales') {
  const files = [
    ...walk(join(ROOT, 'src/renderer/src/i18n/locales'), ['.json']),
    join(ROOT, 'src/renderer/src/i18n/en-runtime-required.json')
  ]
  for (const f of files) {
    const before = readFileSync(f, 'utf8')
    const after = before
      .split('\n')
      .map((l) => transformLine(l, { keyAware: true }))
      .join('\n')
    report(f, before, after)
  }
} else if (mode === 'main') {
  const files = walk(join(ROOT, 'src/main'), ['.ts', '.tsx', '.mts', '.cts'])
  const isTest = (n) => /(^|[.\-_])test[.\-_]|\.spec\.|(^|[.\-_])mock[.\-_]/i.test(n)
  // string-literal spans (single/double dòng đơn; backtick đa dòng)
  const SPAN = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g
  for (const f of files) {
    if (isTest(f.split('/').pop())) {
      continue
    }
    const before = readFileSync(f, 'utf8')
    const after = before.replace(SPAN, (span) => {
      const q = span[0]
      let body = span.slice(1, -1)
      // body trần đúng 'orca' (single/double-quote span) = protocol value / CLI constant — never-touch
      if (q !== '`' && body.trim() === 'orca') {
        return span
      }
      if (q === '`') {
        // interpolation code: transform string-literal spans BÊN TRONG ${...} (ternary/prose strings),
        // giữ nguyên identifier/code ngoài string
        body = body.replace(/\$\{([^}]*)\}/g, (whole, code) => {
          const inner = code.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, (ispan) => {
            const iq = ispan[0]
            const ibody = ispan.slice(1, -1)
            if (ibody.trim() === 'orca') {
              return ispan
            }
            const m = maskSpans(ibody, [
              ...ALLOW,
              ...TRAP,
              /\b\w*[a-z]Orca\w*\b/,
              /\b_+\w*orca\w*/gi,
              /\borca[a-z]{2,}\b/gi
            ])
            return iq + unmask(applyBrand(m.out), m.saved) + iq
          })
          return `\${${inner}}`
        })
      }
      const { out, saved } = maskSpans(body, [
        ...ALLOW,
        ...TRAP,
        /\b\w*[a-z]Orca\w*\b/,
        /\b_+\w*orca\w*/gi,
        /\borca[a-z]{2,}\b/gi
      ])
      return q + unmask(applyBrand(out), saved) + q
    })
    report(f, before, after)
  }
} else if (mode === 'paths') {
  const files = [
    ...walk(join(ROOT, 'src'), null, new Set(['node_modules', 'dist', 'out', '.git'])),
    ...walk(join(ROOT, 'config'), null),
    ...walk(join(ROOT, 'scripts'), null),
    ...walk(join(ROOT, '.github'), null),
    ...walk(join(ROOT, 'resources'), ['.cjs', '.mjs', '.js', '.json', '.yml', '.yaml', '.sh']),
    join(ROOT, 'package.json')
  ].filter((f) => !f.includes('i18n/locales'))
  for (const f of files) {
    const before = readFileSync(f, 'utf8')
    const after = before.replace(/Orca\.app/g, 'Wakii.app')
    report(f, before, after)
  }
} else if (mode === 'tcall') {
  // đồng bộ key rename tại call-site: chỉ trong quoted strings, replace theo SEGMENT chính xác
  const SEGS = new Map(
    JSON.parse(readFileSync(join(ROOT, 'scripts/rebrand-key-renames.json'), 'utf8'))
  )
  const SPAN = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g
  const files = [
    ...walk(
      join(ROOT, 'src'),
      ['.ts', '.tsx'],
      new Set(['node_modules', 'dist', 'out', '.git', 'locales'])
    )
  ].filter((f) => !f.includes('i18n/locales'))
  for (const f of files) {
    const before = readFileSync(f, 'utf8')
    const after = before.replace(SPAN, (span) => {
      const body = span.slice(1, -1)
      if (!body.includes('.')) {
        return span
      }
      const parts = body.split('.')
      let hit = false
      const mapped = parts.map((s) => {
        const t = SEGS.get(s)
        if (t === undefined) {
          return s
        }
        hit = true
        return t
      })
      return hit ? span[0] + mapped.join('.') + span[0] : span
    })
    report(f, before, after)
  }
} else if (mode === 'testfiles') {
  // brand-transform string literals TRONG test files chỉ định (fixture giữ qua trap);
  // line thứ 2+: danh sách file, mỗi dòng một path (relative ROOT)
  const list = readFileSync(process.argv[3] ?? '/tmp/testfiles-list.txt', 'utf8')
    .split('\n')
    .filter(Boolean)
  const SPAN = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g
  for (const rel of list) {
    const f = join(ROOT, rel)
    const before = readFileSync(f, 'utf8')
    const after = before.replace(SPAN, (span) => {
      const q = span[0]
      const body = span.slice(1, -1)
      if (q !== '`' && body.trim() === 'orca') {
        return span
      }
      const { out, saved } = maskSpans(body, [
        ...ALLOW,
        ...TRAP,
        /\b\w*[a-z]Orca\w*\b/,
        /\b_+\w*orca\w*/gi,
        /\borca[a-z]{2,}\b/gi
      ])
      let fixed = unmask(applyBrand(out), saved)
      // ngữ pháp: an Wakii → a Wakii
      fixed = fixed.replace(/\ban Wakii\b/g, 'a Wakii').replace(/\ban wakii\b/g, 'a wakii')
      return q + fixed + q
    })
    report(f, before, after)
  }
} else if (mode === 'grammar') {
  // an Wakii → a Wakii trên src + locales (sau pass chính)
  const files = [
    ...walk(
      join(ROOT, 'src'),
      ['.ts', '.tsx', '.json'],
      new Set(['node_modules', 'dist', 'out', '.git'])
    )
  ]
  for (const f of files) {
    const before = readFileSync(f, 'utf8')
    const after = before.replace(/an Wakii\b/g, 'a Wakii').replace(/an wakii\b/g, 'a wakii')
    report(f, before, after)
  }
} else {
  console.error(
    'usage: node rebrand-codemod.mjs <locales|main|paths|tcall|testfiles|grammar> [--dry]'
  )
  process.exit(2)
}
console.log(`\n${changed} file changed${DRY ? ' (dry)' : ''}`)
