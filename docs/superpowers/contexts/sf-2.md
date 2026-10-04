# Context pack — LOCAL-4 sf-2 — Mindmap state nhất quán giữa worktrees

> ⚠️ Bản 11:44 bị đè bởi copy chéo — bản này là bản CHÍNH THỨC LOCAL-4.

Nguồn: bệnh FI-30 (tick nằm ở 1 copy, driver phải verify lại) + VU-32 (merge trong story-hub,
primary copy `pending` mãi → worker mới làm lại việc đã merge) + case vocabulary-learn.wakii
chỉ tồn tại trong worktree riêng, master không thấy.

## Spec slice
Mindmap `.wakii` là file per-worktree — merge SF xảy ra trong story-hub worktree khiến state
ở copy đó mới, copy trên primary stale; ngược lại mindmap nằm trong worktree riêng thì primary
KHÔNG THẤY (vocabulary-learn vừa chứng minh). Consumer (workfront-driver verify, story-watchdog,
worker mới) nhìn nhầm copy → kết luận sai "chưa làm" → làm lại việc đã merge.

Nhiệm vụ: chọn ĐÚNG 1 phương án canonical-state (ghi rationale vào spec SF):
- (A) Consumer đọc mindmap từ **nhánh đích** khi tồn tại (`git show <dest>:docs/.../<slug>.wakii`),
  fallback primary copy; hoặc
- (B) **Tick-back sweep**: sau merge, sync state sf node đã merge ngược về primary copy
  (mở rộng `story-mindmap-trigger --reason sweep/close` hoặc story-close).

Tiêu chí: ít moving-part, idempotent, không đòi mạng/LLM, fail-open. Implement + test kịch bản
FI-30/VU-32.

## Touch map
- `kit/bin/story-mindmap` và/hoặc `story-mindmap-trigger`, `story-close` (tuỳ phương án)
- Consumers cần nhất quán: `workfront-driver` (sf_states), `story-watchdog`, `story-resume`
- tests kit + rehash (kitHash + fingerprint — fence thứ tự 30/09)
- Schema v1 GIỮ NGUYÊN (wakii-validate phải vẫn OK)

## ACCEPTANCE (user-visible)
- Fixture: nhánh đích có sf-1 done, primary copy pending → hàm đọc chuẩn trả về **done**.
- Kịch bản worktree-only mindmap (vocabulary-learn): driver chỉ định --repo + mindmap ngoài
  primary → đọc được đúng file story (hoặc báo MISSING rõ ràng, không im lặng đọc nhầm).
- Không đổi gì trên mindmap đang sống của story khác (read-only ngoài story này).
- Suite kit xanh.

## Boundary
- KHÔNG tick hộ story VU-32/vocabulary-learn thật; fixture dùng mindmap synthetic.
- KHÔNG đụng schema/panel/mindmap viewer.
