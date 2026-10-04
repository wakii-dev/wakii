# Orchestrated HITL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Worker TUI pane được spawn qua story-launch (acceptEdits) + bin `story-pane-watch` phát hiện 4 state (working/waiting-approval/blocked/idle-done) + BA Layer protocol cho coordinator — orchestration nắm nghiệp vụ như BA, tự trả câu có trong spec, relay user đúng business-judgment.

**Architecture:** detector là bin mới đọc tail pane qua stub-orca seam (fail-open), BA Layer là protocol/doc gán lên coordinator session (không phải hệ thống mới), relay hybrid C qua watchdog/coordinator-pass. Spec: `docs/superpowers/specs/2026-10-04-orchestrated-hitl-design.md` — executors đọc CẢ spec + plan.

**Tech Stack:** bash bins + inline node (pattern kit hiện có) · tests `*.mjs` với stub-orca seam (pattern story-launch-tests) · kit.json provides · rehash kitHash+fingerprint.

**Spec:** `docs/superpowers/specs/2026-10-04-orchestrated-hitl-design.md`

## Global Constraints

- CẤM `--agent claude` spawn — mọi worker hai bước acceptEdits (LUẬT 24/09, commit 4a429b7ebb)
- CẤM trailer `Co-Authored-By:` AI trong commit (user ruling 04/10 — AGENTS.md)
- Rehash thứ tự: bin → `computeKitHash` → kit.json → fingerprint (`hashPackagedPluginTree`) CUỐI; ĐÚNG CÂY worktree đang đứng (cấm absolute path repo khác)
- Gate chạy không qua pipe: `node tests/x.mjs > log 2>&1; echo $?`
- Commit: Conventional Commits tiếng Việt (AGENTS.md); kit file nằm trong oxlint ignores → `--no-verify` với lý do
- Bin fail-open: orca chết/thiếu data → trả rỗng + exit 0, không crash
- Detector bám handle + cwd, KHÔNG bám pane title

---

### Task 1: `story-pane-watch` — core classify 4 state (TDD stub-orca)

**Files:**
- Create: `resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin/story-pane-watch`
- Test: `resources/plugins/launch/stablyai.orca-superpowers-launcher/tests/story-pane-watch-tests.mjs`

**Interfaces:**
- Produces: CLI `story-pane-watch --story <hub-abs-path> [--json]` → stdout JSON array `[{worktree, handle, state, question}]`; exit 0 luôn (fail-open). States: `working|waiting-approval|blocked|idle-done|unknown`.
- Consumes (Task 3): watchdog/coordinator-pass đọc JSON này.

- [ ] **Step 1: Write failing tests**

Tạo `tests/story-pane-watch-tests.mjs` theo pattern story-launch-tests (check harness + stub-orca):

```js
// story-pane-watch tests — detector 4-state qua stub-orca seam.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(testsDir, '..')
const BIN = join(pluginRoot, 'kit', 'bin', 'story-pane-watch')

let pass = 0, fail = 0
const check = (id, name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  [PASS] ${id} ${name}`) }
  else { fail++; console.log(`  [FAIL] ${id} ${name}${detail ? ' — ' + detail : ''}`) }
}

// stub orca: worktree list trả 2 con của hub (lineage parent = hub id);
// terminal list trả handle theo wt; terminal read trả tail theo STUB_TAIL_<n> env (file JSON)
function makeStub(dir) {
  const stub = join(dir, 'orca-stub.sh')
  writeFileSync(stub, `#!/bin/sh
if [ "$1" = "worktree" ] && [ "$2" = "list" ]; then
  cat "\${STUB_WTLIST:?}"
  exit 0
fi
if [ "$1" = "terminal" ] && [ "$2" = "list" ]; then
  cat "\${STUB_TMLIST:?}"
  exit 0
fi
if [ "$1" = "terminal" ] && [ "$2" = "read" ]; then
  cat "\${STUB_READ:?}"
  exit 0
fi
exit 0
`, 'utf8')
  chmodSync(stub, 0o755)
  return stub
}

function runWatch(dir, env = {}) {
  const r = spawnSync('bash', [BIN, '--story', join(dir, 'hub'), '--json'], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, ...env },
  })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}
```

Case W1 (4 states đúng thứ tự ưu tiên blocked > waiting-approval > idle-done > working):

```js
console.log('== W1 classify 4 state ==')
{
  const dir = mkdtempSync(join(tmpdir(), 'spw-w1-'))
  // 4 worktree: blocked, waiting-approval, idle-done, working
  const wtlist = {
    worktrees: [
      { id: 'r::/x/sf-1-a', path: '/x/sf-1-a', lineage: { parentWorktreeId: 'r::/x/hub' } },
      { id: 'r::/x/sf-2-b', path: '/x/sf-2-b', lineage: { parentWorktreeId: 'r::/x/hub' } },
      { id: 'r::/x/sf-3-c', path: '/x/sf-3-c', lineage: { parentWorktreeId: 'r::/x/hub' } },
      { id: 'r::/x/sf-4-d', path: '/x/sf-4-d', lineage: { parentWorktreeId: 'r::/x/hub' } },
    ]
  }
  const tmlist = { terminals: [{ handle: 'term_w1' }] }
  const read = { terminal: { status: 'running', tail: [
    'CHECK? npx drizzle-kit push',
    'Do you want to proceed?',
    '❯ 1. Yes',
  ] } }
  // ... 4 bộ env: STUB_WTLIST dùng chung, STUB_READ đổi theo handle via wrapper script
```

Stub cần trả tail KHÁC NHAU theo handle → sinh stub nhận `STUB_READS` JSON map handle→tail:

```js
  const reads = JSON.stringify({
    term_w1: [{ terminal: { status: 'running', tail: ['CHECK? npx drizzle-kit push', 'Do you want to proceed?', '❯ 1. Yes'] } }],
    term_w2: [{ terminal: { status: 'running', tail: ['BLOCKED: acceptance sf-4 thiếu evidence — leo user'] } }],
    term_w3: [{ terminal: { status: 'running', tail: ['❯'] } }],
    term_w4: [{ terminal: { status: 'running', tail: ['✻ Forming… 30s · ↓ 2k tokens'] } }],
  })
  const stub = join(dir, 'orca-stub.sh')
  writeFileSync(stub, `#!/bin/sh
if [ "$1" = "worktree" ] && [ "$2" = "list" ]; then cat <<'J'
${JSON.stringify(wtlist)}
J
exit 0; fi
if [ "$1" = "terminal" ] && [ "$2" = "list" ]; then
  printf '%s' '{"terminals":[{"handle":"'$4'"}]}'
  # $4 không tồn tại ở vị trí này — terminal list thật trả mảng; stub trả handle giả theo lần gọi:
  printf '%s' '{"terminals":[{"handle":"term_w1"}]}'
  exit 0; fi
if [ "$1" = "terminal" ] && [ "$2" = "read" ]; then
  node -e 'const m=JSON.parse(process.env.STUB_READS);const h=process.env.STUB_LAST_HANDLE||"term_w1";process.stdout.write(JSON.stringify(m[h][0]))'
  exit 0; fi
exit 0
`, 'utf8')
```

⚠️ Ghi chú cho implementer: terminal list stub trả tĩnh 1 handle là ĐỦ cho W1 (mỗi wt gọi riêng); để phân biệt tail theo wt, bin truyền `STUB_LAST_HANDLE` không được — **thiết kế bin đọc tail 2 bước: `terminal list` lấy handle → `terminal read` tail**; stub map theo handle qua env STUB_READS với key = handle. Vì stub không biết handle của wt nào, bin phải xuất kèm handle trong JSON → test assert theo cặp (worktree, state) bất kỳ thứ tự:

```js
  const env = { ...process.env, STUB_READS: reads, ORCA_BIN: stub, PATH: join(dir, 'bin') + ':' + process.env.PATH }
  // bin gọi `orca` qua PATH — copy stub thành <dir>/bin/orca
  const r = runWatch(dir, env)
  const rows = JSON.parse(r.out)
  check('W1', '4 panes', Array.isArray(rows) && rows.length === 4, r.out.slice(0, 200))
  const byWt = Object.fromEntries(rows.map(x => [x.worktree, x.state]))
  check('W1', 'blocked', byWt['sf-1-a'] === 'blocked', JSON.stringify(byWt))
  check('W1', 'waiting-approval', byWt['sf-2-b'] === 'waiting-approval', JSON.stringify(byWt))
  check('W1', 'idle-done', byWt['sf-3-c'] === 'idle-done', JSON.stringify(byWt))
  check('W1', 'working', byWt['sf-4-d'] === 'working', JSON.stringify(byWt))
  rmSync(dir, { recursive: true, force: true })
}
```

Case W2 (fail-open — orca chết):

```js
console.log('== W2 fail-open ==')
{
  const dir = mkdtempSync(join(tmpdir(), 'spw-w2-'))
  const r = runWatch(dir, { ORCA_BIN: join(dir, 'nope') }) // bin dùng ORCA_BIN env trước PATH
  check('W2', 'orca chết → rỗng + exit 0', r.code === 0 && JSON.parse(r.out).length === 0, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}
```

- [ ] **Step 2: Run tests verify FAIL**

Run: `node tests/story-pane-watch-tests.mjs` (trong plugin dir)
Expected: FAIL (bin chưa tồn tại)

- [ ] **Step 3: Implement bin**

Tạo `kit/bin/story-pane-watch`:

```bash
#!/bin/bash
# story-pane-watch — detector 4-state cho worker panes của 1 story (Orchestrated HITL spec 04/10).
# Usage: story-pane-watch --story <hub-abs-path> [--json]
# Fail-open: orca chết/thiếu data → stdout "[]" + exit 0. Bám handle+cwd, KHÔNG bám title.
set -u
STORY=""; JSON=1
while [ $# -gt 0 ]; do
  case "$1" in
    --story) STORY="$2"; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$STORY" ] && [ -d "$STORY" ] || { echo "usage: story-pane-watch --story <hub-abs-path> [--json]"; exit 2; }

ORCA_BIN="${ORCA_BIN:-}"
[ -x "$ORCA_BIN" ] || ORCA_BIN="$(command -v orca 2>/dev/null || echo /opt/homebrew/bin/orca)"

HUB_ID=""; HUB_DIR="$(cd "$STORY" && pwd)"
WTS="$($ORCA_BIN worktree list --json 2>/dev/null)"
[ -n "$WTS" ] || { echo "[]"; exit 0; }

node -e '
const fs = require("fs"), cp = require("child_process"), path = require("path");
const hubId = process.argv[1], hubDir = process.argv[2], orca = process.argv[3];
const rows = JSON.parse(fs.readFileSync(0, "utf8")).result.worktrees;
const children = rows.filter(w => {
  if (!((w.lineage || {}).parentWorktreeId || "").startsWith(hubId.split("::")[0])) return false;
  const lin = (w.lineage || {}).parentWorktreeId === hubId;
  const sib = path.dirname(w.path || "") === path.dirname(hubDir) && /^sf-\d+-/.test(path.basename(w.path || ""));
  return lin || sib;
});
const out = [];
const sh = (args) => { try { return cp.execFileSync(orca, args, { encoding: "utf8", timeout: 20000 }); } catch { return ""; } };
const classify = (tail) => {
  const lines = (tail || []).filter(l => l && l.trim());
  const joined = lines.join("\n");
  if (/BLOCKED|APPROVAL-NEEDED|REQUIREMENT-GAP/i.test(joined)) return { state: "blocked", question: (joined.match(/.*(BLOCKED|APPROVAL-NEEDED|REQUIREMENT-GAP).*/i) || [""])[0].slice(0, 200) };
  if (/Do you want to proceed\?|❯\s*1\.\s*Yes|allow\?|permit/i.test(joined)) return { state: "waiting-approval", question: (lines[lines.length - 1] || "").slice(0, 200) };
  if (lines.length && /^❯\s*$/.test(lines[lines.length - 1].trim())) return { state: "idle-done", question: "" };
  if (lines.length) return { state: "working", question: "" };
  return { state: "unknown", question: "" };
};
for (const w of children) {
  const tmlist = sh(["terminal", "list", "--worktree", "id:" + w.id, "--json"]);
  let handle = "";
  try { handle = (JSON.parse(tmlist).result.terminals[0] || {}).handle || ""; } catch {}
  if (!handle) continue;
  const rd = sh(["terminal", "read", "--terminal", handle, "--json"]);
  let tail = [];
  try { tail = JSON.parse(rd).result.terminal.tail || []; } catch {}
  const { state, question } = classify(tail);
  out.push({ worktree: path.basename(w.path), handle, state, question });
}
process.stdout.write(JSON.stringify(out, null, 1));
' "$HUB_ID" "$HUB_DIR" "$ORCA_BIN"
```

⚠️ Implementer: node đọc worktree list từ **stdin** (bash truyền `$WTS` qua `echo "$WTS" | node ...` — chỉnh: `printf '%s' "$WTS" | node -e '...' hub hubDir orca`). Parser phải chấp nhận shape `{result:{worktrees}}` lẫn `{worktrees}`. Lineage match: ưu tiên `lineage.parentWorktreeId === hubFullId`; fallback same-folder + `sf-N-` prefix (worktree tạo tay không lineage — học VU-32).

- [ ] **Step 4: Run tests verify PASS**

Run: `node tests/story-pane-watch-tests.mjs`
Expected: PASS (W1 4 state + W2 fail-open)

- [ ] **Step 5: Commit**

```bash
git add kit/bin/story-pane-watch tests/story-pane-watch-tests.mjs
git commit --no-verify -m "feat(kit): story-pane-watch — detector 4-state worker panes (Orchestrated HITL spec 04/10)"
```

### Task 2: provides + INDEX + fail-open test hoàn thiện

**Files:**
- Modify: `kit/kit.json` (provides +1 → 75)
- Modify: `kit/INDEX.md` (§5 Giữ sống & chữa — thêm row)
- Test: `tests/story-pane-watch-tests.mjs` (W2 đã có)

**Interfaces:**
- Produces: provides entry `story-pane-watch` — kit-verify-manifest assert đủ.

- [ ] **Step 1: kit.json provides entry** (chèn sau `story-doctor`):

```json
{
  "name": "story-pane-watch",
  "type": "bin",
  "category": "infra",
  "description": "detector 4-state worker panes của 1 story (working/waiting-approval/blocked/idle-done) qua tail — Orchestrated HITL spec 04/10; fail-open; --story <hub>"
}
```

- [ ] **Step 2: INDEX.md** — thêm row vào §5:

```markdown
| `story-pane-watch` | Detector 4-state worker panes (working/waiting/blocked/idle) — mắt của HITL relay |
```

- [ ] **Step 3: manifest + suites**

Run: `node tests/kit-verify-manifest.mjs` + `node tests/story-pane-watch-tests.mjs` (plugin dir)
Expected: 30 PASS 0 FAIL + W-suite PASS

- [ ] **Step 4: Commit**

```bash
git add kit/kit.json kit/INDEX.md
git commit --no-verify -m "feat(kit): provides story-pane-watch (75) + INDEX row"
```

### Task 3: BA Layer protocol — SKILL.md + brief template

**Files:**
- Modify: `kit/skills/story-workflow/SKILL.md` (section mới sau END-STATE CONTRACT)

**Interfaces:**
- Produces: section `BA LAYER — orchestration nắm nghiệp vụ` — coordinator brief template trích dẫn được trong mọi brief sau.

- [ ] **Step 1: Thêm section** (nội dung theo spec §4.2 — chép nguyên 3 nhiệm vụ + ranh giới ruling B + audit rule):

```markdown
## BA LAYER — orchestration nắm nghiệp vụ như BA (04/10, ruling B)

Coordinator KHÔNG chỉ điều phối — là **BA của story**: nắm epic-why, spec, acceptance,
touch map, story-kb. Ba nhiệm vụ:

1. **Brief the-WHY** — context pack gửi worker phải có: tại sao tính năng tồn tại,
   ai dùng, acceptance nghĩa là gì. Worker định hướng được, không làm theo清单 mù.
2. **Phân xử câu hỏi worker** — câu HOW có trong spec/KB/touch map → TỰ TRẢ lời pane
   + **audit bắt buộc trích dẫn mục spec** (vd "BA auto-approve: migrate thuộc
   acceptance SF-4"); scope/rủi ro/priority/tiền → RELAY user kèm diễn giải
   tiếng-người + khuyến nghị. KHÔNG trích được nguồn → RELAY (cấm đoán).
3. **Nghiệm thu nghiệp vụ** — trước khi nói SF done: đối chiếu output với business
   acceptance (không chỉ tests xanh).

Relay hybrid C: user bấm pane trực tiếp khi nhìn thấy; pane-watch sweep là
safety-net — waiting/blocked không ai xử 1 sweep → relay notification + worktree
comment (câu hỏi đã diễn giải + handle + khuyến nghị).
```

- [ ] **Step 2: Brief template** — trong LAUNCH SF section thêm dòng yêu cầu brief có WHY (1 dòng trỏ section BA LAYER).

- [ ] **Step 3: Commit**

```bash
git add kit/skills/story-workflow/SKILL.md
git commit --no-verify -m "docs(kit): BA Layer protocol — coordinator nắm nghiệp vụ, phân xử theo ruling B"
```

### Task 4: rehash + full suite + wiring VU-32 (áp dụng thật)

**Files:**
- Modify: `kit/kit.json` (kitHash) + `resources/plugins/launch/bundled-plugins.json` (fingerprint)

- [ ] **Step 1: rehash ĐÚNG THỨ TỰ trên cây đang đứng** (bin → computeKitHash → kit.json → fingerprint CUỐI) — lệnh chuẩn đã dùng 4 lần hôm nay, cấm absolute path repo khác
- [ ] **Step 2: full suite**: manifest + story-launch-tests + story-doctor-tests + linear-rate-limit-tests + story-pane-watch-tests — TẤT CẢ exit 0 (không qua pipe)
- [ ] **Step 3: commit rehash + push branch `features/orchestrated-hitl`** (naming mới) → PR base wakii-dev → đòi MERGEABLE (contract)
- [ ] **Step 4: ÁP VU-32** — gửi coordinator brief bổ sung: BA Layer protocol (3 nhiệm vụ) + pane-watch JSON là nguồn state; kick recipe giữ nguyên
- [ ] **Step 5: watchdog deck v2.3** — tick gọi `story-pane-watch --story <hub-vu32> --json` thay chỉ đọc tail thủ công; relay pager khi state ≠ working

---

## Self-review checklist (implementer chạy trước khi báo xong)

- Spec coverage: §4.1→Task 1-2 · §4.2→Task 3 · §4.3→Task 3(wiring)+Task 4 · §4.4→đã có (không task mới) · §8 rollout→Task 4
- Type consistency: state strings đúng 4 giá trị mọi nơi; `--story` duy nhất là entry flag
- Cấm: placeholder TBD · trailer Co-Authored-By · pipe-nuốt-exit · absolute path repo khác khi rehash
