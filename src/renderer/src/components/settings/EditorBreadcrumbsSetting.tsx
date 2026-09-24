import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'

type EditorBreadcrumbsSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function EditorBreadcrumbsSetting({
  settings,
  updateSettings
}: EditorBreadcrumbsSettingProps): React.JSX.Element {
  return (
    <SearchableSetting
      title={translate('auto.components.settings.EditorBreadcrumbsSetting.fe2cb0ef78', 'Breadcrumbs')}
      description={translate(
        'auto.components.settings.EditorBreadcrumbsSetting.9e7a1f613e',
        'Show the file path above the file editor.'
      )}
      keywords={['breadcrumbs', 'path', 'editor', 'reveal', 'explorer']}
    >
      <SettingsSwitchRow
        label={translate('auto.components.settings.EditorBreadcrumbsSetting.fe2cb0ef78', 'Breadcrumbs')}
        description={translate(
          'auto.components.settings.EditorBreadcrumbsSetting.9e7a1f613e',
          'Show the file path above the file editor.'
        )}
        checked={settings.editorBreadcrumbsEnabled ?? true}
        onChange={() =>
          updateSettings({ editorBreadcrumbsEnabled: !(settings.editorBreadcrumbsEnabled ?? true) })
        }
      />
    </SearchableSetting>
  )
}
