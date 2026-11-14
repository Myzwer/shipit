import { activeAchievementCatalogCount } from '@/lib/achievements/activeCatalogCount'
import type { GameId, MockLeaderboardRow } from '@/types/game'
import type { WrappedLeaderboardRow } from '@/types/wrapped'
import type {
  DrinkItLeaderboardMode,
  ShipItLeaderboardMode,
  WrappedLeaderboardMode,
} from '@/types/wrappedPlanC'

export interface WrappedLeaderboardModeOption {
  id: WrappedLeaderboardMode
  label: string
}

export const DRINKIT_LEADERBOARD_MODES: WrappedLeaderboardModeOption[] = [
  { id: 'points', label: 'Bounties' },
  { id: 'achievements', label: 'Achievements' },
]

export const SHIPIT_LEADERBOARD_MODES: WrappedLeaderboardModeOption[] = [
  { id: 'points', label: 'Points' },
  { id: 'challenges', label: 'Challenges' },
]

export function leaderboardModeOptions(game: GameId): WrappedLeaderboardModeOption[] {
  return game === 'drinkit' ? DRINKIT_LEADERBOARD_MODES : SHIPIT_LEADERBOARD_MODES
}

function achievementsFor(
  row: WrappedLeaderboardRow,
  achievementsById?: Record<string, number>,
): number {
  return row.achievements ?? achievementsById?.[row.id] ?? 0
}

/** True when the payload (or supplied map) actually carries per-player achievement counts. */
export function hasAchievementCounts(
  rows: WrappedLeaderboardRow[],
  achievementsById?: Record<string, number>,
): boolean {
  return (
    rows.length > 0 &&
    rows.every((r) => r.achievements !== undefined || achievementsById?.[r.id] !== undefined)
  )
}

function byNameThenId(a: WrappedLeaderboardRow, b: WrappedLeaderboardRow): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
}

function serverRank(row: WrappedLeaderboardRow, fallback: number): number {
  return Number.isFinite(row.rank) && row.rank > 0 ? row.rank : fallback
}

/** Competition ranking (1, 1, 3) on an already sorted list. */
function competitionRanks<T>(sorted: T[], metric: (item: T) => number): number[] {
  const ranks: number[] = []
  sorted.forEach((item, index) => {
    const prev = sorted[index - 1]
    ranks.push(prev !== undefined && metric(prev) === metric(item) ? (ranks[index - 1] ?? 1) : index + 1)
  })
  return ranks
}

function toMock(
  row: WrappedLeaderboardRow,
  rank: number,
  points: number,
  metricLabel: string,
): MockLeaderboardRow {
  return {
    id: row.id,
    rank,
    name: row.name,
    ...(row.members ? { members: row.members } : {}),
    metricLabel,
    points,
  }
}

export function buildDrinkItLeaderboard(
  rows: WrappedLeaderboardRow[],
  mode: DrinkItLeaderboardMode,
  achievementsById?: Record<string, number>,
): MockLeaderboardRow[] {
  if (mode === 'points') {
    const sorted = [...rows].sort(
      (a, b) => b.points - a.points || serverRank(a, 0) - serverRank(b, 0) || byNameThenId(a, b),
    )
    const ranks = competitionRanks(sorted, (r) => r.points)
    return sorted.map((row, i) =>
      toMock(
        row,
        ranks[i] ?? i + 1,
        row.points,
        row.metric_label || `Bounties ${row.bounty_claims ?? 0}`,
      ),
    )
  }

  const sorted = [...rows].sort(
    (a, b) =>
      achievementsFor(b, achievementsById) - achievementsFor(a, achievementsById) ||
      b.points - a.points ||
      byNameThenId(a, b),
  )
  const ranks = competitionRanks(sorted, (r) => achievementsFor(r, achievementsById))
  const catalogTotal = activeAchievementCatalogCount('drinkit')
  return sorted.map((row, i) => {
    const count = achievementsFor(row, achievementsById)
    return toMock(
      row,
      ranks[i] ?? i + 1,
      count,
      `${count}/${catalogTotal} ${count === 1 ? 'achievement' : 'achievements'}`,
    )
  })
}

export function buildShipItLeaderboard(
  rows: WrappedLeaderboardRow[],
  mode: ShipItLeaderboardMode,
): MockLeaderboardRow[] {
  if (mode === 'points') {
    const sorted = [...rows].sort(
      (a, b) => b.points - a.points || serverRank(a, 0) - serverRank(b, 0) || byNameThenId(a, b),
    )
    const ranks = competitionRanks(sorted, (r) => r.points)
    return sorted.map((row, i) =>
      toMock(row, ranks[i] ?? i + 1, row.points, `Challenges: ${row.completed ?? 0}`),
    )
  }

  const sorted = [...rows].sort(
    (a, b) => (b.completed ?? 0) - (a.completed ?? 0) || b.points - a.points || byNameThenId(a, b),
  )
  const ranks = competitionRanks(sorted, (r) => r.completed ?? 0)
  return sorted.map((row, i) =>
    toMock(row, ranks[i] ?? i + 1, row.completed ?? 0, `${row.points} points`),
  )
}

export function buildLeaderboardRows(
  game: GameId,
  rows: WrappedLeaderboardRow[],
  mode: WrappedLeaderboardMode,
  achievementsById?: Record<string, number>,
): MockLeaderboardRow[] {
  if (game === 'drinkit') {
    return buildDrinkItLeaderboard(
      rows,
      mode === 'achievements' ? 'achievements' : 'points',
      achievementsById,
    )
  }
  return buildShipItLeaderboard(rows, mode === 'challenges' ? 'challenges' : 'points')
}

/** Everyone sharing the top rank; more than one entry means a tie for first. */
export function leaderboardChampions(rows: MockLeaderboardRow[]): MockLeaderboardRow[] {
  const top = rows[0]?.rank
  return top === undefined ? [] : rows.filter((r) => r.rank === top)
}
