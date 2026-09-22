import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hashPluginTree } from '../../src/main/plugins/plugin-content-hash'

const require = createRequire(import.meta.url)
const { hashPackagedPluginTree } = require('./verify-packaged-plugin-resources.cjs')

// Lockstep giữa 2 implementation hash cây plugin (TS runtime ↔ CJS build-time):
// bất kỳ thay đổi walk/junk/seed/framing chỉ vào 1 bên → test này đỏ. Sửa một
// trong hai file (plugin-content-hash.ts ↔ verify-packaged-plugin-resources.cjs)
// PHẢI chạy test này.

const repoRoot = join(import.meta.dirname, '..', '..')

const FIXTURE_FILES = [
  ['README.md', '# fixture\n'],
  ['nested/deep/file.txt', 'deep bytes\n'],
  ['unicode tên-tiệm-crush/name with spaces.txt', 'x'.repeat(5000)],
  ['binary.bin', Buffer.from(Array.from({ length: 256 }, (_, i) => i))]
]

async function writeTree(root, extraEntries = []) {
  for (const [relPath, content] of [...FIXTURE_FILES, ...extraEntries]) {
    const full = join(root, relPath)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, content)
  }
}

const cjsHashOrThrow = (root) => {
  let value = null
  expect(() => {
    value = hashPackagedPluginTree(root)
  }).not.toThrow()
  return value
}

const tsHashOrFail = async (root) => {
  const result = await hashPluginTree(root)
  expect(result.ok).toBe(true)
  return result.hash
}

describe('plugin tree hash lockstep (TS runtime ↔ CJS build-time)', () => {
  it('hashes identical trees to the same digest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orca-hash-lockstep-'))
    try {
      await writeTree(dir)
      expect(await tsHashOrFail(dir)).toBe(cjsHashOrThrow(dir))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('ignores machine junk (.DS_Store, __pycache__, *.pyc) identically', async () => {
    const clean = await mkdtemp(join(tmpdir(), 'orca-hash-lockstep-'))
    const junky = await mkdtemp(join(tmpdir(), 'orca-hash-lockstep-'))
    try {
      await writeTree(clean)
      await writeTree(junky, [
        ['.DS_Store', 'finder junk'],
        ['__pycache__/stale.pyc', 'bytecode junk'],
        ['loose.pyc', 'bytecode junk'],
        ['nested/__pycache__/more.pyc', 'bytecode junk']
      ])
      const expected = cjsHashOrThrow(clean)
      expect(await tsHashOrFail(junky)).toBe(expected)
      expect(cjsHashOrThrow(junky)).toBe(expected)
    } finally {
      await rm(clean, { recursive: true, force: true })
      await rm(junky, { recursive: true, force: true })
    }
  })

  it('skips a root .git directory identically', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'orca-hash-lockstep-'))
    const withGit = await mkdtemp(join(tmpdir(), 'orca-hash-lockstep-'))
    try {
      await writeTree(plain)
      await writeTree(withGit, [['.git/HEAD', 'ref: refs/heads/main\n']])
      const expected = cjsHashOrThrow(plain)
      expect(await tsHashOrFail(withGit)).toBe(expected)
      expect(cjsHashOrThrow(withGit)).toBe(expected)
    } finally {
      await rm(plain, { recursive: true, force: true })
      await rm(withGit, { recursive: true, force: true })
    }
  })

  it('hashes an empty tree identically', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orca-hash-lockstep-'))
    try {
      expect(await tsHashOrFail(dir)).toBe(cjsHashOrThrow(dir))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects symlinks on both sides', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orca-hash-lockstep-'))
    try {
      await writeTree(dir)
      const target = join(dir, 'README.md')
      try {
        await symlink(target, join(dir, 'nested', 'escape'))
      } catch {
        // Unprivileged Windows không tạo symlink được — case này là của POSIX.
        return
      }
      const ts = await hashPluginTree(dir)
      expect(ts.ok).toBe(false)
      expect(ts.error).toContain('symlink')
      expect(() => hashPackagedPluginTree(dir)).toThrow(/symlink/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects unsafe path segments on both sides', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orca-hash-lockstep-'))
    try {
      await writeTree(dir)
      try {
        await writeFile(join(dir, 'con.txt'), 'reserved device name')
      } catch {
        // Windows không cho tạo tên thiết bị — case này là của POSIX.
        return
      }
      const ts = await hashPluginTree(dir)
      expect(ts.ok).toBe(false)
      expect(ts.error).toContain('unsafe plugin path segment')
      expect(() => hashPackagedPluginTree(dir)).toThrow(/unsafe plugin path segment/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reproduces the shipped bundled-plugin fingerprints on both sides', async () => {
    const { readFileSync } = await import('node:fs')
    const launchRoot = join(repoRoot, 'resources', 'plugins', 'launch')
    const index = JSON.parse(readFileSync(join(launchRoot, 'bundled-plugins.json'), 'utf8'))
    expect(index.plugins.length).toBeGreaterThan(0)
    for (const entry of index.plugins) {
      const pluginRoot = join(launchRoot, entry.path)
      expect(cjsHashOrThrow(pluginRoot)).toBe(entry.contentHash)
      expect(await tsHashOrFail(pluginRoot)).toBe(entry.contentHash)
    }
  })
})
