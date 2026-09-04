# PR Playbook — story-workflow

Git flow chuẩn + quy trình tạo PR cho story. Engine = **`gh` CLI** (cùng
engine với Source Control panel của Orca — panel cũng gọi `gh` dưới nắp).
Mỗi story đúng **1 PR**: nhánh đích → main. Merge main VẪN LÀ QUYỀN NGƯỜI.

## Git flow — branch taxonomy

```
main  ←  story/<epic-id>-<slug>  ←  sf-1-*, sf-2-* ...
         (nhánh đích = "main của story")   (worktree riêng mỗi SF)
```

| Nhánh | Ai tạo | Ai merge vào nó | Ai push | Ai xóa |
|---|---|---|---|---|
| `main` | — | **NGƯỜI** (merge nhánh đích) | KHÔNG AI (agents không đụng) | — |
| `story/<epic>-<slug>` | APPROVE (fork từ main) | các sf-* merge về | agent (lúc COMPLETE) | NGƯỜI (khi không cần audit) |
| `sf-N-*` | launch/worktree | merge về nhánh đích | tùy chọn (backup) | CLOSE cleanup |

Push policy: agents được push **sf-\* và nhánh đích** (nếu repo có remote).
Không bao giờ push/merge/reset main.

## Tạo PR (lúc STORY-COMPLETE — agent chạy)

**Thứ tự trong CLOSE:** chạy SAU bước 5 (Epic → Done) — PR sinh ra phải thấy
đủ nội dung audit. Trước khi báo STORY-COMPLETE.

### Preconditions (kiểm cả 4 — thiếu gì bỏ qua PR, KHÔNG chặn story)

```bash
# 1. Có remote GitHub?
git remote get-url origin        # không có → READY-FOR-MANUAL-MERGE, dừng
# 2. gh đã auth?
gh auth status                   # fail → READY-FOR-MANUAL-MERGE, dừng
# 3. Nhánh đích sạch?
git -C <story-parent-worktree> status --short   # dirty → commit/dọn trước
# 4. Base branch tồn tại trên remote (thường main)?
git ls-remote --heads origin main
```

Fail-safe: mọi precondition fail → in `READY-FOR-MANUAL-MERGE: <lý do>` +
hướng dẫn merge thủ công vào final audit comment — story vẫn STORY-COMPLETE.
PR là tăng tốc, không phải gate.

### Tạo

```bash
cd <story-parent-worktree>
# 1. Push nhánh đích (lần đầu -u set upstream)
git push -u origin story/<epic-id>-<slug>

# 2. Tạo PR — base main, head nhánh đích (1 PR duy nhất/story)
gh pr create \
  --base main \
  --head story/<epic-id>-<slug> \
  --title "<epic-id>: <story title>" \
  --body-file /tmp/story-pr-body.md

# 3. Lấy URL → comment vào Linear epic (audit)
gh pr view --json url -q .url
```

### PR body template (viết vào file rồi --body-file)

```markdown
## Story <epic-id>: <title>

<1-2 câu mô tả từ bracket>

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
| Xóa nhánh đích sau merge | NGƯỜI (tùy chọn) |

Watchdog KHÔNG retry `gh pr create` (không nằm trong launch/resume path).
PR fail giữa chừng → log vào audit comment, chụp lại ở pass watchdog kế
chỉ khi PM agent còn sống (không relaunch chỉ để tạo PR).
