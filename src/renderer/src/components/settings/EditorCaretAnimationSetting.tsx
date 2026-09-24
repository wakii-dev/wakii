import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { Label } from '../ui/label'
import { SettingsSegmentedControl } from './SettingsFormControls'

const TITLE_KEY = 'auto.components.settings.EditorCaretAnimationSetting.63ef2747f7'
const DESCRIPTION_KEY = 'auto.components.settings.EditorCaretAnimationSetting.a181845e72'

type EditorCaretAnimationSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function EditorCaretAnimationSetting({
  settings,
  updateSettings
}: EditorCaretAnimationSettingProps): React.JSX.Element {
  return (
    <SearchableSetting
      title={translate(TITLE_KEY, 'Smooth Caret Animation')}
      description={translate(
        DESCRIPTION_KEY,
        'Animate the text cursor as it moves in file editors.'
      )}
      keywords={['editor', 'caret', 'cursor', 'smooth', 'animation']}
      className="flex items-center justify-between gap-4 py-2"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label>{translate(TITLE_KEY, 'Smooth Caret Animation')}</Label>
        <p className="text-xs text-muted-foreground">
          {translate(DESCRIPTION_KEY, 'Animate the text cursor as it moves in file editors.')}
        </p>
      </div>
      <SettingsSegmentedControl
        ariaLabel={translate(TITLE_KEY, 'Smooth Caret Animation')}
        value={settings.editorCursorSmoothCaretAnimation ?? 'on'}
        onChange={(option) => updateSettings({ editorCursorSmoothCaretAnimation: option })}
        options={[
          { value: 'on', label: translate('auto.components.settings.EditorCaretAnimationSetting.8e0f5141a1', 'On') },
          {
            value: 'explicit',
            label: translate('auto.components.settings.EditorCaretAnimationSetting.8dc4f98620', 'Explicit')
          },
          { value: 'off', label: translate('auto.components.settings.EditorCaretAnimationSetting.84ecf4f030', 'Off') }
        ]}
      />
    </SearchableSetting>
  )
}
