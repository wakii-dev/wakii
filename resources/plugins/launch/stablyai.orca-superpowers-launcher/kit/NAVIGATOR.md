# NAVIGATOR — Workfront Driver & Portable Flow

> **Workfront Driver** (`bin/workfront-driver`) = coordinator tự động: lái dây chuyền
> story workflow cho ĐÚNG 1 story — verify executor → tick mindmap → convergence pack →
> **DONE gate** (cửa người duy nhất). 1 story = 1 navigator instance; story DONE → tự kill.

## Sử dụng

```bash
# Máy gốc (repo wakii) — mặc định lái story trong wakii
workfront-driver --loop <slug>          # ví dụ: vi-1-vietnamese-i18n
workfront-driver --once <slug>          # 1 pass duy nhất
workfront-driver --dry <slug>           # chỉ báo nhánh sẽ chọn, không dispatch

# PORTABLE — project BẤT KỲ (không cần Linear)
workfront-driver --repo /path/to/project [--base master] --loop <slug>
```

- `--repo` tường minh (hoặc env `WAKII_DRIVER_REPO`) → **PORTABLE mode**: tự tạo
  **worktree per-story** `<repo>-<slug>` (branch = slug, từ `origin/<base>`) — primary
  tree không bao giờ bị đụng; bins dùng chính kit đã cài (tự-loc từ vị trí script).
- Hoàn thành (PORTABLE): DONE gate → **push branch + `gh pr create --base <base>`** —
  user review + merge trên GitHub = deploy. Driver **không bao giờ** merge.
- Không có story (FOCUS trống / hết story) → tự thoát, không treo.

## Yêu cầu project được lái (PORTABLE)

1. Mindmap `.wakii` tại `docs/superpowers/mindmaps/<slug>.wakii` (schema v1 — xem
   `story-mindmap`), node `sf-*` là đơn vị driver advance.
2. `docs/superpowers/navigator/` ghi vào `.gitignore` (driver state cục-máy).
3. Worker/verify executor chạy `claude -p` — máy cần Claude Code đăng nhập.

## Gate + rào an toàn

- **DONE epic** là cửa người duy nhất: convergence pack soạn xong → driver DỪNG.
- Worker **không bao giờ**: push, merge, Linear write, DONE-verdict.
- Fail ×3 (per SF) → BLOCKED + leo; breaker ≥3 blocked/ngày → tắt pha lái.
- Single-instance per slug (PID-file) · timeout 45m · caffeinate bọc `--loop`.
- Probe run-list trước dispatch (chống double-dispatch).

## Số vận hành

Toàn bộ ngưỡng (context budget, model tiering, nhịp/timeout, caps) nằm ở
`docs/superpowers/economics-doctrine.md` (repo wakii) — đổi số = sửa doc đó + commit.
Parity nền tảng: `docs/superpowers/support-matrix.md`.

## State của driver

`<repo>/docs/superpowers/navigator/driver/<slug>/` — `driver.log` (audit từng hành
động), `state.json` (verify/attempts/blocked per SF), `outcomes.jsonl` (instincts v0 —
1 dòng JSON/pass; ≥20 pass → rank script đề xuất chỉnh ngưỡng), `driver.pid`.
Toàn bộ **local-only** — thêm `docs/superpowers/navigator/` vào `.gitignore` của project.
