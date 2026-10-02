# VS Code sync backlog

Mỗi dòng dưới đây là 1 feature VS Code cần sync vào Wakii. Automation
`vscode-feature-scout` (hourly + precheck) phân tích và **tạo story song song** —
mỗi story một worktree riêng, không xếp hàng chờ story khác.

## State machine (bin quản lý — không sửa tay phần `[~]`/`[S]`)

| Checkbox | Nghĩa |
|---|---|
| `- [ ]` | Chờ scout phân tích + tạo story |
| `- [~]` | Scout đang tạo story (có thể nhiều story đồng thời) |
| `- [S]` | Story đã tạo trên Linear — **story-auto-launch** (automation generic mọi dự án) sẽ approve + launch |
| `- [x]` | Story đã merged vào `wakii-dev` |

2 automation: `vscode-feature-scout` (wakii-dev — phân tích vscode, tạo story)
+ `story-auto-launch` (mọi dự án — quét story chưa implement, approve + launch).

## Format dòng feature

```
- [ ] VSC-001: <tên feature> — <mô tả ngắn, đủ cho phase brainstorm>
```

## Lệnh

```bash
# THÊM FEATURE XONG → fire automation NGAY (không chờ cron 15')
~/.claude/bin/vscode-sync-dispatch now

# dispatch feature kế tiếp (automation tự gọi)
~/.claude/bin/vscode-sync-dispatch next

# sau khi merge story vào wakii-dev
~/.claude/bin/vscode-sync-dispatch mark-done VSC-001

# xem trạng thái
~/.claude/bin/vscode-sync-dispatch status
```

## Story live ở đâu?

- Dòng `[~]` trong backlog có comment `<!-- epic: <ID> | wt: <worktree> -->` —
  epic Linear + worktree của story đang chạy.
- Trên Linear: epic chứa description ghi Project/Repo/Worktree/Backlog-id,
  comment mốc (STORY-READY / SF launched / blocked / merged).
- Lát nhanh: `orca worktree list --json` (worktree `sf-*` = SF đang chạy),
  `~/.claude/bin/story-status` (tổng hợp state).

## Backlog

<!-- Thêm feature mới vào đây, trên xuống theo thứ tự ưu tiên.
     Format: - [ ] VSC-XXX: <tên feature> — <mô tả ngắn>
     Backlog trống → automation sẽ noop đến khi có feature. -->
- [x] VSC-901: TEST pipeline smoke — story-workflow smoke test cho automation vscode-sync — SF nhỏ, chỉ xác nhận pipeline epic/SF/Linear hoạt động, không đụng code production <!-- epic: FI-44 | staged: 2026-09-30T03:23:49Z | done: 2026-09-30 FI-45 Done, PR #125 chờ người merge -->
- [S] VSC-902: Rich GitHub links trong markdown preview <!-- epic: FI-46 | staged: 2026-09-30T09:01:39Z -->
- [ ] VSC-903: Session attention badge
- [ ] VSC-904: Auto-mark session done khi PR merge
- [ ] VSC-905: VSC-905: Deep link tạo agent session qua URL — mở rộng open-url handler (hiện chỉ handle skill-share) hỗ trợ orca:// dạng orca://agents/new?repo=...&prompt=... để tạo worktree/agent session mới kèm prompt từ ngoài app (nguồn: VS Code 1.140 — vscode://agents/new?prompt=...)
- [ ] VSC-906: VSC-906: Automations export/import — export automations ra file JSON và import lại trên máy/instance khác để chia sẻ giữa máy và team (nguồn: VS Code 1.138 — automations export/import sharing across teams)
- [ ] VSC-907: VSC-907: Terminal output reflow control — setting cho phép giữ output terminal ở chiều rộng cố định, không reflow khi pane resize (nguồn: VS Code 1.140 — chat.tools.terminal.outputReflow)
- [ ] VSC-908: Word wrap indicator trong file editor — mũi tên/dấu hiệu hiển thị tại cột wrap cho biết dòng nào đang bị wrap khi bật word wrap (nguồn: VS Code 1.139 — word wrap indicators)
- [ ] VSC-909: Selection match mode cho find trong editor — setting kiểm soát mode match case khi tìm với text đang chọn: findOptions (mặc định) / caseSensitive / caseInsensitive (nguồn: VS Code 1.140 — editor.selectedTextMatchMode)
- [ ] VSC-910: Filter ẩn nhóm rỗng trong sidebar — tùy chọn ẩn project group/session group không còn thành viên nào thay vì hiển thị hàng placeholder rỗng (nguồn: VS Code 1.139 — filter empty session groups)

<!-- Decomposed từ ideas/clone-vscode.md (2026-10-02) — chuỗi 6 feature "Clone VS Code vào Wakii",
     thứ tự dòng = thứ tự thực hiện (nền tảng trước, UI polish sau).
     Đã có sẵn trong code, KHÔNG rã lại: command palette ⌘J (components/cmd-j/), quick open
     (quick-open-search.ts), breadcrumbs (EditorBreadcrumbs.tsx), minimap (editorMinimapEnabled),
     sticky scroll (Monaco 0.55 built-in), terminal split + terminal search, settings pane +
     ShortcutsPane/KeybindingsFileActions. Word wrap indicator = VSC-908, terminal reflow = VSC-907. -->
- [ ] VSC-911: Workspace search & replace :: panel tìm/thay toàn workspace kiểu VS Code Ctrl+Shift+F — dựng UI search/replace panel trên ripgrep có sẵn (src/main/ripgrep/, filesystem-search-handlers), fuzzy + preserve case khi replace + include/exclude globs + kết quả grouped theo file click-mở-editor (nguồn: VS Code Search & Replace docs + ideas/clone-vscode.md)
- [ ] VSC-912: Terminal shell integration mở rộng :: nâng OSC 133 bootstrap (powershell-osc133-bootstrap.ts) lên shell integration đầy đủ — command decorations (dấu success/fail từng lệnh), navigation giữa commands (scroll tới lệnh trước/sau), Run Recent Command từ palette (nguồn: VS Code terminal shell integration docs + ideas/clone-vscode.md)
- [ ] VSC-913: Git gutter + inline blame trong file editor :: decorations cột trái Monaco file editor — marker thay đổi added/modified/deleted theo git diff, hover inline blame (author + commit + message), quick actions trên hunk (stage/revert) (nguồn: VS Code GitLens/git gutter docs + ideas/clone-vscode.md)
- [ ] VSC-914: Merge editor 3-way :: giải conflict trong editor 3 cột (incoming/current/result) dựng trên Monaco + ConflictReview infra có sẵn, chấp nhận từng hunk hoặc cả file, nút hoàn tất merge ghi kết quả ra file (nguồn: VS Code merge editor docs + ideas/clone-vscode.md)
- [ ] VSC-915: Commit graph UI :: đồ thị lịch sử commit của workspace/branch hiện tại — render DAG commit, filter theo branch/author, click commit xem diff chi tiết, dựng trên git log --graph data (nguồn: VS Code Git Graph extension pattern + ideas/clone-vscode.md)
- [ ] VSC-916: Theme system :: hỗ trợ nhiều theme (dark hiện tại + light), base nền data-theme trong main.css, theme tokens chuẩn hóa, setting chọn theme trong Settings > Appearance (nguồn: VS Code themes docs + ideas/clone-vscode.md)
