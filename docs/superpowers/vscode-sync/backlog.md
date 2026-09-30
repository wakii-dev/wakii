# VS Code sync backlog

Mỗi dòng dưới đây là 1 feature VS Code cần sync vào Wakii. Automation
`vscode-sync-dispatch-pass` (cron 30') lấy **đúng 1 feature chưa dispatch** mỗi
pass và chạy **story-workflow đầy đủ** cho nó (epic + SF + coordinator).

## State machine (bin quản lý — không sửa tay phần `[~]`/`[S]`)

| Checkbox | Nghĩa |
|---|---|
| `- [ ]` | Chờ scout phân tích + tạo story |
| `- [~]` | Scout đang tạo story (tối đa 1) |
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
