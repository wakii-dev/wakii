# PR Playbook — story-workflow

Git flow chuẩn + quy trình tạo PR cho story. Engine = **`gh` CLI** (cùng
engine với Source Control panel của Orca — panel cũng gọi `gh` dưới nắp).
Mỗi story đúng **1 PR**: nhánh đích → primary (resolve qua
`wakii-validate --resolve-primary`). Merge primary VẪN LÀ QUYỀN NGƯỜI.

> story-hub: nhánh đích thật = dash-form (`story-<epic-id>-<slug>` — orca
> sanitizeWorktreeName fold `/`→`-`); ví dụ dưới giữ slash-form cho legacy.

## Git flow — branch taxonomy

```
<primary>  ←  story/<epic-id>-<slug>  ←  sf-1-*, sf-2-* ...
              (nhánh đích = "main của story")   (worktree riêng mỗi SF)
```

| Nhánh | Ai tạo | Ai merge vào nó | Ai push | Ai xóa |
|---|---|---|---|---|
| `<primary>` (`wakii-validate --resolve-primary`) | — | **NGƯỜI** (merge nhánh đích qua PR) | KHÔNG AI (agents không đụng) | — |
| `story/<epic>-<slug>` | APPROVE (fork từ primary) | các sf-* merge về | agent (lúc COMPLETE) | Agent — cleanup story-level SAU khi PR merge (merge-playbook "Story-level cleanup", với guards) |
| `sf-N-*` | launch/worktree | merge về nhánh đích | tùy chọn (backup) | CLOSE cleanup |

Push policy: agents được push **sf-\* và nhánh đích** (nếu repo có remote).
Không bao giờ push/merge/reset primary.

## Tạo PR (lúc STORY-COMPLETE — agent chạy)

**Thứ tự trong CLOSE:** chạy SAU bước 5 (Epic → Done) — PR sinh ra phải thấy
đủ nội dung audit. Trước khi báo STORY-COMPLETE.

### Preconditions (kiểm cả 5 — thiếu gì bỏ qua PR, KHÔNG chặn story)

```bash
# 0. Primary từ wakii-validate — BẮT BUỘC merge primary vào dest 1 lần trước PR
#    (chống drift — spec story-worktree-hub §5.4):
PRIMARY=$(~/.claude/bin/wakii-validate --resolve-primary --repo .)
#    resolve-primary exit 1 = PRIMARY-UNRESOLVED → KHÔNG BAO GIỜ để
#    PRIMARY rỗng chạy `gh pr create --base ""` (fail mù). Base theo quy trình
#    cũ (main) HOẶC dừng ở READY-FOR-MANUAL-MERGE + lý do "primary unresolved".
if [ -z "$PRIMARY" ]; then
  echo "READY-FOR-MANUAL-MERGE: primary không resolve được — merge tay nhánh đích → main (quy trình cũ), không tạo PR" # hoặc: PRIMARY=main
else
  git fetch origin "$PRIMARY" && git merge origin/"$PRIMARY" --no-edit
fi
# 1. Có remote?   git remote get-url origin
# 2. gh auth?     gh auth status
# 3. Nhánh đích sạch?  git -C <story-worktree> status --short
# 4. Primary tồn tại trên remote?  git ls-remote --heads origin <PRIMARY>
```

Fail-safe: mọi precondition fail → in `READY-FOR-MANUAL-MERGE: <lý do>` +
hướng dẫn merge thủ công vào final audit comment — story vẫn STORY-COMPLETE.
PR là tăng tốc, không phải gate.

### Tạo

```bash
cd <story-worktree>
git push -u origin story/<epic-id>-<slug>
gh pr create --base "$PRIMARY" --head story/<epic-id>-<slug> \
  --title "<epic-id>: <story title>" --body-file /tmp/story-pr-body.md
gh pr view --json url -q .url    # → comment Linear epic (audit)
```

KHÔNG hardcode `main`: primary resolve qua `wakii-validate --resolve-primary`
— wakii = wakii-dev (GitHub
default là main mirror upstream → remote-HEAD sẽ sai, xem spec §4).

### PR body template (viết vào file rồi --body-file)

```markdown
## Story <epic-id>: <title>

<1-2 câu mô tả từ story .wakii epic title/summary>

## Sub-features
| SF | Linear | Mô tả | Merge |
|---|---|---|---|
<copy bảng SF→issue→merge-hash từ final audit comment>

## Verification
- [ ] COMPLETE-RUN: mọi SF B1-B5 (story-verify COMPLETE)
- [ ] Final verify pass trên nhánh đích (tests/smoke)
- [ ] Linear Epic: Done

## Notes
- Reviewer: xem final audit comment trên Epic cho evidence từng SF.
- Nhánh đích giữ lại làm audit trail tới sau merge.
```

### Guard chống PR trùng

`gh pr create` fail khi đã có PR mở cho cùng head/base — xem output. Nếu
chỉ cần sửa body/title: `gh pr edit <số> --body-file ...`. Không mở PR thứ
hai cho cùng story (1 PR/story là contract — reviewer tracking theo số).

## Ai làm gì

| Bước | Actor |
|---|---|
| Push nhánh đích + `gh pr create` + comment URL vào Epic | PM agent (CLOSE) |
| Review PR | NGƯỜI (trong GitHub hoặc Orca Source Control panel) |
| **Merge PR** | **NGƯỜI** — human gate cuối, không agent/watchdog nào merge |
| Xóa nhánh đích + story worktree sau merge | Agent — cleanup story-level (merge-playbook "Story-level cleanup": chạy SAU khi PR merge, với guards) — không còn tùy chọn thủ công |

Watchdog KHÔNG retry `gh pr create` (không nằm trong launch/resume path).
PR fail giữa chừng → log vào audit comment, chụp lại ở pass watchdog kế
chỉ khi PM agent còn sống (không relaunch chỉ để tạo PR).
