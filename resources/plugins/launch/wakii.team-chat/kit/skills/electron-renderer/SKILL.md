---
name: electron-renderer
description: Process model + quy tắc preload + debug renderer ẨN (ORCA_BACKGROUND_LAUNCH + CDP) của Wakii desktop. Use khi sửa code main/preload/renderer, thêm kênh IPC, verify UI Electron không steal focus, screenshot renderer ẩn, hoặc debug keyboard/CDP "chết im" trên window không focus.
---

# Electron Renderer — ranh giới process + debug nền

> Luật phủ: `test/AGENTS.md` mục **Electron UI Validation** — luôn launch nền
> `ORCA_BACKGROUND_LAUNCH=1`, cấm `show()`/`showInactive()`/`bringToFront()`/
> `app.focus()`/OS activation; CDP screenshot cho renderer ẩn; rebuild
> launch-policy trước khi chạy app (stale build wrapper không an toàn).

## 1 · Process model: main / preload / renderer

- **Main** (`src/main/`): Node full — fs, git, PTY, updater. Mọi side-effect đắt/nguy hiểm sống ở đây.
- **Preload** (`src/preload/`): cầu duy nhất qua ranh giới. Chạy trong context cách ly, chỉ expose hàm dữ-liệu-sạch.
- **Renderer** (`src/renderer/`): web thuần — chỉ thấy `window.api` do preload expose, không thấy Electron, không Node.

Ranh giới IPC: renderer gọi `window.api.<domain>.<method>` → preload chuyển `ipcRenderer.invoke` → main `ipcMain.handle` trả kết quả.

Cờ cứng (không đổi để "tiện"): `contextIsolation: true`, `nodeIntegration: false` — pin trong `src/main/window/main-window-webview-security.ts:188-191`, và guest webview/plugin frame bị main **ép lại** bằng allowlist ngay cả khi markup khai khác (`main-window-webview-security.ts:125,135,172-181`). Renderer markup là "request" — main xóa mọi preference nó không pin (`hardenPluginFrameGuestPreferences`, :172).

## 2 · Quy tắc preload: expose trắng, không leak

- Mỗi domain một file `src/preload/api/<domain>-api.ts`, gom lại và expose **một lần** qua `contextBridge.exposeInMainWorld('api', api)` (`src/preload/index.ts:203`).
- API trắng rõ: hàm có kiểu tham số/trả về khai cả hai phía (preload + `src/preload/api-types.ts` + handler main). Không expose object "tùy hứng" truyền nguyên `{[k: string]: unknown}`.
- **Không leak Electron primitives**: không expose `ipcRenderer`, `webContents`, `remote`, `BrowserWindow` — chỉ hàm wrapper có ý nghĩa nghiệp vụ. Guest frame bị clear `preload`/`preloadURL`/`additionalArguments` để không thừa kế bridge chính (`main-window-webview-security.ts:117-124`).
- Thêm method mới = 3 đầu: handler `ipcMain.handle` ở main + wrapper preload + type dùng chung. Thiếu một đầu = lỗi lúc runtime, không lúc build.

## 3 · Debug renderer ẨN: ORCA_BACKGROUND_LAUNCH=1 + Playwright CDP

Bước từng bước (đã dùng thật trong RULE-0 vi locale + plugin real-smoke):

1. **Launch nền**: `ORCA_BACKGROUND_LAUNCH=1 pnpm dev -- --remote-debugging-port=9333 --inspect=9229` — flag forward cả hai xuống electron. `ORCA_BACKGROUND_LAUNCH=1` → `isWindowlessLaunch` (`src/main/window/foreground-activation-policy.ts:33-38`): không show, macOS `setActivationPolicy('accessory')` (:61).
2. **Port CDP tự sweep**: nếu không truyền tay, `config/scripts/dev-instance-isolation.mjs:262` tự chọn port rảnh và inject `--remote-debugging-port`.
3. **Kết nối**: `chromium.connectOverCDP('http://127.0.0.1:' + port)` — mẫu hoàn chỉnh `config/scripts/vi-rule0-browser-verify.mjs:110`.
4. **Click + screenshot hoạt động bình thường trên window ẩn** — chỉ keyboard là chết (mục 5).
5. **LUÔN `browser.close()`** trước khi thoát script — session CDP rò rỉ làm mọi client sau treo connect vĩnh viễn (3 lần tưởng app chết, thật ra zombie session).
6. Đổi code launch-policy → build lại trước khi launch (tests/AGENTS.md); launch dài nền bọc `nohup … & disown` (Bash `&` trần bị kill khi shell cha thoát).
7. Không dùng computer-use cho UI Orca — dùng `$electron` skill + Playwright CDP.

## 4 · Bảo mật

- **Không load remote content** trong app window; guest browser dùng partition registry-validated, URL trắng = `data:text/html,` (`ORCA_BROWSER_BLANK_URL`, `src/shared/constants.ts:51`); navigation ngoài route đã đăng ký bị `preventDefault` (`main-window-webview-security.ts:108-113`).
- **Validate mọi IPC input ở main** — renderer là đầu không tin được. Mẫu chuẩn: handler `git:blame` resolve worktree qua registry (`resolveRegisteredWorktreePath`), validate path qua containment (`validateGitRelativeFilePath`), gate route reachable (`requireReachableGitRoute`) — `src/main/ipc/filesystem/filesystem-git-blame-handlers.ts:13-33`. Không handler nào tin path trần từ renderer.
- Trust dialog (plugin provenance, approve code) phải `DialogContent surface="security"` — token `--orca-security-*` (main.css:11-27) để plugin theme không restyle được (STYLEGUIDE.md:60).

## 5 · Bẫy thật (đã cắn 06-07/11 và trước đó)

| Bẫy | Hiện tượng | Đường vòng đúng |
|---|---|---|
| Keyboard CDP trên window không focus | `page.keyboard.press()` / `Input.dispatchKeyEvent` không sinh `before-input-event` → chord "chết im" (⌘⇧P không mở palette, 3 lần chẩn đoán nhầm) | Từ main: `app.evaluate(({BrowserWindow}) => { const wc = …; wc.focus(); wc.sendInputEvent({type:'keyDown', keyCode:'p', modifiers:['meta','shift']}); wc.sendInputEvent({type:'keyUp', …}) })` — trusted input đi đúng production path. Typing = `{type:'char'}` từng ký tự; Enter/Escape = keyDown+keyUp `Return`/`Escape` |
| `sendInputEvent` gọi TỪ inspector | wedge CDP server (HTTP chết, port còn LISTEN) → restart app | `sendInputEvent` chỉ qua `app.evaluate` của driver `_electron`, không bao giờ từ inspector VM |
| Shortcut do main-process route (vd ⌘J) | không mở được bằng click lẫn CDP key (menu item chỉ display-only) | Main inspector (`--inspect=9229`): `process.mainModule.require('electron').webContents.getAllWebContents()[0].send('ui:toggleWorktreePalette')` — bundle CJS nên `import('electron')` trong inspector chết `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` |
| Relaunch dev với profile cũ sau rebuild | CDP accept TCP nhưng không bao giờ respond, main 0% CPU — keychain prompt `SecItemCopyMatching` kẹt `mach_msg` (SIGTERM không ăn, phải `kill -9`) | Launch profile sạch: `HOME=$tmp` + `ORCA_DEV_USER_DATA_PATH=$tmp/user-data` (+ `PNPM_HOME=$HOME/Library/pnpm` nếu qua `pnpm dev` — pnpm 12 tự-provision vào `$HOME/Library/pnpm` giả → ENOEXEC) |
| `ORCA_E2E_USER_DATA_DIR` | bị từ chối ngoài home boundary ("Refusing to start E2E outside its home boundary") | Dev route đúng = `ORCA_DEV_USER_DATA_PATH` |
| Fresh profile boot race | Landing/Settings không đoán trước được, gear chưa mount | Poll 15-20s chờ element trước khi FAIL; empty-state không có gear Settings |
| UI đa ngôn ngữ | locator theo label fail khi app chạy vi (`Settings` ↔ `Cài đặt`) | Match song ngữ, dùng `getByRole('button', {name, exact:true})` |

---

### Nguồn (file:line, kiểm tại wakii-dev `095e93f3306`)

- Process model + security: `src/main/window/main-window-webview-security.ts` :108-135, :172-200; `src/shared/constants.ts:51`
- Preload: `src/preload/index.ts:203`; `src/preload/api/`
- Launch nền: `src/main/window/foreground-activation-policy.ts` :13-38, :61, :95-110; `config/scripts/dev-instance-isolation.mjs:232-265`
- Debug CDP: `config/scripts/vi-rule0-browser-verify.mjs` (connectOverCDP :110), `config/scripts/vi-rule0-extra-captures.mjs` (main inspector :40)
- Luật validation: `test/AGENTS.md` — Electron UI Validation
- Bẫy keyboard/keychain/session: memory `electron-background-keyboard-verify` (probe 22-28/09, 06-07/11), IPC validate mẫu `src/main/ipc/filesystem/filesystem-git-blame-handlers.ts:13-33`
