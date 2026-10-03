# Stranded branches — công việc chưa bàn giao (janitor v0 triage 03/10)

3 branch local `wakii-dev/sf-*` mang 55 commit patch-độc-lập (chưa từng lên integration,
stale từ 22/09). User RULING 03/10: GIỮ NGUYÊN + ghi backlog — không xoá, không archive.

| Branch | Tính năng | Commits | Kế hoạch đề xuất |
|---|---|---|---|
| `wakii-dev/sf-3-search-replace` | Search & replace UI (row, confirm dialog, per-file) | 19 | **FI-30 đang PENDING đúng đề tài** — khi launch SF-1, đánh giá tận dụng branch này trước khi viết lại |
| `wakii-dev/sf-2-explorer-vscode` | File explorer compact mode | 22 | Story tiềm năng (ngoài scope FI-32 đã DONE) — rebase lên tip mới khi mở |
| `wakii-dev/sf-4-chrome-tabs` | Editor chrome & tabs parity | 14 | Story tiềm năng — tương tự |

Janitor rules đã chạy: 2 branch MERGED (sf-3-viewer-mindmap, sf-4-convergence-wakii)
đã `branch -d` an toàn 03/10.
