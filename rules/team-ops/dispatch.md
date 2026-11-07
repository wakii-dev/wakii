---
paths:
  - "team-ops/**"
  - "captain ops"
---
# Dispatch Protocol — điều phối worker (team-ops)

> Nguồn: 5 lỗi thật 07/11 (spawn TỪ CHỐI ×2 · báo nhầm ok:true · làm nhầm worktree ×3 · send pane idle · kết thúc im lặng). CEO duyệt encode.

1. **TRƯỚC spawn**: dọn REG/pane chết; kiểm grid còn ghế; CHỈ 1 dispatch tại 1 thời điểm.
2. **SAU spawn**: 3 bằng chứng BẮT BUỘC trước khi báo dispatched — REG entry · state ready · RECEIPT trong room. Thiếu 1 = CHƯA dispatched → re-dispatch ngay, không báo trước.
3. **Brief dòng 1**: đường dẫn worktree TUYỆT ĐỐI + worker ACK path là việc đầu tiên (Captain kiểm ACK trước khi tin worker đúng chỗ).
4. **CẤM send prompt dài vào pane idle** — dispatch bằng spec-file; pane idle không submit input (đã gặp: mất 20 phút).
5. **Worker im >15' không DONE trong khi pane idle** → ⚠️ room + Captain kiểm file output THẬT trước khi kết luận (pane idle ≠ đã làm).

Chi tiết vận hành: captain.md mục DISPATCH PROTOCOL 5 ĐIỀU.
