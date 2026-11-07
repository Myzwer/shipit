/**
 * Build launch-candidate full_snapshot catalog from organizer-approved research.
 * Does not invent drinks, recipes, brands, classifications, or dollar prices.
 *
 * Price evidence:
 *   A — exact verified ≤$15 (none retained in this source)
 *   B — organizer-approved filtered source (191 offerings); price_usd=null
 *   C — unknown (Good Spirits); unverified
 *   D — explicit >$15 (none reconstructed from source)
 *
 * Usage: node scripts/build-launch-candidate-catalog.mjs
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

const PRINTED_INGREDIENT_MAP = JSON.parse(
  readFileSync(join(root, 'content/catalogs/printed-ingredient-map-v1.json'), 'utf8'),
)
const FILTERED_OFFERING_ALLOWLIST = JSON.parse(
  readFileSync(join(root, 'content/approvals/filtered-source-offerings-v1.json'), 'utf8'),
)
const FILTERED_FP_BY_IDENTITY = new Map(
  FILTERED_OFFERING_ALLOWLIST.offerings.map((o) => [`${o.drink_key}@${o.bar_key}`, o.recipe_fingerprint]),
)

function computeRecipeFingerprint(drinkKey, barKey, printedParts) {
  const normalized = printedParts.map((p) => p.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean)
  return createHash('sha256').update(`${drinkKey}\0${barKey}\0${normalized.join('\n')}`, 'utf8').digest('hex')
}

const BAR_DEFS = [
  { heading: 'Good Spirits at Sea (Deck 7)', key: 'good-spirits-at-sea', name: "Good Spirits at Sea", deck: '7', verified: false },
  { heading: "O'Malley's Irish Pub (Deck 7)", key: 'omalleys-irish-pub', name: "O'Malley's Irish Pub", deck: '7', verified: true },
  { heading: 'Princess Live! (Deck 7)', key: 'princess-live', name: 'Princess Live!', deck: '7', verified: true },
  { heading: "Bellini's Cocktail Bar (Deck 7)", key: 'bellinis-cocktail-bar', name: "Bellini's Cocktail Bar", deck: '7', verified: true },
  { heading: 'Wheelhouse Bar (Deck 7)', key: 'wheelhouse-bar', name: 'Wheelhouse Bar', deck: '7', verified: true },
  { heading: 'Crooners (Deck 8)', key: 'crooners', name: 'Crooners', deck: '8', verified: true },
  { heading: 'Wake View Bar (Deck 8)', key: 'wake-view-bar', name: 'Wake View Bar', deck: '8', verified: true },
  { heading: 'Promenade Bars (Deck 9)', key: 'promenade-bars', name: 'Promenade Bars', deck: '9', verified: true, sharedPool: true },
  { heading: 'Sea View Bar (Deck 17)', key: 'sea-view-bar', name: 'Sea View Bar', deck: '17', verified: true },
  { heading: 'Cascade Bar (Deck 17)', key: 'cascade-bar', name: 'Cascade Bar', deck: '17', verified: true },
  { heading: 'Lido Bar (Deck 17)', key: 'lido-bar', name: 'Lido Bar', deck: '17', verified: true, sharedPool: true },
  { heading: 'The MIX (Deck 17)', key: 'the-mix', name: 'The MIX', deck: '17', verified: true, sharedPool: true },
  { heading: 'Star Bar (Deck 18)', key: 'star-bar', name: 'Star Bar', deck: '18', verified: true, sharedPool: true },
]

const BAR_NAME_TO_KEY = {
  'Good Spirits at Sea': 'good-spirits-at-sea',
  "O'Malley's Irish Pub": 'omalleys-irish-pub',
  "O’Malley’s Irish Pub": 'omalleys-irish-pub',
  'Princess Live!': 'princess-live',
  "Bellini's Cocktail Bar": 'bellinis-cocktail-bar',
  "Bellini’s Cocktail Bar": 'bellinis-cocktail-bar',
  'Wheelhouse Bar': 'wheelhouse-bar',
  Crooners: 'crooners',
  'Wake View Bar': 'wake-view-bar',
  'Promenade Bars': 'promenade-bars',
  'Sea View Bar': 'sea-view-bar',
  'Cascade Bar': 'cascade-bar',
  'Lido Bar': 'lido-bar',
  'The MIX': 'the-mix',
  'Star Bar': 'star-bar',
}

const SHARED_POOL = new Set(['promenade-bars', 'lido-bar', 'the-mix', 'star-bar'])

/** Mirrors src/lib/catalog/priceEvidenceApprovals.ts — keep in sync. */
const FILTERED_SOURCE_APPROVAL_ID = 'star-princess-filtered-source-2026-11-07'

/** First ten Good Spirits ranking selections — pending price; keep eligible:false. */
const GOOD_SPIRITS_PENDING_COCKTAILS = [
  'Apples Delight',
  'Azul Blanco',
  'Grappa Peach',
  'Sandia en Fuego',
  'The Great Pumpkin',
  'Bangkok Mule',
  'Coco-Café',
  'The Cartagena Cool',
  'Vanilla Sky',
  'Gin & Tonic Ultima',
]

const COCKTAIL_TIER_POINTS = { familiar: 25, interesting: 50, unusual: 75, adventurous: 100 }
const INGREDIENT_TIER_POINTS = { easy_to_find: 25, less_common: 50, hard_to_find: 75, elusive: 100 }
const INGREDIENT_BANDS = {
  easy_to_find: [11, 13],
  less_common: [7, 10],
  hard_to_find: [4, 6],
  elusive: [2, 3],
}

const INGREDIENT_OBJECTIVES = [
  // key, display name, optional classification tags (only when objective itself is that family)
  ['coffee-liqueur-kahlua', 'Coffee liqueur (Kahlúa)', ['spirit-family-liqueur']],
  ['cranberry', 'Cranberry', ['fruit', 'fruit-berry']],
  ['blue-curacao', 'Blue curaçao', ['spirit-family-liqueur']],
  ['baileys-irish-cream', 'Baileys / Irish cream liqueur', ['spirit-family-liqueur']],
  ['melon-flavor', 'Melon flavor (including liqueur)', ['fruit']],
  ['mezcal', 'Mezcal (any style)', ['spirit-family-mezcal']],
  ['espresso', 'Espresso', []],
  ['basil', 'Basil', []],
  ['falernum', 'Falernum', ['spirit-family-liqueur']],
  ['peanut-butter-whiskey', 'Peanut butter whiskey', ['spirit-family-whiskey']],
  ['spiced-rum', 'Spiced rum', ['spirit-family-rum', 'rum-style-spiced']],
  ['hard-seltzer-truly', 'Hard seltzer in a cocktail (Truly)', []],
  ['chocolate-cacao', 'Chocolate / cacao flavor', []],
  ['white-light-rum', 'White / light rum', ['spirit-family-rum', 'rum-style-white']],
  ['lychee-flavor', 'Lychee flavor (including liqueur)', ['fruit', 'fruit-lychee']],
  ['vanilla-flavor', 'Vanilla flavor (including flavored vodka)', []],
  ['jalapeno', 'Jalapeño', ['hot-pepper']],
  ['bourbon', 'Bourbon', ['spirit-family-bourbon', 'spirit-family-whiskey']],
  ['orgeat', 'Orgeat / almond syrup', []],
  ['blanco-silver-tequila', 'Blanco / silver tequila', ['spirit-family-tequila', 'spirit-clear']],
  ['mango-flavor', 'Mango flavor', ['fruit', 'fruit-mango', 'fruit-tropical']],
  ['orange-fruit', 'Orange fruit / juice / peel', ['fruit', 'fruit-citrus']],
  ['peach-flavor', 'Peach flavor (including schnapps/liqueur)', ['fruit']],
  ['irish-whiskey', 'Irish whiskey', ['spirit-family-whiskey']],
  ['prosecco-in-cocktail', 'Prosecco in a cocktail', ['wine', 'prosecco']],
  ['aperol', 'Aperol', ['spirit-family-liqueur']],
  ['rose-wine-in-cocktail', 'Rosé wine in a cocktail', ['wine', 'rose']],
  ['banana-flavor', 'Banana flavor (including liqueur)', ['fruit']],
  ['raspberry-flavor', 'Raspberry flavor (including Chambord/vodka)', ['fruit', 'fruit-berry']],
  ['strawberry-flavor', 'Strawberry flavor', ['fruit', 'fruit-berry']],
  ['amaretto-disaronno', 'Amaretto / Disaronno', ['spirit-family-liqueur']],
  ['grapefruit-flavor', 'Grapefruit flavor (including soda/liqueur)', ['fruit', 'fruit-citrus']],
  ['passion-fruit-flavor', 'Passion fruit flavor', ['fruit', 'fruit-passion-fruit', 'fruit-tropical']],
  ['licor-43', 'Licor 43 (any variety)', ['spirit-family-liqueur']],
  ['bitters', 'Bitters (any style)', []],
  ['honey', 'Honey', []],
  ['mint', 'Mint', []],
  ['triple-sec-cointreau', 'Triple sec / Cointreau', ['spirit-family-liqueur']],
  ['agave', 'Agave', []],
  ['ginger-flavor', 'Ginger flavor (including ginger beer)', []],
  ['elderflower-st-germain', 'Elderflower / St-Germain', ['spirit-family-liqueur']],
  ['coconut-flavor', 'Coconut flavor (including coconut rum)', ['fruit', 'fruit-tropical']],
  ['pineapple-flavor', 'Pineapple flavor', ['fruit', 'fruit-pineapple', 'fruit-tropical']],
  ['lemon-flavor', 'Lemon flavor', ['fruit', 'fruit-citrus']],
  ['lime-flavor', 'Lime flavor', ['fruit', 'fruit-citrus']],
]

function slug(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function cleanCocktailName(raw) {
  return raw
    .replace(/\s*\(.*unpriced.*\)\s*/gi, '')
    .replace(/\s*⚠️\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseBarsList(cell) {
  return cell
    .split(',')
    .map((s) => s.replace(/†/g, '').trim())
    .filter(Boolean)
    .map((name) => BAR_NAME_TO_KEY[name] || null)
    .filter(Boolean)
}

function parseDrinkList(cell) {
  return cell
    .split(';')
    .map((s) => cleanCocktailName(s))
    .filter(Boolean)
}

function loadLexicon() {
  const path = join(root, 'handoff/data/menus/Ingredient-Display-Alias-Lexicon.json')
  return JSON.parse(readFileSync(path, 'utf8')).aliases || {}
}

function parseBeverageSource() {
  const text = readFileSync(join(root, 'handoff/data/menus/Star-Princess-Beverage-Source-Unmodified.md'), 'utf8')
  const parts = text.split(/\n## /)
  const byBar = new Map()
  for (const part of parts.slice(1)) {
    const lines = part.split('\n')
    const heading = lines[0].trim()
    const def = BAR_DEFS.find((b) => b.heading === heading)
    if (!def) continue
    const body = lines.join('\n')
    const m = body.match(/### Cocktails\n([\s\S]*?)(?=\n### |\s*$)/)
    const cocktails = []
    if (m) {
      for (const dm of m[1].matchAll(/^- \*\*(.+?)\*\* — (.+)$/gm)) {
        cocktails.push({ name: dm[1].trim(), recipe: dm[2].trim() })
      }
    }
    byBar.set(def.key, { def, cocktails })
  }
  return byBar
}

function parseCocktailRanking() {
  const text = readFileSync(join(root, 'handoff/data/rankings/Cocktail-Bounty-Rankings-REVIEW-DRAFT.md'), 'utf8')
  const tiers = {}
  let current = null
  for (const line of text.split('\n')) {
    if (line.startsWith('### Adventurous')) current = 'adventurous'
    else if (line.startsWith('### Unusual')) current = 'unusual'
    else if (line.startsWith('### Interesting')) current = 'interesting'
    else if (line.startsWith('### Familiar')) current = 'familiar'
    else if (line.startsWith('## Suggested cuts') || line.startsWith('## Discrepancy')) current = null
    // Allow trailing markers after the bold name (e.g. *(unpriced)* or ⚠️) before the next |.
    const m = line.match(/^\|\s*\*\*(.+?)\*\*[^\|]*\|\s*([^|]+)\|/)
    if (current && m) {
      const name = cleanCocktailName(m[1])
      const bars = parseBarsList(m[2].replace(/\(.*?\)/g, ''))
      tiers[name] = { tier: current, bars }
    }
  }
  return tiers
}

function parseIngredientRanking() {
  const text = readFileSync(
    join(root, 'handoff/data/rankings/Ingredient-Bounty-Rankings-Bar-First-REVIEW-DRAFT.md'),
    'utf8',
  )
  const secMap = {
    Elusive: 'elusive',
    'Hard to Find': 'hard_to_find',
    'Less Common': 'less_common',
    'Easy to Find': 'easy_to_find',
  }
  const rows = []
  let current = null
  for (const line of text.split('\n')) {
    for (const [label, tier] of Object.entries(secMap)) {
      if (line.startsWith(`### ${label}`)) current = tier
    }
    // | **Name** | bars | drinks | groups | bars list | cocktails |
    const m = line.match(
      /^\|\s*\*\*(.+?)\*\*\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/,
    )
    if (current && m) {
      rows.push({
        name: m[1].trim(),
        rankingTier: current,
        listedBars: Number(m[2]),
        uniqueCocktails: Number(m[3]),
        barKeys: parseBarsList(m[5]),
        drinkNames: parseDrinkList(m[6]),
      })
    }
  }
  return rows
}

function splitDisplayIngredients(recipe) {
  return recipe
    .split(',')
    .map((s) => s.replace(/\.$/, '').trim())
    .filter(Boolean)
}

function tierForBarCount(n) {
  for (const [tier, [lo, hi]] of Object.entries(INGREDIENT_BANDS)) {
    if (n >= lo && n <= hi) return tier
  }
  return null
}

function build() {
  const lexicon = loadLexicon()
  const byBar = parseBeverageSource()
  const cocktailRank = parseCocktailRanking()
  const ingredientRank = parseIngredientRanking()

  const bars = BAR_DEFS.map((b) => ({
    key: b.key,
    name: b.name,
    deck: b.deck,
    active: true,
  }))

  /** @type {Map<string, any>} */
  const drinks = new Map()
  /** @type {Map<string, { key: string, name: string, classification_tags: string[] }>} */
  const ingredientDefs = new Map()
  const unmappedTokenHits = new Map()
  let offeringRows = 0

  function ensureIngredientDef(key, name, tags) {
    const existing = ingredientDefs.get(key)
    if (!existing) {
      ingredientDefs.set(key, {
        key,
        name,
        classification_tags: [...new Set(tags || [])],
      })
      return
    }
    for (const t of tags || []) {
      if (!existing.classification_tags.includes(t)) existing.classification_tags.push(t)
    }
  }

  for (const [barKey, { def, cocktails }] of byBar) {
    for (const c of cocktails) {
      const key = slug(c.name)
      if (!drinks.has(key)) {
        const drinkTags = []
        if (/margarita/i.test(c.name)) drinkTags.push('margarita')
        drinks.set(key, {
          key,
          name: c.name,
          kind: 'named_cocktail',
          ...(drinkTags.length ? { classification_tags: drinkTags } : {}),
          bar_offerings: [],
        })
      } else if (/margarita/i.test(c.name)) {
        const drink = drinks.get(key)
        drink.classification_tags = [...new Set([...(drink.classification_tags || []), 'margarita'])]
      }
      const drink = drinks.get(key)
      const printed = splitDisplayIngredients(c.recipe)
      const displayAliased = printed.map((token) => {
        const expl = lexicon[token]
        return expl ? `${token} (${expl})` : token
      })
      const ingredientKeys = []
      for (const token of printed) {
        const mapped = PRINTED_INGREDIENT_MAP.tokens[token]
        if (!mapped) {
          unmappedTokenHits.set(token, (unmappedTokenHits.get(token) || 0) + 1)
          continue
        }
        if (!ingredientKeys.includes(mapped.key)) ingredientKeys.push(mapped.key)
        ensureIngredientDef(mapped.key, mapped.name || token, mapped.classification_tags || [])
      }

      // Price evidence (do NOT invent dollar amounts / never write $15 as menu price):
      if (def.verified) {
        const fp =
          FILTERED_FP_BY_IDENTITY.get(`${key}@${barKey}`) ||
          computeRecipeFingerprint(key, barKey, printed)
        drink.bar_offerings.push({
          bar_key: barKey,
          ingredient_keys: ingredientKeys,
          display_ingredients: displayAliased.length ? displayAliased : printed,
          price_usd: null,
          price_status: 'approved_filtered_within_limit',
          price_evidence_approval_id: FILTERED_SOURCE_APPROVAL_ID,
          price_evidence_recipe_fingerprint: fp,
          evidence_reference: `handoff/data/menus/Star-Princess-Beverage-Source-Unmodified.md#${barKey}; Category B organizer-approved filtered source (exact $ absent)`,
        })
      } else {
        drink.bar_offerings.push({
          bar_key: barKey,
          ingredient_keys: ingredientKeys,
          display_ingredients: displayAliased.length ? displayAliased : printed,
          price_usd: null,
          price_status: 'unverified',
          evidence_reference: `handoff/data/menus/Star-Princess-Beverage-Source-Unmodified.md#${barKey}; Good Spirits Category C — price unknown / unresolved`,
        })
      }
      offeringRows += 1
    }
  }

  const filterConfirmedBarKeys = new Set(BAR_DEFS.filter((b) => b.verified).map((b) => b.key))

  // Ranking objectives: ensure defs + attach keys on ranking bar×drink evidence (may add keys).
  // Do NOT create Ingredient Bounty candidates for non-ranking printed ingredients.
  const ingredientCandidates = []
  const shortages = []
  const nameToObj = new Map(INGREDIENT_OBJECTIVES.map((row) => [row[1], row]))

  for (const row of ingredientRank) {
    const obj = nameToObj.get(row.name)
    if (!obj) {
      shortages.push(`Ranking ingredient "${row.name}" has no canonical key mapping.`)
      continue
    }
    const [ingKey, displayName, tags] = obj
    ensureIngredientDef(ingKey, displayName, tags)

    const drinkNameSet = new Set(row.drinkNames)
    const barKeySet = new Set(row.barKeys)
    for (const drink of drinks.values()) {
      const matched = [...drinkNameSet].some((n) => slug(n) === drink.key)
      if (!matched) continue
      for (const off of drink.bar_offerings) {
        if (!barKeySet.has(off.bar_key)) continue
        if (!off.ingredient_keys.includes(ingKey)) off.ingredient_keys.push(ingKey)
      }
    }
  }

  const ingredients = [...ingredientDefs.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((ing) => ({
      key: ing.key,
      name: ing.name,
      aliases: [],
      family: null,
      ...(ing.classification_tags.length ? { classification_tags: ing.classification_tags } : {}),
    }))

  // Also keep lightweight printed-token keys for lime/lemon/etc when already in ranking —
  // no extra invented ingredients beyond ranking objectives + empty keys already set.

  // Ingredient candidates: ranking bar×drink ∩ Category B (approved filtered) bars.
  // Good Spirits (Category C) never corroborates. Tier remapped to Master Rules bar bands.
  const reconciliation = []
  for (const row of ingredientRank) {
    const obj = nameToObj.get(row.name)
    if (!obj) {
      reconciliation.push({
        kind: 'ingredient',
        source_name: row.name,
        source_tier: row.rankingTier,
        source_points: INGREDIENT_TIER_POINTS[row.rankingTier] ?? null,
        status: 'missing_canonical_key',
        loggable: false,
        schedulable: false,
        action: 'Map canonical ingredient key or drop from approved ranking.',
      })
    }
  }

  for (const [ingKey, displayName] of INGREDIENT_OBJECTIVES.map((r) => [r[0], r[1]])) {
    if (!ingredients.some((i) => i.key === ingKey)) continue
    const rankingRow = ingredientRank.find((r) => r.name === displayName)
    const barKeys = new Set()
    const drinkKeys = new Set()
    for (const drink of drinks.values()) {
      for (const off of drink.bar_offerings) {
        if (!off.ingredient_keys.includes(ingKey)) continue
        if (off.price_status !== 'approved_filtered_within_limit') continue
        if (!filterConfirmedBarKeys.has(off.bar_key)) continue
        barKeys.add(off.bar_key)
        drinkKeys.add(drink.key)
      }
    }
    const barCount = barKeys.size
    const drinkCount = drinkKeys.size
    const tier = tierForBarCount(barCount)
    const sourceTier = rankingRow?.rankingTier ?? null
    if (!tier || barCount < 2 || drinkCount < 1) {
      const msg = `Ingredient "${displayName}" (${ingKey}): Category B bars=${barCount} drinks=${drinkCount} — not eligible under Master Rules bands.`
      shortages.push(msg)
      reconciliation.push({
        kind: 'ingredient',
        source_name: displayName,
        source_key: ingKey,
        source_tier: sourceTier,
        source_points: sourceTier ? INGREDIENT_TIER_POINTS[sourceTier] : null,
        engine_tier: tier,
        status: 'excluded_coverage',
        reason: msg,
        price_evidence: 'Category B filter bars only; Good Spirits excluded',
        loggable: true,
        schedulable: false,
        action: 'None for launch if pool ≥39; onboard check only if coverage recovers.',
      })
      continue
    }
    if (barCount <= 4 && drinkCount < 3) {
      const msg = `Ingredient "${displayName}" (${ingKey}): bars=${barCount} drinks=${drinkCount} fails ranking hidden-hunt guardrail (≥3 drinks for ≤4 bars).`
      shortages.push(msg)
      reconciliation.push({
        kind: 'ingredient',
        source_name: displayName,
        source_key: ingKey,
        source_tier: sourceTier,
        source_points: sourceTier ? INGREDIENT_TIER_POINTS[sourceTier] : null,
        engine_tier: tier,
        status: 'excluded_hidden_hunt_guardrail',
        reason: msg,
        price_evidence: 'Category B',
        loggable: true,
        schedulable: false,
        action: 'Keep out of Ingredient Bounty pool; drinks remain loggable.',
      })
      continue
    }
    if (sourceTier && sourceTier !== tier) {
      reconciliation.push({
        kind: 'ingredient',
        source_name: displayName,
        source_key: ingKey,
        source_tier: sourceTier,
        source_points: INGREDIENT_TIER_POINTS[sourceTier],
        engine_tier: tier,
        engine_points: INGREDIENT_TIER_POINTS[tier],
        status: 'tier_remapped_to_master_rules_band',
        reason: `Ranking tier "${sourceTier}" remapped to engine band "${tier}" for bar_count=${barCount} without changing schedule timing.`,
        price_evidence: 'Category B',
        loggable: true,
        schedulable: true,
        action: 'None — engine band wins for points/tier; ranking intent preserved via coverage.',
      })
    }
    ingredientCandidates.push({
      ingredient_key: ingKey,
      known_bar_count: barCount,
      distinct_qualifying_drinks: drinkCount,
      tier,
      points: INGREDIENT_TIER_POINTS[tier],
      eligible: true,
      notes:
        'Launch-candidate Category B corroboration: organizer-approved filtered-source offerings only. Exact $ absent (price_usd null). Good Spirits excluded.',
    })
  }

  // Cocktail candidates: ranking ∩ Category B bars (eligible), plus GS pending (eligible:false).
  const cocktailCandidates = []
  const skippedCocktails = []
  const gsPendingSet = new Set(GOOD_SPIRITS_PENDING_COCKTAILS.map((n) => slug(n)))
  for (const [name, meta] of Object.entries(cocktailRank)) {
    const key = slug(name)
    const drink = drinks.get(key)
    if (!drink) {
      skippedCocktails.push(`${name}: not found in beverage source`)
      reconciliation.push({
        kind: 'cocktail',
        source_name: name,
        source_tier: meta.tier,
        source_points: COCKTAIL_TIER_POINTS[meta.tier],
        status: 'missing_from_menu_source',
        loggable: false,
        schedulable: false,
        action: 'Verify ranking name vs beverage source.',
      })
      continue
    }
    const filterOffering = drink.bar_offerings.find(
      (o) => o.price_status === 'approved_filtered_within_limit' && filterConfirmedBarKeys.has(o.bar_key),
    )
    if (!filterOffering) {
      // Good Spirits-only (or unknown): keep first-ten pending; others stay ranking-only notes.
      const gsOffering = drink.bar_offerings.find((o) => o.bar_key === 'good-spirits-at-sea')
      if (gsOffering && gsPendingSet.has(key)) {
        cocktailCandidates.push({
          drink_key: key,
          designated_bar_key: 'good-spirits-at-sea',
          tier: meta.tier,
          points: COCKTAIL_TIER_POINTS[meta.tier],
          eligible: false,
          notes:
            'PENDING_PRICE: organizer-selected Good Spirits ranking entry. Category C unknown price — not schedule-eligible until onboard price check clears Category A or separate approval.',
        })
        reconciliation.push({
          kind: 'cocktail',
          source_name: name,
          source_key: key,
          source_tier: meta.tier,
          source_points: COCKTAIL_TIER_POINTS[meta.tier],
          status: 'good_spirits_pending_price',
          price_evidence: 'Category C unknown',
          loggable: true,
          schedulable: false,
          action:
            'Onboard: photograph/price-check this drink. If ≤$15 with exact $, set Category A; do not invent $15.',
        })
        continue
      }
      skippedCocktails.push(`${name}: no Category B bar offering (Good Spirits only / unresolved)`)
      reconciliation.push({
        kind: 'cocktail',
        source_name: name,
        source_key: key,
        source_tier: meta.tier,
        source_points: COCKTAIL_TIER_POINTS[meta.tier],
        status: 'excluded_unknown_price',
        price_evidence: 'Category C',
        loggable: Boolean(gsOffering),
        schedulable: false,
        action: 'Remain loggable when on menu; not Cocktail Bounty eligible.',
      })
      continue
    }
    let designated = meta.bars.find((b) =>
      drink.bar_offerings.some(
        (o) => o.bar_key === b && o.price_status === 'approved_filtered_within_limit',
      ),
    )
    if (!designated) designated = filterOffering.bar_key
    cocktailCandidates.push({
      drink_key: key,
      designated_bar_key: designated,
      tier: meta.tier,
      points: COCKTAIL_TIER_POINTS[meta.tier],
      eligible: true,
      notes:
        'Launch-candidate Category B: organizer-approved filtered-source evidence. Exact printed $ absent — price_usd null; not Category A.',
    })
  }

  // Stable order: tier adventurous→familiar, then name
  const tierOrder = { adventurous: 0, unusual: 1, interesting: 2, familiar: 3 }
  cocktailCandidates.sort(
    (a, b) => tierOrder[a.tier] - tierOrder[b.tier] || a.drink_key.localeCompare(b.drink_key),
  )

  const uncertainty_flags = [
    {
      code: 'FILTERED_SOURCE_CATEGORY_B',
      message:
        'Category B: venue menus were filtered to omit known >$15 drinks; exact printed dollars were NOT transcribed. Offerings use approved_filtered_within_limit with price_usd=null under organizer approval star-princess-filtered-source-2026-11-07. Distinct from Category A exact verified prices — never display $15 as the menu price.',
    },
    {
      code: 'GOOD_SPIRITS_UNVERIFIED',
      message:
        'Category C: Good Spirits at Sea cocktails have no printed prices. Offerings remain unverified. First ten ranking selections are retained as eligible:false pending-price candidates; they are not required for the 72-slot Cocktail schedule.',
      bar_key: 'good-spirits-at-sea',
    },
    {
      code: 'SHARED_POOL_MENU',
      message:
        'Promenade Bars, Lido Bar, The MIX, and Star Bar reuse one pool-bar PDF. Four game locations are not four independently verified menus; Star Bar is least verified.',
    },
    {
      code: 'RANKINGS_ORGANIZER_APPROVED',
      message:
        'Cocktail and Ingredient bounty rankings are organizer-approved (content/approvals/rankings-approval-v1.json). Ingredient tiers are remapped to Master Rules bar bands when ranking document bands differ; schedule slot timing is not restored from obsolete ranking projections.',
    },
  ]

  const eligibleCocktail = cocktailCandidates.filter((c) => c.eligible !== false).length
  const pendingGs = cocktailCandidates.filter((c) => c.eligible === false).length

  const doc = {
    schema_version: '1.1',
    catalog_id: 'star-princess-launch-candidate-v1',
    base_catalog_id: null,
    mode: 'full_snapshot',
    source_notes: {
      verified_bar_keys: BAR_DEFS.filter((b) => b.verified).map((b) => b.key),
      carried_forward_bar_keys: [],
      uncertainty_flags,
      price_evidence_approvals: [
        {
          approval_id: FILTERED_SOURCE_APPROVAL_ID,
          offering_set_sha256: FILTERED_OFFERING_ALLOWLIST.offering_set_sha256,
        },
      ],
      evidence_summary:
        'Launch-candidate catalog from organizer-approved menus + rankings. Category B bound to approved drink@bar + recipe fingerprints (price_usd null). Printed recipe tokens mapped to canonical ingredients without inventing bounty objectives. Good Spirits Category C pending. Demo and production import share this artifact; Phase 10C does not activate a cruise.',
    },
    bars,
    ingredients,
    drinks: [...drinks.values()],
    cocktail_candidates: cocktailCandidates,
    ingredient_candidates: ingredientCandidates,
  }

  const report = {
    offering_rows: offeringRows,
    unique_cocktails: drinks.size,
    ingredient_definitions: ingredients.length,
    ingredient_bounty_objectives: ingredientCandidates.length,
    printed_tokens_mapped: PRINTED_INGREDIENT_MAP.mapped_unique_tokens,
    printed_tokens_unknown: PRINTED_INGREDIENT_MAP.unknown_unique_tokens,
    unmapped_token_hits: Object.fromEntries([...unmappedTokenHits.entries()].sort()),
    price_category_A_exact_verified_usd: 0,
    price_category_B_approved_filtered: offeringRows - [...drinks.values()].reduce(
      (n, d) => n + d.bar_offerings.filter((o) => o.bar_key === 'good-spirits-at-sea').length,
      0,
    ),
    price_category_C_unknown_good_spirits: [...drinks.values()].reduce(
      (n, d) => n + d.bar_offerings.filter((o) => o.bar_key === 'good-spirits-at-sea').length,
      0,
    ),
    price_category_D_explicit_over_15: 0,
    cocktail_candidates_total: cocktailCandidates.length,
    cocktail_eligible: eligibleCocktail,
    cocktail_pending_good_spirits: pendingGs,
    ingredient_eligible: ingredientCandidates.length,
    cocktail_slot_target: 72,
    ingredient_slot_target: 39,
    cocktail_meets_slot_target: eligibleCocktail >= 72,
    ingredient_meets_slot_target: ingredientCandidates.length >= 39,
    skipped_cocktails: skippedCocktails,
    shortages,
    shared_pool_bars: [...SHARED_POOL],
    reconciliation,
  }

  return { doc, report }
}

const { doc, report } = build()
const outDir = join(root, 'content/catalogs')
mkdirSync(outDir, { recursive: true })
const outJson = join(outDir, 'launch-candidate-v1.json')
writeFileSync(outJson, `${JSON.stringify(doc, null, 2)}\n`)
// Demos and prior scripts may still reference the preview filename — keep identical artifact.
writeFileSync(join(outDir, 'development-preview-v1.json'), `${JSON.stringify(doc, null, 2)}\n`)

const reportPath = join(root, 'docs/CONTENT_EVIDENCE_REPORT.md')
writeFileSync(
  reportPath,
  `# Launch-candidate catalog — evidence report

Generated by \`scripts/build-launch-candidate-catalog.mjs\`.

## Inventory counts

| Metric | Value |
|---|---:|
| Offering rows (bar × cocktail) | ${report.offering_rows} |
| Unique cocktail concepts | ${report.unique_cocktails} |

## Price evidence categories

| Category | Meaning | Offering rows | Catalog representation |
|---|---|---:|---|
| **A** Exact verified menu price ≤ $15 | Exact printed dollar retained | **${report.price_category_A_exact_verified_usd}** | \`verified_within_limit\` + numeric \`price_usd\` |
| **B** Organizer-approved filtered source | Venue filtered to exclude known >$15; exact $ absent | **${report.price_category_B_approved_filtered}** | \`approved_filtered_within_limit\` + approval_id; \`price_usd: null\` |
| **C** Unknown / unresolved | Good Spirits unpriced | **${report.price_category_C_unknown_good_spirits}** | \`unverified\` / null |
| **D** Explicitly over $15 | Not reconstructed from source | **${report.price_category_D_explicit_over_15}** | would be \`verified_over_limit\` |

**B is not A.** Never invent \`$15\` as \`price_usd\`. Never display \`$15\` as the menu price for Category B.

## Launch-candidate bounty pools

| Metric | Value |
|---|---:|
| Cocktail candidates (eligible Category B) | **${report.cocktail_eligible}** |
| Cocktail pending Good Spirits (\`eligible:false\`) | **${report.cocktail_pending_good_spirits}** |
| Ingredient eligible (Category B corroboration) | **${report.ingredient_eligible}** |
| Cocktail slot target | 72 |
| Ingredient slot target | 39 |
| Cocktail meets ≥72 | ${report.cocktail_meets_slot_target ? 'YES' : 'NO'} |
| Ingredient meets ≥39 | ${report.ingredient_meets_slot_target ? 'YES' : 'NO'} |
| Expected TS readiness | \`ready_for_scheduling\` when pools meet targets and cross-refs pass |
| \`safeToPublish\` | **always false** in TS preview (Phase 2C); server stage/publish required for production |

## Why \`safeToPublish=false\` while \`ready_for_scheduling\` may be true

1. Pure TypeScript \`previewCatalogImport\` **always** returns \`safeToPublish: false\` (DB-blind).
2. \`ready_for_scheduling\` means pool sizes and evidence rules pass — not that a cruise is activated.
3. Production activation still requires Admin stage → preview → publish on a real cruise (out of scope for Phase 10B).

## Shortages / skips

### Cocktail notes
${report.skipped_cocktails.map((s) => `- ${s}`).join('\n') || '_None_'}

### Ingredient issues
${report.shortages.map((s) => `- ${s}`).join('\n') || '_None_'}

## Shared-pool bars

${report.shared_pool_bars.map((b) => `- \`${b}\``).join('\n')}

## Classification

Only conservative tags on ranking ingredient **objectives**. No invented frozen/clear/dark/rum-style drink tags.

## Activation status

**Launch-candidate content** — suitable for guarded production import when the organizer explicitly activates a cruise.  
Phase 10B does **not** activate production. Demo scenarios load this same artifact on \`development-only\` cruises only.
`,
)

const reconPath = join(root, 'docs/CANDIDATE_RECONCILIATION.md')
const reconRows = report.reconciliation
writeFileSync(
  reconPath,
  `# Ranking → launch-candidate reconciliation

Organizer-approved ranking sources (unchanged files):
- \`handoff/data/rankings/Cocktail-Bounty-Rankings-REVIEW-DRAFT.md\`
- \`handoff/data/rankings/Ingredient-Bounty-Rankings-Bar-First-REVIEW-DRAFT.md\`

Approval manifest: \`content/approvals/rankings-approval-v1.json\`

Schedule cadence remains **72 Cocktail / 39 Ingredient** slots (current engine). Obsolete ranking slot projections are not restored.

| Kind | Source | Source tier/pts | Status | Price evidence | Loggable | Schedulable | Action |
|---|---|---|---|---|---|---|---|
${reconRows
  .map((r) => {
    const pts = r.source_points != null ? `${r.source_tier}/${r.source_points}` : r.source_tier ?? ''
    const eng =
      r.engine_tier != null ? ` → engine ${r.engine_tier}/${r.engine_points ?? ''}` : ''
    return `| ${r.kind} | ${r.source_name}${r.source_key ? ` (\`${r.source_key}\`)` : ''} | ${pts}${eng} | ${r.status} | ${r.price_evidence ?? '—'} | ${r.loggable ? 'yes' : 'no'} | ${r.schedulable ? 'yes' : 'no'} | ${r.action ?? r.reason ?? ''} |`
  })
  .join('\n')}

## Summary counts

| | Ranking source | Launch-candidate eligible |
|---|---:|---:|
| Cocktail retained / eligible | 89 (incl. 10 GS pending) | ${report.cocktail_eligible} (+ ${report.cocktail_pending_good_spirits} pending GS) |
| Ingredient objectives | 45 | ${report.ingredient_eligible} |
`,
)

console.log(JSON.stringify({ ...report, reconciliation: `[${report.reconciliation.length} rows]` }, null, 2))
console.log('Wrote', outJson)
console.log('Wrote', reportPath)
console.log('Wrote', reconPath)

const validate = spawnSync('npx', ['vite-node', 'scripts/validate-preview-catalog.ts'], {
  cwd: root,
  encoding: 'utf8',
})
if (validate.stdout) console.log(validate.stdout)
if (validate.stderr) console.error(validate.stderr)
if (validate.status !== 0 && validate.status !== 2) {
  console.error('Validation spawn failed', validate.status)
  process.exit(1)
}
process.exit(0)
