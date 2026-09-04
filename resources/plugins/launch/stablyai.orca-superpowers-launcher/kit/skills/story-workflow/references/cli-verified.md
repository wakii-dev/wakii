# Verified CLI Reference — story-workflow

Bài học từ FI-151 approve thật. Mọi lệnh dưới đây đã verify bằng lệnh thật.

| Lệnh | Đúng | Cẩn thận |
|------|------|-----------|
| Sub-issue | `orca linear create --title .. --team FI --parent <EPIC> --label Feature --priority .. --estimate .. --body "<multi-line>" --json` | flag là **--body**; KHÔNG dùng `relation add --parent` (chỉ làm blocks/related edges) |
| Update | `orca linear save-issue <ID> --state Todo --title .. --json` | dùng cho cancel trùng, đổi state |
| Worktree SF | `orca worktree create --name sf-n-slug --linear-issue <ID> --base-branch story/<epic-id>-<slug> --agent claude --no-parent --json` | `--base-branch` verified tồn tại. **Prompt qua FILE:** SF prompt chứa backticks/`$()` — ghép trực tiếp vào `--prompt "..."` → command substitution / silent truncation (learned 2026-09-03 aihero/handoff). Viết `/tmp/sf-prompt-<sf>.md` rồi `--prompt "$(cat /tmp/sf-prompt-<sf>.md)"` — `$(cat)` chèn nguyên văn, không re-parse |
| DAG | `run-create` → `task-create --deps '["task_a","task_b"]'` (JSON list) | deps nhiều SF phải là JSON array string chuẩn |
| Ghi bracket | sed/python replace `linear: <old>` → `linear: <new>` per SF block | approve lại → remap, không append |
| Task update | `orca orchestration task-update --id <task> --status <s>` — CẦN `--id`, KHÔNG positional; terminal phải `run-use --id <run>` bind TRƯỚC | valid statuses: pending/ready/dispatched/completed/failed/blocked — KHÔNG có in_progress; `dispatched` CẦN active Dispatch flow (inline/solo executor chỉ đánh dấu `completed` khi xong, không có "đang làm" — learned 2026-08-28 FI-191) |
| Comment | `orca linear comment add --id <issue> --body-file -` (multiline QUA stdin/file) | `--id` không phải `--issue`; multiline trực tiếp chết control-chars |
| JSON parse | python3 `json.loads` cho MỌI orca output | jq CHẾT trên control-chars (3 lần FI-169) — cấm |
| Retry tạo-state | create/comment/save fail-có-vẻ → READ-BACK trước khi retry (list-issues / issue <id>) | parse-fail ≠ lệnh-fail — silent SUCCESS tồn tại (3 duplicates FI-169 sinh từ đây) |
| Probe/server shell | servers: `nohup ... > log 2>&1 &`; probes: `cmd > log; echo $?` — KHÔNG pipe `\| head/tail` | `\| head` SIGPIPE giết background server; `\| tail` nuốt exit code (2 SF đã trả giá) |
| Browser verify (Orca) | `orca tab create --url http://localhost:PORT` → `snapshot` / `get --what text` / `is --what visible` / `eval` → `tab close`; mobile: `orca "set device" --name "iPhone 12"` (verified 2026-08-28: tab create + eval ok) | `screenshot` TIMEOUT nếu cửa sổ Orca không focus — ưu tiên snapshot/get/is; tab sống trong app Orca (user thấy được — chính là affordance xác nhận visual). Fix focus khi timeout (learned 2026-08-31 FI-234): `orca tab show --page <id>` + `osascript -e 'activate application "Orca"'` → chờ ~5s settle → chụp lại; vẫn fail mới nhờ user mở panel |
| Worktree merge khi đích đang checkout | merge TRỰC TIẾP trong worktree của đích (verify sạch trước), KHÔNG `worktree add` temp | `worktree add` fail "already checked out" |
| Worktree status comment | `orca worktree set --worktree name:<sf> --comment "<status>" --json` (verified 2026-09-03) | Comment **KHÔNG xóa được qua CLI** — `--comment ""` và `--comment null` đều thành literal text; chỉ GHI ĐÈ được. Read-back rẻ nhất qua `worktree ps --json` (`.result.worktrees[].comment`); `worktree show` nest sâu hơn (`.result.worktree`) — đừng parse nhầm rồi tưởng lệnh fail khi `.ok true` |
| Diff view cho user | `orca file open-changed --mode diff [--worktree <selector>] --json` (verified 2026-09-03) | Mở các file changed trong diff view Orca — dùng khi review WIP trong worktree SF (trước commit/merge). **CHỈ uncommitted + untracked** (status-based) — worktree đã commit = trống; diff committed-but-unmerged dùng `git diff <parent>..HEAD`. JSON trả `result.opened[]` (path/mode/kind); junk untracked (`*.profraw`, `.env.local`) sẽ mở theo — lọc trước nếu cần |
| PR story (CREATE + EDIT) | `git push -u origin story/<epic>-<slug>` → `gh pr create --base main --head story/<epic>-<slug> --title .. --body-file <file>` → `gh pr view --json url -q .url` (quy trình đủ 4 precondition + template: `references/pr-playbook.md`) | 1 PR/story là contract — `gh pr create` fail khi đã có PR mở cùng head/base → edit thay vì tạo mới (`gh pr edit <số> --body-file`). Fail-safe: thiếu remote/gh auth → `READY-FOR-MANUAL-MERGE` + lý do vào Epic audit, KHÔNG chặn STORY-COMPLETE. **Merge PR là human gate** — không agent/watchdog nào merge main |

**Duplicate batch guard:** nếu thấy children > expected (approve chạy 2 lần), batch cũ
Canceled (giữ audit), bracket remap sang batch active. Đừng xóa issues.

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
