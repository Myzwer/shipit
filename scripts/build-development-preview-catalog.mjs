/**
 * Build development-preview full_snapshot catalog from handoff research.
 * Does not invent drinks, recipes, brands, or classifications.
 * Exact printed dollar amounts were not retained in the menu markdown —
 * CONFIRMED bars use price_usd=15 as a Princess Plus ceiling with explicit flags.
 *
 * Usage: node scripts/build-development-preview-catalog.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

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
    const m = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|/)
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
  let offeringRows = 0

  for (const [barKey, { def, cocktails }] of byBar) {
    for (const c of cocktails) {
      const key = slug(c.name)
      if (!drinks.has(key)) {
        drinks.set(key, {
          key,
          name: c.name,
          kind: 'named_cocktail',
          bar_offerings: [],
        })
      }
      const drink = drinks.get(key)
      const display = splitDisplayIngredients(c.recipe)
      // Apply display alias parentheticals only as display text, not as extra ingredients.
      const displayAliased = display.map((token) => {
        const expl = lexicon[token]
        return expl ? `${token} (${expl})` : token
      })
      // Price evidence categories (do NOT invent dollar amounts):
      // 1 explicit verified ≤$15 — none retained as exact $ in this markdown snapshot
      // 2 venue menu FILTERED to exclude known >$15, exact $ absent → unverified (provisional)
      // 3 unknown / Good Spirits unpriced → unverified
      // 4 explicitly >$15 — omitted from source
      const priceClass = def.verified ? 'filter_confirmed_exact_absent' : 'unknown_unpriced'
      drink.bar_offerings.push({
        bar_key: barKey,
        ingredient_keys: [], // filled from ranking objectives below
        display_ingredients: displayAliased.length ? displayAliased : display,
        price_usd: null,
        price_status: 'unverified',
        evidence_reference:
          priceClass === 'filter_confirmed_exact_absent'
            ? `handoff/data/menus/Star-Princess-Beverage-Source-Unmodified.md#${barKey}; venue menu FILTERED to ≤$15 class but exact printed dollar NOT transcribed — NOT verified_within_limit`
            : `handoff/data/menus/Star-Princess-Beverage-Source-Unmodified.md#${barKey}; Good Spirits unpriced — unknown $15 eligibility`,
      })
      offeringRows += 1
    }
  }

  const filterConfirmedBarKeys = new Set(BAR_DEFS.filter((b) => b.verified).map((b) => b.key))

  // Ingredient definitions + attach keys using ranking qualifying bar×drink evidence only.
  const ingredients = []
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
    ingredients.push({
      key: ingKey,
      name: displayName,
      aliases: [],
      family: null,
      ...(tags.length ? { classification_tags: tags } : {}),
    })

    const drinkNameSet = new Set(row.drinkNames)
    const barKeySet = new Set(row.barKeys)
    for (const drink of drinks.values()) {
      if (![...drinkNameSet].some((n) => slug(n) === drink.key || n === drink.name)) continue
      // Match by slug of ranking drink name to drink.key
      const matched = [...drinkNameSet].some((n) => slug(n) === drink.key)
      if (!matched) continue
      for (const off of drink.bar_offerings) {
        if (!barKeySet.has(off.bar_key)) continue
        if (!off.ingredient_keys.includes(ingKey)) off.ingredient_keys.push(ingKey)
      }
    }
  }

  // Also keep lightweight printed-token keys for lime/lemon/etc when already in ranking —
  // no extra invented ingredients beyond ranking objectives + empty keys already set.

  // Provisional ingredient candidates: ranking bar×drink ∩ filter-confirmed bars only.
  // These are NOT production Princess Plus corroborations (offerings remain unverified).
  for (const [ingKey, displayName] of INGREDIENT_OBJECTIVES.map((r) => [r[0], r[1]])) {
    if (!ingredients.some((i) => i.key === ingKey)) continue
    const barKeys = new Set()
    const drinkKeys = new Set()
    for (const drink of drinks.values()) {
      for (const off of drink.bar_offerings) {
        if (!off.ingredient_keys.includes(ingKey)) continue
        if (!filterConfirmedBarKeys.has(off.bar_key)) continue
        barKeys.add(off.bar_key)
        drinkKeys.add(drink.key)
      }
    }
    const barCount = barKeys.size
    const drinkCount = drinkKeys.size
    const tier = tierForBarCount(barCount)
    if (!tier || barCount < 2 || drinkCount < 1) {
      shortages.push(
        `Ingredient "${displayName}" (${ingKey}): provisional filter bars=${barCount} drinks=${drinkCount} — not eligible under Master Rules bands.`,
      )
      continue
    }
    if (barCount <= 4 && drinkCount < 3) {
      shortages.push(
        `Ingredient "${displayName}" (${ingKey}): bars=${barCount} drinks=${drinkCount} fails ranking hidden-hunt guardrail (≥3 drinks for ≤4 bars).`,
      )
      continue
    }
    ingredientCandidates.push({
      ingredient_key: ingKey,
      known_bar_count: barCount,
      distinct_qualifying_drinks: drinkCount,
      tier,
      points: INGREDIENT_TIER_POINTS[tier],
      eligible: true,
      notes:
        'PROVISIONAL development pool: ranking qualifying bar×drink ∩ filter-confirmed bars. Exact $ absent — offerings are unverified; production validator will not count these as Princess Plus corroborated.',
    })
  }

  // Provisional cocktail candidates: ranking ∩ filter-confirmed bar offerings (not exact-$ verified).
  const cocktailCandidates = []
  const skippedCocktails = []
  for (const [name, meta] of Object.entries(cocktailRank)) {
    const key = slug(name)
    const drink = drinks.get(key)
    if (!drink) {
      skippedCocktails.push(`${name}: not found in beverage source`)
      continue
    }
    const filterOffering = drink.bar_offerings.find((o) => filterConfirmedBarKeys.has(o.bar_key))
    if (!filterOffering) {
      skippedCocktails.push(`${name}: no filter-confirmed bar offering (likely Good Spirits only)`)
      continue
    }
    let designated = meta.bars.find((b) =>
      drink.bar_offerings.some((o) => o.bar_key === b && filterConfirmedBarKeys.has(b)),
    )
    if (!designated) designated = filterOffering.bar_key
    cocktailCandidates.push({
      drink_key: key,
      designated_bar_key: designated,
      tier: meta.tier,
      points: COCKTAIL_TIER_POINTS[meta.tier],
      eligible: true,
      notes:
        'PROVISIONAL development pool: venue menu was filtered to ≤$15 class but exact dollar was not transcribed. Not production verified_within_limit evidence.',
    })
  }

  // Stable order: tier adventurous→familiar, then name
  const tierOrder = { adventurous: 0, unusual: 1, interesting: 2, familiar: 3 }
  cocktailCandidates.sort(
    (a, b) => tierOrder[a.tier] - tierOrder[b.tier] || a.drink_key.localeCompare(b.drink_key),
  )

  const uncertainty_flags = [
    {
      code: 'FILTERED_WITHIN_LIMIT_EXACT_PRICE_ABSENT',
      message:
        'Category 2 price evidence: venue menus were previously filtered to omit known >$15 drinks, but exact printed dollar amounts were NOT transcribed. Offerings are price_status=unverified with price_usd=null. Do NOT treat as verified_within_limit. Provisional demo candidates only.',
    },
    {
      code: 'GOOD_SPIRITS_UNVERIFIED',
      message:
        'Category 3: Good Spirits at Sea cocktails have no printed prices. Offerings are unverified and are excluded from provisional featured Cocktail / Ingredient pools.',
      bar_key: 'good-spirits-at-sea',
    },
    {
      code: 'SHARED_POOL_MENU',
      message:
        'Promenade Bars, Lido Bar, The MIX, and Star Bar reuse one pool-bar PDF. Four game locations are not four independently verified menus; Star Bar is least verified.',
    },
    {
      code: 'RANKING_REVIEW_DRAFT',
      message:
        'Cocktail and Ingredient bounty tiers come from handoff review drafts remapped to Master Rules bar bands. Not onboard-verified production approval.',
    },
    {
      code: 'PROVISIONAL_DEMO_CANDIDATE_POOL',
      message:
        'cocktail_candidates / ingredient_candidates are a development-provisional pool for local demo seeding. Production previewCatalogImport will not count them as Princess Plus eligible while offerings remain unverified. safeToPublish remains false.',
    },
  ]

  const doc = {
    schema_version: '1.1',
    catalog_id: 'development-preview-star-princess-v1',
    base_catalog_id: null,
    mode: 'full_snapshot',
    source_notes: {
      // Bars whose venue menus were FILTER-confirmed as ≤$15 class (exact $ still absent).
      verified_bar_keys: BAR_DEFS.filter((b) => b.verified).map((b) => b.key),
      carried_forward_bar_keys: [],
      uncertainty_flags,
      evidence_summary:
        'Development PREVIEW catalog from handoff menus + ranking drafts. Authentic names/recipes only. Exact menu dollars absent → offerings unverified. Provisional candidate pools for local demo only. NOT production / launch-ready.',
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
    price_category_1_explicit_verified_usd: 0,
    price_category_2_filter_confirmed_exact_absent: offeringRows - [...drinks.values()].reduce(
      (n, d) => n + d.bar_offerings.filter((o) => o.bar_key === 'good-spirits-at-sea').length,
      0,
    ),
    price_category_3_unknown_unpriced_good_spirits: [...drinks.values()].reduce(
      (n, d) => n + d.bar_offerings.filter((o) => o.bar_key === 'good-spirits-at-sea').length,
      0,
    ),
    price_category_4_explicit_over_15: 0,
    provisional_cocktail_candidates: cocktailCandidates.length,
    provisional_ingredient_candidates: ingredientCandidates.length,
    cocktail_slot_target: 72,
    ingredient_slot_target: 39,
    provisional_cocktail_meets_slot_target: cocktailCandidates.length >= 72,
    provisional_ingredient_meets_slot_target: ingredientCandidates.length >= 39,
    skipped_cocktails: skippedCocktails,
    shortages,
    shared_pool_bars: [...SHARED_POOL],
  }

  return { doc, report }
}

const { doc, report } = build()
const outDir = join(root, 'content/catalogs')
mkdirSync(outDir, { recursive: true })
const outJson = join(outDir, 'development-preview-v1.json')
writeFileSync(outJson, `${JSON.stringify(doc, null, 2)}\n`)
const reportPath = join(root, 'docs/CONTENT_EVIDENCE_REPORT.md')
writeFileSync(
  reportPath,
  `# Development preview catalog — evidence report

Generated by \`scripts/build-development-preview-catalog.mjs\`.

## Inventory counts

| Metric | Value |
|---|---:|
| Offering rows (bar × cocktail) | ${report.offering_rows} |
| Unique cocktail concepts | ${report.unique_cocktails} |

## Price evidence categories

| Category | Meaning | Offering rows |
|---|---|---:|
| **1** Explicit verified menu price ≤ $15 | Exact printed dollar retained | **${report.price_category_1_explicit_verified_usd}** |
| **2** Filter-confirmed, exact $ absent | Venue menu filtered to exclude known >$15; exact $ not transcribed → \`unverified\` / null | **${report.price_category_2_filter_confirmed_exact_absent}** |
| **3** Unknown / unverified | Good Spirits unpriced | **${report.price_category_3_unknown_unpriced_good_spirits}** |
| **4** Explicitly over $15 | Omitted from source | **${report.price_category_4_explicit_over_15}** |

**Category 2 must not be labeled verified-priced.** No fabricated \`$15\` menu price is written into the catalog.

## Production validator (strict Princess Plus)

The unchanged production \`previewCatalogImport\` requires \`price_status=verified_within_limit\` and a numeric \`price_usd ≤ 15\` for Cocktail eligibility and Ingredient corroboration.

| Strict metric | Value |
|---|---:|
| Cocktail eligible (category 1) | **0** |
| Ingredient eligible (category 1 corroboration) | **0** |
| Cocktail slot target | 72 |
| Ingredient slot target | 39 |
| Cocktail shortage | **72** |
| Ingredient shortage | **39** |
| Expected readiness | \`valid_not_ready\` |
| \`safeToPublish\` | **always false** in TS preview (Phase 2C contract); also blocked for production publish while evidence is provisional |

## Provisional development candidate pools (demo only)

Local demo seeding may load provisional candidate rows so \`dev_generate_bounty_schedule\` can run on a development-only cruise. These pools are **not** launch-ready.

| Provisional metric | Value |
|---|---:|
| Provisional Cocktail candidates | ${report.provisional_cocktail_candidates} |
| Provisional Ingredient candidates | ${report.provisional_ingredient_candidates} |
| Meets ≥72 cocktail slots (provisional) | ${report.provisional_cocktail_meets_slot_target ? 'YES' : 'NO'} |
| Meets ≥39 ingredient slots (provisional) | ${report.provisional_ingredient_meets_slot_target ? 'YES' : 'NO'} |

## Why \`safeToPublish=false\` while readiness may be discussed

1. Pure TypeScript \`previewCatalogImport\` **always** returns \`safeToPublish: false\` (DB-blind; server staging/publish adds live checks).
2. With honest unverified offerings, strict readiness is \`valid_not_ready\` (shortages + ingredient corroboration errors).
3. Even a future exact-price catalog that reaches \`ready_for_scheduling\` still needs Admin stage/preview/publish DB gates before production.

## Shortages / skips

### Cocktail candidates skipped (provisional build)
${report.skipped_cocktails.map((s) => `- ${s}`).join('\n') || '_None_'}

### Ingredient provisional issues
${report.shortages.map((s) => `- ${s}`).join('\n') || '_None_'}

## Shared-pool bars

${report.shared_pool_bars.map((b) => `- \`${b}\``).join('\n')}

## Classification

Only conservative tags on ranking ingredient **objectives**. No invented frozen/clear/dark/rum-style drink tags.

## Production status

**BLOCKED FOR PRODUCTION / NOT LAUNCH-READY.**  
Acceptable as a **provisional development preview** for local demo scenarios only, via \`dev_activate_catalog_fixture\` on \`development-only\` cruises. Do not Admin-publish this catalog to production.
`,
)

console.log(JSON.stringify(report, null, 2))
console.log('Wrote', outJson)
console.log('Wrote', reportPath)

const validate = spawnSync('npx', ['vite-node', 'scripts/validate-preview-catalog.ts'], {
  cwd: root,
  encoding: 'utf8',
})
if (validate.stdout) console.log(validate.stdout)
if (validate.stderr) console.error(validate.stderr)
// Exit 0 after rebuild even when strict readiness is valid_not_ready (expected).
if (validate.status !== 0 && validate.status !== 2) {
  console.error('Validation spawn failed', validate.status)
  process.exit(1)
}
process.exit(0)
