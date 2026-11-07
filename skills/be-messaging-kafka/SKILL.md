---
name: be-messaging-kafka
description: >-
  Pattern Kafka của boilerplate microservices: transactional outbox (mutation +
  INSERT outbox trong 1 tx, relay poll 500ms), envelope {schemaVersion,id,type,
  occurredAt,payload} với id = khóa idempotency, consumer group filter-by-type,
  manual offset commit SAU khi DB tx commit, retry ×3 in-memory → DLQ, saga
  compensation qua event `task.assignment_failed`. Use khi thêm producer/consumer
  Kafka, đổi topic/envelope, debug event mất/trùng, saga/DLQ fail, hoặc review
  code đụng kafkajs/kafka-go: "outbox", "consumer", "DLQ", "idempotency",
  "compensating event". Nguồn thật: services/node-svc + services/go-svc +
  contracts/events của architecture-overview (trích dẫn cuối file).
---

# BE Messaging Kafka — outbox · consumer · saga · DLQ

At-least-once là mặc định. Mọi pattern dưới đây tồn tại để at-least-once
**an toàn**: không mất event khi crash, không nhân đôi khi redelivery.

## 1. Envelope bắt buộc — contracts/events/task-events.md

Mọi message JSON trên topic phải đúng envelope (golden fixtures machine-checkable
trong `contracts/events/fixtures/`):

```json
{
  "schemaVersion": 1,
  "id": "UUIDv4 — producer sinh, KHÓA IDEMPOTENCY của consumer",
  "type": "task.created | task.updated | task.assigned | task.deleted | task.assignment_failed",
  "occurredAt": "RFC3339 UTC — thời điểm mutation, không phải lúc publish",
  "payload": { }
}
```

- `id` sinh **MỖI event trong cùng DB tx với mutation** — không bao giờ dùng
  taskId làm khóa idempotency (re-assign = nhiều event hợp lệ cùng taskId).
- Thêm field payload = không breaking (consumer bỏ qua field lạ); đổi shape
  breaking = tăng `schemaVersion`. Không bịa type ngoài enum — thêm type = sửa
  task-events.md + fixtures **cùng commit**.
- Không secret trong payload — broker PLAINTEXT compose-internal.
- Không Avro/Schema Registry — JSON thuần + `schemaVersion` (ADR-0008).

## 2. Producer: transactional outbox — KHÔNG publish trong request path

node-svc (`services/node-svc/src/`): mutation + `INSERT outbox` trong **cùng 1
tx** (`db.transaction`, `repo.drizzle.ts`); relay worker (`outbox-relay.ts`)
poll 500ms, batch 100, publish `task-events` rồi mark `published_at`.

- **Publish TRƯỚC mark** — crash giữa chừng = re-publish (duplicate), consumer
  dedupe lo. Mark trước publish = crash mất event vĩnh viễn. Sai thứ tự là bug.
- Message **key = `payload.taskId`** — thứ tự per-task trong 1 partition.
- Relay tick có in-flight guard (tick chồng bỏ qua); purge row published cũ
  sau 7 ngày, mỗi ~2 phút.
- Publish fail sau connect → **drop producer** để tick sau connect lại, không
  tái dụng connection chết.

## 3. Consumer: filter-by-type theo group + idempotency DB

| Group | Nhận | Bỏ qua |
|-------|------|--------|
| `go-svc-activity` (go-svc) | mọi type **trừ** `task.assignment_failed` | compensating là của node |
| `node-svc-compensation` (node-svc) | **chỉ** `task.assignment_failed` | 4 type còn lại |

Thêm group mới = thêm dòng bảng này trong task-events.md cùng commit.

- **Idempotency nằm ở DB, không ở code path**: go-svc
  `INSERT ... ON CONFLICT (id) DO NOTHING` (`internal/store/events.go`);
  duplicate idempotency-replay được coi là **xử lý thành công** — vẫn commit.
  node compensation dùng conditional UPDATE guard (stale/replay không khớp
  guard = thành công, commit).
- `auto.offset.reset: earliest` (`StartOffset: kafka.FirstOffset`) — consumer
  mới đọc lại từ đầu, idempotency lo duplicates.

## 4. Manual commit SAU khi DB tx commit

Sai thời điểm commit là mất event kinh điển:

- commit **trước** tx → crash giữa chừng = mất event (offset đã qua, chưa ghi DB).
- commit **sau** tx = at-least-once — crash = redelivery, dedupe lo phần còn lại.

Cài đặt thật: kafkajs `consumer.run({ autoCommit: false })` + `commitOffsets`
(offset + 1) gọi từ trong `handleMessage` sau DB op (`compensation-consumer.ts`);
kafka-go `CommitMessages(ctx, msg)` gọi **cuối cùng** trong loop sau khi xử lý
xong HOẶC message đã an toàn ở DLQ (`internal/consumer/runner.go`).

Edge quan trọng: **publish DLQ/compensating fail → KHÔNG commit** — message gốc
chỉ còn ở topic chính, commit lúc này = mất vĩnh viễn cả gốc lẫn compensating.
Giữ offset chưa commit → redelivery; DB idempotency lo insert trùng.

## 5. Retry ×3 → DLQ; saga compensating

- Lỗi xử lý retry **×3 in-memory** với backoff (node: 200ms × attempt;
  go: 500ms). Hết lượt → message gốc + metadata lỗi
  `{dlq:{reason,error}, original}` vào `task-events.dlq` rồi commit. KHÔNG
  requeue tự động, KHÔNG block partition.
- **Poison message** (JSON hỏng, shape sai, thiếu field bắt buộc): retry vô ích
  — thẳng DLQ + commit ngay. go-svc có type `poisonError` riêng cho parse fail.
- **Saga**: go consumer retry hết lượt với nguồn `task.assigned` → publish
  compensating `task.assignment_failed` (envelope id **mới** do go sinh) vào
  `task-events` (KHÔNG vào DLQ) → node compensation consumer UPDATE conditional
  task status = `assignment_failed`. Compensating CHỈ cho `task.assigned` —
  poison/DB-down của type khác KHÔNG được mark task fail.
- `task.assignment_failed` là trạng thái hệ thống — không bao giờ xuất hiện
  trong `payload.status` của event khác.

## 6. Lazy-connect — Kafka không bao giờ chặn boot/health

- Kafka KHÔNG vào `/readyz`, KHÔNG service nào `depends_on: kafka`
  (conventions/09 rule 1 — health-gated chain không bị broker chặn).
- Connect fail lúc boot = log warn + retry loop, KHÔNG crash, KHÔNG fallback im
  lặng sang chế độ bỏ-event. `KAFKA_BROKERS` thiếu hẳn = warn 1 lần + relay/
  consumer không start, service vẫn boot.
- Bẫy thật 1: kafkajs subscribe trước khi topic auto-create xong ném
  `UNKNOWN_TOPIC_OR_PARTITION` **ra ngoài** `subscribe()` — phải bọc
  subscribe+run trong vòng retry riêng, không process chết (CI 38365465140:
  unhandled rejection crash → readyz chết).
- Bẫy thật 2: kafka-go join group trước khi topic tồn tại → generation assignment
  rỗng vĩnh viễn (member Stable 0 partition, `FetchMessage` block câm). Fix:
  `EnsureTopics` (CreateTopics idempotent, `TopicAlreadyExists` = OK) trước khi
  join (`internal/consumer/ensure.go`).

## 7. Anti-patterns — at-least-once vs exactly-once

| Anti-pattern | Vì sao chết | Pattern đúng |
|---|---|---|
| Publish broker trực tiếp trong request handler | publish fail giữa chừng = mất event (ADR-0006 đã loại) | outbox + relay |
| Dùng taskId làm khóa dedupe | re-assign hợp lệ = nhiều event cùng taskId, bị nuốt | envelope `id` mới mỗi event |
| Auto-commit trước DB tx | crash = mất event đã commit offset | manual commit sau tx |
| Retry vô hạn cùng partition | 1 poison block cả partition | ×3 → DLQ, không block |
| Gửi compensating vào DLQ | node compensation không đọc DLQ — task kẹt sai mãi | compensating vào topic chính |
| Coi DLQ = có sẵn replay | demo không có alert/replay | copy production: thêm alert + replay tool |
| exactly-once tự chế (DB tx bao cả commit) | commit offset không transactional với DB | at-least-once + idempotent consumer |

## 8. Test consumer bằng gì

- **Golden fixtures chung 2 đầu**: `contracts/events/fixtures/*.json` — relay
  test + consumer test + CI console-producer ĐỀU load cùng file; sửa envelope
  phải qua fixture.
- **Unit không cần broker**: node kafkajs qua seam `EventPublisher`/
  `OutboxStore` + `handleMessage(raw, deps)` pure; go qua seam `MessageSource`
  (FetchMessage/CommitMessages đúng shape segmentio) + `Handler.Handle` —
  `runner_test.go`, `compensation-consumer.test.ts`.
- **E2E saga thật**: `scripts/smoke/e2e.sh` `SMOKE_SAGA=1` — assign fixture
  `svc-fail` (UUID `55555555-...`, Handler cố tình fail deterministic) → retry
  ×3 → compensating → GET task status `assignment_failed` → assert DLQ bằng
  `kafka-console-consumer`. Native không Kafka/docker: `SMOKE_SAGA=0`.

## Nguồn (đọc từ code thật)

- `contracts/events/task-events.md` — envelope, payload theo type, topics, bảng group, delivery semantics
- `contracts/events/fixtures/*.json` — golden fixtures 5 type
- `platform/conventions/09-async-messaging.md` — 9 quy tắc vận hành + env
- `services/node-svc/src/outbox-relay.ts` — relay poll/mark/purge, key = taskId, drop producer khi send fail
- `services/node-svc/src/compensation-consumer.ts` — group node-svc-compensation, autoCommit false, retry ×3, DLQ, vòng retry subscribe
- `services/node-svc/src/repo.drizzle.ts` — mutation + INSERT outbox trong 1 tx
- `services/node-svc/src/server.ts` — lazy-start khi có KAFKA_BROKERS, .catch phòng thủ consumer
- `services/go-svc/internal/consumer/{runner,handler,envelope,ensure}.go` — loop consume, poisonError, compensating, skip-commit khi publish fail, EnsureTopics
- `services/go-svc/internal/store/events.go:23` — `ON CONFLICT (id) DO NOTHING`
- `docs/adr/0008-kafka-outbox-saga.md` — quyết định kiến trúc (supersede ADR-0006)
- `scripts/smoke/e2e.sh` — e2e saga + assert DLQ, env SMOKE_*
