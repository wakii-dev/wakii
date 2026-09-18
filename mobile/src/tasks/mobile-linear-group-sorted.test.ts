import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LinearIssue } from './mobile-tasks-provider-detail-types'
import {
  compareLinearIssues,
  getLinearIssueGroup,
  groupLinearIssues
} from './mobile-tasks-reviewer-linear'

vi.mock('./mobile-tasks-dependencies', () => import('../theme/mobile-theme'))
afterEach(() => vi.restoreAllMocks())

const issues: LinearIssue[] = Array.from({ length: 60 }, (_, i) => ({
  id: `${i}`,
  identifier: ['ENG-10', 'ENG-2', 'Ä-1', 'Å-1', 'é-2', 'é-2', 'İ-3'][i % 7],
  title: 'Task',
  url: '',
  labels: [],
  priority: i % 5,
  updatedAt: ['2026-02-01', 'invalid', '1970-01-01', '2026-02-01', '2025-01-01'][
    Math.floor(i / 5) % 5
  ],
  state: { name: i % 2 ? 'Todo' : 'Done', type: 'started', color: '' },
  team: { id: `${i % 3}`, name: `Team ${i % 3}`, key: 'ENG' }
}))

describe('mobile Linear grouping of sorted issues', () => {
  it.each(['updated', 'identifier', 'priority'] as const)(
    'preserves %s ordering, ties and group metadata',
    (order) => {
      for (const group of ['none', 'status', 'assignee', 'team', 'priority'] as const) {
        const actual = groupLinearIssues([...issues], group, order)
        const expected = [...issues].sort((a, b) => compareLinearIssues(a, b, order))
        if (group === 'none') {
          expect(actual[0].issues).toEqual(expected)
        }
        actual.forEach((section) => {
          expect(section.key).toBe(
            section.issues.length ? getLinearIssueGroup(section.issues[0], group).key : section.key
          )
          section.issues.forEach((issue, offset) => {
            const prior = section.issues[offset - 1]
            if (prior) {
              // Sections must be sorted under the same comparator the grouping sorted with.
              expect(compareLinearIssues(prior, issue, order)).toBeLessThanOrEqual(0)
            }
          })
        })
        if (group === 'none') {
          expect(actual[0].issues).not.toBe(issues)
        }
      }
    }
  )

  it('identifier ordering parses no dates', () => {
    const parse = vi.spyOn(Date, 'parse')
    groupLinearIssues([...issues], 'status', 'identifier')
    expect(parse).not.toHaveBeenCalled()
    groupLinearIssues([...issues], 'status', 'updated')
    expect(parse).toHaveBeenCalled()
  })

  it('returns independent issue arrays for empty, singleton and ungrouped inputs', () => {
    for (const input of [[], [issues[0]], issues]) {
      const first = groupLinearIssues([...input], 'none', 'identifier')
      const second = groupLinearIssues([...input], 'none', 'identifier')
      expect(first).toEqual(second)
      expect(first[0].issues).not.toBe(second[0].issues)
      first[0].issues.pop()
      expect(second[0].issues).toEqual([...input].sort((a, b) => compareLinearIssues(a, b, 'identifier')))
    }
    expect(groupLinearIssues([], 'status', 'updated')).toEqual([])
  })
})
