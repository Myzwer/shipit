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
    expect(copy.admin.clockSection).toBe('Ship Clock')
    expect(copy.admin.currentShipTime).toBe('Current Ship Time')
    expect(copy.admin.minus1Hour).toBe('−1 Hour')
    expect(copy.admin.confirmAdjustTitle).toBe('Apply Ship Time Change?')
    expect(copy.bounty.preOpening).toBe('Game begins at 12:00 PM')
    expect(copy.bounty.seeYouTomorrow).toBe('See You Tomorrow')
    expect(copy.bounty.pausedTitle).toBe(
      'Drink It! is temporarily paused while we check the menus. Check back soon!',
    )
    expect(copy.bounty.availableAt).toBe('Available at {barCount} {barOrBars}')
    expect(copy.admin.pauseDrinkIt).toBe('Pause Drink It!')
    expect(copy.admin.resumeDrinkIt).toBe('Resume Drink It!')
    expect(copy.admin.confirmPauseTitle).toBe('Pause Drink It!?')
    expect(copy.admin.drinkItRunning).toBe('Drink It! is running.')
  })

  it('formats placeholders', () => {
    expect(formatCopy(copy.home.teamLine, { teamName: 'Demo Team Alpha' })).toBe(
      'Team: Demo Team Alpha',
    )
  })
})
