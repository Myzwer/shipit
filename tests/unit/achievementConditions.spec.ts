import { describe, expect, it } from 'vitest'
import {
  validateAchievementCondition,
  ACHIEVEMENT_CONDITION_TYPES,
} from '@/lib/achievements/conditionTypes'

describe('achievement condition validation', () => {
  it('accepts known primitive types', () => {
    for (const type of ACHIEVEMENT_CONDITION_TYPES) {
      if (type === 'all' || type === 'any') continue
      const base: Record<string, unknown> = { type }
      if (type === 'event_count') {
        base.event = 'drink_log'
        base.threshold = 1
      }
      if (type === 'tag_match') {
        base.scope = 'ingredient'
        base.tags = ['rum']
      }
      const res = validateAchievementCondition(base)
      expect(res.ok).toBe(true)
    }
  })

  it('rejects unknown types', () => {
    const res = validateAchievementCondition({ type: 'eval_javascript', code: '1+1' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('UNKNOWN_CONDITION_TYPE')
  })

  it('validates nested all/any', () => {
    const ok = validateAchievementCondition({
      type: 'all',
      conditions: [
        { type: 'event_count', event: 'drink_log', threshold: 1 },
        { type: 'exact_match', drink_mode: 'generic_beer' },
      ],
    })
    expect(ok.ok).toBe(true)

    const deep = validateAchievementCondition({
      type: 'all',
      conditions: [
        {
          type: 'any',
          conditions: [
            {
              type: 'all',
              conditions: [
                {
                  type: 'any',
                  conditions: [
                    {
                      type: 'all',
                      conditions: [{ type: 'event_count', event: 'drink_log', threshold: 1 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(deep.ok).toBe(false)
  })

  it('requires threshold on event_count', () => {
    const res = validateAchievementCondition({ type: 'event_count', event: 'drink_log' })
    expect(res.ok).toBe(false)
  })
})
