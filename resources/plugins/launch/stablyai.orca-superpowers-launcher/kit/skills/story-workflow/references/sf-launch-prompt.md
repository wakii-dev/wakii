# SF Launch Prompt — the WHOLE handoff template

Bản đầy đủ của SF prompt gửi khi launch worktree (hoặc dispatch task-executor
in-session — same content). everything else lives in bracket + Linear.

**Transport rule (learned 2026-09-03, aihero/handoff):** prompt chứa backticks
và paths — KHÔNG ghép trực tiếp vào `--prompt "..."` trong shell (command
substitution / silent truncation — agent nhận brief thiếu mà vẫn khởi động).
Viết ra `/tmp/sf-prompt-<sf>.md`, launch `--prompt "$(cat ...)"`. Chi tiết:
bảng Worktree SF trong `references/cli-verified.md`.

**Definition of DONE for an SF run (bài học SF-7: agent đặt Linear Done rồi kết
thúc mà bỏ merge — 468 dòng kẹt ngoài nhánh đích. Merge là một phần của DONE,
không phải bước tùy chọn sau):**

```
"Use orca-superpowers-workflow skill for ONE sub-feature: <SF name> (<SF-id>).
 WHY this SF exists (pass the argument — learned 2026-09-03, aihero/handoff):
 <1 dòng — SF này phục vụ success criterion nào của epic; reasoning để agent
 ra quyết định đúng khi gặp việc ngoài spec>.
 Skills to load: orca-superpowers-workflow (bắt buộc); + figma-orientation /
 image-to-code nếu SF chạm UI theo bracket Design field.
 Story: <epic-id> — READ FIRST: context pack docs/superpowers/contexts/sf-<n>.md
 (spec slice + touch map + ACCEPTANCE user-visible + boundary) + bracket file:
 <path>. All epic-level questions are already answered — do not re-ask; câu
 hỏi mới → REQUIREMENT-GAP comment lên epic (xem EXECUTE MODEL). Pick your
 tier by size (Standard if small).
 Run full Phase 0-5 for this SF only. Linear issue: <SF-ISSUE> (In Progress
 at start). Worktree base: story/<epic-id>-<slug> (nhánh đích).
 COMPLETE run checklist, theo thứ tự — KHÔNG dừng trước bước 4:
   1. code + tests pass
   2. verify (Phase 5) — kiểm từng dòng ACCEPTANCE trong context pack, KHÔNG
      chỉ process-pass
   2b. ★ RULE 0 — BROWSER VERIFY (3 tầng nhận thức):
       Tầng 1 DOM: đo kích thước/màu/giá trị qua eval — HỖ TRỢ
       Tầng 2 VISUAL: chụp screenshot + so Figma capture — BẰNG CHỨNG
       Tầng 3 FLOW: đi trọn login→navigate→click→logout — CHUẨN ĐO
       → Nếu screenshot fail / DOM không match → NÓI THẬT "tôi không
         xác nhận được" → nhờ USER xác nhận → KHÔNG tự kết luận
       → Nếu flow đứt / UI sai → FIX trước bước 3
       KHÔNG ĐƯỢC nói "UI hoạt động" khi chưa THẤY nó chạy.
   2c. TESTER REVIEW ĐỘC LẬP: dispatch code-reviewer agent
       (cyan) trên diff SF — KHÔNG Dev tự duyệt. CHANGES-REQUESTED → Dev fix
       rồi re-review. APPROVED mới qua bước 3. (Team Model: tách bạch
       Dev/Test — self-test không thay thế reviewer độc lập.)
   3. MERGE worktree branch vào nhánh đích story/<epic-id>-<slug> (no-ff; nếu
      conflict improvements-log → giữ CẢ HAI entries) + audit comment merge-hash
      lên issue
   4. GATE CỨNG (learned 2026-08-28 FI-187: sf-1 merge TRƯỚC reviewer dù prompt
      ghi thứ tự — lời nhắc không đủ): chạy `~/.claude/bin/story-verify <sf>`
      — phải sạch (không FAIL, không VIOLATION) thì mới qua bước 5. Còn FAIL
      → quay lại đúng bước checklist tương ứng, KHÔNG tick Done.
   5. RỒI MỚI set issue Done.
 Linear Done TRƯỚC merge = run INCOMPLETE (coordinator sẽ phải merge hộ + flag)."
```

## Memory patterns khi launch (PM gọi — optional, fail-safe như story-resume)

Trước khi gửi SF prompt, chạy `story-memory inject "<sf-name + story/bracket
context>"` — có kết quả thì đính block `## Patterns liên quan (từ memory graph)`
vào CUỐI launch prompt (≤3 dòng, đã kèm provenance). CLI chưa install / chưa
index / không match → bỏ qua, launch như bình thường (inject là optional layer).
