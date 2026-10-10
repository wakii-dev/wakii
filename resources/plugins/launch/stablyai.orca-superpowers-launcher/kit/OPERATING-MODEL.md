# OPERATING MODEL — hệ thống story tự trị (04/10)

> Nguyên tắc gốc: người nói "làm story X" → hệ thống tự chạy tới
> **PR + MERGEABLE + sf worktrees sạch**; người chỉ chạm 2 cửa: duyệt lúc đầu,
> merge PR lúc cuối. Mọi failure_mode đều biến thành fence trong tool —
> không tin kỷ luật con người.

## Actors

```
NGƯỜI ── duyệt story ──────────────────────── review + merge PR ──┐
  │                                                              │
  ▼                                                              ▼
COORDINATOR (1/story, sống trong story-hub worktree)          PR MERGED
  ├─ launch SF qua story-launch (--local nếu không Linear)
  ├─ merge SF-branch về dest + story-verify + CLEANUP-ON-MERGE
  ├─ tick mindmap + Linear (qua linear-rate-limit run)
  └─ convergence: final verify → push → PR → MERGEABLE
  ▲                           ▲
  │ kick khi đến hạn          │ verify/tick (không dispatch khi gate đóng)
WATCHDOG (cron 30')          DRIVER (workfront-driver --loop, 3h/pass)
```

## Vòng đời 7 bước

1. **CREATE** — bracket/mindmap `.wakii` + context packs → `wakii-validate` OK → *cửa người 1: approve*
2. **APPROVE** — story worktree (dest `story/{feature}`) + coordinator + orchestration DAG
3. **LAUNCH SF** — `story-launch` (`--local` nếu không Linear): probe lineage cha
   (`branch:$DEST`) → create worktree → hai bước spawn `claude --permission-mode
   acceptEdits` (cấm `--agent claude` — template bypass) → wait → send prompt
4. **SF EXECUTE** — worker: TDD + commit atomic + browser verify (Rule 0) + rolling
   review; story-preflight chặn sai branch / agent-lạ / secret
5. **SF DONE** — story-verify sạch → coordinator merge `--no-ff` về dest →
   **CLEANUP-ON-MERGE ngay** → tick mindmap → Linear qua `linear-rate-limit run`
6. **CONVERGENCE** — final verify trên dest → push → `gh pr create --base
   <resolve-primary>` → **đòi `mergeable=MERGEABLE`** (CONFLICTING → tự merge primary
   + phân xử doctrine + rehash đúng cây + push, lặp)
7. *Cửa người 2: review + merge PR* → story-level cleanup (xoá story worktree +
   branch dest) → đóng sổ

## Fences — mỗi cái sinh từ một vết thương thật

| Fence | Ở đâu | Chặn gì |
|---|---|---|
| Ownership-probe mở rộng | story-launch | 2 worker cùng story (kể cả trên primary, ngoài orchestration) |
| Lineage probe `branch:$DEST` + `--live` sf-lineage | story-launch / story-doctor | worktree mồ côi |
| `WAKII_DRIVER_WT` + `--repo` root-only | workfront-driver | driver đẻ worktree sai vị trí |
| Hai bước spawn `acceptEdits` | story-launch | bypass permissions (template Orca) |
| `linear-rate-limit run` | mọi Linear mutation | 429 rơi qua sàng im lặng |
| preflight: agent-alive-primary + bypass-detected | story-preflight | worker tràn primary |
| STORY-COMPLETE = MERGEABLE | SKILL.md | PR treo conflict chờ người nhìn |
| Rehash-trước-add + gate không qua pipe | AGENTS.md / quy trình | commit stale / gate nuốt exit |
| Naming `story/{feature}`·`features/`·cấm `wakii-dev/` | SKILL.md | ref directory conflict remote |

## Division of labour driver ↔ coordinator

Driver **verify-first**: chỉ tin code đã merge trên dest, tick mindmap, không tự
dispatch khi gate `blocked_sf-N` đóng trong `state.json`. Gate **mở chỉ sau khi SF
ĐÃ MERGE** — launch SF là việc coordinator. Hai bên không bao giờ cùng đẻ worker.

## Giám sát 3 tầng

1. **Driver** (3h/pass) — verify/tick; BLOCKED ×3 → leo user
2. **Watchdog 30'** — sweep 6 class lỗi (lineage, marker drift, kit gates,
   bypass-pid, worker-trên-primary, dirty spike); kick coordinator bằng lệnh cụ thể;
   noop phải có bằng chứng git/gh
3. **`story-doctor --live`** — 10 checks; mọi thứ tự report, không đợi mắt người

## Branch naming

`story/{feature}` (story dest) · `story/{feature}-sf-N` (SF, dash — không nest) ·
`features/{slug}` (việc lẻ) · cấm prefix `wakii-dev/` trên remote wakii-dev/wakii ·
worktree name vẫn dash-form (orca fold `/`→`-`).

## Permission model (ruling (a) 04/10 — siết bypass; adversarial review 10/10)

- **Worker/coordinator do story-launch spawn = hai bước acceptEdits** — enforced
  trong story-launch (test L-suite). **Carve-out**: `workfront-driver run_worker`
  nhánh YOLO vẫn spawn `--dangerously-skip-permissions` theo toggle app (known
  debt — driver out-of-scope LOCAL-5, gộp khi writer xong).
- **Distribution allowlist**: merge `kit/permission-allowlist.json` vào
  `.claude/settings.local.json` ở **MAIN-CHECKOUT ROOT** — worktree session
  resolve settings.local.json về main root (docs ≥2.1.211) → tới được worker,
  untracked, không thành conflict-surface cho upstream-sync battery. KHÔNG dùng
  `.claude/settings.json` tracked (mới = mặt xung đột sync). Allowlist = chống
  stall, KHÔNG phải containment — containment = deny section + story-guard +
  2 cửa người.
- **Deny section** trong allowlist (deny thắng allow mọi scope, role-agnostic):
  force-push mọi pattern + push thẳng wakii-dev/main/master + `git add -f`
  (đường `add -f` + commit né story-guard-envfiles). Deny match as-written —
  `git -C . push` vượt pattern nhưng vẫn còn story-guard + review.
- **Worker push CHỈ nhánh sf riêng** (`git push -u origin <sf-branch>` — một
  phần của DONE theo template) — dest/protected cấm bằng deny list + review;
  ai merge = người.
- **Detection tại cửa**: story-preflight check 7/8 — agent sống trên primary +
  bypass (cả `--permission-mode bypassPermissions`) → WARN; watchdog deck
  bypass-pid baseline là quy trình session-level (không phải bin).

## Số vận hành

Ngưỡng (context budget, timeout 45m, attempts ×3, breaker, nhịp tick 3h/30') nằm ở
`docs/superpowers/economics-doctrine.md` (repo wakii). Platform parity:
`docs/superpowers/support-matrix.md`.
