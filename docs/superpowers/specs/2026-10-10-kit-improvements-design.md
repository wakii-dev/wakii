# Design — LOCAL-5: kit improvements (3 SF — bản CHỐT sau spec-critic 10/10)

- Ngày: 2026-10-10 · Trạng thái: ĐÃ QUA spec-critic (FIX-P0-FIRST — 3 P0 + 6 P1 đã vá
  theo câu replacement của critic; P2 ghi vào plan)
- Quyết định user: LOCAL-5 local (không Linear — audit file) · dest
  `story-local5-improve-kit` · SF-driver TÁCH (writer độc quyền khác đang giữ)
- P0 report: `.superpowers/sdd/local5-p0-impact.md`

## Vấn đề — 3 cụm defect (chẩn đoán đã P0-corrected)

### SF-1 — story-doctor install-coverage (sidecar manifest + srcKitRoot)

**Bệnh (P0-corrected)**: doctor chạy từ vị trí **CÀI** → `src==dst` → PASS tautology
(live 10/10: "PASS 60 bins" khi nguồn 59/cài 61). Chiều provides ∉ installed không
được phát hiện. Repair (04/10) PASS 9/9 nhưng không copy `story-pane-watch` thiếu —
vì `run_install_kit` chết nếu không thấy kit source (dòng ~482) — **máy chỉ-có-install
không có tay để copy** (đúng kịch bản incident).

**Fix**:
- **Sidecar** `~/.claude/bin/.kit-provides.json` = `{provides:[names], srcKitRoot,
  kitHash}` do installKit ghi:
  - Ghi **vô điều kiện TRƯỚC early-return** marker-khớp trong installKit (nếu không
    sẽ bị xoá và không bao giờ ghi lại — main.mjs ~1275)
  - `srcKitRoot` = đường kit source lúc install (để repair có tay copy)
- **check_bins**: kit.json vắng ở install dir → đọc sidecar: missing = provides
  (sidecar) ∉ installed → FAIL nêu tên; orphan = installed ∉ provides (2 chiều).
  KHÔNG sidecar → **WARN fail-open** (không được PASS)
- **Tautology fix**: doctor đặt kit_root BÊN TRONG install-dir (kit_root==root) là
  chế độ cần check — fixture phải đặt doctor trong `<root>/bin/` chạy từ đó
  (không phải chế độ kit-source — chế độ đó chưa từng tautology)
- **--repair thiếu bin**: `srcKitRoot` còn tồn tại + tree hash khớp sidecar → copy
  trực tiếp bin thiếu (qua guard under_root); source mất/hash lệch → **FAIL in
  hướng dẫn tay** (lệnh cp đúng) — không im lặng. Máy không có source → repair
  FAIL có-hướng-dẫn là behavior ĐÚNG
- **Lifecycle sidecar** (P1-2 ×4): (a) check_orphans WHITELIST sidecar (không coi
  là orphan — hiện scanner sẽ xoá); (b) uninstall_targets gồm sidecar; (c) missing
  sidecar → WARN fail-open (user cp tay không qua installKit); (d) sidecar refresh
  mỗi install bất kể early-return

### SF-2 — story-watchdog `--launch-next` scoping (fail-closed)

- **Đa-story**: repo có **>1 story** = đếm union stems (mindmaps + brackets) sau
  dedupe per-repo → `--launch-next` không `--story` = **SKIP toàn cục + warning
  liệt kê repos bị skip** (repo đơn-story vẫn launch bình thường)
- `--story <slug>`: match exact stem sau **dash-normalization** (`fi-458` ≡ `fi458`
  — file thật `fi458-distributed-bracket.wakii`); không khớp mindmap nào → warn +
  exit 0; `--story` CHỈ scope section launch_next (auto-resume/enforce-done/
  with-index giữ nguyên toàn cục)
- **Dest-absent**: local `show-ref` trước; miss → 1 lần `git ls-remote` (timeout
  30s); miss cả hai → skip + warning (tránh false-skip dest chỉ tồn tại trên remote)
- **Known limitation (ghi Boundary, cố tình hoãn)**: worktree-ownership `sf-N-*`
  chéo story (glob `sf-$n-*` dòng ~368) — story A sf-4 bị story B che khi dùng
  scoping; lineage check là fix đúng — phase sau
- Single-mindmap repo: behavior giữ nguyên (regression)

### SF-3 — story-verify + story-mindmap defects (P0-corrected)

1. **B3 mindmap-glob** (`story-verify` ~184 + 422): glob first-match — story cũ
   alphabetically-trước chặn story local → B3 FAIL ảo.
   **Fix rule (P1-6 pinned)**: story ID từ worktree basename — cắt đuôi
   `-sf-<n>` (pattern `<story>-sf-<n>` repo này) HOẶC cắt đầu `sf-<n>-` (pattern
   `sf-<n>-<slug>` repo khác); match: exact `<stem>.wakii` → boundary-anchored
   `<token>-*` với dash-normalization; 0-match hoặc >1-match → **UNKNOWN
   fail-open** (giống hành vi linear-rỗng dòng 329), KHÔNG FAIL; giữ precedence
   metadata-first, chỉ scoping lớp fallback
2. **B1 evidence anchor** (`story-verify` ~246-253): chính sách hiện tại ĐÃ là
   full-worktree-name primary + fallback token glob — **task = fixture-pin chính
   sách + neo biên fallback** `sf-<n>-*`/`sf-<n>.*` (hiện `sf-1*` bắt cả
   `sf-10-*` — harm thấp, chỉ sai error message)
3. **`story-mindmap --update-state`** (~416-470): mapping vocabulary orca →
   mindmap (P0-1: `failed` ∉ KNOWN_STATE — decoder drop node SF âm thầm):
   **`completed→done` · `failed→blocked` · `dispatched→in-progress` ·
   `ready→pending` · còn lại giữ nguyên — không giá trị map nào nằm ngoài
   KNOWN_STATE (story-mindmap:51)**. No-downgrade: `done` absorbing. Fix nằm ở
   `readOrcaStates` → tự cover cả `--bracket` generate (test CẢ 2 lệnh). Test
   stub đổi đúng vocabulary orca (stub cũ vocab giả → xanh ảo)

## ACCEPTANCE (fixture-based — số liệu live đã lệch: provides 59/install 60,
`story-pane-watch` ĐÃ có ở install; incident 04/10 không repro live được)

- SF-1: (a) fixture: xoá 1 provides-bin khỏi fake install → doctor FAIL nêu tên;
  (b) fixture: --repair có srcKitRoot hợp lệ → copy đủ; **variant KHÔNG-source →
  FAIL in hướng dẫn tay** (không PASS); (c) fixture doctor BÊN TRONG root: có
  sidecar → phát hiện thiếu; KHÔNG sidecar → WARN fail-open; (d) sidecar refresh
  mỗi install; (e) check_orphans không xoá sidecar; (f) uninstall dọn sidecar
- SF-2: như mục SF-2 trên (4 acceptance + regression)
- SF-3: như mục SF-3 trên (3 acceptance: B3 fixture, B1 fixture-pin, update-state
  vocabulary table)

## Rollout — PRECONDITION (P0-3)

SF-1 mở chỉ khi `git status` sạch trên `resources/plugins/launch/.../kit/` (driver
của writer khác đã commit/stash). Task đầu SF-1 = rehash kit.json (computeKitHash)
+ xác nhận kit-verify-manifest GREEN trên tree sạch, TRƯỚC mọi thay đổi khác.
(Bulk commit 10/10 hiện tại: kit.json=788c9a11 stale so với tree 788c9a11→cần
recheck — writer có thể đã tiến nữa.)

## Ước lượng (re-count sau patch)

SF-1: 12-13 tasks (4 sidecar lifecycle + copy-source design) · SF-2: 8-10 ·
SF-3: 10-11 (B1 gライト fixture-pin) — tổng 30-34

## Out-of-scope

workfront-driver hardening (writer khác — story tách) · Orca resolver đa-remote
(app-layer) · pane-watch phase-2 (2-way relay + age) · Doc consolidation ·
`story-memory-index-hook` status=error (backlog riêng)
