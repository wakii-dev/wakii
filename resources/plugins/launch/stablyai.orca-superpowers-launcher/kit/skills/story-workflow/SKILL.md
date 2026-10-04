---
name: story-workflow
description: >-
  Create and operate STORIES — large features managed as an epic Linear issue with
  sub-issues per sub-feature (SF), structured as a vertical tier-bracket. Use when the
  user says "create story", "story mode", "epic mode", "approve story", "launch SF",
  "story bracket", or when a feature is large enough to need multiple parallel workflows
  (rubric: >3 sub-features or >10 tasks). Writes .wakii mindmap files to
  docs/superpowers/mindmaps/<slug>.wakii that the Wakii Story tab renders.
  Also "story watchdog", "story stall", "story incomplete" — the self-check loop
  that resumes stalled SFs and drives the story to completion.
---

# Story Workflow — epic bracket orchestration

A STORY is a large feature run as: **one analysis pass (deep) → bracket approval →
many isolated executions (SF workflows inheriting the analysis)**.

Core principle: **analyze once, inherit many times.** Phase 0-2 quality happens ONCE
at epic level with ALL principles at maximum strictness; each SF (sub-feature) then
runs only Phase 3-5 (plan-detail, execute, verify), reading the epic spec — never
re-analyzing, never re-asking.

## FLAG `--decompose` — rã ý tưởng lớn thành chuỗi story tuần tự

Khi input là **ý tưởng lớn** (vd "clone vscode vào wakii") — quá lớn cho 1 story —
chạy story-workflow ở chế độ DECOMPOSE thay vì CREATE:

- **Input:** mô tả ý tưởng (file trong `docs/superpowers/vscode-sync/ideas/<slug>.md`
  hoặc mô tả trực tiếp).
- **Output:** danh sách feature có THỨ TỰ (ưu tiên + phụ thuộc thể hiện bằng vị
  trí) ghi vào `docs/superpowers/vscode-sync/backlog.md` dạng `- [ ] VSC-XXX:
  <tên> — <mô tả>`. KHÔNG tạo epic/story/.wakii ở bước này — mỗi feature sẽ được
  tạo story đầy đủ (CREATE) tuần tự bởi scout/auto-launch pipeline khi đến lượt.
- **Quy trình phân rã:** research nguồn tham chiếu thật (release notes, docs, code
  hiện có) → nhóm theo lĩnh vực → cắt feature theo rubric: 1 feature = 1 story
  vừa sức (như rubric SF: >3 SF hoặc >10 tasks thì tách tiếp) → sắp thứ tự:
  nền tảng trước, UI sau; độc lập song song được thì đặt cạnh nhau.
- **Tránh trùng:** đọc backlog hiện có — feature trùng/similar thì bỏ hoặc gộp.
- Sau khi ghi: in ra tổng kết (số feature, thứ tự) rồi STOP — KHÔNG claim, KHÔNG
  tạo story. Pipeline vscode-sync (scout/auto-launch) sẽ tuần tự hóa.

Serial contract: pipeline xử lý ĐÚNG 1 story tại một thời điểm — story xong
(merged, mark-done) mới claim feature kế trong backlog.

## Quick Reference — phase → thao tác → chi tiết ở đâu

| Khi cần... | Đọc section | Chi tiết lệnh/template |
|---|---|---|
| Tạo story mới từ mô tả | CREATE | `~/.claude/bin/wakii-validate` (bước 9b) |
| Tạo sub-issues + nhánh đích + DAG | APPROVE | `references/cli-verified.md` |
| Viết context pack cho SF | Context packs | `references/context-packs.md` |
| Chạy 1 SF (full workflow run) | EXECUTE MODEL | — |
| Chạy launch prompt cho SF | LAUNCH SF | `references/sf-launch-prompt.md` |
| Merge SF / dọn worktree / CLOSE cleanup | CLOSE | `references/merge-playbook.md` |
| Tạo PR cuối story (push đích + gh pr create) | CLOSE bước 6 | `references/pr-playbook.md` |
| Chẩn đoán SF vàng/kẹt | Stall detection (OPERATE) | `references/story-watchdog.md` (automation) |
| Bất kỳ lệnh orca CLI nào | — | `references/cli-verified.md` (REQUIRED) |
| QA sweep / test toàn bộ sau nhiều fix | `references/qa-sweep.md` (5 lớp lỗi + hybrid fresh-boot) |
| Trước approve/launch/watchdog/merge | DEFENSIVE PATTERNS | `references/defensive-patterns.md` (REQUIRED) |
| Watchdog / self-check loop | STORY-WATCHDOG | `references/story-watchdog.md` |
| **Contract kết thúc story (PR + dọn sf worktree)** | **END-STATE CONTRACT** | section ngay dưới |

Naming (04/10 — user convention): **story dest = `story/{feature}` slash-form** (vd
`story/local4-kit-launch-safety`); **feature lẻ = `features/{slug}`**; default branch giữ
nguyên. **SF branch = `story/{feature}-sf-N` (dash, KHÔNG nest `story/{feature}/sf-N`** —
ref directory conflict: branch `story/x` chặn `story/x/sf-1` cùng kiểu `wakii-dev` chặn
`wakii-dev/*` trên remote 04/10); sf branch có thể local-only (không push). Worktree name
vẫn dash-form (`story-{feature}`) — orca fold `/`→`-`, tên worktree ≠ tên branch. Cấm
prefix `wakii-dev/` trên remote wakii-dev/wakii. (KHÔNG dùng legacy `story-base`.)

## END-STATE CONTRACT + rào vận hành (04/10 — học từ VU-32/LOCAL-4 chạy thật)

**Mọi coordinator brief PHẢI ghi rõ đích kết thúc. Không đích = coordinator dừng im ở prompt
(vụ LOCAL-4 04/10: nhận brief thiếu end-state → đứng yên cả giờ, không ai đôn thì không chạy).**

1. **Per-SF DONE** = code + tests xanh → story-verify sạch → coordinator merge sf-branch vào
   dest trong story worktree → **CLEANUP-ON-MERGE NGAY**: xoá sf worktree + sf branch (3
   guards). SF worktree không sống qua SF của nó.
2. **Story end** = convergence: final verify trên dest → push dest → `gh pr create --base
   "$(~/.claude/bin/wakii-validate --resolve-primary --repo .)"` → comment PR URL (Linear
   epic hoặc audit file) + worktree comment. **TẠO PR XONG CHƯA PHẢI XONG** — xác thực
   `gh pr view --json mergeable`: `CONFLICTING` → merge primary vào dest trong story
   worktree, phân xử theo doctrine (tool-layer rules ở section này), rehash kitHash +
   fingerprint, suite xanh, push → re-check `MERGEABLE` mới được STORY-COMPLETE. Vòng
   này lặp cho tới MERGEABLE — PR treo conflict = bàn giao dở (04/10: PR #127 treo
   conflict, user phải hối mới thấy). **STORY-COMPLETE = PR mở + MERGEABLE + sf
   worktrees SẠCH SẼN + chỉ còn story worktree.** KHÔNG merge PR (cửa người).
3. **Coordinator discipline**: vấp wall (kit defect, Linear) → workaround theo memory/recipe
   + TIẾN TIẾP; dừng chỉ khi thiếu quyền thật → report `BLOCKED: <đã thử gì> <cần gì>` — CẤM
   im lặng ở prompt chờ input.
4. **Worktree placement (sự cố 04/10 ×3)**: `--parent-worktree` đòi selector `path:<abs>` /
   `branch:<ref>` — bare name/path bị nuốt → SF worktree mồ côi (story-launch đã fix probe
   `branch:$DEST`); `orca worktree create` chạy từ cwd khác repo PHẢI `--repo id:<repoId>`;
   base ref có slash-prefix (`wakii-dev/...`) làm orca refresh fail → tạo branch local
   không-slash làm start point; driver portable: `--repo` chỉ nhận repo root (`.git` là FILE
   ở worktree → bị từ chối) — worktree có sẵn truyền qua `WAKII_DRIVER_WT=<path>`.
5. **Linear mutation bọc wrapper**: `~/.claude/bin/linear-rate-limit run --bin <tên> [--op
   <json>] -- orca linear status set ...` — fail khớp signature → tự note vào queue máy-level
   + exit 3 → bỏ qua, làm việc kế; retry chỉ sau khi `check` hết cooldown. CẤM gọi `orca
   linear` ghi trực tiếp (429 rơi qua sàng im lặng — policy skip+note+resume 20/09 giờ
   enforce ở tool).
6. **Local story (Linear unreachable)**: `story-launch --local` — gate Linear tắt
   (không cần linear ID), distributed claim tắt, worker báo Done qua evidence +
   worktree comment; còn lại flow nguyên vẹn (two-step acceptEdits spawn + lineage
   probe). Pack vẫn copy tay + BƯỚC-0 gate. (04/10 — trước đây phải create tay.)

## Team Model — PM + Developers + Tester (vai trò trong story)

Story vận hành như một team thật. Mỗi vai có trách nhiệm riêng, KHÔNG giao chéo:

```
PM (coordinator / story-workflow orchestrator)
├─ Quản lý backlog: bracket, SF scope, tier ordering, priorities
├─ Duyệt: bracket approval, user gates, scope changes
├─ Phối hợp: launch SFs theo DAG, resolve blockers, theo dõi tiến độ
└─ NOT code. NOT test. NOT design. Chỉ quyết định + điều phối.

Designer (designer agent — huashu-design skill 花叔Design)
├─ Nhận: SF spec phần visual (What + Figma + brand tokens)
├─ Làm: 3 hướng HTML draft → USER CHỌN (gate bắt buộc) → final direction
├─ Output: prototype HTML + hand-off spec (tokens/structure/behavior)
├─ NOT code production. NOT bỏ user-gate. NOT sửa code Dev
└─ Khi cần: SF có UI surface → PM dispatch TRƯỚC Dev (design-first)

Developer (task-executor / SF agent)
├─ Nhận: 1 SF với spec slice rõ (bracket + context pack + DESIGN nếu có)
├─ Làm: plan chi tiết SF → code → tests pass → commit atomic
├─ NOT tự ý mở scope. NOT quyết định kiến trúc (flag trong notes)
└─ Báo: DONE (commit+files+tests) / BLOCKED (symptom+tried+need)

Tester (verifier / code-reviewer / security-audit — độc lập với Dev)
├─ Nhận: diff/PR của SF sau khi Dev xong
├─ Kiểm: bugs, security, conventions, spec compliance + DESIGN fidelity
├─ Phán: APPROVED / CHANGES-REQUESTED / REJECT-AND-REVERT
└─ NOT fix code. Chỉ tìm lỗi — Dev mới fix.

Medic (story-medic — cấp cứu vận hành, KHÔNG đụng code)
├─ Nhận: watchdog verdict STALLED* / session chết giữa turn / 2 session cùng story
├─ Làm: chẩn đoán bằng chứng (story-resume --check) → absorb provenance → resume/rebind
├─ NOT quyết done-semantics (REQUIREMENT-GAP → USER). NOT xoá state. NOT sửa code
└─ Khi cần: PM dispatch NGAY khi stall detected — không gom chờ

Chia việc (PM làm lúc CREATE/APPROVE):
├─ Mỗi SF = 1 dev-ticket: đủ lớn để có ý nghĩa (8-15 tasks), đủ nhỏ để 1 agent
├─ SF visual-heavy → designer phase TRƯỚC dev phase (design-first flow)
├─ Tester ticket: convergence SF = QA phase riêng
└─ Nhánh đích story/<epic-id>-<slug> = integration branch — PM duyệt merge, không dev tự merge main
```

**Nguyên tắc tách bạch (why this matters):**
- Dev không tự duyệt code mình — tester độc lập mới bắt bug thật
- PM không code — quyết định khách quan, không bị sunk-cost vào implementation
- Tester không fix — tìm lỗi là việc khác với sửa lỗi
- Đây chính là cấu trúc agents đã có (task-executor xanh, code-reviewer xanh lam,
  verifier cam) — section này formal hóa cách nhìn chúng như MỘT TEAM.

**Crew theo phase (dispatch checklist — ai chạy khi nào):**

| Phase | MANDATORY | Tuỳ chọn / theo kích hoạt |
|---|---|---|
| 0 — Impact | `phase0-impact-analyst` (feature work; skip cho fix nhỏ) | |
| 2 — Spec | `spec-critic` (trước khi plan) | |
| 3 — Plan | `plan-critic` (plan ≥5 tasks / chạy song song) | |
| 4 — Execute | `task-executor` mỗi SF/task · `code-reviewer` giữa các task | `designer` TRƯỚC dev nếu SF có UI (design-first) · `security-audit` khi chạm auth/secret/input ngoài |
| 5 — Verify | `verifier` tại gate-resolve | `rollback-fixer` khi diverge / verify-fail ×2 cùng nguyên nhân |
| Mọi lúc | | `story-medic` khi watchdog `STALLED*` / 2 session cùng story / binding churn |

Quy tắc bảng: MANDATORY = bỏ qua là lỗ hổng quá trình (đã cắn thật); cột phải =
dispatch theo điều kiện ghi sẵn, không cần PM nhớ. Chi tiết từng vai: Team Model
ở trên + `kit/agents/*.md`.

# ⚠️ MINDSET SỐ 0 — BROWSER LÀ NƠI SF ĐƯỢC CHỨNG MINH (port từ orca-superpowers-workflow)

**Đây không phải rule để check — đây là cách Dev làm việc trong worktree SF.**
Gate 3 (`story-test` browser walkthrough) chỉ là LƯU ĐIỂM chốt; mindset này áp
từ dòng code UI đầu tiên:

- **SAI:** code → tests pass → nói agent "mở browser test" → coi như xong.
  Tests kiểm MẢNH RIÊNG — chỉ browser kiểm CHUỖI LIỀN MẠCH (bài học 30/8:
  auth 205/205 pass, reviewer approve, user KHÔNG ĐĂNG NHẬP ĐƯỢC).
- **ĐÚNG:** mở browser TRƯỚC khi code (nhìn hiện trạng + screenshot BEFORE)
  → làm → mở lại + AFTER → so cạnh nhau → mới nói "xong".

**Quy tắc tuyệt đối (giữ nguyên từ workflow thường):**
1. Screenshot > DOM query — ảnh thấy TOTAL, DOM chỉ từng mảnh; DOM query fail
   ≠ kết luận "không bug" (sai selector / chưa render / shadow DOM)
2. Tự nhìn > agent báo cáo; screenshot fail → nói thật + nhờ user nhìn giúp —
   KHÔNG lặng lẽ fallback sang DOM đo thay
3. Flow walkthrough (login → navigate → click → logout) là CHUẨN DUY NHẤT cho
   "xong" — chính là nội dung Gate 3, không phải thủ tục cuối cho có
4. CDP screenshot timeout (window không surface) → headless Chrome TRÊN CÙNG
   build vẫn được — pixel thật, tự Read ảnh; KHÔNG thay bằng DOM (FI-464)
5. CLI chỉ dùng cho: git, tests, servers, deploy — KHÔNG thay browser

Chi tiết 3 tầng nhận thức (DOM / screenshot / flow) + fallback đầy đủ: xem
`orca-superpowers-workflow/SKILL.md` — MINDSET SỐ 0.

## Operating principles (học từ FI-151 chạy thật — giữ nguyên, không pha trộn)

1. **Thiết kế cho việc mình sẽ sai.** Mọi giả định "chắc chắn rồi" là một bug chưa bộc lộ
   (`--description` vs `--body`, worker PATH, relation vs parent). Trước MỖI nhóm lệnh
   mới: dry-test 1 lệnh đại diện (2 phút) — bug rẻ nhất là bug chưa chạy vào thật.
2. **Làm cho sai lầm rẻ và observable.** Không xóa gì cả (Duplicate/Cancel + audit
   comment); mọi thay đổi Linear/git đều để lại vết; story .wakii là record duy nhất
   có thể remap. Hệ thống chịu được sai vì mọi thứ revert-able — đừng phá tính chất đó.
3. **Lắng nghe agents hơn dạy chúng.** Agents tự phát minh snapshot-merge, conflict
   resolution đúng tinh thần, tự flag bug của hệ thống (P6). Khi agent làm điều hợp lý
   ngoài protocol → CHÍNH THỨC HÓA vào skill (đó là protocol tốt hơn), không phạt.
4. **Giấy ≠ chạy được.** Mọi cú pháp lệnh trong skill đã verify bằng lệnh thật (xem
   Verified CLI). Lệnh mới bắt buộc verify trước khi dạy agent. Silent failure (exit 0,
   output rỗng) là dấu hiệu flag sai — luôn check `.ok` + output không rỗng.
5. **Idle ≠ chết.** Claude session ngừng commits 10 tiếng vẫn còn nguyên state (todo,
   context). Resume = input mới đánh thức, KHÔNG khởi lại từ đầu / không tạo worktree
   mới. Kiểm terminal status symbol trước khi kết luận "agent chết".

## Structure contract

```
STORY (epic Linear issue)
 ├─ SF-N nodes — one sub-issue each, organized in TIERS
 │    Tier 0 = foundation (no deps) → Tier N = convergence
 │    Depends on: SF-x edges define the vertical tier layout
 └story mindmap (repo): docs/superpowers/mindmaps/<slug>.wakii
```

## Story .wakii format (STRICT — the Story tab parser reads this)

Story file = `docs/superpowers/mindmaps/<slug>.wakii` — JSON schema v1
(`"wakiiMindmap": 1`). CREATE viết TRỰC TIẾP; gate bằng
`~/.claude/bin/wakii-validate <file>` (OK mới qua bước APPROVE):

```json
{
  "wakiiMindmap": 1,
  "meta": { "story": "MY-133", "generator": "story-workflow CREATE",
            "generatedAt": "<iso>", "dest": "story-my133-slug" },
  "nodes": [
    { "id": "epic", "kind": "epic", "title": "<story title>" },
    { "id": "sf-1", "kind": "sf", "title": "Types + Contract", "tier": 0,
      "summary": "What — behavior đầu-cuối demo được khi SF xong" },
    { "id": "sf-2", "kind": "sf", "title": "Adapter + Mock", "tier": 1 }
  ],
  "edges": [
    { "from": "epic", "to": "sf-1", "rel": "contains" },
    { "from": "epic", "to": "sf-2", "rel": "contains" },
    { "from": "sf-2", "to": "sf-1", "rel": "depends-on" }
  ]
}
```

Rules: meta bắt buộc `story`/`generator`/`generatedAt`; `meta.dest` = nhánh
đích dash-form (story-hub); optional `meta.worktreeModel: story-hub`.
Node bắt buộc `id`/`kind`/`title`; sf node thêm `tier` (dependency depth),
`linear` (bỏ trống lúc CREATE — APPROVE ghi ngược ID vào node), `summary`
(What — behavior ĐẦU-CUỐI demo được, KHÔNG file path/line — stale sau 1
refactor; `design: "mock-prototype"|"figma"` khi SF chạm UI). Deps = edges
`depends-on` (sf→sf); `Tasks:` cũ → task nodes (`contains`). Cycle/tier lệch
deps → wakii-validate FAIL/WARN. Field ownership: structure/knowledge = người
sửa tay; state/evidence/generatedAt = machine (`story-mindmap --update-state`).
Schema + luật validate đầy đủ: header `~/.claude/bin/wakii-validate` +
spec `docs/superpowers/specs/2026-09-27-mindmap-wakii-viewer-design.md` §3.

**Legacy bracket fallback (story CHƯA migrate — VI-1 đang chạy):** consumer
đọc thêm `docs/superpowers/brackets/*.md` theo format dưới — story MỚI KHÔNG
tạo bracket nữa, bootstrap (`story-mindmap --bootstrap`) chỉ dùng 1 lần để
migrate story cũ:

```markdown
# Story: MY-133 — <title>

## SF-1 Types + Contract
Tier: 0
linear: MY-144
What: shared carrier types + BE contract
Depends on: —
Tasks: response-types / payload-types / enums

## SF-2 Adapter + Mock
Tier: 1
linear: MY-146
Design: mock-prototype
What: ahamoveContract interface + mock per Figma
Depends on: SF-1
Tasks: interface / mock / real-stub
```

Rules: header line `# Story: <ID> — <title>` followed by optional line
`Destination: story[-/]<epic-id>-<slug>` (nhánh đích — story-hub dash
`story-<epic-id>-<slug>`, legacy slash `story/<epic-id>-<slug>`; approve dùng
để tạo đúng tên). Each SF = `## SF-N <name>` followed by fields `Tier:`, `linear:`
(empty until sub-issues exist), `Design:` (`mock-prototype` nếu SF chạm UI
mà hướng thiết kế CHƯA có source of truth; `figma` nếu story có Figma 1:1 —
Figma là design đã duyệt, không cần 3-hướng, implement theo P8; `none` hoặc
bỏ trống nếu không chạm UI),
`What:`, `Depends on:`, `Tasks:`
(slash-separated). Tier = dependency depth (explicit, or derived from deps).
`What:`/`Tasks:` ghi theo BEHAVIOR/scope — KHÔNG ghi file path hay line number
(nhanh stale: bracket sống cả epic, path chết sau 1 refactor). Ngoại lệ: snippet
từ prototype mã hóa decision sắc hơn prose (schema, state machine, type shape)
→ inline, trim chỉ phần có decision, ghi rõ nguồn prototype
(learned 2026-09-03, mattpocock/to-spec).
`What:` = behavior ĐẦU-CUỐI demo được khi SF xong (như người dùng thấy), không
phải danh sách layer/kiến trúc — "what can I demo when this is done?" không trả
lời được = horizontal slice (learned 2026-09-03, mattpocock/to-tickets).

## Phase flow

### CREATE (from user description)
**Verify-first rule:** bất kỳ nhóm lệnh CLI nào chưa từng chạy trong story này →
dry-test 1 lệnh đại diện với output thật trước khi loạt chạy (bài học: batch đầu
fail thầm lặng vì flag sai, exit 0 + output rỗng).
Run the full-strictness epic pipeline:
1. **IDEA-BRIEF** (embedded — KHÔNG dùng prompt-master: skill đó viết prompt
   cho AI tools, tự từ chối activate với coding work) — điền 8 chiều từ mô tả
   thô của user, ghi ở đầu epic spec:
   - **Task** — verb mơ hồ → thao tác cụ thể ("quản lý" → CRUD + in phiếu gì?)
   - **Output** — sản phẩm nhìn thấy được (app/page/service, platform nào?)
   - **Users** — ai dùng, bối cảnh, trình độ
   - **Constraints** — MUST / MUST-NOT, scope boundary
   - **Input** — user cung cấp gì (Figma? data? code có sẵn?)
   - **Context** — project state, quyết định đã có trong session
   - **Success criteria** — biết khi nào xong, binary khi được
   - **Out-of-scope** — cái gì rõ ràng KHÔNG làm
   Thiếu chiều critical (Task/Output/Constraints/Success) → gom vào lượt
   clarifying questions của bước 6, KHÔNG hỏi riêng 2 lần.
   (learned 2026-08-28 FI-187-review: bước 1 từng trỏ prompt-master sai
   purpose — tool không activate, bước refine thực tế trống)
2. `phase0-impact-analyst` MANDATORY — all 10 dimensions (P4). TRƯỚC khi
   dispatch: **prior-art probe** — 2–3 câu `orca search` trên module sẽ đụng
   (vd `orca search "computeKitHash" --sort newest --limit 20`, `--since`
   1–2 tháng), hit có ích nạp vào context pack — trí nhớ tổ chức thay cho
   "tưởng mình nhớ" (bài học kit-clobber ×2: 1 query "computeKitHash" hồi
   21/09 đã vươn lên đủ session của 19–20/09)
3. Figma URLs → Principle 8 (read at Phase 0, get_design_context + diff vs
   codebase) — **capture TẤT CẢ frames spec nhắc vào
   `docs/superpowers/figma/<story-slug>/` (md+png+json theo frame-id,
   idempotent — xem P8 Capture storage) và commit CÙNG story CREATE** để mọi
   SF kế thừa qua git, không phụ thuộc /tmp hay session nào sống
4. Read source code before proposing SFs (Prime Directive — touch map from real code)
5. Split SFs with rubric C1-C5/V1-V3 (own outcome? overlapping touch map? interface pinned?)
   **SF-scope policy (học từ FI-169 — SF quá nhỏ lặp overhead):**
   - Mục tiêu mỗi SF: **8-15 tasks, 1 nhóm component/liên quan hoàn chỉnh**
     (vd: "About+Skills" rồi "Projects+CV" là 2 SF đúng; "Nav" riêng lẻ 1 component
     là QUÁ NHỎ — gộp với section kế nếu cùng loại việc).
   - **Chống duplicate tasks GIỮA các SF**: pattern lặp (vd reveal-io-port,
     tilt-port, probe-subset, i18n keys) xuất hiện ở ≥2 SF → tách thành shared
     work của SF nền (tier 0) HOẶC gộp các SF đó thành một. Kiểm tra bằng:
     liệt kê tasks mọi SF → trùng pattern ≥2 lần → restructure.
   - Heuristic: nếu 2 SF có ≥50% tasks cùng loại (port/verify/tilt/reveal) →
     gộp. SF < 6 tasks → gộp với SF gần nhất cùng touch-type.
   - Merge-to-parent/probe là tasks Zweck của MỖI SF (không tính duplicate).
   **Tier-gate rule (bài học HR-1/__portfolio3d):** gate/verify của SF tier N
   CHỈ được test những gì tier N tự cung cấp. Cross-SF behavior (module tier 0
   chỉ hoạt động khi tier 1 import; listener của SF khác) → dồn vào
   convergence SF (tier cuối). Gate tier 0 test end-to-end thứ dépend tier sau
   = fail giả, đội delay debugging.
   **Phased-release rule (story lớn — release từng phần, học FI-380 1.4.204
   chứa nửa feature):**
   - Story đủ lớn (≥2 tiers HOẶC ≥5 SF HOẶC ước tính >3 ngày) → chia PHASE
     theo tier: mỗi phase = nhóm tier hoàn chỉnh, **SHIPPABLE độc lập** (build
     xanh, không đứt tính năng đang có).
   - Mỗi phase COMPLETE (mọi SF tier đó merged vào đích + story-verify sạch
     toàn phase) → **RELEASE CHECKPOINT**: cut release/ship TRƯỚC khi launch
     tier kế. Cấm big-bang release cuối story — user chờ lâu, bug tích tụ
     nhiều phase mới lộ (1.4.204 ship icon trắng + kit nửa cho tới 1.4.205).
   - .wakii: ghi phase ở `summary` của sf node đầu tier (vd "Phase 1/2 —
     shippable: X") — text tự do (schema node mở).
   - Tier không shippable độc lập (chỉ có nghĩa khi tier sau xong) → gộp vào
     phase sau. Watchdog --launch-next cần người duyệt phase-gate nếu đặt
     RELEASE_GATE=1 (env, mặc định off).
   - **Mỗi phase checkpoint gồm 1 vòng security-audit** (OWASP surface +
     repo-hygiene pass trong agent def: secrets/.env trong diff, exec-bit mới,
     permissions, lockfile-deps) — phase không checkpoint nếu audit còn P0/P1
     (học FI-458: 3 lần exec-bit + .env lọt). Lớp secrets TRƯỚC commit vẫn là
     story-diff-review (gate per-task) — checkpoint là lớp thứ 2, không thay thế.
6. `superpowers:brainstorming` MANDATORY + every clarifying question:
   - **Facts vs decisions** (learned 2026-09-03, mattpocock/grilling): cái mà
     code/repo/Linear trả lời được = FACT → tự tra (read code, dispatch subagent),
     KHÔNG hỏi user. Chỉ DECISIONS thật sự (chọn hướng, trade-off, scope) mới tới
     user. Hỏi cái fact trả lời được = lãng phí lượt clarifying.
   - **Non-blocking facts** (learned 2026-09-03, mattpocock/grilling vòng 2):
     subagent đang tra fact = prerequisite CHƯA chốt → CHỈ câu hỏi downstream
     của fact đó phải chờ; hỏi NGAY phần còn lại của lượt, đừng chặn cả lượt
     chờ 1 subagent.
   - **Format ➡️ recommendation**: mỗi clarifying question đánh số + kèm ĐÁP ÁN
     ĐỀ XUẤT của agent trên dòng riêng (`➡️ đề xuất: ...`) — user trả lời cả lượt
     bằng số ("1 A, 2 không vì X"). Buộc agent có ý kiến thay vì hỏi trả nợ.
   - Hỏi theo **frontier** (mattpocock/grilling): frontier = những câu có thể hỏi
     NGAY không cần đoán đáp án chưa nghe. Hỏi cả frontier mỗi lượt; câu phụ
     thuộc câu chưa trả lời → lượt sau. Hết khi frontier rỗng — không còn gì
     được giả định lặng lẽ.
7. `spec-critic` gate → revise → 8. `plan-critic` gate
9. Write the story .wakii FILE (format above; `linear` empty/omit for all SFs
   at this stage; `meta.dest` = the story-branch name)
   9b. TOOL GATE: chạy `~/.claude/bin/wakii-validate <file.wakii>` — phải
   OK (không FAIL) mới qua bước 10. FAIL → sửa .wakii rồi chạy lại.
10. Create the EPIC Linear issue (In Progress). Do NOT create sub-issues yet.
11. Print `STORY-READY: <ISSUE> — story .wakii: <path>` → STOP. Await user approval.

### APPROVE (user says "approve story" / duyệt)
**Story worktree = worktree coordinator (story-hub):** tạo TRƯỚC khi launch SF
đầu — mọi SF worktree sau đó là CON lineage của nó (`story-launch` tự gắn
`--parent-worktree` khi thấy cha tồn tại). Lệnh: khối "Create the STORY WORKTREE"
bên dưới — coordinator terminal sống NGAY trong story worktree (checkout nhánh
đích): aggregate, duyệt gate, merge SF thật về đích. 1 story = 1 cây lineage = 1
coordinator (ONE COORDINATOR PER STORY — xem OPERATE). (Story legacy
`Worktree model: legacy` giữ pattern cũ: worktree cha `<dest-slug>-coordinator`
kit ≥2.16.7 — xem `git log` section này.)

**Idempotency first:** read the story .wakii — any sf node already carrying
`linear: <ID>` is DONE (skip creating; verify the issue exists and is active,
else recreate). Only create sub-issues for sf nodes with empty `linear`. A
second APPROVE must be a no-op, never a duplicate batch.
**Command guard (facts độc lập — không suy từ 1 flag):** mỗi CLI call kiểm 3 lớp
riêng: (a) exit code, (b) `.ok` trong JSON (nếu parse được), (c) HIỆU ỨNG mong đợi
tồn tại (read-back: list/show). Lớng bất kỳ mâu thuẫn — exit 0 + parse-fail → lệnh
CÓ THỂ đã chạy (read-back trước khi retry, không retry mù); `.ok true` + hiệu ứng
vắng → coi như fail. (Wrong flags fail SILENTLY: `--body` not `--description`.)
For each SF in tier order:
```bash
# Verified syntax: linear create takes --parent directly (one step).
# Do NOT use "relation add --parent" — that command only makes blocks/blocked-by/
# related/duplicate edges, not parent-child.
ISSUE=$(orca linear create \
  --title "[SF-N] <name> — <story title>" \
  --team <team> \
  --parent <EPIC-ID> \
  --label Feature \
  --priority <urgent|high|medium theo complexity> \
  --estimate <task count / 3, round up> \
  --body "Tier: N
Depends on: SF-x
Story: docs/superpowers/mindmaps/<file>.wakii
What: <What>
Tasks: <Tasks>" \
  --json | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['issue']['identifier'])")
# Verified flags: --body (NOT --description), --parent, --label, --priority,
# --estimate. New issues land in Backlog — set --state Todo after create
# (or via save-issue) so they're visible as ready work.
```
Then write `linear: <ID>` back into each sf node in the .wakii.
Create the STORY WORKTREE (story-hub model — spec story-worktree-hub):
```bash
# exit 1 = PRIMARY-UNRESOLVED → DỪNG + hỏi user primary branch — KHÔNG dùng
# chuỗi PRIMARY-UNRESOLVED làm tên branch (guard bắt exit trước khi tạo worktree)
PRIMARY=$(~/.claude/bin/wakii-validate --resolve-primary --repo .) || {
  echo "PRIMARY-UNRESOLVED — DỪNG, hỏi user primary branch (thang 6 bậc spec story-worktree-hub)"; exit 1; }
orca worktree create --name story-<epic-id>-<slug> --base-branch "$PRIMARY" --agent claude
```
Chú thích: orca sanitizeWorktreeName fold `/`→`-` — story-hub dest = dash-form;
legacy story vẫn slash-form (`story/<epic-id>-<slug>`).
Nhánh đích sinh ra trong story worktree — coordinator session LÀM VIỆC TRONG
ĐÓ suốt story. Ghi `meta.worktreeModel: "story-hub"` vào .wakii
(wakii-validate check); primary KHÔNG ghi file — resolve runtime khi cần bằng
`~/.claude/bin/wakii-validate --resolve-primary --repo .`. SF worktrees fork
từ nhánh đích như cũ.
Create the orchestration DAG mirroring tiers:
```bash
RUN=$(orca orchestration run-create --objective "<EPIC>: <title>" --json | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['run']['id'])")
# task-create per SF with --deps chaining per .wakii depends-on edges
```
Audit-log the phase transition on the epic (comment: SFs → issue IDs, tiers).

### Context packs (per SF — analyze-once materialized thành files)
Mỗi SF có MỘT context pack: `docs/superpowers/contexts/sf-<n>.md`, viết lúc
CREATE (sau spec-critic, trước .wakii), nằm trong repo chính để mọi SF
worktree thấy sau khi fork. Đây là cách "analyze once, inherit many" trở thành
vật thể — SF agent đọc file này THAY VÌ tự tổng hợp từ story .wakii + epic + comments.
**REQUIRED — format 4 sections STRICT (Spec slice / Touch map / ACCEPTANCE
user-visible / Boundary):** `references/context-packs.md`. ACCEPTANCE là thứ
verifier Phase 5 kiểm — KHÔNG chỉ process-pass.

### EXECUTE MODEL (core decision)
**Every SF runs as a FULL `orca-superpowers-workflow` run** — not a stripped
executor. The workflow already owns everything an SF needs: tier co-giãn
(Standard for small SFs, Full for big ones), task decomposition (Phase 3),
task-executor agents (Phase 4), gates, code-reviewer/verifier, rollback
ritual, loop caps with coordinator enforcement, Linear audit per phase.
Do NOT build a parallel protocol here — inherit it.

What "inherit, don't re-analyze" means per phase inside an SF run:
- **Phase 0-2 (mini)**: read story .wakii + context pack (spec slice + touch map +
  ACCEPTANCE) for this SF. All clarifying questions were already answered at
  epic CREATE — do NOT ask the user again, do NOT guess.
  **Câu hỏi mới thật sự (REQUIREMENT-GAP protocol):** context pack + story
  .wakii + code đều không trả lời được → probe TRƯỚC khi block (learned 2026-09-03
  aihero/handoff fork case): câu kỹ thuật 1 probe 10' giải được (đọc sâu hơn,
  chạy thử, dispatch agent phụ) → probe, KHÔNG GAP. GAP chỉ cho thứ probe
  không giải được → KHÔNG đoán, KHÔNG hỏi user trực tiếp qua
  terminal. Post comment lên EPIC issue (format learned 2026-09-03
  aihero/to-questionnaire — SF chạy đêm = async, user có MỘT lượt trả lời):
  `REQUIREMENT-GAP: <câu hỏi> — SF-N blocked ở <gì / task nào>`
  Nhiều gap → BATCH THÀNH 1 comment, quan-trọng-nhất-trước (nếu user chỉ
  trả lời được phần đầu thì phần đó gỡ block tier sau); 1 ý / câu hỏi,
  không compound; câu dễ hiểu nhầm thêm 1 dòng why-this-matters; ghi rõ
  **"trả lời 'không biết' OK"** — guess tự tin của user = false premise
  cho cả tier sau.
  (verified syntax: `orca linear comment add --id <EPIC-ID> --body-file -`).
  Tiếp tục làm phần KHÔNG blocked; blocked hoàn toàn → dừng sạch (watchdog sẽ
  thấy stall và escalate). User/coordinator trả lời bằng comment
  `GAP-ANSWER: <câu hỏi ngắn>: <đáp>` trên EPIC — mọi SF thấy (Linear là
  transport chung, không terminal nào giữ độc quyền đáp án), rồi resume SF
  (resume prompt nhắc đọc GAP-ANSWER mới). Epic comments = registry gaps sống.
- **Phase 3**: decompose THIS SF's `Tasks:` list into a detailed plan
  (steps/files/acceptance per task). This is where SF-1's 14 tasks become
  structured, gated work — no ad-hoc grinding.
- **PLAN FILE TICKING (bắt buộc — panel progress đọc từ đây):** sau MỖI task
  hoàn thành, update plan file: `- [ ]` → `- [x]` cho steps đã xong (sed hoặc
  edit), COMMIT nhỏ hoặc để vào commit task. Không dùng todo-list nội bộ làm
  progress duy nhất — bracket panel hiển thị % từ checkbox; agent không tick
  → node hiện 0% mãi dù đang chạy (bài học SF-8: 0/53 trong khi agent làm
  việc thật).
  Checkbox CHỈ cho task steps — KHÔNG dùng `- [ ]` cho các mục meta kiểu
  "complete-run checklist / quy trình chạy" trong plan: story-verify B2 đếm
  MỌI dòng `^- \[ \]` và đòi 0 open, mà mục "chạy verify"/"set Done" chỉ xong
  SAU verify sạch → vòng luẩn quẩn ép tick dối (learned 2026-08-28 FI-191
  review #2 P1). Meta-steps → plain numbered list, trạng thái chạy ghi Linear
  comments.
- **Phase 4-5**: normal workflow execution → sub-issue Done.
- **Post-Done merge**: the SF run ENDS by merging its worktree branch into its
  PARENT branch (the `--base-branch` it forked from — usually nhánh đích
  `story/<epic-id>-<slug>`; a nested SF merges into its parent SF) + posting the merge hash to the
  sub-issue. A run that stops at "Done" WITHOUT merging its parent is
  INCOMPLETE — dependent tiers fork from the parent and must see this code.

### 5 GATES PER SF (tool-enforced — Rule 0)
```
1. story-preflight    → trước code (đúng branch, server, DB)
2. story-diff-review  → trước commit (debug code, secrets, scope)
3. story-test         → trước "xong" (browser walkthrough, Rule 0; SF pure CLI không có web port → proxy: test suite exit 0 + sandbox demo chạy script installed thật + evidence logs + marker ghi chú CLI-equivalent — learned 2026-09-14 FI-460)
4. story-snapshot-env → trước/sau merge
5. story-post-merge   → sau merge (tests + browser + agents)
```
Agent PHẢI chạy từng gate theo thứ tự. Gate FAIL = KHÔNG TIẾP TỤC.

### SF-COMPLETE mini-ritual (5 phút, PM chạy khi story-verify báo 1 SF COMPLETE)
Patterns tươi nhất ở lúc SF vừa đóng — chờ đến story-end là nhớ đã mờ
(sf-3 đóng 28/8 với 2 pattern hay: cross-SF warning + review-sớm, lẽ ra
phải nắm ngay). 3 câu:
1. SF này sinh pattern/quy tắc gì chưa có trong kit?
2. Skill/CLI nào là đích nhỏ nhất chứa được?
3. Patch ngay được < 10' → patch + sync-from-local + note learned-date.
   Không → improvements-log, đừng scatter.
Kết thúc bằng 1 dòng: `MINI-RITUAL SF-N: N patterns → file(s) updated / no-new-patterns (trung thực)`.

### LAUNCH SF (per node) — idempotent, resume-aware
One worktree per SF — isolation + parallelism. Tier-N SFs launch together
(up to the parallel cap); the Orca DAG blocks lower tiers until deps are Done.

**Relay mặc định (pull-based) — KHÔNG launch tay từng node:** worker xong SF tự
kích hoạt `story-watchdog --launch-next` (COMPLETE-RUN CHECKLIST bước 7);
`story-coordinator-pass` 30' là an toàn ròng khi relay trượt. Coordinator CHỈ
launch tay khi: (a) SF dính DESIGN GATE (mock-prototype — phải xong user-chọn +
hand-off), (b) destination-freshness guard cần phán (đích đang chứa merges),
(c) launch-next SKIP/fail-closed và cần gỡ thủ công. **Rule pre-clear:** trước
khi rời tier, coordinator xử hết design gate của tier — SF đã clear thì relay
tự chạy (bài học FI-187: rule chỉ nằm trong doc thì không ai thực thi; giờ relay
là cơ chế, doc mô tả đúng cơ chế).

**Destination-freshness (story-hub — hết branch -f surgery):** primary (resolve
qua `wakii-validate --resolve-primary`) tiến trong lúc story chạy → merge vào nhánh đích ĐỊNH KỲ trong
story worktree, merge thường KHÔNG rebase — lệnh: section "Merge primary vào
dest" trong `references/merge-playbook.md`; BẮT BUỘC 1 lần trước khi tạo PR.
KHÔNG BAO GIỜ `git branch -f` lên nhánh đích — kể cả dạng "an toàn có guard"
(sự cố thật 21:57 tối 28/8: branch -f không guard khi đích đang chứa SF merges
— đè mất 2 merges; learn FI-187: nhánh đích stale @CREATE làm tier-1 fork mất
linear IDs + ACCEPTANCE backfills — giờ giải bằng merge định kỳ, không surgery).

**Design gate TRƯỚC dev (khi sf node ghi `design: "mock-prototype"`;
`design: "figma"` → bỏ qua gate này — Figma là direction đã duyệt, implement
per P8):** KHÔNG
launch dev ngay. Trước tiên chạy designer phase cho SF đó — designer agent /
mock-prototype skill: 3 hướng HTML → artifacts links → USER CHỌN (gate bắt
buộc) → hand-off `docs/superpowers/designs/<sf-slug>-direction.md` (tokens/
structure/behavior). RỒI mới launch dev, prompt trỏ rõ hand-off file.
(learned 2026-08-28 FI-187-review: qua 3 stories designer 0 lần được trigger —
"SF visual-heavy → design-first" chỉ là mô tả trong Team Model, không ai
thực thi. Giờ là trường sf `design` bắt buộc + bước launch — bỏ qua = launch sai.)

**Before creating, CHECK existing state (launch must be idempotent):**
- No worktree + issue Todo/Backlog → fresh launch (below).
- Worktree EXISTS + issue In Progress + "stale" (no commits for hours) → **CHECK
  BEFORE ASSUMING DEAD** (bài học FI-151: 4/4 "chết" thực ra 2 idle-sống, 2 tự chạy):
  `terminal list` — symbols: ⠂ = running (để yên), ✳ = idle/có thể cần đánh thức.
  An idle Claude session GIỮ NGUYÊN todo-list + context — resume = gửi input mới:
  sendText vào terminal đó (nếu còn handle) hoặc `terminal create --command claude`
  trong worktree, prompt:
  "Resume SF-N run: read the LAST audit comment on <SF-ISSUE> (phase + task +
  merge state) + `git log <parent>..HEAD` — continue from exactly there. Do NOT
  redo completed tasks."
- Worktree exists + issue Done → nothing to do (verify merge, mark task completed).
- Never `worktree create` twice for the same SF — that forks stale bases.
- **Caution khi sendText vào terminal Claude-idle:** input đi vào MESSAGE QUEUE của
  Claude, không phải shell. Gửi shell commands (which/echo) sẽ thành prompt nonsense
  cho agent. Chỉ gửi resume-prompt; kiểm `terminal read` tail trước — ❯ trống +
  todo list hiển thị = session sống chờ input.
- Khi cần user/tester xem nhanh WIP trong worktree SF (review trước commit/merge):
  `orca file open-changed --mode diff --worktree name:sf-<n>` — CHỈ hiện changes
  chưa commit/untracked; worktree đã commit = trống (diff committed-but-unmerged:
  `git diff <parent>..HEAD`). Syntax: `references/cli-verified.md`.
```bash
orca worktree create --name sf-<n>-<slug> --linear-issue <SF-ISSUE> \
  --base-branch story-<epic-id>-<slug> \
  --agent claude --prompt "<SF prompt>" --no-parent --json
```
(`--base-branch` = nhánh đích từ .wakii `meta.dest` — story-hub dash-form
`story-<epic-id>-<slug>`; story legacy slash-form `story/<epic-id>-<slug>`.)
SF prompt (the WHOLE handoff — everything else lives in story .wakii + Linear):
**REQUIRED — dùng nguyên văn template trong
`references/sf-launch-prompt.md`.** Bất biến không được rút gọn khi gửi:
(1) merge về nhánh đích là MỘT PHẦN của DONE — Linear Done trước merge = run
INCOMPLETE; (2) Rule 0 browser verify 3 tầng (DOM/VISUAL/FLOW — không tự kết
luận khi chưa thấy); (3) tester review độc lập (code-reviewer) trước merge;
(4) gate `~/.claude/bin/story-verify <sf>` sạch TRƯỚC khi set Done.
(Optional: đính memory patterns qua `story-memory inject` — xem reference.)

In-session fast path (small SFs, interactive): dispatch the `task-executor`
agent (green) with the same prompt content — it runs the workflow loop for
one SF and reports DONE/BLOCKED.

### Story destination branch (merge topology)
- **Nhánh đích là branch DUY NHẤT của story: `story-<epic-id>-<slug>`
  (story-hub dash-form — form thật trên git, orca fold `/`→`-`).** Story legacy
  dùng slash-form `story/<epic-id>-<slug>`; (tên legacy `story-base` trong các
  run FI cũ — KHÔNG dùng lại.)
- APPROVE creates the STORY WORKTREE with nhánh đích `story-<epic-id>-<slug>`
  (story-hub; legacy slash-form) fork từ primary (`wakii-validate
  --resolve-primary`) BEFORE any SF starts.
- Every SF worktree forks from nhánh đích (not primary).
- SF merges back to its PARENT branch on completion (nhánh đích normally;
  nested SF → its parent SF). See CLOSE — parent-merge rule.
- Tier boundaries = merge points: a tier-N SF's base includes all merged
  tier-(N-1) work.
- **Branch ownership (THỐNG NHẤT — nhánh đích riêng mỗi story):** mỗi story
  có MỘT nhánh đích riêng: `story-<epic-id>-<slug>` dash-form (vd
  `story-fi151-3d-redesign`; legacy slash `story/<epic-id>-<slug>`)
  — sinh ra trong story worktree lúc APPROVE, fork từ primary (resolve qua
  `wakii-validate --resolve-primary`). Mọi SF fork từ nó và merge về nó; nó là "main của story". Khi
  story hoàn thành: code hoàn chỉnh nằm TRÊN NHÁNH ĐÍCH và agents KHÔNG TỰ
  merge vào primary. **PR được agent tạo (gh CLI — 1 PR/story, dest → primary,
  xem `references/pr-playbook.md`) nhưng MERGE PR là quyền của NGƯỜI** (human
  gate cuối trên GitHub/Source Control panel — merge primary vào dest là việc
  coordinator trong story worktree, không phải merge-thay-người). Agents/
  watchdog chỉ: đưa nhánh đích tới trạng thái sạch + verify + tạo PR (nếu đủ
  điều kiện) + báo STORY-COMPLETE. Sau khi NGƯỜI merge PR: story-level cleanup
  xoá story worktree + nhánh đích (merge-playbook "Story-level cleanup").

### OPERATE (progress)

**⚠️ ONE COORDINATOR PER STORY (user directive 2026-09-19):** story đã có
coordinator terminal đang chạy → **TẬN DỤNG terminal đó, TUYỆT ĐỐI KHÔNG mở
coordinator mới cho cùng story**. Người đến sau = attach: quan sát, hỏi trạng
thái, handover có chủ đích — không dispatch thêm, không rã inbox song song.
Worker (executor) vẫn chạy song song nếu boundary tách bạch. (19/09: 2
coordinator cùng đụng SF-4 → worker bị stop mid-flight; chiều: 3 agent song
song do 2 bên cùng điều phối LOCAL-1.)

**Coordinator dedupe (tránh lặp không cần thiết):** cùng lệnh + cùng signal →
nhắc kết quả cũ thay vì quét lại (DSH pattern như task-executor); một thông tin
nằm ở MỘT nơi (inbox/evidence/Linear) — không sao chép sang layer khác; trước
khi dispatch/chạy gì, kiểm ai đang giữ việc đó (ownership probe — SF-3 LOCAL-1).

- Each SF's workflow run updates its sub-issue state via Bridge 5 — states đọc
  bằng `story-status` / `story-top` / Linear trực tiếp.
- Plugin ≥1.7.0 là HEADLESS: panel story.request/story.snapshot handshake ĐÃ XOÁ
  (cùng các poller consumer). Worker báo tiến độ qua orchestration messages —
  coordinator đọc bằng `inbox` / `check --wait`; không còn poll 3s/15s, không
  cần "Story List ⌘J" sau restart.
- An SF blocked at an async user gate (e.g. SF-6's user-review-gate) blocks
  ONLY itself; siblings keep running. The node stays yellow with the gate pending.
- Blocked/failed SF → node red; downstream tiers visibly wait. Escalate per
  the workflow's loop caps (task-retry 3, verify-fail 2 same-cause).
- **Worktree comment (human visibility — learned 2026-09-03):** tại các mốc SF
  (launch / GAP blocked / merged về đích), set comment trên worktree SF —
  `orca worktree set --worktree name:<sf> --comment "..."` — user thấy NGAY
  sidebar Orca không cần mở Linear. Comment chỉ ghi đè được, không xóa
  (syntax + gotcha: `references/cli-verified.md`).

### CLOSE (merge về nhánh chính — quy trình bắt buộc)
Khi MỖI SF hoàn thành workflow run (sub-issue Done), TUYỆT ĐỐI KHÔNG kết thúc
ở worktree SF — phải hợp nhất về nhánh đích NGAY để tier sau thấy code:
**Phase checkpoint:** story theo Phased-release rule → sau khi MỌI SF của
một tier merged + story-verify sạch → RELEASE checkpoint tier đó trước khi
launch tier kế (xem Phased-release rule ở CREATE).

**Mirror-back bắt buộc trước CLOSE** (learned 2026-09-10 FI-380): story nào
đụng vendored assets (orca `resources/plugins/**`, kit/) — port ngược mọi
thay đổi về lineage source (launcher/story-team-kit) TRƯỚC khi CLOSE, kể cả
thay đổi của session khác tích lũy ở vendored. Vendored đi trước lineage =
bundle sau này hạ cấp mất fixes.

**Merge target = PARENT branch (quy tắc tổng):** mỗi nhánh merge về đúng
nhánh nó được fork từ đó trong cây topology — không hardcode đích/main:

```
<primary>
 └─ story/<epic>-<slug>   (NHÁNH ĐÍCH — fork từ primary lúc APPROVE; checkout
     │                      của STORY WORKTREE — coordinator sống đây, merge thật)
     ├─ sf-1             (lineage CON; git fork từ đích → merge về đích)
     ├─ sf-2..sf-7       (như trên — 1 story = 1 cây lineage)
     └─ sf-nested        (SF con fork từ SF cha → merge về SF cha)
đích ──▶ <primary>       (1 PR/story — NGƯỜI merge PR; agents không merge primary)
```

Ngoại lệ đa máy: worktree trên host KHÁC không thể là con lineage
(same repo+host+project) — máy remote tham gia qua claim protocol (FI-458),
ngang hàng chứ không phải con.

Xác định parent khi launch: `--base-branch <X>` đã dùng = merge target.
Ghi rõ parent vào orchestration task spec để agent SF không đoán.

**Per-SF merge / snapshot merge / CLEANUP-ON-MERGE — REQUIRED:
`references/merge-playbook.md`** (story-hub protocol). Tóm tắt bất biến:
- Per-SF merge (story-hub): coordinator merge sf-branch THẬT trong story
  worktree + push dest (xem merge-playbook — story-hub). Executor không đụng
  nhánh đích; merge commit không thể kéo dest LÙI — hết ref surgery + ancestor
  guards (class lỗi "ghi đè mất 6 SF merges thật" FI-151/191 biến mất cùng
  protocol).
- Snapshot merge mid-run cho SF nhiều tasks — KHÔNG đánh dấu task completed.
- Merge cuối xong → comment hash lên sub-issue → `task-update --status completed`
  → DAG mở khóa tier sau.
- CLEANUP-ON-MERGE: SF merged xong → XÓA worktree + branch NGAY, 3 guards pass
  trước khi xóa; conflict improvements-log → giữ CẢ HAI entries.

**Stall detection (OPERATE) — chẩn đoán 3 tầng, KHÔNG kết luận vội:**
SF In Progress + node vàng mãi →
1. `git log` trong worktree SF — có commit mới không? (có = agent đang chạy, chỉ chậm)
2. `terminal list` — symbol ⠂ (running) hay ✳ (idle)?
3. Chỉ khi cả hai tĩnh hoàn toàn → RESUME (ở LAUNCH).
Bài học FI-151: 4 SF tưởng "chết qua đêm" — 2 đang tự chạy, 2 idle-sống;
0 cái thật sự chết. Kết luận sai → tạo worktree trùng / khởi lại mất state.
Ánh xạ từ vựng fence Orca: RUNNING/BUSY = `live` · STALLED* = `unverifiable`
(khoanh vùng + probe thêm, KHÔNG tuyên bố chết) · `exited` chỉ khi host
chứng minh (tail error + exit code). Map STALLED → redo tự động là lỗi cấm.
CASE PHỤ (SF-5 thực tế): commits mới + terminal ✳ idle + issue In Progress →
agent có thể VỪA xong code chưa kịp merge/Done. Chờ 1 vòng check kế tiếp;
nếu unchanged → gửi resume prompt (agent tự xác nhận xong và chạy checklist
merge + Done).
Sau một đêm chạy: KIỂM TRA TOÀN BỘ SF In Progress theo 3 tầng trên trước khi đụng gì.
(Tự động hóa việc này: STORY-WATCHDOG bên dưới chạy vòng check này định kỳ.)

**Story CLOSE (một lần, khi tất cả SF Done) — DỪNG Ở NHÁNH ĐÍCH:**
Agents KHÔNG merge vào primary — push dest + PR để NGƯỜI merge. CLOSE của agent:

1. Convergence SF (tier cuối) merge về nhánh đích xong.
2. **Final verify TRÊN NHÁNH ĐÍCH**: smoke + tests + build + visual check
   (serve nhánh đích — như xem 3D trên :8010 — người xác nhận). **Visual
   sign-off qua Orca browser (verified 2026-08-28):** serve xong mở NGAY
   trong app: `orca tab create --url http://localhost:<port>` — tab hiện
   trong Orca, user nhìn trực tiếp và xác nhận; cần @375 mobile →
   `orca "set device" --name "iPhone 12"`; xong `orca tab close`.
   `screenshot` cần window focus — ưu tiên snapshot/get/is (xem reviewer
   browser notes trong agents/code-reviewer.md).
3. Dọn sf-* worktrees + branches còn sót (GIỮ nhánh đích — dest chỉ bị xoá ở
   story-level cleanup SAU khi PR merge; lệnh: sections "CLEANUP-ON-MERGE" +
   "Story-level cleanup" trong `references/merge-playbook.md`).
4. Orca cleanup: worktrees sf-* đăng ký Orca → `orca worktree rm` (registry đồng bộ).
5. Linear: mọi sub-issue Done → **Epic → Done** + final audit comment
   (SF→issue→merge-hash map + tên nhánh đích + hướng dẫn merge cho người).
6. **Tạo PR (agent chạy — `references/pr-playbook.md`):** push nhánh đích +
   `gh pr create --base "$PRIMARY"` — base đọc từ `~/.claude/bin/wakii-validate
   --resolve-primary --repo .`, KHÔNG
   hardcode main (1 PR/story) + comment PR URL vào Linear epic.
   Thiếu remote/gh → `READY-FOR-MANUAL-MERGE` vào audit comment, không chặn.
7. In **STORY-COMPLETE: PR đã mở (hoặc READY-FOR-MANUAL-MERGE) — NGƯỜI review
   và merge** → agents kết thúc. (Merge PR là human gate cuối — không agent
   hay watchdog nào merge primary.)

**Sau khi NGƯỜI merge PR (dest → primary):** story-level cleanup — xoá story
worktree + nhánh đích (local + remote), guards bắt buộc: section "Story-level
cleanup" trong `references/merge-playbook.md`. Story .wakii + Linear audit giữ
vĩnh viễn.

**Verification trước khi declare STORY-COMPLETE (không tin mù):**
- nhánh đích chứa TẤT CẢ SF (mỗi sf-branch: rev-list count đích..sf == 0)
- mọi sub-issue state = Done (list children check)
- worktrees sf-* đã remove + `git worktree list` sạch (chỉ primary worktree +
  story worktree)
- branches sf-* đã xóa; NHÁNH ĐÍCH còn (đó chính là sản phẩm)
- final verify pass trên nhánh đích (smoke/tests/visual)
- Epic → Done.
- PR story đã mở (URL trong Epic audit comment) HOẶC `READY-FOR-MANUAL-MERGE`
  + lý do ghi rõ — không được im lặng bỏ qua cả hai. (Merge PR vẫn là việc
  NGƯỜI — không nằm trong checklist agent)

### Issue-hợp-nhất khi approve chạy trùng (bài học FI-152/161)
Nếu phát hiện 2 sub-issue cho cùng SF (approve chạy 2 lần / remap race):
1. Giữ issue có AUDIT THẬT (comments/commits) làm record chính
2. Issue kia → state Duplicate (không xóa), comment dẫn về issue chính
3. .wakii remap sf node `linear` về issue chính
4. Audit comment lên epic ghi rõ sự hợp nhất

## DEFENSIVE PATTERNS — bắt buộc đọc trước approve/launch/watchdog/merge

5 rules + truncation disclosure, mỗi rule sinh từ bug đã ship thật
(FI-151/FI-169). **REQUIRED:** đọc `references/defensive-patterns.md`
TRƯỚC khi chạy bất kỳ phase vận hành nào. Tóm tắt cực ngắn (full = file):
báo facts độc lập riêng biệt · async state ≠ sync state · dispose chờ
quiescence · agent lỗi không phá core · không echo env vars; output bị cắt
phải disclosure rõ ràng.

## Verified CLI reference — `references/cli-verified.md`

**REQUIRED khi chạy orca CLI:** đọc `references/cli-verified.md` — bảng lệnh
đã verify thật (FI-151/169/234) + duplicate batch guard + worker/binary notes +
VERDICT-OUTBOX. Tóm tắt cực ngắn (full = file): sub-issue dùng `--parent` +
`--body` (KHÔNG `relation add --parent`); JSON parse bằng python3 (jq cấm);
comment qua `--body-file -`; retry luôn READ-BACK trước (silent SUCCESS tồn tại);
mọi async agent dispatch kèm OUTBOX file — file là nguồn sự thật, message chỉ
là notification.

## STORY-WATCHDOG — tự check & hoàn thiện khi bị ngắt quãng (anti-stall)

Vấn đề thật (FI-151): story chạy dở — agents dừng giữa chừng, tier kẹt, không ai
tự hoàn thiện. Watchdog là vòng tự kiểm tra + tự tiếp tục, chạy độc lập với agents.

**REQUIRED khi cần watchdog:** đọc `references/story-watchdog.md` — cơ chế
`/goal` native (đầy đủ prompt đã verify), watchdog rules AUTO-MODE, cách dừng
an toàn. Tóm tắt cực ngắn (full = file): /goal condition đòi "chứng minh bằng
output lệnh thật", bound 40 turns, blocked-all → STORY-BLOCKED tự clear; rules:
NO EVIDENCE = NO CLAIM, chỉ được check/resume/launch/merge/audit (KHÔNG code
thay SF), chạy tới STORY-COMPLETE/STORY-BLOCKED không giới hạn vòng; watchdog
chết → backup thủ công 1 vòng check 3-tầng cuối ngày.

## Strictness defaults (story creation — ALL ON)
Phase 0 analyst / spec-critic / plan-critic / code-reviewer / verifier / security-audit
tokens are implied; do not omit. Autonomous mode still STOPs at the bracket-approval
gate — architecture deserves human eyes.

## With the superpowers workflow
Story = orchestration layer ABOVE orca-superpowers-workflow:
- **Epic level** (CREATE/APPROVE/CLOSE) uses its skills + critics at full strictness.
- **SF level**: every SF IS one full workflow run (tier by its own size — the
  skill's Quick-fix/Standard/Full tiers apply per SF, ceremony co giãn theo cỡ SF).
- Do not duplicate its principles/agents/loop caps here — reference them.
The only things story-workflow owns: bracket structure, tier ordering,
story destination-branch topology, and the launch handoff prompt.

**Agent-as-plugin hướng đi (học từ DSH "Everything is a Plugin"):** mỗi agent
ĐÃ self-contained (file riêng + input contract + verdict format) — tức là
plugin văn-bản có thể version/reuse độc lập với skill này. Khi hệ lớn tiếp:
agents tách thành skills riêng có thư mục riêng, story-workflow chỉ giữ
orchestration contracts (giống DSH: core mỏng, capability là plugin).
