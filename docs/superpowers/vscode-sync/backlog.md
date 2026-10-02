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
