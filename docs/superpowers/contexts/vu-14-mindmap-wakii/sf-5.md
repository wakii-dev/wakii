# Context pack SF-5 — .wakii canonical, retire bracket (Phase 3)

## Spec slice
1. **Flip kiến trúc** (user 27/09): .wakii = nguồn sự thật của story; bracket retired.
   Field ownership: structure/knowledge (nodes cấu trúc, summary, acceptance, tests,
   notes, edges cấu trúc) = người/PM owned — sửa tay; state (`state`, `evidence`,
   `generatedAt`) = machine owned — updater sửa **in-place** (KHÔNG full-regen đè
   phần người). Ownership map theo trường ghi trong spec §11 + §3.
2. **wakii-validate** (bin mới thay story-validate): validate schema v1 (decoder
   luật §3) + structural (duplicate/dangling/self-loop) + đủ epic/SF + linear id
   tồn tại (khi Linear bật) + tier/deps nhất quán với edges depends-on. Exit
   0/1/2 như story-validate (OK/INVALID/WARN). Provides[] update + rehash.
3. **story-launch đọc .wakii**: parse SF slice từ nodes/edges (thay awk bracket);
   validate deps Done qua edges depends-on + state; derive linear từ node;
   context pack resolution GIỮ NGUYÊN (pack vẫn là material kế thừa).
4. **story-verify derive từ .wakii**: B3/B4 đọc nodes thay bracket glob — hết
   nguyên nhân Bug FI-246 (glob nhầm bracket) một cách cấu trúc.
5. **Story tab (app)**: parser đọc `docs/superpowers/mindmaps/*.wakii` thay
   bracket .md — canvas vẽ từ nodes/edges có sẵn (không parse markdown).
   Wire: format đã versioned — tab hiển thị decodeWarnings thay vì vỡ.
6. **Watchdog/coordinator-pass**: story-status/story-top/launch-next derive từ
   .wakii (state + deps).
7. **Bootstrap migration**: `story-mindmap --bootstrap <bracket>` (SF-1 regen
   path) sinh .wakii cho story cũ → kiểm wakii-validate PASS → xoá bracket
   tương ứng + xoá story-validate (provides[] + rehash + retire danh sách).
   VI-1: chỉ migrate khi tới milestone an toàn, không giữa run.
8. **Docs**: story-workflow SKILL.md + references đổi bracket → .wakii (format,
   CREATE viết .wakii trực tiếp, APPROVE đọc .wakii); AGENTS.md nếu nhắc bracket.

## Touch map
- Sở hữu: `wakii-validate` bin (mới) · state-updater mode trong story-mindmap · migration script/bootstrap flag · tests mới (validate + updater in-place + migration round-trip).
- Append-only: `kit/bin/story-launch` (parse .wakii) · `kit/bin/story-verify` (derive .wakii — GIỮ exit contract + --json shape panel) · `kit/bin/story-status` / `story-top` / `story-watchdog` / `story-coordinator-pass` (đổi nguồn derive) · `kit/kit.json` (thêm wakii-validate, retire story-validate) · Story tab parser (src/renderer — đọc .wakii) · SKILL.md story-workflow + references.
- Read-only: `src/main/plugins` không đụng · decode schema (SF-2) · viewer (SF-3).
- Retire: `docs/superpowers/brackets/*.md` ĐÃ migrate (xoá từng story sau khi .wakii PASS validate) · bin `story-validate` + tests của nó.
- Cấm: xoá bracket story CHƯA migrate · đổi exit code/stdout hợp đồng story-verify · cưỡng bức migrate VI-1 giữa run · đụng fingerprint logic (chỉ rehash).

## ACCEPTANCE
- VU-14 tự vận hành bằng .wakii: launch SF (nếu còn) + verify + status đều đọc .wakii, không chạm bracket.
- wakii-validate: fixture OK / INVALID (mỗi luật §3 một case) / WARN linear-deferred — exit đúng.
- Updater in-place: sửa `notes[]` tay → chạy updater → notes GIỮ NGUYÊN, chỉ state/evidence/generatedAt đổi.
- Migration round-trip: bracket VI-1 (fixture copy) → bootstrap → wakii-validate PASS → nội dung 3 lớp khớp bracket.
- Retire: story-validate khỏi provides + đĩa; suite kit không còn tham chiếu chết; kit-verify 30+/30+ xanh; lockstep + verify-packaged EXIT 0.
- Story tab render .wakii (golden fixture) + decodeWarnings hiển thị.
- Suite kit toàn bộ exit 0.

## Boundary
- KHÔNG xoá bracket chưa migrate (danh sách migrate ghi audit).
- KHÔNG đổi wire schema (chỉ thêm optional nếu thiếu — bump nếu bắt buộc mới).
- KHÔNG đổi merge topology / nhánh đích — chỉ đổi định dạng nguồn.
- KHÔNG tự xoá story-validate trước khi wakii-validate + migration xanh (thứ tự: validate mới sống → migrate → retire).
- Linear deferred — wakii-validate nhánh Linear check phải fail-open.
