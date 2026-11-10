/**
 * Phase C1 — authoritative seven-day Daily Challenge schedule.
 *
 * Titles, locations, participation modes, and canonical bar keys are FINAL.
 * Detailed gameplay instructions were not supplied in-repo; do not invent rules.
 */

export type DailyChallengeParticipationMode = 'all_hands' | 'bring_a_friend'

export type FinalDailyChallengeDefinition = {
  day_number: 1 | 2 | 3 | 4 | 5 | 6 | 7
  title: string
  location_name: string
  bar_canonical_key: string
  participation_mode: DailyChallengeParticipationMode
  points: 50
  photo_required: true
}

/** Honest placeholder until organizer-approved body copy is supplied. */
export const DAILY_CHALLENGE_INSTRUCTIONS_PENDING =
  'Detailed challenge instructions pending organizer supply.'

export const FINAL_DAILY_CHALLENGES: readonly FinalDailyChallengeDefinition[] = [
  {
    day_number: 1,
    title: 'Tequila Shot',
    location_name: 'Lido',
    bar_canonical_key: 'lido-bar',
    participation_mode: 'all_hands',
    points: 50,
    photo_required: true,
  },
  {
    day_number: 2,
    title: 'Switcheroo',
    location_name: 'Sea View',
    bar_canonical_key: 'sea-view-bar',
    participation_mode: 'all_hands',
    points: 50,
    photo_required: true,
  },
  {
    day_number: 3,
    title: 'Irish Pub Pick',
    location_name: "O'Malley's",
    bar_canonical_key: 'omalleys-irish-pub',
    participation_mode: 'bring_a_friend',
    points: 50,
    photo_required: true,
  },
  {
    day_number: 4,
    title: "80's Drink Night",
    location_name: 'Crooners',
    bar_canonical_key: 'crooners',
    participation_mode: 'bring_a_friend',
    points: 50,
    photo_required: true,
  },
  {
    day_number: 5,
    title: 'Martini Choice',
    location_name: "Bellini's",
    bar_canonical_key: 'bellinis-cocktail-bar',
    participation_mode: 'bring_a_friend',
    points: 50,
    photo_required: true,
  },
  {
    day_number: 6,
    title: "Bartender's Choice",
    location_name: 'Good Spirits',
    bar_canonical_key: 'good-spirits-at-sea',
    participation_mode: 'all_hands',
    points: 50,
    photo_required: true,
  },
  {
    day_number: 7,
    title: 'Miami Vice Finale',
    location_name: 'Cascade',
    bar_canonical_key: 'cascade-bar',
    participation_mode: 'all_hands',
    points: 50,
    photo_required: true,
  },
] as const
