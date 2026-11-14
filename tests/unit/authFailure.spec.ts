import { describe, expect, it } from 'vitest'
import { isNotAuthenticatedError } from '@/lib/authFailure'

describe('isNotAuthenticatedError', () => {
  it('detects PostgREST / RPC auth failures', () => {
    expect(isNotAuthenticatedError({ message: 'NOT_AUTHENTICATED', status: 401 })).toBe(true)
    expect(isNotAuthenticatedError({ message: 'JWT expired', code: 'PGRST301' })).toBe(true)
    expect(isNotAuthenticatedError({ message: 'Reaction failed', code: 'EVENT_NOT_FOUND' })).toBe(
      false,
    )
    expect(isNotAuthenticatedError(null)).toBe(false)
  })
})
