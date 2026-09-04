# Merge Playbook — story-workflow

Quy trình git merge cho story: per-SF merge, snapshot merge, cleanup, CLOSE
cleanup. Mỗi lệnh đã verify trên run thật (FI-151/FI-191).

> Playbook này phủ **SF → nhánh đích** (local git). Hướng nhánh đích → main
> (push + `gh pr create`, 1 PR/story) xem `references/pr-playbook.md`.

## Per-SF merge (xảy ra nhiều lần trong story)

LƯU Ý git-worktree: PARENT thường đã được checkout ở worktree khác (fatal:
"already checked out") → dùng chuỗi merge-ngược AN TOÀN (verified hôm FI-151):

```bash
cd <sf-worktree>
# 1. Merge PARENT VÀO sf-branch trước (sf-branch giờ chứa cả hai)
git merge <PARENT> --no-edit
#    conflict improvements-log → giữ CẢ HAI entries (protocol)
# 2. Fast-forward PARENT tới merge point — qua update-ref, kèm 2 guard:
git update-ref refs/heads/<PARENT> HEAD
#    LUÔN dùng FULL refname (refs/heads/...): tên ngắn tạo stray file
#    $GIT_DIR/<name> (legacy ref location) exit 0 thầm lặng → refname
#    ambiguous, ref thật KHÔNG được update (learned 2026-08-28 FI-191)
#    GUARD 1 (trước): git merge-base --is-ancestor <old-PARENT-HEAD> HEAD || STOP
#    GUARD 2 (sau): bảng rev-list count mọi sf-branch phải không TĂNG bất thường
# 3. Verify trên PARENT (tests/smoke) + push nếu có remote
```

KHÔNG BAO GIỜ update-ref khi sf-branch chưa chứa PARENT cũ (sự cố thực: ghi đè
mất 6 SF merges). Agent SF trong worktree riêng có thể checkout PARENT trực tiếp
nếu PARENT chưa bị checkout chỗ khác — coordinator dùng chuỗi an toàn trên.

## Snapshot merge (mid-run, encouraged cho SF nhiều tasks)

Khi một nhóm task lớn hoàn thành (vd T1-T4 của 5), merge NHANH về parent với
message `merge: SF-N <name> snapshot T1-T4 (<còn lại> in flight) into <PARENT>`
— đỡ mất việc nếu agent dừng giữa chừng, tier sau thấy code sớm. (Hành vi
agents FI-151 tự phát minh đêm 15/8 — chính thức hóa; principle 3: lắng nghe
agents.) Snapshot merge KHÔNG đánh dấu task completed — chỉ merge cuối (full
Done) mới.

Merge cuối xong → sub-issue comment hash merge (audit) → orchestration task của
SF `task-update --status completed` → DAG mở khóa tier sau.

## CLEANUP-ON-MERGE (nguyên tắc: SF merged xong → XÓA worktree + branch NGAY)

Không đợi story CLOSE. Vệ sinh từng bước giữ workspace tối thiểu (chỉ SF đang
chạy + nhánh đích), và buộc mọi thứ phải THẬT SỰ vào nhánh đích trước khi giải phóng:

```bash
cd <story-parent-worktree>
# GUARDS trước khi xóa (cả 3 phải pass):
#   1. git rev-list --count <đích>..<sf-branch> == 0   (không commit kẹt)
#   2. git merge-base --is-ancestor <sf-branch> <đích>  (thật sự ancestors)
#   3. worktree sạch (git status trống; dirty mồ côi → reset --hard SAU KHI
#      xác nhận content đã có trong <đích> — bài học SF-4 staged 464 deletions)
git worktree remove <path> && git branch -d <sf-branch> 2>/dev/null \
  || git branch -D <sf-branch>   # -d so với HEAD nhầm (HEAD là parent branch,
                                 # không phải <đích>) → dùng -D SAU guard 2
# branch lẻ agent tự tạo (vd sf-2/improvements-log): merge content vào <đích>
# (conflict improvements-log → giữ cả hai) RỒI mới xóa — không bỏ content docs.
```

Conflict khi merge = rubric V1 bị vi phạm lúc chia SF → flag vào
improvements-log, resolve thủ công, KHÔNG tự động theirs/ours.

## Story CLOSE cleanup (một lần, khi tất cả SF Done — GIỮ nhánh đích)

```bash
cd <story-parent-worktree>
for b in sf-1-foundation sf-2-hero ...; do            # mọi sf-* của story (liệt kê từ bracket)
  git worktree remove ../$b 2>/dev/null || true
  git branch -d $b 2>/dev/null || git branch -D $b    # -d ưu tiên; -D sau ancestor-guard
done
git worktree prune
# KHÔNG xóa story/<epic>-<slug> — nhánh đích ở lại chờ người merge
```
