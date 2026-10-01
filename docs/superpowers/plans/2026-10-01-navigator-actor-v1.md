# Navigator Actor v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hàng đợi việc navigator tìm thấy được THỢ tự động giải quyết: pane-loop duy nhất chạy navigator pass → worker (1 việc/pass, class-aware) → DIGEST bảng điều khiển; user chỉ tick.

**Architecture:** MỘT pane terminal tên `story-navigator` chạy `navigator-runner.sh --loop` — vòng lặp tuần tự: Pha A `claude -p` navigator pass (11 Bước, fences nguyên vẹn) → Pha B worker `claude -p` executor trên việc P1-auto/acked từ `QUEUE.json` (navigator emit) → Pha C DIGEST render. Không orca automations, không crontab, không session thứ hai song song. Self-cleanup = loop exit khi hết story.

**Tech Stack:** bash + node builtins (pattern kit bins), `claude -p --permission-mode acceptEdits`, `orca terminal create/rename/list` (1 lần lúc install), markdown+json state files.

**Spec:** `docs/superpowers/specs/2026-10-01-navigator-actor-v1-design.md`

## Global Constraints

- Worker KHÔNG BAO GIỜ: merge, push, Linear write, DONE-verdict, sửa code — kể cả việc đã ack.
- 1 việc/pass, 1 thợ/lúc; GA1 dry-run = Pha B chỉ REPORT vào DIGEST, không dispatch.
- Worker scope viết: CHỈ `docs/superpowers/evidence/<việc>/` + navigator entry status. Navigator scope: `docs/superpowers/navigator/` (giữ nguyên — đã gitignored 01/10).
- Launch-class việc: trước dispatch phải probe `run-list` (không run active cho story) — chống double-dispatch.
- Circuit breaker: ≥3 blocked/ngày → Pha B skip, DIGEST leo. State: `navigator/breaker.state`.
- docs/** gitignored — mọi git add trong plan phải `-f` TRỪ navigator/ (đã ignored — KHÔNG add navigator files vào git nữa, quy định 01/10).

---

### Task 1: Prompt navigator — queue schema + emit QUEUE.json

**Files:**
- Modify: `docs/superpowers/navigator/navigator-pass-prompt.md`

**Interfaces:**
- Consumes: prompt 11 Bước hiện tại (commit `c7e809a541` + các fix).
- Produces: entry inbox có `Class/Priority/Attempts`; file `docs/superpowers/navigator/QUEUE.json` (mảng việc machine-readable) — Task 3 Pha B tiêu thụ.

- [ ] **Step 1: Sửa Bước 5 — thêm field vào template entry**

Template entry đổi thành (giữ nguyên phần update-in-place/expiry xung quanh):

```markdown
## NAV-<UTC:YYYYMMDD-HHMM>-<n> [open] [P?] [<class>] <tiêu đề 1 dòng>
Lý do: ≤3 dòng
Class: auto | ack-gated | never
Priority: P1 | P2 | P3
Attempts: 0
```

Thêm ngay dưới: `Phân loại: auto = chỉ đọc/verify/lint/sync/tick-mindmap; ack-gated = launch SF/QA-heavy/story-verify-wide; never = merge/push/Linear-write/DONE (chỉ báo cáo). Priority: P1 chặn-epic, P2 drift-risk, P3 vệ sinh.`

- [ ] **Step 2: Thêm Bước 5.5 — emit QUEUE.json (đánh số lại: 5.5 không đổi số Bước sau)**

Chèn sau Bước 5, trước Bước 6:

```markdown
## Bước 5.5 — Emit QUEUE.json (cho worker — SAU khi inbox xong)

Viết `docs/superpowers/navigator/QUEUE.json` (OVERWRITE, atomic tmp→mv) — mảng các việc
`open` TỪNG STORY vừa pass, PO XẾP theo P1-auto → P1-acked → P2-auto → P2-acked:

```json
[{"id":"NAV-20261001-1730-3","story":"fi32-editor-parity","title":"verify walkthrough FI-33",
  "class":"auto","priority":"P1","attempts":0,
  "brief":"1 dòng điều hành cho thợ: làm gì, gate nào, evidence gì"}]
```

Không có việc open → `[]`. Đây là hợp đồng duy nhất giữa navigator và worker — worker KHÔNG đọc markdown inbox.
```

- [ ] **Step 3: Verify + commit**

Run: `grep -c '^## Bước' docs/superpowers/navigator/navigator-pass-prompt.md` (vẫn 11 — 5.5 không phải `## Bước N` heading, đặt heading `## Bước 5.5` cũng được nhưng nếu làm vậy expect = 12; CHỌN: dùng `### Bước 5.5` (heading con) để giữ đếm 11) · `grep -c 'QUEUE.json'` ≥ 2 · fence chẵn.
```bash
git add docs/superpowers/navigator/navigator-pass-prompt.md 2>/dev/null || true
```
Navigator dir đã ignored — **KHÔNG commit file này** (local-only từ 01/10). Verify xong là xong task; ghi vào report.

---

### Task 2: Worker executor prompt

**Files:**
- Create: `docs/superpowers/navigator/worker-executor-prompt.md`

**Interfaces:**
- Consumes: 1 item JSON từ QUEUE.json (truyền qua argv/env bởi Task 3).
- Produces: stdout dòng cuối `VERDICT: PASS|FAIL|BLOCKED — <1 dòng>` + evidence dưới `docs/superpowers/evidence/<story>/<việc>/`.

- [ ] **Step 1: Tạo file nội dung nguyên văn**

````markdown
# Worker Executor — giải quyết ĐÚNG 1 việc từ hàng đợi navigator

Bạn được gọi với 1 việc (JSON argv). LÀM ĐÚNG VIỆC ĐÓ, không mở rộng.

## Fences
- Scope viết: CHỈ `docs/superpowers/evidence/<story>/` — mọi bằng chứng vào đây.
- CẤM: merge, push, Linear write, gate-resolve, task-update, resume --send, sửa code,
  đụng worktree story, xoá bất cứ thứ gì.
- Verify/lint/sync/tick được phép vì chúng là việc được giao.
- Không làm được (thiếu dữ kiện/env chết 2 lần) → VERDICT: BLOCKED + lý do.

## Quy trình
1. Đọc việc: class/priority/brief. `auto`-class chỉ gồm: verify-gates, surface-lint,
   convergence QA, sync mindmap từ git, dọn evidence temp — làm đúng loại đó.
2. Thực hiện theo brief; bằng chứng (output lệnh, screenshot CDP nếu UI) vào evidence dir.
3. In dòng cuối: `VERDICT: PASS|FAIL|BLOCKED — <1 dòng>` (PASS = việc xong CÓ bằng chứng).
````

- [ ] **Step 2: Verify + không commit (ignored dir)**

`grep -c 'VERDICT:' docs/superpowers/navigator/worker-executor-prompt.md` ≥ 2.

---

### Task 3: navigator-runner.sh — pane loop A→B→C

**Files:**
- Create: `docs/superpowers/navigator/navigator-runner.sh`

**Interfaces:**
- Consumes: prompt (Task 1), executor prompt (Task 2), QUEUE.json (navigator emit).
- Produces: DIGEST.md, entry status updates (claimed/resolved/blocked + Attempts), `runner.log`, `breaker.state`; exit khi hết story (self-cleanup).

- [ ] **Step 1: Tạo script nguyên văn**

```bash
#!/bin/bash
# navigator-runner — pane-loop duy nhất: navigator pass → worker → DIGEST.
# Chạy: navigator-runner.sh --loop (pane story-navigator) | --once | --dry-run(gắn cờ GA1)
set -u
cd /Users/hoivu/Desktop/projects/orca
NAV=docs/superpowers/navigator
LOG=$NAV/runner.log
DRY="${DRY_RUN:-0}"; [[ "${1:-}" == "--dry-run" ]] && DRY=1
PROMPT_FILE=$NAV/navigator-pass-prompt.md
EXEC_PROMPT=$NAV/worker-executor-prompt.md
TICK_SECONDS=$((3*3600))

log(){ echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }

# ── self-cleanup: hết story active → thoát loop (mutation #1 của navigator, giờ ở runner)
no_active_stories(){ ! bash resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin/story-status 2>/dev/null | grep -q 'SF\|story'; }

pass_navigator(){
  log "PhaA start"
  local out
  out=$(claude -p "Đọc $PROMPT_FILE và thực thi NGUYÊN VĂN Bước 1→11 cho toàn bộ story active story-status liệt kê (tuần tự). Caller token: NAVIGATOR_AUTOMATED=1. Fences bất di bất dịch." \
        --permission-mode acceptEdits 2>&1 | tail -3)
  log "PhaA done: $out"
}

# ── Pha B: worker — ĐÚNG 1 việc/pass
pick_item(){ node -e '
const q=JSON.parse(require("fs").readFileSync("docs/superpowers/navigator/QUEUE.json","utf8"));
const rank={"P1":0,"P2":1,"P3":2};
q.sort((a,b)=>(rank[a.priority]??9)-(rank[b.priority]??9));
const it=q.find(i=>i.class==="auto")||q.find(i=>i.class==="ack-gated"&&i.acked);
console.log(JSON.stringify(it||null));'; }

update_entry(){ node -e '
const fs=require("fs"),[id,status,evidence]=process.argv.slice(2);
let changed=false;
for(const f of ["fi32-editor-parity","vi-1-vietnamese-i18n","fi305-superpowers-android","fi28-vscode-workbench-polish","fi30-clone-vs-vscode-replace","fi34-gitlens-lite","fi380-kit-manifest","fi458-distributed-bracket","fi478-editor-vscode-parity","local-1-self-sustain-24-7","local2-verify-fixtures-refresh","vsc901-pipeline-smoke","vu-14-mindmap-wakii"]){
  const p=`docs/superpowers/navigator/${f}/inbox.md`; if(!fs.existsSync(p))continue;
  let t=fs.readFileSync(p,"utf8"); const key=`## ${id} [`;
  const i=t.indexOf(key); if(i<0)continue;
  const closeBracket=t.indexOf("]",i+key.length-1);
  const oldStatus=t.slice(i+key.length,closeBracket);
  if(!["open","claimed","resolved","blocked"].includes(oldStatus))continue;
  t=t.slice(0,i+key.length)+status+t.slice(closeBracket);
  const lineEnd=t.indexOf("\n",i);
  t=t.slice(0,lineEnd+1)+`Resolved: ${evidence} (${new Date().toISOString().slice(0,16)}Z)`+"\n"+t.slice(lineEnd+1);
  fs.writeFileSync(p,t); changed=true; break;
}
process.exit(changed?0:1);' "$@"; }

pass_worker(){
  [[ ! -s $NAV/QUEUE.json ]] && { log "PhaB skip: QUEUE.json rỗng"; return; }
  local breaker=$(cat "$NAV/breaker.state" 2>/dev/null || echo 0)
  [[ "$breaker" -ge 3 ]] && { log "PhaB skip: breaker"; return; }
  local item=$(pick_item)
  [[ "$item" == "null" || -z "$item" ]] && { log "PhaB skip: không có việc khả dụng"; return; }
  if [[ "$DRY" == "1" ]]; then log "PhaB DRY-RUN sẽ làm: $item"; return; fi
  local id=$(node -e "console.log(JSON.parse(process.argv[1]).id)" "$item")
  local story=$(node -e "console.log(JSON.parse(process.argv[1]).story)" "$item")
  local cls=$(node -e "console.log(JSON.parse(process.argv[1]).class)" "$item")
  # launch-class: probe run-list (chống double-dispatch FI-478)
  if [[ "$cls" == "ack-gated" ]]; then
    orca orchestration run-list --json 2>/dev/null | grep -q "\"$story\"" && { log "PhaB skip: $story có run active"; return; }
  fi
  update_entry "$id" "claimed" "worker đang làm" || log "warn: không tick được claimed $id"
  local out
  out=$(claude -p "Việc: $item — đọc $EXEC_PROMPT và thực thi nguyên văn." \
        --permission-mode acceptEdits 2>&1 | tail -2)
  if echo "$out" | grep -q "VERDICT: PASS"; then
    update_entry "$id" "resolved" "$out" && log "PhaB RESOLVED $id"
  else
    node -e '
const fs=require("fs"),id=process.argv[2];
for(const f of fs.readdirSync("docs/superpowers/navigator")){
  const p=`docs/superpowers/navigator/${f}/inbox.md`; if(!fs.existsSync(p))continue;
  let t=fs.readFileSync(p,"utf8"); const key=`## ${id} [`; const i=t.indexOf(key); if(i<0)continue;
  const m=t.match(new RegExp(id.replace(/-/g,"\\-")+" \\[([a-z]+)\\]"));
  t=t.replace(`## ${id} [${m[1]}]`,`## ${id} [${m[1]}]`);
  fs.writeFileSync(p,t); break;}' "$id"  # Attempts+1 do navigator pass kế đếm; fail→blocked ở đây:
    update_entry "$id" "blocked" "$out" && { log "PhaB BLOCKED $id"; echo $((breaker+1)) > "$NAV/breaker.state"; }
  fi
}

render_digest(){
  node -e '
const fs=require("fs");
const N="docs/superpowers/navigator"; let resolved=[],waiting=[],blocked=0,open=0;
for(const f of fs.readdirSync(N)){
  const p=`${N}/${f}/inbox.md`; if(!fs.existsSync(p))continue;
  const t=fs.readFileSync(p,"utf8");
  for(const m of t.matchAll(/^## (NAV-\S+) \[resolved\] (.+)$/gm)) resolved.push(`- ${f}: ${m[2]} (evidence ở inbox)`);
  for(const m of t.matchAll(/^## (NAV-\S+) \[open\] \[P(\d)\] \[(\S+)\] (.+)$/gm)){open++; if(m[3]==="ack-gated") waiting.push(`- [ ] ${f}: ${m[4]}`);}
  blocked+=(t.match(/\[blocked\]/g)||[]).length;
}
const d=`# DIGEST — ${new Date().toISOString().slice(0,10)}\n\n## Đã tự giải quyết\n${resolved.slice(-5).join("\n")||"(không)"}\n\n## Chờ bạn tick\n${waiting.join("\n")||"(không)"}\n\nBlocked: ${blocked} · Open: ${open}\n`;
fs.writeFileSync(`${N}/DIGEST.md`,d);'
  log "PhaC digest rendered"
}

main(){
  log "=== runner start (dry=$DRY) ==="
  no_active_stories && { log "SELF-CLEANUP: hết story active — thoát"; echo "navigator-runner đã tự thoát: hết story active. Chạy lại: bash $NAV/navigator-runner.sh --loop" > "$NAV/DIGEST.md"; exit 0; }
  pass_navigator
  pass_worker
  render_digest
  log "=== runner done ==="
}
if [[ "${1:-}" == "--loop" ]]; then
  while true; do main; sleep $TICK_SECONDS; done
else
  main
fi
```

- [ ] **Step 2: Shellcheck + smoke --once DRY**

```bash
chmod +x docs/superpowers/navigator/navigator-runner.sh
bash -n docs/superpowers/navigator/navigator-runner.sh && echo "syntax OK"
DRY_RUN=1 bash docs/superpowers/navigator/navigator-runner.sh --dry-run; tail -5 docs/superpowers/navigator/runner.log
```
Expected: syntax OK · log có "runner start (dry=1)" — PhaA KHÔNG chạy trong smoke này (xem Step 3).

- [ ] **Step 3: Smoke thật 1 pass (--once, không dry) — trong pane hoặc trực tiếp**

Chạy `bash docs/superpowers/navigator/navigator-runner.sh` — quan sát log đủ 3 pha + DIGEST.md mới. Lưu ý: Pha A tốn ~10–25'.

---

### Task 4: Swap — tắt orca automation + cài pane loop + GA1

**Files:**
- Modify: `docs/superpowers/navigator/G1-runbook.md` (mục Trạng thái + rollback)

- [ ] **Step 1: Tắt orca automation** — `orca automations remove 19006934-d46d-4713-a6ae-ef49dc4586db` (rollback = lệnh create trong runbook, giữ nguyên).

- [ ] **Step 2: Tạo pane + start loop**

```bash
orca terminal create   # trong worktree chính; xem --help để --name nếu hỗ trợ
orca terminal rename --title "story-navigator"   # tùy cú pháp thật của CLI lúc chạy
# trong pane đó: bash docs/superpowers/navigator/navigator-runner.sh --loop
```
User duyệt permission của claude -p ngay pass đầu (acceptEdits).

- [ ] **Step 3: GA1 = 3 pass đầu chạy `--dry-run`** — biến môi trường trong loop: khởi động `DRY_RUN=1 navigator-runner.sh --loop`; sau 3 pass (≈1 ngày) đổi sang không-dry (restart pane loop). GA2 bật sau khi soi 3 DIGEST dry-run.

- [ ] **Step 4: Cập nhật runbook** — Trạng thái: pane-loop thay orca automations (ghi lệnh start/stop: `Ctrl-C pane` / chạy lại); Kiểm hàng ngày: đọc DIGEST.md + runner.log (bỏ mục runs); Rollback: stop loop + recreate automation (lệnh cũ).

---

### Task 5: Verification checklist cuối

- [ ] `bash -n` runner OK · smoke --once 3 pha đủ · DIGEST.md render đúng schema §5 spec
- [ ] dry-run pass: log có "PhaB DRY-RUN sẽ làm" KHÔNG có dispatch thật
- [ ] Runner thoát sạch khi story-status rỗng (test tay bằng mock? chỉ verify logic đọc, không ép thật)
- [ ] Runbook khớp thực tế (pane-loop, GA1 đang bật)
- [ ] KHÔNG có commit nào chứa navigator files (ignored 01/10) — `git status docs/superpowers/navigator` = sạch về tracked

## Self-review

- **Spec coverage**: §2 3 pha (Task 3) ✓ · §3 schema (Task 1) ✓ · §4 worker loop + probe launch (Task 3 pass_worker) ✓ · §5 DIGEST (Task 3 render) ✓ · §6 breaker/audit/1-thợ (Task 3 + log) ✓ · §8 GA1 dry-run (Task 4 Step 3) ✓
- **Placeholders**: runner script nguyên văn; hoặc cụ thể về cú pháp orca terminal thực tế (Task 4 Step 2 ghi "tùy cú pháp thật lúc chạy" — chấp nhận vì CLI probe lúc thực thi, có --help)
- **Type consistency**: QUEUE.json fields (id/story/title/class/priority/attempts/brief) khớp giữa Task 1 emit và Task 3 pick_item; status machine open→claimed→resolved/blocked khớp spec §3
