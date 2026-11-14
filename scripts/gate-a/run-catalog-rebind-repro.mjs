/**
 * Precise mid-voyage catalog replacement repro on :55321.
 * Contrasts Admin publish rebind vs raw fixture activate when a future-scheduled
 * cocktail key is removed from the replacement catalog.
 */
import ws from 'ws'
globalThis.WebSocket ??= ws
import { createServer } from 'vite'
import { join } from 'node:path'
import * as L from './lib.mjs'

const { env, service, anon } = L.createClients()
const beforeOrg = L.organizerCruiseId()
const beforeA2 = L.agent2CruiseId()
const rec = L.makeRecorder('catalog-rebind')
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
const IMP = await vite.ssrLoadModule('/src/lib/adminCatalogImport.ts')

function expect(cond, id, summary, detail = {}) {
  rec.record(id, cond ? 'PASS' : 'FAIL', { summary, ...detail })
}

await L.resetClockPreCruise(service)
await L.clearSchedule(service)
const catalogA = B.buildScheduleReadyCatalog(72, 39)
catalogA.catalog_id = `gate-a-rebind-a-${L.newId().slice(0, 8)}`
await service.rpc('dev_activate_catalog_fixture', { p_payload: catalogA })
const adminEmail = L.loadIdentities().identities.find((p) => p.key === 'admin').login_alias
const admin = await L.signIn(anon, adminEmail, env.LOCAL_TEST_PASSWORD)

const init = await admin.rpc('admin_initialize_bounty_schedule', {
  p_client_request_id: L.newId(),
  p_seed: 'rebind-a',
})
expect(init.data?.ok, 'REBIND-INIT', 'Initialized', { data: init.data })
const cruise = await L.ensureCruiseNotOrganizer(service)

// Identify a cocktail key scheduled on day 5 noon
const day5 = L.slotUtc(5, '12:00:00')
const { data: before } = await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: day5 })
expect(before?.status === 'active', 'REBIND-DAY5-BEFORE', 'Day5 active before catalog change', {
  before,
})

const day5Key = L.disposableSql(`
  select o.canonical_key
  from bounty_slots s
  join bounty_slot_offers o on o.id = s.current_offer_id
  where s.cruise_config_id='${cruise.id}'
    and s.category='cocktail' and s.cruise_day=5 and s.slot_key like '%h12%'
  limit 1
`)
rec.record('REBIND-DAY5-KEY', 'INFO', { summary: `Day5 noon cocktail key=${day5Key}` })

// Expose day1–4 to simulate mid-voyage progress
for (let d = 1; d <= 4; d++) {
  await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: L.slotUtc(d, '12:00:00') })
  await service.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: L.slotUtc(d, '12:00:00') })
}

const catalogB = B.cloneCatalog(catalogA)
catalogB.catalog_id = `gate-a-rebind-b-${L.newId().slice(0, 8)}`
if (day5Key) {
  catalogB.cocktail_candidates = catalogB.cocktail_candidates.filter((c) => c.drink_key !== day5Key)
  catalogB.drinks = catalogB.drinks.filter((d) => d.key !== day5Key)
}

// Path 1: Admin stage → preview → publish (real libs; requires supabase client wiring)
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

// Wire IMP to use admin session: set module supabase if exported; else RPC directly
const stageRpc = await admin.rpc('admin_stage_catalog_import', {
  p_client_request_id: L.newId(),
  p_payload: catalogB,
  p_validation: {
    ready: true,
    schema_version: catalogB.schema_version,
    catalog_id: catalogB.catalog_id,
    cocktail_candidate_count: catalogB.cocktail_candidates.length,
    ingredient_candidate_count: catalogB.ingredient_candidates.length,
    payload_hash: 'gate-a-rebind',
  },
})
rec.record('REBIND-STAGE', stageRpc.error ? 'FAIL' : 'INFO', {
  summary: stageRpc.error?.message || JSON.stringify(stageRpc.data)?.slice(0, 300),
})

let publishData = null
if (stageRpc.data?.ok && stageRpc.data?.candidate_id) {
  const preview = await admin.rpc('admin_preview_catalog_publish', {
    p_candidate_id: stageRpc.data.candidate_id,
  })
  rec.record('REBIND-PREVIEW', preview.error ? 'FAIL' : 'INFO', {
    summary: preview.error?.message || JSON.stringify(preview.data)?.slice(0, 300),
  })
  const pub = await admin.rpc('admin_publish_catalog_import', {
    p_client_request_id: L.newId(),
    p_candidate_id: stageRpc.data.candidate_id,
  })
  publishData = pub.data
  rec.record('REBIND-PUBLISH', pub.error || pub.data?.ok === false ? 'FAIL' : 'PASS', {
    summary: pub.error?.message || JSON.stringify(pub.data)?.slice(0, 400),
  })
}

const { data: afterPublish } = await service.rpc('dev_get_current_cocktail_bounty_at', {
  p_at_utc: day5,
})
expect(
  afterPublish?.status === 'active' || publishData == null,
  'REBIND-DAY5-AFTER-ADMIN-PUBLISH',
  'Day5 after Admin publish path',
  { status: afterPublish?.status, reason: afterPublish?.reason, publishData },
)

// Path 2: raw fixture activate with same removed key (after re-init fresh)
await L.clearSchedule(service)
await service.rpc('dev_activate_catalog_fixture', { p_payload: catalogA })
await admin.rpc('admin_initialize_bounty_schedule', {
  p_client_request_id: L.newId(),
  p_seed: 'rebind-fixture',
})
for (let d = 1; d <= 4; d++) {
  await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: L.slotUtc(d, '12:00:00') })
}
const { data: beforeFix } = await service.rpc('dev_get_current_cocktail_bounty_at', {
  p_at_utc: day5,
})
await service.rpc('dev_activate_catalog_fixture', { p_payload: catalogB })
const { data: afterFix } = await service.rpc('dev_get_current_cocktail_bounty_at', {
  p_at_utc: day5,
})
const { data: afterFixD1 } = await service.rpc('dev_get_current_cocktail_bounty_at', {
  p_at_utc: L.slotUtc(1, '12:00:00'),
})

const fixtureBrokeFuture = beforeFix?.status === 'active' && afterFix?.status !== 'active'
expect(!fixtureBrokeFuture, 'REBIND-FIXTURE-FUTURE', 'Fixture activate keeps Day5 playable when key removed', {
  beforeFix: beforeFix?.status,
  afterFix: afterFix?.status,
  afterFixReason: afterFix?.reason,
  afterFixD1: afterFixD1?.status,
  removedKey: day5Key,
})
if (fixtureBrokeFuture) {
  rec.record('FINAL-A-CAT-001', 'FAIL', {
    severity: 'high',
    summary:
      'Mid-voyage dev_activate_catalog_fixture with a removed future-scheduled cocktail key leaves Day5 unavailable',
    expected: 'Future scheduled windows remain playable or publish fails transactionally',
    actual: afterFix,
    removedKey: day5Key,
  })
}

const stacks = L.assertProtectedStacksUnchanged(beforeOrg, beforeA2)
expect(stacks.organizer.unchanged && stacks.agent2.unchanged, 'REBIND-SAFE', 'Protected stacks unchanged', stacks)

L.writeJson(join(L.EVIDENCE, 'catalog-rebind-repro.json'), {
  totals: rec.totals(),
  results: rec.results,
  day5Key,
  before,
  afterPublish,
  beforeFix,
  afterFix,
  afterFixD1,
  stageRpc: { data: stageRpc.data, error: stageRpc.error?.message },
  publishData,
})
await vite.close()
console.log(rec.totals())
process.exit(rec.totals().fail > 0 ? 1 : 0)
