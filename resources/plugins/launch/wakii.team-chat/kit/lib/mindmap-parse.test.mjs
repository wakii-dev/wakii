import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMindmap } from './mindmap-parse.mjs'

// Fixture = nguyên văn docs/mindmap.wakii thật (room #orca-test, mindmap
// GitLens-parity). Checkout wakii-dev không có file này (untracked, chỉ sống
// ở worktree room) → test file thật chỉ chạy khi file tồn tại, luôn chạy fixture.
const REAL_MINDMAP = `# wakii-mindmap v1
GitLens-parity (epic)
  Bối cảnh
    FI-35 inline blame đã có: cursor-follow + hover cơ bản + cache + SSH dual-path
    Fix 294a861f472: register IPC git:blame bị merge làm rơi — đã khôi phục + review ok
  SF-1 Hover card blame (ưu tiên 1 — ~2 SF)
    Có
      Hover card GitLens: full commit message, author, ngày tương đối, SHA
      Click SHA mở chi tiết commit
      Blame-previous qua previousHash (field đang UNUSED)
    Không
      Không đổi pipeline IPC/RPC git.blame có sẵn
  SF-2 File-blame toggle (ưu tiên 2 — ~1-1.5 SF)
    Có
      Toggle xem blame cả file dạng cột bên trái
      Trạng thái toggle nhớ theo setting
    Không
      Không thêm poll nền — cache theo HEAD+revision như hiện tại
  SF-3 File history của file (ưu tiên 3 — ~1 SF)
    Có
      filePath + --follow trong GitHistoryOptions (tái dùng panel Git History upstream)
      Mở từ menu chuột phải trong editor, mở tab history của file
      Tái dùng pipeline commit-diff + GitHistoryRow
      Echo-verify trên host SSH/relay cũ (chặn history-toàn-repo im lặng)
    Không
      Không xây panel history mới từ đầu
  Ngoài epic
    Blame graph repo-level, search commit toàn repo, schedule GitLens khác
  DoD chung
    Mason viết acceptance test TRƯỚC code mỗi SF (đỏ → xanh)
    Reviewer độc lập + e2e verify app thật + screenshot trước khi chốt SF
`

const REPO_ROOT = resolve(import.meta.dirname, '../../../../../..')
const REAL_PATH = join(REPO_ROOT, 'docs', 'mindmap.wakii')

function writeFixture(content) {
  const dir = mkdtempSync(join(tmpdir(), 'mindmap-parse-'))
  const path = join(dir, 'mindmap.wakii')
  if (content !== null) writeFileSync(path, content, 'utf8')
  return { dir, path }
}

function withFixture(content, fn) {
  const { dir, path } = writeFixture(content)
  try {
    return fn(path)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('parseMindmap', () => {
  const expectedRoot = {
    text: 'GitLens-parity (epic)',
    depth: 0,
    children: expect.any(Array),
  }

  it('file thật docs/mindmap.wakii (fixture nguyên văn) — cây đúng cấu trúc', () => {
    const tree = withFixture(REAL_MINDMAP, parseMindmap)
    expect(tree).toEqual(expectedRoot)
    expect(tree.children.map((child) => child.text)).toEqual([
      'Bối cảnh',
      'SF-1 Hover card blame (ưu tiên 1 — ~2 SF)',
      'SF-2 File-blame toggle (ưu tiên 2 — ~1-1.5 SF)',
      'SF-3 File history của file (ưu tiên 3 — ~1 SF)',
      'Ngoài epic',
      'DoD chung',
    ])
    const sf1 = tree.children[1]
    expect(sf1.depth).toBe(1)
    expect(sf1.children.map((child) => child.text)).toEqual(['Có', 'Không'])
    expect(sf1.children[0].depth).toBe(2)
    expect(sf1.children[0].children[0].depth).toBe(3)
    expect(sf1.children[0].children[0].text).toContain('Hover card GitLens')
    expect(sf1.children[0].children.every((child) => child.children.length === 0)).toBe(true)
  })

  it('file thật trong repo (nếu có) — parse khớp fixture', () => {
    if (!existsSync(REAL_PATH)) {
      // Checkout wakii-dev không mang mindmap room (untracked worktree-local) — skip
      return
    }
    const tree = parseMindmap(REAL_PATH)
    expect(tree.text).toBe('GitLens-parity (epic)')
    expect(tree.children.length).toBe(6)
  })

  it('file rỗng → null, không throw', () => {
    expect(withFixture('', parseMindmap)).toBeNull()
    expect(withFixture('# wakii-mindmap v1\n\n', parseMindmap)).toBeNull()
  })

  it('file thiếu → null, không throw', () => {
    expect(parseMindmap(join(tmpdir(), `khong-ton-tai-${Date.now()}.wakii`))).toBeNull()
  })
})
