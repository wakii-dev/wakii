---
name: be-api-contract
description: >-
  Contract-first API discipline của boilerplate microservices (node-svc/go-svc/
  spring-svc/auth-svc): OpenAPI spec là nguồn sự thật duy nhất trong contracts/,
  mỗi service sync theo 1 trong 3 chế độ (codegen TS · snapshot bit-identical Go ·
  openapi-generator Java), error envelope chuẩn {error:{code,message,requestId,
  details}} phải khớp cả 2 đầu BE/FE, và quy trình đổi API 4 bước không bỏ bước.
  Use khi thêm/sửa endpoint, đổi response shape, thêm error code, sync types
  BE↔FE, hoặc CI drift-guard/sync-check đỏ: "đổi API", "sửa contract",
  "codegen types", "error envelope lệch", "sync FE types". Nguồn thật:
  services/ + contracts/ + app/shared của architecture-overview (trích dẫn cuối file).
---

# BE API Contract — contract-first, 2 đầu phải khớp

Rule cốt lõi: **spec là nguồn sự thật, code là khách hàng**. Không sửa handler
rồi "bổ sung spec sau" — spec lệch code là drift, CI chặn.

## 1. Ba chế độ sync spec → service

Cùng 1 nguồn `contracts/openapi/*.yaml` (tasks · activity · users · auth ·
dotnet), mỗi stack tiêu thụ khác nhau:

| Service | Chế độ | Cơ chế |
|---------|--------|--------|
| node-svc (Fastify+TS) | **Codegen TS types** | `pnpm --filter node-svc generate:types` → openapi-typescript đọc `contracts/openapi/tasks.yaml` → `src/types/api.d.ts` |
| go-svc (chi) | **Snapshot bit-identical** — KHÔNG codegen | copy spec vào `internal/api/openapi/activity.yaml`; CI job `drift-guard` diff snapshot vs contract — sửa 1 bỏ 1 = fail |
| spring-svc (Boot 3) | **openapi-generator codegen từ snapshot** | plugin 7.12.0 đọc snapshot `src/main/resources/openapi/users.yaml` (phải bit-identical contracts) trong phase `generate-sources` |

Quy tắc chung cả 3: snapshot (nếu có) nằm **trong** service, contract nằm ở
**contracts/** — sync snapshot = copy lại y nguyên, không sửa tay trong snapshot.
go-svc còn serve `/api/activity/openapi.yaml` (spec copy cho swagger-ui) —
sync-check test + drift-guard chống lệch 2 tầng.

DB cũng contract-first: canonical DDL `contracts/db/tasks-schema.sql` —
migration của service sinh ra phải khớp (`schema-diff.test.ts` đọc file này).

## 2. Error envelope chuẩn — 2 đầu phải khớp

Mọi response 4xx/5xx của mọi service dùng **một** shape
(`platform/conventions/04-error-envelope.md`, mirror `components.schemas.Error`
trong cả 5 spec):

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task 9f0e... không tồn tại",
    "requestId": "b1c2...",
    "details": null
  }
}
```

- `code`: `SCREAMING_SNAKE`, catalog tối thiểu `VALIDATION_ERROR` (400) ·
  `UNAUTHORIZED` (401) · `NOT_FOUND` (404) · `CONFLICT` (409) · `UNPROCESSABLE`
  (422) · `DEPENDENCY_DOWN` (503) · `INTERNAL` (500 — message che stack).
- `requestId` nullable — echo `X-Request-Id` từ gateway để trace xuyên service.

**Đầu BE**: Fastify error mặc định (`FST_ERR_*`) phải map sang envelope bằng
`setErrorHandler` riêng — node-svc map `err.validation` → `VALIDATION_ERROR`,
`status >= 500` → message `"Internal error"` + `details: null`
(`services/node-svc/src/app.ts`). 404 ngoài route cũng qua `setNotFoundHandler`
cùng envelope.

**Đầu FE**: không tự parse message — decode bằng helper trong
`app/shared/src/error-envelope.ts`: `decodeErrorEnvelope(status, rawBody)` trả
`ApiError` (giữ `status`/`code`/`requestId`/`details`); body không phải envelope
→ bọc envelope tổng quát `INTERNAL`. FE remotes ném `ApiError` lên UI layer để
switch theo `err.code` (`app/remotes/tasks/src/TasksPage.tsx`).

Đổi envelope ở 1 đầu mà quên đầu kia = contract 2 đầu lệch — sửa phải cùng commit:
convention 04 + `components.schemas.Error` của specs + FE helper.

## 3. FE types — mirror có kỷ luật, không codegen

FE **không** codegen từ spec (khác node-svc): remote `tasks` mirror type Task
bằng tay trong `app/remotes/tasks/src/api.ts` với comment dẫn về spec. Hai
chi tiết dễ sai:

- `TaskStatus` (writable: `todo|in_progress|done`) ≠ `TaskStatusExtended`
  (response, thêm `assignment_failed`) — status hệ thống do saga compensation
  ghi, PATCH **cấm** nhận. Tách 2 type là chủ đích, đừng gộp.
- Auth + envelope do fe-shared `ApiClient` (read-only) lo — remote chỉ định
  `baseUrl` + `tokenStorage`, không tự fetch trần.

Đổi shape response = sửa spec → codegen/snapshot BE → **sửa mirror FE trong
cùng PR** → chạy contract test 2 đầu.

## 4. Quy trình đổi API (4 bước, không đổi thứ tự)

1. **Sửa contract** `contracts/openapi/<spec>.yaml` (+ envelope code mới nếu có
   → cập nhật catalog conventions/04 cùng lúc).
2. **Codegen / sync snapshot**: node-svc `pnpm --filter node-svc generate:types`;
   go-svc copy contract vào `internal/api/openapi/` bit-identical; spring-svc
   copy vào `src/main/resources/openapi/` rồi build (generate-sources codegen).
3. **Sync FE**: mirror types trong remote (`api.ts`) + kiểm `decodeErrorEnvelope`
   còn hiểu mọi error code mới.
4. **Test 2 đầu**: BE unit/contract test + FE vitest; thêm golden fixture nếu
   payload đổi (xem [[be-messaging-kafka]] cho event payload — cùng nguyên tắc).

Sửa spec mà quên bước 2/3 → drift-guard đỏ (snapshot lệch) hoặc FE chết lúc
runtime (type mirror cũ) — cả hai đều là lỗi review bắt được, đừng để CI bắt.

## Nguồn (đọc từ code thật)

- `contracts/openapi/{tasks,activity,users,auth,dotnet}.yaml` — spec nguồn sự thật
- `services/node-svc/package.json` — script `generate:types` (openapi-typescript)
- `services/node-svc/src/app.ts` — `setErrorHandler`/`setNotFoundHandler` map envelope
- `services/go-svc/README.md` — "Snapshot nhúng internal/api/openapi/activity.yaml
  phải bit-identical… CI job drift-guard" + endpoint `/api/activity/openapi.yaml`
- `services/spring-svc/pom.xml:103-116` — openapi-generator-maven-plugin 7.12.0,
  inputSpec = snapshot users.yaml, phase generate-sources
- `platform/conventions/04-error-envelope.md` — shape + code catalog + 3 quy tắc
- `app/shared/src/error-envelope.ts` — `ErrorEnvelope`/`ApiError`/`decodeErrorEnvelope`
- `app/remotes/tasks/src/api.ts` — mirror Task/TaskStatus/TaskStatusExtended + fe-shared ApiClient
- `app/remotes/tasks/src/TasksPage.tsx` — UI switch theo `ApiError.code`
- `contracts/db/tasks-schema.sql` + `services/node-svc/README.md` — canonical DDL, schema-diff test
