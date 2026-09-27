// vi value overrides — pinned renderings for high-frequency en values where the
// GT-vi output reads wrong (observed 2026-09-27 probe: "Quit" → "Từ bỏ", "Save" → "Cứu").
export const VI_VALUE_OVERRIDES = {
  Quit: 'Thoát',
  Save: 'Lưu',
  Cancel: 'Hủy',
  Delete: 'Xóa',
  Appearance: 'Giao diện',
  Theme: 'Chủ đề',
  'New terminal': 'Terminal mới',
  'Uncommitted changes': 'Thay đổi chưa commit',
  'Commit message': 'Thông điệp commit',
  'Staging area': 'Vùng staging',
  'Stage changes': 'Stage thay đổi',
  On: 'Bật',
  Off: 'Tắt',
  Remove: 'Gỡ bỏ',
  Edit: 'Sửa',
  general: 'Chung',
  'Choose close reason': 'Chọn lý do đóng',
  '{{value0}} agents': '{{value0}} agent',
  Show: 'Hiện',
  'split chat right': 'chia trò chuyện sang phải',
  'WSL default': 'WSL mặc định'
}
