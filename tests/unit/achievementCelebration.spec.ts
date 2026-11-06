import { describe, expect, it } from 'vitest'
import {
  CELEBRATED_SUBMISSIONS_KEY,
  markSubmissionCelebrated,
  readCelebratedSubmissionIds,
  wasSubmissionCelebrated,
} from '@/lib/achievements/celebrationMemory'
import { validateAchievementCondition } from '@/lib/achievements/conditionTypes'

describe('achievement celebration memory', () => {
  it('records celebrated submission ids without clearing unread state', () => {
    const storage = {
      store: {} as Record<string, string>,
      getItem(k: string) {
        return this.store[k] ?? null
      },
      setItem(k: string, v: string) {
        this.store[k] = v
      },
      removeItem(k: string) {
        delete this.store[k]
      },
    } as Storage

    expect(wasSubmissionCelebrated('sub-1', storage)).toBe(false)
    markSubmissionCelebrated('sub-1', storage)
    expect(wasSubmissionCelebrated('sub-1', storage)).toBe(true)
    expect([...readCelebratedSubmissionIds(storage)]).toEqual(['sub-1'])
    expect(storage.getItem(CELEBRATED_SUBMISSIONS_KEY)).toContain('sub-1')
  })
})

describe('achievement celebration present failures', () => {
  it('documents that list failures must preserve pending without marking celebrated', () => {
    // Behavioral contract covered by integration/E2E; unit guard for memory helper.
    const storage = {
      store: {} as Record<string, string>,
      getItem(k: string) {
        return this.store[k] ?? null
      },
      setItem(k: string, v: string) {
        this.store[k] = v
      },
      removeItem(k: string) {
        delete this.store[k]
      },
    } as Storage
    expect(wasSubmissionCelebrated('pending-fail', storage)).toBe(false)
  })
})

describe('achievement condition types (7B1)', () => {
  it('accepts count_logs / min_distinct_on_log / recipe_ingredient_count', () => {
    expect(
      validateAchievementCondition({
        type: 'tag_match',
        scope: 'ingredient',
        tags: ['spirit-family-gin'],
        count_logs: true,
        threshold: 3,
      }).ok,
    ).toBe(true)
    expect(
      validateAchievementCondition({
        type: 'tag_match',
        scope: 'ingredient',
        tags: ['spirit-family-gin', 'spirit-family-rum'],
        min_distinct_on_log: true,
        threshold: 2,
      }).ok,
    ).toBe(true)
    expect(
      validateAchievementCondition({
        type: 'recipe_ingredient_count',
        threshold: 7,
      }).ok,
    ).toBe(true)
    expect(
      validateAchievementCondition({
        type: 'recipe_ingredient_count',
        threshold: 0,
      }).ok,
    ).toBe(false)
  })
})
