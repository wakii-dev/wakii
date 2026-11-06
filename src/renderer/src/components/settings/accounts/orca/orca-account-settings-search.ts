import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '../../search/settings-search-keywords'

export const getOrcaAccountSettingsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.wakiiAccount.account', 'Wakii account'),
    description: translate(
      'auto.components.settings.wakiiAccount.searchDescription',
      'Sign in or out of the account used by Artifacts and Wakii Relay.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.wakiiAccount.keywordAccount', 'account'),
      ...translateSearchKeyword('auto.components.settings.wakiiAccount.keywordLogin', 'login'),
      ...translateSearchKeyword('auto.components.settings.wakiiAccount.keywordLogout', 'logout'),
      ...translateSearchKeyword('auto.components.settings.wakiiAccount.keywordSignIn', 'sign in'),
      ...translateSearchKeyword('auto.components.settings.wakiiAccount.keywordSignOut', 'sign out'),
      ...translateSearchKeyword('auto.components.settings.wakiiAccount.keywordRelay', 'relay'),
      ...translateSearchKeyword('auto.components.settings.wakiiAccount.keywordCloud', 'cloud')
    ]
  }
])
