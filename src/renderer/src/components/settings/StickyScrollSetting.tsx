import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'

const STICKY_SCROLL_TITLE_KEY = 'auto.components.settings.GeneralEditorSettingsSection.7fef986df3'
const STICKY_SCROLL_DESCRIPTION_KEY =
  'auto.components.settings.GeneralEditorSettingsSection.e9731181a3'

type StickyScrollSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function StickyScrollSetting({
  settings,
  updateSettings
}: StickyScrollSettingProps): React.JSX.Element {
  return (
    <SearchableSetting
      title={translate(STICKY_SCROLL_TITLE_KEY, 'Sticky Scroll')}
      description={translate(
        STICKY_SCROLL_DESCRIPTION_KEY,
        'Keep the current scope header pinned at the top of the file editor.'
      )}
      keywords={['sticky', 'scroll', 'scope', 'header']}
    >
      <SettingsSwitchRow
        label={translate(STICKY_SCROLL_TITLE_KEY, 'Sticky Scroll')}
        description={translate(
          STICKY_SCROLL_DESCRIPTION_KEY,
          'Keep the current scope header pinned at the top of the file editor.'
        )}
        checked={settings.editorStickyScroll ?? false}
        onChange={() =>
          updateSettings({ editorStickyScroll: !(settings.editorStickyScroll ?? false) })
        }
      />
    </SearchableSetting>
  )
}
