import type { MockCategoryProgress, MockLeaderboardRow } from '@/types/game'

/** Local layout-only fixtures. Not production content. */
export const shipItMockTeamName = 'Demo Team'

export const shipItMockProgress: MockCategoryProgress[] = [
  { id: 'c1', label: 'Classic Ship Landmarks', completed: 0, total: 10, points: 0 },
  { id: 'c2', label: 'Food & Drink Discoveries', completed: 0, total: 10, points: 0 },
  { id: 'c3', label: 'Quirky Details & Hidden Artifacts', completed: 0, total: 10, points: 0 },
  { id: 'c4', label: 'Interactive Crew & Activity Challenges', completed: 0, total: 10, points: 0 },
  { id: 'c5', label: 'Creative Team & Action Shots', completed: 0, total: 10, points: 0 },
  { id: 'all', label: 'All Challenges', completed: 0, total: 50, points: 0 },
]

export const shipItMockLeaderboard: MockLeaderboardRow[] = [
  {
    id: 't1',
    rank: 1,
    name: 'Demo Team',
    members: ['Demo One', 'Demo Two', 'Demo Three'],
    metricLabel: 'Challenges: 0/50',
    points: 0,
  },
  {
    id: 't2',
    rank: 2,
    name: 'Sample Sailors',
    members: ['Alex Sample', 'Sam Sample', 'Pat Sample'],
    metricLabel: 'Challenges: 0/50',
    points: 0,
  },
  {
    id: 't3',
    rank: 3,
    name: 'Placeholder Crew',
    members: ['Jordan Demo', 'Casey Demo', 'Riley Demo'],
    metricLabel: 'Challenges: 0/50',
    points: 0,
  },
]
