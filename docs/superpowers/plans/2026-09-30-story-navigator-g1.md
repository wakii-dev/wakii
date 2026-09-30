# Story Navigator G1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bật automation `story-navigator` cron 3h chạy navigator pass unattended — brief + inbox + toast tự động, chạy thử 1 pass đầy đủ trước khi để lịch.

**Architecture:** MỘT automation Orca (`orca automations`) chạy prompt trỏ vào `navigator-pass-prompt.md` (đã hardening cuối G0) — pass tự chọn chế độ, tự collect 7 nguồn (degraded được: ⚠ chuẩn hoá), tự viết 3 file + toast. Không đụng kit, không process thứ hai.

**Tech Stack:** `orca automations` CLI (create/run/runs/list), claude provider, kit bins read-only, MCP wakii-story read-only.

**Spec:** `docs/superpowers/specs/2026-09-30-story-navigator-design.md` (§4 toast, §9 G1, §10 thước, §11 non-goals)

## Global Constraints

- Spec §11: KHÔNG đụng kit ở G1 (không rehash, không release, không sửa bin).
- Guide-ack defect (MCP `story_task_list`/`story_gate_list` exit 1) CHƯA fix — collect degraded là trạng thái CHẤP NHẬN của G1; fence "im lặng là lỗi" vẫn bắt buộc ⚠ đủ.
- ĐÚNG 1 automation `story-navigator` — KHÔNG tạo automation khác cùng họ (ruling 429: 1 process).
- Cron minute 17 (`17 */3 * * *`) — tránh đụng hàng phút chẵn.
- Mọi pass — kể cả do automation — không mutation; write scope chỉ `docs/superpowers/navigator/` (fences trong prompt giữ nguyên).
- docs/** gitignored → `git add -f`.

---

### Task 1: Prompt lên cấp G1 (thêm bước toast + đổi wording trigger)

**Files:**
- Modify: `docs/superpowers/navigator/navigator-pass-prompt.md`

**Interfaces:**
- Consumes: prompt G0 đã hardening (7 Bước + Fences, commit `4b63ff33`).
- Produces: prompt G1 — Task 2 chạy nó qua automation; Bước 8 (toast) là bề mặt duy nhất khác G0.

- [ ] **Step 1: Sửa prompt — 3 chỗ, mọi thứ khác giữ nguyên**

1. Dòng đầu sau tiêu đề: đổi `(G0 thủ công)` thành `(G0 thủ công · G1 automation)`.
2. Trong Fences, sửa bullet toast thành: `Toast (story-notify): BẬT ở G1 — chạy Bước 8 sau khi brief+inbox+state đã ghi xong; thất bại toast KHÔNG làm pass fail, ghi 1 dòng vào report pass.`
3. Thêm Bước 8 (sau Bước 7, trước phần tự kiểm nếu tự kiểm nằm trong Bước 7 — giữ 7 Bước cũ nguyên văn, Bước 8 là mục mới):

```markdown
## Bước 8 — Toast (CHỈ khi chạy qua automation; pass thủ công G0 bỏ qua)

Chỉ chạy nếu env `NAVIGATOR_AUTOMATED=1`. Không có biến này → bỏ qua im hiểu.

```bash
bash resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin/story-notify \
  "story-navigator" "<story> · <mode> · <n> khuyến nghị · <k> nguồn ⚠"
```

Toast fail → ghi 1 dòng `⚠ toast không gửi được` vào cuối brief, KHÔNG chạy lại quá 1 lần.
```

4. Đầu prompt (phần vai trò): thêm dòng `Automation set NAVIGATOR_AUTOMATED=1 khi chạy qua orca automations — Bước 8 chỉ kích với biến này.`

- [ ] **Step 2: Verify cấu trúc**

Run: `grep -c '^## Bước' docs/superpowers/navigator/navigator-pass-prompt.md && grep -c 'NAVIGATOR_AUTOMATED' docs/superpowers/navigator/navigator-pass-prompt.md`
Expected: `8` và `≥2`.

- [ ] **Step 3: Commit**

```bash
git add -f docs/superpowers/navigator/navigator-pass-prompt.md
git commit -m "docs(navigator): prompt G1 — Bước 8 toast qua NAVIGATOR_AUTOMATED"
```

---

### Task 2: Tạo automation + chạy thử đúng 1 pass

**Files:**
- Create: `docs/superpowers/navigator/vi-1-vietnamese-i18n/` — outputs mới do pass automation viết (brief.md overwrite, inbox.md append, state.json overwrite)

**Interfaces:**
- Consumes: prompt G1 (Task 1); `orca automations` CLI.
- Produces: automation `story-navigator` đang enabled — Task 3 giám sát nó; bằng chứng pass thử (outputs + run history).

- [ ] **Step 1: Tạo automation**

```bash
orca automations create \
  --name story-navigator \
  --trigger "17 */3 * * *" \
  --provider claude \
  --repo path:/Users/hoivu/Desktop/projects/orca \
  --workspace-mode existing \
  --prompt "Đọc docs/superpowers/navigator/navigator-pass-prompt.md và thực thi NGUYÊN VĂN từ Bước 1 đến Bước 8 cho toàn bộ story active mà story-status liệt kê (tuần tự, một story một lúc). NAVIGATOR_AUTOMATED=1. Fences trong prompt là bất di bất dịch." \
  --enabled
```

Nếu `--trigger` từ chối cú pháp cron → dùng `--trigger cron --schedule "17 */3 * * *"` (alias đã có). Nếu `--workspace-mode existing` cần `--workspace` → xem `orca automations create --help` lúc chạy và bổ sung selector worktree chính của repo.

- [ ] **Step 2: Chạy thử ngay 1 pass (không đợi cron)**

```bash
orca automations run story-navigator
```

Đợi run hoàn tất; xem `orca automations runs --name story-navigator` (hoặc `orca automations runs` rồi lọc) — run phải kết thúc không crash.

- [ ] **Step 3: Verify kết quả pass**

```bash
git status --short | grep -v navigator || echo "fence OK"
head -2 docs/superpowers/navigator/vi-1-vietnamese-i18n/brief.md
node -e "JSON.parse(require('fs').readFileSync('docs/superpowers/navigator/vi-1-vietnamese-i18n/state.json','utf8')); console.log('state OK')"
grep -c 'toast' docs/superpowers/navigator/vi-1-vietnamese-i18n/brief.md || true
```
Expected: `fence OK` · brief có timestamp MỚI hơn pass G0 (16:11 UTC 30/09) · `state OK` · toast line: hoặc bằng chứng notify gửi, hoặc `⚠ toast không gửi được` (cả hai chấp nhận được ở lần đầu — G1 runbook ghi theo dõi).

- [ ] **Step 4: Commit bằng chứng + ghi kết quả tạo automation**

```bash
git add -f docs/superpowers/navigator/vi-1-vietnamese-i18n/
git commit -m "docs(navigator): pass thử G1 qua automation story-navigator — outputs + bằng chứng"
```

Ghi automation id + run id vào report/task (không có file config automation trong repo — orca app quản lý).

---

### Task 3: Runbook tuần quan sát + rollback

**Files:**
- Create: `docs/superpowers/navigator/G1-runbook.md`

**Interfaces:**
- Consumes: automation `story-navigator` (Task 2) đang enabled.
- Produces: tài liệu vận hành 1 tuần — ai cũng làm được theo, kể cả session mới.

- [ ] **Step 1: Viết runbook với nội dung sau (nguyên văn)**

```markdown
# G1 Runbook — story-navigator (tuần quan sát)

## Trạng thái
Automation `story-navigator` · cron `17 */3 * * *` · provider claude · repo orca (wakii-main/wakii-dev).
Bật ngày: <điền khi bật>. Tuần quan sát kết thúc: <bật + 7 ngày>.

## Kiểm hàng ngày (≤2 phút)
1. `orca automations runs` — 8 run/ngày, không crash liên tiếp 2 run.
2. `docs/superpowers/navigator/<story>/brief.md` — timestamp mới, Nguồn ⚠ có lý do cụ thể.
3. Inbox — coordinator ack entry mới trong ngày làm việc.

## Thước G1 (spec §10)
- ĐẠT: ≥1 entry inbox ack "chấp nhận" dẫn tới thay đổi quyết định thật trong tuần; đọc brief ≤2 phút.
- THẤT BẠI: 0 ack chấp nhận sau 1 tuần, hoặc brief toàn tin đã biết.

## Rollback (một lệnh, mọi lúc)
    orca automations remove --name story-navigator

Không cần revert commit docs — outputs cũ là lịch sử.

## Neo rủi ro đã biết
- Collect degraded: task_list/gate_list ⚠ mỗi pass (guide-ack defect G2) — ĐỪNG coi là pass hỏng.
- 429 penalty: automation là process claude DUY NHẤT chạy định kỳ — nếu bật thêm process khác, tắt cái này.
- Pass chồng cron: pass lâu >3h là tín hiệu thu nhỏ scope collect, không phải thêm cron.
```

- [ ] **Step 2: Commit**

```bash
git add -f docs/superpowers/navigator/G1-runbook.md
git commit -m "docs(navigator): G1 runbook — quan sát 1 tuần + rollback"
```

---

## Self-review

- **Spec coverage**: §4 toast (Task 1 Bước 8) ✓ · §9 G1 automation (Task 2) ✓ · §10 thước (Task 3 runbook) ✓ · §11 non-goals kit (Global Constraints) ✓ · degraded collect được đặt tên + neo (Global Constraints + runbook) ✓.
- **Placeholder scan**: runbook có 2 chỗ `<điền khi bật>` — chủ đích (giá trị chỉ tồn tại lúc thực thi, step yêu cầu điền); còn lại mọi lệnh/giá trị cụ thể.
- **Type consistency**: tên automation `story-navigator` thống nhất 3 task; NAV timestamp baseline "16:11 UTC 30/09" khớp pass G0 thật; biến NAVIGATOR_AUTOMATED khớp giữa Task 1 prompt và Task 2 --prompt.
