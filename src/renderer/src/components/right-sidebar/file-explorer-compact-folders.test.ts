import { describe, expect, it } from 'vitest'
import type { DirCache, TreeNode } from './file-explorer-types'
import { createVisibleFileExplorerRowProjection } from './useFileExplorerVisibleRowProjection'

function row(relativePath: string, isDirectory = false, depth?: number): TreeNode {
  return {
    name: relativePath.split('/').at(-1) ?? relativePath,
    path: `/repo/${relativePath}`,
    relativePath,
    isDirectory,
    depth: depth ?? relativePath.split('/').length - 1
  }
}

function symlinkedRow(relativePath: string, depth = 0): TreeNode {
  return { ...row(relativePath, true, depth), isSymlink: true }
}

function cache(childrenByPath: Record<string, TreeNode[]>): Record<string, DirCache> {
  const dirCache: Record<string, DirCache> = {}
  for (const [path, children] of Object.entries(childrenByPath)) {
    dirCache[path] = { children }
  }
  return dirCache
}

function project(
  childrenByPath: Record<string, TreeNode[]>,
  expandedPaths: string[] = [],
  options?: { showDotfiles?: boolean; ignoredSet?: Set<string>; showGitIgnoredFiles?: boolean }
) {
  return createVisibleFileExplorerRowProjection(
    { dirCache: cache(childrenByPath), expanded: new Set(expandedPaths), worktreePath: '/repo' },
    {
      ignoredSet: options?.ignoredSet ?? new Set(),
      showDotfiles: options?.showDotfiles ?? true,
      showGitIgnoredFiles: options?.showGitIgnoredFiles ?? true
    }
  )
}

describe('file explorer compact folders', () => {
  it('merges a single-child folder chain into one row showing a/b/c', () => {
    const projection = project({
      '/repo': [row('a', true, 0), row('root.ts')],
      '/repo/a': [row('a/b', true, 1)],
      '/repo/a/b': [row('a/b/c', true, 2)],
      '/repo/a/b/c': [row('a/b/c/f.ts')]
    })

    expect(projection.getVisibleCount()).toBe(2)
    const compacted = projection.getRowByPath('/repo/a')
    expect(compacted?.name).toBe('a/b/c')
    expect(compacted?.isDirectory).toBe(true)
    expect(compacted?.depth).toBe(0)
    expect(projection.hasPath('/repo/a/b')).toBe(false)
  })

  it('keeps the first chain folder as the row path so a click expands one level', () => {
    const projection = project(
      {
        '/repo': [row('a', true, 0)],
        '/repo/a': [row('a/b', true, 1)],
        '/repo/a/b': [row('a/b/c', true, 2)],
        '/repo/a/b/c': [row('a/b/c/f.ts')]
      },
      ['/repo/a']
    )

    expect(projection.getVisibleSlice(0, 5).map((entry) => entry.name)).toEqual(['a', 'b/c'])
    expect(projection.getRowByPath('/repo/a/b')?.name).toBe('b/c')
  })

  it('shows each level separately once the whole chain is expanded', () => {
    const projection = project(
      {
        '/repo': [row('a', true, 0)],
        '/repo/a': [row('a/b', true, 1)],
        '/repo/a/b': [row('a/b/c', true, 2)],
        '/repo/a/b/c': [row('a/b/c/f.ts')]
      },
      ['/repo/a', '/repo/a/b', '/repo/a/b/c']
    )

    expect(projection.getVisibleSlice(0, 5).map((entry) => entry.name)).toEqual([
      'a',
      'b',
      'c',
      'f.ts'
    ])
  })

  it('does not compact a folder with more than one visible child', () => {
    const projection = project({
      '/repo': [row('a', true, 0)],
      '/repo/a': [row('a/b', true, 1), row('a/x.ts')]
    })

    expect(projection.getRowByPath('/repo/a')?.name).toBe('a')
  })

  it('does not compact when the single child is a file', () => {
    const projection = project({
      '/repo': [row('a', true, 0)],
      '/repo/a': [row('a/f.ts')]
    })

    expect(projection.getRowByPath('/repo/a')?.name).toBe('a')
  })

  it('does not compact through a symlink child', () => {
    const projection = project({
      '/repo': [row('a', true, 0)],
      '/repo/a': [symlinkedRow('a/link', 1)],
      '/repo/a/link': [row('a/link/deep.ts')]
    })

    expect(projection.getRowByPath('/repo/a')?.name).toBe('a')
  })

  it('treats a hidden dotfile child as no visible child', () => {
    const projection = project(
      {
        '/repo': [row('a', true, 0)],
        '/repo/a': [row('a/.hidden', true, 1)]
      },
      [],
      { showDotfiles: false }
    )

    expect(projection.getRowByPath('/repo/a')?.name).toBe('a')
  })

  it('treats a git-ignored child as no visible child when ignored files are hidden', () => {
    const projection = project(
      {
        '/repo': [row('a', true, 0)],
        '/repo/a': [row('a/dist', true, 1)]
      },
      [],
      { ignoredSet: new Set(['a/dist']), showGitIgnoredFiles: false }
    )

    expect(projection.getRowByPath('/repo/a')?.name).toBe('a')
  })

  it('ends the chain at an unknown listing without inventing deeper names', () => {
    const projection = project({
      '/repo': [row('a', true, 0)],
      '/repo/a': [row('a/b', true, 1)]
    })

    expect(projection.getRowByPath('/repo/a')?.name).toBe('a/b')
  })

  it('does not mutate the cached node when compacting the display name', () => {
    const childrenByPath = {
      '/repo': [row('a', true, 0)],
      '/repo/a': [row('a/b', true, 1)],
      '/repo/a/b': [row('a/b/c', true, 2)],
      '/repo/a/b/c': [row('a/b/c/f.ts')]
    }
    const dirCache = cache(childrenByPath)
    createVisibleFileExplorerRowProjection(
      { dirCache, expanded: new Set(['/repo/a']), worktreePath: '/repo' },
      { ignoredSet: new Set(), showDotfiles: true, showGitIgnoredFiles: true }
    )

    expect(dirCache['/repo']?.children[0]?.name).toBe('a')
  })
})
