/**
 * Build the final 174 achievement definition rows from:
 * - parsed FINAL MD authority (titles, triggers, icons, secrets, categories)
 * - existing working catalog conditions (preserved where valid)
 * - explicit condition overrides for remapped / newly enabled rows
 */
import {
  groupKeyFor,
  NEW_SNAPSHOT_REFS,
  POOL_BAR_KEYS,
  resolveStableKey,
  RETIRE_STABLE_KEYS,
} from './finalAchievementReconciliation.mjs'

const EITHER_DAVID = ['companion-david-f', 'companion-david-b']

/** Condition overrides keyed by stableKey. Null conditionType means keep existing. */
const CONDITION_BY_KEY = {
  // Davids
  'working-drinkit-dwd-margarita-kickoff': {
    conditionType: 'same_log',
    conditionConfig: { player_aliases: EITHER_DAVID, drink_tag: 'margarita' },
  },
  'working-drinkit-dwd-tampico-trauma': {
    conditionType: 'same_log',
    conditionConfig: {
      player_aliases: EITHER_DAVID,
      drink_concept_key: 'tequila-shot',
      bar_keys: POOL_BAR_KEYS,
    },
  },
  'working-drinkit-dwd-fireball-shot': {
    conditionType: 'same_log',
    conditionConfig: {
      player_aliases: EITHER_DAVID,
      drink_concept_key: 'fireball-shot',
      bar_key: 'princess-live',
    },
  },
  'working-drinkit-dwd-sambuca-shot': {
    conditionType: 'same_log',
    conditionConfig: {
      player_aliases: EITHER_DAVID,
      drink_concept_key: 'sambuca-shot',
      bar_key: 'princess-live',
    },
  },
  'working-drinkit-dwd-sunset-toast': {
    conditionType: 'same_log',
    conditionConfig: { player_aliases: EITHER_DAVID, hour_start: 17, hour_end: 19 },
  },
  'working-drinkit-dwd-jimmy-buffett-toast': {
    conditionType: 'same_log',
    conditionConfig: {
      player_aliases: EITHER_DAVID,
      drink_concept_key: 'loaded-corona',
      bar_keys: POOL_BAR_KEYS,
    },
  },

  // Previously blocked / remapped social
  'working-drinkit-d082': {
    conditionType: 'companion_predicate',
    conditionConfig: { mode: 'all_other_enrolled_companions' },
  },
  'working-drinkit-d085': {
    conditionType: 'day_bounty_score',
    conditionConfig: {
      min_points: 275,
      require_categories: ['cocktail', 'ingredient', 'bar', 'daily'],
    },
  },
  'working-drinkit-d087': {
    conditionType: 'companion_predicate',
    conditionConfig: {
      mode: 'named_companion',
      companion_alias: 'companion-josh',
      require_alcoholic: true,
      forbid_bounty_claims: true,
    },
  },
  'working-drinkit-d089': {
    conditionType: 'companion_predicate',
    conditionConfig: {
      mode: 'named_companion',
      companion_alias: 'companion-cindy',
      require_ingredient_key: 'aperol',
    },
  },

  // New daily-challenge day streaks
  'working-drinkit-d094': {
    conditionType: 'distinct_count',
    conditionConfig: {
      subject: 'cruise_days',
      threshold: 3,
      event: 'daily_completion',
    },
  },
  'working-drinkit-d095': {
    conditionType: 'distinct_count',
    conditionConfig: {
      subject: 'cruise_days',
      threshold: 7,
      event: 'daily_completion',
    },
  },

  // Banana
  'working-drinkit-d096': {
    conditionType: 'any',
    conditionConfig: {
      conditions: [
        { type: 'exact_match', ingredient_key: 'banana' },
        { type: 'exact_match', ingredient_key: 'banana-liqueur' },
        { type: 'exact_match', ingredient_key: 'banana-flavor' },
        { type: 'exact_match', ingredient_key: 'banana-puree' },
        { type: 'exact_match', ingredient_key: 'banana-syrup' },
      ],
    },
  },

  // Frozen tropical collections
  'working-drinkit-frozen-concoctions': {
    conditionType: 'offering_collection',
    conditionConfig: {
      scope: 'personal',
      mode: 'threshold',
      drink_tag: 'frozen',
      threshold: 3,
      require_tropical: true,
    },
  },
  'working-drinkit-license-to-chill': {
    conditionType: 'offering_collection',
    conditionConfig: {
      scope: 'personal',
      mode: 'full_menu',
      drink_tag: 'frozen',
      require_tropical: true,
    },
  },

  // Good Spirits gauntlets (definitions present; verification-gated at runtime)
  'working-drinkit-gauntlet-personal-good-spirits-at-sea': {
    conditionType: 'offering_collection',
    conditionConfig: {
      bar_key: 'good-spirits-at-sea',
      scope: 'personal',
      mode: 'full_menu',
      verification_required: true,
    },
  },
  'working-drinkit-gauntlet-collective-good-spirits-at-sea': {
    conditionType: 'offering_collection',
    conditionConfig: {
      bar_key: 'good-spirits-at-sea',
      scope: 'collective',
      mode: 'full_menu',
      verification_required: true,
    },
  },
}

/** GAUNTLET title/description overlays are applied from authority; conditions stay offering_collection. */
const GAUNTLET_BAR_FROM_KEY = {
  'working-drinkit-gauntlet-personal-lido-bar': { bar_key: 'lido-bar', scope: 'personal' },
  'working-drinkit-gauntlet-collective-lido-bar': { bar_key: 'lido-bar', scope: 'collective' },
  'working-drinkit-gauntlet-personal-the-mix': { bar_key: 'the-mix', scope: 'personal' },
  'working-drinkit-gauntlet-collective-the-mix': { bar_key: 'the-mix', scope: 'collective' },
  'working-drinkit-gauntlet-personal-promenade-bars': {
    bar_key: 'promenade-bars',
    scope: 'personal',
  },
  'working-drinkit-gauntlet-collective-promenade-bars': {
    bar_key: 'promenade-bars',
    scope: 'collective',
  },
  'working-drinkit-gauntlet-personal-star-bar': { bar_key: 'star-bar', scope: 'personal' },
  'working-drinkit-gauntlet-collective-star-bar': { bar_key: 'star-bar', scope: 'collective' },
  'working-drinkit-gauntlet-personal-omalleys-irish-pub': {
    bar_key: 'omalleys-irish-pub',
    scope: 'personal',
  },
  'working-drinkit-gauntlet-collective-omalleys-irish-pub': {
    bar_key: 'omalleys-irish-pub',
    scope: 'collective',
  },
  'working-drinkit-gauntlet-personal-princess-live': {
    bar_key: 'princess-live',
    scope: 'personal',
  },
  'working-drinkit-gauntlet-collective-princess-live': {
    bar_key: 'princess-live',
    scope: 'collective',
  },
  'working-drinkit-gauntlet-personal-bellinis-cocktail-bar': {
    bar_key: 'bellinis-cocktail-bar',
    scope: 'personal',
  },
  'working-drinkit-gauntlet-collective-bellinis-cocktail-bar': {
    bar_key: 'bellinis-cocktail-bar',
    scope: 'collective',
  },
  'working-drinkit-gauntlet-personal-wheelhouse-bar': {
    bar_key: 'wheelhouse-bar',
    scope: 'personal',
  },
  'working-drinkit-gauntlet-collective-wheelhouse-bar': {
    bar_key: 'wheelhouse-bar',
    scope: 'collective',
  },
  'working-drinkit-gauntlet-personal-crooners': { bar_key: 'crooners', scope: 'personal' },
  'working-drinkit-gauntlet-collective-crooners': { bar_key: 'crooners', scope: 'collective' },
  'working-drinkit-gauntlet-personal-wake-view-bar': {
    bar_key: 'wake-view-bar',
    scope: 'personal',
  },
  'working-drinkit-gauntlet-collective-wake-view-bar': {
    bar_key: 'wake-view-bar',
    scope: 'collective',
  },
  'working-drinkit-gauntlet-personal-sea-view-bar': {
    bar_key: 'sea-view-bar',
    scope: 'personal',
  },
  'working-drinkit-gauntlet-collective-sea-view-bar': {
    bar_key: 'sea-view-bar',
    scope: 'collective',
  },
  'working-drinkit-gauntlet-personal-cascade-bar': {
    bar_key: 'cascade-bar',
    scope: 'personal',
  },
  'working-drinkit-gauntlet-collective-cascade-bar': {
    bar_key: 'cascade-bar',
    scope: 'collective',
  },
}

function existingByKey(existingDefinitions) {
  const map = new Map()
  for (const row of existingDefinitions) map.set(row.stableKey, row)
  return map
}

function snapshotRefFor(stableKey, existing) {
  if (NEW_SNAPSHOT_REFS[stableKey]) return NEW_SNAPSHOT_REFS[stableKey]
  if (existing?.snapshotRef) return existing.snapshotRef
  const m = stableKey.match(/working-(?:drinkit|shipit)-([sd])(\d{3})$/i)
  if (m) return `${m[1].toUpperCase()}-${m[2]}`
  return stableKey.replace(/^working-/, 'FINAL-')
}

function exclusiveFor(finalRow, existing) {
  if (finalRow.game === 'shipit' && finalRow.category === 'First to Find') return true
  return Boolean(existing?.exclusive)
}

function ownerTypeFor(finalRow) {
  return finalRow.game === 'shipit' ? 'team' : 'player'
}

function buildCondition(stableKey, existing) {
  const override = CONDITION_BY_KEY[stableKey]
  if (override) {
    return {
      conditionType: override.conditionType,
      conditionConfig: structuredClone(override.conditionConfig),
    }
  }
  const gauntlet = GAUNTLET_BAR_FROM_KEY[stableKey]
  if (gauntlet) {
    return {
      conditionType: 'offering_collection',
      conditionConfig: {
        bar_key: gauntlet.bar_key,
        scope: gauntlet.scope,
        mode: 'full_menu',
      },
    }
  }
  if (!existing?.conditionType) {
    throw new Error(`Missing condition for ${stableKey}`)
  }
  return {
    conditionType: existing.conditionType,
    conditionConfig: existing.conditionConfig
      ? structuredClone(existing.conditionConfig)
      : null,
  }
}

function readinessFor(stableKey, conditionType) {
  if (RETIRE_STABLE_KEYS.includes(stableKey)) return 'retired'
  if (!conditionType) return 'blocked_organizer'
  // Companion aliases resolve at load; keep enabled so private map can unlock.
  return 'enabled'
}

/**
 * @param {{ rows: Array<object> }} authority
 * @param {Array<object>} existingDefinitions composed current catalog
 */
export function buildFinalAchievementDefinitions(authority, existingDefinitions) {
  const byKey = existingByKey(existingDefinitions)
  const active = []
  const seen = new Set()

  for (const finalRow of authority.rows) {
    const stableKey = resolveStableKey(finalRow)
    if (seen.has(stableKey)) {
      throw new Error(`Duplicate stable key assignment: ${stableKey} (${finalRow.name})`)
    }
    seen.add(stableKey)

    const existing = byKey.get(stableKey)
    const groupKey = groupKeyFor(finalRow)
    const { conditionType, conditionConfig } = buildCondition(stableKey, existing)
    const readiness = readinessFor(stableKey, conditionType)

    active.push({
      snapshotRef: snapshotRefFor(stableKey, existing),
      stableKey,
      game: finalRow.game,
      ownerType: ownerTypeFor(finalRow),
      groupKey,
      title: finalRow.name,
      displayDescription: finalRow.trigger,
      secret: finalRow.secret,
      exclusive: exclusiveFor(finalRow, existing),
      readiness,
      conditionType,
      conditionConfig,
      dependencies: existing?.dependencies || [],
      blockers: [],
      enabledInDev: readiness === 'enabled',
      testOnly: true,
      visibilityNote: finalRow.secret
        ? 'FINAL — secret until unlock'
        : 'FINAL — public',
      iconKey: finalRow.iconClass,
      iconClass: finalRow.iconClass,
      finalCategory: finalRow.category,
      verificationPending:
        Boolean(conditionConfig?.verification_required) ||
        stableKey.includes('good-spirits-at-sea'),
    })
  }

  const retired = []
  for (const key of RETIRE_STABLE_KEYS) {
    const existing = byKey.get(key)
    if (!existing) continue
    retired.push({
      ...existing,
      readiness: 'retired',
      enabledInDev: false,
      testOnly: true,
      visibilityNote: 'RETIRED — not in FINAL catalog; preserved for award history',
      blockers: ['retired_final_catalog'],
    })
  }

  if (active.length !== 174) {
    throw new Error(`Expected 174 active final definitions, got ${active.length}`)
  }

  const drinkit = active.filter((r) => r.game === 'drinkit')
  const shipit = active.filter((r) => r.game === 'shipit')
  if (drinkit.length !== 126 || shipit.length !== 48) {
    throw new Error(`Split mismatch drinkit=${drinkit.length} shipit=${shipit.length}`)
  }

  return { active, retired, drinkit, shipit }
}
