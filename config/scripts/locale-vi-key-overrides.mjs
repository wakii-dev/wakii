// Vietnamese overrides for keys whose value depends on call-site context.
export const VI_KEY_OVERRIDES = {
  // GT renders File as "Tài liệu" (document); the menu bar convention is "Tệp".
  'menu.file': { vi: 'Tệp' },
  // GT mangled two adjacent protected placeholders into "{{value1}}_PH2__" —
  // restore the exact en placeholder sequence.
  'auto.components.settings.BrowserProfileRow.d420c43729': {
    vi: 'Đã nhập {{value0}} cookie từ {{value1}}{{value2}} vào {{value3}}.'
  },
  'components.workspace.cleanup.scan.multipleErrors': {
    vi: 'Không thể kiểm tra kho lưu trữ {{value0}} ({{value1}}{{value2}}). Một số không gian làm việc có thể bị thiếu. Hãy làm mới để thử lại.'
  }
}
