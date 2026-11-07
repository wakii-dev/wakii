import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWakiiRulesConfig, readWakiiRulesConfig } from './wakii-yaml-rules-config'

describe('parseWakiiRulesConfig', () => {
  it('parses rules.declaration from a valid wakii.yaml', () => {
    expect(
      parseWakiiRulesConfig(
        '# Wakii project config — rules\nrules:\n  declaration: rules/projects/wakii-desktop.json\n',
      ),
    ).toEqual({ declaration: 'rules/projects/wakii-desktop.json' })
  })

  it('trims surrounding whitespace in declaration', () => {
    expect(parseWakiiRulesConfig('rules:\n  declaration: "  rules/projects/x.json  "\n')).toEqual({
      declaration: 'rules/projects/x.json',
    })
  })

  it('tolerates unrelated top-level sections', () => {
    expect(
      parseWakiiRulesConfig('scripts:\n  setup: pnpm install\nrules:\n  declaration: rules/projects/x.json\n'),
    ).toEqual({ declaration: 'rules/projects/x.json' })
  })

  it('returns null when the rules section is absent', () => {
    expect(parseWakiiRulesConfig('scripts:\n  setup: pnpm install\n')).toBeNull()
  })

  it('returns null on empty file', () => {
    expect(parseWakiiRulesConfig('')).toBeNull()
  })

  it('returns null when declaration is missing', () => {
    expect(parseWakiiRulesConfig('rules:\n  other: value\n')).toBeNull()
  })

  it('returns null when declaration is not a string', () => {
    expect(parseWakiiRulesConfig('rules:\n  declaration: 42\n')).toBeNull()
    expect(parseWakiiRulesConfig('rules:\n  declaration:\n    - a\n')).toBeNull()
  })

  it('returns null when declaration is blank', () => {
    expect(parseWakiiRulesConfig('rules:\n  declaration: "   "\n')).toBeNull()
  })

  it('returns null on invalid YAML syntax', () => {
    expect(parseWakiiRulesConfig('rules:\n  declaration: [unclosed\n')).toBeNull()
  })

  it('returns null on non-mapping document', () => {
    expect(parseWakiiRulesConfig('- just\n- a\n- list\n')).toBeNull()
  })
})

describe('readWakiiRulesConfig', () => {
  it('reads the declaration from a repo root with wakii.yaml', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wakii-yaml-test-'))
    try {
      fs.writeFileSync(path.join(root, 'wakii.yaml'), 'rules:\n  declaration: rules/projects/p.json\n')
      expect(readWakiiRulesConfig(root)).toEqual({ declaration: 'rules/projects/p.json' })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns null when wakii.yaml does not exist', () => {
    expect(readWakiiRulesConfig(path.join(os.tmpdir(), 'wakii-yaml-missing-root'))).toBeNull()
  })

  it('returns null when wakii.yaml has no rules section', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wakii-yaml-test-'))
    try {
      fs.writeFileSync(path.join(root, 'wakii.yaml'), 'scripts:\n  setup: pnpm install\n')
      expect(readWakiiRulesConfig(root)).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns null when wakii.yaml is malformed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wakii-yaml-test-'))
    try {
      fs.writeFileSync(path.join(root, 'wakii.yaml'), 'rules: [broken\n')
      expect(readWakiiRulesConfig(root)).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
