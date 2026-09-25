import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'

const INLINE_BLAME_TITLE_KEY = 'auto.components.settings.InlineBlameSetting.683fd9af0f'
const INLINE_BLAME_DESCRIPTION_KEY = 'auto.components.settings.InlineBlameSetting.9142b8bc2f'

type InlineBlameSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function InlineBlameSetting({
  settings,
  updateSettings
}: InlineBlameSettingProps): React.JSX.Element {
  return (
    <SearchableSetting
      title={translate(INLINE_BLAME_TITLE_KEY, 'Inline Blame')}
      description={translate(
        INLINE_BLAME_DESCRIPTION_KEY,
        'Show commit author, date and summary at the end of the current line in the file editor.'
      )}
      keywords={['inline', 'blame', 'git', 'gitlens', 'annotation']}
    >
      <SettingsSwitchRow
        label={translate(INLINE_BLAME_TITLE_KEY, 'Inline Blame')}
        description={translate(
          INLINE_BLAME_DESCRIPTION_KEY,
          'Show commit author, date and summary at the end of the current line in the file editor.'
        )}
        checked={settings.editorInlineBlameEnabled ?? true}
        onChange={() =>
          updateSettings({ editorInlineBlameEnabled: !(settings.editorInlineBlameEnabled ?? true) })
        }
      />
    </SearchableSetting>
  )
}
