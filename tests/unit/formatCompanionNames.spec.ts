import { describe, expect, it } from 'vitest'
import {
  compactCompanionByline,
  formatNaturalNameList,
  sanitizeCompanionNames,
} from '../../src/lib/gallery/formatCompanionNames'

describe('formatNaturalNameList', () => {
  it('formats zero, one, two, and many names', () => {
    expect(formatNaturalNameList([])).toBe('')
    expect(formatNaturalNameList(['Aaron'])).toBe('Aaron')
    expect(formatNaturalNameList(['Aaron', 'Cindy'])).toBe('Aaron & Cindy')
    expect(formatNaturalNameList(['Aaron', 'Cindy', 'Josh'])).toBe('Aaron, Cindy & Josh')
  })

  it('preserves David F. / David B. distinctions', () => {
    expect(formatNaturalNameList(['David B.', 'David F.'])).toBe('David B. & David F.')
  })
})

describe('sanitizeCompanionNames', () => {
  it('drops blanks, non-strings, duplicates, and the author', () => {
    expect(
      sanitizeCompanionNames(['Aaron', ' Aaron ', '', 'Aaron', null, 12, 'David'], {
        excludeName: 'David',
      }),
    ).toEqual(['Aaron'])
  })

  it('returns empty for missing companion data', () => {
    expect(sanitizeCompanionNames(undefined)).toEqual([])
    expect(sanitizeCompanionNames(null)).toEqual([])
    expect(sanitizeCompanionNames('Aaron')).toEqual([])
  })
})

describe('compactCompanionByline', () => {
  it('returns none / one / two / many shapes', () => {
    expect(compactCompanionByline([])).toEqual({ mode: 'none' })
    expect(compactCompanionByline(['Aaron'])).toEqual({ mode: 'one', name: 'Aaron' })
    expect(compactCompanionByline(['Aaron', 'Cindy'])).toEqual({
      mode: 'two',
      names: ['Aaron', 'Cindy'],
    })
    expect(compactCompanionByline(['Aaron', 'Cindy', 'Dan', 'Josh', 'Katie'])).toEqual({
      mode: 'many',
      first: 'Aaron',
      remaining: 4,
      all: ['Aaron', 'Cindy', 'Dan', 'Josh', 'Katie'],
    })
  })
})
