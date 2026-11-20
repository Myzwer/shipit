import { describe, expect, it } from 'vitest'
import {
  crewNamesExcludingSelf,
  resolveShipItAssignment,
} from '@/lib/shipit/assignment'
import type { ShipItHomePayload } from '@/types/shipit'

function payload(partial: Partial<ShipItHomePayload> & Pick<ShipItHomePayload, 'team'>): ShipItHomePayload {
  return {
    ok: true,
    lifecycle: {
      ok: true,
      status: 'pre_cruise',
      read_only: true,
      accepting_submissions: false,
    },
    overall: { completed: 0, total: 50, points: 0 },
    categories: [],
    leaderboard: [],
    ...partial,
  }
}

describe('crewNamesExcludingSelf', () => {
  it('excludes the logged-in player and keeps other teammates', () => {
    expect(
      crewNamesExcludingSelf(
        ['David Forrester', 'Josh LastName', 'Judah Forrester'],
        'Josh LastName',
      ),
    ).toEqual(['David Forrester', 'Judah Forrester'])
  })

  it('handles three-person leftover on a four-person team', () => {
    expect(
      crewNamesExcludingSelf(['Alex', 'Blair', 'Casey', 'Drew'], 'Casey'),
    ).toEqual(['Alex', 'Blair', 'Drew'])
  })
})

describe('resolveShipItAssignment', () => {
  it('returns team + crew from the my-team leaderboard row', () => {
    const result = resolveShipItAssignment(
      payload({
        team: { id: 't5', name: 'Team 5' },
        leaderboard: [
          {
            team_id: 't5',
            team_name: 'Team 5',
            members: ['David Forrester', 'Josh LastName', 'Judah Forrester'],
            completed: 0,
            points: 0,
            rank: 1,
            is_my_team: true,
          },
        ],
      }),
      'Josh LastName',
    )
    expect(result).toEqual({
      teamName: 'Team 5',
      crewNames: ['David Forrester', 'Judah Forrester'],
    })
  })

  it('returns null when there is no team', () => {
    expect(
      resolveShipItAssignment(
        payload({
          team: { id: 't1', name: '   ' },
          leaderboard: [],
        }),
        'Josh',
      ),
    ).toBeNull()
  })

  it('returns null when the my-team roster is unavailable', () => {
    expect(
      resolveShipItAssignment(
        payload({
          team: { id: 't5', name: 'Team 5' },
          leaderboard: [],
        }),
        'Josh',
      ),
    ).toBeNull()
  })
})
