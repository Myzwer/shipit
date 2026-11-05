import { describe, expect, it } from 'vitest'
import { classifyLoginError } from '@/lib/authErrors'

describe('classifyLoginError', () => {
  it('detects invalid credentials', () => {
    expect(classifyLoginError({ message: 'Invalid login credentials', status: 400 })).toBe(
      'invalid_credentials',
    )
  })

  it('detects network failures', () => {
    expect(classifyLoginError({ message: 'Failed to fetch', name: 'TypeError' })).toBe('network')
  })
})
