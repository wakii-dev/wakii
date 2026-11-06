#!/usr/bin/env node
// Room linearIssue field (ruling CEO 06/11: 1 room ↔ 1 issue):
//  - panel.html: input #rmLinearIssue cạnh room name, dirty-bound, fillRoomMeta
//    nạp m.linearIssue, #saveRoomMeta gửi linearIssue trong meta
//  - main.mjs: roomCmd update whitelist nhận 'linearIssue' → ghi rooms.json
// Chạy: node tests/room-linear-issue-tests.mjs
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const PLUGIN = resolve(testsDir, '..')
const html = readFileSync(resolve(PLUGIN, 'panel.html'), 'utf8')
const mainJs = readFileSync(resolve(PLUGIN, 'main.mjs'), 'utf8')

let fail = 0
const results = []
function t(name, fn) {
  try { fn(); results.push('PASS ' + name) }
  catch (e) { fail++; results.push('FAIL ' + name + ' — ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed') }

t('roomMetaSec có input #rmLinearIssue cạnh #rmName', () => {
  const i = html.indexOf('id="roomMetaSec"')
  assert(i >= 0, 'không thấy roomMetaSec')
  const sec = html.slice(i, html.indexOf('</details>', i))
  const ni = sec.indexOf('id="rmName"')
  const li = sec.indexOf('id="rmLinearIssue"')
  assert(ni >= 0 && li > ni, '#rmLinearIssue phải nằm sau #rmName trong roomMetaSec')
})

t('rmLinearIssue nằm trong bindRoomMetaDirty', () => {
  const i = html.indexOf("['rmName', 'rmLinearIssue'")
  assert(i >= 0, 'bindRoomMetaDirty thiếu rmLinearIssue')
})

t('fillRoomMeta nạp m.linearIssue + cập nhật link #rmLinearLink', () => {
  const i = html.indexOf('function fillRoomMeta(')
  assert(i >= 0, 'không thấy fillRoomMeta')
  const body = html.slice(i, html.indexOf('roomMetaDirty = false', i))
  assert(body.includes("getElementById('rmLinearIssue').value = m.linearIssue || ''"), 'không nạp linearIssue')
  assert(body.includes('rmLinearLink'), 'không cập nhật link hiển thị')
})

t('#saveRoomMeta gửi linearIssue trong meta', () => {
  const i = html.indexOf("getElementById('saveRoomMeta').addEventListener")
  assert(i >= 0, 'không thấy saveRoomMeta handler')
  const body = html.slice(i, i + 1200)
  assert(/linearIssue:\s*document\.getElementById\('rmLinearIssue'\)\.value\.trim\(\)/.test(body), 'meta payload thiếu linearIssue')
})

t('main.mjs roomCmd update whitelist có linearIssue', () => {
  assert(/for \(const k of \[[^\]]*'linearIssue'[^\]]*\]\)/.test(mainJs), 'whitelist thiếu linearIssue')
})

t('rooms.json room cũ không có field vẫn parse OK (undefined, không migration)', () => {
  // cấu trúc room hiện tại không bắt buộc linearIssue — chỉ assert publish meta
  // truyền nguyên object (meta: rooms[c]) để panel đọc được field mới
  assert(/meta: rooms\[c\] \|\| null/.test(mainJs), 'publish rooms không truyền meta nguyên object')
})

for (const r of results) console.log(r)
console.log(fail ? `\n${fail} FAIL` : '\nALL PASS')
process.exit(fail ? 1 : 0)
