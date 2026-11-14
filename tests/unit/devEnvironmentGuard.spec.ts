import { describe, expect, it } from 'vitest'
import {
  DISPOSABLE_ALT_API_PORT,
  QA2_BACKEND_API_PORT,
  apiPortFromUrl,
  isLocalSupabaseUrl,
  isWithinPrivateGrace,
} from '../helpers/devEnvironmentGuard'

describe('devEnvironmentGuard URL helpers', () => {
  it('accepts primary, Agent1, and Agent2 local stacks only', () => {
    expect(isLocalSupabaseUrl('http://127.0.0.1:54321')).toBe(true)
    expect(isLocalSupabaseUrl(`http://127.0.0.1:${DISPOSABLE_ALT_API_PORT}`)).toBe(true)
    expect(isLocalSupabaseUrl(`http://127.0.0.1:${QA2_BACKEND_API_PORT}`)).toBe(true)
    expect(isLocalSupabaseUrl('http://127.0.0.1:54322')).toBe(false)
    expect(isLocalSupabaseUrl('https://xyz.supabase.co')).toBe(false)
  })

  it('parses API ports for organizer vs disposable routing', () => {
    expect(apiPortFromUrl('http://127.0.0.1:54321')).toBe('54321')
    expect(apiPortFromUrl(`http://127.0.0.1:${DISPOSABLE_ALT_API_PORT}`)).toBe(
      DISPOSABLE_ALT_API_PORT,
    )
    expect(apiPortFromUrl(`http://127.0.0.1:${QA2_BACKEND_API_PORT}`)).toBe(
      QA2_BACKEND_API_PORT,
    )
  })

  it('keeps grace helper consistent with SQL half-open semantics', () => {
    const end = 1_000_000
    expect(isWithinPrivateGrace({ atUtcMs: end, prevEndUtcMs: end })).toBe(true)
    expect(isWithinPrivateGrace({ atUtcMs: end + 15 * 60_000 - 1, prevEndUtcMs: end })).toBe(
      true,
    )
    expect(isWithinPrivateGrace({ atUtcMs: end + 15 * 60_000, prevEndUtcMs: end })).toBe(false)
  })
})
