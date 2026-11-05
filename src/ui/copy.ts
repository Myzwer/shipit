/**
 * Phase 0 subset of 04-UI-Content-and-Icons.md copy.
 * Dynamic game content stays out of this file.
 */
export const copy = {
  games: {
    drinkIt: 'Drink It!',
    shipIt: 'Ship It!',
  },
  selection: {
    drinkHeadline: 'DRINK IT!',
    shipHeadline: 'SHIP IT!',
    launch: 'Launch',
  },
  nav: {
    home: 'Home',
    logDrink: 'Log a Drink',
    challenges: 'Challenges',
    gallery: 'Gallery',
    achievements: 'Achievements',
  },
  home: {
    drinkDailyBounties: 'Daily Bounties',
    drinkLeaderboard: 'Leaderboard',
    shipProgress: "{teamName}'s Progress",
    shipLeaderboard: 'Leaderboard',
    howToPlay: 'How to Play',
    account: 'Account',
    signedInAs: 'Signed in as {playerName}',
    teamLine: 'Team: {teamName}',
    logOut: 'Log Out',
    mockShellNote: 'Phase 0 layout shell — mock demonstration data only.',
  },
  bounty: {
    cocktail: 'Cocktail Bounty',
    ingredient: 'Ingredient Bounty',
    bar: 'Bar Bounty',
    daily: 'Daily Challenge',
    claimIt: 'Claim It',
    timeRemaining: 'Time Remaining',
    location: 'Location: {barName}',
    availableAt: 'Available at {barCount} bars',
    claimed: 'Claimed',
  },
  switchTo: {
    drinkIt: 'Switch to Drink It!',
    shipIt: 'Switch to Ship It!',
  },
} as const

export function formatCopy(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  )
}
