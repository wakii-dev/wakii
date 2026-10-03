# Support Matrix — Wakii kit + navigator theo nền tảng

> Luật ECC-pattern: **đọc matrix này trước khi giả định feature parity.** Cập nhật cùng commit khi thay đổi hành vi nền tảng.

| Capability | macOS | Linux | Windows | SSH | WSL | Folder ws | Mobile |
|---|---|---|---|---|---|---|---|
| installKit (marker + recopy theo `version:kitHash`) | ✅ | ✅ | ✅ | — | — | ✅ | — |
| story-workflow (launch → worker → verify → converge → close) | ✅ | ✅ | ⚠️ chưa test đầu-đến-đầu | ✅ (exec boundary) | ⚠️ WSL paths qua buildWslExecArgs | ✅ | — |
| workfront-driver (pane-loop, GA) | ✅ (caffeinate + timeout coreutils) | ✅ (timeout builtin) | ❌ chưa port | ❌ | ❌ | ✅ | — |
| story-watchdog (crontab 30', auto-resume) | ✅ | ✅ | ⚠️ (scheduler khác) | ⚠️ | ⚠️ | ✅ | — |
| story-verify battery (B1–B4 + CDP) | ✅ | ✅ | ⚠️ | ⚠️ Linear FI-unreachable → UNVERIFIABLE | ⚠️ | ✅ | ⚠️ T2 device-e2e = gap |
| SessionStart hooks (fact-pack 2KB, compact-recovery) | ✅ | ✅ | ✅ (claude-hook.cmd) | ✅ | ✅ | ✅ | — |
| Guards (dangerous/secrets/envfiles + mistranslation) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| memory KG (triples + provenance + fuse) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| i18n vi catalog (15012/15012 ratchet) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Doctor (dry-run/repair/uninstall cho installKit) | 🔜 G2 | 🔜 G2 | 🔜 G2 | — | — | 🔜 G2 | — |

Chú giải: ✅ chạy thật có bằng chứng · ⚠️ hoạt động có điều kiện/giới hạn đã biết · ❌ chưa port · 🔜 đã xếp lịch (G2) · — không áp dụng

## Các giới hạn đã biết (chi tiết trong AGENTS.md + memory)

- **Windows**: exec-boundary qua `runProcess`/`spawnProcess`; EDR posture; conpty job breakaway — kit bins chạy nhưng pipeline verify/windowless-CDP chưa có bằng chứng đầu-đến-đầu.
- **Linear workspace FI**: unreachable từ máy hiện tại → mọi B3/B5 verdict = UNVERIFIABLE (không bao giờ coi mất liên lạc là chết).
- **timeout**: macOS cần coreutils (`/opt/homebrew/bin/timeout`); Linux builtin. Driver tự resolve.
- **Mobile**: T2 device-e2e (emulator) = gap G2 của FI-305; pairing latch cần user re-pair.
