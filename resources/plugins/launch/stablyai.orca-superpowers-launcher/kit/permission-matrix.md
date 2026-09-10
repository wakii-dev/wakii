# Permission matrix — 9 agent defs (nguồn truth duy nhất)

Profile quyền của story team, 1 chỗ duy nhất. Frontmatter `disallowedTools` của
mỗi def trong `kit/agents/*.md` PHẢI khớp bảng dưới — lint test
(`tests/agent-def-protocol-tests.mjs`) hardcode bảng này và assert từng file;
lệch matrix → test FAIL. Sửa profile = sửa BỘ (bảng + frontmatter) trong 1 commit.

| Agent | tool-deny (`disallowedTools`) | ask-scope (convention — không runtime) | escape (khi bị chặn/vượt profile) |
|---|---|---|---|
| code-reviewer | Edit, Write, NotebookEdit | read-only analyze — phân tích qua Read/Grep/Glob/Bash-đọc; chỉ báo cáo | báo BLOCKED lý do permission → coordinator re-dispatch agent khác hoặc explicit instruction từ user |
| security-audit | Edit, Write, NotebookEdit | read-only audit — quét code/config, không sửa gì | như trên |
| spec-critic | Edit, Write, NotebookEdit | đọc spec/context, chỉ critique — không patch spec | như trên |
| plan-critic | Edit, Write, NotebookEdit | đọc plan/DAG, chỉ critique — không rewrite plan | như trên |
| phase0-impact-analyst | Edit, Write, NotebookEdit | phân tích ảnh hưởng, không viết code | như trên |
| verifier | Edit, Write, NotebookEdit | verify gate criteria bằng bằng chứng, không sửa implementation | như trên |
| rollback-fixer | Edit, Write, NotebookEdit | revert-only — git qua Bash (revert/restore/checkpoint) GIỮ nguyên; không tự viết file fix | như trên |
| designer | Edit, Write, NotebookEdit | prototype qua huashu-design skill — không code production | như trên |
| task-executor | (không deny) | ghi code CHỈ trong worktree được giao (path scope qua briefing) | hậu kiểm: story-diff-review — diff ngoài scope → rollback-fixer |

## Bash-gap (giới hạn thật của tool-level deny)

`disallowedTools` chặn TOOL-level, không chặn PATH-level: `sed -i`, redirect,
`tee`, heredoc… qua Bash vẫn ghi được file ngoài scope. Không thêm path-guard
runtime nào ở đây — guard hậu kiểm đã có là **story-diff-review** (review diff
trước commit); matrix này KHÔNG tái định nghĩa guard đó.

## Degrade (fail-open)

Claude Code cũ không hiểu `disallowedTools` → bỏ qua field, agent chạy full tool
= hiện trạng trước kit 2.8.0 (fail-open, không fail-closed). `kit.json` requires
`claude-code >=2.0`; floor thật chưa pin — degrade path là chấp nhận được, không
cần fallback riêng.

## Ask-tier — không có runtime

Claude Code không hỗ trợ per-agent ask-list hay path restriction (phase0 đã
verify) — cột ask-scope là convention cho briefing/dispatch, không phải enforce.
Escape duy nhất khi agent bị chặn đúng profile: coordinator re-dispatch với agent
khác (vd task needed Write → task-executor) hoặc explicit instruction từ user.

## Hệ lụy đã biết (chấp nhận có chủ đích)

Agent bị deny Write không ghi được report OUTBOX (`docs/superpowers/reviews/*.md`)
hay artifact file — trả report trong message trả về; cần file trên đĩa thì
coordinator re-dispatch agent có Write (task-executor) hoặc user explicit.
