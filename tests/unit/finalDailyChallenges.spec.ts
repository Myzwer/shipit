import { describe, expect, it } from 'vitest'
import {
  DAILY_CHALLENGE_INSTRUCTIONS_PENDING,
  FINAL_DAILY_CHALLENGES,
} from '../../content/dailyChallenges/finalSchedule'
import { parseDailyChallengePayload } from '@/lib/bounty/parseBountyPayload'

describe('C2.1 final Daily Challenge schedule', () => {
  it('defines exactly seven days with final titles, locations, modes, and copy', () => {
    expect(FINAL_DAILY_CHALLENGES).toHaveLength(7)
    expect(FINAL_DAILY_CHALLENGES.map((d) => d.day_number)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(FINAL_DAILY_CHALLENGES.map((d) => d.title)).toEqual([
      'Tequila Shot',
      'Switcheroo',
      'Irish Pub Pick',
      "80's Drink Night",
      "Bartender's Choice",
      'Martini Choice',
      'Miami Vice Finale',
    ])
    expect(FINAL_DAILY_CHALLENGES.map((d) => d.location_name)).toEqual([
      'Lido Bar',
      'Sea View Bar',
      "O'Malley's Irish Pub",
      'Crooners',
      'Good Spirits at Sea',
      "Bellini's Cocktail Bar",
      'Cascade Bar',
    ])
    expect(FINAL_DAILY_CHALLENGES.map((d) => d.bar_canonical_key)).toEqual([
      'lido-bar',
      'sea-view-bar',
      'omalleys-irish-pub',
      'crooners',
      'good-spirits-at-sea',
      'bellinis-cocktail-bar',
      'cascade-bar',
    ])
    expect(FINAL_DAILY_CHALLENGES.map((d) => d.participation_mode)).toEqual([
      'all_hands',
      'all_hands',
      'bring_a_friend',
      'bring_a_friend',
      'all_hands',
      'bring_a_friend',
      'all_hands',
    ])
    for (const row of FINAL_DAILY_CHALLENGES) {
      expect(row.points).toBe(50)
      expect(row.photo_required).toBe(true)
      expect(row.instructions.trim().length).toBeGreaterThan(20)
      expect(row.instructions).not.toBe(DAILY_CHALLENGE_INSTRUCTIONS_PENDING)
      expect(row.instructions).not.toMatch(/pending organizer supply/i)
    }
  })

  it('corrects Day 5 / Day 6 from the interim C1 order', () => {
    const day5 = FINAL_DAILY_CHALLENGES[4]!
    const day6 = FINAL_DAILY_CHALLENGES[5]!
    expect(day5).toMatchObject({
      day_number: 5,
      title: "Bartender's Choice",
      bar_canonical_key: 'good-spirits-at-sea',
      participation_mode: 'all_hands',
    })
    expect(day6).toMatchObject({
      day_number: 6,
      title: 'Martini Choice',
      bar_canonical_key: 'bellinis-cocktail-bar',
      participation_mode: 'bring_a_friend',
    })
  })

  it('parses approved instructions and optional admin_announcement for C2', () => {
    const day1 = FINAL_DAILY_CHALLENGES[0]!
    const active = parseDailyChallengePayload({
      status: 'active',
      challenge_id: 'c1',
      cruise_day: 1,
      title: day1.title,
      instructions: day1.instructions,
      location_name: day1.location_name,
      bar_canonical_key: day1.bar_canonical_key,
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
    expect(active.instructions).toContain('shot of tequila')
    expect(active.admin_announcement).toBe('Meet @ 3 PM')
  })
})
