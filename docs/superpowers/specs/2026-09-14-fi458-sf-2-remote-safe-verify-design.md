# FI-458 SF-2 — Remote-safe verify (B4 fetch-first + resume dest check)

Spec nguồn: `docs/superpowers/specs/2026-09-13-fi458-distributed-bracket-spec.md` (slice SF-2) + context pack `docs/superpowers/contexts/fi458-sf-2.md` + Linear FI-460. Epic đã duyệt — spec này chi tiết hóa thiết kế, không đổi scope. `--host` passthrough đã tách follow-up (FI-460 description) — không thuộc SF-2.

## 0. Root cause
story-verify B4 và story-resume đọc dest bằng dữ liệu local (`merge-base --is-ancestor`, không fetch). Bracket distributed: máy B merge/push dest lên remote → máy A verify không pull → B4 FAIL sai; resume prompt không thấy dest đã tiến. SF-1 đã đặt móng: `distributed_config_load`/`distributed_enabled` (bin/story-distributed-claim), pattern `dest_fetch_check` (bin/story-launch — fetch + remote-detect + timeout + FERR).

## 1. Problem
Verify tools local-only trong thế giới đa máy. Không phải "cần pull" — chỉ cần NHÌN thấy remote tip lúc verify (read-only).

## 2. Scope
**In:** B4 fetch-first (gated `distributed.enabled`, stale-fallback, zero-diff khi tắt); story-resume dest check cùng pattern; tests (unit + zero-diff regression + e2e 2-máy mô phỏng).
**Out:** `--host` passthrough (follow-up), vendored orca regen (SF-4), bin/story-launch logic, gates B1-B3/B2b/B5, mobile/, daemon fetch nền.

## 3. Touch map
- `bin/story-verify` — khối B4 (dòng 233-236): fetch → remote-tip check, fallback local + `⚠ fetched-stale`
- `bin/story-resume` — dest check fetch-first trong diagnose/build prompt cho SF stalled
- `bin/story-distributed-claim` — helper dùng chung nếu cần (gated lib)
- Tests: `tests/test-story-verify-b4-fetch.sh` (mới) + `tests/test-story-resume.sh` (mở rộng)
- Sync: kit → `~/.claude/bin` (installed copy). KHÔNG đụng story-launch (chứa dirty left-over không thuộc SF-2 — không stage).

## 4. Design

### B4 fetch-first (story-verify)
```
B4 khi distributed_enabled = 1 (lib config ~/.claude/story-kit.json key .distributed.enabled):
  dest_remote = git config branch.<dest>.remote || origin
  fetch dest (GIT_HTTP_LOW_SPEED_LIMIT=1000 TIME=30; timeout 60 nếu có cmd)
  rc = 0  → remote_tip = rev-parse FETCH_HEAD (FETCH_HEAD chỉ đọc khi rc=0 — fetch cũ không nhiễm)
           B4 PASS ⇔ HEAD ancestor của local dest HOẶC remote_tip (merge-base --is-ancestor)
  rc ≠ 0 → log "⚠ fetched-stale — verdict dùng local dest" → check local dest như cũ
enabled = 0 → path cũ nguyên vẹn 100% (không git call nào thêm — zero-diff)
```
- Chọn PASS-khi-một: máy B merge SF-A rồi push → HEAD_A không ancestor local dest (cũ) nhưng ancestor remote_tip → PASS đúng acceptance 1.
- Remote dest chưa tồn tại (story branch local-only, kit remote "not found" là thực tế đã biết) → fetch fail → stale-fallback, KHÔNG crash.

### story-resume dest check
Khi diagnose ra STALLED* (sắp build resume prompt): cùng fetch-first (gated). Remote dest tip mới hơn local dest (remote_tip KHÔNG ancestor local dest) → prompt/diagnose thêm cảnh báo `⚠ dest đã tiến trên remote (<remote>/<dest>) — soi pull trước khi resume`. Fetch fail → log stale, prompt y nguyên. Enabled=false → không đổi output.

### Reuse
`dest_fetch_check` hiện local trong story-launch; installed `~/.claude/bin` không có lib → self-contained copy vào verify/resume (khớp convention 2 file này — self-contained inline), comment "pattern dest_fetch_check (story-launch)". Không refactor story-launch (drive-by). SF-4 regen có thể unify.

## 5. Impl outline (TDD — mỗi task RED→GREEN)
1. **b4-fetch-gated-after-enabled**: helper fetch + B4 distributed path (test: mock bare origin, remote dest tiến → PASS nhờ fetch; enabled=0 → không fetch)
2. **b4-zero-diff-regression**: enabled=false → verify chạy không fetch (fake git log fetch-call), output/exit y nguyên; enabled hỏng → default off
3. **fetch-fail-stale-fallback**: offline (origin trỏ . không tồn tại) → verdict từ local + stderr `⚠ fetched-stale`, exit không crash
4. **resume-dest-fetch**: story-resume dest check (stub pattern như test-story-resume.sh hiện có — trích hàm, pgrep/term stub)
5. **resume-dest-fetch-e2e**: 2 clones (máy A/B) + bare origin; B push dest; A resume --check thấy cảnh báo dest tiến; offline A → stale fallback sạch

Test harness: pattern `tests/test-story-launch-claim.sh` (mktemp bare repo, PASS/FAIL counter, exit 0 chỉ khi mọi PASS).

## 6. ACCEPTANCE
1. Máy B push dest (mock bare remote); máy A story-verify không pull → B4 PASS nhờ fetch
2. Fetch fail (offline/remote chết) → verdict dùng local + `⚠ fetched-stale` — KHÔNG crash
3. enabled=false → zero-diff: không network call, output/exit code y nguyên pre-feature
4. story-resume SF stalled + dest remote tiến → cảnh báo trong prompt; tắt → output nguyên vẹn
5. Test suite kit green (mọi file test liên quan exit 0) + regression test-story-resume.sh cũ không vỡ

## 7. Risks
- FETCH_HEAD nhiễm fetch cũ → guard chỉ đọc khi fetch rc=0
- Worktree fetch = repo chung objects — read-only an toàn; refspec giới hạn dest (Git Scan Safety)
- macOS không có `timeout` → guard `command -v timeout` + low-speed env (pattern SF-1 đã ship)
- evidence B1: `docs/superpowers/evidence/sf-2-remote-safe-verify/test-run.txt` chứa kit commit hash + `tdd: RED→GREEN`
