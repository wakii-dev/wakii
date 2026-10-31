# QA-SWEEP — story "test toàn bộ hệ thống tìm lỗi tích hợp" (bài học FI-390/397 demo-day 9/9)

Trigger: user nói "test toàn bộ", "săn lỗi", "kiểm tra hệ thống sau nhiều fix", hoặc sau 2+ story fix liên tiếp
trước khi release. Đây là story ĐẶC BIỆT: sweep theo LỚP LỖI ĐÃ BIẾT, không test-random, không story thường.

## 5 lớp lỗi tích hợp (mỗi lớp = 1 detector đo được)

| # | Lớp | Detector | Bằng chứng thật (9/9) |
|---|-----|----------|----------------------|
| 1 | **Config drift compose↔code** | Script diff mọi `${VAR:default}` (application.yml, @Value, gateway-routes) ↔ compose env; DANGEROUS = default `localhost` + service chạy container | gateway thiếu LOG_URI → /api/log 500; 4 service thiếu JWT keys mount → boot crash; PG max_connections=100 → seed fail |
| 2 | **S2S auth gap** | Enumerate mọi HTTP client service→service → probe path/token/role từng pair | ordering re-price gọi path catalog ADMIN không token → checkout 502 |
| 3 | **Data lifecycle** | Fresh-boot (down -v) + inject data bẩn (cart null variant, product variant-less) → journey | 11/24 product variant-less kẹt checkout; cart row variantId null; fresh volume lộ bug seed p.id alias |
| 4 | **UI surfacing sai dữ liệu** | Round-trip mọi field form admin (PUT sentinel → GET diff) + assert view số = dữ liệu thật | admin view stock luôn 0 dù tồn thật; "Đã bán"=ratingCount |
| 5 | **Stale environment** | Fresh-boot harness + orphan-port/daemon guard | PWA/SW bundle cũ; dev server mồ côi :3000/:5173; daemon wedge build+stack |

## Hybrid phân tầng (verdict P0 FI-403 — đừng chọn 1 trong 2)

- **Tầng RẺ (chạy mọi lúc, kể cả đang demo):** config-audit script + S2S auth matrix + RBAC matrix
  (guest/user/admin × mọi admin endpoint). Vài phút, non-destructive, bắt lớp 1-2 exhaustive.
- **Tầng NẶNG (on-demand gated):** fresh-boot harness `backup pg_dump → down -v → build (stack TẮT) → up →
  health gates theo tầng → seed → probes → journeys`. Duy nhất bắt lớp 3+5. Build TUYỆT ĐỐI không đồng thời
  stack up (daemon wedge ×3 đêm 9/9 trên VM 7.65GB — RAM = build + full stack không vừa).

## Safety gates fresh-boot (bắt buộc, đúng thứ tự)

1. Confirm flag env + hỏi user (demo đang chạy = cấm).
2. `docker system df` + disk + RAM check.
3. `pg_dump` 9 DB vào backups/ (test gunzip).
4. down -v → **build serialized khi stack tắt** → up với health gates theo tầng (infra → JVMs → FE, timeout rõ).
5. seed → probes (1 ảnh MinIO load được — down -v xóa miniodata mà seed không re-upload; login admin/user;
   1 add-to-cart; 1 admin API).
6. Sau sweep: seed lại trước khi trả máy cho demo.

## S2S auth pattern (predecessor có sẵn)

- Service account pattern: notification IdentityClient (login identity + cache token theo expiry) — service
  cần gọi path ADMIN phải dùng pattern này; KHÔNG nhét token tĩnh vào env (JWT hết hạn 15').
- Alternative rẻ hơn: cho phép public by-id read endpoint (same shape public by-slug — không leak gì mới) +
  env trỏ client sang — precedent: ORDERING_PRICING_BYIDPATH + GET /api/catalog/products/by-id/{id}.
- Khi thêm endpoint mới cho S2S: nhớ gateway admin-prefixes + SecurityConfig service-side (2 lớp) —
  path /inventory/admin/** đã có precedent copy được.

## Field round-trip test (lớp 4 — làm cho MỌI form admin)

PUT payload với SENTINEL value từng field → GET đọc lại → diff → khôi phục. Script mẫu: python + curl,
1 file/form. Field "không lưu" hay gặp: field form gửi nhưng backend DTO không có (stock variant — catalog
bỏ qua, phải sang inventory API riêng); field view luôn 0 vì view không đọc service sở hữu (phải fetch
client-side hoặc view service gọi sang).

## Đặt trong story

- SF tách: [detector tĩnh] / [harness] / [journey specs] / [run+fix+re-run cap 2] — detector mechanism ở
  tier đầu, run+fix ở tier sau; KHÔNG trộn.
- Fix finding: pattern đã biết → fix trong story; lạ/đụng backend sâu → escalate user (đừng nhét).
- Bug register living-doc: docs/superpowers/qa/bug-register.md — lớp → detector → finding → fix → re-run.
- Mỏm thật đã Materialize trong repo FI-403: scripts/qa/ (fresh-boot harness + config audit + s2s matrix) —
  copy pattern thay vì viết lại.
