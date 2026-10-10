# LOCAL-5 — kit improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps dùng checkbox cho tracking.

**Goal:** 3 SF sửa defect kit quan sát thật 04-10/10 (doctor install-coverage, watchdog scoping, story-verify/mindmap defects).

**Architecture:** 3 bin file-rời-nhau, TDD stub/fixture, rehash kitHash+fingerprint cuối mỗi SF.

**Tech Stack:** bash bins + node inline, tests `*.mjs` (harness hiện có), python (story-doctor).

**Spec:** `docs/superpowers/specs/2026-10-10-kit-improvements-design.md` (CHỐT — đã qua spec-critic)

## Global Constraints

- CẤM `--agent claude` · CẤM trailer Co-Authored-By · commit Conventional tiếng Việt · `--no-verify` (oxlint ignores)
- Rehash thứ tự: bin → computeKitHash → kit.json → fingerprint CUỐI; ĐÚNG CÂY worktree
- Gate không qua pipe: `cmd > log 2>&1; echo $?`
- **P0-1 (plan-critic):** SF-1 mở chỉ khi plugin-dir sạch (driver writer khác — probe `git status` + `pgrep`/`lsof cwd` workfront-driver) — task #1
- **P0-2 (plan-critic):** SF-2 VÀ SF-3 đều kết thúc rehash ×2 + manifest GREEN trước commit (computeKitHash hash skills/agents/bin — cả 2 SF đổi)
- `core.filemode=false` — exec-bit qua `git update-index --chmod=+x`
- `--resolve` (story-mindmap) GIỮ NGUYÊN; schema v1 không thêm state

---

### Task 1: SF-1 story-doctor install-coverage (12 tasks — đã plan-critic sửa P0-1)

**Mở đầu (bắt buộc trước mọi edit):**
1. Probe writer: `git status` plugin-dir + `pgrep`/`lsof cwd` workfront-driver — sạch mới mở (không sạch → DỪNG báo)
2. Rehash: computeKitHash → kit.json → fingerprint → manifest GREEN trên tree sạch

**Tasks:**
3. Fixture tautology: doctor BÊN TRONG fake install root (kit_root==root) — sidecar có → phát hiện bin thiếu (hiện tại PASS sai)
4. Fixture: KHÔNG sidecar → WARN fail-open (không PASS)
5. installKit ghi sidecar vô điều kiện TRƯỚC early-return marker (main.mjs ~1275-1282): `{provides:[names], srcKitRoot, kitHash}`
6. check_bins đọc sidecar khi kit.json vắng — missing + orphan 2 chiều; orphan sidecar-mode = WARN-only (P1-2: sidecar stale có thể xoá bin mới hợp lệ)
7. check_orphans whitelist `.kit-provides.json`
8. --repair: srcKitRoot tồn tại + hash khớp → copy bin thiếu qua guard under_root + chmod 755 sau copy (P1-3)
9. --repair: source mất/hash lệch → FAIL in lệnh cp hướng dẫn (fixture variant không-source)
10. uninstall_targets gồm sidecar
11. missing-sidecar → WARN fail-open
12. Regression kit-source mode + suite + commit

### Task 2: SF-2 story-watchdog scoping (9-10 tasks — P0-2: task cuối rehash ×2 + manifest GREEN trước commit)

1. Fixture repo ĐA-mindmap: git repo thật (git init + dest branch thật — P1-1) + 2+ stems dash-normalization (fi-458/fi458) + bracket legacy *.md (P2 union)
2. --launch-next không --story + đa-story → SKIP toàn cục + warning liệt kê repos, exit 0
3. --story <slug> launch đúng story
4. --story match dash-normalization; không khớp → warn exit 0
5. Dest-absent: local show-ref → 1 lần ls-remote timeout 30s → skip + warning (P1-1: check ở LAUNCH PATH CHUNG — cả khi không --story)
6. --story CHỈ scope launch_next section
7. Single-mindmap regression
8. Worktree-ownership sf-N chéo story → Boundary doc (P1-4)
9. Rehash ×2 (kitHash + fingerprint) → manifest GREEN → suite → commit

### Task 3: SF-3 story-verify + story-mindmap (11 tasks — P0-2: task cuối rehash ×2 trước commit)

1. Fixture B3: 2 mindmaps alphabetical-xung-đột (>1-match)
2. Fixture B3 0-match (UNKNOWN variant — P2)
3. B3 resolve story ID: cắt đuôi -sf-N / cắt đầu sf-N- + dash-normalization + UNKNOWN fail-open
4. B3 fix 2 vị trí glob (184, 422)
5. Fixture B1: evidence full-worktree-name (P1-5: chính sách đã đúng — task = fixture-pin)
6. B1 neo biên fallback sf-<n>-* / sf-<n>.* + cover smoke fallback ~352 (P2)
7. Fixture update-state: vocabulary orca thật (task-handlers.ts:10-16)
8. Map table: completed→done · failed→blocked · dispatched→in-progress · ready→pending · done absorbing · không ngoài KNOWN_STATE (P0-1 spec)
9. Sửa T2.8 downgrade assert trong cùng task (P1-4) + test --update-state
10. Test --bracket generate (P2-1: fix ở readOrcaStates tự cover)
11. Rehash ×2 → manifest GREEN → suite → commit

**P2 ghi plan:** B3 dogfooding — worktree LOCAL-5 chứa nhiều .wakii → prune/trỏ mindmap đúng trước verify SF-1/2 (P2 đầu). INDEX.md docs tax: thêm dòng --story/sidecar (P2 docs tax). Uninstall máy chỉ-có-install vẫn từ chối — ghi note (P2 cuối). Không double-report orphan (P2).

---

## Self-review checklist

- Spec coverage: §SF-1→Task 1 (12) · §SF-2→Task 2 (9-10) · §SF-3→Task 3 (11) · §Rollout→P0-1 mở đầu · acceptance từng cái có fixture
- P0-1/P0-2 đã vá vào task structure (rehash đầu SF-1, cuối SF-2/3)
- P1-1..5 nhúng vào task tương ứng; P2 ghi plan
