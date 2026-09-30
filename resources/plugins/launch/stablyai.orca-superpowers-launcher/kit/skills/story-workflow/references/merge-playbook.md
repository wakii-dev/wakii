# Merge Playbook — story-workflow (story-hub model)

Quy trình git merge cho story có `meta.worktreeModel: "story-hub"` trong
story .wakii (bracket legacy: dòng `Worktree model: story-hub`):
coordinator là SINGLE WRITER của nhánh đích — merge THẬT trong story worktree,
hết ref surgery. Story legacy (worktreeModel thiếu/`legacy`) → chơi theo
playbook cũ (update-ref + ancestor guards — xem `git log` file này).

> story-hub: nhánh đích thật = dash-form (`story-<epic-id>-<slug>` — orca
> sanitizeWorktreeName fold `/`→`-`); ví dụ dưới giữ slash-form cho legacy.

> Playbook này phủ **SF → nhánh đích** (local git). Hướng nhánh đích → primary
> (push + `gh pr create`, 1 PR/story) xem `references/pr-playbook.md`.

## Per-SF merge (coordinator, trong STORY WORKTREE)

Executor xong SF: commit + PUSH nhánh sf-N lên remote (executor KHÔNG BAO GIỜ
đụng nhánh đích). Coordinator merge thật:

```bash
cd <story-worktree>                        # checkout story/<epic>-<slug>
git fetch origin sf-<N>-<slug>             # nhánh executor: lấy state mới nhất đã push
git merge origin/sf-<N>-<slug> --no-edit   # merge THẬT ref remote vừa fetch — local
#    sf-<N>-<slug> có thể stale/không có (multi-machine spec §7: executor ở máy
#    khác, máy coordinator không có ref local) — KHÔNG merge local ref
#    conflict improvements-log → giữ CẢ HAI entries (protocol)
git push origin story/<epic>-<slug>        # dest tiến trên remote (multi-machine + verify B4)
```

Vì sao an toàn hơn update-ref: merge commit không thể kéo dest LÙI — cả class
lỗi "ghi đè mất 6 SF merges" (FI-191/FI-151) biến mất cùng protocol. Conflict
khi merge = rubric chia SF bị vi phạm lúc chia SF → flag vào improvements-log,
resolve thủ công, KHÔNG tự động theirs/ours.

Merge cuối xong → sub-issue comment hash merge (audit) → orchestration task
của SF `task-update --status completed` → DAG mở khóa tier sau.

## CI gate trước khi báo ready-to-merge (PR có checks)

PR của story (nhánh đích → primary) có CI checks thì **chỉ merge/báo
ready-to-merge khi checks pass** — cùng dữ liệu Checks panel, đọc bằng gh:

```bash
~/.claude/bin/story-pr-checks <pr-number>          # exit 0 pass (kể cả
                                                   # no-checks pass-through)
~/.claude/bin/story-pr-checks --branch story/<epic>-<slug> --wait 15
```

- exit 0 (`pass`) → merge/báo ready-to-merge bình thường.
- exit 1 (`fail`) → KHÔNG merge; comment check đỏ + annotations lên epic,
  rollback-fixer hoặc executor sửa rồi push lại (CI tự chạy lại).
- exit 2 (`pending`) → chờ (`--wait`) hoặc hẹn pass sau; KHÔNG merge treo.
- `no-checks` (project/fork không chạy CI — vd wakii fork chỉ release chain)
  → ĐƯỢC phép merge nhưng **ghi chú vào evidence**: không có lưới CI ≠ không
  cần nhìn diff.

Agent KHÔNG dùng panel Checks của app để quyết — panel là cho người xem;
agent đọc `story-pr-checks` (cùng nguồn, machine-readable, exit-code hợp đồng).

## Snapshot merge (giữ nguyên ý cũ, protocol mới)

Nhóm task lớn xong (vd T1-T4 của 5) → coordinator merge sf-branch sớm với
message `merge: SF-N <name> snapshot T1-T4 (<còn lại> in flight) into
story/<epic>-<slug>` — đỡ mất việc nếu agent dừng giữa chừng, tier sau thấy
code sớm (hành vi agents FI-151 tự phát minh đêm 15/8 — chính thức hóa).
Snapshot merge KHÔNG đánh dấu task completed — chỉ merge cuối (full Done) mới.

## Merge primary vào dest (định kỳ + BẮT BUỘC trước PR)

Primary (resolve qua `wakii-validate --resolve-primary`) tiến trong lúc story
chạy → dest nạp primary định
kỳ để tránh conflict dồn cuối:

```bash
cd <story-worktree>
git fetch origin <primary>
git merge origin/<primary> --no-edit       # merge, KHÔNG rebase (shared branch)
git push origin story/<epic>-<slug>
```

Trước khi tạo PR: BẮT BUỘC chạy 1 lần (xem pr-playbook precondition).

## CLEANUP-ON-MERGE per SF (nguyên tắc giữ nguyên — guard mới đơn giản)

SF merged xong → XÓA sf-worktree + sf-branch NGAY, không đợi story CLOSE —
mỗi bước vệ sinh giữ workspace tối thiểu (chỉ SF đang chạy + nhánh đích) và
buộc mọi thứ THẬT SỰ vào dest trước khi giải phóng:

```bash
cd <story-worktree>
# GUARDS (cả 3 pass mới xoá):
#   1. git merge-base --is-ancestor sf-<N>-<slug> story/<epic>-<slug>
#   2. git rev-list --count story/<epic>-<slug>..sf-<N>-<slug> == 0
#   3. sf-worktree sạch (dirty mồ côi → xác nhận content đã vào dest rồi mới
#      xử lý — bài học SF-4 staged 464 deletions)
orca worktree rm --worktree name:sf-<N>-<slug>
git branch -d sf-<N>-<slug>                # -d giờ ĐÚNG (HEAD = story dest chứa nó)
# branch lẻ agent tự tạo (vd sf-2/improvements-log): merge content vào dest
# (conflict improvements-log → giữ cả hai) RỒI mới xóa — không bỏ content docs.
```

## Story-level cleanup (SAU khi PR đã merge — KHÔNG chạy trước)

PR merge xong (nhánh đích đã vào primary trên remote) mới dọn story:

```bash
cd <primary-worktree>                      # session về lại primary
git fetch origin && git pull origin <primary>   # thấy merge của PR
# guards story-level: mọi SF Done + story-verify COMPLETE + không worktree sống
orca worktree rm --worktree name:story-<epic>-<slug>
git branch -d story/<epic>-<slug> && git push origin --delete story/<epic>-<slug>
```

## Drift-check trước sync-kit / bundle-into-orca (learned 2026-09-10 FI-380)

Trước khi sync/bundle ghi đè đích:
1. `diff` TỪNG file SRC ↔ đích (không tin "SRC luôn mới hơn") — đích có file
   mới hơn lineage (git log) → port ngược về SRC TRƯỚC, bundle SAU.
2. So `kit.json` 2 phía sau khi sửa: mỗi entry giữ nguyên name+description?
   Mất entry/description = sai (case: suốt mất GH-37 file-lock RMW + 9 agents
   permission profiles vì bundle mù).
3. Version: canonical (upstream kit) luôn ≥ mọi bản khác — nhảy cóc khi cần.
