# Re-review round 3 (overlay rewrite 4c225130b5..e69d6faee5) — FI-34 SF-1 GitLens-lite

Reviewer: code-reviewer độc lập (round 3 — re-review overlay rewrite), 2026-09-25.
Ghi bởi coordinator (reviewer permission profile không-Write).

## VERDICT: APPROVED — P0/P1: none. P2: onDidScrollChange repaint mỗi frame (1 element, negligible; micro-opt skip-if-unchanged chỉ khi profile hot). Không chặn.

### Focus answers
1. Lifecycle: clean — overlay tạo/xoá trong effect [enabled, mountedEditor]; cleanup overlay.remove() + overlayRef=null + dispose cả 4 listeners (hover/cursor/scroll/layout); editor swap được React chạy cleanup-before-setup → không leak, không stale reposition (paintHandlerRef refresh mỗi render, listener đóng trên activeEditor của chính nó).
2. Position math: getScrolledVisiblePosition null → display:none; getModel() null → column ?? 1; visible.height ?? 16 + Math.max(0,…). Đủ guard.
3. Decoration regression: orca-git-blame-annotation = 0 refs trong src/; makeWholeLineRange/IRange vẫn dùng bởi hover provider (tc 0 xác nhận không dead import); taxonomy/eviction/cache giữ nguyên như claim.
4. Surgical scope: đúng 3 files, in-scope.

### Coverage (3/3 files)
- use-monaco-git-blame.ts — clean; assets/main.css — clean (giữ tokens); use-monaco-git-blame.test.tsx — 15 tests gồm scroll/layout reposition + overlay-removal-on-unmount, clean.

### Deterministic
- Sweep 13 files 74/74; tc 0 errors; quality gate passed; RED 14/15 proven trước GREEN.

### CHECKLIST-4Q
Delta không thêm DB/HTTP/external call — 4/4 PASS (giữ nguyên review trước).

VERDICT: APPROVED — rewrite decorations→overlay đúng lifecycle + position guards; P2 duy nhất là perf nit không chặn.
