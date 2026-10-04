# Verified CLI Reference — story-workflow

Bài học từ FI-151 approve thật. Mọi lệnh dưới đây đã verify bằng lệnh thật.

| Lệnh | Đúng | Cẩn thận |
|------|------|-----------|
| Sub-issue | `orca linear create --title .. --team FI --parent <EPIC> --label Feature --priority .. --estimate .. --body "<multi-line>" --json` | flag là **--body**; KHÔNG dùng `relation add --parent` (chỉ làm blocks/related edges) |
| Update | `orca linear save-issue <ID> --state Todo --title .. --json` | dùng cho cancel trùng, đổi state |
| Worktree SF | HAI BƯỚC (verified 04/10): ① `orca worktree create --repo id:<repoId> --name sf-n-slug --linear-issue <ID> --base-branch <dest> --parent-worktree path:<hub-abs> --json` → ② `orca terminal create --worktree id:<WID> --title sf-n-slug --command "claude --permission-mode acceptEdits" --json` → `terminal wait --for tui-idle` → `terminal send --text "<prompt>" --enter` | **CẤM `--agent claude`** — template Orca cài sẵn `--dangerously-skip-permissions` (vi phạm LUẬT 24/09; bằng chứng pid 20066). Prompt qua send `--text` — không nhét vào argv (backticks/`$()` chết command substitution — learned 2026-09-03) |
| Worktree parent-lineage | `--parent-worktree path:<hub-abs>` (hoặc `branch:<dest>`) — selector BẮT BUỘC (verified 04/10) | bare name/path bị orca nuốt im lặng → **mồ côi** (sf-2/sf-3 VU-32, 3 lần 04/10); story-launch đã fix probe `branch:$DEST`. Chạy từ cwd khác repo PHẢI `--repo id:<repoId>` (cwd-inference chọn nhầm repo). Base ref có slash-prefix (`wakii-dev/…`) làm orca "Could not refresh base ref" → tạo branch local không-slash từ tip làm start point |
| Linear mutation (chống rate-limit) | `~/.claude/bin/linear-rate-limit run --bin <tên> [--op '<json>'] -- orca linear status set --id <ID> --to Done` (verified 04/10) | fail khớp signature rate-limit → **tự note** op vào queue máy-level + exit 3; exit 0 pass; fail khác passthrough rc. CẤM gọi `orca linear` ghi trực tiếp (429 rơi qua sàng im lặng). Retry chỉ sau `linear-rate-limit check` hết cooldown |
| workfront-driver portable | `workfront-driver --repo <repo-root> --base <ref> --loop <slug>`; worktree có sẵn: `WAKII_DRIVER_WT=<path>` env | `--repo` CHỈ nhận repo root (worktree có `.git` là FILE → bị từ chối); mặc định driver tự raw-create sibling `projects/<repo>-<slug>` ngoài tầm Orca — story đã có topology Orca PHẢI dùng `WAKII_DRIVER_WT`; gates `blocked_sf-N` trong state.json = driver không dispatch SF đó — **mở chỉ sau khi SF ĐÃ MERGE** (driver = verifier/ticker, launch là việc coordinator) |
| DAG | `run-create` → `task-create --deps '["task_a","task_b"]'` (JSON list) | deps nhiều SF phải là JSON array string chuẩn |
| Ghi story .wakii | python3 JSON load/dump — set sf node `linear` (JSON: KHÔNG sed) | approve lại → remap, không append |
| Task update | `orca orchestration task-update --id <task> --status <s>` — CẦN `--id`, KHÔNG positional; terminal phải `run-use --id <run>` bind TRƯỚC | valid statuses: pending/ready/dispatched/completed/failed/blocked — KHÔNG có in_progress; `dispatched` CẦN active Dispatch flow (inline/solo executor chỉ đánh dấu `completed` khi xong, không có "đang làm" — learned 2026-08-28 FI-191) |
| Comment | `orca linear comment add --id <issue> --body-file -` (multiline QUA stdin/file) | `--id` không phải `--issue`; multiline trực tiếp chết control-chars |
| JSON parse | python3 `json.loads` cho MỌI orca output | jq CHẾT trên control-chars (3 lần FI-169) — cấm |
| Retry tạo-state | create/comment/save fail-có-vẻ → READ-BACK trước khi retry (list-issues / issue <id>) | parse-fail ≠ lệnh-fail — silent SUCCESS tồn tại (3 duplicates FI-169 sinh từ đây) |
| Probe/server shell | servers: `nohup ... > log 2>&1 &`; probes: `cmd > log; echo $?` — KHÔNG pipe `\| head/tail` | `\| head` SIGPIPE giết background server; `\| tail` nuốt exit code (2 SF đã trả giá) |
| Browser verify (Orca) | `orca tab create --url http://localhost:PORT` → `snapshot` / `get --what text` / `is --what visible` / `eval` → `tab close`; mobile: `orca "set device" --name "iPhone 12"` (verified 2026-08-28: tab create + eval ok) | `screenshot` TIMEOUT nếu cửa sổ Orca không focus — ưu tiên snapshot/get/is; tab sống trong app Orca (user thấy được — chính là affordance xác nhận visual). Fix focus khi timeout (learned 2026-08-31 FI-234): `orca tab show --page <id>` + `osascript -e 'activate application "Orca"'` → chờ ~5s settle → chụp lại; vẫn fail mới nhờ user mở panel |
| Worktree merge khi đích đang checkout | merge TRỰC TIẾP trong worktree của đích (verify sạch trước), KHÔNG `worktree add` temp | `worktree add` fail "already checked out" |
| Worktree status comment | `orca worktree set --worktree name:<sf> --comment "<status>" --json` (verified 2026-09-03) | Comment **KHÔNG xóa được qua CLI** — `--comment ""` và `--comment null` đều thành literal text; chỉ GHI ĐÈ được. Read-back rẻ nhất qua `worktree ps --json` (`.result.worktrees[].comment`); `worktree show` nest sâu hơn (`.result.worktree`) — đừng parse nhầm rồi tưởng lệnh fail khi `.ok true` |
| Diff view cho user | `orca file open-changed --mode diff [--worktree <selector>] --json` (verified 2026-09-03) | Mở các file changed trong diff view Orca — dùng khi review WIP trong worktree SF (trước commit/merge). **CHỈ uncommitted + untracked** (status-based) — worktree đã commit = trống; diff committed-but-unmerged dùng `git diff <parent>..HEAD`. JSON trả `result.opened[]` (path/mode/kind); junk untracked (`*.profraw`, `.env.local`) sẽ mở theo — lọc trước nếu cần |
| PR story (CREATE + EDIT) | `git push -u origin story/<epic>-<slug>` → `gh pr create --base <Primary> --head story/<epic>-<slug> --title .. --body-file <file>` → `gh pr view --json url -q .url` (Primary resolve qua `wakii-validate --resolve-primary` — KHÔNG hardcode main; quy trình đủ 5 precondition + template: `references/pr-playbook.md`) | 1 PR/story là contract — `gh pr create` fail khi đã có PR mở cùng head/base → edit thay vì tạo mới (`gh pr edit <số> --body-file`). Fail-safe: thiếu remote/gh auth → `READY-FOR-MANUAL-MERGE` + lý do vào Epic audit, KHÔNG chặn STORY-COMPLETE. **Merge PR là human gate** — không agent/watchdog nào merge primary |

**Duplicate batch guard:** nếu thấy children > expected (approve chạy 2 lần), batch cũ
Canceled (giữ audit), story .wakii remap sang batch active. Đừng xóa issues.

**Worker/orca-binary (plugin context):** plugin worker fork với PATH của dev app khi
dev — 'orca' trỏ dev wrapper bị lỗi ngoài context. Plugin phải exec qua absolute
production binary (/opt/homebrew/bin/orca). Đã fix trong launcher main.mjs — nếu
viết worker mới, dùng cùng resolver.
**Plugin deploy flow (dev):** sửa source `/Users/mac/Documents/local.superpowers-launcher`
→ RESTART app dev (dev plugin chạy từ source dir, nhưng worker fork giữ code cũ tới
restart; KHÔNG hot-copy vào install dir — content-hash verification sẽ Invalid).
Command mới phải khai báo BOTH manifest + main.mjs registration (code registration
một mình không đủ — lỗi "does not contribute command").

## VERDICT-OUTBOX — async agents viết kết quả ra file (pattern event-log)

Vấn đề (4 SF FI-169): reviewer/verifier async chạy xong nhưng reports đến
20-30 phút sau qua mailbox → coordinator tưởng chết → re-dispatch → duplicate.

**Quy tắc:** mọi async agent (code-reviewer, verifier, designer) khi dispatch,
prompt phải chỉ định OUTBOX:
```
Viết verdict vào /tmp/story/<epic>/<agent>-<sf>.md NGAY khi xong
(VERDICT: ... + evidence), TRƯỚC khi report qua message.
```
Coordinator poll file mỗi vòng — FILE là nguồn sự thật, message chỉ là
notification. File có + message chưa tới → dùng file, KHÔNG re-dispatch.
Message tới + file không có → chờ file (message trễ/duplicate vô hại).
