/**
 * A5 icon resolution contract for achievement definitions.
 * Maps definition.icon_key → semantic UI icon keys. Does not render photos.
 */
import type { SemanticIconKey } from '@/ui/icons'
import { WORKING_ACHIEVEMENT_CATALOG } from '../../../content/achievements/workingCatalog'
import drinkingWithDavids from '../../../content/achievements/drinkingWithDavids.json'
import barGauntlets from '../../../content/achievements/barGauntlets.json'

const KNOWN_ACHIEVEMENT_ICON_KEYS = new Set<string>([
  'score.achievement',
  'score.medal',
  'score.friends',
  'score.team',
  'score.bar',
  'score.calendar',
  'score.leaderboard',
  'score.points',
  'theme.drink-it',
  'theme.ship-it',
])

export type AchievementIconResolution =
  | { ok: true; icon_key: SemanticIconKey }
  | { ok: false; icon_key: null; reason: 'missing' | 'unknown' | 'masked' }

/** Resolve a stored achievement icon_key for rendering. Never returns a photo path. */
export function resolveAchievementIconKey(
  iconKey: string | null | undefined,
  opts?: { masked?: boolean },
): AchievementIconResolution {
  if (opts?.masked) return { ok: false, icon_key: null, reason: 'masked' }
  if (!iconKey) return { ok: false, icon_key: null, reason: 'missing' }
  if (!KNOWN_ACHIEVEMENT_ICON_KEYS.has(iconKey)) {
    return { ok: false, icon_key: null, reason: 'unknown' }
  }
  return { ok: true, icon_key: iconKey as SemanticIconKey }
}

export function listWorkingAchievementIconCoverage(): {
  total: number
  with_icon: number
  missing_icon_keys: string[]
  unknown_icon_assignments: Array<{ stable_key: string; icon_key: string }>
} {
  const rows = [
    ...WORKING_ACHIEVEMENT_CATALOG,
    ...(drinkingWithDavids.definitions || []),
    ...(barGauntlets.definitions || []),
  ]
  const missing: string[] = []
  const unknown: Array<{ stable_key: string; icon_key: string }> = []
  let withIcon = 0
  for (const row of rows) {
    const key = (row as { iconKey?: string; stableKey: string }).iconKey
    const stable = (row as { stableKey: string }).stableKey
    if (!key) {
      missing.push(stable)
      continue
    }
    withIcon += 1
    if (!KNOWN_ACHIEVEMENT_ICON_KEYS.has(key)) {
      unknown.push({ stable_key: stable, icon_key: key })
    }
  }
  return {
    total: rows.length,
    with_icon: withIcon,
    missing_icon_keys: missing,
    unknown_icon_assignments: unknown,
  }
}
