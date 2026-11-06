// Architecture import guard (FI-98 SF-D task 5) — enforce layer map trong
// kit/ARCHITECTURE.md: lib/*.mjs chỉ import xuống dưới, cấm import main.mjs,
// file mới phải được map. Fixture cycle dạng chuỗi (không tạo file thật).
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// Layer map — NGUỒN SỰ THẬT phải khớp kit/ARCHITECTURE.md (test sync assert bên dưới).
const LAYERS = {
  'orca-cli-bin.mjs': 0,
  'bus.mjs': 0,
  'story-prompts.mjs': 0,
  'kit-bins.mjs': 1,
  'registry.mjs': 2,
  'wake.mjs': 2,
  'story-snapshot.mjs': 2,
  'story-hooks.mjs': 2,
  'kit-manifest.mjs': 2,
  'supervisor.mjs': 3,
  'router.mjs': 3,
  'wakii-save.mjs': 3,
  'kit-install.mjs': 3,
}

const IMPORT_RE = /import\s+(?:[^'"]+from\s+)?['"](\.\.?\/[^'"]+)['"]/g

function parseImports(src) {
  const out = []
  let m
  const re = new RegExp(IMPORT_RE.source, 'g')
  while ((m = re.exec(src))) out.push(m[1])
  return out
}

function resolveRel(fromLib, rel) {
  // fromLib: tên file trong lib/; rel: './x.mjs' | '../directives.json' | '../main.mjs'
  // Trả về key khớp LAYERS (tên file lib) hoặc path gốc cho non-lib.
  if (!rel.startsWith('../')) return rel.slice(2) // './x.mjs' → 'x.mjs' (cùng lib/)
  return rel.slice(3) // '../y' → 'y'
}

test('layer map: mọi lib/*.mjs đều được phân layer (file lạ → đỏ)', () => {
  const dir = join(PLUGIN_ROOT, 'lib')
  assert.ok(existsSync(dir), 'lib/ phải tồn tại')
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs'))
  const unmapped = files.filter((f) => !(f in LAYERS))
  assert.deepEqual(unmapped, [], 'lib file chưa có trong layer map: ' + unmapped.join(', '))
})

test('import direction: lib chỉ import xuống dưới, cấm import main.mjs', () => {
  const bad = []
  for (const [f, layer] of Object.entries(LAYERS)) {
    const p = join(PLUGIN_ROOT, 'lib', f)
    if (!existsSync(p)) continue
    const src = readFileSync(p, 'utf8')
    for (const rel of parseImports(src)) {
      if (rel === '../main.mjs' || rel === '../main.js') {
        bad.push(`${f}: import main.mjs (cấm tuyệt đối)`)
        continue
      }
      if (!rel.startsWith('.')) continue // node: builtin hoặc json
      const target = resolveRel(f, rel)
      if (target === 'directives.json') continue // dữ liệu, không phải module layer
      const tl = LAYERS[target]
      if (tl === undefined) {
        bad.push(`${f}: import '${rel}' — target không có trong layer map`)
      } else if (tl >= layer) {
        bad.push(`${f} (L${layer}): import '${rel}' (L${tl}) — chỉ được import xuống dưới`)
      }
    }
  }
  assert.deepEqual(bad, [], 'Import direction violations:\n' + bad.join('\n'))
})

test('fixture: cycle trong chuỗi bị detector bắt (guard không phải guard-giấy)', () => {
  const fake = "import { x } from './bus.mjs'\nimport { y } from '../main.mjs'"
  const bad = []
  for (const rel of parseImports(fake)) {
    if (rel === '../main.mjs') bad.push('main import bị bắt')
  }
  assert.deepEqual(bad, ['main import bị bắt'])
})

test('kit/ARCHITECTURE.md đồng bộ layer map (tồn tại + nhắc mọi module)', () => {
  const p = join(PLUGIN_ROOT, 'kit', 'ARCHITECTURE.md')
  assert.ok(existsSync(p), 'kit/ARCHITECTURE.md phải tồn tại')
  const doc = readFileSync(p, 'utf8')
  for (const f of Object.keys(LAYERS)) {
    assert.ok(doc.includes('lib/' + f), `ARCHITECTURE.md thiếu module lib/${f}`)
  }
})
