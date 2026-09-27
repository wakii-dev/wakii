// Never-translate tokens discovered from vi pipeline probes (2026-09-27): language-picker
// endonyms MT mangles, code tokens/env names/brands GT-vi returns verbatim. Adding here is a
// no-op for locales whose value is already the en string.
export const NEVER_TRANSLATE_EXTENSIONS = [
  // Language-picker endonyms: MT renders them as the vi/zh word for the language
  // ("Korean") — a picker must keep the endonym (repairCatalog also pins the keys).
  '한국어',
  '日本語',
  '中文（简体）',
  'Español',
  'Français',
  '"',
  'Yolo',
  // vi pass-throughs (probe 2026-09-27): code tokens/env names/brands GT-vi returns
  // verbatim — keep them Latin; adding here is a no-op for locales whose value is
  // already the en string.
  '.mcp.json',
  'Azure DevOps',
  'Bluetooth',
  'Gitea',
  'MiniMax',
  'Wakii CLI',
  'CLI',
  'cli',
  'CLI.',
  'env:',
  'github',
  'gitlab',
  '{{artifact_url}}',
  'auth=Fe26.2**…',
  'Fe26.2**…',
  'opencode.ai/workspace/wrk_…/go',
  'ORCA_AZURE_DEVOPS_ACCESS_TOKEN',
  'ORCA_AZURE_DEVOPS_API_BASE_URL',
  'ORCA_AZURE_DEVOPS_TOKEN',
  'ORCA_BITBUCKET_ACCESS_TOKEN',
  'ORCA_BITBUCKET_API_TOKEN',
  'ORCA_BITBUCKET_EMAIL'
]
