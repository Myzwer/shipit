/**
 * Compose the full working achievement set: FINAL base + Davids + gauntlets + frozen.
 * Retired definitions are included disabled so loaders can disable missing/retired keys.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '../..')

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'))
}

export function loadBaseWorkingCatalog() {
  return readJson('content/achievements/workingCatalog.json')
}

export function loadDrinkingWithDavids() {
  const doc = readJson('content/achievements/drinkingWithDavids.json')
  return doc.definitions || []
}

export function loadBarGauntlets() {
  const doc = readJson('content/achievements/barGauntlets.json')
  return doc.definitions || []
}

export function loadFrozenCollections() {
  const doc = readJson('content/achievements/frozenCollections.json')
  return doc.definitions || []
}

export function loadRetiredDefinitions() {
  const doc = readJson('content/achievements/retiredDefinitions.json')
  return doc.definitions || []
}

export function composeWorkingAchievements(opts = {}) {
  const includeRetired = opts.includeRetired !== false
  const base = loadBaseWorkingCatalog()
  const davids = loadDrinkingWithDavids()
  const gauntlets = loadBarGauntlets()
  const frozen = loadFrozenCollections()
  const retired = includeRetired ? loadRetiredDefinitions() : []
  const byKey = new Map()
  for (const row of [...base, ...davids, ...gauntlets, ...frozen, ...retired]) {
    if (byKey.has(row.stableKey)) {
      throw new Error(`Duplicate working achievement stable_key: ${row.stableKey}`)
    }
    byKey.set(row.stableKey, row)
  }
  const definitions = [...byKey.values()]
  const activeRows = definitions.filter(
    (d) => d.enabledInDev !== false && d.readiness !== 'retired',
  )
  return {
    definitions,
    active: activeRows,
    counts: {
      base: base.length,
      drinking_with_davids: davids.length,
      bar_gauntlets: gauntlets.length,
      frozen_collections: frozen.length,
      retired: retired.length,
      total: byKey.size,
      active: activeRows.length,
      drinkit_active: activeRows.filter((d) => d.game === 'drinkit').length,
      shipit_active: activeRows.filter((d) => d.game === 'shipit').length,
    },
  }
}
