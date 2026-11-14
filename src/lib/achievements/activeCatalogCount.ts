/**
 * Active achievement catalog size for progress denominators.
 * Mirrors scripts/lib/composeWorkingAchievements.mjs active filters.
 */
import { WORKING_ACHIEVEMENT_CATALOG } from '@/lib/achievements/workingCatalog'
import drinkingWithDavids from '../../../content/achievements/drinkingWithDavids.json'
import barGauntlets from '../../../content/achievements/barGauntlets.json'
import frozenCollections from '../../../content/achievements/frozenCollections.json'
import type { GameId } from '@/types/game'

type CatalogRow = {
  game: GameId
  readiness?: string
  enabledInDev?: boolean
}

function composedCatalogRows(): CatalogRow[] {
  return [
    ...WORKING_ACHIEVEMENT_CATALOG,
    ...((drinkingWithDavids as { definitions?: CatalogRow[] }).definitions ?? []),
    ...((barGauntlets as { definitions?: CatalogRow[] }).definitions ?? []),
    ...((frozenCollections as { definitions?: CatalogRow[] }).definitions ?? []),
  ]
}

/** Achievements a player/team can earn in the current active catalog for a game. */
export function activeAchievementCatalogCount(game: GameId): number {
  return composedCatalogRows().filter(
    (row) =>
      row.game === game &&
      row.enabledInDev !== false &&
      row.readiness !== 'retired',
  ).length
}
