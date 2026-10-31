---
name: team-workflow
description: Vận hành team agent Wakii theo mô hình Captain-centric — Captain (Zcode) là trung tâm, quyết định workflow cho từng worker. Use khi user nói "làm team", "hire worker", "dispatch task", "chạy team workflow", hỏi cách điều phối Captain/workers, hoặc khi bạn là Captain cần playbook điều phối.
---

# Team Workflow — Captain-centric (bản desktop Wakii)

> Nguồn gốc: TEAM-WORKFLOW v2.1 (diễn nghiệm VU-66/67 ở repo platform). Bản này
> adapt cho repo desktop. **Manual đầy đủ: đọc `references/TEAM-WORKFLOW.md`** —
> roster đặt tên, cheat sheet orchestration, 10 lessons, metrics. File này chỉ
> ghi phần khác biệt của repo desktop + cách bắt đầu.

## Mô hình 1 dòng

**Bạn (Zcode) = Captain — PM trung tâm.** Owner giao mục tiêu → bạn bóc task,
CHỌN workflow từng worker (bảng dưới), verify bằng cách TỰ CHẠY DoD (không tin
report), merge, audit. Worker là Claude agent trong worktree riêng qua
`orca orchestration worker-start`.

## Khác biệt so với bản platform

| Chỗ | Platform (v2.1 gốc) | Repo desktop này |
|---|---|---|
| DoD mặc định | `verify:quick` (lint+typecheck+test+spectral+gitleaks) | **`pnpm tc` + test của SF**; Tier-0 (build/release/plugin/kit) thêm `pnpm run build:desktop` + battery tương ứng trong AGENTS.md |
| Board | VU-xx | **Linear project `wakii-ade`** (team HOI) — bảng ràng buộc: `docs/superpowers/linear-projects.md` |
| Giao tiếp | terminal read + notification | **Team Chat**: `team-chat send/read` (bus `~/.claude/chat/team-chat.jsonl`, panel trong app). Workers báo DONE/BLOCKED VÀO chat; Captain đọc chat thay soi từng terminal |
| Kit bins | — | `story doctor --fix` khi nghi drift; `story status/top` làm màn hình orchestration |

## Bảng chọn workflow của Captain

| Task | Workflow | Ceremony |
|---|---|---|
| 1-2 file, ít rủi ro | Quick — brief + DoD 1 lệnh | checkpoint |
| Feature nhiều bước | Standard — brief DoD + budget 15' + DONE/BLOCKED | + diff-review |
| Đụng build/release/plugin/kit | Strict — Standard + battery làm DoD + gate native | + gate + Captain tự chạy battery |
| Research/khảo sát | Scout — Explore read-only | không worktree |

## Vòng lặp Captain (4 bước)

```
TẠO TICKET (wakii-ade) → worker-start → CHỜ: orca orchestration check --wait
→ VERIFY (tự chạy DoD + đọc chat) → gate-resolve → merge → dọn worktree → audit Linear
```

Lệnh orchestration chuẩn: xem `references/TEAM-WORKFLOW.md` mục 4. Ba luật không
phạm: **(1)** worker không commit — Captain commit; **(2)** nhiều worker không
chung file — queue tuần tự; **(3)** Anti-idle: Captain không kết thúc turn khi
còn task không cần user-input.

## Team Chat (kênh liên lạc chính)

```bash
team-chat send "DONE sf-x — pnpm tc 0 lỗi" --from smith --role worker
team-chat read --last 20          # 20 tin mới nhất
team-chat tail -f                 # theo dõi live
```
Panel trong app (Wakii Team Chat) hiển thị cùng bus — Owner nhắn thẳng vào đó.
Format tin: `{at, from, role: captain|worker|owner|system, channel, text}`.
