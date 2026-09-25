# Spec: Native GitLens-lite — inline blame + hover + toggle

Ngày: 2026-09-25 (rev.3 sau plan-critic) · Team: FI · Project: wakii · Nhánh: **feature/clone-vs-vscode**
Nguồn: phase0-impact-analyst + spec-critic rev.2 + plan-critic rev.3 + user decisions (1a cursor-line, default ON)

## IDEA-BRIEF (8 chiều)

- **Task**: GitLens-lite native — inline blame dòng cursor (end-of-line decoration) + blame hover mọi dòng + toggle setting. KHÔNG phải extension GitLens (embed epic — openvscode-server — phase 0 riêng đã xong, Direction B).
- **Output**: renderer + main git + shared parser + runtime surface mới (`git.blame`) + web preload (nếu probe expose) theo đúng pattern dual-path `git.history`.
- **Users**: dev đọc code trong Wakii cần biết dòng do ai/khi nào sửa.
- **Constraints**:
  - SSH boundary: dual-path `git.history`. CẤM local-fs trực tiếp cho SSH worktree.
  - **CẤM git call trên cursor move** — imperative decoration update qua `onDidChangeCursorPosition` trực tiếp (KHÔNG qua zustand selector). Re-run chỉ khi: mount / external change / save / **HEAD change** (`GitStatusResult.head?: string` có sẵn — không cần signal main mới).
  - **Old-host degrade (P0 rev.2)**: `RuntimeRpcCallError` với `code === 'method_not_found'` (chuỗi — `dispatcher.ts:59-64`, `runtime-rpc-result.ts:6`, precedent `workspace-port-actions.ts:326`) → **disable per host/connection, in-memory per session, KHÔNG persist**. KHÔNG dùng -32601 (đó là path relay/JSON-RPC main-side).
  - **Error taxonomy 2 lớp**: `method_not_found` → disable per-host in-memory; **lỗi git khác** (empty repo, permission, buffer cap) → no-annotation im lặng per-file, KHÔNG disable feature. Phân biệt tại HOOK level (không chỉ client) + test phân biệt.
  - Uncommitted (`0000000`) và **dòng chèn mới** (chưa có trong blame map) → "You" annotation; unsaved edits → stale marker; line mapping theo disk state. Folder non-git → no-op im lặng.
  - Skip heuristic minified: file >2MB hoặc >200k dòng (buffer cap 10MB — nếu race vượt, buffer-error rơi vào git-error silent, đúng taxonomy); chỉ blame editor active/visible.
  - **Hover security**: content CHỈ qua `IMarkdownString.appendText`/`appendCodeblock` — CẤM `appendMarkdown`, supportHtml off. Không author email.
  - **"Stamp" (SC6)**: blame refresh CHỈ đụng blame cache + decorations — KHÔNG đụng watcher baseline/`lastSyncedContentRef` (unit test assert không false-conflict).
  - i18n ×6; STYLEGUIDE; settings optional default `true` (`global-settings-types.ts:94` pattern).
  - Mobile/relay SKIP MVP: mobile deny-by-default trả `'forbidden'` trước dispatcher; relay registration subset chặt của GIT_METHODS (precedent `git.remoteFileUrl` skip) — **thêm contract test assert `'git.blame'` KHÔNG nằm trong relay surface** + boundary comment cite wire-compat "Known hazard".
  - `git.blame` **foreground deliberate** (không thêm vào `isBackgroundRuntimeMethod` — background concurrency 2, blame là user-waiting).
- **Input**: phase0 + spec-critic + plan-critic + user decisions.
- **Context**: dual-path `git.history` (`src/main/git/history.ts:7` local; `filesystem-git-status-handlers.ts:188-199` → `ssh-git-working-tree-provider.ts:22` SSH); parser executor `git-history.ts`; cursor tracking `use-monaco-editor-mount.ts:146-152`; decorations `use-monaco-editor-decorations.ts:81-86`; relative date `relative-time-format.ts`; `blame` ĐÃ CÓ trong `isWslDirectGitReadCommand:17` (đính chính — verify-first cũ sai).
- **Success criteria**:
  1. Cursor lên dòng → cuối dòng `author, relative-date · subject` muted; move cursor 0 git call (evidence = unit test spy, walkthrough chỉ chứng minh hiển thị).
  2. Hover bất kỳ dòng → chi tiết commit; **subject chứa markdown link/HTML → render thuần text** (test); không author email.
  3. Toggle "Inline Blame" default ON — tắt → decorations biến mất tức thì.
  4. SSH worktree: dual-path test + SSH-guard; host cũ `method_not_found` → disable in-memory per-host, 0 error, 0 retry; host mới session sau → tự hoạt động.
  5. Uncommitted + dòng chèn mới → "You"; empty repo → no-annotation im lặng; non-git → no-op; minified → skip + hover skip-reason (string i18n).
  6. Agent commit file đang mở (HEAD change, disk không đổi) → blame refresh đúng; refresh không đụng watcher baseline (unit test).
  7. Gates: vitest touched (đúng config) + `pnpm tc` + `verify:rpc-params-catalog` + `check:code-quality:changed` + walkthrough ELECTRON.
- **Out-of-scope**: whole-file overlay (phase 2); gutter/codelens/commit graph/line history/commit search/PR links; mobile/relay parity; LSP/embed epic riêng.

## Verify-first (1 — đã thu hẹp sau 2 vòng critic)

1. **Web expose verify + implement (có ownership)**: web dùng chung renderer (`web-index.html` → `web/main.tsx`) nên MonacoEditor mount ở web; `web-git-api.ts` đã implement `GitInspectionApi` (history, branchCompare...) → **outcome khả dĩ cao là EXPOSE**: thêm `blame` vào `web-git-api.ts` + test web (`web-preload-api-git.test.ts` pattern). Exit: test xanh. (Trường hợp verify ra KHÔNG mount được → degrade documented trong task report.)

## SF-1 — GitLens-lite (Tier 0, 1 executor, sequential)

**What (demo đầu-cuối):** mở file → cursor lên dòng → cuối dòng `author, date · subject`; hover dòng → chi tiết commit an toàn injection; worktree SSH hoạt động (host cũ silent disable); Settings tắt/bật; agent commit → blame refresh đúng kể cả HEAD change.

**Tasks (10 — DAG: [1],[5] song song → [2] → [3] → [4] → [6] → [7] → [8] → [9] → [10]; [8] phụ thuộc [7] — setting field):**

1. **Shared blame types + porcelain parser** — parser test: thường / uncommitted `0000000` / boundary `previous` / multi-line subject / **empty-repo exit≠0**.
2. **Main git + provider layer** — `getBlame` (`admissionTier: 'interactive'` — tier 0, user-waiting, rationale ghi plan) + contract + SSH provider `mux.request('git.blame')`; exit: unit + ssh provider test.
3. **Runtime RPC + wiring + boundary** — `defineMethod git.blame` + `getRuntimeGitBlame` + bind surface; **foreground deliberate** (rationale); **contract test assert `'git.blame'` KHÔNG trong relay surface** (chống regression) + boundary comment cite wire-compat "Known hazard"; exit: contract tests + `verify:rpc-params-catalog` PASS.
4. **Desktop IPC + preload + renderer client + degrade** — handler `git:blame` + preload `blame?:` **optional** trong `GitInspectionApi` (client dual-path + degrade đã xử lý undefined; KHÔNG bắt web implement ở task này — tránh tc block) + renderer client dual-path + **degrade `method_not_found` → disable per-host in-memory** (mock qua class `RuntimeRpcCallError` thật). Exit: unit 2 đường + degrade test + test lỗi-khác-không-disable.
5. **Web expose verify + implement** — verify MonacoEditor mount ở web → implement `blame` trong `web-git-api.ts` + test web; nếu không mount được → degrade documented trong task report. Exit: web test xanh HOẶC documented decision.
6. **Blame hook `use-monaco-git-blame.ts`** — cache per (worktreeId, filePath, HEAD-sha); re-run mount/external/save/HEAD-change; cursor-follow imperative; **inserted + uncommitted → "You"**; stale marker unsaved; no-op skip; skip heuristic + hover skip-reason; hover appendText/appendCodeblock only; taxonomy tại hook (method_not_found disable feature / git-error per-file silent); only active/visible; eviction **tab close + worktree remove**. Exit tests (mỗi case 1 test): cursor-move-0-call; HEAD-change refresh; inserted-You; stale; skip+skip-reason; empty-repo silent; non-git no-op; taxonomy hook-level (method_not_found vs git-error); **stamp/external-change unit (không ghi baseline)**; only-active/visible; eviction 2 loại; hover-injection-safe.
7. **Settings + i18n** — `editorInlineBlameEnabled?` default true + toggle; i18n strings liệt kê tường minh: toggle label, "You" annotation, stale marker text, hover skip-reason, hover labels (hash/author/date) — ×6 locales; exit: unit + 6 locale parse + locale regression tests.
8. **Opt-in prop wiring** — `MonacoEditor.tsx` prop + `EditorEditFileSurface.tsx` bật + `EditorConflictReviewSurface.tsx` OFF; toggle tức thị; exit: 2 surface test + toggle instant.
9. **Verify + walkthrough** — vitest touched (đúng config) + `pnpm tc` + `verify:rpc-params-catalog` + `check:code-quality:changed` + ELECTRON walkthrough (ORCA_BACKGROUND_LAUNCH=1, CDP): SC1 annotation hiển thị/update (evidence 0-call = unit test task 6), SC2 hover injection-safe, SC3 toggle, SC4 SSH (nếu host configured; không → by-construction + unit guards), SC5 You/inserted/minified, SC6 external+HEAD refresh, SC7 gates; screenshots `.evidence-gitlens-lite/`.
10. **Chuẩn bị merge** — commit cuối + report READY-FOR-MERGE (closing meta-task — không checkbox merge/Done).

**RUN-COMPLETE CHECKLIST** (plain — coordinator-owned): reviewer độc lập (OUTBOX verdict — coordinator ghi file + post lên Linear) → gates 1-4 → merge worker→feature/clone-vs-vscode (merge-ngược + update-ref FULL refname + guards) → post-merge sync: dirty-check rồi `git -C fi28-coordinator reset --hard` → hash comment lên sub-issue → story-post-merge → sub-issue Done. Sync freeze trong run.

**ACCEPTANCE** = 7 Success criteria.

**Boundary:** không mobile/relay parity (contract test chống regression + boundary comment); không đụng diagnosticsOptions; không đụng DiffEditor/peek/automation/conflict-review; KHÔNG blame cursor move; không `-C`/`-M`/`--ignore-rev`; foreground deliberate; scope change → REQUIREMENT-GAP comment epic + cập nhật bracket.

## Rủi ro & unknowns

1. `method_not_found` per-host in-memory disable — host upgrade tự bật lại; mock qua class thật (Task 4).
2. Buffer cap 10MB vs skip heuristic 2MB/200k dòng — race rơi vào git-error silent đúng taxonomy (Task 6 exit note).
3. Unsaved stale + inserted-You — pinned (Task 6).
4. Hover provider đầu tiên — appendText/appendCodeblock only + injection test (Task 6).
5. SSH latency — per-file silent; method_not_found riêng per-host (Task 6 taxonomy).
6. Empty repo 0 commits — exit≠0 → silent (parser + hook test).
7. Eviction 2 loại: tab close + worktree remove (Task 6).
