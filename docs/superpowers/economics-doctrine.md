# Economics Doctrine — các con số vận hành Wakii kit + navigator

- Người giữ: docs này là **nguồn sự thật duy nhất** cho mọi ngưỡng vận hành. Đổi số = sửa đây + commit (policy, không phải code folklore).
- Xuất xứ: hội tụ 3 nguồn độc lập (OCR benchmark 18/09 · graph-memory provenance 19/09 · ECC instincts/economics 03/10 — xem wakii-site research cùng ngày).

## 1. Context budget

| Số | Giá trị | Vì sao |
|---|---|---|
| SessionStart fact-pack | ≤ 2KB | inject vừa phải, không nuốt context phiên |
| DIGEST | ≤ 30 dòng (driver: TOP-3 + action log) | đọc ≤ 2 phút/pass |
| Brief mỗi story | ≤ 60 dòng (stall-deep-dive ≤ 120) | quét 1 ca trực |
| MCP servers cho user | 1 (wakii-story, read-only) | budget ECC: <10 MCPs/<80 tools — mình thấp hơn chủ đích |
| SessionStart nav context | chỉ inject khi story sống | focus-rule 03/10 |

## 2. Model tiering

| Việc | Model |
|---|---|
| Transcription verbatim / mechanical | haiku |
| Tiêu chuẩn (implement, review thường) | sonnet |
| Review cuối / kiến trúc / khủng hoảng | opus |
| Driver navigator pass + worker | claude mặc định project (không forced tier) |

## 3. Nhịp + timeout (driver/navigator)

| Số | Giá trị | Ghi chú |
|---|---|---|
| Tick | 3h (`TICK_SECONDS=10800`) | pane-loop; cấm process định kỳ thứ hai (429) |
| Navigator pass | timeout **45m** | pass thật ~19–25' |
| Worker/verify executor | timeout **20m** (verify scope bounded 15') | |
| Blocked attempts | ≥2 (tick-loss) / ≥3 (verify) → BLOCKED + leo user | per-SF |
| Breaker | ≥3 blocked/ngày → tắt pha lái, chỉ quan sát | reset theo ngày |
| Precheck overlap | brief mới hơn 10 phút → skip | |

## 4. Quy tắc cứng (không phải số nhưng là luật cùng cấp)

1. MỘT process định kỳ duy nhất / MỘT worker / MỘT story-lái tại một thời điểm
2. Worker không bao giờ: push, merge-to-dest, Linear write, DONE-verdict
3. Merge-to-dest + DONE luôn sau cửa người
4. Mọi hành vi tự động ghi audit (log + outcome)
5. navigator/ local-only (gitignored 01/10) — state máy, không vào git

## 5. Số phụ (nói rõ để khỏi folklore luôn)

| Số | Giá trị |
|---|---|
| Confidence inject instincts (ECC-pattern, G2) | min 0.7, top-6 |
| Session-tmp retention | 30 ngày |
| Inbox expiry | 3 pass không ack |
| Precheck mtime | 10 phút |
| Watchdog crontab | 30 phút |
