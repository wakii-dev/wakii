# Wakii Team Chat — Architecture (FI-98 SF-D)

Plugin worker ESM, entry `main.mjs` (chỉ activate + wiring + tick poller).
Logic domain sống trong `lib/*.mjs` — bảng layer dưới là NGUỒN SỰ THẬT, được
`tests/architecture-import-guard.test.mjs` enforce (guard quét import tĩnh).

## Layer map

| Layer | Module | Domain | Import được phép |
|---|---|---|---|
| L0 | `lib/orca-cli-bin.mjs` | resolve binary orca + bash Git | (không deps nội bộ) |
| L0 | `lib/bus.mjs` | chat bus JSONL (readTail/appendLine/chatDir) + homeDir | (không deps nội bộ) |
| L0 | `lib/story-prompts.mjs` | story launch prompt builders | directives.json |
| L1 | `lib/kit-bins.mjs` | kit guard/repeat-guard, catalog, kitHash, intact, capability, runKit | L0 |
| L2 | `lib/registry.mjs` | roster/.workers.json/rooms.json + caches (aliveCache/termsCache) | L0 |
| L2 | `lib/wake.mjs` | wakeRoomCaptain + wakeCaptainFor + wakingRooms | L0 |
| L2 | `lib/story-snapshot.mjs` | quét/đọc story snapshot (.wakii/brackets) + parseWakiiMeta | L0, directives.json |
| L2 | `lib/story-hooks.mjs` | hooks install/merge vào ~/.claude/settings.json | L1 |
| L2 | `lib/kit-manifest.mjs` | validate kit.json + notify kit-blocked | L1, story-prompts |
| L3 | `lib/supervisor.mjs` | captainSupervisor 3-layer + watchWorkers | L0, wake |
| L3 | `lib/router.mjs` | captainAck/forwardTo/captainRoute (deps-inject, không import nội bộ) | (deps từ main) |
| L3 | `lib/wakii-save.mjs` | saveWakiiStory fail-closed qua wakii-validate | L1, story-snapshot |
| L3 | `lib/kit-install.mjs` | installKit đồng bộ kit/ ra ~/.claude | L1, kit-manifest, story-hooks |
| L4 | `main.mjs` | activate + wiring + tick + re-exports tương thích | tất cả |

## Import rules (guard-enforced)

1. Module `lib/*.mjs` chỉ import module layer THẤP HƠN — cấm cùng layer, cấm ngược, cấm cycle.
2. Cấm mọi lib module import `../main.mjs`.
3. File `lib/*.mjs` mới PHẢI được thêm vào layer map ở guard test (file lạ → test đỏ).
4. State dùng chung (caches, in-flight sets) sở hữu đúng 1 module; module khác nhận qua deps/factory.

## Quy ước test

- `tests/*.test.mjs` — chạy qua `orca plugin test` (runner chỉ nhặt `*.test.*`).
- `tests/*-tests.mjs` — standalone script, chạy tay hoặc bằng run-all loop (exit code từng file).
- Guard 2 lớp: `tests/plugin-shadow-audit.test.mjs` (bug shadow `const X` đè function module-level, scope-aware) + `tests/architecture-import-guard.test.mjs` (layer map trên).
- Rehash: mọi thay đổi dưới `resources/plugins/launch/` phải update fingerprint `bundled-plugins.json`; thay đổi `kit/` thêm kitHash `kit/kit.json` — cùng commit (husky `kit-rehash-check`).

## Bug-class đã chấm dứt (bối cảnh)

- Shadow `const orcaBin` (2 lần lịch sử): local const đè function module-level → Layer-2 respawn nổ im. Guard: plugin-shadow-audit.
- Bare `orcaBin` truyền vào `execFileCb` (watchWorkers + heartbeat — fix FI-98 task 3): resolve binary qua `orcaBin()` tường minh, không truyền bare identifier.
