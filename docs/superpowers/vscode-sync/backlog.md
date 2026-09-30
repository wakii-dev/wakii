# VS Code sync backlog

Mỗi dòng dưới đây là 1 feature VS Code cần sync vào Wakii. Automation
`vscode-sync-dispatch-pass` (cron 30') lấy **đúng 1 feature chưa dispatch** mỗi
pass và chạy **story-workflow đầy đủ** cho nó (epic + SF + coordinator).

## State machine (bin quản lý — không sửa tay phần `[~]`)

| Checkbox | Nghĩa |
|---|---|
| `- [ ]` | Chưa dispatch — automation sẽ lấy theo thứ tự trên xuống |
| `- [~]` | Đang chạy story (tối đa 1 cái — pass sau sẽ noop) |
| `- [x]` | Story đã merged vào `wakii-dev` |

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
