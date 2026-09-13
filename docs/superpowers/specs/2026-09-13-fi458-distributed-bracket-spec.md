# Spec — FI-458: Bracket phân tán đa máy trong mạng local (distributed bracket execution)

Rev 1 (2026-09-13). Spec slice nguồn: brief user 2026-09-13 + khảo sát orca CLI
(host list / worktree create --host / environment add) + audit bins 2026-09-13.

## IDEA-BRIEF (8 chiều)
- **Task**: 1 story bracket chạy phân tán trên N máy local — claim SF qua Linear
  (chống race), launch agent local từng worker, merge SF về dest qua git remote.
- **Output**: kit bins (`story-launch --claim/--machine-id/--host`,
  `story-verify` remote-safe B4) + config `distributed{}` + panel ⚙ Machines +
  race harness.
- **Users**: maintainer + agents chạy story workflow trên nhiều máy cùng LAN.
- **Constraints**:
  - `distributed.enabled=false` → **zero-diff** hành vi hiện tại
  - Linear unreachable → distributed **fail-closed** (không launch), single-machine
    fail-open (giữ nguyên)
  - Bracket parser STRICT — không thêm field (phase/máy ghi trong `What` text)
  - Không đụng release flow / Phased-release rule (đã ship #65)
  - Không trộn SSH model + peer model trên cùng 1 máy
    (docs/reference/ssh-execution-boundary.md — pick one per machine)
- **Input**: orca CLI (`host list`, `worktree create --host`, `linear`), bins hiện có,
  Linear workspace My-app-hoivu (team key FI).
- **Context**: kit 2.11.0 + 5 gates đã ship (#62-#65); 3 gap đã audit (claim race /
  --host passthrough / B4 dest remote).
- **Success criteria**: 2 machine-id mô phỏng chạy 2 SF độc lập từ 1 bracket —
  không trùng SF, không orphan worktree; claim stale > TTL được takeover;
  enabled=false zero-diff; panel hiển thị claims đúng.
- **Out-of-scope**: SSH exec-host integration, release flow, relay/public (non-LAN),
  bracket parser change, port upstream-mobile delta.

## Kiến trúc: "1 bracket — N máy — Linear là chân truth"

Linear = chia việc + claim registry. Bracket + context packs trong git (mọi máy
pull). Mỗi máy chạy `story-launch` cho SF được claim (worktree local-by-design).
SF merge về dest qua git remote. Tier bracket tránh conflict merge. Phased-release
rule thực hiện ở máy coordinator (đã có trong skill — không đổi).

Decision cần xác nhận khi distributed lần đầu bật:
- **Claim storage**: comment `🤖 claimed by <machine-id> <iso-ts>` trên Linear SF
  issue + assignee = machine-id nếu nhận được; fallback label `claimed/<machine-id>`
  (một trong hai, ưu tiên comment vì đọc được timestamp + không cần label quyền).
- **Heartbeat**: story-launch ghi claim lúc nhận; TTL mặc định 10 phút. Takeover
  chỉ khi TTL stale **và** SF worktree/branch trên máy cũ không có commit mới trong
  TTL (commits-fresh override — chống kill giả khi agent đang chạy chậm).

## Touch map (đọc từ code thật 2026-09-13)

- `story-team-kit/bin/story-launch` (136d) — thêm flag `--claim/--machine-id/--host`
  + claim check trước fork + heartbeat timer
- `story-team-kit/bin/story-verify` — B4: `git fetch <remote> dest` trước
  merge-base check (giữ local fallback)
- `story-team-kit/bin/story-resume` — dest fetch trước B4-adjacent checks
- `story-team-kit/bin/story-watchdog` — `--launch-next` gọi story-launch: passthrough
  claim flags + `RELEASE_GATE` (đã có) + heartbeat pass
- `local.superpowers-launcher/main.mjs` — worker op `distributed-config` (get/set,
  merge-set, fail-open — pattern verify-config) + op `claims-table` (đọc Linear
  claims qua story-launch `--list-claims`)
- `local.superpowers-launcher/panel.html` — ⚙ Machines section (toggle + machine-id
  + host picker từ `orca host list` + claims bảng + stale highlight)

## SF split (draft — chốt sau 2 critic)

- **SF-1 (T0) Claim core + distributed config** — story-launch flags + config
  distributed{enabled,machineId,claimTtlMinutes} + claim read/write/takeover
  + heartbeat + race harness (2 process song song cùng claim 1 SF → 1 thắng 1 skip)
- **SF-2 (T1) Remote-safe verify + --host** — story-verify B4 git fetch + --host
  passthrough + story-resume dest fetch. Depends: SF-1 (config).
- **SF-3 (T1) Panel ⚙ Machines + worker ops** — distributed config UI + claims
  bảng + launch targeting. Depends: SF-1 (config contract).
- **SF-4 (T2) Convergence QA** — 2-machine simulation harness end-to-end (2 clone
  + 2 machine-id, race + takeover + remote-merge scenarios) + README distributed
  section. Depends: SF-1..3.

Anti-duplicate check: claim write (SF-1) vs claims read bảng (SF-3) — khác tầng
(bin vs panel worker op), không trùng code. Heartbeat nằm SF-1 (owner claim).
Không có pattern lặp ≥2 SF.

Phased-release: story này ≥2 tiers → theo rule; mỗi SF merge = 1 unit — release
checkpoint chung ở SF-4 (kit 2.12.0 cut một lần, distribution là tính năng nguyên).

## ACCEPTANCE (user-visible — chi tiết đầy đủ trong context packs)

1. 2 machine-id chạy song song `story-launch --claim` trên 1 bracket 2 SF độc lập
   → mỗi máy đúng 1 SF, không trùng, không orphan worktree
2. Kill agent giữa chừng → claim stale ≥ 2×TTL liên tiếp (N=2, chốt sau critic) → máy khác takeover được
3. `distributed.enabled=false` → zero-diff toàn bộ hành vi
4. Linear offline → distributed không launch (fail-closed); single-machine vẫn chạy
5. Panel ⚙ Machines: toggle/machine-id/claims bảng đúng, stale highlight
6. story-verify B4 thấy dest đã push từ máy khác (fetch remote)

## Boundary (KHÔNG làm)
SSH exec-host integration · release flow · bracket parser · relay/public ·
port upstream-mobile delta · multi-LAN (chỉ mạng local)

## P0 Integration (phase0-impact-analyst 2026-09-13 — các điều chỉnh bắt buộc)

1. **Git-guard là P0**: push nhánh `story/<sf-slug>` lên remote NGAY lúc launch —
   nhánh tồn tại trên remote = serialization point atomic mà claim Linear (không
   atomic, chung 1 key) không đảm bảo. Claim Linear = mutex hiển thị (không auth —
   mọi máy chung key), git guard = phao cứu sinh khi claim bị phá/mixed-version.
2. **Claim storage chốt trong SF-1**: label `claimed/<machine-id>` (mutex LWW, đọc
   rẻ qua batch query sẵn có) + 1 claim comment (timestamp, renew bằng commentUpdate).
   Verify trước khi chốt: mutation Linear là last-write-wins (test 2 client đồng thời).
3. **Heartbeat = renew CHỦ ĐỘNG** từ máy giữ claim (watchdog pass renew);
   commits-fresh chỉ là tín hiệu phụ chống takeover oan — KHÔNG là nguồn truth.
   Takeover chỉ sau N×TTL liên tiếp + ghi comment revoke (máy cũ đọc lại thấy).
4. **Fail-open → fail-closed ĐẢO NGỮ NGHĨA**: state-check (Done filter) giữ fail-open;
   claim-check fail-closed CHỈ khi distributed.enabled — bắt buộc zero-diff test
   chứng minh single-machine không đổi verdict nào.
5. **B4 fetch gated sau `distributed.enabled`** — single-machine B4 giữ nguyên
   (fetch khi remote chậm = regression cron launch-next).
6. **`--host` passthrough = dead code trong Direction C** (peer model mỗi máy launch
   local) → tách khỏi SF-2, chuyển follow-up nếu sau này cần coordinator-driven.
7. **Version skew**: máy cũ kit cũ không biết claim → launch bất chấp → guard git
   (mục 1) là phao duy nhất. Bump kit.json version + sync-kit + marker check =
   tasks tường minh SF-1. Mixed-version test thuộc SF-4.
8. **MachineId sanitize** `^[a-z0-9-]+$` trước khi nội suy GraphQL (input đầu tiên
   vào chuỗi query build bằng interpolation).
9. **Clock skew**: TTL dùng timestamp trả về từ Linear (server-side), không phải
   `date` local.
10. **STORY-COMPLETE verdict hiện tính từ local rows** — không máy nào có đủ ảnh;
    convergence SF-4 derive từ Linear.
11. Panel Machines = **read-only derive từ Linear+git** (story.ops storage là
    per-machine — không thấy máy khác). Không hứa live progress chéo máy.
12. Unverified cần verify khi implement: atomicity Linear mutation (2 client đồng
    thời) · `orca environment add` tên chính xác · Linear rate-limit budget heartbeat.

## SF split điều chỉnh sau P0
- **SF-1 (T0)**: + git-guard push SF branch, + fail-closed inversion + zero-diff
  test, + claim storage chốt (label + comment renew), + machineId sanitize,
  + version-bump/sync/marker tasks
- **SF-2 (T1)**: chỉ B4 fetch-remote (gated sau enabled). `--host` → follow-up
- **SF-3 (T1)**: Machines UI read-only derive Linear+git (không hứa live chéo máy)
- **SF-4 (T2)**: nâng cấp thành claim-protocol infra bắt buộc (mixed-version test,
  takeover N×TTL, git-guard worst-case) — không phải QA once

## Plan-critic integration (2026-09-13 — FIX-P0-FIRST applied)

1. **2-tầng repo touch map**: SF-1/SF-2 repo nguồn = story-team-kit; SF-3 = local.superpowers-launcher; **regen vendored orca TẬP TRUNG ở SF-4** (T1 chỉ commit repo nguồn — tránh conflict bundled-plugins.json giữa SF-2 ∥ SF-3)
2. **Pre-flight SF-1**: launcher repo đang dirty (main.mjs/README + untracked tests của FI-382 follow-up) → clean/land + xác định branch trước SF-3; **PR #47 (gh45) merge/rebase trước T1** (đụng cùng vendored + hash)
3. **Takeover implementation** = task tường minh SF-1 (detect stale + N×TTL + revoke comment) — không để SF-4 test behavior chưa tồn tại
4. **`--list-claims`** nằm trong exit criteria SF-1 (interface contract cho SF-3)
5. **git-guard scope**: áp tầng vendored orca; repo kit remote fail = known gap → mixed-version test SF-4 phủ
6. **Version convention**: SF-1 bump kit 2.12.0 MỘT lần; SF-4 chỉ verify marker + cut
7. **Unverified items có task nhận**: `orca environment add` naming → SF-3; Linear rate-limit budget heartbeat → exit criteria heartbeat SF-1 (server-ts)
8. **Context packs**: clock-skew (server-ts) + repo-map ghi trong packs SF-1

## Spec-critic integration (2026-09-13 — SỬA-P0-TRƯỚC applied)

### P0
1. **Bracket/contexts đang bị gitignore** (`docs/**` — chỉ 13 file docs được track thủ công) → tiền đề "mọi máy pull bracket" SAI, distributed chết âm thầm ở SF-1. Fix SF-1: gitignore negation `!docs/superpowers/brackets/**` + `!docs/superpowers/contexts/**` (hoặc force-add mỗi story) + zero-diff note + ghi rõ hệ quả visibility (planning docs lên remote = nhóm thấy).
2. **Dest branch contract** (SF-1): remote đích = **wakii-dev** (wakii-dev/wakii — integration remote); ai push dest ban đầu (coordinator lúc APPROVE); merge SF xong → push dest; story-launch **fetch dest trước worktree create** (gated sau enabled); dest push-race (2 máy merge song song) → pull --rebase + merge lại, HOẶC tuần tự hóa qua claim tier.
3. **Release checkpoint ĐÚNG rule**: Phase 1 (SF-1..3) COMPLETE → **cut kit 2.12.0 + release checkpoint TRƯỚC khi launch SF-4** (hết big-bang); version ownership: SF-1 bump 2.12.0 một lần, SF-4 chỉ verify marker + cắt bản theo checkpoint.

### P1 (trước Phase 4)
- **N chốt = 2**: takeover chỉ sau **2×TTL liên tiếp** (sửa ACCEPTANCE #2: "> TTL" → "≥ 2×TTL liên tiếp")
- **Renew IFF phiên agent còn sống**: watchdog check phiên (terminal state + commits) trước renew — renew mù = claim không bao giờ stale, AC2 chết. Renew fail (Linear chập chờn) → log + chạy tiếp (fail-open renew); claim-ACQUIRE mới là fail-closed
- **Git-guard normative order**: claim → push guard nhánh SF (tên theo quy ước thật `sf-<N>-<slug>`) → fork worktree. Thua push-race (non-FF refused) → dọn worktree/agent vừa fork + skip
- **`--list-claims` = task SF-1** (trả JSON claims), SF-3 chỉ tiêu thụ
- **Touch map**: "mẫu verify-config" không tồn tại → mô hình mới, gần nhất là `bracket-save`; host picker DROP (Direction C peer-model không cần) — đồng bộ bracket SF-3
- **Mixed-version phát hiện MUỘN** (máy cũ không push-guard lúc launch → va chạm lúc STORY-COMPLETE sau hàng giờ): chấp nhận (LAN + 1 maintainer) + thêm check nhẹ lúc STORY-COMPLETE (PR diff có ≥2 head cùng SF → alert)

### P2 (ghi audit)
- Định nghĩa "orphan worktree" cho harness assert · TTL đọc từ MỘT nguồn (không per-machine) · label race + partial-claim (label added chưa comment) vào `linear-mutation-atomicity-verify` · zero-diff snapshot chính xác bất đối xứng hiện có (own-state fail-open vs dep-state chặn khi rỗng) · fail-closed phân loại lỗi (thiếu key ≠ mạng chết) cho panel · SF-4 harness cách ly Linear thật (bracket riêng + machine-id prefix `sim-`) · zero-diff liệt kê 5 mặt (launch/B4/resume/watchdog passthrough/panel Machines collapsed (toggle + CTA visible, claims polling + targeting OFF)) · README prereqs per-machine (orca app + workspace + linear-key + push quyền wakii-dev + kit sync — thiếu Orca = mất launch)

## Mode matrix (plugin hỗ trợ CẢ HAI — 1 build, chuyển runtime)

| | OFF (1 máy — mặc định) | ON (đa máy) |
|---|---|---|
| Section ⚙ Machines | Hiển thị collapsed + CTA bật | Đầy đủ: machine-id + claims bảng + targeting |
| Claims polling | OFF (không gọi Linear) | ON (poll chu kỳ có sẵn) |
| Launch | local, không claim | claim → git-guard → fork (local hoặc --host) |
| story-verify B4 | local (zero-diff) | fetch remote trước check |
| Zero-diff | — | OFF là baseline; ON chỉ THÊM lớp, không đổi hành vi cũ |
Cùng 1 build plugin + kit — chuyển bằng `distributed.enabled` trong story-kit.json (panel ⚙ Machines Lưu).
