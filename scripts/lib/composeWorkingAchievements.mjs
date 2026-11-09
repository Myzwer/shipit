/**
 * Compose the full working achievement set: original 140 + A3 packs.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '../..')

export function loadBaseWorkingCatalog() {
  return JSON.parse(readFileSync(join(root, 'content/achievements/workingCatalog.json'), 'utf8'))
}

export function loadDrinkingWithDavids() {
  const doc = JSON.parse(
    readFileSync(join(root, 'content/achievements/drinkingWithDavids.json'), 'utf8'),
  )
  return doc.definitions || []
}

export function loadBarGauntlets() {
  const doc = JSON.parse(
    readFileSync(join(root, 'content/achievements/barGauntlets.json'), 'utf8'),
  )
  return doc.definitions || []
}

export function composeWorkingAchievements() {
  const base = loadBaseWorkingCatalog()
  const davids = loadDrinkingWithDavids()
  const gauntlets = loadBarGauntlets()
  const byKey = new Map()
  for (const row of [...base, ...davids, ...gauntlets]) {
    if (byKey.has(row.stableKey)) {
      throw new Error(`Duplicate working achievement stable_key: ${row.stableKey}`)
    }
    byKey.set(row.stableKey, row)
  }
  return {
    definitions: [...byKey.values()],
    counts: {
      base: base.length,
      drinking_with_davids: davids.length,
      bar_gauntlets: gauntlets.length,
      total: byKey.size,
    },
  }
}
