# Runbook — refresh evidence/fixtures của story-verify-tests

Áp dụng cho `tests/story-verify-tests.mjs` (suite derive linear/dest qua ORCA_BIN
stub + fixture worktree, nhắm `kit/bin/story-verify`). Viết sau LOCAL-2 SF-1
(deterministic hóa). Khi bin đổi contract, quay lại đây trước khi mổ xẻ test;
đổi test xong thì cập nhật lại runbook nếu cơ chế dưới đổi.

## 1. Khi nào cần refresh (triệu chứng)

- Suite đỏ trên checkout mới nhưng xanh máy khác → state của máy lọt vào test
  (vi phạm deterministic contract). Ghim state đó trong test — không vá điểm assertion.
- FAIL chỉ trên máy có `orca` thật → stub không còn được bin nhận: bin bỏ qua
  `ORCA_BIN` không-exec và fallback sang orca thật → metadata-first không chạy.
  Kiểm tra stub vẫn `chmod 0o755` trong `makeOrcaStub()`.
- `kit/bin/story-verify` đổi contract: format dòng `code:/dest:`, gate mới
  (evidence/tdd/realMode…), key config mới, hoặc bin gọi subcommand `orca` mới
  → fixture/stub/config ghim đi theo CÙNG commit với bin.
- Evidence gate warn/fail về `test-run.txt` → format evidence của bin đổi →
  sửa generator trong `makeWorktree()` (xem §2 — không có evidence committed).
- Test đụng mạng hoặc treo ở B4 → `pinKitConfig()` mất `distributed.enabled:false`.

## 2. Deterministic contract hiện tại (đọc test trước khi sửa — đây là bản đồ)

| Cơ chế | Vị trí | Quy tắc |
|---|---|---|
| Commit fixture tất định | `FIXED_DATE_ENV` + `makeWorktree()` | `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` ghim `2026-01-01T00:00:00Z` → hash HEAD cố định mọi máy. KHÔNG assert hash cụ thể — luôn `rev-parse --short HEAD` lúc chạy; hash quan sát được là lần chạy, không phải hằng số. |
| Evidence runtime | cuối `makeWorktree()` | `test-run.txt` (chứa HEAD + dòng `tdd:`) sinh LÚC CHẠY trong fake HOME — không có file evidence để "làm mới committed"; đổi format = sửa generator. |
| Config ghim | `pinKitConfig()` | `story-kit.json` ghim trong fake HOME: gate matrix verify + `distributed.enabled:false` → hành vi bin không đổi theo máy và không mạng. Bin thêm key mới có default theo máy → ghim thêm ở đây. |
| Stub orca | `makeOrcaStub()` | JSON shape khớp output thật cho từng subcommand bin gọi; `chmod 0o755` bắt buộc; worktree list qua env `STUB_WT_JSON`. |
| Path forward-slash | `runScenario()` | Path fixture `replaceAll('\\','/')` (HOME forward-slash → bash glob + cygpath -m đều ổn); stub JSON phải dùng CÙNG chuỗi đó — match/không-match là hành vi thật (Windows/MSYS). |
| Tên SF | `SF = 'sf-91-hv'` | Cố ý độc nhất để không trúng process/branch ngoài; đổi tên thì giữ tính độc nhất. |

## 3. Các bước refresh

```bash
cd resources/plugins/launch/stablyai.orca-superpowers-launcher
node tests/story-verify-tests.mjs   # 1) baseline trước khi sửa
# 2) sửa tests/story-verify-tests.mjs — fixture/stub/config theo §2;
#    nếu contract bin thật sự đổi, bin + test trong cùng commit
node tests/story-verify-tests.mjs   # 3) kỳ vọng: TOTAL 29 PASS / 0 FAIL (LOCAL-5 SF-3)
```

- Đổi số assert → cập nhật comment đầu test và con số "29 PASS" trong runbook này.
- Thêm scenario: đi qua `runScenario()` (tự cấp fake HOME, tự dọn bằng `rmSync`),
  assert trên dòng `code:…dest:…` duy nhất, không parse phần stdout khác.
  Row-line cột `[B1:…]` nằm ở stdout, KHÔNG ở detail line — assert B1:FAIL
  qua `stdout.includes`, note lỗi qua `line.includes` (S14 là ví dụ).
- B3 scoping (SF-3): mindmap fixture truyền qua option `mindmaps` của
  `runScenario()` ({ "<file>.wakii": {story, epic, dest, linear} }); token story
  derive từ basename `sf-91-hv` = `hv` — mindmap KHÔNG khớp `hv` exact/`hv-*`
  sẽ không được derive (0/>1-match → fail-open, review:?).
- Decoy evidence (S13/S15): CẦN 2 decoy `sf-91+stale` + `sf-910-stale` — `ls`
  sort theo collation locale (byte-order thì '+' thắng, en_US bỏ-punctuation thì
  'sf-910' thắng); thiếu 1 trong 2 → test không còn RED chắc chắn trên code cũ.

## 4. Verify sau refresh

1. `node tests/story-verify-tests.mjs` → `TOTAL 29 PASS / 0 FAIL`.
2. `node tests/kit-verify-manifest.mjs` → hai dạng FAIL chấp nhận được:
   - Fingerprint `bundled-plugins.json contentHash` — tests/ nằm trong plugin tree,
     mọi thay đổi bytes (kể cả file test) làm fingerprint cũ lệch cho tới khi
     rehash `hashPackagedPluginTree` (bước rehash thuộc flow release/coordinator,
     không phải người refresh test).
   - Exec-bit `[FAIL] kit/bin: mọi bins executable — non-exec: …` — checkout/môi
     trường có thể làm mất +x của bin. Fix: `chmod +x kit/bin/<các bin liệt kê>`
     rồi commit mode (git ghi 100755). Suite story-verify không cần bước này
     (chạy qua `bash [BIN]`, stub tự chmod), các harness gọi bin trực tiếp thì cần.
