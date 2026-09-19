# Principle 7 — Per-milestone content + Resume idempotency

> Tách từ orca-superpowers-workflow/SKILL.md — content tối thiểu từng milestone + quy tắc dedup khi resume.


| Milestone | Required content |
|-----------|------------------|
| After Phase 0 | Direction chosen + WHY (rationale for A vs B, what was dismissed), touch map, top risks, gate status |
| After Phase 1 | Issue identifier, status set, worktree path |
| After Phase 2 (brainstorm) | Absolute spec path + scope summary (in/out) + key clarifying Q&A that shaped the design |
| After Phase 3 (plan) | Absolute plan path + task count + DAG tier structure + key orca commands used (so they can be replayed) |
| During Phase 4 (per task) | task N/total, title, exact commands with `--flags`, key output ids (issue/gate/task/commit hash), gate resolution — max ~15 lines. Full narrative (files modified, reviewer notes, rationale) goes in the consolidated "Phase 4 full reproduction" comment |
| After Phase 4 final gate | Verification outcome + evidence (test result, build status) |
| After Phase 4 (full reproduction) | ONE consolidated comment: per-task files modified, reviewer notes, rationale, gate resolutions — the reproduction-grade narrative for the whole execution phase |
| After Phase 5 | Done status, PR link, post-task-ritual summary (patterns learned) |
| BLOCKER / ESCALATION / ERROR | what + when + full error context + how resolved (or what was tried) |

Format: markdown (bold headers, fenced code blocks for commands/outputs, bullet lists). Skip in Quick-fix mode (no Linear issue). Standard tier: single end-of-run comment instead of per-task comments.

**Resume idempotency (applies when resuming mid-workflow — e.g. continue-plan, resume, restart):** before commenting for a phase/task, check whether that milestone was already logged. Each comment MUST start with a milestone marker line (`**Phase 0**`, `**Phase 1**`, `**Phase 2**`, `**Phase 3**`, `**Phase 4 task N/total**`, `**Phase 4 full reproduction**`, `**Phase 4 final gate**`, `**Phase 5**`). On resume:
```bash
# (learned 2026-08-31 FI-234: `orca linear comment list` KHÔNG tồn tại —
# pipe-swallowed error tự biến thành "0 comments" ảo. Lệnh list comments
# hoạt động, đã verify, là `orca linear issue <id> --comments --json`
# (trả comments[].body). Parse bằng python3 nếu jq không có trên máy.)
orca linear issue <id> --comments --json | python3 -c "import sys,json; [print(c.get('body','')) for c in json.load(sys.stdin).get('result',{}).get('issue',{}).get('comments',[])]" | grep -E '^\*\*Phase [0-5]'
```
- If the milestone marker for the phase you're about to log **already exists** → SKIP commenting (do not duplicate). The first comment wins.
- If it's **missing** → comment normally (backfill with the actual state, not a guess — if you don't have the output for a past phase, say "reconstructed from plan/state" rather than fabricating).
- Phase 4 per-task comments are keyed by `task N/total` — only deduplicate the same N, not across tasks.
This prevents double-commenting on resume and silent skips when the agent wrongly assumes a phase was already logged.
