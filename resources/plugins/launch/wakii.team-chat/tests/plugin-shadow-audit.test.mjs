// Shadow audit guard (FI-98 SF-D) — chấm dứt lớp bug "const orcaBin" (2 lần
// lịch sử: local const đè function module-level cùng tên → Layer-2 respawn
// nổ im, không stack rõ). Quy tắc: khai báo const/let X trong scope S mà tại
// call-site X(...) trong S HOẶC scope con lexical, innermost binding là shadow
// local, và X là function declaration module-level cùng file → violation.
// Fixture là CHUỖI trong file này (không tạo file thật — không đổi fingerprint).
// Chạy: orca plugin test . (runner nhặt *.test.mjs) hoặc node trực tiếp.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const PLUGIN_ROOT = dirname(fileURLToPath(import.meta.url))

// ── Scanner ────────────────────────────────────────────────────────────────

const IDENT = '[A-Za-z_$][\\w$]*'
const DECL_RE = new RegExp('\\b(?:const|let)\\s+(' + IDENT + ')\\b', 'g')
const FN_DECL_RE = new RegExp('\\bfunction\\s+(' + IDENT + ')\\b', 'g')
const CALL_RE = new RegExp('(?<![.\\w$])(' + IDENT + ')\\s*\\(', 'g')
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'new', 'delete', 'void', 'in', 'of', 'do', 'else', 'await', 'yield', 'case', 'throw', 'instanceof'])

// Bỏ comment + string/template/regex literal (giữ newline — line number không
// trôi). Regex literal được phát hiện theo ký tự đứng trước '/'.
function stripNonCode(src) {
  let out = ''
  let i = 0
  const n = src.length
  let mode = 'code'
  const tplStack = []
  const regexPrecedes = () => {
    let j = i - 1
    while (j >= 0 && /\s/.test(out[j])) j--
    if (j < 0) return true
    const ch = out[j]
    if ('(,=:[!&|?{};+*-<>%~^'.includes(ch)) return true
    // keyword đứng trước (return, typeof, ...) — check token
    const m = new RegExp('(' + IDENT + ')$').exec(out.slice(0, j + 1))
    return m ? KEYWORDS.has(m[1]) : false
  }
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (mode === 'code') {
      if (c === '/' && c2 === '/') { mode = 'line'; out += '  '; i += 2; continue }
      if (c === '/' && c2 === '*') { mode = 'block'; out += '  '; i += 2; continue }
      if (c === '/') {
        if (regexPrecedes()) { mode = 'regex'; out += '  '; i += 2; continue }
        out += c; i += 1; continue
      }
      if (c === "'") { mode = 'sq'; out += ' '; i += 1; continue }
      if (c === '"') { mode = 'dq'; out += ' '; i += 1; continue }
      if (c === '`') { mode = 'tpl'; tplStack.push(0); out += ' '; i += 1; continue }
      out += c; i += 1; continue
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += c } else { out += ' ' }
      i += 1; continue
    }
    if (mode === 'block') {
      if (c === '*' && c2 === '/') { mode = 'code'; out += '  '; i += 2; continue }
      if (c === '\n') out += c; else out += ' '
      i += 1; continue
    }
    if (mode === 'regex') {
      if (c === '\\') { out += '  '; i += 2; continue }
      if (c === '[') { mode = 'regex-class'; out += ' '; i += 1; continue }
      if (c === '/') { mode = 'code'; out += ' '; i += 1; continue }
      if (c === '\n') { mode = 'code'; out += c; i += 1; continue }
      out += ' '; i += 1; continue
    }
    if (mode === 'regex-class') {
      if (c === '\\') { out += '  '; i += 2; continue }
      if (c === ']') { mode = 'regex'; out += ' '; i += 1; continue }
      if (c === '\n') { mode = 'code'; out += c; i += 1; continue }
      out += ' '; i += 1; continue
    }
    if (mode === 'sq' || mode === 'dq') {
      if (c === '\\') { out += '  '; i += 2; continue }
      if (c === (mode === 'sq' ? "'" : '"')) { mode = 'code'; out += ' '; i += 1; continue }
      if (c === '\n') out += c; else out += ' '
      i += 1; continue
    }
    // template literal — '${' mở code lồng, '}' đóng theo depth
    if (c === '\\') { out += '  '; i += 2; continue }
    if (c === '`' && tplStack[tplStack.length - 1] === 0) { tplStack.pop(); mode = 'code'; out += ' '; i += 1; continue }
    if (c === '$' && c2 === '{') { tplStack.push(1); mode = 'code'; out += '  '; i += 2; continue }
    if (c === '\n') out += c; else out += ' '
    i += 1
  }
  return out
}

// Quét 1 nguồn đã-strip → danh sách violation { name, declScopeDepth, callLine }.
export function scanSource(src) {
  const text = stripNonCode(src)
  const violations = []
  const moduleFns = new Set()
  const scopes = [] // mỗi scope: Map name -> 'const-let' | 'function' | 'param'
  const events = []

  // vị trí '\n' trước offset — line number O(1) nhờ precompute
  const lineStarts = [0]
  for (let k = 0; k < text.length; k++) if (text[k] === '\n') lineStarts.push(k + 1)
  const lineOf = (offset) => {
    let lo = 0, hi = lineStarts.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1 }
    return lo + 1
  }

  // '(' mở khớp với offset đóng ')' ngay trước ev (dành cho arrow "(...) => {")
  const matchOpenParen = (closeOffset) => {
    let d = 0
    for (let j = closeOffset; j >= 0; j--) {
      if (text[j] === ')') d++
      else if (text[j] === '(') { d--; if (d === 0) return j }
    }
    return -1
  }
  const collectParams = (openOffset) => {
    let d = 0
    const names = []
    for (let j = openOffset; j < text.length; j++) {
      const ch = text[j]
      if (ch === '(') d++
      else if (ch === ')') { d--; if (d === 0) break }
      else if (d >= 1) {
        const m = new RegExp('^(' + IDENT + ')').exec(text.slice(j))
        if (m) {
          if (d === 1 && !KEYWORDS.has(m[1])) names.push(m[1])
          j += m[1].length - 1
        }
      }
    }
    return names
  }

  // gom events theo offset
  {
    let match
    const re1 = new RegExp(DECL_RE.source, 'g')
    while ((match = re1.exec(text))) events.push({ t: 'decl', name: match[1], offset: match.index })
    const re2 = new RegExp(FN_DECL_RE.source, 'g')
    while ((match = re2.exec(text))) events.push({ t: 'fn', name: match[1], offset: match.index })
    const re3 = new RegExp(CALL_RE.source, 'g')
    while ((match = re3.exec(text))) {
      if (!KEYWORDS.has(match[1])) events.push({ t: 'call', name: match[1], offset: match.index })
    }
    for (let k = 0; k < text.length; k++) {
      if (text[k] === '{') events.push({ t: 'open', offset: k })
      else if (text[k] === '}') events.push({ t: 'close', offset: k })
    }
  }
  events.sort((a, b) => a.offset - b.offset)

  const innermost = (name) => {
    for (let s = scopes.length - 1; s >= 0; s--) {
      const kind = scopes[s].get(name)
      if (kind) return { kind, scopeIdx: s }
    }
    return null
  }

  for (const ev of events) {
    if (ev.t === 'open') {
      const before = text.slice(Math.max(0, ev.offset - 600), ev.offset)
      let params = []
      if (/\)\s*=>\s*$/.test(before)) {
        const closeAbs = ev.offset - (before.length - before.lastIndexOf(')'))
        const open = matchOpenParen(closeAbs)
        if (open >= 0) params = collectParams(open)
      } else {
        const fnHead = /\bfunction\b\s*(?:async\s*)?[^(]*\(([^()]*)\)\s*$/.exec(before)
        if (fnHead) {
          for (const piece of fnHead[1].split(',')) {
            const id = new RegExp('(' + IDENT + ')\\s*$').exec(piece.replace(/\}$/, '').trim())
            if (id && !KEYWORDS.has(id[1])) params.push(id[1])
          }
        }
      }
      scopes.push(new Map())
      const cur = scopes[scopes.length - 1]
      for (const p of params) cur.set(p, 'param')
    } else if (ev.t === 'close') {
      scopes.pop()
    } else if (ev.t === 'fn') {
      if (scopes.length === 0) moduleFns.add(ev.name)
      else scopes[scopes.length - 1].set(ev.name, 'function')
    } else if (ev.t === 'decl') {
      if (scopes.length > 0) scopes[scopes.length - 1].set(ev.name, 'const-let')
    } else if (ev.t === 'call') {
      const b = innermost(ev.name)
      // const/let binding nào cũng nằm trong 1 scope đã push (root const trùng
      // tên function là SyntaxError — không tồn tại), nên không cần check depth.
      if (b && b.kind === 'const-let' && moduleFns.has(ev.name)) {
        violations.push({ name: ev.name, declScopeDepth: b.scopeIdx, callLine: lineOf(ev.offset) })
      }
    }
  }
  return violations
}

// ── Self-test fixture (RED phải bắt được bug-class, kể cả biến thể closure) ──

test('fixture: cùng scope shadow function module-level → bị bắt', () => {
  const src = [
    'function orcaBin() { return "orca" }',
    'async function handler() {',
    '  const orcaBin = process.env.ORCA_BIN || "orca"',
    '  await launch(orcaBin(), ["linear"])',
    '}',
  ].join('\n')
  const v = scanSource(src)
  assert.equal(v.length, 1)
  assert.equal(v[0].name, 'orcaBin')
  assert.equal(v[0].callLine, 4)
})

test('fixture: descendant scope (closure lồng) — class lỗi lịch sử → bị bắt', () => {
  const src = [
    'function orcaBin() { return "orca" }',
    'async function handler() {',
    '  const orcaBin = process.env.ORCA_BIN || "orca"',
    '  setTimeout(() => {',
    '    execFileCb(orcaBin(), ["terminal", "list"])',
    '  }, 100)',
    '}',
  ].join('\n')
  const v = scanSource(src)
  assert.equal(v.length, 1)
  assert.equal(v[0].name, 'orcaBin')
  assert.equal(v[0].callLine, 5)
})

test('clean: shadow KHÔNG được gọi như function (dùng như binary) → không vi phạm', () => {
  const src = [
    'function orcaBin() { return "orca" }',
    'async function handler() {',
    '  const orcaBin = process.env.ORCA_BIN || "orca"',
    '  await execFileCb(orcaBin, ["terminal", "list"])',
    '}',
    'function other() {',
    '  execFileCb(orcaBin(), ["x"])',
    '}',
  ].join('\n')
  assert.equal(scanSource(src).length, 0)
})

test('clean: param đè tên function module-level rồi gọi → là param, không vi phạm', () => {
  const src = [
    'function runKit(bin) { return bin }',
    'function caller(runKit) {',
    '  return runKit("team-chat")',
    '}',
  ].join('\n')
  assert.equal(scanSource(src).length, 0)
})

test('clean: example orcaBin() trong string/comment/regex không bị đọc là code', () => {
  const src = [
    'function orcaBin() { return "orca" }',
    '// KHÔNG đặt tên `orcaBin` ở đây: gọi orcaBin() sẽ nổ TypeError',
    'const note = "gọi orcaBin() sẽ nổ"',
    'const re = /orcaBin\\(/g',
    'function f() { return orcaBin() }',
  ].join('\n')
  assert.equal(scanSource(src).length, 0)
})

test('clean: arrow param destructuring với default không tạo false-positive', () => {
  const src = [
    'function log() {}',
    'export async function wakeRoomCaptain(room, deps = {}) {',
    '  const { inFlight = new Set(), log: lg = log } = deps',
    '  if (inFlight.has(room)) return null',
    '  inFlight.add(room)',
    '  try { lg("x") } finally { inFlight.delete(room) }',
    '}',
  ].join('\n')
  assert.equal(scanSource(src).length, 0)
})

// ── Audit thật: toàn bộ plugin source phải sạch ─────────────────────────────

function auditFiles() {
  const files = ['main.mjs', 'build-directives.mjs']
  const libDir = join(PLUGIN_ROOT, 'lib')
  if (existsSync(libDir)) {
    for (const f of readdirSync(libDir)) if (f.endsWith('.mjs')) files.push('lib/' + f)
  }
  return files
}

test('plugin source sạch bug shadow (main.mjs + lib/*.mjs + build-directives.mjs)', () => {
  const bad = []
  for (const f of auditFiles()) {
    const p = join(PLUGIN_ROOT, f)
    if (!existsSync(p)) continue
    const src = readFileSync(p, 'utf8')
    for (const v of scanSource(src)) {
      bad.push(`${f}: gọi "${v.name}()" bị shadow local (scope depth ${v.declScopeDepth}) tại dòng ${v.callLine}`)
    }
  }
  assert.deepEqual(bad, [], 'Shadow violations:\n' + bad.join('\n'))
})
