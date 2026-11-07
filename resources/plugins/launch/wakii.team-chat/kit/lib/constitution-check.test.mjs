import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { constitutionCheck, scanClarificationMarkers } from './constitution-check.mjs'

const RULES = '# overlay\n\n- **KHÔNG trailer Co-Authored-By AI vào commit** (ruling 04/10).\n'
const AGENTS = '# AGENTS\n\n- **Keyboard shortcuts**: never hardcode `e.metaKey`.\n'

// Fixture nguồn quy tắc qua opts.readFileSync — không đụng rules/ + AGENTS.md thật.
// Spec đọc từ đĩa thật (đường dẫn mong đợi = specPath); fixture trả nguồn giả.
function fixtureRead(specPath, dir) {
  return (p) => (p === specPath ? readFileSync(p, 'utf8') : p === join(dir, 'agents.md') ? AGENTS : RULES)
}

function withSpec(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'constitution-check-'))
  const specPath = join(dir, 'spec.md')
  if (content !== null) writeFileSync(specPath, content, 'utf8')
  try {
    return fn(specPath, dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('constitutionCheck', () => {
  it('spec vi phạm — bắt được trailer AI + hex tự bịa, RED', () => {
    withSpec('# Spec\n\ncommit kèm `Co-Authored-By: Claude`\nbutton màu `#FF5733` vì đẹp\n', (specPath, dir) => {
      const r = constitutionCheck(specPath, { rulesDir: dir, agentsPath: join(dir, 'agents.md'), readFileSync: fixtureRead(specPath, dir) })
      expect(r.valid).toBe(false)
      const ruleTexts = r.violations.map((v) => v.rule)
      expect(ruleTexts.some((t) => t.includes('Co-Authored-By'))).toBe(true)
      expect(ruleTexts.some((t) => t.includes('hex'))).toBe(true)
      expect(r.violations[0].evidence).toContain('line 3')
    })
  })

  it('spec sạch — GREEN, markers rỗng', () => {
    withSpec('# Spec\n\nDùng token main.css, spawn qua runProcess.\n', (specPath, dir) => {
      const r = constitutionCheck(specPath, { rulesDir: dir, agentsPath: join(dir, 'agents.md'), readFileSync: fixtureRead(specPath, dir) })
      expect(r.valid).toBe(true)
      expect(r.violations).toEqual([])
      expect(r.markers).toEqual([])
    })
  })

  it('file spec thiếu → throw, không trả valid:true câm', () => {
    withSpec(null, (specPath, dir) => {
      expect(() => constitutionCheck(specPath, { rulesDir: dir, agentsPath: join(dir, 'agents.md'), readFileSync: fixtureRead(specPath, dir) })).toThrow()
    })
  })
})

describe('scanClarificationMarkers', () => {
  it('gom marker **[CHƯA RỐ: …]** kèm số line', () => {
    expect(scanClarificationMarkers('ok\n**[CHƯA RỐ: chọn gói retry hay dead-letter]**\n')[0]).toEqual({
      line: 2,
      detail: 'chọn gói retry hay dead-letter',
    })
  })
})
