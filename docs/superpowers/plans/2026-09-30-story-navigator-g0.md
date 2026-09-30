# Story Navigator G0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thử nghiệm navigator pass chạy tay đúng 1 lần cho 1 story active — ra brief + inbox + state để user chấm chất lượng, quyết định có bật G1 (automation cron) hay không.

**Architecture:** Prompt file là toàn bộ "code" — mọi agent (session này, session khác, automation tương lai) đọc và thực thi y hệt. Collect 100% reuse: `story-status` + `story-stats` (kit bins) + MCP wakii-story read-only + git log. Output = 3 file trong `docs/superpowers/navigator/<story>/`. Không đụng kit, không mutation.

**Tech Stack:** bash kit bins (vendored path), MCP wakii-story (4 tool read-only), claude session bất kỳ, markdown + json.

**Spec:** `docs/superpowers/specs/2026-09-30-story-navigator-design.md`

## Global Constraints

- Fences §3 spec — navigator KHÔNG: orchestration mutation CLI, gate-resolve, task-update, `resume --send`, Linear write, push, sửa code.
- Write scope: CHỈ `docs/superpowers/navigator/` trong orca repo (`/Users/hoivu/Desktop/projects/orca`).
- 1 process: chạy tuần tự, không spawn session song song.
- Brief ≤ 60 dòng; nguồn đọc chết → `⚠ <nguồn> không đọc được` trong brief, không im lặng.
- `state.json` ghi SAU CÙNG, atomic (temp + rename); pass crash → pass kế làm lại (idempotent).
- docs/** gitignored → mọi git add của file trong docs/ phải `-f`.

---

### Task 1: Khung navigator + prompt file

**Files:**
- Create: `docs/superpowers/navigator/navigator-pass-prompt.md`
- Create: `docs/superpowers/navigator/` (thư mục, chứa prompt + sau này per-story dirs)

**Interfaces:**
- Consumes: kit bins tại `resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin/{story-status,story-stats,story-notify}`; MCP tools `story_task_list`, `story_gate_list`, `story_watchdog_status`, `story_bracket_read`.
- Produces: `navigator-pass-prompt.md` — tài liệu thực thi mà Task 2 chạy theo nguyên văn; đồng thời là template G1 nhúng vào automation.

- [ ] **Step 1: Tạo thư mục + prompt file với nội dung nguyên văn dưới đây**

Tạo `docs/superpowers/navigator/navigator-pass-prompt.md`:

````markdown
# Navigator Pass — story read-only advisory

Bạn là NAVIGATOR. Nhiệm vụ: nhìn 1 story active, viết brief + khuyến nghị. BẠN KHÔNG LÀM GÌ KHÁC.

## Fences (vi phạm = pass hỏng)

- CẤM mutation: orchestration mutation CLI, gate-resolve, task-update, resume --send,
  Linear write, git push, sửa code, đụng worktree story.
- Write scope: CHỈ `docs/superpowers/navigator/<story-slug>/` trong repo hiện tại.
- Chạy tuần tự, không spawn gì song song.
- Nguồn chết → ghi `⚠ <nguồn> không đọc được` vào brief, KHÔNG bỏ im.

## Bước 1 — Chọn story

- Nếu caller chỉ định story → dùng story đó.
- Không → chạy: `bash resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin/story-status`
  Chọn story đang có SF chưa Done / checkpoint mở. Nhiều story → ưu tiên story có watchdog verdict không phải RUNNING (tức đang kẹt).

## Bước 2 — Collect (đúng thứ tự, ghi thiếu nguồn nào vào danh sách ⚠)

1. `story-status` (đã chạy ở bước 1 — tái dùng output)
2. MCP `story_watchdog_status` — verdict per sf-*
3. MCP `story_task_list` — DAG task hiện tại
4. MCP `story_gate_list` — gate mở/đóng
5. MCP `story_bracket_read` — bracket/mindmap story (không có file → ⚠)
6. `git -C <worktree-story> log --oneline -10` per branch chính của story
7. `bash resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin/story-stats <story>` (Linear chết → ⚠, không retry)

## Bước 3 — Chọn chế độ (ưu tiên từ trên xuống, ĐÚNG 1 chế độ)

1. **stall-deep-dive**: watchdog status có verdict `STALLED*` cho bất kỳ sf-*
2. **landscape-check**: đọc `docs/superpowers/navigator/<story>/state.json` (nếu có) —
   có SF chuyển sang DONE so với `sf_statuses` lần trước
3. **strategy-brief**: mặc định

## Bước 4 — Viết brief (`docs/superpowers/navigator/<story>/brief.md`, OVERWRITE)

```markdown
# Navigator brief — <story> — <ISO timestamp>
Chế độ: <mode> · Trigger: thủ công (G0)
## Hiện trạng (≤5 dòng)
<story đang đâu, SF nào done/chạy/chờ, agent nào sống>
## Rủi ro / dead-end (≤5 mục)
<theo chế độ: stall = nguyên nhân + phương án resume/kill/đổi hướng kèm cái mất/cái giữ;
 landscape = SF kế còn đúng tier/đích không; strategy = drift, vòng lặp>
## Khuyến nghị top-3
1. <1 dòng> → inbox NAV-<id>
2. ...
3. ...
## Nguồn ⚠
<danh sách nguồn đọc thất bại; không có thì ghi "(không)">
```

Brief ≤ 60 dòng (stall-deep-dive cho phép ≤ 120).

## Bước 5 — Viết inbox entries (`.../<story>/inbox.md`, APPEND, không đụng entry cũ)

Mỗi khuyến nghị đáng nói (không nhất thiết đủ 3):

```markdown
## NAV-YYYYMMDD-HHMM-<n> [open] <tiêu đề 1 dòng>
Lý do: ≤3 dòng
```

`<n>` đếm từ 1 trong pass này. Entry cũ của coordinator (`[ack]` + dòng quyết định) GIỮ NGUYÊN.

## Bước 6 — Ghi state (`.../<story>/state.json`, SAU CÙNG, atomic)

```json
{
  "story": "<slug>",
  "last_pass": "<ISO>",
  "mode": "<mode>",
  "sf_statuses": {"SF-1": "done", "SF-2": "running"},
  "stall_seen": false,
  "acks_total": 0,
  "⚠": []
}
```

Ghi: viết `state.json.tmp` → `mv` đè. Đọc `acks_total` cũ + đếm entry `[ack]` mới nếu có.

## Bước 7 — Tự kiểm rồi MỚI báo cáo

Checklist tất cả phải ĐÚNG:
- [ ] brief tồn tại, ≤60 dòng (hoặc ≤120 nếu stall-deep-dive)
- [ ] mọi entry inbox có NAV-ID + `[open]`
- [ ] state.json parse được JSON
- [ ] `git status --short` trong repo = chỉ file dưới `docs/superpowers/navigator/`
- [ ] không lệnh mutation nào đã chạy

Báo cáo cuối: 1 dòng — `<story> · <mode> · <n> khuyến nghị · <k> nguồn ⚠`.
````

- [ ] **Step 2: Tự kiểm prompt file đủ 7 bước + fences**

Run: `grep -c '^## Bước' docs/superpowers/navigator/navigator-pass-prompt.md && grep -c 'CẤM mutation' docs/superpowers/navigator/navigator-pass-prompt.md`
Expected: `7` và `1` (hoặc ≥1).

- [ ] **Step 3: Commit**

```bash
git add -f docs/superpowers/navigator/navigator-pass-prompt.md
git commit -m "docs(navigator): navigator-pass prompt G0 — read-only advisory pass"
```

---

### Task 2: Thực thi 1 pass cho story VI-1

**Files:**
- Create: `docs/superpowers/navigator/vi-1-vietnamese-i18n/brief.md`
- Create: `docs/superpowers/navigator/vi-1-vietnamese-i18n/inbox.md`
- Create: `docs/superpowers/navigator/vi-1-vietnamese-i18n/state.json`

**Interfaces:**
- Consumes: `navigator-pass-prompt.md` (Task 1) — thực thi theo nguyên văn, không sáng tác thêm.
- Produces: 3 file thử nghiệm đầu tiên; `state.json` là baseline cho lần pass sau (landscape-check diff).

- [ ] **Step 1: Snapshot tiền-pass (cho fence-assert Task 3)**

```bash
git status --short > /tmp/navigator-pre-git.txt
git -C /Users/hoivu/Desktop/projects/orca rev-parse HEAD
```
Ghi lại HEAD + nội dung status (hiện đang sạch).

- [ ] **Step 2: Chạy pass theo prompt nguyên văn**

Thực thi navigator-pass-prompt.md từ Bước 1 → Bước 7 cho story `vi-1-vietnamese-i18n`.
KHÔNG tự do sáng tạo ngoài prompt. Ghi đầy đủ 3 file output.

- [ ] **Step 3: Tự kiểm của pass (7 mục checklist trong prompt Bước 7)**

Run:
```bash
wc -l docs/superpowers/navigator/vi-1-vietnamese-i18n/brief.md
node -e "JSON.parse(require('fs').readFileSync('docs/superpowers/navigator/vi-1-vietnamese-i18n/state.json','utf8')); console.log('state OK')"
git status --short | grep -v navigator || echo "fence OK"
```
Expected: brief ≤60 dòng (hoặc ≤120 stall) · `state OK` · `fence OK`.

- [ ] **Step 4: Commit**

```bash
git add -f docs/superpowers/navigator/vi-1-vietnamese-i18n/
git commit -m "docs(navigator): pass đầu tiên VI-1 (G0 thủ công) — brief + inbox + state"
```

---

### Task 3: Fence-assert + user chấm chất lượng → verdict G0

**Files:**
- Modify: `docs/superpowers/plans/2026-09-30-story-navigator-g0.md` (tick checkbox — chỉ khi chạy trong plan-tracking)

**Interfaces:**
- Consumes: snapshot tiền-pass (Task 2 Step 1), 3 file output (Task 2).
- Produces: **verdict G0** — quyết định G1 của user, ghi vào chat.

- [ ] **Step 1: Fence-assert toàn diện**

```bash
diff <(git status --short) /tmp/navigator-pre-git.txt | grep -v navigator && echo "FENCE VI PHẠM" || echo "fence sạch"
```
Expected: `fence sạch` (chỉ navigator dir xuất hiện mới).
Sau đó MCP `story_task_list` + `story_gate_list` 1 lần nữa — số lượng task/gate KHÔNG đổi so với lúc collect trong pass (chỉ đọc, không shift).

- [ ] **Step 2: Đưa brief cho user + bộ câu chấm**

Hỏi user chấm 3 câu (trả lời tự do):
1. Brief có chứa điều gì bạn CHƯA biết không?
2. Đọc brief hết bao lâu? (mục tiêu ≤2 phút)
3. Khuyến nghị top-3 — cái nào usable ngay?

- [ ] **Step 3: Ghi verdict**

- 3 câu đều tích cực → G0 PASS → lên kế hoạch G1 (automation cron 3h — plan riêng).
- ≥2 câu tiêu cực → chỉnh prompt theo feedback, chạy lại Task 2 (pass thứ 2, landscape-check sẽ tự kích do có state).
- Toàn tiêu cực → dừng G0, spec giữ nguyên làm hồ sơ, gỡ navigator dir nếu user muốn.

---

## Self-review

- **Spec coverage**: §4 prompt file (Task 1) ✓ · §5 3 chế độ (prompt Bước 3) ✓ · §6 inbox protocol (prompt Bước 5 + G1 sẽ test ack) ✓ · §8 lỗi nguồn chết (fences + Bước 2) ✓ · §9 G0 (Task 2–3) ✓ · §10 thước (Task 3 câu chấm) ✓. G1/G2 ngoài scope plan này (đã ghi rõ).
- **Placeholder scan**: prompt có nội dung nguyên văn đầy đủ; không TBD/TODO.
- **Type consistency**: NAV-ID format khớp spec §6; state.json keys khớp giữa Bước 6 và Bước 3 (sf_statuses).
