# Defensive Patterns — story-workflow

Mỗi rule dưới đây sinh từ một sự cố thật trong FI-151/FI-169. Đọc trước khi
chạy approve/launch/watchdog/merge. (Pattern tổ chức này học từ DSH
defensive-patterns.md — rules gom 1 chỗ, không rải.)

1. **Báo facts độc lập RIÊNG BIỆT.** Process timeout VẪN có thể exit 0 (trap
   signal); parse-fail VẪN có thể create thành công. Không nest báo cáo này
   trong nhánh kia — "exit 0" không có nghĩa "thành công", ".ok false" không
   có nghĩa "lệnh chưa chạy". (Nguồn: SIGPIPE giết server nhưng port LISTEN;
   3 duplicate issues từ parse-fail.)
2. **Async state ≠ sync state.** "Agent đang chạy" không phải "tiến độ là
   công của agent". Trước khi attribute: định nghĩa interval (từ đâu tới
   đâu) + đòi evidence trong interval đó. (Nguồn: kể công watchdog log-trống
   2 turn.)
3. **Dispose phải chờ quiescence.** Kill server/agent xong KHÔNG có nghĩa nó
   chết — verify (curl chết, process gone, port free) trước khi coi resource
   rảnh. (Nguồn: dev server chết giữa probe runs nhưng port còn LISTEN.)
4. **Callback/agent lỗi không được phá core.** Một reviewer throw không được
   kéo chết coordinator — catch, log, tiếp tục với agent khác.
5. **Không cho output không tin cậy thấy môi trường.** Agents không được
   echo env vars (KEY/TOKEN/SECRET) vào audit/logs/probes.

## Truncation disclosure (DSH pattern — model phải biết mình chưa thấy gì)

Mọi chỗ hệ thống cắt bớt output, PHẢI nói rõ cái gì bị cắt — model tưởng đã
thấy đủ là nguồn quyết định sai:
- Probes nhiều kết quả (grep/find nhiều match): in `... và N kết quả nữa (đã
  lưu full list vào <file>)` — KHÔNG in im lặng 10 dòng đầu.
- Panel fileRead cap 256KB — bracket lớn hơn sẽ cắt: panel đã return phần
  đọc được; agent đọc file trực tiếp khi cần phần sau.
- terminal read --limit N: nếu output dài hơn N → tail ghi rõ `[đã cắt X dòng đầu]`.
- Rule chung: **đã cắt mà không nói = nói dối bằng cách im lặng.** Fair sample
  (mẫu đại diện) OK, nhưng phải dán nhãn là sample.
