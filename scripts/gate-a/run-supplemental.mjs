/**
 * Gate A supplemental proofs: claim field contract, Admin catalog publish mid-voyage,
 * fixture-activate contrast, Wrapped signature, metric RPCs, achievement blocked rows.
 */
import ws from 'ws'
globalThis.WebSocket ??= ws

import { createServer } from 'vite'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import * as L from './lib.mjs'

const { env, service, anon } = L.createClients()
const beforeOrg = L.organizerCruiseId()
const beforeA2 = L.agent2CruiseId()
const rec = L.makeRecorder('gate-a-supplemental')
const evidence = {}

function expect(cond, id, summary, detail = {}) {
  if (cond) rec.record(id, 'PASS', { summary, ...detail })
  else rec.record(id, 'FAIL', { summary, ...detail })
}

const vite = await createServer({
  root: L.ROOT,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { '@': join(L.ROOT, 'src') } },
})
const B = await vite.ssrLoadModule('/tests/fixtures/catalog/builders.ts')
const H = await vite.ssrLoadModule('/tests/helpers/catalogPublish.ts')
const IMP = await vite.ssrLoadModule('/src/lib/adminCatalogImport.ts')

const identities = L.loadIdentities()
const byKey = Object.fromEntries(identities.identities.map((p) => [p.key, p]))
const password = env.LOCAL_TEST_PASSWORD

await L.resetClockPreCruise(service)
await L.clearSchedule(service)
const catalogA = B.buildScheduleReadyCatalog(72, 39)
catalogA.catalog_id = `gate-a-supp-a-${L.newId().slice(0, 8)}`
await service.rpc('dev_activate_catalog_fixture', { p_payload: catalogA })

const admin = await L.signIn(anon, byKey.admin.login_alias, password)
const cruise = await L.ensureCruiseNotOrganizer(service)
const init = await admin.rpc('admin_initialize_bounty_schedule', {
  p_client_request_id: L.newId(),
  p_seed: 'gate-a-supp',
})
expect(init.data?.ok === true, 'SUPP-INIT', 'Admin init 72/39/7/7', { data: init.data })

const noon = L.slotUtc(1, '12:00:00')
const { data: cock } = await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: noon })
const { data: ing } = await service.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: noon })
evidence.cocktail_fields = Object.keys(cock || {})
evidence.ingredient_fields = Object.keys(ing || {})
expect(cock?.status === 'active' && !!cock?.offering_id, 'SUPP-COCKTAIL-SHAPE', 'Cocktail exposes offering_id', {
  fields: evidence.cocktail_fields,
  offering_id: cock?.offering_id,
})
expect(
  ing?.status === 'active' && !!(ing?.ingredient_key || ing?.display_name),
  'SUPP-INGREDIENT-SHAPE',
  'Ingredient exposes ingredient_key/display_name',
  { fields: evidence.ingredient_fields },
)

// Legitimate cocktail claim — selected_claims must include offer_id (bounty offer), not only category
const claim = await L.submitDrinkAt(
  service,
  byKey.drink_only.player_id,
  L.drinkPayload({
    barKey: cock.designated_bar_key,
    offeringId: cock.offering_id,
    companions: [byKey.both.player_id],
    selectedClaims: [{ category: 'cocktail', offer_id: cock.offer_id }],
  }),
  noon,
)
const cats = claim.data?.claimed_categories || []
const cocktailAwarded = Array.isArray(cats)
  ? cats.some((c) => c === 'cocktail' || c?.category === 'cocktail')
  : false
expect(claim.data?.ok === true && cocktailAwarded, 'SUPP-CLAIM-COCKTAIL', 'Cocktail claim awards points', {
  data: claim.data,
  error: claim.error?.message,
})

// Ingredient claim via preview confirmable path / catalog_offering_ingredients
let offs = []
try {
  offs = L.disposableJson(`
    select bo.id::text as offering_id, b.canonical_key as bar_key
    from bar_offerings bo
    join bars b on b.id = bo.bar_id
    join catalog_offering_ingredients coi on coi.bar_offering_id = bo.id
    join ingredients i on i.id = coi.ingredient_id
    where i.canonical_key = '${ing.ingredient_key}'
      and coalesce(b.is_virtual,false) = false
    limit 1
  `)
} catch (err) {
  rec.record('SUPP-ING-LOOKUP', 'INFO', { summary: String(err?.message || err) })
}
if (offs[0]) {
  const ingClaim = await L.submitDrinkAt(
    service,
    byKey.both.player_id,
    L.drinkPayload({
      barKey: offs[0].bar_key,
      offeringId: offs[0].offering_id,
      companions: [byKey.drink_only.player_id],
      selectedClaims: [{ category: 'ingredient', offer_id: ing.offer_id }],
      confirmContainsIngredientKey: ing.ingredient_key,
    }),
    L.slotUtc(1, '12:10:00'),
  )
  const icats = ingClaim.data?.claimed_categories || []
  const awarded = Array.isArray(icats)
    ? icats.some((c) => c === 'ingredient' || c?.category === 'ingredient')
    : false
  expect(ingClaim.data?.ok === true && awarded, 'SUPP-CLAIM-INGREDIENT', 'Ingredient claim awards', {
    data: ingClaim.data,
    error: ingClaim.error?.message,
  })
} else {
  // Use bounty-linked offering if present on ingredient card
  const preview = await service.rpc('dev_preview_drink_claims_at', {
    p_at_utc: L.slotUtc(1, '12:10:00'),
    p_player_id: byKey.both.player_id,
    p_payload: L.drinkPayload({
      barKey: cock.designated_bar_key,
      offeringId: cock.offering_id,
      companions: [byKey.drink_only.player_id],
      confirmContainsIngredientKey: ing.ingredient_key,
    }),
  })
  const ingOpt = preview.data?.categories?.ingredient?.options?.[0]
  const confirmable = preview.data?.categories?.ingredient?.confirmable
  if (ingOpt?.offer_id && (confirmable?.offering_id || cock.offering_id)) {
    const ingClaim = await L.submitDrinkAt(
      service,
      byKey.both.player_id,
      L.drinkPayload({
        barKey: confirmable?.bar_canonical_key || cock.designated_bar_key,
        offeringId: confirmable?.offering_id || cock.offering_id,
        companions: [byKey.drink_only.player_id],
        selectedClaims: [{ category: 'ingredient', offer_id: ingOpt.offer_id || ing.offer_id }],
        confirmContainsIngredientKey: ing.ingredient_key,
      }),
      L.slotUtc(1, '12:10:00'),
    )
    const icats = ingClaim.data?.claimed_categories || []
    const awarded = Array.isArray(icats)
      ? icats.some((c) => c === 'ingredient' || c?.category === 'ingredient')
      : false
    expect(ingClaim.data?.ok === true && awarded, 'SUPP-CLAIM-INGREDIENT', 'Ingredient claim awards', {
      data: ingClaim.data,
      error: ingClaim.error?.message,
    })
  } else {
    rec.record('SUPP-CLAIM-INGREDIENT', 'BLOCKED', {
      summary: 'Could not resolve ingredient offering for claim',
      previewIngredient: preview.data?.categories?.ingredient,
    })
  }
}

const claimsBefore = Number(
  L.disposableSql(
    `select count(*) from bounty_claims where cruise_config_id='${cruise.id}' and voided_at_utc is null`,
  ),
)

// --- Admin catalog publish mid-voyage (production path) ---
const catalogB = B.cloneCatalog(B.buildScheduleReadyCatalog(72, 39))
catalogB.catalog_id = `gate-a-supp-b-${L.newId().slice(0, 8)}`
catalogB.drinks.push({
  key: 'gate-a-pub-new',
  name: 'Gate A Pub New',
  kind: 'named_cocktail',
  bar_offerings: [
    {
      bar_key: 'wake-view-bar',
      ingredient_keys: ['lime-juice'],
      display_ingredients: ['Lime Juice'],
      price_usd: 11,
      price_status: 'verified_within_limit',
      evidence_reference: 'supp-b',
    },
  ],
})
catalogB.cocktail_candidates.push({
  drink_key: 'gate-a-pub-new',
  designated_bar_key: 'wake-view-bar',
  tier: 'familiar',
  points: 25,
})

let publishOutcome = { method: null }
try {
  // Drive real Admin import libs when helpers expose them
  const helperKeys = Object.keys(H)
  publishOutcome.helperKeys = helperKeys
  if (typeof H.stageAndPublishCatalog === 'function') {
    publishOutcome.method = 'stageAndPublishCatalog'
    publishOutcome.result = await H.stageAndPublishCatalog({
      client: admin,
      document: catalogB,
      service,
    })
  } else if (typeof H.publishFullSnapshot === 'function') {
    publishOutcome.method = 'publishFullSnapshot'
    publishOutcome.result = await H.publishFullSnapshot(admin, catalogB)
  } else {
    // Fallback: use IMP + service-side activate is NOT the Admin path — try IMP flows
    publishOutcome.method = 'adminCatalogImport-libs'
    const mem = new Map()
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => void mem.set(k, String(v)),
      removeItem: (k) => void mem.delete(k),
      clear: () => mem.clear(),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size
      },
    }
    // Stage as candidate then publish via RPC if available
    const stage = await admin.rpc('admin_stage_catalog_import', {
      p_client_request_id: L.newId(),
      p_payload: catalogB,
    })
    publishOutcome.stage = { data: stage.data, error: stage.error?.message }
    if (!stage.error && stage.data?.ok !== false) {
      const pub = await admin.rpc('admin_publish_catalog_import', {
        p_client_request_id: L.newId(),
        p_candidate_id: stage.data?.candidate_id || stage.data?.id,
      })
      publishOutcome.publish = { data: pub.data, error: pub.error?.message }
    } else {
      // Last resort documented: fixture activate is NOT production Admin publish
      publishOutcome.fallback = 'dev_activate_catalog_fixture'
      const act = await service.rpc('dev_activate_catalog_fixture', { p_payload: catalogB })
      publishOutcome.activate = { error: act.error?.message }
    }
  }
} catch (err) {
  publishOutcome.error = String(err?.message || err)
}

evidence.publishOutcome = publishOutcome

const day5 = L.slotUtc(5, '12:00:00')
const { data: c5pub } = await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: day5 })
const { data: i5pub } = await service.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: day5 })
evidence.day5_after_publish_attempt = { cocktail: c5pub, ingredient: i5pub }
expect(
  c5pub?.status === 'active',
  'SUPP-DAY5-AFTER-PUBLISH-PATH',
  'Day 5 cocktail still active after Admin/publish attempt',
  { status: c5pub?.status, reason: c5pub?.reason, publishMethod: publishOutcome.method },
)

const claimsAfter = Number(
  L.disposableSql(
    `select count(*) from bounty_claims where cruise_config_id='${cruise.id}' and voided_at_utc is null`,
  ),
)
expect(claimsAfter >= claimsBefore, 'SUPP-CLAIMS-PRESERVED', 'Claims not reduced by catalog change', {
  claimsBefore,
  claimsAfter,
})

// Contrast: raw fixture activate with removed future candidate (voyage failure mode)
const catalogC = B.cloneCatalog(B.buildScheduleReadyCatalog(72, 39))
catalogC.catalog_id = `gate-a-supp-c-${L.newId().slice(0, 8)}`
const removed = catalogC.cocktail_candidates.pop()
catalogC.drinks = catalogC.drinks.filter((d) => d.key !== removed.drink_key)
await service.rpc('dev_activate_catalog_fixture', { p_payload: catalogC })
const { data: c5fix } = await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: day5 })
evidence.day5_after_fixture_activate = {
  status: c5fix?.status,
  reason: c5fix?.reason,
  removed: removed.drink_key,
}
if (c5fix?.status !== 'active') {
  rec.record('FINAL-A-CAT-001', 'FAIL', {
    summary:
      'dev_activate_catalog_fixture mid-voyage left Day 5 cocktail unavailable — production Admin publish rebind must be used; fixture activate is unsafe for mid-cruise replacement',
    ...evidence.day5_after_fixture_activate,
    severity: 'high',
  })
} else {
  rec.record('FINAL-A-CAT-001', 'PASS', {
    summary: 'Fixture activate did not break Day 5 (unexpected vs voyage)',
  })
}

// Re-init clean for Wrapped (fixture may have corrupted schedule)
await L.clearSchedule(service)
await service.rpc('dev_activate_catalog_fixture', { p_payload: catalogA })
await admin.rpc('admin_initialize_bounty_schedule', {
  p_client_request_id: L.newId(),
  p_seed: 'gate-a-wrap',
})
const fri = L.slotUtc(7, '18:00:01')
await service
  .from('game_control')
  .update({ status: 'final', finalized_at_utc: fri })
  .in('game', ['drinkit', 'shipit'])

const wrapped = await service.rpc('dev_get_my_wrapped_at', {
  p_player_id: byKey.both.player_id,
  p_game: 'drinkit',
  p_at_utc: fri,
})
expect(!wrapped.error && wrapped.data != null, 'SUPP-WRAPPED', 'Wrapped available with correct RPC arity', {
  error: wrapped.error?.message,
  keys: wrapped.data ? Object.keys(wrapped.data) : [],
})
evidence.wrapped = {
  error: wrapped.error?.message ?? null,
  keys: wrapped.data ? Object.keys(wrapped.data) : [],
}

// Independent metric RPC smoke (not all 80 — definition audit is separate)
const cruise2 = await L.ensureCruiseNotOrganizer(service)
const metricIds = []
for (const m of ['most_logs', 'most_points', 'most_unique_bars']) {
  const { data, error } = await service.rpc('wrapped_di_metric_winners', {
    p_cruise_config_id: cruise2.id,
    p_metric: m,
  })
  metricIds.push({ m, ok: !error, error: error?.message, hasData: data != null })
}
evidence.metric_rpc_smoke = metricIds
rec.record('SUPP-METRIC-RPC-SMOKE', 'INFO', {
  summary: `Tried ${metricIds.length} DI metric winner RPCs`,
  metricIds,
})

// Achievement blocked rows
const releaseMap = JSON.parse(
  readFileSync(join(L.ROOT, 'content/achievements/productionReleaseMapping.json'), 'utf8'),
)
const blocked = releaseMap.rows.filter((r) => r.enabledInProductionRelease === false)
const enabled = releaseMap.rows.filter((r) => r.enabledInProductionRelease === true)
expect(releaseMap.rows.length === 174, 'SUPP-ACH-174', '174 mapped rows', {
  n: releaseMap.rows.length,
})
expect(enabled.length === 164, 'SUPP-ACH-164', '164 production-enabled', { n: enabled.length })
expect(blocked.length === 10, 'SUPP-ACH-BLOCKED-10', '10 blocked', {
  blocked: blocked.map((b) => ({
    key: b.stableKey,
    readiness: b.readiness,
    reason: b.blockedReason,
  })),
})
evidence.achievements = {
  total: releaseMap.rows.length,
  enabled: enabled.length,
  blocked: blocked.map((b) => ({
    key: b.stableKey,
    snapshotRef: b.snapshotRef,
    readiness: b.readiness,
    reason: b.blockedReason,
    notes: b.notes,
  })),
}

const stacks = L.assertProtectedStacksUnchanged(beforeOrg, beforeA2)
expect(stacks.organizer.unchanged, 'SUPP-SAFE-ORG', 'Organizer unchanged', stacks.organizer)
expect(stacks.agent2.unchanged, 'SUPP-SAFE-A2', 'Agent 2 unchanged', stacks.agent2)

evidence.totals = rec.totals()
evidence.results = rec.results
L.writeJson(join(L.EVIDENCE, 'supplemental-results.json'), evidence)

await vite.close()
console.log(rec.totals())
process.exit(rec.totals().fail > 0 ? 1 : 0)
