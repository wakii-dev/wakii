# Context pack — SF-1 GitLens-lite (inline blame + hover + toggle)

Spec nguồn: `docs/superpowers/specs/2026-09-25-gitlens-lite-spec.md` (rev.3 — phase0 + spec-critic + plan-critic). Verify code trên `fi28-coordinator` checkout (feature/clone-vs-vscode).

## Spec slice

4 nhóm việc, nothing else:
1. **`git.blame` dual-path** — shared types + porcelain parser → main `git/blame.ts` (`admissionTier: 'interactive'`) → provider contract + SSH provider `mux.request('git.blame')` → runtime RPC `defineMethod` + dispatch + wiring → desktop IPC `git:blame` → preload `blame?:` **optional** → renderer client dual-path. Boundary: mobile/relay SKIP MVP (mobile deny-by-default 'forbidden'; relay subset GIT_METHODS) — contract test assert `git.blame` KHÔNG trong relay surface + comment cite wire-compat "Known hazard". Foreground deliberate (rationale ghi plan).
2. **Degrade + taxonomy** — `RuntimeRpcCallError.code === 'method_not_found'` (CHUỖI, không phải -32601) → disable per-host in-memory KHÔNG persist; git-error khác (empty repo/permission/buffer) → per-file silent, feature sống. Phân biệt tại HOOK level + test riêng. Mock degrade qua class `RuntimeRpcCallError` thật.
3. **Blame hook `use-monaco-git-blame.ts`** — cache per (worktreeId, filePath, HEAD-sha); re-run mount/external/save/HEAD-change (KHÔNG cursor move); cursor-follow imperative; inserted + uncommitted → "You"; stale marker unsaved; skip >2MB/>200k dòng + hover skip-reason; hover CHỈ appendText/appendCodeblock (CẤM appendMarkdown/supportHtml — injection test); only active/visible; eviction tab-close + worktree-remove.
4. **Settings + wiring** — `editorInlineBlameEnabled?` default true + toggle + i18n strings liệt kê tường minh (toggle label, "You", stale marker, hover skip-reason, hover labels) ×6; opt-in prop: `EditorEditFileSurface` ON / `EditorConflictReviewSurface` OFF; web expose theo task 5 outcome.

## Touch map

- Mới: `src/shared/git-blame-types.ts`, `git-blame-porcelain-parser.ts`, `src/main/git/blame.ts`, `use-monaco-git-blame.ts` (+ tests)
- Sửa: `src/shared/rpc-contract/git-params.ts`, `git-provider-contract.ts`, `ssh-git-working-tree-provider.ts`, `rpc/methods/git.ts`, `runtime-git-status-commands.ts`, `runtime-git-command-surface.ts`, `orca-runtime-git.ts`, `filesystem-git-status-handlers.ts`, `src/preload/api/git-bridge.ts` + api-types (`blame?:` optional), `runtime-git-status-client.ts`, `src/shared/rpc-contract/rpc-params-catalog.generated.ts` (regen `pnpm generate:rpc-params-catalog`), `MonacoEditor.tsx` (prop), `EditorEditFileSurface.tsx` (bật), `EditorConflictReviewSurface.tsx` (KHÔNG), settings trio, i18n ×6
- Regression: `runtime-git-api-contract.test.ts` (+ git.blame mapping), `ssh-git-provider-status.test.ts`, web-git-api tests, locale regression tests

## ACCEPTANCE (user-visible — verifier kiểm)

1. Cursor lên dòng → cuối dòng `author, relative-date · subject` muted; move cursor update tức thì (evidence 0-git-call = unit test; walkthrough chỉ chứng minh hiển thị).
2. Hover dòng → chi tiết commit; subject chứa markdown link/HTML → render thuần text; không author email.
3. Toggle default ON — tắt → decorations mất tức thì.
4. SSH dual-path (test + guard); host cũ `method_not_found` → disable in-memory per-host, 0 error 0 retry; session mới host nâng cấp → tự hoạt động.
5. Uncommitted + inserted → "You"; empty repo → silent; non-git → no-op; minified → skip + hover skip-reason (string i18n).
6. HEAD change (agent commit) → blame refresh đúng; refresh không ghi watcher baseline (unit test).
7. Gates: vitest touched đúng config + `pnpm tc` + `verify:rpc-params-catalog` + `check:code-quality:changed` + walkthrough ELECTRON.

## Boundary

- KHÔNG mobile/relay parity (contract test + boundary comment cite doc); KHÔNG diagnosticsOptions; KHÔNG DiffEditor/peek/automation/conflict-review surfaces; KHÔNG blame cursor move; KHÔNG `-C`/`-M`/`--ignore-rev`; foreground deliberate; KHÔNG sửa plan file giữa run (design notes → task report).
- Scope change → REQUIREMENT-GAP comment epic + cập nhật bracket.

## Run protocol

- Atomic commit + tick plan sau MỖI task. Snapshot merge khuyến nghị sau task 6 (hook là task lớn nhất).
- ELECTRON protocol mọi browser check (ORCA_BACKGROUND_LAUNCH=1, CDP, cấm focus steal). Dev app user ở 5173 — KHÔNG đụng.
- RUN-COMPLETE (plain list — coordinator-owned): reviewer độc lập (OUTBOX verdict — coordinator ghi file + POST lên Linear cho gate B3) → gates 1-4 → merge worker→feature/clone-vs-vscode (merge-ngược + update-ref FULL refname + guards; branch checkout ở fi28-coordinator — KHÔNG worktree add thẳng) → post-merge sync: dirty-check rồi `git -C fi28-coordinator reset --hard` (sync checkout, KHÔNG dest-sync) → hash comment lên sub-issue → story-post-merge → sub-issue Done.
- Sync freeze: coordinator không merge wakii-dev vào feature branch trong run.
