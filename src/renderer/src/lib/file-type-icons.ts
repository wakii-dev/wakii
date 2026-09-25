import { File, FileCog, FileLock, FileTerminal, Smartphone, type LucideIcon } from 'lucide-react'
import { COMPOUND_EXTENSIONS, FILE_ICON_BY_EXTENSION } from './file-type-icon-extension-table'
import { FILE_ICON_BY_NAME } from './file-type-icon-name-table'

export type FileTypeIconColorGroup =
  | 'codeTsJs'
  | 'code'
  | 'dataConfig'
  | 'markupDoc'
  | 'webStyle'
  | 'shell'
  | 'binaryBuild'
  | 'asset'
  | 'nameBased'

// Contract C1 (spec FI-28): literal class values only — Tailwind v4 scans these
// strings and `require-static-classes` bans building class names at runtime.
export const FILE_ICON_COLOR_CLASS: Record<FileTypeIconColorGroup, string> = {
  codeTsJs: 'text-file-icon-code-ts-js',
  code: 'text-file-icon-code',
  dataConfig: 'text-file-icon-data-config',
  markupDoc: 'text-file-icon-markup-doc',
  webStyle: 'text-file-icon-web-style',
  shell: 'text-file-icon-shell',
  binaryBuild: 'text-file-icon-binary-build',
  asset: 'text-file-icon-asset',
  nameBased: 'text-file-icon-name-based'
}

function extensionGroup(
  extensions: readonly string[],
  group: FileTypeIconColorGroup
): Record<string, FileTypeIconColorGroup> {
  return Object.fromEntries(extensions.map((extension) => [extension, group]))
}

// Why: mirrors FILE_ICON_BY_EXTENSION — the classifier test asserts total
// coverage so a new extension cannot land without a color group.
const EXTENSION_COLOR_GROUPS: Record<string, FileTypeIconColorGroup> = {
  ...extensionGroup(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'], 'codeTsJs'),
  ...extensionGroup(
    [
      'astro', 'c', 'cc', 'clj', 'cpp', 'cs', 'cxx', 'dart', 'erl', 'ex', 'exs', 'fs', 'fsx',
      'go', 'h', 'hpp', 'hrl', 'hs', 'java', 'kt', 'kts', 'lua', 'nim', 'php', 'pl', 'pm',
      'py', 'r', 'rb', 'rs', 'scala', 'sol', 'svelte', 'swift', 'vb', 'vue', 'zig'
    ],
    'code'
  ),
  ...extensionGroup(
    [
      'asc', 'cer', 'cfg', 'conf', 'crt', 'csv', 'db', 'duckdb', 'gpg', 'gql', 'graphql',
      'hcl', 'ini', 'ipynb', 'json', 'json5', 'jsonc', 'key', 'mmd', 'ods', 'p12', 'pem',
      'pfx', 'prisma', 'properties', 'proto', 'pub', 'sql', 'sqlite', 'sqlite3', 'tf',
      'tfvars', 'toml', 'tsv', 'xls', 'xlsx', 'xml', 'yaml', 'yml'
    ],
    'dataConfig'
  ),
  ...extensionGroup(
    ['adoc', 'diff', 'doc', 'docx', 'log', 'md', 'mdx', 'patch', 'pdf', 'ppt', 'pptx', 'rst', 'rtf', 'tex', 'txt'],
    'markupDoc'
  ),
  ...extensionGroup(['css', 'htm', 'html', 'less', 'sass', 'scss', 'xhtml'], 'webStyle'),
  ...extensionGroup(['bash', 'bat', 'cmd', 'fish', 'nu', 'ps1', 'sh', 'zsh'], 'shell'),
  ...extensionGroup(
    ['7z', 'br', 'bz2', 'dmg', 'gradle', 'gz', 'iso', 'lock', 'rar', 'tar', 'tar.bz2', 'tar.gz', 'tar.xz', 'tbz2', 'tgz', 'txz', 'xz', 'zip'],
    'binaryBuild'
  ),
  ...extensionGroup(
    [
      'aac', 'ai', 'avi', 'avif', 'blend', 'bmp', 'eot', 'eps', 'fbx', 'flac', 'gif', 'glb',
      'gltf', 'heic', 'ico', 'jpeg', 'jpg', 'm4a', 'm4v', 'mkv', 'mov', 'mp3', 'mp4', 'mpeg',
      'mpg', 'obj', 'ogg', 'opus', 'otf', 'png', 'psd', 'svg', 'stl', 'tif', 'tiff', 'ttf',
      'wav', 'webm', 'webp', 'woff', 'woff2'
    ],
    'asset'
  )
}

type FileIconClassification = {
  icon: LucideIcon
  colorGroup: FileTypeIconColorGroup | null
}

// Shared classifier for icon + color: both branches (name table, extension
// table) resolve in one pass so the two can never drift apart.
function classifyFile(filename: string): FileIconClassification {
  const lowerName = filename.toLowerCase()
  const exactMatch = FILE_ICON_BY_NAME[lowerName]
  if (exactMatch) {
    return { icon: exactMatch, colorGroup: 'nameBased' }
  }

  // Why: simulator tabs reuse EditorFileTab chrome with a synthetic label path.
  if (lowerName === 'mobile emulator' || lowerName === 'simulator') {
    return { icon: Smartphone, colorGroup: null }
  }

  if (lowerName === '.env' || lowerName.startsWith('.env.')) {
    return { icon: FileLock, colorGroup: 'nameBased' }
  }

  if (lowerName === 'dockerfile' || lowerName.startsWith('dockerfile.')) {
    return { icon: FileCog, colorGroup: 'nameBased' }
  }

  if (lowerName === 'makefile' || lowerName.startsWith('makefile.')) {
    return { icon: FileTerminal, colorGroup: 'nameBased' }
  }

  // Why: filename/extension matching keeps icons deterministic for SSH worktrees
  // where OS-native file associations are not available.
  const extension = getExtension(filename)
  return {
    icon: FILE_ICON_BY_EXTENSION[extension] ?? File,
    colorGroup: EXTENSION_COLOR_GROUPS[extension] ?? null
  }
}

function getFilename(filePath: string | undefined | null): string {
  if (!filePath) {
    return ''
  }
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath
}

function getExtension(filename: string): string {
  const lowerName = filename.toLowerCase()
  const compoundExtension = COMPOUND_EXTENSIONS.find((ext) => lowerName.endsWith(`.${ext}`))
  if (compoundExtension) {
    return compoundExtension
  }

  const lastDot = filename.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return ''
  }

  return filename.slice(lastDot + 1).toLowerCase()
}

export function getFileTypeIcon(filePath: string | undefined | null): LucideIcon {
  const filename = getFilename(filePath)
  if (!filename) {
    return File
  }
  return classifyFile(filename).icon
}

export function getFileTypeIconColor(filePath: string | undefined | null): FileTypeIconColorGroup | null {
  const filename = getFilename(filePath)
  if (!filename) {
    return null
  }
  return classifyFile(filename).colorGroup
}
