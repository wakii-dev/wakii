---
name: post-task-ritual
description: >-
  Skill self-improvement ritual — chạy SAU khi workflow hoàn thành (Phase 5 cuối).
  7 steps: problems → solutions → patterns → which skill to update → update → index memory → clear log.
  Triggered by orca-superpowers-workflow Phase 5 ("post-task-ritual summary"),
  or user nói "ritual", "post-task", "học từ task này", "cải thiện skill".
  Khác Principle 6 (in-flight flag): đây là bước deliberate end-of-task,
  không phải flag giữa chừng.
---

# Post-Task Ritual — skill self-improvement có kỷ luật

Sau mỗi story/workflow hoàn thành, dành 5 phút **học một cách có chủ đích**.
Routine tasks giấu pattern hữu ích nhất — đừng skip vì "cảm thấy không có gì".

## 7 Steps (thứ tự cố định)

### 1. PROBLEMS — gì đã gây khó khăn?
Liệt kê mọi friction gặp trong task vừa xong:
- Lệnh sai cú pháp / silent failure
- Protocol mơ hồ phải tự diễn giải
- Tool thiếu năng lực phải workaround
- Decision phải hỏi lại user giữa chừng

Nguồn: `docs/superpowers/improvements-log.md` entries từ task này (nếu có flag sẵn) + tự nhớ lại.

### 2. SOLUTIONS — đã giải thế nào?
Với mỗi problem: cách thực tế đã dùng (không lý thuyết). Ghi cả **cách không hoạt động** nếu đã thử — fail-path cũng là tri thức.

### 3. PATTERNS — cái nào lặp lại / tổng quát được?
Lọc: đâu là 1-off, đâu là pattern sẽ gặp lại?
- Gặp ≥2 lần trong task này, HOẶC
- Khái quát được thành rule ("khi gặp X → luôn Y"), HOẶC
- Đáng dạy lại cho skill để lần sau không phải mò

Loại bỏ: noise, may mắn, cái chỉ đúng trong context hẹp này.
Litmus (learned 2026-09-03, aihero/handoff): pattern này **còn đúng vào tháng
sau không?** Còn đúng → skill/memory (standing context). Chỉ của story này →
để trong bracket/Linear audit, đừng bắn lên skill.

### 4. WHICH SKILL TO UPDATE — đích chính xác
Mỗi pattern → 1 đích (chọn nhỏ nhất chứa được):
| Pattern loại này | Đích |
|------------------|------|
| Flow/phase/threshold nên đổi | `orca-superpowers-workflow` SKILL.md (section tương ứng) |
| Story-level rule | `story-workflow` SKILL.md |
| Agent behavior | agent file tương ứng trong ~/.claude/agents/ |
| CLI syntax đã verify | Verified CLI reference (trong story-workflow) |
| Workflow khác (docs, conventions) | file đó |

Không chắc đích → flag vào improvements-log, đừng nhét nhầm chỗ.

### 5. UPDATE — sửa skill (đúng quy tắc an toàn)
- **No-op test trước khi ghi** (learned 2026-09-03, aihero/writing-for-agents):
  xóa dòng pattern đi, hỏi hành vi agent có ĐỔI không? Không đổi = no-op
  (model đã biết sẵn) → đừng ghi, nó chỉ trả context. Pattern phải đổi behavior.
- Edit file đích với thay đổi nhỏ nhất truyền được pattern
- Đánh dấu nguồn: thêm comment `(learned YYYY-MM-DD <task-id>)` nếu rule mới
- Xóa rule bị phản chứng trong task này
- **Không** refactor lớn — ritual là patch, không phải rewrite
- Sau edit: grep kiểm duplicate — "duplication là dấu hiệu tin cậy nhất rằng
  document chưa từng được test"
- Nếu kit có mặt: nhắc user chạy sync-from-local sau

### 5b. INDEX — ghi story vừa xong vào graph memory
Sau khi patterns đã lọc (step 3) và skill đã update (step 5): ghi story vừa xong vào graph memory `docs/superpowers/memory/*.md` (format SF-1 — xem ontology.md + parser `bin/story-memory-parse`). CURATED theo thiết kế — KHÔNG auto-extract đậm đặc: chỉ entities/triples thật sự đáng ghi (patterns mới, decisions, bugs, files produced).

Quy tắc append:
1. Grep `S | P | O` ở triples.md TRƯỚC — triple ĐÃ TỒN TẠI → KHÔNG thêm dòng triple, CHỈ thêm 1 dòng provenance (một triple nhiều nguồn = nhiều dòng provenance cùng triple-ref).
2. Mọi triple mới ≥1 dòng provenance ngay (parser từ chối thiếu).
3. ts = event date (ngày commit/comment — không phải ngày extract).
4. Entity mới → grep id trước khi thêm.
5. Xong chạy `bin/story-memory-parse validate` — gặp duplicate S|P|O do merge song song → chạy `bin/story-memory-fuse` rồi validate lại.

Watermark + audit (cùng watermark incremental với watchdog `--with-index`):
- Cập nhật `~/.story-memory.state`: dòng `git:<repo>|<short-hash-HEAD>` (thay dòng cũ của repo nếu có) + dòng `linear|<ISO-ts>`.
- Append 1 dòng audit vào `~/.story-memory.log`: `<ISO-ts> | ritual:<story-id> | +N triples` (N = số dòng triple MỚI thêm lần này).

Ví dụ dòng cụ thể:
```
# entities.md (chỉ khi id chưa có — grep id trước):
sf:FI-153 | SF | SF-2 Hero Three.js | identifier=FI-153;sf=2;state=Done
# triples.md (grep "s | rel | o" trước — trùng thì BỎ QUA dòng này):
pattern:RE-GATE-ON-RESUME | learned-from | story:FI-151 | 2026-08-16
# provenance.md (LUÔN thêm — nhiều nguồn = nhiều dòng cùng triple-ref):
pattern:RE-GATE-ON-RESUME | learned-from | story:FI-151 | git-commit | 6d0b498
```

### 6. CLEAR LOG — dọn để không lặp lại
Improvements-log entries đã xử lý qua steps trên → đánh dấu resolved (không xoá — audit trail). Log chỉ giữ items còn mở.

## Quy tắc

1. **Chỉ chạy SAU hoàn thành** — không giữa task (giữa task là Principle 6 flag).
2. **Patch, không rewrite** — 1 ritual = vài dòng edit, không tái cấu trúc.
3. **Đích nhỏ nhất** — pattern vào đúng 1 chỗ; tìm không ra → improvements-log, không scatter.
4. **User trên hết** — nếu pattern mâu thuẫn ý user đã nói rõ → không auto-override.
5. **Skip một cách trung thực** — thực sự không có gì học → nói "không có pattern mới" và kết thúc. Đừng bịa pattern cho có.

## Output (1 dòng mỗi step, sau khi xong)

```
RITUAL-DONE: N problems → N solutions → N patterns → files updated: <list> | log cleared: N items | no-new-patterns (nếu bước 3 rỗng)
```

## Sau ritual (kit machines)

Nếu chạy trong máy có story-team-kit:
```bash
cd ~/Documents/story-team-kit && ./sync-from-local.sh
# commit + push để máy khác nhận pattern mới
```
