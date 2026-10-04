#!/bin/bash
# Rule 0 sandbox demo — LOCAL-4 sf-2 (CHECK 4): BIN THẬT vừa sửa chạy trên fixture
# git SYNTHETIC tái lập 3 kịch bản bệnh: FI-30 (tick 1 copy), VU-32 (merge xong
# primary vẫn pending), vocabulary-learn (mindmap chỉ ở worktree riêng).
# KHÔNG đụng mindmap story THẬT nào — mọi fixture trong /tmp; proof read-only
# bằng shasum trước/sau. Output = stdout (caller lưu vào evidence).
set -u
KIT=/Users/hoivu/orca/workspaces/orca/sf-2-mindmap-state-worktrees/resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin
RESOLVE(){ node "$KIT/story-mindmap" --resolve "$@"; }
DRIVER="$KIT/workfront-driver"
ROOT=$(mktemp -d /tmp/sf2-rule0-XXXX)
FAKEHOME=$(mktemp -d /tmp/sf2-rule0-home-XXXX)
MM_REL=docs/superpowers/mindmaps/ilec-demo.wakii

GITC="-c user.email=d@d -c user.name=demo"

doc() { # $1 state sf-1, $2 state sf-2 → mindmap synthetic schema v1
  printf '{"wakiiMindmap":1,"meta":{"story":"ILEC-DEMO — fixture","epic":"ILEC-DEMO","dest":"story/ilec-demo","generatedAt":"2026-10-04T00:00:00Z","generator":"story-mindmap 1.0.0"},"nodes":[{"id":"epic","kind":"epic","title":"ILEC-DEMO","state":"in-progress"},{"id":"sf-1","kind":"sf","title":"ownership probe","state":"%s","tier":0},{"id":"sf-2","kind":"sf","title":"mindmap state","state":"%s","tier":0}],"edges":[{"from":"epic","to":"sf-1","rel":"contains"},{"from":"epic","to":"sf-2","rel":"contains"}]}' "$1" "$2"
}

section() { echo; echo "════ $* ════"; }
step() { echo; echo "--- $*"; }

# ═══ Fixture chung: repo "ilec-demo" — primary + nhánh đích story/ilec-demo ═══
REPO="$ROOT/ilec-demo"
mkdir -p "$REPO/$(dirname $MM_REL)"
echo "fixture" > "$REPO/README.md"
git -C "$REPO" init -q
git -C "$REPO" symbolic-ref HEAD refs/heads/master
git -C "$REPO" add README.md
git -C "$REPO" $GITC commit -qm init
# nhánh đích: SF đã merge → snapshot mindmap sf-1 done, sf-2 pending (việc kế)
git -C "$REPO" checkout -qb story/ilec-demo
doc done pending > "$REPO/$MM_REL"
git -C "$REPO" add -f "$MM_REL"
git -C "$REPO" $GITC commit -qm "mindmap snapshot sau merge SF-1"
git -C "$REPO" checkout -q master
# primary copy STALE (VU-32): sf-1 vẫn pending dù đích đã done
mkdir -p "$REPO/$(dirname $MM_REL)"
doc pending pending > "$REPO/$MM_REL"
echo "fixture repo: $REPO"

section "KỊCH BẢN 1 — VU-32: primary pending, nhánh đích done → đọc chuẩn phải DONE"
SUM1_BEFORE=$(shasum -a 256 "$REPO/$MM_REL" | cut -d' ' -f1)
step "1a. story-mindmap --resolve (hàm đọc chuẩn) trên primary stale copy"
RESOLVE "$REPO/$MM_REL" --repo "$REPO" --json
echo "rc=$?"
step "1b. driver --dry nhìn thấy gì (trước đây: pending → re-dispatch việc đã merge)"
HOME="$FAKEHOME" bash "$DRIVER" --dry ilec-demo --repo "$REPO"
echo "rc=$?"
echo "driver.log (đoạn MM resolve):"
grep -E "MM (resolve|repoint)|DRY: states" "$REPO/docs/superpowers/navigator/driver/ilec-demo/driver.log" || true
SUM1_AFTER=$(shasum -a 256 "$REPO/$MM_REL" | cut -d' ' -f1)
step "1c. proof READ-ONLY: shasum primary copy trước=sau"
[ "$SUM1_BEFORE" = "$SUM1_AFTER" ] && echo "READ-ONLY OK ($SUM1_BEFORE)" || echo "READ-ONLY FAIL — file bị ghi!"

section "KỊCH BẢN 2 — FI-30 chiều ngược: driver đã tick local done, đích stale pending → KHÔNG bị hạ"
doc done pending > "$REPO/$MM_REL"   # giả lập tick driver trên primary
SUM2_BEFORE=$(shasum -a 256 "$REPO/$MM_REL" | cut -d' ' -f1)
step "2a. resolve: local done giữ nguyên (không re-verify vô hạn)"
RESOLVE "$REPO/$MM_REL" --repo "$REPO" --json
echo "rc=$?"
SUM2_AFTER=$(shasum -a 256 "$REPO/$MM_REL" | cut -d' ' -f1)
[ "$SUM2_BEFORE" = "$SUM2_AFTER" ] && echo "READ-ONLY OK" || echo "READ-ONLY FAIL!"

section "KỊCH BẢN 3 — vocabulary-learn: mindmap CHỈ tồn tại ở worktree riêng"
# driver quy ước mindmap tên theo slug (<slug>.wakii) — fixture đặt đúng tên
REPO2="$ROOT/vocab-demo"
MM2_REL=docs/superpowers/mindmaps/vocab-demo.wakii
mkdir -p "$REPO2"
echo "fixture" > "$REPO2/README.md"
git -C "$REPO2" init -q
git -C "$REPO2" symbolic-ref HEAD refs/heads/master
git -C "$REPO2" add README.md
git -C "$REPO2" $GITC commit -qm init
WT2="$ROOT/vocab-demo-vocab"
git -C "$REPO2" worktree add -q "$WT2" -b vocab-ilec
mkdir -p "$WT2/$(dirname $MM2_REL)"
doc in-progress pending > "$WT2/$MM2_REL"
step "3a. primary KHÔNG có file, KHÔNG có nhánh đích — resolver tìm qua worktree scan"
RESOLVE "$REPO2/$MM2_REL" --repo "$REPO2" --json
echo "rc=$?"
step "3b. driver --dry --repo primary: đọc được đúng file story (MM repoint), không EXIT im lặng"
HOME="$FAKEHOME" bash "$DRIVER" --dry vocab-demo --repo "$REPO2"
echo "rc=$?"
grep -E "MM (resolve|repoint)|DRY: states" "$REPO2/docs/superpowers/navigator/driver/vocab-demo/driver.log" || true

section "KỊCH BẢN 4 — không đâu có file → MISSING RÕ RÀNG (không đọc nhầm)"
REPO3="$ROOT/empty-demo"
mkdir -p "$REPO3"
echo "fixture" > "$REPO3/README.md"
git -C "$REPO3" init -q
git -C "$REPO3" symbolic-ref HEAD refs/heads/master
git -C "$REPO3" add README.md
git -C "$REPO3" $GITC commit -qm init
step "4a. resolver: exit 3 + message liệt kê mọi chỗ đã tìm"
RESOLVE "$REPO3/$MM2_REL" --repo "$REPO3" --json
echo "rc=$? (kỳ vọng 3)"
step "4b. driver --dry: log resolve MISS rõ ràng (dry chỉ PLAN — không exit; proof exit ở 4c)"
HOME="$FAKEHOME" bash "$DRIVER" --dry vocab-demo --repo "$REPO3"
echo "rc=$?"
grep -E "không có mindmap" "$REPO3/docs/superpowers/navigator/driver/vocab-demo/driver.log" || true
step "4c. driver --once (non-dry): exit 1 với EXIT log resolve MISS (exit path thật)"
HOME="$FAKEHOME" bash "$DRIVER" --once vocab-demo --repo "$REPO3"
echo "rc=$? (kỳ vọng 1)"
grep -E "EXIT: không có mindmap" "$REPO3/docs/superpowers/navigator/driver/vocab-demo/driver.log" || true

section "DỌN DẸP"
rm -rf "$ROOT" "$FAKEHOME"
echo "fixture đã xoá: $ROOT"
echo
echo "RULE0-DEMO DONE — consumer đọc đúng state đích trong cả 3 kịch bản bệnh (đọc từng rc/output phía trên)"
