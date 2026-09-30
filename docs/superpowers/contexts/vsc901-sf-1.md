# Context pack — SF-1 Pipeline smoke verify (VSC-901 / FI-44)

## Spec slice
Xác nhận pipeline story-workflow chạy end-to-end cho automation vscode-sync, bằng
bằng chứng lệnh thật (NO EVIDENCE = NO CLAIM). SF này KHÔNG viết/sửa code — chỉ
kiểm chứng cấu trúc + ghi evidence.

## Touch map
- **Không file production nào.** Chỉ đọc: story .wakii
  `docs/superpowers/mindmaps/vsc901-pipeline-smoke.wakii`, Linear issues FI-44 (epic) /
  FI-45 (SF-1), worktree registry (`orca worktree list`), git lineage.

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm từng dòng)
1. FI-45 là con trực tiếp của FI-44 (`orca linear list-issues --parent-id FI-44` thấy FI-45).
2. FI-44 state = In Progress; FI-45 state = In Progress.
3. `.wakii` pass `~/.claude/bin/wakii-validate` (0 FAIL) và sf-1 node có `linear: FI-45`.
4. Story worktree `story-vsc901-pipeline-smoke` tồn tại, checkout nhánh đích
   `story-vsc901-pipeline-smoke`; SF worktree `sf-1-pipeline-smoke` fork từ nhánh đích
   (`orca worktree list` + `git log` lineage).
5. Evidence comment (kèm output lệnh thật) trên FI-45 + audit comment mốc trên FI-44.

## Boundary
- KHÔNG commit code production nào (chỉ artifacts story: .wakii, context pack, evidence).
- KHÔNG merge vào wakii-dev — human gate.
- KHÔNG set FI-45 Done (story-hub: coordinator set sau merge; SF verification-only
  không có gì merge → report DONE + evidence, coordinator quyết).
- Browser Rule 0: N/A — SF pure CLI, proxy theo FI-460 (test suite/evidence logs +
  marker CLI-equivalent).
