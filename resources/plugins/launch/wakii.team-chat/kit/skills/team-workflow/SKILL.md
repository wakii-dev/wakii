---
name: team-workflow
description: Vận hành team agent Wakii theo mô hình Captain-centric — Captain (Zcode) là trung tâm, quyết định workflow cho từng worker. Use khi user nói "làm team", "hire worker", "dispatch task", "chạy team workflow", hỏi cách điều phối Captain/workers, hoặc khi bạn là Captain cần playbook điều phối.
---

# Team Workflow — Captain-centric (bản desktop Wakii)

> Nguồn gốc: TEAM-WORKFLOW v2.1 (diễn nghiệm VU-66/67 ở repo platform). Bản này
> adapt cho repo desktop. **Manual đầy đủ: đọc `references/TEAM-WORKFLOW.md`** —
> roster đặt tên, cheat sheet orchestration, 10 lessons, metrics. File này chỉ
> ghi phần khác biệt của repo desktop + cách bắt đầu.

## Hiến pháp làm việc — 5 luật CEO (§0.0 spec — TRÊN mọi quy trình)

1. **Đúng đắn trên hết** — đúng đắn thắng tốc độ mọi cuộc.
2. **Chưa rõ luồng/impact → sai Scout nghiên cứu trước** — brief có mục "Điều kiện hiểu rõ"; còn mục mù → Pathfinder task; task thực thi `After:` research (DAG chặn). Cấm làm mù.
3. **Vẫn chưa hiểu → hỏi CEO** — blocked "cần CEO" → gate chờ. Cấm tiến khi có câu hỏi treo.
4. **Cấm bịa / làm sai luồng — tội nặng nhất.** Plan phải dẫn nguồn (file:line, output lệnh); G3.5 + G9 soi bịa hai lớp độc lập. Áp CẢ Captain.
5. **DONE 3 phần**: ① Giải thích ② Báo cáo (output/diff) ③ Cách test. Thiếu = trả lại.

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

## G3.5 — Bước 0: worker phải được duyệt KẾ HOẠCH trước khi làm (§2.2)

Mọi worker hire qua `team-orch worker-start --require-plan-approval` → plan-gate OPEN
theo worktree path → worker post `[PLAN]` vào chat (kèm nguồn) → Captain duyệt →
`team-orch gate-resolve --plan` → guard mở. Worker chưa được duyệt: **Edit/Write/bash-ghi bị chặn** (guard). Quick tier: `--pre-approved-plan` trong brief.

## G1.5 — Cổng chọn hướng thiết kế (CEO nhìn bằng MẮT)

Feature đụng UI/UX hoặc ≥2 hướng giải → designer chạy mock-prototype → **3 hướng HTML** → `orca artifacts share` ×3 → Captain embed links vào chat → **CEO click link chọn** → design.approved + hướng pin đầu phòng. Luật: tối thiểu 3 hướng — 1 hướng không phải design. Phi-UI: ADR mini trong embed, Sentinel soi.

**Artisan pre-check**: trước khi CEO chọn, Artisan soi từng hướng on-system/off-system theo STYLEGUIDE — CEO chọn BIẾT GIÁ (đẹp mà off-system = đắt triển khai). Sau chọn: Artisan handoff-spec map token/primitive cho Weaver.

## Captain embeds — 4 loại tri thức vào phòng (chat = trí nhớ chung)

| Loại | Phát lúc | Ví dụ |
|---|---|---|
| `research` | sau Scout (Luật 2) | phát hiện + file:line + "còn mù → hỏi CEO" |
| `analysis` | sau G1 soi spec | impact, boundary, tier, rủi ro |
| `design` | sau G1.5 | 3 links artifacts + mô tả + cờ Artisan |
| `decision` | khi Captain phán | gate resolve, ép pivot, đổi hướng + lý do |

Worker vào phòng: **ĐỌC EMBEDS TRƯỚC TIÊN** — mọi khẳng định có sources.

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
