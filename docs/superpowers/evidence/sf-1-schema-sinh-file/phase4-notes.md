# SF-1 Notes — quyết định thiết kế + biên độ thực thi (VU-14)

## Quyết định SF-level (spec cấp story đã chốt hướng — chi tiết hóa tại đây)

1. **Trigger (b) sweep — wiring**: `story-coordinator-pass` / `story-watchdog` KHÔNG nằm
   trong touch map của context pack → KHÔNG sửa (surgical scope). Deliverable = wrapper
   `story-mindmap-trigger --reason sweep` là bề mặt chịu gọi ngoài (automation/người);
   bin idempotent nên "regen chỉ khi state đổi" thoả tự nhiên (payload không đổi → không
   ghi). Wiring vào 2 sweep bins là việc owner bins đó — **REQUIREMENT-NOTE** (không
   blocker: ACCEPTANCE của SF-1 chỉ test wrapper fail-open + launch flow không đổi).
2. **Task node state**: không có nguồn cấu trúc per-task → luôn `pending`, GHI RÕ comment
   trong code; SF state lấy từ orchestration task-list (SF-level granularity có thật).
3. **Orchestration run discovery**: `task-list` không `--run` chết ngoài terminal bound
   (`run_required`) → bin tự discovery qua `run-list` (chạy unbound được) match epic-id
   trong objective, lấy run mới nhất theo updated_at; override bằng env
   `STORY_MINDMAP_RUN`. Fail-open giữ nguyên.
4. **Decoder — node bị drop (unknown enum)**: edge/parent trỏ vào node bị drop → drop kèm
   + warning (KHÔNG invalidate — giữ forward-compat, đây là ý định của luật
   drop-unknown); dangling tới id CHẲNG TỪNG tồn tại → INVALID (đúng luật spec).
   `parent` ≠ edge `contains` → không invalidate, decoder giữ nguyên dữ liệu, precedence
   "edge là nguồn sự thật" ghi trong header bin cho SF-3 consume.
5. **Node `file` có `title`**: bảng bắt buộc "mọi node có id+kind+title" là normative;
   example trong spec thiếu title ở file node là minh hoạ — generator phát title = path.
6. **`linear:` rỗng** (Linear deferred 27/09): field `linear` bị OMIT (không emit chuỗi
   rỗng) ở cả meta (không có epic-level linear) và sf node.
7. **Touch map extraction**: chỉ backtick-path có `/`, không space, không `*` — glob
   `docs/superpowers/mindmaps/*.wakii` (chính output) và free-text bị bỏ; dòng `Cấm:`
   không phải impact → bỏ.
8. **Self-validate trước ghi**: generator chạy decoder trên output của chính nó — bug
   generator không thể ra file INVALID (bắt được 1 bug thật trong quá trình dev: file
   node thiếu title).

## Baseline fix (ngoài phạm vi nội dung, bắt buộc để gate xanh)

- kit-verify-manifest assert "mọi bins executable" RED TỪ BASELINE: 5 bins
  (story-doctor, story-guard-dangerous/envfiles/secrets, story-impact) mất exec-bit
  TRÊN WORKTREE checkout (git vẫn lưu 100755 — `git ls-files -s` xác nhận; `git add`
  = no-op, không có diff để commit). Class lỗi đã index 11/09 ("worktree sinh bins
  không chạy được"). Fix = `chmod +x` worktree-only. Không đụng nội dung file nào.

## Proof-of-fix trong quá trình dev (meta-test có thật)

- RED đầu: bin chưa tồn tại → suite chết (log /tmp/smm-red.log tại thời điểm chạy).
- Các vòng fix: repo path 3-cấp (không phải 2) · node file thiếu title (self-validate
  bắt) · idempotent compare (prev meta phải strip generatedAt + cur side thêm
  generator) · path.join với arg tuyệt đối KHÔNG reset (test bug) · duplicate-id check
  thiếu ở decoder (bị test bắt) · run-discovery (probe thật: unbound → run_required).

## Review độc lập (code-reviewer, không tự duyệt)

- Vòng 1 (27/09, trên d71764ebb1): **CHANGES-REQUESTED — 2 P1**
  1. `--mermaid-md` bị nuốt im lặng khi payload unchanged (early-return trước render)
  2. wrapper `--commit` commit không pathspec → quét cả staged lạ ở cwd vào commit
     "mindmap snapshot" (hazard thật trên dest checkout dirty-index)
  + 4 P2: thứ tự pass decoder (dropped-node parent không INVALID — nhất quán hoá được),
  epic non-ASCII regex yếu, slug collision → self-validate die (an toàn nhưng khó đoán),
  wrapper arg thiếu giá trị vỡ set -u.
- Fix (6612c35cd5): P1-1 render md từ prev-doc trong nhánh unchanged; P1-2 track
  ADDED[] + commit pathspec, bỏ reset; harden P2-2 (epic non-ASCII → bỏ discovery có
  warning) + P2-4 (guard $#). **P2-1 + P2-3: chấp nhận có chủ đích, disposition:**
  - P2-1: thứ tự pass A (drop enum) → pass B/C (structural) là lựa chọn forward-compat
    — edge trỏ node-bị-drop drop kèm thay vì INVALID toàn file; SF-2 consumer đọc
    decodeWarnings để biết.
  - P2-3: 2 path khác slug trùng id file → self-validate die(1) → wrapper nuốt → mất
    mindmap im lặng: hành vi AN TOÀN (không bao giờ ra file INVALID) hiếm khi xảy ra
    (slug trùng cần path trùng sau normalize); SF-2 error surface nhận error payload.
- Meta-test: c2b + c8-mở-rộng RED trên code cũ (58/61), GREEN trên mới (61/61).
- Vòng 2 (re-review, range 66742df441..0d97e6201c): **VERDICT: APPROVED** — 2 P1 fix
  đúng kèm test RED→GREEN, 2 P2 harden đúng, scope sạch, coverage pass 8/8 file,
  61/61 tự xác minh. Checkpoint-4Q 4/4 PASS. Không cần vòng review nữa.

## Đã chạy — deterministic gates

| Gate | Kết quả |
|---|---|
| story-mindmap-tests (mới) | 61/61 exit 0 (sau fix P1; 57/57 trước fix) |
| Kit suite toàn bộ (tests/*.mjs) | 37 files, 0 red |
| kit-verify-manifest | 30/30 exit 0 |
| plugin-tree-hash-lockstep (qua pnpm test) | 7/7 exit 0 |
| verify-packaged-plugin-resources.cjs | EXIT 0 |
| story-launch-tests / story-close-tests (sau insertion) | 8/8 · 13/13 exit 0 |
| Rule-0 CLI-equivalent (bin cài thật ~/.claude/bin) | file 3 lớp + idempotent + decode valid — xem rule0-cli-equivalent.txt |
