import { describe, expect, it } from 'vitest'
import {
  DAILY_CHALLENGE_INSTRUCTIONS_PENDING,
  FINAL_DAILY_CHALLENGES,
} from '../../content/dailyChallenges/finalSchedule'
import { parseDailyChallengePayload } from '@/lib/bounty/parseBountyPayload'

describe('C1 final Daily Challenge schedule', () => {
  it('defines exactly seven days with final titles, locations, and modes', () => {
    expect(FINAL_DAILY_CHALLENGES).toHaveLength(7)
    expect(FINAL_DAILY_CHALLENGES.map((d) => d.day_number)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(FINAL_DAILY_CHALLENGES.map((d) => d.title)).toEqual([
      'Tequila Shot',
      'Switcheroo',
      'Irish Pub Pick',
      "80's Drink Night",
      'Martini Choice',
      "Bartender's Choice",
      'Miami Vice Finale',
    ])
    expect(FINAL_DAILY_CHALLENGES.map((d) => d.location_name)).toEqual([
      'Lido',
      'Sea View',
      "O'Malley's",
      'Crooners',
      "Bellini's",
      'Good Spirits',
      'Cascade',
    ])
    expect(FINAL_DAILY_CHALLENGES.map((d) => d.bar_canonical_key)).toEqual([
      'lido-bar',
      'sea-view-bar',
      'omalleys-irish-pub',
      'crooners',
      'bellinis-cocktail-bar',
      'good-spirits-at-sea',
      'cascade-bar',
    ])
    expect(FINAL_DAILY_CHALLENGES.map((d) => d.participation_mode)).toEqual([
      'all_hands',
      'all_hands',
      'bring_a_friend',
      'bring_a_friend',
      'bring_a_friend',
      'all_hands',
      'all_hands',
    ])
    for (const row of FINAL_DAILY_CHALLENGES) {
      expect(row.points).toBe(50)
      expect(row.photo_required).toBe(true)
    }
  })

  it('documents missing organizer body copy rather than inventing rules', () => {
    expect(DAILY_CHALLENGE_INSTRUCTIONS_PENDING).toMatch(/pending organizer supply/i)
  })

  it('parses participation_mode and optional admin_announcement for C2', () => {
    const active = parseDailyChallengePayload({
      status: 'active',
      challenge_id: 'c1',
      cruise_day: 1,
      title: 'Tequila Shot',
      instructions: DAILY_CHALLENGE_INSTRUCTIONS_PENDING,
      location_name: 'Lido',
      bar_canonical_key: 'lido-bar',
      meeting_time_ship_local: null,
      is_all_hands: true,
      participation_mode: 'all_hands',
      admin_announcement: 'Meet @ 3 PM',
      photo_required: true,
      points: 50,
      public_end_utc: '2099-01-03T23:00:00.000Z',
    })
    expect(active.status).toBe('active')
    if (active.status !== 'active') return
    expect(active.participation_mode).toBe('all_hands')
    expect(active.admin_announcement).toBe('Meet @ 3 PM')
    expect(active.bar_canonical_key).toBe('lido-bar')
    expect(active.is_all_hands).toBe(true)

    const empty = parseDailyChallengePayload({
      status: 'active',
      challenge_id: 'c3',
      cruise_day: 3,
      title: 'Irish Pub Pick',
      instructions: DAILY_CHALLENGE_INSTRUCTIONS_PENDING,
      location_name: "O'Malley's",
      bar_canonical_key: 'omalleys-irish-pub',
      meeting_time_ship_local: null,
      is_all_hands: false,
      participation_mode: 'bring_a_friend',
      admin_announcement: null,
      photo_required: true,
      points: 50,
      public_end_utc: '2099-01-05T23:00:00.000Z',
    })
    expect(empty.status).toBe('active')
    if (empty.status !== 'active') return
    expect(empty.participation_mode).toBe('bring_a_friend')
    expect(empty.admin_announcement).toBeNull()
    expect(empty.is_all_hands).toBe(false)
  })
})
