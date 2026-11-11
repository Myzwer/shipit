/**
 * Phase C2.1 — authoritative seven-day Daily Challenge schedule + approved copy.
 *
 * Day 5 / Day 6 were corrected from the C1 interim order:
 *   Day 5 = Bartender's Choice (All Hands) @ Good Spirits
 *   Day 6 = Martini Choice (Bring a Friend) @ Bellini's
 */

export type DailyChallengeParticipationMode = 'all_hands' | 'bring_a_friend'

export type FinalDailyChallengeDefinition = {
  day_number: 1 | 2 | 3 | 4 | 5 | 6 | 7
  title: string
  location_name: string
  bar_canonical_key: string
  participation_mode: DailyChallengeParticipationMode
  instructions: string
  points: 50
  photo_required: true
}

/** Legacy C1 placeholder — must never appear in player-facing UI after C2.1. */
export const DAILY_CHALLENGE_INSTRUCTIONS_PENDING =
  'Detailed challenge instructions pending organizer supply.'

export const FINAL_DAILY_CHALLENGES: readonly FinalDailyChallengeDefinition[] = [
  {
    day_number: 1,
    title: 'Tequila Shot',
    location_name: 'Lido Bar',
    bar_canonical_key: 'lido-bar',
    participation_mode: 'all_hands',
    instructions:
      'Kick off the cruise with a shot of tequila! Gather the crew at Lido for our first group toast of the week.',
    points: 50,
    photo_required: true,
  },
  {
    day_number: 2,
    title: 'Switcheroo',
    location_name: 'Sea View Bar',
    bar_canonical_key: 'sea-view-bar',
    participation_mode: 'all_hands',
    instructions:
      'Time to switch things up! Pair up with someone older or younger than you. The older person picks and orders a drink for the younger person.',
    points: 50,
    photo_required: true,
  },
  {
    day_number: 3,
    title: 'Irish Pub Pick',
    location_name: "O'Malley's Irish Pub",
    bar_canonical_key: 'omalleys-irish-pub',
    participation_mode: 'bring_a_friend',
    instructions:
      "Head to O'Malley's with a friend and embrace your Irish side! Choose from whiskey, Guinness, Irish Red, or Irish Coffee.",
    points: 50,
    photo_required: true,
  },
  {
    day_number: 4,
    title: "80's Drink Night",
    location_name: 'Crooners',
    bar_canonical_key: 'crooners',
    participation_mode: 'bring_a_friend',
    instructions:
      "Travel back to the '80s! Grab a friend and order a Long Island Iced Tea, one of the decade's iconic cocktails.",
    points: 50,
    photo_required: true,
  },
  {
    day_number: 5,
    title: "Bartender's Choice",
    location_name: 'Good Spirits at Sea',
    bar_canonical_key: 'good-spirits-at-sea',
    participation_mode: 'all_hands',
    instructions:
      'Let the bartender decide! Ask for their most popular cocktail and see what makes it a crowd favorite.',
    points: 50,
    photo_required: true,
  },
  {
    day_number: 6,
    title: 'Martini Choice',
    location_name: "Bellini's Cocktail Bar",
    bar_canonical_key: 'bellinis-cocktail-bar',
    participation_mode: 'bring_a_friend',
    instructions:
      "Shaken or stirred? Bring a friend to Bellini's and enjoy a martini of your choice.",
    points: 50,
    photo_required: true,
  },
  {
    day_number: 7,
    title: 'Miami Vice Finale',
    location_name: 'Cascade Bar',
    bar_canonical_key: 'cascade-bar',
    participation_mode: 'all_hands',
    instructions:
      'One last tropical toast! Gather the crew at Cascade and celebrate the end of the cruise with a frozen Miami Vice.',
    points: 50,
    photo_required: true,
  },
] as const
