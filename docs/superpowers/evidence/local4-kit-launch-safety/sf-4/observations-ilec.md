# Quan sát hiện trường ILEC (VU-32) — 04/10 chiều — READ-ONLY

Người ghi: sf-4 worker (worktree sf-4-local4-kit-launch-safety). Mọi lệnh chỉ ĐỌC (cp/pgrep/lsof-orca
terminal list) — KHÔNG kill, KHÔNG reset state, KHÔNG dispatch, KHÔNG tick hộ. Driver oxford-vocab-crawl
(pid 43453, caffeinate 43465) còn SỐNG trong suốt quan sát — không bị đụng.

Snapshot thô: `ilec-snapshot/` (cp thuần driver.log / state.json / outcomes.jsonl của 2 slug).

## Hiện trạng

- Repo: `/Users/hoivu/orca/projects/iloveenglishclup` (primary, master) — 4 driver state dirs:
  oxford-vocab-crawl (PID sống), vocabulary-learn (đã xong — done_gate=1), vocabulary-hub,
  vocabulary-module.
- Worktrees: `iloveenglishclup-vocabulary-learn` (branch vocabulary-learn) tồn tại — worktree per-story
  của driver; oxford chạy trên worktree Orca `workspaces/iloveenglishclup/oxford-vocab-crawl`.
- Mindmap: `oxford-vocab-crawl.wakii` còn ở primary (sf-1..sf-4, không state field = pending);
  `vocabulary-learn.wakii` KHÔNG còn ở primary (chỉ còn trong worktree) — sf-1 done + meta.doneVerdict
  "1/1 SF + 5/5 tasks".

## 4 quan sát (đề xuất — fix là quyết định coordinator/USER, driver thuộc session khác)

1. **Worker pane mới mỗi pass (terminal-per-pass)** — context pack gọi trước, xác nhận + tìm được root
   cause: `run_worker` tìm pane theo title CHÍNH XÁC `story-worker-<slug>` trong `orca terminal list`;
   Orca đổi title pane theo process khi claude chạy (hiện còn sống: handle
   `term_05c10048-…`, title **"✳ vocabulary-learn story worker (ILEC)"**) → lookup trượt dù pane còn
   sống → create pane mới → driver.log vocabulary-learn thấy ≥3 handle khác nhau (term_49af4e35 04:36,
   term_60abca96 04:45, term_b76cf56e 04:53, + pass 06:03). Bằng chứng: driver.log
   (ilec-snapshot/vocabulary-learn.driver.log dòng 166/245/298) + orca terminal list 13:50 giờ VN.
2. **BLOCKED hoạt động NHƯNG state bị reset ngoài driver rồi dispatch tiếp** — log: 04:41:59 + 04:44:52
   hai lần `BLOCKED: sf-1 attempts=3 ≥3 — leo user`; 04:45:32 driver start MỚI → 04:45:53 dispatch
   WORKER thành công. Code driver KHÔNG có đường reset attempts sau block → ai đó (tay/session chủ) đã
   viết lại state.json giữa 2 pass (state hiện tại: attempts=0, done_gate=1). Breaker 1-file-state:
   xóa/sửa state.json = tắt fence. Không đổ lỗi — chỉ ghi hiện tượng.
3. **render_digest crash ENOENT mỗi pass portable** — driver `cd` vào worktree per-story rồi
   `render_digest` đọc `docs/superpowers/navigator/driver` TƯƠNG ĐỐI (worktree không có navigator —
   gitignored) → `ENOENT: scandir` stack 20 dòng xả vào driver.log + vào outcome "action" (mục 4) MỖI
   pass. Crash không kill driver (node con tách biệt) nhưng log bẩn thường xuyên.
4. **outcomes.jsonl nhiễm stack trace** — `last=$(grep -v "driver (start|done)" LOG | tail -1)` nhặt
   dòng CUỐI bất kỳ → khi render_digest crash, `action` của pass = "Node.js v24.10.0" (dòng cuối stack),
   không phải action thật. instinct-v0 data rank sai nền. 15/16 pass vocabulary-learn (chỉ 1 pass
   --dry 19:30 hôm trước sạch) + 2/3 pass oxford bị dính.

## Quan sát phụ (không phải defect driver)

- **Schema marker lệch**: mindmap ILEC dùng `wakiiMindmap: "wakii-mindmap-schema-v1"`; resolver kit wakii
  hiện tại (decoder hỗ trợ `1`) → `INVALID: version` → driver fallback legacy đọc `$MM` (đúng thiết kế
  fail-open, version kit lệch giữa máy). Nhắc để kit-host publish đồng bộ marker.
- **state.json oxford có key `blocked_sf4`/`blocked_sf3` (không dash)** — schema driver hiện tại là
  `blocked_$SF` với `$SF` = `sf-4` (có dash) → 2 key này KHÔNG được driver đọc; chúng là sản phẩm
  chỉnh tay/kèm annotation của session chủ (log có dòng `GATE-REVISION … ĐÓNG LẠI` 06:42:57Z — không do
  driver). Chỉ ghi nhận, không đụng.
