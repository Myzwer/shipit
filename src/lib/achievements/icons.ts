/**
 * A5 / FINAL icon resolution for achievement definitions.
 * Accepts FINAL Font Awesome classes (`fas fa-*`) or legacy semantic keys.
 */
import type { SemanticIconKey } from '@/ui/icons'
import { WORKING_ACHIEVEMENT_CATALOG } from '../../../content/achievements/workingCatalog'
import drinkingWithDavids from '../../../content/achievements/drinkingWithDavids.json'
import barGauntlets from '../../../content/achievements/barGauntlets.json'
import frozenCollections from '../../../content/achievements/frozenCollections.json'
import { FINAL_FA_TO_SEMANTIC, semanticIconForAchievementIconKey } from './faIconMap'

/** Achievement-safe semantic keys (subset of the Font Awesome Pro registry). */
export const KNOWN_ACHIEVEMENT_ICON_KEYS = new Set<string>([
  'theme.drink-it',
  'theme.ship-it',
  'score.leaderboard',
  'score.achievement',
  'score.medal',
  'score.points',
  'score.bar',
  'score.friends',
  'score.team',
  'score.calendar',
  'score.list',
  'score.clock',
  'score.compass',
  'score.bolt',
  'score.bullseye',
  'score.snowflake',
  'score.wine',
  'score.beer',
  'score.layer',
  'score.cocktail',
  'score.pepper',
  'score.palm',
  'score.whiskey',
  'score.bottle',
  'score.fire',
  'score.lemon',
  'score.coffee',
  'score.sun',
  'score.moon',
  'score.repeat',
  'score.camera',
  'score.music',
  'score.beach',
  'score.route',
  'score.utensils',
  'score.gem',
  'score.flower',
  'score.leaf',
  'score.secret',
  'nav.achievements',
  'action.search',
  'shipit.spa',
  'shipit.theater',
  'shipit.palette',
  'shipit.concierge',
  'shipit.pizza',
  'shipit.ice-cream',
  'shipit.life-ring',
  'shipit.mystery',
  'shipit.paw',
  'shipit.microphone',
  'shipit.water',
  'shipit.handshake',
  'shipit.brain',
  'shipit.fitness',
  'shipit.chair',
  'shipit.map',
  ...Object.keys(FINAL_FA_TO_SEMANTIC),
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
  const mapped = semanticIconForAchievementIconKey(iconKey)
  if (!mapped) return { ok: false, icon_key: null, reason: 'unknown' }
  if (
    !KNOWN_ACHIEVEMENT_ICON_KEYS.has(iconKey) &&
    !KNOWN_ACHIEVEMENT_ICON_KEYS.has(mapped)
  ) {
    return { ok: false, icon_key: null, reason: 'unknown' }
  }
  return { ok: true, icon_key: mapped }
}

function allWorkingRows() {
  return [
    ...WORKING_ACHIEVEMENT_CATALOG,
    ...(drinkingWithDavids.definitions || []),
    ...(barGauntlets.definitions || []),
    ...(frozenCollections.definitions || []),
  ]
}

export function listWorkingAchievementIconCoverage(opts?: {
  enabledOnly?: boolean
}): {
  total: number
  with_icon: number
  missing_icon_keys: string[]
  unknown_icon_assignments: Array<{ stable_key: string; icon_key: string }>
} {
  const rows = allWorkingRows().filter((row) => {
    if (!opts?.enabledOnly) return true
    const enabled = (row as { enabledInDev?: boolean }).enabledInDev
    const readiness = (row as { readiness?: string }).readiness
    return enabled !== false && readiness !== 'retired'
  })
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
    const resolved = resolveAchievementIconKey(key)
    if (!resolved.ok) {
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
