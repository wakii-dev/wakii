---
name: test-authoring
description: >-
  Quy trình viết acceptance test RED có chủ đích cho repo wakii — test tên
  theo HÀNH VI mong đợi, mock seam đúng chỗ, đỏ vì thiếu implementation (không
  phải vì infra sai), setup files import đúng hiện hành, test cho SF sau tách
  PENDING. Use khi: "viết test", "acceptance test", "test RED trước", TDD
  trong repo wakii, test FE component vitest, review test ai đó bàn giao.
---

# test-authoring — Acceptance test RED có chủ đích

Nguyên tắc: **test RED không có chủ đích = nhiễu, không phải TDD**. Một
acceptance test phải đỏ vì hành vi chưa được viết, và must TURN GREEN đúng khi
implementation đáp ứng hợp đồng — không hơn không kém. Bài học SF-1
GitLens-parity 07/11: test viết không bám infra hiện hành buộc worker code phải vá
mock/setup để GREEN — đo được qua metric "số test RED mà worker phải vá
mock/infra" (xem mason.md METRIC CHẤT LƯỢNG).

## 1. Tên test mô tả HÀNH VI, không mô tả implementation

- ✅ `blames the parent commit through previousHash when Blame previous is clicked`
- ❌ `calls onBlamePrevious with card.previousHash` (mô tả cơ chế, chết khi refactor)
- ✅ `offers no commit affordances on an uncommitted line`
- ❌ `renders null buttons` (không nói được hợp đồng gì)
- Tên test = câu đọc được như spec. Người review diff không cần mở body vẫn
  biết hợp đồng đang pin.

## 2. Mock seam pattern (vi.hoisted + vi.mock)

Mock dependency qua vi.mock ở top-level module scope, handle giữ reference qua
`vi.hoisted` để beforeEach reset được:

```ts
const { loadUserSshConfigMock } = vi.hoisted(() => ({ loadUserSshConfigMock: vi.fn() }))
vi.mock('../../ssh/config/ssh-config-parser', () => ({
  loadUserSshConfig: loadUserSshConfigMock
}))
// beforeEach: loadUserSshConfigMock.mockReset() — KHÔNG để mock rò state qua test
```

- **Mock ở seam public của dependency** (module import), không đục private.
- **Behavior qua callback prop** (component) thì KHÔNG mock module — truyền
  `vi.fn()` vào prop rồi assert `toHaveBeenCalledWith` (pattern
  git-blame-hover-card.test.tsx: `onOpenCommit`, `onBlamePrevious`).
- Filesystem thật cho persistence test: `mkdtempSync` + `rmSync` trong
  beforeEach/afterEach qua persistence-test-harness (`testState.dir`,
  `closeTestStores`) — KHÔNG mock fs trừ khi seam cho phép.
- Mẫu gốc BE: `services/node-svc/src/app.test.ts` (27 case, seam module-scope)
  — repo máy khác; trong repo wakii dùng mẫu
  `src/main/persistence/tracking-repos/persistence-update-repo.test.ts`.

## 3. Đỏ phải vì THIẾU IMPLEMENTATION — tự kiểm trước khi bàn giao

Chạy từng test trên baseline cũ (nhánh trước implementation) và phân loại
lỗi RED:

| Lỗi RED trên baseline | Ý nghĩa |
| --- | --- |
| `Cannot find module './git-blame-hover-card'` / missing export | ✅ ĐÚNG — implementation chưa tồn tại |
| AssertionError trên behavior | ✅ ĐÚNG — behavior chưa có |
| `Cannot find setup file`, matcher không tồn tại, `globals` undefined | ❌ SAI INFRA — sửa test, không bàn giao |
| Mock bị gọi thật / leak giữa test | ❌ SAI SEAM — sửa seam |

```sh
pnpm vitest run --config config/vitest.config.ts <path/test.test.ts>
```

- LUÔN chạy qua `--config config/vitest.config.ts` — bare vitest mất alias `@/`
  và fail giả (reproduces trên baseline sạch — verify baseline trước khi tin).
- Baseline không có → ít nhất chạy đúng test file mới đơn lẻ và đọc stack:
  lỗi đầu tiên phải nằm ở symbol đang thiếu, không phải ở infra.

## 4. Infra vitest hiện hành (repo wakii)

- **Config mặc định `environment: 'node'`** (config/vitest.config.ts:85) —
  KHÔNG giả định globals:true. Test DOM khai per-file:
  `// @vitest-environment happy-dom` (dòng 1 file, pattern git-blame-hover-card).
- **Setup files nạp qua `UNIT_SETUP_FILES`**
  (config/scripts/ci/unit-selection/dependency-graph/ci-unit-files.mjs:17):
  DOM compatibility + jest-dom matchers + Testing Library auto-cleanup chỉ
  kích hoạt khi `globalThis.document` tồn tại (vitest-dom-setup.ts guard).
  Suite chạy ngoài config này (script riêng, runner khác) PHẢI import
  explicitly:
  ```ts
  import '@testing-library/jest-dom/vitest'
  import { cleanup } from '@testing-library/react'
  afterEach(() => cleanup())
  ```
- **@testing-library/dom cài 10.4.x**: `getByRole(name:)` nhận
  string/RegExp/function — asymmetric matcher (`expect.stringMatching`)
  KHÔNG hỗ trợ → dùng RegExp literal (`/Blame previous/`).
- **`userEvent.setup()` đè `navigator.clipboard`** bằng stub của nó — mock
  clipboard SAU khi gọi setup (pattern git-blame-hover-card.test.tsx
  `copies the full sha…`: setup() trước, rồi
  `Object.defineProperty(navigator, 'clipboard', …)`).
- **Clock/`now`**: inject thời gian qua tham số (`{ now: NOW }`) thay vì
  `vi.useFakeTimers` khi model cho phép — deterministic, không flaky.

## 5. Tách scope: test cho SF sau đặt PENDING

Test pin hợp đồng của SF CHƯA thi công không được chặn suite hiện tại:

1. Đặt file test vào exclusion list `PENDING_GITLENS_PARITY_SF_TESTS`
   (config/scripts/ci/unit-selection/dependency-graph/ci-unit-files.mjs:30)
   kèm comment trỏ spec/mindmap của SF.
2. SF thi công → xóa khỏi list, test GREEN cùng implementation.
3. Test chấp nhận trong SF hiện tại (RED có chủ đích, nằm trong suite) thì
   giữ trong include — chúng phải GREEN khi SF đó xong.

Nhận diện nhanh: file test có header comment "intentionally RED until…" +
tên trong PENDING list = hợp đồng tương lai; ngoài list = hợp đồng hiện tại.

## 6. DONE nghĩa là

- [ ] Từng test RED-on-baseline đã phân loại (bảng mục 3) — không có RED vì infra
- [ ] Chạy qua `--config config/vitest.config.ts`, alias `@/` resolve
- [ ] Mock seam reset trong beforeEach, không rò state
- [ ] Test cho SF sau đã vào PENDING list + comment trỏ spec
- [ ] File LF, không trôn CRLF

## Nguồn trích dẫn

- `config/vitest.config.ts` — environment node mặc định (dòng 85), setupFiles (dòng 95)
- `config/scripts/test-runtime/dom/vitest-dom-setup.ts` — guard document + chain setup Testing Library
- `config/scripts/test-runtime/dom/vitest-testing-library-setup.ts` — jest-dom/vitest import + auto-cleanup
- `config/scripts/ci/unit-selection/dependency-graph/ci-unit-files.mjs:17,30` — UNIT_SETUP_FILES, PENDING_GITLENS_PARITY_SF_TESTS
- `src/renderer/src/components/editor/git-blame-hover-card.test.tsx` — case thật SF-1: test tên theo hành vi, callback-prop seam, clipboard sau setup(), per-file happy-dom
- `src/main/persistence/tracking-repos/persistence-update-repo.test.ts` — case thật SF-1: vi.hoisted + vi.mock seam, harness fs thật
