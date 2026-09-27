# Code Review: SF-3 Guardrails + convergence QA (VI-1) — 2026-09-28

Reviewer: code-reviewer (độc lập) · Range: fbbd659675..HEAD (3 commits) · Pre-merge gate review.

### Deterministic (facts — reviewer re-run, không pipe)
- [vitest] src/renderer/src/i18n/: 23 files / 190 tests PASS, exit 0
- [metric] node config/scripts/locale-translatedness-metric.mjs vi → 14764/14764 = 100.00%, exit 0
- [oxlint] 6 changed source files (5 test + driver): 0 findings, exit 0
- [tc:web] exit 0

### Findings

- [P2][confidence:high] Evidence có 2 cặp frame trùng (docs/superpowers/evidence/sf-3-vietnamese-i18n/12-terminal-en.png, 15-terminal-vi.png, 16-workbench-vi.png)
  evidence: md5 — 12-terminal-en.png == 11-workbench-en.png (fc5d442f); 15-terminal-vi.png == 16-workbench-vi.png == 03-sidebar-vi.png (453fb409). 11 file nhưng 9 frame distinct. Driver log trung thực: "(no New Terminal affordance visible — workbench shot stands in)" (rule0-extra.txt:65,82); đã xem ảnh — terminal pane CÓ trong frame (prompt `sf3-demo-project git:(master)` + chrome vi "Tìm kiếm/Dự án/Yêu cầu"). Đề xuất: test-run.txt ghi rõ 9 frame / xoá 2 file trùng giữ tên đúng nghĩa. Không hạ giá trị visual pass — 4 màn đều có en/vi thật.
- [P2][confidence:high] Driver không browser.close() (config/scripts/vi-rule0-extra-captures.mjs:105)
  evidence: `const browser = await chromium.connectOverCDP(...)` — không có close nào trên browser; trái chính test-run.txt:54-55 "Mọi playwright client PHẢI browser.close()". Mitigated: one-shot, process exit đóng socket. Đề xuất: `await browser.close()` trong finally.
- [P2][confidence:med] ws message-wait không timeout (config/scripts/vi-rule0-extra-captures.mjs:55-63)
  evidence: `const result = await new Promise((resolve) => { const onMessage = ... })` — inspector nhận connect nhưng không reply → driver treo vĩnh viễn. Đề xuất: Promise.race timeout + ws.close() trên path lỗi.
- [P2][confidence:high] Header ratchet nói thiếu trường hợp (src/renderer/src/i18n/vi-translatedness-ratchet.test.ts:10-12)
  evidence: "A count only drops when an existing vi value reverts toward English" — en.json XOÁ key đã-dịch cũng giảm count (metric đếm leaf phía en-tree; verified bằng đọc computeTranslatedness). Fail-loud + bump baseline là escape thiết kế; sửa comment cho chính xác (docs/reference/vietnamese-localization.md:22-24 lặp claim này).

### NEEDS VERIFICATION
(none)

### Coverage pass (22 file diff)
- [coverage] src/renderer/src/i18n/vi-technical-literal-mistranslations.test.ts — reviewed, non-vacuous verified: replay trên catalog thật (en populations Push 1/Pull 1/Merge 4/Branch 7/Commit 4, 0 vi-mismatch; 6 pin đúng giá trị; cam kết/nhánh/wakii scans 0 violation). Clean.
- [coverage] src/renderer/src/i18n/vi-translatedness-ratchet.test.ts — reviewed, 2 chiều verified bằng metric thật in-memory: vi revert 1 leaf → 14763 (RED vs floor 14764); en thêm key → 14764 (GREEN). Baseline 14764 có nguồn gốc (SF-2 ship 27/09, header + test-run.txt:12). P2#4.
- [coverage] src/renderer/src/i18n/lazy-locale.test.ts — reviewed, precedence ĐỦ 2 chiều (pack đè khi chọn; built-in nguyên khi chọn vi) + fallback khi pack bị gỡ; additions only. Clean.
- [coverage] src/renderer/src/i18n/intl-locale.test.ts — reviewed, real-ICU vi unstubbed (Chủ Nhật + '1 ngày trước'), TZ-safe (fixed local noon). Clean.
- [coverage] src/renderer/src/i18n/git-blame-locale-catalog.test.ts — reviewed, 6→7 catalogs + rename six→seven + formatter wrap; 9 keys × 7 locales. Clean.
- [coverage] config/scripts/vi-rule0-extra-captures.mjs — reviewed, side-effect sạch: không native picker (typed inputs), không focus steal (CDP shot hidden window), clone dest do operator truyền (/tmp thật), IPC `ui:toggleWorktreePalette` khớp src/main/window/main-window-shortcut-actions.ts:31. P2#2, P2#3.
- [coverage] docs/reference/vietnamese-localization.md — reviewed, khớp code đã verify (metric semantics, ratchet floor, guards, 9-string claim đúng = 7+2 keys). Clean ngoài P2#4.
- [coverage] evidence test-run.txt / rule0-verify.txt / rule0-extra.txt — reviewed, append-log trung thực (FAIL intermediate còn nguyên), dòng cuối khớp claims; RED→GREEN proofs test-run.txt:6-16 (Push→Đẩy, cam kết insert, Wakki, portsToggleDescription revert).
- [coverage] evidence 12 PNG — reviewed, 11 file hợp lệ PNG 1920×1008; 2 cặp trùng → P2#1; nội dung 4 màn en/vi thật (đã xem 12/15).
- [coverage] evidence vi-catalog-notes-for-sf-2.md — reviewed, mục D đúng đúng Verify criteria (guard chỉ assert class sạch; leak A/B chưa bị guard chặn — ghi cho SF-2). Clean.

### Surgical-scope check
- In-scope: 5 test files (spec slice 1-6) + docs/reference (slice 9) + evidence (slice 7) → OK.
- config/scripts/vi-rule0-extra-captures.mjs ngoài literal touch map nhưng thuộc slice 7 (RULE-0 driver, pattern theo vi-rule0-browser-verify.mjs SF-2 cùng dir) → chấp nhận, ghi nhận.
- vi.json / bootstrap script / translation policy: 0 byte thay đổi (diff rỗng) → boundary GIỮ.

### CHECKLIST-4Q
1. Q1 logic — test asserts có thật-sự kiểm hành vi, không tautology? PASS — guard non-vacuous (en-side populations 1/1/4/7/4 keys, pins khớp giá trị thật, replay 0-violation); ratchet RED thật khi vi mất giá trị + en-add GREEN (simulate bằng computeTranslatedness thật); RED proofs mutation có trong test-run.txt:6-16.
2. Q2 boundary — diff không đụng vi.json/policy/bootstrap? PASS — `git diff fbbd659675..HEAD -- vi.json` rỗng; name-status chỉ có test/driver/docs/evidence.
3. Q3 evidence — RED→GREEN + RULE-0 screenshots đầy đủ và nhất quán? PASS — 3 tier logs + 11 PNG (4 màn đều có en/vi frame thật, đã xem ảnh; persist PASS); lưu ý 2 cặp frame trùng (P2#1) không làm mất giá trị pass.
4. Q4 reuse — ratchet tái dụng computeTranslatedness, không định nghĩa translatedness thứ hai? PASS — ratchet import computeTranslatedness từ config/scripts/locale-translatedness-metric.mjs (verified import + semantics); guard test chỉ có leaf-collector riêng (pattern ja/ko siblings), không phải định nghĩa translatedness.

### Verdict
APPROVED — chỉ P2 (evidence trùng lặp + 2 nit driver + 1 comment imprecise); deterministic 4/4 xanh re-run; scope sạch; 4Q PASS.

VERDICT: APPROVED — chỉ P2: evidence duplicate frames + driver nits; deterministic xanh, scope sạch, CHECKLIST-4Q 4/4 PASS.
