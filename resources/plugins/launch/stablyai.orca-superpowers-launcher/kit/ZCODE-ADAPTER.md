# ZCODE-ADAPTER — chạy kit từ ZCode (hoặc agent CLI ngoài Claude Code)

> Kit cài vào `~/.claude/` (bins/agents/skills/hooks — hình thái Claude Code).
> Từ ZCode và các CLI khác: **chạy được 100% bins ngay**; chỉ hooks/agents/skills
> wiring cần adapter. File này là bản đồ tương thích + adapter sẵn dùng.

## Tương thích thực tế

| Thành phần | Từ ZCode | Ghi chú |
|---|---|---|
| `bin/*` (59 bins) | ✅ chạy trực tiếp | `~/.claude/bin/story <từ>` (umbrella) hoặc bin từng cái |
| Skills kit (`~/.claude/skills`) | ⚠️ không auto-load | Dùng skill ZCode `story-kit` (bản bọc top-10 bins — cài ở `~/.agents/skills/story-kit/`) |
| Hooks (SessionStart/PostToolUse/Stop) | ❌ không wire | ZCode hooks config riêng — map thủ công 3 wrapper, bảng dưới |
| Agents (10) | ❌ không wire | Gọi tương đương qua bins (coordinator-pass, watchdog...) |
| Panel app | ✅ (trong app) | Không phụ thuộc CLI nào |

## Map hooks Claude → ZCode (khi cần wiring)

| Claude hook | Bin wrapper thật | Tương đương ZCode (khái niệm) |
|---|---|---|
| SessionStart | `hook-session-start` | Hook SessionStart → gọi cùng bin với cwd project |
| PostToolUse | `hook-post-tool-use` | Hook PostToolUse → gọi cùng bin (input JSON tool result) |
| Stop | `hook-stop` | Hook Stop → gọi cùng bin |

Cả 3 wrapper fail-open — thiếu/ZCode không wire thì chẳng vỡ gì, chỉ mất guard
(story-guard-dangerous/envfiles/secrets) trên phiên đó.

## Skill ZCode sẵn dùng

`~/.agents/skills/story-kit/SKILL.md` — bản dày dạn được duy trì thủ công
(nếu kit đổi bins lớn, cập nhật cùng nhịp). Nó dạy agent ZCode gọi:
`story status` · `story doctor --fix` · `story top` · preflight/checkpoint/
attempt/diff-review/close · `linear-rate-limit check`.

## Quy ước gọi bins từ agent ngoài

- Bins **bash** (`#!/bin/bash`) và **python3** trộn lẫn — gọi bằng đường dẫn
  trực tiếp (`exec` theo shebang), KHÔNG `python3 <bash-bin>`.
- Umbrella `story` tự exec đúng bin; ưu tiên dùng nó.
- Muốn PATH: `story doctor --fix` tự symlink vào `~/.local/bin` (kèm hướng dẫn
  nếu thư mục đó chưa nằm trong PATH).
