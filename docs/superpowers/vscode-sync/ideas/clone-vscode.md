# IDEA: Clone VS Code vào Wakii

> Status: decomposed (automation vscode-idea-decomposer sẽ phân rã file này
> thành chuỗi feature trong backlog — xong sẽ đổi thành `Status: decomposed`)

## Mục tiêu

Wakii (app markdown/story/mindmap + worktree + terminal trên nền Orca) đạt
độ hoàn thiện workbench ngang VS Code cho workflow quản trị dự án + viết:
mọi tính năng cốt lõi người dùng tương tác hằng ngày với VS Code phải có
tương đương trong Wakii, giữ bản sắc riêng (story/mindmap/agent-first).

## Phạm vi gợi ý (decomposer tự nghiên cứu + cắt lại)

- Command palette + quick open (phím tắt chuẩn VS Code)
- Editor UX: breadcrumbs, word wrap indicators, sticky scroll, minimap
- Git surface: inline blame, gutter actions, commit graph, merge editor
- Search & replace: toàn workspace, fuzzy, preserve case
- Terminal: split panes, shell integration, output reflow
- Settings/UI: settings editor, keybindings editor, themes, profiles

## Nguồn tham chiếu

- https://code.visualstudio.com/updates (release notes 1.137→1.140 đã research)
- https://code.visualstudio.com/docs (feature docs theo lĩnh vực)

## Ràng buộc

- Serial: 1 story tại một thời điểm (thứ tự backlog = thứ tự thực hiện)
- Nền tảng (editor infra, search core) trước; UX polish sau
- Không đụng code production ngoài scope từng feature
