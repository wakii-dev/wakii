# Navigator brief — fi380-kit-manifest — 2026-09-30T17:31:01Z
Chế độ: strategy-brief · Trigger: automation (G1)
## Hiện trạng (≤5 dòng)
2/2 SF shipped: SF-1 (FI-381, manifest 2.2.0 provides 49) — kit tiến tiếp tới 2.20.0/67
provides trên integration (mục tiêu đã vượt); SF-2 (FI-382, installKit fail-loud) đủ vòng:
refactor + preflight-validator + fail-path-notify-block + negative-harness-6-cases +
toast-fallback (review P1) + rehash-bundle. Tip 218d7f8e35 TRÊN integration.
Mindmap/bracket không có state — story-status đọc bracket (chưa .wakii canonical?).
Không agent sống.
## Rủi ro / dead-end (≤5 mục)
- Epic treo "bracket: fi380-kit-manifest" không verdict — mọi SF xong từ lâu (kit 2.16.11→2.20.0 đã chạy qua nhiều release).
- Bracket chưa migrate .wakii (nếu nằm ngoài 7 story migrate 27/09) — nguồn #5/7 cho story này lệch quy ước mới.
- Linear FI-381/382 rate-limited — chưa khớp issue-side.
- installKit merge-guard defect đã fix 27/09 (memory) — thuộc vòng 2.20.0, không thuộc story này.
- Không còn code hở → chỉ còn thủ tục đóng.
## Khuyến nghị top-3
1. Epic DONE verdict FI-380 — 2 SF shipped + kit đã tiến xa hơn scope story → inbox NAV-20260930-1731-1
2. Nếu FI-380 chưa trong 7 story migrate .wakii: bootstrap mindmap từ bracket (story-mindmap --bootstrap) → inbox NAV-20260930-1731-2
3. Linear FI-381/382 đối chiếu + đóng khi hồi phục → inbox NAV-20260930-1731-3
## Nguồn ⚠
- story_task_list không đọc được (guide-gate exit 1)
- story_gate_list không đọc được (guide-gate exit 1)
- story-stats không đọc được (cần bracket approve + linear IDs; Linear rate-limited)
- story-status states FI-380: Linear rate-limited — states tạm bỏ qua
