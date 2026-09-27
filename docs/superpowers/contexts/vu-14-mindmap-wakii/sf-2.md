# Context pack SF-2 — App mở file .wakii

## Spec slice
1. Main capture: `OsOpenedWakiiFileState` clone pattern `OsOpenedMarkdownFileState` (capture/consume/restore, cap 32, `authorizeExternalPath` — os-opened-markdown-files.ts:153). Capture 3 nguồn: argv trước `ready` (index.ts:106), event `open-file` (index.ts:93 — CHỈ claim `.wakii`, đuôi lạ KHÔNG preventDefault), second-instance qua `requestDesktopActivation`.
2. IPC pull `ui:consumePendingWakiiFileOpens` (pattern `ui:consumePendingMarkdownFileOpens` — main-process-ipc-bootstrap.ts:50-60): renderer gọi 1 lần khi listener mount → set latch `wakiiFileOpenListenerReady` → consume + restore-on-failure.
3. IPC push `ui:openWakiiFile`: payload ĐÃ DECODE từ main — `{path, mindmap}` | `{path, error:{code:'io'|'schema'|'too-large', message}}`. Main đọc file (JSON.parse thuần, cap 5MB). Renderer không đọc fs.
4. Dedupe/refresh owner = main: map `path → contentHash`; hash khác → push refresh; hash same → focus tab. Cold-start race (argv + event cùng path) → dedupe tầng capture theo path+hash.
5. Preload bridge `os-wakii-file-open-bridge` theo mẫu `os-markdown-file-open-bridge` (register `app-lifetime-ipc-bridge` — 2 importer); latch reset khi reload (`main-window-controller` — wiring test dòng 50 bắt).
6. Association theo target: mac `fileAssociations` `.wakii` rank Owner (config:473 pattern, 1 entry/ext); Windows NSIS ProgID mới + SET DEFAULT (ruling 27/09 — lệch chủ ý với rule additive .md, ghi chú header) + macro register/unregister cặp đối xứng + SHChangeNotify (hooks.nsh customInstall 37-47 / customUnInstall 66-105; KHÔNG đụng `${isUpdated}` daemon sweep); Linux deb/rpm MIME XML `application/vnd.wakii-mindmap` + glob override + update-mime-database qua after-install (bài học .mdx config:566); AppImage = limitation (docs ghi drag-drop).
7. Assert mới `electron-builder-config.test.mjs` (7 importer của config file): entry association xuất hiện theo target.
8. Rule 4-place đồng bộ: `wakii-documents.ts` ↔ NSIS ProgID ↔ electron-builder config ↔ main capture — lệch 1 chỗ = association chết im lặng.

## Touch map
- Sở hữu: `src/main/startup/os-opened-wakii-files.ts` (mới) · `src/main/ipc/wakii-documents.ts` (mới — isWakiiDocumentName + decode/authorize) · `src/preload/api/os-wakii-file-open-bridge` (mới, theo pattern) · fixture .wakii test.
- Append-only: `src/main/index.ts` (open-file branch + argv capture — 2 đoạn nhỏ) · `src/main/startup/main-process-state.ts` (thêm state + latch, khu 95-100) · `src/main/startup/main-process-ipc-bootstrap.ts` (thêm handler) · `src/main/startup/main-window-controller.ts` (latch reset) · `src/preload/api-types.ts` · `src/preload/api/ui-command-event-api.ts` / `ui-bridge-state-and-menu-commands.ts` (pattern onOpenMarkdownFiles) · `config/electron-builder.config.cjs` (mac entry + linux MIME — KHÔNG đụng nsis include dòng 467) · `config/nsis/orca-installer-hooks.nsh` (ProgID + macro cặp) · `config/scripts/electron-builder-config.test.mjs` (assert mới).
- Read-only: `src/main/startup/os-opened-markdown-files.ts` (pattern + authorizeExternalPath) · `src/main/startup/os-opened-markdown-wiring.test.ts` (không phá asserts hiện có — thứ tự capture-trước-serve-guard, preventDefault-trong-handler) · docs/reference/windows-edr-posture.md + windows-daemon-host-relocation.md.
- Cấm: đụng khối `${isUpdated}` daemon sweep trong NSIS · đổi `open-url` skill-share flow · đổi `resolveOpenedMarkdownDocuments` · spawn process mới trong NSIS hook (EDR) · đụng nsis include path trong config.

## ACCEPTANCE
- Wiring test: argv `.wakii` trước ready → capture; sau ready → publish 1 lần; consume lỗi → restore (pattern markdown).
- Đuôi lạ trong open-file → không claim (event không preventDefault).
- File 6MB → error `too-large`; JSON hỏng → `schema`; permission → `io` — payload shape đúng.
- Consume-pending gọi 2 lần → lần 2 rỗng (consume semantics).
- electron-builder config test: mac entry `.wakii` Owner + linux MIME + NSIS macro cặp đối xứng (register có unregister).
- assert `os-opened-markdown-wiring.test.ts` cũ vẫn xanh.

## Boundary
- KHÔNG đổi hành vi hiện có của markdown open (nó là hợp đồng người dùng).
- KHÔNG decode schema sâu trong main vượt JSON.parse + validate bắt buộc (chi tiết render là việc SF-3).
- KHÔNG đăng ký association cho đuôi khác ngoài `.wakii`.
- KHÔNG set default trên mac qua rank khác Owner hay trên Linux (mimeapps.list của user).
- Windows: KHÔNG spawn process, KHÔNG đụng daemon sweep, KHÔNG viết file hệ thống ngoài registry key của mình.
