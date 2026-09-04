# STORY-WATCHDOG — tự check & hoàn thiện khi bị ngắt quãng (anti-stall)

Vấn đề thật (FI-151): story chạy dở — agents dừng giữa chừng, tier kẹt, không ai
tự hoàn thiện. Watchdog là vòng tự kiểm tra + tự tiếp tục, chạy độc lập với agents.

## Cơ chế (/goal native — đúng cơ chế Claude Code, verified claude -p hoạt động)

```bash
# Watchdog dùng /goal: condition được evaluator model (haiku) kiểm sau MỖI turn
# — Claude tự chạy turn kế thay vì trả control. Không cần bash sleep-loop.
cd <story-parent-worktree>
claude "/goal STORY <EPIC-ID> COMPLETE theo ĐÚNG checklist sau: (1) mọi SF sub-issue
  state Done trên Linear (list children verify) (2) mọi sf-branch: rev-list count
  <đích>..<sf> == 0 (3) final verify pass trên nhánh đích (smoke/tests) (4) sf-*
  worktrees đã remove — git worktree list chỉ còn main + story parent (5) Epic
  state Done. Chứng minh MỖI điều bằng output lệnh thật trong transcript. Bound:
  hoặc stop sau 40 turns. Trong mỗi turn: stall-check 3 tầng mọi SF chưa Done →
  resume idle / launch tier sẵn / merge hộ Done-chưa-merge (merge-ngược an toàn +
  ancestor guards) / cleanup-on-merge. Blocked SF ≥2 cùng nguyên nhân → đánh dấu
  bỏ, mọi SF còn lại blocked → báo STORY-BLOCKED trong output (goal sẽ bị đánh
  impossible → tự clear). KHÔNG merge nhánh đích vào main."
```

- `/goal` evaluator = model nhỏ riêng đánh giá sau mỗi turn bằng **những gì Claude
  đã surface trong transcript** → điều kiện phải ghi rõ "chứng minh bằng output
  lệnh thật" (evaluator không tự chạy lệnh).
- Turn bound (`stop sau 40 turns`) chống chạy vô hạn; blocked-all → in rõ
  STORY-BLOCKED để evaluator trả "impossible" → tự clear.
- Xem tiến trình: `◎ /goal active` indicator (interactive) hoặc
  `--output-format stream-json --verbose` (headless).

## Watchdog rules (AUTO-MODE mặc định — chạy tới hoàn thành)

- **NO EVIDENCE = NO CLAIM** (bài học FI-169: coordinator kể công watchdog khi
  log 0 bytes, 2 turn liên tiếp). Attribute tiến độ cho ai → đòi bằng chứng
  (log bytes, commit mới, verdict file). Log trống 1 chu kỳ → điều tra, không
  report "đang chạy". Process lạ trong Orca → grep skill/docs cho
  panel-spawned behaviors TRƯỚC khi kill.
- Chỉ được: check, resume (sendText), launch SF mới, merge, audit. KHÔNG code thay SF.
- **Chạy tới STORY-COMPLETE hoặc STORY-BLOCKED — KHÔNG giới hạn số vòng.** Người
  dùng không cần nhắn "tiếp tục". Sau mỗi vòng: nếu có TIẾN TRIỂN (SF mới Done /
  merge mới / launch mới) → vòng kế tiếp 10 phút. Nếu KHÔNG tiến triển 3 VÒN LIÊN TIẾP
  → coi như stall: thử resume một lần; vẫn không tiến → STORY-BLOCKED + exit.
- Blocked SF: 2 lần cùng nguyên nhân → đánh dấu bỏ qua (không đập đầu); nếu mọi SF
  còn lại đều blocked → STORY-BLOCKED ngay.
- Tiến trình log mỗi vòng vào /tmp/story-watchdog-<EPIC>.log (1 dòng: vòng N —
  done X/Y — hành động kế). Audit comment lên epic mỗi 5 vòng.
- Cách dừng: dùng PID file (`kill $(cat /tmp/story-watchdog-<EPIC>.pid)`) —
  `pkill -f story-watchdog` chỉ là phương án cuối (nguy cơ giết nhầm process
  khác match pattern).
- Khi COMPLETE: chạy Story CLOSE đầy đủ (verify + dọn sf worktrees + Epic Done +
  in nhánh đích) RỒI exit — không dừng giữa chừng chờ người.

## Kích hoạt

LAUNCH panel button gửi kèm watchdog start (prompt của panel đã hướng dẫn); hoặc
chạy tay lệnh `/goal` ở trên sau khi launch SFs. Kiểm tra watchdog sống:
`ps aux | grep story-watchdog` + tail log.

**Bảo hiểm khi watchdog cũng chết:** cuối mỗi ngày làm việc, chạy thủ công 1 vòng
check 3-tầng cho mọi SF In Progress (5 phút) — watchdog là lớp tự động, không phải
sự thay thế con người nhìn bracket.
