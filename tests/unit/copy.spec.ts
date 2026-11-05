import { describe, expect, it } from 'vitest'
import { copy, formatCopy } from '@/ui/copy'

describe('copy registry', () => {
  it('keeps approved game names', () => {
    expect(copy.games.drinkIt).toBe('Drink It!')
    expect(copy.games.shipIt).toBe('Ship It!')
  })

  it('formats template placeholders', () => {
    expect(formatCopy(copy.home.signedInAs, { playerName: 'Demo' })).toBe(
      'Signed in as Demo',
    )
  })
})
