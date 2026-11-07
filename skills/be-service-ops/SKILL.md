---
name: be-service-ops
description: >-
  Vận hành service trong boilerplate microservices: Dockerfile multi-stage chuẩn
  (node alpine · spring temurin · go distroless), standalone lockfile khi build
  context là thư mục con, healthcheck /healthz + /readyz (naked + mirror dưới
  prefix /api/<svc>), bảng port cố định theo platform/conventions/05, env 100%
  qua env-var fail-fast, migration chạy lúc boot. Use khi viết/sửa Dockerfile,
  thêm service mới, đổi port, debug compose healthcheck đỏ, setup môi trường
  native (đường B), hoặc review cấu hình service: "Dockerfile", "healthcheck",
  "readyz đỏ", "port", "env thiếu", "chạy native không docker". Nguồn thật:
  services/*/Dockerfile + platform/conventions + docs/walkthrough.md của
  architecture-overview (trích dẫn cuối file).
---

# BE Service Ops — Dockerfile · healthcheck · ports · env

## 1. Dockerfile multi-stage (conventions/01)

Mọi service 2+ stage: `deps` (cài dependency, cache được) → `build` → `runtime`
(copy artifact + prod deps, image mỏng). Không chạy build tool trong runtime.

**Node (Fastify+TS — node-svc, auth-svc)** — `node:22-alpine`:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
# build stage: pnpm exec tsc (CI checkout không có dist/ — build trong image)
# runtime: COPY node_modules + dist + drizzle + package.json, USER node
```

- Migration folder `drizzle/` phải vào image — migration chạy lúc boot
  (`server.ts`), folder nằm cạnh `dist/../drizzle`.
- `@node-rs/argon2` (auth-svc) = napi prebuilt kể cả linux-x64-musl — không cần
  python/make/g++ trong image. Ctools native-gyp thì cần.

**Spring Boot 3 (spring-svc)** — `eclipse-temurin:21-jdk-alpine` deps →
`./mvnw -B dependency:go-offline` (layer cache riêng) → `package -DskipTests` →
runtime JRE-only `21-jre-alpine`, jar fat, `USER 1001`.

**Go (go-svc)** — `golang:1.24-alpine`, `CGO_ENABLED=0 go build -ldflags="-s -w"`
→ static binary trên `gcr.io/distroless/static-debian12:nonroot`. Lệch có chủ
đích: `go mod tidy` in-image trước build vì dev machine không có Go toolchain
(không sinh được `go.sum`).

Quy tắc cứng: pin base image theo minor tag (không `:latest`) · non-root ·
`EXPOSE` = port theo bảng · healthcheck KHÔNG khai trong Dockerfile (chỉ trong
`platform/docker-compose.yml` — một nguồn duy nhất) · COPY lockfile trước source
(tối ưu cache) · CI boot-smoke build đúng Dockerfile này — build local pass mà
CI fail thì check `.dockerignore` trước.

### Standalone lockfile — bẫy workspace member

Build context = thư mục service (`services/node-svc`) → root `pnpm-lock.yaml`
ngoài context. Hai cách chuẩn, đừng trộn:

- **Local standalone lockfile** (precedent node-svc, auth-svc): commit
  `pnpm-lock.yaml` trong thư mục service, sinh bằng `pnpm install --ignore-workspace`;
  dev cài local cũng vậy: `cd services/node-svc && pnpm install --frozen-lockfile --ignore-workspace`.
- **Repo-root build context** (precedent shell/remotes): `context: ..` +
  `dockerfile: app/<app>/Dockerfile` để root lockfile + `app/shared` vào context.

COPY root lockfile trong context thư mục con = build fail ngay deps stage.

## 2. Healthcheck: `/healthz` + `/readyz` (conventions/02)

| Endpoint | Ý nghĩa | Ổn | Chưa ổn |
|----------|---------|-----|---------|
| `/healthz` | liveness — process sống | `200 {"status":"ok"}` | process chết → không response |
| `/readyz` | readiness — nhận traffic được | `200 {"status":"ok"}` | `503` error envelope `DEPENDENCY_DOWN` |

- Body sẵn sàng đúng chữ: `{"status":"ok"}` — KHÔNG thêm trường (CI boot-smoke
  grep đúng shape này).
- `/readyz` phải kiểm tra **thật** (query DB thật), không hardcode 200.
  Điều kiện ready theo service: node-svc = migration xong + DB ping (spring chỉ
  ping lúc boot, warn-only); spring = Flyway xong + DataSource healthy; go-svc =
  migration schema `activity` + SELECT thử schema `tasks` readonly; auth-svc =
  migration + seed xong; dotnet = migration + `to_regclass` table thật.
- **Mirror rule**: expose cả naked path (compose healthcheck + boot-smoke) VÀ
  mirror dưới prefix `/api/<svc>/healthz` + `/readyz` (OpenAPI `servers.url` +
  schemathesis). Service mới không có mirror = contract test fail 404.
  Cả hai không-auth (service không verify JWT trên 2 path này).
- Compose `healthcheck` probe `/readyz` (health-gated chain). Ngoại lệ có chủ
  đích: **go-svc không có healthcheck trong compose** (distroless không shell/
  wget — readiness chứng minh bằng e2e poll `/api/activity/stats`); gateway
  nginx cũng không (proxy thuần, không route `/readyz` — probe sẽ 404).

## 3. Ports cố định (conventions/05)

| Service | Port | | Service | Port |
|---|---|---|---|---|
| nginx gateway | **8080** (cổng duy nhất FE chạm) | | spring-svc | 8081 |
| shell (MF host) | 3000 | | go-svc | 8082 |
| remote tasks | 4001 | | dotnet-svc | 8083 |
| remote activity | 4002 | | auth-svc | 8090 |
| node-svc | 3001 | | postgres | 5432 |

- Service **listen** theo env riêng (`PORT` / `SERVER_PORT` / `DOTNET_SVC_PORT`),
  default = bảng. `*_PORT` env chỉ đổi port **host-side**; port trong mạng
  compose cố định theo bảng.
- Inter-service call **đi qua tên compose** (`http://node-svc:3001`) — trong mạng
  docker `localhost` = container mình. Native mode (đường B): gọi thẳng
  `http://localhost:<port>`.
- Đổi port = sửa **4 chỗ trong cùng commit**: conventions/05 + `.env.example` +
  compose + README.

## 4. Env 100% env-var (conventions/06)

- Không config file, không hardcode secret. `platform/.env.example` là inventory
  ĐẦY ĐỦ — thêm env var mới = thêm vào đó **cùng commit**, comment 1 dòng.
- Tên `SCREAMING_SNAKE_CASE`, prefix theo service (`NODE_SVC_*`, `GO_SVC_*`…);
  shared: `JWT_SECRET`, `LOG_LEVEL`, `POSTGRES_*`, `CORS_DEV_ORIGIN`.
- Service **fail-fast** khi thiếu env bắt buộc lúc boot — không fallback im lặng
  cho secret (pattern: gom tên biến thiếu vào 1 lỗi, `env.ts` của node-svc).
  `LOG_LEVEL` sai giá trị cũng fail-fast.
- Cả `DATABASE_URL` và per-service DB role password (`*_DB_PASSWORD`) đều có
  trong `.env.example` — roles + schemas tạo bởi `platform/postgres/init/01-init.sh`
  ở boot đầu tiên (volume mới — volume cũ thiếu role/schema mới).
- `CORS_DEV_ORIGIN` rỗng (compose/prod) = deny-by-default, không emit ACAO.

### Đường B — native, không Docker (docs/walkthrough.md)

Postgres 16 riêng (docker chỉ postgres hoặc initdb tay theo `01-init.sh`) → mỗi
service 1 terminal, env từ `.env.example` dạng placeholder:

```bash
cd services/auth-svc && JWT_SECRET=<dev-secret> PORT=8090 \
  DATABASE_URL="postgres://auth_svc:<pw>@localhost:5432/boilerplate" \
  USERS_FIXTURE_PATH=$(pwd)/../../contracts/auth/users.json \
  AUTH_DEV_PASSWORD=demo-password pnpm dev
cd services/spring-svc && SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/boilerplate" \
  SPRING_DATASOURCE_USERNAME=spring_svc SPRING_DATASOURCE_PASSWORD=<pw> \
  JWT_SECRET=<dev-secret> SERVER_PORT=8081 USERS_FIXTURE_PATH=$(pwd)/../../contracts/auth/users.json ./mvnw spring-boot:run
cd services/node-svc && JWT_SECRET=<dev-secret> PORT=3001 \
  DATABASE_URL="postgres://node_svc:<pw>@localhost:5432/boilerplate" \
  SPRING_SVC_URL=http://localhost:8081 GO_SVC_URL=http://localhost:8082 pnpm dev
cd services/go-svc && JWT_SECRET=<dev-secret> PORT=8082 \
  DATABASE_URL="postgres://go_svc:<pw>@localhost:5432/boilerplate" \
  DATABASE_READONLY_URL="postgres://<owner>:<pw>@localhost:5432/boilerplate" \
  SPRING_SVC_URL=http://localhost:8081 go run ./cmd/server
```

Đường B không có Kafka → e2e `SMOKE_SAGA=0` (happy + auth-real, bỏ saga + DLQ);
không gateway thật — chứng minh chuỗi bằng gọi service trực tiếp.

## 5. Service mới — checklist ops

1. Chọn port chưa chiếm → thêm bảng conventions/05.
2. Dockerfile theo pattern stack + `.dockerignore` chặn node_modules/target.
3. Lockfile: standalone hoặc root-context — không trộn.
4. `/healthz` + `/readyz` naked + mirror; readyz kiểm deps thật.
5. Compose: healthcheck probe `/readyz`, env từ `.env.example` (+ thêm biến mới).
6. Migration chạy lúc boot (hoặc Flyway/entrypoint riêng) — readyz là bằng chứng.
7. CI boot-smoke: up → curl `/healthz` → curl `/readyz` → cả hai 200.

## Nguồn (đọc từ code thật)

- `platform/conventions/01-dockerfile-pattern.md` — template 3 stack + 7 quy tắc + lockfile variant
- `platform/conventions/02-healthcheck.md` — bảng ready per service + mirror rule + 2 ngoại lệ compose
- `platform/conventions/05-ports.md` — bảng port + env tương ứng + 4 quy tắc
- `platform/conventions/06-configuration.md` — env-var-only + .env.example inventory + fail-fast
- `services/node-svc/Dockerfile` — multi-stage node thật (drizzle vào image, USER node)
- `services/auth-svc/Dockerfile` — napi argon2 prebuilt, users.json mount runtime
- `services/spring-svc/Dockerfile` — mvnw go-offline layer cache, JRE runtime USER 1001
- `services/go-svc/Dockerfile` — distroless nonroot, go.sum in-image
- `services/node-svc/src/server.ts` — boot: migration → spring ping warn-only → lazy Kafka → listen
- `services/node-svc/src/env.ts` — loadEnv fail-fast gom biến thiếu
- `services/node-svc/src/routes/health.ts` — healthBody/notReady shape chính xác
- `platform/.env.example` — inventory env đầy đủ + comment per biến
- `docs/walkthrough.md` — đường B native per service (lệnh thật), caveat volume cũ
- `platform/docker-compose.yml` — health-gated chain + 2 ngoại lệ healthcheck
