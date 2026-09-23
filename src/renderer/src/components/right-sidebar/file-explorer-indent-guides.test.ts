import { describe, expect, it } from 'vitest'
import { getIndentGuideLefts } from './file-explorer-indent-guides'

describe('getIndentGuideLefts', () => {
  it('returns no guides for root-level rows', () => {
    expect(getIndentGuideLefts(0)).toEqual([])
  })

  it('aligns one guide under the depth-0 chevron column', () => {
    expect(getIndentGuideLefts(1)).toEqual([14])
  })

  it('adds one guide per indent level at 16px steps', () => {
    expect(getIndentGuideLefts(3)).toEqual([14, 30, 46])
  })

  it('treats negative depth as no guides', () => {
    expect(getIndentGuideLefts(-1)).toEqual([])
  })
})
