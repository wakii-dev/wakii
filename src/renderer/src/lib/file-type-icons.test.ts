import {
  Database,
  File,
  FileArchive,
  FileBox,
  FileChartColumn,
  FileCode,
  FileCog,
  FileDiff,
  FileImage,
  FileJson,
  FileKey,
  FileLock,
  FileMusic,
  FileSliders,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo
} from 'lucide-react'
import { describe, expect, it } from 'vitest'
import {
  FILE_ICON_COLOR_CLASS,
  getFileTypeIcon,
  getFileTypeIconColor
} from './file-type-icons'
import { FILE_ICON_BY_EXTENSION } from './file-type-icon-extension-table'
import { FILE_ICON_BY_NAME } from './file-type-icon-name-table'

describe('getFileTypeIcon', () => {
  it('prefers known filenames over generic extensions', () => {
    expect(getFileTypeIcon('package.json')).toBe(FileBox)
    expect(getFileTypeIcon('/repo/tsconfig.json')).toBe(FileSliders)
    expect(getFileTypeIcon('C:\\repo\\.env.local')).toBe(FileLock)
    expect(getFileTypeIcon('README')).toBe(FileText)
    expect(getFileTypeIcon('Dockerfile.dev')).toBe(FileCog)
  })

  it('matches common code, config, document, and media extensions', () => {
    expect(getFileTypeIcon('src/App.tsx')).toBe(FileCode)
    expect(getFileTypeIcon('config/settings.jsonc')).toBe(FileJson)
    expect(getFileTypeIcon('styles/app.css')).toBe(FileType)
    expect(getFileTypeIcon('README.md')).toBe(FileText)
    expect(getFileTypeIcon('assets/logo.png')).toBe(FileImage)
    expect(getFileTypeIcon('notes.patch')).toBe(FileDiff)
  })

  it('uses more specific icons for data, security, and presentation files', () => {
    expect(getFileTypeIcon('db/schema.sql')).toBe(Database)
    expect(getFileTypeIcon('reports/summary.xlsx')).toBe(FileSpreadsheet)
    expect(getFileTypeIcon('certs/server.pem')).toBe(FileKey)
    expect(getFileTypeIcon('slides/status.pptx')).toBe(FileChartColumn)
  })

  it('handles compound archive extensions before their trailing extension', () => {
    expect(getFileTypeIcon('release.tar.gz')).toBe(FileArchive)
  })

  it('matches audio and video extensions', () => {
    expect(getFileTypeIcon('sound/theme.mp3')).toBe(FileMusic)
    expect(getFileTypeIcon('demo.mov')).toBe(FileVideo)
  })

  it('falls back to the generic file icon for unknown files', () => {
    expect(getFileTypeIcon('unknown.customtype')).toBe(File)
  })
})

describe('getFileTypeIconColor', () => {
  it('groups TS/JS extensions distinctly from other code', () => {
    expect(getFileTypeIconColor('src/App.tsx')).toBe('codeTsJs')
    expect(getFileTypeIconColor('lib/run.js')).toBe('codeTsJs')
    expect(getFileTypeIconColor('mod.mjs')).toBe('codeTsJs')
    expect(getFileTypeIconColor('node.cts')).toBe('codeTsJs')
    expect(getFileTypeIconColor('server.py')).toBe('code')
    expect(getFileTypeIconColor('core.rs')).toBe('code')
    expect(getFileTypeIconColor('main.go')).toBe('code')
  })

  it('groups data/config extensions', () => {
    expect(getFileTypeIconColor('settings.local.json')).toBe('dataConfig')
    expect(getFileTypeIconColor('config/app.yaml')).toBe('dataConfig')
    expect(getFileTypeIconColor('db/schema.sql')).toBe('dataConfig')
    expect(getFileTypeIconColor('app.properties')).toBe('dataConfig')
  })

  it('groups markup/document extensions', () => {
    expect(getFileTypeIconColor('notes/guide.md')).toBe('markupDoc')
    expect(getFileTypeIconColor('README.txt')).toBe('markupDoc')
    expect(getFileTypeIconColor('manual.pdf')).toBe('markupDoc')
    expect(getFileTypeIconColor('fix.patch')).toBe('markupDoc')
  })

  it('groups web/style extensions', () => {
    expect(getFileTypeIconColor('styles/app.css')).toBe('webStyle')
    expect(getFileTypeIconColor('theme.scss')).toBe('webStyle')
    expect(getFileTypeIconColor('index.html')).toBe('webStyle')
  })

  it('groups shell extensions', () => {
    expect(getFileTypeIconColor('deploy.sh')).toBe('shell')
    expect(getFileTypeIconColor('setup.ps1')).toBe('shell')
    expect(getFileTypeIconColor('build.bat')).toBe('shell')
  })

  it('groups binary/build extensions', () => {
    expect(getFileTypeIconColor('release.tar.gz')).toBe('binaryBuild')
    expect(getFileTypeIconColor('bundle.zip')).toBe('binaryBuild')
    expect(getFileTypeIconColor('composer.lock')).toBe('nameBased')
    expect(getFileTypeIconColor('misc.lock')).toBe('binaryBuild')
  })

  it('groups asset extensions', () => {
    expect(getFileTypeIconColor('assets/logo.png')).toBe('asset')
    expect(getFileTypeIconColor('demo.mov')).toBe('asset')
    expect(getFileTypeIconColor('font.woff2')).toBe('asset')
    expect(getFileTypeIconColor('icon.svg')).toBe('asset')
  })

  it('covers the name-based branch with its own group', () => {
    expect(getFileTypeIconColor('package.json')).toBe('nameBased')
    expect(getFileTypeIconColor('/repo/tsconfig.json')).toBe('nameBased')
    expect(getFileTypeIconColor('C:\\repo\\.env.local')).toBe('nameBased')
    expect(getFileTypeIconColor('Dockerfile.dev')).toBe('nameBased')
    expect(getFileTypeIconColor('Makefile')).toBe('nameBased')
    expect(getFileTypeIconColor('README')).toBe('nameBased')
    expect(getFileTypeIconColor('pnpm-lock.yaml')).toBe('nameBased')
  })

  it('returns null for unknown extensions so surfaces keep the muted default', () => {
    expect(getFileTypeIconColor('unknown.customtype')).toBeNull()
    expect(getFileTypeIconColor('noextension')).toBeNull()
    expect(getFileTypeIconColor('')).toBeNull()
    expect(getFileTypeIconColor(undefined)).toBeNull()
  })

  it('never colors simulator tabs', () => {
    expect(getFileTypeIconColor('mobile emulator')).toBeNull()
    expect(getFileTypeIconColor('simulator')).toBeNull()
  })

  it('is case-insensitive', () => {
    // 'readme.md' is an exact name-table entry, so the name-based branch wins —
    // mirroring getFileTypeIcon's resolution order.
    expect(getFileTypeIconColor('README.MD')).toBe('nameBased')
    expect(getFileTypeIconColor('Notes.TXT')).toBe('markupDoc')
    expect(getFileTypeIconColor('App.TSX')).toBe('codeTsJs')
  })

  it('maps every group to a literal text class', () => {
    expect(Object.keys(FILE_ICON_COLOR_CLASS).sort()).toEqual(
      [
        'asset',
        'binaryBuild',
        'code',
        'codeTsJs',
        'dataConfig',
        'markupDoc',
        'nameBased',
        'shell',
        'webStyle'
      ].sort()
    )
    expect(FILE_ICON_COLOR_CLASS.codeTsJs).toBe('text-file-icon-code-ts-js')
    expect(FILE_ICON_COLOR_CLASS.code).toBe('text-file-icon-code')
    expect(FILE_ICON_COLOR_CLASS.dataConfig).toBe('text-file-icon-data-config')
    expect(FILE_ICON_COLOR_CLASS.markupDoc).toBe('text-file-icon-markup-doc')
    expect(FILE_ICON_COLOR_CLASS.webStyle).toBe('text-file-icon-web-style')
    expect(FILE_ICON_COLOR_CLASS.shell).toBe('text-file-icon-shell')
    expect(FILE_ICON_COLOR_CLASS.binaryBuild).toBe('text-file-icon-binary-build')
    expect(FILE_ICON_COLOR_CLASS.asset).toBe('text-file-icon-asset')
    expect(FILE_ICON_COLOR_CLASS.nameBased).toBe('text-file-icon-name-based')
  })

  it('assigns a color group to every extension the icon table knows', () => {
    const uncovered = Object.keys(FILE_ICON_BY_EXTENSION).filter(
      (extension) => getFileTypeIconColor(`file.${extension}`) === null
    )
    expect(uncovered).toEqual([])
  })

  it('assigns a color group to every name the name table knows', () => {
    const uncovered = Object.keys(FILE_ICON_BY_NAME).filter(
      (name) => getFileTypeIconColor(name) === null
    )
    expect(uncovered).toEqual([])
  })
})
