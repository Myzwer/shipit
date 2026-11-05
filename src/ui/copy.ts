/**
 * Approved UI copy from 04-UI-Content-and-Icons.md (Phase 0–1B subset).
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
    admin: 'Admin',
    mockShellNote: 'Phase 0 layout shell — mock demonstration data only.',
  },
  login: {
    heading: 'Welcome Aboard',
    nameLabel: 'Who are you?',
    namePlaceholder: 'Select your name',
    passwordLabel: 'Password',
    submit: 'Log In',
    submitting: 'Logging In…',
    invalidCredentials: "That name and password didn't match. Please try again.",
    missingName: 'Select your name to continue.',
    missingPassword: 'Enter your password to continue.',
    noGames: "You aren't enrolled in either game. Ask the organizer if you think this is a mistake.",
    sessionExpired: 'Your session has ended. Please log in again.',
    gameNoLongerAllowed: 'You no longer have access to {gameName}.',
    networkFailure: "We couldn't log you in. Check your connection and try again.",
  },
  admin: {
    title: 'Admin',
    placeholder:
      'Organizer tools arrive in a later phase. This page is a protected placeholder only.',
    backHome: 'Back to Home',
  },
  unavailable: {
    title: 'No Games Available',
  },
  access: {
    goHome: 'Go to your game',
    backToLogin: 'Back to Log In',
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
