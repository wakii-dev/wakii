---
name: i18n-ui-layout
description: >-
  Kiểm layout UI sống sót qua 12 locale của Wakii — bảng đặc tính mỗi locale,
  pattern width co giãn (min-width + padding, không fixed), truncation được/cấm,
  pseudo-locale test không cần dịch thật, và format ngày/số/câu qua Intl.
  Use khi thêm/sửa UI có label, button, pill, menu, table: "check i18n layout",
  "UI có vỡ khi tiếng Đức/Nhật không", "review locale", "pseudo-locale test",
  hoặc trước khi ship feature đụng copy hiển thị. Nguồn thật: locales/ +
  i18n runtime của repo (trích dẫn cuối file).
---

# i18n UI Layout — UI không vỡ khi đổi ngôn ngữ

Layout vỡ do i18n là class bug ảnh chụp 1 locale không bắt được. Rule cốt lõi:
**không bao giờ hard-code kích thước đủ cho tiếng Anh** — mọi khung chứa text
phải co được hoặc cắt được theo chủ đích.

## 1. Bảng 12 locale của Wakii + đặc tính layout

Nguồn danh sách: `src/renderer/src/i18n/locales/` (12 file JSON, i18next
resource pack). `en` là baseline; độ dài label tiếng Anh × hệ số ước lượng:

| Locale | Ngôn ngữ | Đặc tính layout |
|--------|----------|-----------------|
| `en`   | English  | Baseline — mọi hệ số đo từ đây |
| `vi`   | Tiếng Việt | Gần baseline, dấu hai tầng (line-height cao hơn nhẹ) |
| `de`   | Deutsch  | Nouns ghép dài — **+30–40%**, từ đơn lẻ dài nhất trong bảng; sát nhất lên pill/button |
| `fr`   | Français | **+30–40%** (colonne, paramètres d'affichage) + dấu cách trước `: ! ?` |
| `es`   | Español  | +25–35%, nhiều bài từ (artículos) |
| `pt`   | Português | +25–35%, tương tự es |
| `ru`   | Русский  | +30–40%, từ dài không hyphen tự nhiên — auto-hyphenation tắt |
| `tr`   | Türkçe   | +25–35%, chữ I/i chuyển case đặc thù (İ/ı) — không lowercase blind |
| `ja`   | 日本語    | Ngắn hơn en, **không dấu cách** — wrap ở ký tự bất kỳ (line-break: anywhere giữa CJK), dính chuỗi ký tự Latin lẻ |
| `ko`   | 한국어    | Tương tự ja nhưng có dấu cách — wrap ở dấu cách + ký tự, hangul không cắt giữa âm tiết |
| `zh`   | 简体中文   | Không dấu cách, wrap ký tự bất kỳ; dấu câu full-width chiếm ô riêng |
| `zh-Hant` | 繁體中文 | Như zh, glyph phức tạp hơn — cần line-height/okukidashi（行頭禁則）đủ |

Cặp kiểm nhanh nhất: **de** (giãn ngang) và **ja** (không dấu cách, wrap khác)
— UI sống qua 2 locale này thì gần như sống qua cả 12.

## 2. Flexible width patterns

- Pill/button: `min-width` + padding hai bên, **không** `width`/`w-*` fixed.
  Text dài hơn làm pill nở ra; ngắn hơn vẫn đạt hit-target.
- Icon-button: giữ ô vuông fixed nhưng reserve width cho icon + gap, label đi
  ra tooltip — không nhét label vào ô icon.
- Navigation/menu item: flex + `text-ellipsis` trên label, icon cố định.
- Card/table: cột text cuối cùng là cột co giãn; cột hành động khóa width.
- Dialog/modal: max-width + nội dung wrap; không đặt width theo label dài nhất.
- Grid hai cột label:value: label `flex-shrink-0` chỉ khi label có bounded set
  ngắn (status chip); otherwise label wrap được.

### Truncation

- **ĐƯỢC cắt** (ellipsis): tên file/path dài, tiêu đề user nhập, mô tả dài,
  nội dung list item có nguồn dữ liệu không kiểm soát.
- **CẤM cắt** (phải wrap hoặc nở khung): label action (button, menu item,
  tab), thông báo lỗi, cảnh báo xác nhận — label bị cắt = action không hiểu
  được, sai hành động là bug chức năng chứ không phải thẩm mỹ.
- Truncation luôn kèm `title`/tooltip cho bản đầy đủ.

## 3. Pseudo-locale test — soi vỡ layout không cần dịch thật

Wakii có pseudo-locale `en-XA` dựng sẵn:
`src/shared/pseudo-localization.ts` → `pseudoLocalizeString()` bọc `[...]`
đầu-cuối (lộ ngay string bị clip hoặc không qua pipeline) và khi `expand`
thêm dấu accent + đệm `·` ~40% chiều dài — đúng độ giãn của de/fr/ru.

Cách dùng:

1. Bật locale `en-XA` (đã wire qua i18n runtime — không cần đổi code).
2. Soi từng màn hình: mọi text phải thấy `[` đầu và `]` cuối — thiếu =
   string chưa qua i18n (hard-code) hoặc bị clip mất phần đuôi.
3. Nếu cần thử mức giãn khác thủ công: nhân đôi/koá ba lần text trong
   resource JSON tạm (`"Save" → "SaveSaveSave"`) — nhanh, chỉ dùng cục bộ,
   không commit.
4. Cụm lỗi điển hình bắt được: button tràn container, label đè icon,
   tooltip một chữ, cột table co về 0, số badge tràn viên.

Không thay được dịch thật 100% (độ dài chữ CJK/hyphenation là phân bố khác),
đủ để bắt ~90% vỡ layout trước khi đụng translator.

## 4. Ngày / số / dấu câu — chỉ qua Intl

- Ngày giờ: `uiDateTimeFormat()` (`src/renderer/src/i18n/ui-intl-formatters.ts`)
  — bọc `Intl.DateTimeFormat` keyed theo locale active, có cache.
- Thời gian tương đối/short duration: `getUiRelativeTimeFormatter()` +
  narrow duration (`src/renderer/src/i18n/relative-time-format.ts`).
- Số: `uiNumberFormat()` — `Intl.NumberFormat` (ngăn cách nghìn, thập phân
  khác nhau theo locale); sort theo ngôn ngữ: `uiCollator()`.
- Plural: đi qua i18next (`react-i18next`), **không** tự `if (n === 1)`.

CẤM ghép thủ công: `${day}/${month}/${year}`, `toFixed()` hiển thị cho user,
nối câu bằng string template thay vì tham số i18n key (`t('x', { name })`)
— thứ tự thành phần câu khác nhau giữa các locale.

## Provenance

- Locales: `src/renderer/src/i18n/locales/` — 12 pack (de en es fr ja ko pt
  ru tr vi zh-Hant zh), đọc trực tiếp ngày 07/11/2026.
- Runtime: `i18next` ^26 + `react-i18next` 17 (package.json);
  `src/renderer/src/i18n/i18n.ts`, `ui-intl-formatters.ts`,
  `relative-time-format.ts`, `intl-locale-support.ts`.
- Pseudo-locale: `src/shared/pseudo-localization.ts` (`en-XA`, bracket +
  expand ~40%), test tại `src/renderer/src/i18n/pseudo-localization.test.ts`.
- Danh sách ngôn ngữ Settings: `src/renderer/src/i18n/supported-languages.ts`.
- Hệ số giãn +30–40% cho de/fr/ru: chuẩn pseudo-localization (gần giá trị
  expand của `pseudoLocalizeString`); kiểm lại khi thêm locale mới.
