/**
 * Menu Launch Gate M2-P1 — unpriced-menu price eligibility policy.
 *
 * Disposable :55321 / star-princess-disposable-mo ONLY.
 * Never mutates organizer :54321 or Agent 2 :56321.
 * Never sets QA_ALLOW_ORGANIZER_MUTATION.
 */
import ws from 'ws'
globalThis.WebSocket ??= ws
import { createServer } from 'vite'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import * as L from '../gate-a/lib.mjs'

/** Large payload SQL via stdin (avoids docker exec ARG_MAX). */
function disposableSqlStdin(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', L.DISPOSABLE_DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'],
    { encoding: 'utf8', input: sql },
  ).trim()
}

function disposableJsonStdin(selectSql) {
  const out = disposableSqlStdin(
    `select coalesce(json_agg(t), '[]'::json) from (${selectSql}) t;`,
  )
  return JSON.parse(out || '[]')
}

function payloadLiteral(payload) {
  // Dollar-quote JSON for safe embedding in stdin SQL.
  return `$m2payload$${JSON.stringify(payload)}$m2payload$::jsonb`
}

const OUT = join(L.ROOT, 'docs/qa/campaign/menu-launch/m2-price-policy')
const EVIDENCE = join(OUT, 'evidence')
const FIXTURES = join(OUT, 'fixtures')
mkdirSync(EVIDENCE, { recursive: true })
mkdirSync(FIXTURES, { recursive: true })

const { env, service, anon } = L.createClients()
const beforeOrg = L.organizerCruiseId()
const beforeA2 = L.agent2CruiseId()
const rec = L.makeRecorder('m2-price-policy')

function expect(cond, id, summary, detail = {}) {
  rec.record(id, cond ? 'PASS' : 'FAIL', { summary, ...detail })
}

function info(id, summary, detail = {}) {
  rec.record(id, 'INFO', { summary, ...detail })
}

function codesOf(preview) {
  return [
    ...(preview.schemaErrors ?? []),
    ...(preview.crossReferenceErrors ?? []),
    ...(preview.businessRuleErrors ?? []),
  ].map((e) => e.code)
}

function loadLaunchCandidate() {
  return JSON.parse(readFileSync(join(L.ROOT, 'content/catalogs/launch-candidate-v1.json'), 'utf8'))
}

function cloneLaunch(suffix) {
  const doc = structuredClone(loadLaunchCandidate())
  doc.catalog_id = `star-princess-launch-candidate-v1-m2-${suffix}`
  doc.base_catalog_id = null
  return doc
}

async function loadCatalogLibs() {
  const vite = await createServer({
    root: L.ROOT,
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': join(L.ROOT, 'src') } },
  })
  const catalog = await vite.ssrLoadModule('/src/lib/catalog/index.ts')
  const adminImp = await vite.ssrLoadModule('/src/lib/adminCatalogImport.ts')
  const builders = await vite.ssrLoadModule('/tests/fixtures/catalog/builders.ts')
  return { vite, catalog, adminImp, builders }
}

async function stageWithValidation(admin, payload, catalogLibs) {
  const preview = catalogLibs.catalog.previewCatalogImport(payload)
  if (!catalogLibs.catalog.isReadyToStage(preview)) {
    return { ok: false, code: 'VALIDATION_NOT_READY', preview, stage: null }
  }
  const payloadHash = await catalogLibs.adminImp.hashPayload(payload)
  const validation = catalogLibs.catalog.buildStageValidation(preview, payloadHash)
  const stage = await admin.rpc('admin_stage_catalog_import', {
    p_client_request_id: L.newId(),
    p_payload: payload,
    p_validation: validation,
  })
  return { ok: stage.data?.ok === true, code: stage.data?.code, preview, stage, validation, payloadHash }
}

async function activePointer() {
  const row = L.disposableJson(`
    select acp.catalog_version_id, cv.catalog_id, cv.status, cv.payload_hash
    from active_catalog_pointer acp
    join catalog_versions cv on cv.id = acp.catalog_version_id
    where acp.id = 1
  `)[0]
  return row ?? null
}

async function publishCandidate(admin, candidateId, payloadHash) {
  const expectedActive = (await activePointer())?.catalog_version_id ?? null
  const preview = await admin.rpc('admin_preview_catalog_publish', { p_candidate_id: candidateId })
  const pub = await admin.rpc('admin_publish_catalog_import', {
    p_client_request_id: L.newId(),
    p_candidate_id: candidateId,
    p_expected_active_catalog_version_id: expectedActive,
    p_expected_payload_hash: payloadHash,
  })
  return { preview, pub, expectedActive }
}

function scheduleCounts(cruiseId) {
  return L.disposableJson(`
    select jsonb_build_object(
      'cocktail', (select count(*) from bounty_slots where cruise_config_id='${cruiseId}' and category='cocktail'),
      'ingredient', (select count(*) from bounty_slots where cruise_config_id='${cruiseId}' and category='ingredient'),
      'bar', (select count(*) from bar_bounties where cruise_config_id='${cruiseId}'),
      'daily', (select count(*) from daily_challenges where cruise_config_id='${cruiseId}')
    ) as counts
  `)[0]?.counts
}

function sqlPriceErrors(payload) {
  return disposableJsonStdin(`
    select e->>'code' as code, e->>'message' as message
    from jsonb_array_elements(public.catalog_payload_price_evidence_errors(${payloadLiteral(payload)})) e
  `)
}

function sqlCocktailEligible(payload, drinkKey, barKey) {
  const row = disposableJsonStdin(`
    select drink_key, bar_key, eligible
    from public.catalog_payload_cocktail_pool(${payloadLiteral(payload)})
    where drink_key = '${drinkKey}' and bar_key = '${barKey}'
  `)[0]
  return row ?? null
}

function authorizeUnpriced(doc, barKey, evidence = `photo:${barKey}-complete-unpriced`) {
  doc.source_notes.unpriced_menu_authorizations = [
    ...(doc.source_notes.unpriced_menu_authorizations ?? []).filter((a) => a.bar_key !== barKey),
    {
      bar_key: barKey,
      completeness: 'complete_menu_no_printed_prices',
      evidence_reference: evidence,
    },
  ]
}

function buildUnpricedPolicyCatalog(builders) {
  const doc = builders.buildScheduleReadyCatalog(72, 39)
  doc.catalog_id = `m2-unpriced-policy-${L.newId().slice(0, 8)}`
  // Convert good-spirits into a complete price-free menu.
  // Explicit over-limit rows cannot remain on that bar (known $ overrides U).
  for (const drink of doc.drinks) {
    for (const o of drink.bar_offerings) {
      if (o.bar_key !== 'good-spirits') continue
      if (o.price_status === 'verified_over_limit') {
        o.bar_key = 'carried-bar'
        continue
      }
      o.price_status = 'approved_unpriced_menu_within_limit'
      o.price_usd = null
      delete o.price_evidence_approval_id
      delete o.price_evidence_recipe_fingerprint
      o.evidence_reference = 'photo:good-spirits-complete-unpriced'
    }
  }
  // Avoid duplicate offerings if a drink already had carried-bar.
  for (const drink of doc.drinks) {
    const seen = new Set()
    drink.bar_offerings = drink.bar_offerings.filter((o) => {
      if (seen.has(o.bar_key)) return false
      seen.add(o.bar_key)
      return true
    })
  }
  authorizeUnpriced(doc, 'good-spirits')
  return doc
}

// ───────────────────────────── ENV / SAFETY ─────────────────────────────
console.log('\n=== M2 ENV / SAFETY ===')
expect(beforeOrg === L.ORGANIZER_CRUISE_EXPECTED, 'ENV-ORG', 'Organizer cruise protected', { beforeOrg })
expect(beforeA2 === L.AGENT2_CRUISE_EXPECTED, 'ENV-A2', 'Agent 2 cruise protected', { beforeA2 })
expect(process.env.QA_ALLOW_ORGANIZER_MUTATION !== '1', 'ENV-NO-ORG-MUTATION', 'No organizer mutation flag')
expect(env.VITE_SUPABASE_URL === L.DISPOSABLE_URL, 'ENV-DISPOSABLE-URL', 'Clients target :55321')

const mig = L.disposableJson(`
  select version from supabase_migrations.schema_migrations
  where version in ('20261105011500','20261105011600')
  order by version
`)
expect(
  mig.map((r) => r.version).join(',') === '20261105011500,20261105011600',
  'ENV-MIGRATIONS',
  'Disposable has M2 enum+policy migrations',
  { mig },
)
const enumOk = L.disposableSql(`
  select exists(
    select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typname='price_verification_status'
      and e.enumlabel='approved_unpriced_menu_within_limit'
  )
`)
expect(enumOk === 't', 'ENV-ENUM', 'approved_unpriced_menu_within_limit enum present')

const cruise0 = await L.ensureCruiseNotOrganizer(service)
info('ENV-CRUISE', `Disposable cruise ${cruise0.id}`, { cruise: cruise0 })

const libs = await loadCatalogLibs()
const identities = L.loadIdentities().identities
const byKey = Object.fromEntries(identities.map((p) => [p.key, p]))
const admin = await L.signIn(anon, byKey.admin.login_alias, env.LOCAL_TEST_PASSWORD)
const authorId = byKey.drink_only.player_id
const companionId = byKey.both.player_id

// ───────────────────────────── TS + SQL POLICY MATRIX ─────────────────────────────
console.log('\n=== Category A/B/C/D + U matrix ===')

const febPreview = libs.catalog.previewCatalogImport(loadLaunchCandidate())
expect(
  febPreview.readiness === 'ready_for_scheduling' &&
    febPreview.counts.cocktailEligible >= 79 &&
    febPreview.counts.ingredientEligible >= 44,
  'FEB-POOLS',
  'February fallback still ≥79/44 eligible',
  {
    readiness: febPreview.readiness,
    cocktailEligible: febPreview.counts.cocktailEligible,
    ingredientEligible: febPreview.counts.ingredientEligible,
  },
)

{
  const syn = libs.builders.buildScheduleReadyCatalog(72, 39)
  syn.catalog_id = `m2-abcd-${L.newId().slice(0, 6)}`
  const p = libs.catalog.previewCatalogImport(syn)
  expect(p.readiness === 'ready_for_scheduling', 'TS-ABCD-BASE', 'Category A fixture remains ready', {
    counts: p.counts,
  })

  // $14 / $15 eligible, $16 log-only
  const d14 = structuredClone(syn)
  d14.catalog_id = `m2-14-${L.newId().slice(0, 6)}`
  d14.drinks.push({
    key: 'm2-fourteen',
    name: 'Fourteen',
    kind: 'named_cocktail',
    bar_offerings: [
      {
        bar_key: 'wake-view',
        ingredient_keys: ['dark-rum'],
        display_ingredients: ['Dark Rum'],
        price_usd: 14,
        price_status: 'verified_within_limit',
      },
    ],
  })
  d14.cocktail_candidates.push({
    drink_key: 'm2-fourteen',
    designated_bar_key: 'wake-view',
    tier: 'familiar',
    points: 25,
  })
  const p14 = libs.catalog.previewCatalogImport(d14)
  expect(
    p14.counts.cocktailEligible === p.counts.cocktailEligible + 1,
    'TS-14-ELIGIBLE',
    '$14 cocktail is bounty-eligible',
    { before: p.counts.cocktailEligible, after: p14.counts.cocktailEligible },
  )

  const d15 = structuredClone(syn)
  d15.catalog_id = `m2-15-${L.newId().slice(0, 6)}`
  d15.drinks.push({
    key: 'm2-fifteen',
    name: 'Fifteen',
    kind: 'named_cocktail',
    bar_offerings: [
      {
        bar_key: 'wake-view',
        ingredient_keys: ['dark-rum'],
        display_ingredients: ['Dark Rum'],
        price_usd: 15,
        price_status: 'verified_within_limit',
      },
    ],
  })
  d15.cocktail_candidates.push({
    drink_key: 'm2-fifteen',
    designated_bar_key: 'wake-view',
    tier: 'familiar',
    points: 25,
  })
  const p15 = libs.catalog.previewCatalogImport(d15)
  expect(
    p15.counts.cocktailEligible === p.counts.cocktailEligible + 1,
    'TS-15-ELIGIBLE',
    '$15 cocktail is bounty-eligible',
    { after: p15.counts.cocktailEligible },
  )

  const d16 = structuredClone(syn)
  d16.catalog_id = `m2-16-${L.newId().slice(0, 6)}`
  d16.drinks.push({
    key: 'm2-sixteen',
    name: 'Sixteen',
    kind: 'named_cocktail',
    bar_offerings: [
      {
        bar_key: 'wake-view',
        ingredient_keys: ['dark-rum'],
        display_ingredients: ['Dark Rum'],
        price_usd: 16,
        price_status: 'verified_over_limit',
      },
    ],
  })
  d16.cocktail_candidates.push({
    drink_key: 'm2-sixteen',
    designated_bar_key: 'wake-view',
    tier: 'familiar',
    points: 25,
  })
  const p16 = libs.catalog.previewCatalogImport(d16)
  expect(
    p16.counts.cocktailEligible === p.counts.cocktailEligible,
    'TS-16-LOG-ONLY',
    '$16 cocktail is ordinary log only (not bounty-eligible)',
    { before: p.counts.cocktailEligible, after: p16.counts.cocktailEligible },
  )
  const sql16 = sqlCocktailEligible(d16, 'm2-sixteen', 'wake-view')
  expect(sql16?.eligible === false, 'SQL-16-INELIGIBLE', 'SQL pool marks $16 ineligible', { sql16 })
}

{
  // Complete unpriced physical bar menu
  const doc = buildUnpricedPolicyCatalog(libs.builders)
  writeFileSync(join(FIXTURES, 'synthetic-unpriced-menu-valid.json'), JSON.stringify(doc, null, 2) + '\n')
  const preview = libs.catalog.previewCatalogImport(doc)
  expect(
    preview.readiness === 'ready_for_scheduling',
    'TS-UNPRICED-READY',
    'Complete unpriced-menu catalog is schedule-ready',
    { readiness: preview.readiness, counts: preview.counts },
  )
  const gsCand = doc.cocktail_candidates.find((c) => c.designated_bar_key === 'good-spirits')
  const sqlGs = gsCand
    ? sqlCocktailEligible(doc, gsCand.drink_key, 'good-spirits')
    : null
  expect(sqlGs?.eligible === true, 'SQL-GS-UNPRICED-ELIGIBLE', 'Good Spirits Category U eligible in SQL', {
    gsCand,
    sqlGs,
  })
  const errs = sqlPriceErrors(doc)
  expect(errs.length === 0, 'SQL-UNPRICED-NO-ERR', 'Authorized unpriced catalog has no price-evidence errors', {
    errs,
  })
}

{
  // Fabricated unpriced without authorization
  const doc = libs.builders.buildScheduleReadyCatalog(72, 39)
  doc.catalog_id = `m2-fab-${L.newId().slice(0, 6)}`
  for (const drink of doc.drinks) {
    for (const o of drink.bar_offerings) {
      if (o.bar_key === 'good-spirits') {
        o.price_status = 'approved_unpriced_menu_within_limit'
        o.price_usd = null
      }
    }
  }
  const preview = libs.catalog.previewCatalogImport(doc)
  const errs = sqlPriceErrors(doc)
  expect(
    codesOf(preview).includes('APPROVED_UNPRICED_BAR_NOT_AUTHORIZED'),
    'TS-FABRICATED-REJECT',
    'Fabricated unpriced status without auth rejected (TS)',
    { codes: codesOf(preview).slice(0, 8) },
  )
  expect(
    errs.some((e) => e.code === 'APPROVED_UNPRICED_BAR_NOT_AUTHORIZED'),
    'SQL-FABRICATED-REJECT',
    'Fabricated unpriced status without auth rejected (SQL)',
    { errs },
  )
}

{
  // Isolated missing price on priced menu
  const doc = libs.builders.buildScheduleReadyCatalog(72, 39)
  doc.catalog_id = `m2-iso-${L.newId().slice(0, 6)}`
  authorizeUnpriced(doc, 'wake-view')
  doc.drinks.push({
    key: 'm2-isolated-missing',
    name: 'Isolated Missing',
    kind: 'named_cocktail',
    bar_offerings: [
      {
        bar_key: 'wake-view',
        ingredient_keys: ['dark-rum'],
        display_ingredients: ['Dark Rum'],
        price_usd: null,
        price_status: 'approved_unpriced_menu_within_limit',
      },
    ],
  })
  const preview = libs.catalog.previewCatalogImport(doc)
  const errs = sqlPriceErrors(doc)
  expect(
    codesOf(preview).includes('UNPRICED_MENU_BAR_HAS_PRINTED_PRICES'),
    'TS-ISOLATED-MISSING',
    'Isolated missing price on priced menu cannot establish Category U',
    { codes: codesOf(preview).slice(0, 8) },
  )
  expect(
    errs.some((e) => e.code === 'UNPRICED_MENU_BAR_HAS_PRINTED_PRICES'),
    'SQL-ISOLATED-MISSING',
    'SQL rejects priced-bar unpriced authorization',
    { errs },
  )
}

{
  // Cropped / incomplete evidence
  const doc = buildUnpricedPolicyCatalog(libs.builders)
  doc.catalog_id = `m2-crop-${L.newId().slice(0, 6)}`
  doc.source_notes.uncertainty_flags = [
    {
      code: 'PRICE_AREA_CROPPED',
      message: 'Price area cropped',
      bar_key: 'good-spirits',
    },
  ]
  const preview = libs.catalog.previewCatalogImport(doc)
  const errs = sqlPriceErrors(doc)
  expect(
    codesOf(preview).includes('UNPRICED_MENU_EVIDENCE_INCOMPLETE'),
    'TS-CROPPED',
    'Cropped price evidence cannot authorize Category U',
    { codes: codesOf(preview).slice(0, 8) },
  )
  expect(
    errs.some((e) => e.code === 'UNPRICED_MENU_EVIDENCE_INCOMPLETE'),
    'SQL-CROPPED',
    'SQL rejects cropped/incomplete Category U evidence',
    { errs },
  )
}

{
  // Cross-bar isolation
  const doc = buildUnpricedPolicyCatalog(libs.builders)
  doc.catalog_id = `m2-xbar-${L.newId().slice(0, 6)}`
  // Attempt Category U at poolside without its own authorization (wake/pool priced).
  const mai = doc.drinks.find((d) => d.key === 'mai-tai')
  const pool = mai.bar_offerings.find((o) => o.bar_key === 'poolside')
  pool.price_status = 'approved_unpriced_menu_within_limit'
  pool.price_usd = null
  const preview = libs.catalog.previewCatalogImport(doc)
  const errs = sqlPriceErrors(doc)
  expect(
    codesOf(preview).includes('APPROVED_UNPRICED_BAR_NOT_AUTHORIZED'),
    'TS-CROSS-BAR',
    'Auth for one bar cannot enable another',
    { codes: codesOf(preview).slice(0, 10) },
  )
  expect(
    errs.some((e) => e.code === 'APPROVED_UNPRICED_BAR_NOT_AUTHORIZED'),
    'SQL-CROSS-BAR',
    'SQL enforces per-bar Category U authorization',
    { errs },
  )
}

{
  // Category B fingerprint cannot be copied onto new drinks
  const doc = cloneLaunch(`bcopy-${L.newId().slice(0, 6)}`)
  doc.drinks.push({
    key: 'm2-brand-new-cocktail',
    name: 'Brand New Cocktail',
    kind: 'named_cocktail',
    bar_offerings: [
      {
        bar_key: 'crooners',
        ingredient_keys: doc.ingredients[0].key ? [doc.ingredients[0].key] : [],
        display_ingredients: ['Something'],
        price_usd: null,
        price_status: 'approved_filtered_within_limit',
        price_evidence_approval_id: 'star-princess-filtered-source-2026-11-07',
        price_evidence_recipe_fingerprint: 'b'.repeat(64),
      },
    ],
  })
  // Ensure ingredient exists
  if (!doc.ingredients[0]) {
    doc.ingredients.push({ key: 'lime-juice', name: 'Lime Juice' })
    doc.drinks.at(-1).bar_offerings[0].ingredient_keys = ['lime-juice']
  } else {
    doc.drinks.at(-1).bar_offerings[0].ingredient_keys = [doc.ingredients[0].key]
  }
  const preview = libs.catalog.previewCatalogImport(doc)
  const errs = sqlPriceErrors(doc)
  expect(
    codesOf(preview).includes('APPROVED_FILTERED_OFFERING_NOT_IN_SET'),
    'TS-NO-B-COPY',
    'Existing Category B approval cannot be copied onto newly created drinks',
    { codes: codesOf(preview).filter((c) => c.startsWith('APPROVED_')).slice(0, 6) },
  )
  expect(
    errs.some((e) => e.code === 'APPROVED_FILTERED_OFFERING_NOT_IN_SET'),
    'SQL-NO-B-COPY',
    'SQL rejects copied Category B identity',
    { errs: errs.slice(0, 4) },
  )
}

{
  // Ingredient rarity: unpriced bar counted once; over-limit never inflates
  const doc = buildUnpricedPolicyCatalog(libs.builders)
  doc.catalog_id = `m2-rar-${L.newId().slice(0, 6)}`
  if (!doc.bars.some((b) => b.key === 'unpriced-lounge')) {
    doc.bars.push({ key: 'unpriced-lounge', name: 'Unpriced Lounge', deck: '9', active: true })
  }
  authorizeUnpriced(doc, 'unpriced-lounge')
  const mai = doc.drinks.find((d) => d.key === 'mai-tai')
  mai.bar_offerings.push({
    bar_key: 'unpriced-lounge',
    ingredient_keys: ['orgeat', 'lime-juice', 'dark-rum'],
    display_ingredients: ['Orgeat', 'Lime Juice', 'Dark Rum'],
    price_usd: null,
    price_status: 'approved_unpriced_menu_within_limit',
    evidence_reference: 'photo:unpriced-lounge-complete',
  })
  const ev = libs.catalog.corroborateIngredientEvidence(doc, 'orgeat')
  expect(
    ev.corroboratedBarCount === 3,
    'TS-RARITY-ONCE',
    'Qualifying unpriced menu physical bar counted once for ingredient rarity',
    { ev },
  )

  doc.drinks.push({
    key: 'm2-over-orgeat',
    name: 'Over Orgeat',
    kind: 'named_cocktail',
    bar_offerings: [
      {
        bar_key: 'carried-bar',
        ingredient_keys: ['orgeat'],
        display_ingredients: ['Orgeat'],
        price_usd: 19,
        price_status: 'verified_over_limit',
      },
    ],
  })
  const ev2 = libs.catalog.corroborateIngredientEvidence(doc, 'orgeat')
  expect(
    ev2.corroboratedBarCount === 3,
    'TS-OVER-NO-INFLATE',
    'Over-limit offerings never inflate ingredient rarity',
    { ev2 },
  )

  const sqlBars = disposableSqlStdin(`
    select count(distinct w.bar_key)::text
    from (
      select o->>'bar_key' as bar_key,
        coalesce(array(select jsonb_array_elements_text(coalesce(o->'ingredient_keys','[]'::jsonb))), array[]::text[]) as ingredient_keys,
        o->>'price_status' as price_status,
        nullif(o->>'price_usd','')::numeric as price_usd,
        nullif(o->>'price_evidence_approval_id','') as approval_id,
        d->>'key' as drink_key,
        nullif(o->>'price_evidence_recipe_fingerprint','') as fingerprint
      from jsonb_array_elements(${payloadLiteral(doc)}->'drinks') d
      cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings','[]'::jsonb)) o
      where d->>'kind'='named_cocktail'
    ) w
    where 'orgeat' = any (w.ingredient_keys)
      and (
        public.catalog_offering_supports_bounty_eligibility(
          w.bar_key, w.price_status, w.price_usd, w.approval_id, w.drink_key, w.fingerprint
        )
        or (
          w.price_status = 'approved_unpriced_menu_within_limit'
          and w.price_usd is null
          and w.approval_id is null
          and w.fingerprint is null
          and w.bar_key = any (public.catalog_payload_unpriced_menu_authorized_bars(${payloadLiteral(doc)}))
        )
      );
  `)
  expect(sqlBars === '3', 'SQL-RARITY-ONCE', 'SQL corroboration counts unpriced bar once (not over-limit)', {
    sqlBars,
  })
}

{
  // Organizer exception must not become bounty eligible via Category U
  const doc = cloneLaunch(`exc-${L.newId().slice(0, 6)}`)
  const cooler = doc.drinks.find((d) => d.key === 'princess-ultimate-cooler')
  if (cooler) {
    const off = cooler.bar_offerings[0]
    off.price_status = 'approved_unpriced_menu_within_limit'
    off.price_usd = null
    authorizeUnpriced(doc, off.bar_key)
    // Clear printed-price conflict for that bar if any Category A/D remain — exceptions are unverified-only bars typically
    const preview = libs.catalog.previewCatalogImport(doc)
    expect(
      codesOf(preview).includes('ORGANIZER_EXCEPTION_FORGED_CATEGORY_U') ||
        codesOf(preview).includes('ORGANIZER_EXCEPTION_PRICE_CORRUPTED'),
      'TS-EXCEPTION-NO-U',
      'Princess Ultimate Cooler cannot become bounty-eligible via Category U',
      { codes: codesOf(preview).filter((c) => c.includes('ORGANIZER') || c.includes('UNPRICED')).slice(0, 8) },
    )
  } else {
    rec.record('TS-EXCEPTION-NO-U', 'FAIL', {
      summary: 'princess-ultimate-cooler missing from February catalog',
    })
  }
}

// ───────────────────────────── BACKEND E2E: stage → preview → publish → init → claim ─────────────────────────────
console.log('\n=== Backend Category U catalog E2E ===')
await L.resetClockPreCruise(service)
await L.clearSchedule(service)

{
  const doc = buildUnpricedPolicyCatalog(libs.builders)
  const staged = await stageWithValidation(admin, doc, libs)
  expect(staged.ok && staged.stage?.data?.candidate_id, 'BE-U-STAGE', 'Category U synthetic stages', {
    code: staged.code,
    errors: staged.stage?.data?.errors ?? staged.stage?.data,
  })
  if (staged.ok && staged.stage?.data?.candidate_id) {
    const hash = staged.stage.data.payload_hash || staged.payloadHash
    const pub = await publishCandidate(admin, staged.stage.data.candidate_id, hash)
    expect(pub.pub.data?.ok === true, 'BE-U-PUBLISH', 'Category U catalog publishes', {
      data: pub.pub.data,
      error: pub.pub.error?.message,
      previewSafe: pub.preview.data?.safe_to_publish,
    })
    const pointer = await activePointer()
    expect(pointer?.catalog_id === doc.catalog_id, 'BE-U-POINTER', 'Active pointer is Category U catalog', {
      pointer,
    })

    const init = await admin.rpc('admin_initialize_bounty_schedule', {
      p_client_request_id: L.newId(),
      p_seed: 'm2-unpriced-policy',
    })
    const cruise = await L.ensureCruiseNotOrganizer(service)
    const counts = scheduleCounts(cruise.id)
    expect(
      init.data?.ok === true &&
        counts?.cocktail === 72 &&
        counts?.ingredient === 39 &&
        counts?.bar === 7 &&
        counts?.daily === 7,
      'BE-U-INIT-125',
      'Category U catalog initializes all 125 schedule entries',
      { init: init.data, error: init.error?.message, counts },
    )

    // Player claim against current cocktail bounty on the published Category U catalog.
    const atUtc = L.slotUtc(1, '12:00:00')
    const cock = await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: atUtc })
    const barKey = cock.data?.designated_bar_key
    const offerId = cock.data?.offer_id
    const offeringId = cock.data?.offering_id
    if (cock.data?.status === 'active' && barKey && offerId && offeringId) {
      const claim = await L.submitDrinkAt(
        service,
        authorId,
        {
          idempotency_key: L.newId(),
          bar_canonical_key: barKey,
          drink: { mode: 'named_catalog', offering_id: offeringId },
          companion_player_ids: [companionId],
          bar_eligible_companion_ids: [companionId],
          selected_claims: [{ category: 'cocktail', offer_id: offerId }],
          caption: null,
          photo_storage_key: null,
        },
        atUtc,
      )
      const ok =
        claim.data?.ok === true ||
        claim.data?.accepted === true ||
        claim.data?.submission_id != null ||
        (claim.data && !claim.error && claim.data?.ok !== false)
      expect(ok, 'BE-U-PLAYER-CLAIM', 'Player claim succeeds against published Category U catalog schedule', {
        bounty: {
          status: cock.data?.status,
          drink: cock.data?.drink_name || cock.data?.canonical_key,
          barKey,
          offerId,
          offeringId,
          price_status: L.disposableSql(`
            select cvo.price_status::text
            from catalog_version_offerings cvo
            join active_catalog_pointer p on p.id = 1
            where cvo.offering_id = '${offeringId}'::uuid
              and cvo.catalog_version_id = p.catalog_version_id
          `),
        },
        data: claim.data,
        error: claim.error?.message,
      })
    } else {
      rec.record('BE-U-PLAYER-CLAIM', 'FAIL', {
        summary: 'Cocktail bounty not active or offering unresolved',
        detail: { status: cock.data?.status, barKey, offerId, offeringId, cock: cock.data },
      })
    }
  }
}

// February fallback init still works after Category U publish path
console.log('\n=== February fallback re-validation ===')
{
  await L.resetClockPreCruise(service)
  await L.clearSchedule(service)
  const feb = cloneLaunch(`feb-${L.newId().slice(0, 6)}`)
  const staged = await stageWithValidation(admin, feb, libs)
  expect(staged.ok, 'BE-FEB-STAGE', 'February clone stages after M2 policy', { code: staged.code })
  if (staged.ok) {
    const hash = staged.stage.data.payload_hash || staged.payloadHash
    const pub = await publishCandidate(admin, staged.stage.data.candidate_id, hash)
    expect(pub.pub.data?.ok === true, 'BE-FEB-PUBLISH', 'February publishes after M2 policy', {
      data: pub.pub.data,
      error: pub.pub.error?.message,
    })
    const init = await admin.rpc('admin_initialize_bounty_schedule', {
      p_client_request_id: L.newId(),
      p_seed: 'm2-february-recheck',
    })
    const cruise = await L.ensureCruiseNotOrganizer(service)
    const counts = scheduleCounts(cruise.id)
    expect(
      init.data?.ok === true &&
        counts?.cocktail === 72 &&
        counts?.ingredient === 39 &&
        counts?.bar === 7 &&
        counts?.daily === 7,
      'BE-FEB-INIT-125',
      'February fallback still initializes all 125 entries',
      { init: init.data, counts },
    )
  }
}

// Protected stacks unchanged
const protectedAfter = L.assertProtectedStacksUnchanged(beforeOrg, beforeA2)
expect(
  protectedAfter.organizer.unchanged && protectedAfter.agent2.unchanged,
  'ENV-PROTECTED-UNCHANGED',
  'Organizer and Agent 2 cruise ids unchanged',
  protectedAfter,
)

await libs.vite.close()

const totals = rec.totals()
const resultsPath = join(EVIDENCE, 'm2-validation-results.json')
L.writeJson(resultsPath, {
  label: 'm2-price-policy',
  at: new Date().toISOString(),
  disposable: L.DISPOSABLE_URL,
  totals,
  results: rec.results,
  protected: protectedAfter,
})
writeFileSync(
  join(EVIDENCE, 'm2-validation-run.txt'),
  rec.results.map((r) => `[${r.status}] ${r.id}${r.summary ? ' — ' + r.summary : ''}`).join('\n') + '\n',
)

console.log('\n=== M2 TOTALS ===', totals)
if (totals.fail > 0) process.exitCode = 1
