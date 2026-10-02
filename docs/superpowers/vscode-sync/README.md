# vscode-sync — runbook hệ thống

Hệ thống automation: ý tưởng lớn → phân rã → story tuần tự → launch → merge.
Mọi thứ cần để dựng lại trên máy khác nằm trong file này.

## Kiến trúc

```
ideas/*.md ──► vscode-idea-decomposer (hourly :41) ──► backlog [ ]
                                                            │
vscode-feature-scout (hourly :23) ──► CREATE story ──► [S] ─┤ SERIAL: 1 story
story-auto-launch (30') ──► approve + launch executor ◄────┘
                                                            │
BẠN merge PR → vscode-sync-dispatch mark-done VSC-XXX ──► [x] + fire scout → lặp
```

Backlog `backlog.md` là **nguồn sự thật duy nhất** của state machine:
`[ ]` chờ scout · `[~]` scout đang tạo · `[S]` staged chờ launch/merge ·
`[x]` merged. Bin `vscode-sync-dispatch` là người viết duy nhất.
SERIAL: 1 story từ claim đến merged — xong mới claim cái khác (đúng ý owner).

## 3 automations (store của app — default runtime, KHÔNG phải orca-dev)

Tất cả: provider `claude` · workspace `name:wakii-dev` · fresh-session ·
missed-run-grace 720'. Precheck fail → run ghi `skipped_precheck`, không tốn agent.

### 1. vscode-feature-scout — cron `23 * * * *`

- Precheck: `vscode-sync-dispatch scout-precheck`
- Nhiệm vụ: resume story `[~]` dở (hoàn tất CREATE còn thiếu) rồi phân tích
  release notes VS Code mới → tối đa 3 feature `add-feature` → `next` claim →
  story-workflow CREATE (epic + SF Linear, KHÔNG launch) → `mark-staged`.

### 2. story-auto-launch — cron `*/30 * * * *`

- Precheck: `vscode-sync-dispatch launch-precheck`
- Nhiệm vụ: CHỈ launch story từ backlog `[S]` (SERGUARD: bỏ story Linear cũ
  ngoài pipeline — FI-50/FI-458 do người quản lý trực tiếp); annotate `pr: #N`;
  KHÔNG merge.

### 3. vscode-idea-decomposer — cron `41 * * * *`

- Precheck: `vscode-sync-dispatch ideas-pending`
- Nhiệm vụ: tìm idea PENDING trong `ideas/` → story-workflow FLAG `--decompose`
  (xem SKILL.md) → ghi chuỗi feature tuần tự vào backlog → `mark-idea-decomposed`.

## Lệnh chính (bin `vscode-sync-dispatch`)

```bash
vscode-sync-dispatch board              # toàn cảnh quản lý (1 cửa duy nhất)
vscode-sync-dispatch now                # fire scout NGAY (sau khi thêm feature)
vscode-sync-dispatch mark-done VSC-XXX  # sau merge — TỰ fire scout story kế
vscode-sync-dispatch status             # alias của board
vscode-sync-dispatch add-feature "TÊN :: MÔ TẢ"   # scout tự dùng
vscode-sync-dispatch next / mark-staged / annotate / claim-pane / cleanup-stale…
```

## Vòng đời 1 feature

```
[ ] → scout claim [~] → CREATE (.wakii + epic + SF Linear)
    → mark-staged [S] → auto-launch approve + launch (executor sf-worktree)
    → PR + checks (story-pr-checks) → BẠN merge → mark-done [x]
    → scout tự fire cho feature kế
```

Merge gate: chỉ merge khi `story-pr-checks <pr>` exit 0 (xem merge-playbook).
Sau merge: `mark-done VSC-XXX` — bin tự fire scout story kế.

## Dựng lại automations (máy mới / registry mất)

Chạy bằng **orca.exe trực tiếp** (KHÔNG qua orca.cmd — unicode vỡ qua batch;
KHÔNG có ORCA_USER_DATA_PATH — store nằm ở default runtime). Prompt phải
**1 dòng** (edit cắt newline) và **không chứa `"` hoặc `|`** (PS 5.1 vỡ argv).
Xem prompt đầy đủ hiện hành: `orca automations show <id> --json` trên máy đang
chạy, hoặc mở `panel.html`/`main.mjs` trong plugin. Sau create: `automations edit
<id> --precheck <cmd>` (create hay rơi precheck) và verify `worktreeId` bind
`.../wakii/wakii-dev` trong `automations show`.

## Troubleshooting

Đọc `LESSONS.md` trước — 8 bài học đã cắn thật (MSYS flake, pane protocol,
dispatch_failed cosmetic, argv vỡ, pass-lock…). Lệnh `board` là điểm bắt đầu
mọi chẩn đoán: state sai → đọc dòng backlog tương ứng.
