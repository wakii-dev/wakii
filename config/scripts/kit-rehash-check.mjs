#!/usr/bin/env node
// kit-rehash-check — fence cho failure mode "rehash sót" (04-10/10: 3 lần/tuần —
// kit/bin hay kit/skills staged mà kitHash (kit.json) + fingerprint (bundled)
// không đổi cùng commit → mọi consumer chết parse/khớp-sai).
// Repo-specific: wakii repo (husky pre-commit gọi). Không staged file kit → exit 0.
// Skip có chủ đích: KIT_REHASH_SKIP=1 (escape có ghi nhận — pattern WAKII_GUARD_OFF).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const requireCjs = createRequire(import.meta.url)
const { hashPackagedPluginTree } = requireCjs('./verify-packaged-plugin-resources.cjs')
const launcherMain = pathToFileURL(path.resolve('resources/plugins/launch/stablyai.orca-superpowers-launcher/main.mjs'))
const { computeKitHash } = await import(launcherMain)

const KIT_DIR = 'resources/plugins/launch/stablyai.orca-superpowers-launcher/kit'
const KIT_JSON = `${KIT_DIR}/kit.json`
const BUNDLED = 'resources/plugins/launch/bundled-plugins.json'
const LAUNCHER_DIR = 'resources/plugins/launch/stablyai.orca-superpowers-launcher'

const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' })
  .split('\n').map((l) => l.trim()).filter(Boolean)
const touchesKit = staged.some((f) => f.startsWith('resources/plugins/launch/'))
if (!touchesKit) process.exit(0)
if (process.env.KIT_REHASH_SKIP === '1') {
  console.log('kit-rehash-check: KIT_REHASH_SKIP=1 — bỏ qua (escape có ghi nhận)')
  process.exit(0)
}

const kitJson = JSON.parse(fs.readFileSync(KIT_JSON, 'utf8'))
const bundled = JSON.parse(fs.readFileSync(BUNDLED, 'utf8'))

const hints = []
const actualKitHash = computeKitHash(KIT_DIR)
if (kitJson.kitHash !== actualKitHash) {
  hints.push(
    `kitHash stale: kit.json=${kitJson.kitHash.slice(0, 8)} ≠ tree ${actualKitHash.slice(0, 8)}`,
  )
}
const actualFp = hashPackagedPluginTree(LAUNCHER_DIR)
const entry = bundled.plugins.find((x) => x.pluginKey === 'stablyai.orca-superpowers-launcher')
if (!entry || entry.contentHash !== actualFp) {
  hints.push(
    `fingerprint stale: bundled=${(entry?.contentHash ?? '—').slice(0, 8)} ≠ tree ${actualFp.slice(0, 8)}`,
  )
}
if (hints.length) {
  console.error(
    'kit-rehash-check FAIL — kit staged mà hash/fingerprint không khớp cây:\n' +
    hints.join('\n') +
    '\n\nfix:\n' +
    `  1. node --input-type=module -e "import {computeKitHash} from './${LAUNCHER_DIR}/main.mjs';console.log(computeKitHash('${KIT_DIR}'))"\n` +
    `  2. ghi kitHash vào ${KIT_JSON}\n` +
    `  3. node config/scripts/verify-packaged-plugin-resources.cjs — lấy fingerprint → ${BUNDLED}\n` +
    `  4. git add lại cả 2 file rồi commit lại\n` +
    `  (escape thật sự: KIT_REHASH_SKIP=1 git commit ... — có ghi nhận)`,
  )
  process.exit(1)
}
console.log('kit-rehash-check: kit hash + fingerprint khớp cây ✓')
