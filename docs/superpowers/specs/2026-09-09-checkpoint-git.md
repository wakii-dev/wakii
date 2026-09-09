# Spec: Checkpoint git tự động + rollback transactional cho executor

Date: 2026-09-09 | Resolves wakii-dev/wakii#14 | Rev 2 — áp spec-critic FIX-P0-FIRST (5 P0 + 6 P1)
Repo: orca (branch wakii-dev, vendored plugin resources/plugins/launch/stablyai.orca-superpowers-launcher/)
Phase0: Direction A (private refs) verified — 8+ consumers git-signal tránh nhiễu bằng ref thay vì commit trên nhánh

## IDEA-BRIEF (8 chiều)

- **Task:** bảo vệ working tree khỏi thay đổi của agent — snapshot per-step vào private ref + restore transactional + retention.
- **Output:** bin `story-checkpoint` (snap/restore/list/prune) + hooks vào task-executor/rollback-fixer + retention trong merge-playbook.
- **Users:** task-executor (chụp trước mỗi nhóm ghi), rollback-fixer (restore từ checkpoint), watchdog (resume đúng mốc qua transcript version).
- **Constraints:** MUST — checkpoint REF (không commit trên nhánh — tránh nhiễu 8+ consumer git-signal); MUST — restore file-level (`git restore --source=<ref>`), cấm `reset --hard`; MUST — snapshot untracked qua temp GIT_INDEX_FILE (respect .gitignore); MUST — degrade no-git → skip + WARNING; MUST — retention refs khi SF merge; MUST — .env/secret loại trừ tường minh; MUST — ref naming có run/worktree identity chống xung đột liên-worktree; MUST — transcript version sidecar.
- **Input:** phase0 report (8 consumer git-signal, Cline checkpoint-hooks pattern, Aider dirty-commit, restore semantics).
- **Context:** plugin worker plain Node zero deps; refs namespace `refs/wakii/checkpoints/<sf-slug>/<step>` chia sẻ giữa worktrees cùng repo.
- **Success criteria (binary):** xem ACCEPTANCE.
- **Out-of-scope:** semantic embeddings, panel UI visualize checkpoints, MCP expose checkpoints, cross-repo checkpoints.

## 2. Scope (Direction A — private refs, MỘT cơ chế thống nhất)

1. **`kit/bin/story-checkpoint`** — zero-dep Node, subcommands:
   - `snap <label>` — chụp cây hiện tại (tracked-dirty + untracked-non-ignored qua temp GIT_INDEX_FILE, exclude `.env*`) vào ref `refs/wakii/checkpoints/<sf-slug>/<step>`; fail → WARNING + tiếp tục (checkpoint hỏng không được chết hơn không có)
   - `restore <ref>` — file-level `git restore --source=<ref> --worktree --staged` (xử lý deletion + untracked-sau-checkpoint); KHÔNG reset --hard, KHÔNG đụng HEAD; restore-conflict → WARNING + giữ trạng thái hiện tại (không escalate)
   - `list` — liệt kê checkpoints của SF hiện tại
   - `prune` — xóa refs cũ hơn N gần nhất (retention, N=5)
2. **Sidecar mapping** — `.wakii/checkpoints.jsonl` per-worktree: ref → step + transcript version (watchdog resume đúng mốc)
3. **task-executor.md** — thêm protocol: gọi `story-checkpoint snap` trước mỗi nhóm ghi; restore qua `story-checkpoint restore` khi cần rollback
4. **rollback-fixer.md** — thêm playbook "restore từ checkpoint ref" cạnh git revert
5. **Retention** — `story-checkpoint prune` khi SF merge (merge-playbook CLEANUP-ON-MERGE)
6. **Degrade** — không git/submodule → skip + WARNING (không chặn task)

## 3. Touch map (verified phase0)

* **Tạo:** `kit/bin/story-checkpoint` (Node zero-dep, bash-style conventions khớp kit/bin hiện có)
* **Sửa:** `kit.json` (bump 2.2.1→2.3.0 + provides entry type bin), `kit/agents/task-executor.md`, `kit/agents/rollback-fixer.md`, `kit/skills/orca-superpowers-workflow/SKILL.md` (Rollback Ritual), `kit/skills/story-workflow/SKILL.md` (WATCHDOG resume), `kit/skills/story-workflow/references/merge-playbook.md` (retention prune)
* **Không đụng:** main.mjs installKit (đã có), kit/bin hiện có (story-validate, story-resume, story-top, story-status, story-memory-index-hook, story-preflight — tránh regression git-signal), RPC/wire (remote-wire-compat không áp dụng)

## 4. Second-order effects (từ phase0)

* **Ref thay vì commit trên nhánh** → zero pollution git log/status/heartbeat/progress-estimator/stall-detection/merge-ff — tránh vỡ 8+ consumer
* **Refs chia sẻ liên-worktree** → đặt tên `<sf-slug>/<step>` để unique toàn repo
* **Untracked snapshot** → respect .gitignore (loại node_modules/.env); secret (.env) → exclude tường minh hoặc prune nhanh
* **Git floor 2.25** → `git restore --source` (2.23+), `update-ref` cổ — cần verify 1 lượt thực trên 2.25
* **Sidecar mapping** → format JSONL per-worktree, không cần schema chuẩn

## 5. ACCEPTANCE (tất cả grep/probe-able)

1. `story-checkpoint snap <label>` tạo ref `refs/wakii/checkpoints/<sf-slug>/<step>` — verify `git for-each-ref`
2. `story-checkpoint restore <ref>` khôi phục đúng files từ snapshot — verify diff
3. `story-checkpoint prune` giữ N gần nhất, xóa cũ — verify for-each-ref sau prune
4. No-git/submodule → skip + WARNING (không chặn)
5. Restore: file-level, không đụng HEAD nhánh, không mất untracked user files
6. Retention: refs tích tụ ≤ N gần nhất per SF
7. Degrade: không git → skip + WARNING, không chặn

## 6. Second-order effects (từ phase0)

* Refs chia sẻ liên-worktree — naming kỷ luật `<sf-slug>/<step>`
* Secret (.env) vào snapshot nếu snapshot untracked — exclude tường minh hoặc prune nhanh
* Git floor 2.25 — verify `git restore --source` trên 2.25
* Transcript-version link — agent lấy session/transcript id qua probe ~/.claude/projects; nếu không lấy được, sidecar lưu path + version lazy
* Windows — kit bins bash, đã có hạn chế; checkpoint bin degrade với warning (document, không hứa mới)
* Merge-playbook CLEANUP-ON-MERGE — ownership cleanup ref cùng change với merge

## 6. Plan notes (plan-critic — ràng buộc task-level, báo trước Phase 3)

* (ghi nhận từ phase0) Degrade: skip + WARNING; ref gắn transcript version.
* Checkpoint refs là private namespace ngoài nhánh user — không xung đột `refs/heads/`.
* `git stash push --include-untracked` không xóa gitignored — file nhạy cảm (env, token) KHÔNG được snapshot... cân nhắc: snapshot private ref NHỮNG gì cần rollback, không snapshot gitignored (token, secrets).
