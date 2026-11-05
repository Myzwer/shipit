import { describe, expect, it } from 'vitest'
import { copy, formatCopy } from '@/ui/copy'

describe('approved copy', () => {
  it('keeps login strings exact', () => {
    expect(copy.login.heading).toBe('Welcome Aboard')
    expect(copy.login.submit).toBe('Log In')
    expect(copy.login.invalidCredentials).toBe(
      "That name and password didn't match. Please try again.",
    )
    expect(copy.home.signedInAs).toBe('Signed in as {playerName}')
    expect(copy.home.admin).toBe('Admin')
  })

  it('formats placeholders', () => {
    expect(formatCopy(copy.home.teamLine, { teamName: 'Demo Team Alpha' })).toBe(
      'Team: Demo Team Alpha',
    )
  })
})
