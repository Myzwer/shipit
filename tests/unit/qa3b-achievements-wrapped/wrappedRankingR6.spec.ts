import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildDrinkItLeaderboard,
  hasAchievementCounts,
  leaderboardChampions,
} from '@/lib/wrapped/buildLeaderboardModes'
import type { WrappedLeaderboardRow } from '@/types/wrapped'

const root = process.cwd()

describe('R6 Wrapped ranking contracts', () => {
  it('11100 and 11300 both emit achievements with drinkit_player_score_rows ORDER BY', () => {
    const m11100 = readFileSync(
      join(root, 'supabase/migrations/20261105011100_plan_c_wrapped_leaderboard_achievements.sql'),
      'utf8',
    )
    const m11300 = readFileSync(
      join(root, 'supabase/migrations/20261105011300_r6_wrapped_rank_and_mo_venue.sql'),
      'utf8',
    )
    for (const sql of [m11100, m11300]) {
      expect(sql).toContain("'achievements', v_row.achievements")
      expect(sql).toMatch(/order by[\s\S]*r\.points desc/i)
      expect(sql).toMatch(/coalesce\(r\.first_claim_at,\s*'infinity'::timestamptz\)/i)
      expect(sql).toMatch(/lower\(r\.display_name\)/i)
      expect(sql).toMatch(/r\.player_id asc/i)
    }
    expect(m11300).toContain('bar_id is not null')
  })

  it('Achievements mode ranks by achievement count with competition ties; points are tie-break only', () => {
    const rows: WrappedLeaderboardRow[] = [
      {
        id: 'a',
        name: 'Ada',
        points: 10,
        rank: 3,
        achievements: 5,
        metric_label: '',
        is_me: false,
      },
      {
        id: 'b',
        name: 'Bea',
        points: 90,
        rank: 1,
        achievements: 5,
        metric_label: '',
        is_me: false,
      },
      {
        id: 'c',
        name: 'Cy',
        points: 50,
        rank: 2,
        achievements: 0,
        metric_label: '',
        is_me: true,
      },
    ]
    expect(hasAchievementCounts(rows)).toBe(true)
    const built = buildDrinkItLeaderboard(rows, 'achievements')
    // Tie on achievements → points desc (Bea 90 before Ada 10), then name.
    expect(built.map((r) => r.name)).toEqual(['Bea', 'Ada', 'Cy'])
    expect(built.map((r) => r.rank)).toEqual([1, 1, 3])
    expect(built.map((r) => r.points)).toEqual([5, 5, 0])
    expect(leaderboardChampions(built)).toHaveLength(2)
  })

  it('Points mode does not borrow Ship It first-to-final ranking; uses points + server tie order', () => {
    const rows: WrappedLeaderboardRow[] = [
      { id: 'late', name: 'Late', points: 100, rank: 2, metric_label: '', is_me: false },
      { id: 'early', name: 'Early', points: 100, rank: 1, metric_label: '', is_me: false },
      { id: 'zero', name: 'Zero', points: 0, rank: 3, metric_label: '', is_me: false },
    ]
    const built = buildDrinkItLeaderboard(rows, 'points')
    expect(built.map((r) => r.name)).toEqual(['Early', 'Late', 'Zero'])
    expect(built.map((r) => r.rank)).toEqual([1, 1, 3])
  })
})
