// Never-translate extensions shared by EVERY locale — review-round hardening (27/09):
// empirically verified against the ja/ko/zh/es/fr catalogs — each entry here renders
// identically under CJK MT, so a global entry never silently reverts an existing
// translation. Everything CJK MT transliterates (WebSocket, Bluetooth, Grep, enums
// like BOARD_LAYOUT, ···/· SSH middle-dot variants, …) lives in
// locale-vi-preserve-english-values.mjs instead. 'Wakii' follows the upstream 'Orca'
// precedent of enforcing the fork brand globally.
export const NEVER_TRANSLATE_EXTENSIONS = [
  '·',
  '>',
  '...',
  'lin_api_...',
  'md',
  'C++',
  'SHA-256',
  'Ctrl+C',
  '.mcp.json',
  'GitHub · Linear',
  '{{artifact_url}}',
  '{{value0}} — {{value1}}',
  '{{count}} × {{label}}',
  '{{count}} × {{reason}}',
  '{{count}} {{label}}',
  '{{name}} +{{count}}',
  '{{value0}} px',
  ':L{{value0}}',
  '-L{{value0}}',
  'PULL_REQUEST',
  'DRAFT_ISSUE',
  'auth=Fe26.2**…',
  'Fe26.2**…',
  'ORCA_AZURE_DEVOPS_ACCESS_TOKEN',
  'ORCA_AZURE_DEVOPS_API_BASE_URL',
  'ORCA_AZURE_DEVOPS_TOKEN',
  'ORCA_BITBUCKET_ACCESS_TOKEN',
  'ORCA_BITBUCKET_API_TOKEN',
  'ORCA_BITBUCKET_EMAIL',
  'src/auth/session.test.ts',
  'src/auth/session.ts',
  'src/cache/worktree-cache.test.ts',
  'src/transport/host-store.test.ts'
]
