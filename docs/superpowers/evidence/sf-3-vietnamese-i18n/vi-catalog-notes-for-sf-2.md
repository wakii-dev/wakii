# vi.json catalog findings — notes cho SF-2 (SF-3 KHÔNG sửa catalog theo boundary)

Ngày scan: 27/09 · base: fbbd659675 · catalog 14764/14764 = 100% translatedness (metric SF-2 exit 0).
Mỗi mục dưới đều verified trên data thật; "mức độ" là đề xuất xếp hạng cho SF-2 tự adjudicate.

## A. Search keywords bị GT dịch literal brand (mức: cao — làm hỏng search)

Keyword values là thuật ngữ người dùng gõ để tìm setting — brand/product names cần giữ Latin:

| key | en | vi hiện tại |
|---|---|---|
| auto.components.settings.appearance.search.1f2880a9d5 | `orca` | `cá kình` |
| auto.components.settings.browser.use.search.ff05cbc344 | (chứa orca) | `cá kình` |
| auto.components.TaskPage.9ae151b26b | `linear` | `tuyến tính` |
| auto.components.settings.appearance.search.6b846424cc | `linear` | `tuyến tính` |
| auto.components.settings.integrations.search.7319e3015b | `linear` | `tuyến tính` |
| auto.components.settings.tasks.search.412ec3c702 | `linear` | `tuyến tính` |
| auto.components.stats.stats.search.6953af58e6 | `opencode` | `mã mở` |
| auto.components.settings.accounts.search.8dcbef1856 | (chứa opencode) | `mã mở` |
| auto.components.status.bar.StatusBar.d7a0668acc | `opencode-go` | `mã mở-đi` |

Đề xuất: thêm brand/product terms (orca/opencode/linear/…) vào preserve-set cho `*.search.*` values.

## B. Literal leaks kỹ thuật (mức: trung — vi style giữ term Anh, các value này lệch)

| key | en | vi hiện tại |
|---|---|---|
| auto.components.cmd.j.quick.actions.verbs.trashWorktree | `trash worktree` | `cây công trình rác rưởi` |
| auto.components.settings.appearance.search.workspaceCardLayout.worktreeCards | `worktree cards` | `thẻ bài làm việc` |
| auto.components.settings.ExperimentalPane.newWorktreeCardStyle.copy | (worktree-card …) | mất chữ "worktree" (`thẻ công việc`) |
| auto.components.right.sidebar.SourceControl.78ce2d37ac | `Pushes to fork` | `Đẩy tới ngã ba` ("fork" → "ngã ba") |
| auto.components.right.sidebar.SourceControl.createPrIntentForcePushing | `Force pushing with lease…` | `Buộc đẩy bằng hợp đồng thuê…` ("lease" git ≠ hợp đồng thuê) |
| auto.components.settings.RepositoryForkSyncSection.syncedDescriptionSingular | `…by 1 commit.` | `…bằng 1 lần xác nhận.` (commit → xác nhận) |
| auto.components.PullRequestPage.b0e80f083d | `wants to merge into` | `muốn sáp nhập vào` (sáp nhập = corporate M&A) |
| auto.components.settings.plugins.search.permissions | `plugin permissions` | `quyền bổ sung` |
| auto.components.settings.PluginConsentDialog.reconsent | (…this plugin…) | `phần bổ trợ` |
| auto.components.cmd.j.pluginQuickActions.description | `{{value0}} plugin command` | `Lệnh bổ trợ {{value0}}` |
| components.onboarding.integrations.capabilities.browseIssues | `…pull requests…` | `lấy yêu cầu` (pull request → lấy yêu cầu) |
| auto.components.PullRequestPage.checkActionRequiredHint (và GitHubItemDialog cùng tên) | `…approving the run…` | `phê duyệt hoạt động chạy` (CI run → hoạt động chạy) |

## C. Style inconsistency cho SF-2 adjudicate (mức: thấp — không chắc là lỗi)

- "merge": 32 vi values dùng `hợp nhất` (vd `Đã hợp nhất Pull request`), trong khi 6 exact-label keys giữ `Merge` và ~96/97 keys khác giữ "merge" trong câu. Hai style song song — SF-2 chọn 1 hướng (giữ Anh như glossary, hoặc chuẩn hoá `hợp nhất`).
- "push/pushing": nút chính giữ `Push`, nhưng `SshStatusSegment.95e4ff5b4b` `pushing` → `đẩy`. Nếu glossary giữ git-verb Anh thì value này lệch; nếu cho phép dịch động từ thì hiện trạng là chủ đích.
- badge worktree "primary" → `sơ đẳng` (WorktreeJumpPalette.739bda980c, WorktreeCard.7d517f82e2) — GT lấy nghĩa "primordial"; badge này nên là "chính" hoặc giữ "primary". Thấy trên UI thật trong RULE-0 (27/09).
- nút "Command" (quick commands, TabBarQuickCommandsButton.a2c7a33831 + 3 keys khác) → `Yêu cầu` — "command" (lệnh) ≠ "yêu cầu" (request); đề xuất "Lệnh".

## D. Đã khoá bởi guard SF-3 (không cần SF-2 làm gì)

Guard `src/renderer/src/i18n/vi-technical-literal-mistranslations.test.ts` + `vi-translatedness-ratchet.test.ts` chặn tương lai: exact-label Push/Pull/Merge/Branch/Commit giữ en; cam kết/nhánh conditional-scan; brand casing catalog-wide; sample pins; ratchet count ≥ 14764.
Các literal A/B CHƯA bị guard chặn (guard chỉ scan class sạch hôm nay) — sau khi SF-2 fix xong có thể siết thêm vào FORBIDDEN_LITERALS.
