# story-watchdog --launch-next scoping

Introduced LOCAL-5 sf-2 (2026-10-10) — trước đó `--launch-next` scan mọi
`docs/superpowers/mindmaps/*.wakii` + `brackets/*.md` trong mọi repo root và
launch story stale trong repo đa-story (incident 04/10: FI-417/441/463/486/498 —
dest không tồn tại, attempt chết giữa chừng).

## Quy tắc scoping (fail-closed)

- **Đa-story** = repo có >1 story, đếm bằng UNION stems (mindmaps + brackets
  legacy) sau dedupe per-repo (mindmap `x.wakii` + bracket `x.md` = 1 story).
  `--launch-next` không `--story` trong repo đa-story → **SKIP toàn cục + warning
  liệt kê repos, exit 0, 0 launch**. Repo đơn-story giữ hành vi cũ.
- **`--story <slug>`**: match exact sau dash-normalization (`fi-458` ≡ `fi458`).
  Keys(stem) = norm(stem) + norm(prefix cắt tại mỗi `-`) — ví dụ
  `fi458-distributed-bracket` có keys {fi458distributedbracket, fi458,
  fi458distributed} nên `--story fi-458` khớp, còn `--story fi-45` thì không
  (không substring). 0-match → warn + exit 0; >1-match (vd fixtures
  `fi-458-*` + `fi458-*`) → warn mơ hồ + exit 0, KHÔNG pick hộ.
- **`--story` CHỈ scope launch_next** — `--auto-resume`, `--enforce-done`,
  `--with-index` vẫn chạy toàn cục.
- **Dest-absent** (launch path chung, cả khi không `--story`): local
  `git show-ref refs/heads/<dest>` → miss thì 1 lần `git ls-remote --heads
  origin` (cap 30s) → miss cả hai → SKIP + warning. Repo không-git cũng SKIP
  (không có dest để launch). Dest chỉ tồn tại trên remote không bị false-skip.

## Known limitation — worktree-ownership `sf-N-*` chéo story (cố tình hoãn)

Dòng "đã có worktree chưa?" trong launch_next glob theo **số SF thôi**:
`$HOME/orca/workspaces/<repo>/sf-$n-*` — không đối chiếu story. Story A cần
launch sf-4 sẽ bị che nếu story B đang có worktree `sf-4-*`, kể cả khi đã
`--story a`. Với story dùng slug số trùng tần suất thấp nên rủi ro chấp nhận
được; fix đúng là **lineage check** (token story trong tên worktree so với stem
của story — cùng bộ dash-normalization trên) và được hoãn có chủ đích sang phase
sau. Ghi ở đây để ai debug "sao SF không launch" có chỗ tra đầu tiên.
