import type React from 'react'
import type { Repo } from '../../../../../shared/repo-types'
import { SearchableSetting } from '../SearchableSetting'
import { translateSearchKeyword } from '../settings-search-keywords'
import { RepoSettingsDraftInput } from './RepositorySettingsDraftInput'
import { Label } from '../../ui/label'
import { translate } from '@/i18n/i18n'

export function RepositoryRulesSection({
  repo,
  updateRepo,
  forceVisible
}: {
  repo: Repo
  updateRepo: (id: string, updates: { rulesDeclaration: string | undefined }) => unknown
  forceVisible?: boolean
}): React.JSX.Element {
  const label = translate('components.RepositoryRulesSection.title', 'Rules Declaration')
  return (
    <SearchableSetting
      title={label}
      description={translate(
        'components.RepositoryRulesSection.description',
        'Path of the per-project rules declaration sheet, relative to the repo root (for example rules/projects/my-project.json). Agents load the rules it points to; empty falls back to the sample sheets in rules/projects/.'
      )}
      keywords={[
        repo.displayName,
        ...translateSearchKeyword('components.RepositoryRulesSection.keywordRules', 'rules'),
        ...translateSearchKeyword(
          'components.RepositoryRulesSection.keywordDeclaration',
          'rules declaration'
        )
      ]}
      forceVisible={forceVisible}
      className="space-y-2"
    >
      <Label htmlFor={`repo-rules-declaration-${repo.id}`} className="text-sm font-semibold">
        {label}
      </Label>
      <RepoSettingsDraftInput
        id={`repo-rules-declaration-${repo.id}`}
        repoId={repo.id}
        storeValue={repo.rulesDeclaration ?? ''}
        onTextChange={(text) =>
          updateRepo(repo.id, { rulesDeclaration: text.trim() ? text : undefined })
        }
        placeholder={translate('components.RepositoryRulesSection.placeholder', 'rules/projects/…')}
        className="h-9 text-sm font-mono"
      />
    </SearchableSetting>
  )
}
