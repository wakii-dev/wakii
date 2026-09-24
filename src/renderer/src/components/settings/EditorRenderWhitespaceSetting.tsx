import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { Label } from '../ui/label'
import { SettingsSegmentedControl } from './SettingsFormControls'

type EditorRenderWhitespaceSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function EditorRenderWhitespaceSetting({
  settings,
  updateSettings
}: EditorRenderWhitespaceSettingProps): React.JSX.Element {
  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.EditorRenderWhitespaceSetting.085871d375',
        'Render Whitespace'
      )}
      description={translate(
        'auto.components.settings.EditorRenderWhitespaceSetting.628ef71b4c',
        'Show whitespace characters in file editors.'
      )}
      keywords={['editor', 'whitespace', 'spaces', 'tabs', 'render']}
      className="flex items-center justify-between gap-4 py-2"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label>
          {translate(
            'auto.components.settings.EditorRenderWhitespaceSetting.085871d375',
            'Render Whitespace'
          )}
        </Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.EditorRenderWhitespaceSetting.628ef71b4c',
            'Show whitespace characters in file editors.'
          )}
        </p>
      </div>
      <SettingsSegmentedControl
        ariaLabel={translate(
          'auto.components.settings.EditorRenderWhitespaceSetting.085871d375',
          'Render Whitespace'
        )}
        value={settings.editorRenderWhitespace ?? 'selection'}
        onChange={(option) => updateSettings({ editorRenderWhitespace: option })}
        options={[
          {
            value: 'none',
            label: translate('auto.components.settings.EditorRenderWhitespaceSetting.f08dbab703', 'None')
          },
          {
            value: 'boundary',
            label: translate(
              'auto.components.settings.EditorRenderWhitespaceSetting.6bce99b8b5',
              'Boundary'
            )
          },
          {
            value: 'selection',
            label: translate(
              'auto.components.settings.EditorRenderWhitespaceSetting.e1f52833fb',
              'Selection'
            )
          },
          {
            value: 'trailing',
            label: translate(
              'auto.components.settings.EditorRenderWhitespaceSetting.09b41c31fb',
              'Trailing'
            )
          },
          {
            value: 'all',
            label: translate('auto.components.settings.EditorRenderWhitespaceSetting.b0974f678a', 'All')
          }
        ]}
      />
    </SearchableSetting>
  )
}
