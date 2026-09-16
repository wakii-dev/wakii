# FI-458 SF-2 Remote-safe verify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** story-verify B4 + story-resume thấy dest đã push từ máy khác — fetch remote dest trước merge-base, gated `distributed.enabled`, offline → fallback local `⚠ fetched-stale`, single-machine zero-diff.

**Architecture:** fetch-first on-demand trong verify/resume (không daemon); reuse pattern `dest_fetch_check` (story-launch — remote-detect + timeout + low-speed env); self-contained copies (installed `~/.claude/bin` không có lib); config đọc `~/.claude/story-kit.json` key `.distributed.enabled` (override `STORY_KIT_CONFIG` cho test).

**Tech Stack:** bash (kit bin scripts), python3 inline (config/JSON), git plumbing (`merge-base --is-ancestor`, FETCH_HEAD guard), test harness pattern `tests/test-story-launch-claim.sh` (mktemp bare repo + PASS/FAIL counter).

**Linear Issue:** FI-460 · **Spec:** `docs/superpowers/specs/2026-09-14-fi458-sf-2-remote-safe-verify-design.md` · **Code repo:** `~/Desktop/projects/story-team-kit` nhánh `sf-2-remote-safe-verify` (base `sf-1-claim-core-distributed` @ 8ee9a4a)

**Convention kit:** commit `feat(fi458-sf2): ... (T#)` · KHÔNG stage `bin/story-launch` (dirty left-over SF-1 không thuộc SF-2) · KHÔNG đụng vendored orca (SF-4) · test exit 0 chỉ khi MỌI PASS.

---

### Task 1: b4-fetch-gated-after-enabled — B4 fetch-first gated

**Files:**
- Modify: `bin/story-verify` (khối B4 ~line 233-236 → tách hàm `b4_check` + gọi)
- Create: `tests/test-story-verify-b4-fetch.sh`

- [x] **Step 1.1: RED — viết test trước** `tests/test-story-verify-b4-fetch.sh`: mktemp bare origin + clone worktree giả; extract `b4_check` (sed pattern `test-story-resume.sh`); R1: STORY_KIT_CONFIG `distributed.enabled=true`, máy B push dest tiến → `b4_check` in PASS (local dest cũ, HEAD ancestor FETCH_HEAD); R2: enabled=false → verdict local, **không gọi fetch** (đếm qua fake `git` wrapper ghi log); R5: HEAD chưa merge, remote dest không chứa HEAD → FAIL đúng.

- [x] **Step 1.2: RED check** — chạy `tests/test-story-verify-b4-fetch.sh` → FAIL (b4_check chưa tồn tại)

- [x] **Step 1.3: GREEN — implement** trong `bin/story-verify`:
```bash
dest_fetch_check() { # $1 repo $2 dest — pattern dest_fetch_check (story-launch); rc = git rc
  DEST_REMOTE="$(git -C "$1" config "branch.$2.remote" 2>/dev/null)"
  [ -n "$DEST_REMOTE" ] || DEST_REMOTE=origin
  local fc # HTTPS treo câm → low-speed env cắt sau 30s (timeout cmd chỉ có Linux)
  fc=(git -C "$1" fetch "$DEST_REMOTE" "$2")
  command -v timeout >/dev/null 2>&1 && fc=(timeout 60 "${fc[@]}")
  FERR=$(GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=30 "${fc[@]}" 2>&1 1>/dev/null)
}
dc_enabled_read() { # stdout 0/1 — .distributed.enabled từ VERIFY_CFG_FILE (default 0)
  python3 -c "
import json,sys
try: print(int(bool(json.load(open(sys.argv[1])).get('distributed',{}).get('enabled',False))))
except Exception: print(0)" "$VERIFY_CFG_FILE" 2>/dev/null
}
b4_check() { # $1 wt $2 dest $3 enabled(0/1) → stdout PASS|FAIL; stderr ⚠ fetched-stale khi fetch fail
  local wt="$1" dest="$2" rt
  if [ "$3" = "1" ]; then
    if dest_fetch_check "$wt" "$dest"; then
      rt=$(git -C "$wt" rev-parse FETCH_HEAD 2>/dev/null) # chỉ đọc khi rc=0 — fetch cũ không nhiễm
      if [ -n "$rt" ] && git -C "$wt" merge-base --is-ancestor HEAD "$rt" 2>/dev/null; then echo PASS; return; fi
    else
      echo "fetched-stale (fetch ${DEST_REMOTE:-?}/$dest fail — verdict local)" >&2
    fi
  fi
  git -C "$wt" merge-base --is-ancestor HEAD "$dest" 2>/dev/null && echo PASS || echo FAIL
}
```
Khối B4 cũ trong `verify_sf` thay bằng:
```bash
  # B4 merged — HEAD là ancestor của nhánh đích; SF-2: distributed ON → fetch
  # dest trước (máy khác push merge); fail → local + ⚠ fetched-stale (không crash)
  b4=$(b4_check "$wt" "$dest" "$(dc_enabled_read)")
  b4_stale_msg=$(b4_check_msg)  # ⚠ line: đọc stderr qua temp nếu cần — dùng biến B4_NOTE set bởi b4_check
```
(thực hiện: `b4_check` ghi `B4_NOTE` trực tiếp thay vì stderr khi chạy thật; test extract vẫn thấy PASS/FAIL stdout)

- [x] **Step 1.4: GREEN check** — `tests/test-story-verify-b4-fetch.sh` → toàn PASS, exit 0

- [x] **Step 1.5: Commit** kit: `feat(fi458-sf2): B4 fetch-first gated sau distributed.enabled (T1)`

### Task 2: b4-zero-diff-regression — enabled=false zero-diff

**Files:**
- Modify: `tests/test-story-verify-b4-fetch.sh` (thêm case)

- [x] **Step 2.1: RED** — case R3: enabled=false + origin HỎNG (fetch sẽ fail nếu bị gọi) → verdict PASS/FAIL đúng local + fetch-call count = 0; R4: config file hỏng/key thiếu → enabled=0 default. Chạy → FAIL (đếm chưa đúng hoặc verdict lệch).

- [x] **Step 2.2: GREEN** — đảm bảo path `enabled != 1` không chạm `git fetch` (code Task 1 đã tách; fix nếu test bắt được). Regression suite cũ chạy lại: `tests/test-story-resume.sh`, `tests/test-story-launch-config.sh` → exit 0.

- [x] **Step 2.3: Commit** kit: `test(fi458-sf2): zero-diff regression enabled=false — không fetch call (T2)`

### Task 3: fetch-fail-stale-fallback — offline không crash

**Files:**
- Modify: `bin/story-verify` (note stale vào detail line), `tests/test-story-verify-b4-fetch.sh`

- [x] **Step 3.1: RED** — case R6: distributed ON + origin trỏ file không tồn tại → `b4_check` trả verdict local, stderr/chuẩn chứa `fetched-stale`, exit 0 của b4_check (không crash); detail line story-verify thêm `⚠ fetched-stale` khi fetch fail (parse được).

- [x] **Step 3.2: GREEN** — `verify_sf` detail nối `${b4_stale:+ ⚠ $b4_stale}`; message `⚠ fetched-stale` chuẩn 1 dòng.

- [x] **Step 3.3: GREEN check + Commit** kit: `feat(fi458-sf2): fetch fail → stale fallback verdict local + ⚠ fetched-stale (T3)`

### Task 4: resume-dest-fetch — story-resume dest check cùng pattern

**Files:**
- Modify: `bin/story-resume` (helper `dest_remote_note` + build_prompt nối cảnh báo)
- Modify: `tests/test-story-resume.sh` (mở rộng case D-series)

- [x] **Step 4.1: RED** — D1: distributed ON + remote dest tiến hơn local (bare origin fixture) → `build_prompt` output chứa `⚠ dest đã tiến trên remote`; D2: enabled=false → prompt y nguyên + không fetch; D3: fetch fail → prompt nguyên + không crash.

- [x] **Step 4.2: GREEN** — `bin/story-resume` thêm (self-contained, cùng `dest_fetch_check` + `dc_enabled_read` pattern Task 1):
```bash
dest_remote_note() { # $1 wt $2 dest → stdout cảnh báo ("" = sạch/stale tắt/fetch fail)
  [ "$(dc_enabled_read)" = "1" ] || return 0
  if dest_fetch_check "$1" "$2"; then
    local rt; rt=$(git -C "$1" rev-parse FETCH_HEAD 2>/dev/null)
    if [ -n "$rt" ] && ! git -C "$1" merge-base --is-ancestor "$rt" "$2" 2>/dev/null; then
      echo "⚠ dest đã tiến trên remote (${DEST_REMOTE:-origin}/$2) — soi/pull trước khi resume"
    fi
  else echo "⚠ fetched-stale — dest local có thể cũ (fetch fail)"; fi
}
```
`build_prompt` nối `dest_note=$(dest_remote_note "$wt" "$dest")` → dòng riêng khi non-empty.

- [x] **Step 4.3: GREEN check + Commit** kit: `feat(fi458-sf2): story-resume dest fetch-first cảnh báo remote tiến (T4)`

### Task 5: resume-dest-fetch-e2e — 2 máy mô phỏng

**Files:**
- Create: `tests/test-story-resume-dest-e2e.sh`

- [x] **Step 5.1: RED** — e2e fixture: bare origin + cloneA (máy A) + cloneB (máy B), config `distributed.enabled=true` qua STORY_KIT_CONFIG; E1: B commit + push dest → A chạy flow (b4_check trên cloneA + dest_remote_note) → PASS nhờ fetch + cảnh báo hiện; E2: chặn fetch (origin → .death) → A fallback local + stale note, exit 0; E3: enabled=false full-pipeline → không fetch call, output khớp baseline pre-feature (so output strings).

- [x] **Step 5.2: GREEN** — fix những gì e2e bắt được (tên biến, guard FETCH_HEAD, note format).

- [x] **Step 5.3: Full suite** — mọi test kit liên quan: `test-story-verify-b4-fetch.sh` + `test-story-resume.sh` + `test-story-resume-dest-e2e.sh` + regression `test-story-launch-config.sh`, `test-story-launch-claim.sh`, `test-watchdog-launch-next.sh` → toàn exit 0.

- [x] **Step 5.4: Sync installed** — copy `bin/story-verify`, `bin/story-resume` → `~/.claude/bin/` (script chạy thật dùng bản này) + verify `diff -q` khớp.

- [x] **Step 5.5: Commit** kit: `test(fi458-sf2): e2e 2-máy mô phỏng fetch-first verify+resume (T5)` + evidence `docs/superpowers/evidence/sf-2-remote-safe-verify/test-run.txt` (orca worktree — chứa kit commit hash + `tdd: RED→GREEN` từng task)

---

## Rolling review nhóm (user protocol 2b)
- **Nhóm A** (T1-T3 — story-verify B4 path): dispatch code-reviewer độc lập trên diff `8ee9a4a..<T3-commit>` bin/story-verify + test file → fix verdict trước nhóm B
- **Nhóm B** (T4-T5 — resume path): dispatch code-reviewer độc lập trên diff T4-T5 → fix trước merge

## Gate cuối SF (user protocol 2c/3/4/5)
1. Kit suite exit 0 toàn bộ → evidence file (đủ hash + tdd line)
2. story-verify (bản installed) chạy trên orca worktree → B1/B2/B2b/B3→APPROVED/B4→PASS
3. Merge: orca `wakii-dev/sf-2-remote-safe-verify` → `story/fi458-distributed-bracket` (merge-ngược + ancestor-guard, KHÔNG main, KHÔNG story branch xoá)
4. `~/.claude/bin/story-verify sf-2-remote-safe-verify` → sạch → FI-460 Done
