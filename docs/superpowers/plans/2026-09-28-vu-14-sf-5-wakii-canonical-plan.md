# VU-14 SF-5 .wakii canonical, retire bracket — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps dùng checkbox (`- [ ]`).

**Goal:** .wakii trở thành nguồn sự thật của story workflow — wakii-validate thay story-validate; launch/verify/status/top/watchdog/coordinator-pass derive từ .wakii; Story tab (app) đọc mindmaps/*.wakii; updater sửa state in-place không đè phần người; story cũ migrate 1 lần bằng bootstrap; bracket đã migrate + story-validate retired.

**Architecture:** giữ nguyên hợp đồng exits/stdout (--json shape story-verify, verdict OK/INVALID wakii-validate); schema v1 KHÔNG đổi (chỉ thêm optional `meta.worktreeModel`); field ownership: structure/knowledge = người, state/evidence/generatedAt = machine (updater in-place); consumer đọc mindmaps/*.wakii với brackets/*.md fallback cho story CHƯA migrate (VI-1 giữa run — cấm ép migrate).

**Tech Stack:** bash + python3 inline (kit bins), node zero-dep (wakii-validate clone pattern story-mindmap decoder), test harness `tests/*.mjs` (node:test-free PASS/FAIL counter, spawn bin thật), vitest + ts (app RPC scanner).

**Linear Issue:** FI-43 · **Spec:** docs/superpowers/specs/2026-09-27-mindmap-wakii-viewer-design.md §11 · **Context pack:** docs/superpowers/contexts/vu-14-mindmap-wakii/sf-5.md

**Convention:** commit `feat(kit)/fix(kit)/feat(wakii)...` atomic per task; KHÔNG commit pnpm-lock.yaml; test kit chạy `PYTHONUTF8=1 node tests/<x>.mjs`; app test `pnpm vitest run --config config/vitest.config.ts <paths>`; `pnpm tc` typecheck.

---

### Task 1: wakii-validate-bin — bin mới thay story-validate

**Files:**
- Create: `kit/bin/wakii-validate` (node zero-dep)
- Create: `kit/tests/wakii-validate-tests.mjs`
- Modify: `kit/kit.json` (thêm provides entry)

- [x] **Step 1.1 RED** — test fixture .wakii: OK / INVALID mỗi luật §3 (magic, version, meta thiếu, node thiếu id/kind/title, edge thiếu from/to/rel, duplicate id, dangling edge, dangling parent, self-loop, >5MB, không epic, không SF) / WARN: linear-deferred (không key) + tier-derivation lệch / `--linear` key rỗng → WARN skip exit 0 / usage exit 2 / `--json` shape {verdict,sf_count,fails,warns} / `--resolve-primary` port contract (explicit hit, miss exit 1).
- [x] **Step 1.2 GREEN** — bin: decoder port từ story-mindmap decodeWakii (INVALID toàn file); + checks story-level: ≥1 sf node; linear format `<TEAM>-<số>` FAIL; deps từ edges depends-on → cycle FAIL, tier ≠ 1+max(dep tier) WARN; `--linear` GraphQL check (rate-limit + no-key fail-open WARN); `--resolve-primary` port VERBATIM từ story-validate (caller SKILL.md giữ contract). Exit 0/1/2 như story-validate.
- [x] **Step 1.3** — provides[] + wakii-validate; chạy test suite xanh; commit.

### Task 2: state-updater-inplace — cập nhật state không đè phần người

**Files:**
- Modify: `kit/bin/story-mindmap` (chế độ `--update-state <file.wakii>`)
- Create: `kit/tests/story-mindmap-update-state-tests.mjs`

- [x] **Step 2.1 RED** — fixture .wakii có notes[]/summary/acceptance sửa tay + state cũ → chạy updater với orchestration state mới → notes/summary/acceptance/titles/edges/steps/files GIỮ NGUYÊN byte-for-byte (stable compare); chỉ node.state (sf/task/epic), evidence, generatedAt, decodeWarnings đổi; idempotent (chạy 2 lần → file không đổi khi state không đổi); epic derive complete khi mọi SF done; orchestration chết → exit 0 + warning, không ghi.
- [x] **Step 2.2 GREEN** — `--update-state`: đọc file, decodeWakii gate (file INVALID → exit 1 không đè); states từ `readOrcaStates` (task-list SF-N match); ghi CHỈ state-machine-owned fields; ghi atomic + idempotent theo generatedAt rule.
- [x] **Step 2.3** — field-ownership table ghi ở header bin (structure/knowledge = người; state/evidence/generatedAt = machine); commit.

### Task 3: story-launch-wakii-derive — launch đọc .wakii

**Files:**
- Modify: `kit/bin/story-launch` (`--wakii <file>`; discovery mindmaps trước, brackets fallback)
- Modify: `kit/tests/story-launch-tests.mjs` (case .wakii)

- [x] **Step 3.1 RED** — test: `--wakii` parse title/linear/deps/dest/epic từ nodes+edges+meta (python inline); deps Done check qua depends-on edges + linear; discovery không `--bracket/--wakii` tìm mindmaps/*.wakii trước brackets/*.md; prompt trỏ .wakii; WTMODEL từ meta.worktreeModel (thiếu → legacy behavior); dry-run không ghi.
- [x] **Step 3.2 GREEN** — parse .wakii bằng python3 json (bash không parse JSON); giữ `--bracket` cho story legacy; mindmap-trigger gọi giữ nguyên.
- [x] **Step 3.3** — kiểm story-distributed-claim `--list-claims` vẫn chạy với bracket path (fallback legacy); commit.

### Task 4: story-verify-wakii-derive — B3/B4 derive từ .wakii

**Files:**
- Modify: `kit/bin/story-verify` (fallback bracket glob → mindmaps .wakii first)
- Modify: `kit/tests/story-verify-tests.mjs` (case derive .wakii)

- [x] **Step 4.1 RED** — test: worktree KHÔNG có bracket, CHỈ có .wakii → B3/B4/B5 derive đúng linear+dest (hết FI-246 class); story-level derive loop đọc mindmaps/*.wakii nodes linear; exit contract 0/1/2 + --json shape KHÔNG ĐỔI.
- [x] **Step 4.2 GREEN** — helper đọc .wakii (python3): epic→linear map từ nodes; dest từ meta.dest; ưu tiên orca metadata như cũ, .wakii thay bracket ở lớp fallback cuối.
- [x] **Step 4.3** — commit.

### Task 5: watchdog-coordinator-wakii — status/top/watchdog/coordinator-pass derive .wakii

**Files:**
- Modify: `kit/bin/story-status` (registry mindmaps trước, brackets fallback)
- Modify: `kit/bin/story-watchdog` (launch-next + renew + enforce_done đọc .wakii; gate wakii-validate fail-closed)
- Modify: `kit/bin/story-coordinator-pass` (find_bracket → mindmaps `<epic>-*.wakii` trước)
- Modify: `kit/tests/story-launch-tests.mjs` / qa suites nếu assert watchdog message

- [x] **Step 5.1 RED** — test launch-next: .wakii-only repo → SF rows từ nodes+edges, dest/epic từ meta, wakii-validate gate (bin thiếu → SKIP mọi story), STORY-COMPLETE derive; story-status in story từ .wakii.
- [x] **Step 5.2 GREEN** — watchdog awk bracket → python3 parse .wakii (sf-N node: title/linear; deps từ edges depends-on; dest/epic meta); story-top KHÔNG đọc bracket (không đổi — ghi chú plan). Fix phụ: python subprocess seam .sh/bash (story-coordinator-pass + story-ownership-probe) — Windows không exec stub shebang, 64/64 từ baseline 28/36.
- [x] **Step 5.3** — commit.

### Task 6: story-tab-wakii-parser — app đọc mindmaps/*.wakii

**Files:**
- Create: `src/main/superpowers/wakii-story-parse.ts` (decode .wakii → story projection + decodeWarnings)
- Modify: `src/main/runtime/rpc/methods/superpowers-story-list.ts` (scanner mindmaps trước, brackets fallback)
- Modify: `src/main/runtime/rpc/methods/superpowers-story-detail.ts` (detail từ .wakii)
- Create/Modify tests: `wakii-story-parse.test.ts` + list/detail test fixtures .wakii

- [ ] **Step 6.1 RED** — vitest: fixture .wakii golden → storyList storyId `mindmaps/<name>.wakii`, sfTotal từ sf nodes, linearIds từ nodes; detail sfs từ nodes + dependsOn từ edges, destination từ meta.dest; file hỏng → parseError entry không crash; bracket fallback cho story chưa migrate; wire shape KHÔNG ĐỔI (remote-wire-compat).
- [ ] **Step 6.2 GREEN** — implement; `pnpm tc` + vitest xanh.
- [ ] **Step 6.3** — commit.

### Task 7: migrate-existing-stories-bootstrap — bootstrap + migrate story cũ

**Files:**
- Modify: `kit/bin/story-mindmap` (`--bootstrap` alias của `--bracket` + meta.worktreeModel optional)
- Modify (repo): `docs/superpowers/mindmaps/*.wakii` mới cho story đã migrate
- Delete (repo): brackets ĐÃ migrate (trừ vi-1 — giữa run)
- Create: `kit/tests/story-mindmap-bootstrap-tests.mjs` (round-trip VI-1 fixture copy)

- [ ] **Step 7.1 RED** — round-trip: fixture copy bracket VI-1 + packs → `--bootstrap` → .wakii ra đủ 3 lớp khớp bracket → wakii-validate PASS.
- [ ] **Step 7.2 GREEN** — `--bootstrap` alias; migrate THẬT: brackets/ fi28, fi30, fi32, fi34, fi305, fi458, vu-14 → sinh .wakii + validate PASS; xoá bracket tương ứng (trừ vi-1); audit danh sách trong commit message.
- [ ] **Step 7.3** — commit.

### Task 8: retire-bracket-and-story-validate — xoá bin cũ + provides + rehash

**Files:**
- Delete: `kit/bin/story-validate`, `kit/tests/story-validate-tests.mjs`
- Modify: `kit/kit.json` (bỏ entry story-validate; rehash kitHash)
- Modify: `resources/plugins/launch/bundled-plugins.json` (rehash contentHash)
- Modify: consumer còn xài story-validate (watchdog đã đổi Task 5; SKILL.md Task 9)

- [ ] **Step 8.1** — precondition gate: wakii-validate tests xanh + migration xanh (đúng thứ tự boundary); xoá bin + tests + provides; scan suite không còn tham chiếu chết.
- [ ] **Step 8.2** — rehash kitHash + bundled contentHash (lockstep: verify-packaged-plugin-resources + plugin-launch-content.test.ts + kit-verify-manifest.mjs 25 asserts EXIT 0).
- [ ] **Step 8.3** — commit.

### Task 9: docs-story-format-wakii — SKILL.md + references

**Files:**
- Modify: `kit/skills/story-workflow/SKILL.md` (CREATE viết .wakii + wakii-validate; APPROVE đọc .wakii; resolve-primary caller đổi bin; checklist đổi bracket → .wakii)
- Modify: `kit/skills/orca-superpowers-workflow/SKILL.md` + references nhắc story-validate/bracket
- Modify: `AGENTS.md` (nếu nhắc bracket)

- [ ] **Step 9.1** — sweep `grep -rn "story-validate\|superpowers/brackets"` kit skills + docs repo; đổi tham chiếu theo format mới; giữ Note legacy-bracket-fallback.
- [ ] **Step 9.2** — kit-verify-manifest + skill manifest verify EXIT 0; commit.

### Task 10: verify — ACCEPTANCE battery + RULE 0 + review

- [ ] **Step 10.1** — kit suite TOÀN BỘ `PYTHONUTF8=1 node tests/*.mjs` exit 0; app: `pnpm tc` + vitest touched paths; lockstep + verify-packaged EXIT 0.
- [ ] **Step 10.2** — ACCEPTANCE 8 mục đối chiếu từng dòng (evidence vào docs/superpowers/evidence/sf-5-wakii-canonical/test-run.txt + HEAD).
- [ ] **Step 10.3 RULE 0** — ELECTRON `ORCA_BACKGROUND_LAUNCH=1`, CDP hidden renderer: Story tab/viewer render golden .wakii + decodeWarnings; screenshots `.evidence-sf5/`.
- [ ] **Step 10.4** — dispatch code-reviewer độc lập → `.review-verdict.md`; APPROVED mới READY-FOR-MERGE.
