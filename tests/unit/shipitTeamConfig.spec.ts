import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  ORGANIZER_TEAM_CONTRACT,
  PRIVATE_TUESDAY_EXPECTED_POINTS,
  PRIVATE_TUESDAY_SCAVENGER_PLAN,
  SYNTHETIC_TUESDAY_SCAVENGER_PLAN,
  assertOrganizerShipItTeams,
  loadPrivateShipItTeamConfig,
  pickTeamSubmitter,
} from '../../scripts/lib/shipitTeamConfig.mjs'

const root = process.cwd()

function loadChallengePoints(): Map<string, number> {
  const rows = JSON.parse(
    readFileSync(join(root, 'supabase/seed/scavenger_dev_challenges.json'), 'utf8'),
  ) as Array<{ canonical_key: string; points: number }>
  return new Map(rows.map((r) => [r.canonical_key, r.points]))
}

describe('shipitTeamConfig (synthetic template contract)', () => {
  it('tracked roster template encodes six teams, 21 assigned, one unassigned', () => {
    const doc = JSON.parse(
      readFileSync(join(root, 'private/roster.example/roster.template.json'), 'utf8'),
    )
    expect(doc.teams).toHaveLength(ORGANIZER_TEAM_CONTRACT.teamCount)
    const assigned = doc.players.filter((p: { team_key: string | null }) => p.team_key)
    const unassigned = doc.players.filter((p: { team_key: string | null }) => !p.team_key)
    expect(doc.players).toHaveLength(ORGANIZER_TEAM_CONTRACT.totalPlayers)
    expect(assigned).toHaveLength(ORGANIZER_TEAM_CONTRACT.assignedPlayers)
    expect(unassigned.map((p: { key: string }) => p.key)).toEqual(['guest_21'])
    expect(doc.players.filter((p: { drink_it: boolean }) => p.drink_it)).toHaveLength(
      ORGANIZER_TEAM_CONTRACT.drinkItMemberships,
    )
    // Template must not embed real guest family names.
    const blob = JSON.stringify(doc)
    expect(blob).not.toMatch(/Forrester|Becker|Clemons|Mills|Rector|Tumolo|Shirley|Bissett/i)
  })

  it('tracked teams.template.json stays synthetic and capacity-correct', () => {
    const doc = JSON.parse(
      readFileSync(join(root, 'private/roster.example/teams.template.json'), 'utf8'),
    )
    expect(doc.teams).toHaveLength(6)
    expect(doc.capacity.assigned_players).toBe(21)
    expect(doc.deliberately_unassigned).toEqual(['guest_21'])
    expect(JSON.stringify(doc)).not.toMatch(/Forrester|Becker|June/i)
  })

  it('gitignore keeps private roster/team overlays out of Git', () => {
    const gi = readFileSync(join(root, '.gitignore'), 'utf8')
    expect(gi.includes('private/roster/')).toBe(true)
    expect(gi.includes('!private/roster.example/')).toBe(true)
  })
})

describe('shipitTeamConfig (private roster when present)', () => {
  it('validates organizer team contract without publishing private IDs', () => {
    const cfg = loadPrivateShipItTeamConfig(root)
    if (cfg.source === 'absent') {
      expect(cfg.teams).toEqual([])
      return
    }
    const verdict = assertOrganizerShipItTeams(cfg, { requireConfirmed: true })
    expect(verdict.ok).toBe(true)
    expect(verdict.teamCount).toBe(6)
    expect(verdict.assignedCount).toBe(21)
    expect(verdict.unassignedCount).toBe(1)
    // Contract key only — no UUIDs / login aliases in assertions.
    expect(verdict.unassignedKeys).toEqual(ORGANIZER_TEAM_CONTRACT.deliberatelyUnassignedKeys)
  })

  it('fails closed when confirmed teams are required but missing', () => {
    expect(() =>
      assertOrganizerShipItTeams(
        {
          source: 'private_provisional',
          rosterPath: 'x',
          teamsPath: null,
          teams: [],
          assignments: {},
          players: [],
          unassignedKeys: [],
        },
        { requireConfirmed: true },
      ),
    ).toThrow(/SHIPIT_TEAMS/)
  })
})

describe('tuesday scavenger plans', () => {
  it('private plan is team-keyed, uses authentic catalog keys, and matches expected totals', () => {
    const points = loadChallengePoints()
    const byTeamKey = new Map<string, number>()
    const seen = new Set<string>()

    for (const step of PRIVATE_TUESDAY_SCAVENGER_PLAN) {
      expect(step.teamKey).toMatch(/^team_[1-6]$/)
      expect(points.has(step.challengeKey)).toBe(true)
      const uniq = `${step.teamKey}:${step.challengeKey}`
      expect(seen.has(uniq)).toBe(false)
      seen.add(uniq)
      byTeamKey.set(
        step.teamKey,
        (byTeamKey.get(step.teamKey) || 0) + (points.get(step.challengeKey) || 0),
      )
    }

    const byDisplayName: Record<string, number> = {}
    for (const [key, total] of byTeamKey) {
      byDisplayName[`Team ${key.slice(-1)}`] = total
    }
    expect(byDisplayName).toEqual(PRIVATE_TUESDAY_EXPECTED_POINTS)

    // Tracked plan must not embed private roster player keys / family names.
    const blob = JSON.stringify(PRIVATE_TUESDAY_SCAVENGER_PLAN)
    expect(blob).not.toMatch(/forrester|becker|clemons|mills|rector|tumolo|shirley|bissett|june/i)
  })

  it('synthetic plan stays limited to Demo/Gate actor keys', () => {
    for (const step of SYNTHETIC_TUESDAY_SCAVENGER_PLAN) {
      expect(['both', 'ship_only', 'admin']).toContain(step.playerKey)
    }
    expect(SYNTHETIC_TUESDAY_SCAVENGER_PLAN).toHaveLength(5)
  })

  it('pickTeamSubmitter rotates and prefers non-admin members', () => {
    const members = [
      { key: 'a', is_admin: true },
      { key: 'b', is_admin: false },
      { key: 'c', is_admin: false },
    ]
    expect(pickTeamSubmitter(members, 0)?.key).toBe('b')
    expect(pickTeamSubmitter(members, 1)?.key).toBe('c')
    expect(pickTeamSubmitter(members, 2)?.key).toBe('b')
  })

  it('does not require private roster file to exist in CI checkouts', () => {
    expect(existsSync(join(root, 'private/roster.example/roster.template.json'))).toBe(true)
  })
})
