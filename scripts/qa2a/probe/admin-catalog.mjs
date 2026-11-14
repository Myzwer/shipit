/**
 * QA-4A Agent 2 — Admin + Catalog backend integration probe (QA3A-B001..B014, ADM-001..009, CAT-001).
 * Target: star-princess-qa2-backend ONLY (API :56321 / DB :56322). Synthetic data only. No src/ repairs.
 *
 *   set -a; source .local/qa2-backend.env; set +a   # (script also reads the env file itself)
 *   node scripts/qa2a/probe/admin-catalog.mjs [--only=B001,B002,ADM,CATX,LIVE,...]
 *
 * Fixture reuse (no duplication): tests/fixtures/catalog/builders.ts and
 * tests/helpers/catalogPublish.ts are loaded through a Vite SSR loader (same `@/` alias as
 * vitest). The REAL frontend libs (src/lib/adminCatalogImport.ts, adminRoster.ts, adminVoid.ts,
 * adminBountySkip.ts, pendingAdminCatalogImport.ts) are loaded the same way and driven against the
 * qa2 backend with a localStorage shim, so ADM-00x / CAT-001 are reproduced with the production
 * client code rather than a re-implementation. Vue component glue (CatalogImportSection.vue
 * runStageAndPreview / runPublish / checkPendingStatus) is replicated line-for-line around those
 * real lib calls (SFCs cannot be imported headlessly).
 *
 * Status vocabulary
 *   PASS    backend/frontend behaved as the spec requires (safe)
 *   FAIL    a defect (INT-* / ADM-* / CAT-*) was reproduced live
 *   INFO    documented behaviour / frontend-only impact / design note
 *   BLOCKED could not be proven here (reason recorded)
 */
import ws from 'ws'
globalThis.WebSocket ??= ws

import { createServer } from 'vite'
import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as L from './lib.mjs'

// ───────────────────────────── safety ─────────────────────────────
const QA2_DB = 'supabase_db_star-princess-qa2-backend'
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '').split(',').filter(Boolean)
const want = (id) => ONLY.length === 0 || ONLY.some((o) => id.startsWith(o))

const env = L.loadQa2Env()
const API_URL = env.VITE_SUPABASE_URL
if (!API_URL.includes(':56321')) {
  console.error(`REFUSING: API URL ${API_URL} does not contain :56321`)
  process.exit(2)
}
for (const bad of [':54321', ':55321', ':54322', ':55322']) {
  if (API_URL.includes(bad)) {
    console.error(`REFUSING: forbidden port ${bad} in API URL`)
    process.exit(2)
  }
}
const ORG_BEFORE = L.organizerCruiseId() // READ-ONLY select
const STARTED_AT = new Date().toISOString()
const OUT_JSON = join(L.EVIDENCE_DIR, 'probe-admin-catalog-integration-results.json')
const MATRIX_JSON = join(L.CAMPAIGN_DIR, 'ADMIN_CATALOG_INTEGRATION_MATRIX.json')

// ───────────────────── global shims (before frontend libs load) ─────────────────────
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
const realFetch = globalThis.fetch
/** @type {null | ((url: string, init: any, forward: () => Promise<Response>) => Promise<Response>)} */
let fetchHook = null
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input)
  if (!fetchHook) return realFetch(input, init)
  return fetchHook(url, init, () => realFetch(input, init))
}

// ───────────────────── load fixtures + real frontend libs via Vite SSR ─────────────────────
const root = process.cwd()
const vite = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(API_URL),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY),
  },
})
const B = await vite.ssrLoadModule('/tests/fixtures/catalog/builders.ts')
const H = await vite.ssrLoadModule('/tests/helpers/catalogPublish.ts')
const CAT = await vite.ssrLoadModule('/src/lib/catalog/index.ts')
const IMP = await vite.ssrLoadModule('/src/lib/adminCatalogImport.ts')
const PEND = await vite.ssrLoadModule('/src/lib/pendingAdminCatalogImport.ts')
const ROSTER = await vite.ssrLoadModule('/src/lib/adminRoster.ts')
const VOID = await vite.ssrLoadModule('/src/lib/adminVoid.ts')
const SKIP = await vite.ssrLoadModule('/src/lib/adminBountySkip.ts')
const SUPA = await vite.ssrLoadModule('/src/lib/supabase.ts')

// ───────────────────────────── clients / identities ─────────────────────────────
const { svc, anon } = L.createQa2Clients()
const PASSWORD = env.LOCAL_TEST_PASSWORD
const IDS = JSON.parse(readFileSync('.local/test-identities.json', 'utf8'))
if (IDS.supabase_url !== L.QA2_URL) throw new Error('test-identities.json is not qa2')
const identity = (key) => IDS.identities.find((i) => i.key === key)
const ADMIN_ID = identity('admin')
let admin = null
async function signIn(key) {
  const row = identity(key)
  const c = anon()
  const { error } = await c.auth.signInWithPassword({ email: row.login_alias, password: PASSWORD })
  if (error) throw new Error(`signIn(${key}): ${error.message}`)
  return c
}

// ───────────────────────────── recording ─────────────────────────────
const rec = L.makeRecorder('admin-catalog')
const defects = []
const B_STATUS = {} // QA3A-Bxxx -> {status, proofs[]}
const ADM_MATRIX = {} // ADM-00x / CAT-001 -> {...}
function defect(id, severity, title, detail = {}) {
  if (defects.some((d) => d.id === id)) return
  defects.push({ id, severity, title, ...detail })
}
class Asserts {
  constructor() {
    this.list = []
  }
  ok(cond, name, evidence) {
    this.list.push({ name, pass: Boolean(cond), ...(evidence !== undefined ? { evidence } : {}) })
    return Boolean(cond)
  }
  get pass() {
    return this.list.every((a) => a.pass)
  }
  failed() {
    return this.list.filter((a) => !a.pass).map((a) => a.name)
  }
}
function proof(bId, id, status, detail = {}) {
  const row = rec.record(id, status, detail)
  if (bId) {
    B_STATUS[bId] ??= { proofs: [] }
    B_STATUS[bId].proofs.push({ id, status, summary: detail.summary ?? null })
  }
  return row
}
function bFinal(bId, forced) {
  const s = B_STATUS[bId]
  if (!s) return
  const st = s.proofs.map((p) => p.status)
  s.status = forced ?? (st.includes('FAIL') ? 'FAIL' : st.includes('BLOCKED') && !st.includes('PASS') ? 'BLOCKED' : st.includes('BLOCKED') ? 'PARTIAL' : 'PASS')
  s.completed = s.status !== 'BLOCKED'
}
const brief = (x, n = 1200) => {
  const s = typeof x === 'string' ? x : JSON.stringify(x)
  return s && s.length > n ? s.slice(0, n) + `…(+${s.length - n})` : s
}

// ───────────────────────────── db helpers ─────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sql = L.qa2Sql
const sqlJson = (s) => JSON.parse(sql(s))
function sqlStdin(text) {
  return execFileSync('docker', ['exec', '-i', QA2_DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'], {
    input: text,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim()
}
function holdAdvisoryLock(expr, seconds) {
  const child = spawn('docker', ['exec', '-i', QA2_DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', `begin; select pg_advisory_xact_lock(${expr}); select pg_sleep(${seconds}); commit;`], { stdio: 'ignore' })
  return child
}
async function waitForAdvisoryLockHeld() {
  for (let i = 0; i < 40; i += 1) {
    const n = Number(sql("select count(*) from pg_locks where locktype='advisory' and granted and pid <> pg_backend_pid()"))
    if (n > 0) return true
    await sleep(100)
  }
  return false
}
function snap() {
  return sqlJson(`select json_build_object(
    'pointer', (select catalog_version_id from active_catalog_pointer where id = 1),
    'pointer_catalog_id', (select cv.catalog_id from catalog_versions cv join active_catalog_pointer p on p.catalog_version_id = cv.id where p.id = 1),
    'versions', (select count(*) from catalog_versions),
    'versions_active', (select count(*) from catalog_versions where status = 'active'),
    'candidates', (select coalesce(json_object_agg(status, c), '{}'::json) from (select status, count(*) c from catalog_import_candidates group by 1) x),
    'publish_requests', (select count(*) from admin_catalog_publish_requests),
    'slots', (select coalesce(json_object_agg(category || ':' || state, c), '{}'::json) from (select category, state, count(*) c from bounty_slots group by 1, 2) x),
    'slots_on_pointer', (select count(*) from bounty_slots where catalog_version_id = (select catalog_version_id from active_catalog_pointer where id = 1)),
    'slots_total', (select count(*) from bounty_slots),
    'active_offers', (select count(*) from bounty_slot_offers where is_active),
    'offers_total', (select count(*) from bounty_slot_offers),
    'exposures', (select count(*) from bounty_objective_exposures),
    'bars', (select count(*) from bars),
    'drink_concepts', (select count(*) from drink_concepts),
    'ingredients', (select count(*) from ingredients),
    'bar_offerings', (select count(*) from bar_offerings),
    'audit_catalog', (select count(*) from admin_audit_log where action like 'catalog.%'),
    'bounty_claims', (select count(*) from bounty_claims),
    'players', (select count(*) from players)
  )`)
}
const CORE_KEYS = ['pointer', 'versions', 'versions_active', 'slots_total', 'active_offers', 'offers_total', 'bars', 'drink_concepts', 'ingredients', 'bar_offerings', 'publish_requests']
const coreEqual = (a, b) => CORE_KEYS.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))
function diffSnap(a, b) {
  const out = {}
  for (const k of Object.keys(b)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = { before: a[k], after: b[k] }
  return out
}
const pointerId = () => sql('select catalog_version_id from active_catalog_pointer where id = 1')

// ───────────────────────────── baseline reset ─────────────────────────────
async function activateFixture(seed, cocktails = 80, ingredients = 45) {
  const catalog = B.buildScheduleReadyCatalog(cocktails, ingredients)
  const a = await svc.rpc('dev_activate_catalog_fixture', { p_payload: catalog })
  if (a.error) throw new Error(`dev_activate_catalog_fixture: ${a.error.message}`)
  const s = await svc.rpc('dev_generate_bounty_schedule', { p_seed: seed })
  if (s.error) throw new Error(`dev_generate_bounty_schedule: ${s.error.message}`)
  const d = await svc.rpc('dev_seed_daily_assignments')
  if (d.error) throw new Error(`dev_seed_daily_assignments: ${d.error.message}`)
}
/** clock → 2099-01-03/-240, finalized cleared, unpaused, fixture catalog (80/45 reserves) + schedule. */
async function resetBaseline(seed = 'qa2a-int') {
  await svc.rpc('dev_reset_preview_gameplay_ledger')
  await svc.rpc('dev_reset_scavenger_test_data')
  const clock = await L.ensureActiveClock(svc) // dev_seed_cruise_clock(2099-01-03,-240) + clear finalized + unpause
  await svc.from('admin_manual_offering_ingredients').delete().not('offering_id', 'is', null)
  await svc.from('admin_manual_offerings').delete().not('id', 'is', null)
  await svc.from('admin_add_drink_requests').delete().not('client_request_id', 'is', null)
  await sql("delete from mobile_order_menu_concepts where true")
  await activateFixture(`${seed}-${randomUUID().slice(0, 6)}`)
  const { data: notes } = await svc.from('catalog_source_notes').select('catalog_version_id').in('note_type', ['publish', 'rollback'])
  const ids = [...new Set((notes ?? []).map((n) => n.catalog_version_id))]
  await svc.from('catalog_import_candidates').delete().not('id', 'is', null)
  await svc.from('admin_catalog_publish_requests').delete().not('client_request_id', 'is', null)
  if (ids.length) {
    const { error } = await svc.from('catalog_versions').delete().in('id', ids)
    if (error) throw new Error(`published-version cleanup: ${error.message}`)
  }
  return clock
}

// ───────────────────────────── catalog RPC wrappers ─────────────────────────────
async function stageDoc(doc, o = {}) {
  const client = o.client ?? admin
  const reqId = o.reqId ?? randomUUID()
  const hash = await IMP.hashPayload(doc)
  let validation = o.validation
  if (!validation) {
    const pv = CAT.previewCatalogImport(doc)
    validation = CAT.buildStageValidation(pv, hash)
  }
  if (o.forge) validation = { ...validation, readiness: 'ready_for_scheduling', error_count: 0, ...(o.forge === true ? {} : o.forge) }
  const { data, error } = await client.rpc('admin_stage_catalog_import', { p_client_request_id: reqId, p_payload: doc, p_validation: validation })
  return { data, error, hash, reqId, candidateId: data?.candidate_id }
}
async function previewCand(candidateId, client = admin) {
  return client.rpc('admin_preview_catalog_publish', { p_candidate_id: candidateId })
}
async function publishCand(candidateId, hash, o = {}) {
  const client = o.client ?? admin
  const expected = o.expected === undefined ? pointerId() : o.expected
  return client.rpc('admin_publish_catalog_import', {
    p_client_request_id: o.reqId ?? randomUUID(),
    p_candidate_id: candidateId,
    p_expected_active_catalog_version_id: expected,
    p_expected_payload_hash: hash,
  })
}
async function rollbackTo(targetId, expectedActive, reqId = randomUUID(), client = admin) {
  return client.rpc('admin_rollback_catalog', {
    p_client_request_id: reqId,
    p_target_catalog_version_id: targetId,
    p_expected_active_catalog_version_id: expectedActive,
  })
}
async function stageAndPublish(doc, o = {}) {
  const st = await stageDoc(doc, o)
  if (!st.data?.ok) throw new Error(`stage failed: ${brief(st.data ?? st.error)}`)
  const pub = await publishCand(st.candidateId, st.hash, o)
  if (!pub.data?.ok) throw new Error(`publish failed: ${brief(pub.data ?? pub.error)}`)
  return { st, pub: pub.data }
}
const barKeyFor = (doc, drinkKey) => doc.cocktail_candidates.find((c) => c.drink_key === drinkKey)?.designated_bar_key
const variant = (o) => H.buildVariantCatalog(o)
const offerKeys = (category) =>
  sqlJson(`select coalesce(json_agg(o.canonical_key order by s.cruise_day, s.slot_index), '[]'::json)
    from bounty_slots s join bounty_slot_offers o on o.id = s.current_offer_id where s.category = '${category}'`)
const currentOffers = () =>
  L.qa2Json(`select s.id slot_id, s.category, s.state, o.id offer_id, o.canonical_key, o.catalog_version_id offer_version, s.catalog_version_id slot_version, o.points, o.display_snapshot
    from bounty_slots s join bounty_slot_offers o on o.id = s.current_offer_id where s.state = 'current'`)

// ═══════════════════════════ QA3A-B001 / B002 ═══════════════════════════
async function phaseB001() {
  await resetBaseline('b001')
  const v1 = pointerId()
  const at = L.noonDay1Utc()
  await L.exposeSlots(svc, at) // current slots exist → publish must preserve them
  const s0 = snap()
  const scheduledC = s0.slots['cocktail:scheduled']
  const scheduledI = s0.slots['ingredient:scheduled']
  const doc = variant({ baseCatalogId: 'dev-fixture-schedule-ready-v1' })
  const st = await stageDoc(doc)
  const sStage = snap()
  const A = new Asserts()
  A.ok(st.data?.ok === true, 'stage ok', brief(st.data))
  A.ok(sStage.pointer === v1 && sStage.versions === s0.versions, 'stage does not move pointer or add a catalog version')
  A.ok((sStage.candidates.staged ?? 0) === (s0.candidates.staged ?? 0) + 1, 'candidate staged row +1')
  const pv = await previewCand(st.candidateId)
  const sPrev = snap()
  A.ok(pv.data?.safe_to_publish === true && pv.data?.read_only === true && pv.data?.mutated_database === false, 'preview read-only + safe', brief({ safe: pv.data?.safe_to_publish, blockers: pv.data?.blockers }))
  A.ok(coreEqual(sStage, sPrev), 'preview mutates nothing (core snapshot identical)')

  // failure paths must NOT flip the pointer (each followed by a core-snapshot comparison)
  const fails = {}
  const tryFail = async (name, call, expectCode) => {
    const before = snap()
    const r = await call()
    const after = snap()
    const code = r.data?.code ?? r.error?.message
    fails[name] = { code, pointer_unchanged: before.pointer === after.pointer, versions_unchanged: before.versions === after.versions, offers_unchanged: before.active_offers === after.active_offers }
    A.ok(code === expectCode && before.pointer === after.pointer && before.versions === after.versions && before.active_offers === after.active_offers && before.offers_total === after.offers_total, `failure path ${name} → ${expectCode}, pointer/versions/offers unchanged`, fails[name])
  }
  await tryFail('stale_expected_active', () => publishCand(st.candidateId, st.hash, { expected: randomUUID() }), 'STALE_ACTIVE_VERSION')
  await tryFail('wrong_hash', () => publishCand(st.candidateId, 'f'.repeat(64)), 'PAYLOAD_HASH_MISMATCH')
  await tryFail('unknown_candidate', () => publishCand(randomUUID(), st.hash), 'CANDIDATE_NOT_FOUND')
  // blocked: drop the live (current) cocktail
  const curC = currentOffers().find((o) => o.category === 'cocktail')
  const blockedDoc = variant({ dropOffering: { drinkKey: curC.canonical_key, barKey: barKeyFor(variant(), curC.canonical_key) } })
  const bst = await stageDoc(blockedDoc)
  await tryFail('blocked_current_offer_missing', () => publishCand(bst.candidateId, bst.hash), 'PUBLISH_BLOCKED')
  // success
  const offersBefore = snap().active_offers
  const pub = await publishCand(st.candidateId, st.hash)
  const s1 = snap()
  const data = pub.data
  A.ok(data?.ok === true, 'publish ok', brief(data))
  A.ok(s1.pointer === data?.catalog_version_id && s1.pointer !== v1, 'pointer flips to the new version only on success', { v1, v2: s1.pointer })
  A.ok(s1.versions === s0.versions + 1, 'exactly one new catalog_versions row (blocked candidate added none)')
  const vrows = L.qa2Json(`select id, status from catalog_versions where id in ('${v1}','${s1.pointer}')`)
  A.ok(vrows.find((r) => r.id === v1)?.status === 'retired' && vrows.find((r) => r.id === s1.pointer)?.status === 'active', 'old version retired, new version active')
  A.ok(data?.reassigned_slots?.cocktail === scheduledC && data?.reassigned_slots?.ingredient === scheduledI, `rebinds exactly the scheduled slots (${scheduledC}/${scheduledI})`, data?.reassigned_slots)
  const cur = currentOffers()
  A.ok(cur.every((o) => o.offer_version === v1 && o.slot_version === s1.pointer), 'current (live) offers keep prior catalog_version on offer; slot pointer follows live catalog', cur.map((o) => ({ cat: o.category, offer_version_is_v1: o.offer_version === v1, slot_version_is_v2: o.slot_version === s1.pointer })))
  A.ok(s1.active_offers === offersBefore, 'one active offer per slot retained (active_offers unchanged)')
  const sched = sql(`select count(*) from bounty_slots where state='scheduled' and catalog_version_id <> '${s1.pointer}'`)
  A.ok(sched === '0', 'no scheduled slot still bound to the retired version')
  const candRow = sqlJson(`select row_to_json(c) from (select status, published_catalog_version_id from catalog_import_candidates where id='${st.candidateId}') c`)
  A.ok(candRow.status === 'published' && candRow.published_catalog_version_id === s1.pointer, 'candidate marked published → new version')
  const again = await publishCand(st.candidateId, st.hash)
  A.ok(again.data?.code === 'CANDIDATE_ALREADY_PUBLISHED', 'second publish of same candidate rejected', again.data?.code)
  proof('QA3A-B001', 'QA3A-B001-publish-pointer-only-on-success', A.pass ? 'PASS' : 'FAIL', {
    summary: 'publish flips active_catalog_pointer only on full success; 4 failure paths leave DB untouched',
    assertions: A.list,
    db_before: s0,
    db_after: s1,
    db_diff: diffSnap(s0, s1),
    failure_paths: fails,
  })
  bFinal('QA3A-B001')
  return { v1, v2: s1.pointer }
}

async function phaseB002() {
  await resetBaseline('b002')
  const v1 = pointerId()
  const s0 = snap()
  const manifestV1 = sqlJson(`select manifest_json from catalog_versions where id='${v1}'`)
  const { pub } = await stageAndPublish(variant({ baseCatalogId: 'dev-fixture-schedule-ready-v1' }))
  const v2 = pub.catalog_version_id
  const sMid = snap()
  const A = new Asserts()
  const reqId = randomUUID()
  const rb = await rollbackTo(v1, v2, reqId)
  const s1 = snap()
  const v3 = rb.data?.catalog_version_id
  A.ok(rb.data?.ok === true && rb.data?.action === 'rollback', 'rollback ok', brief(rb.data))
  A.ok(s1.pointer === v3 && ![v1, v2].includes(v3), 'rollback is a NEW audited revision (not a pointer flip to v1)')
  A.ok(s1.versions === sMid.versions + 1, 'exactly one new version row')
  const st = Object.fromEntries(L.qa2Json(`select id, status, base_catalog_id from catalog_versions where id in ('${v1}','${v2}','${v3}')`).map((r) => [r.id, r]))
  A.ok(st[v1]?.status === 'retired' && st[v2]?.status === 'retired' && st[v3]?.status === 'active', 'history intact: v1/v2 retired, v3 active (target never silently reactivated)')
  const manifestV3 = sqlJson(`select manifest_json from catalog_versions where id='${v3}'`)
  const strip = (m) => JSON.stringify({ ...m, catalog_id: null, base_catalog_id: null })
  A.ok(strip(manifestV3) === strip(manifestV1), 'rolled-back manifest content equals prior version content')
  const offeringKeys = (v) =>
    sqlJson(`select coalesce(json_agg(k order by k),'[]'::json) from (select dc.canonical_key || '@' || b.canonical_key k from catalog_version_offerings cvo join bar_offerings bo on bo.id=cvo.offering_id join drink_concepts dc on dc.id=bo.drink_concept_id join bars b on b.id=bo.bar_id where cvo.catalog_version_id='${v}') x`)
  A.ok(JSON.stringify(offeringKeys(v1)) === JSON.stringify(offeringKeys(v3)), 'offering set of v3 equals v1 (playable catalog restored)', { n: offeringKeys(v3).length })
  const candKeys = (v) =>
    sqlJson(`select coalesce(json_agg(k order by k),'[]'::json) from (select dc.canonical_key || ':' || cc.eligible::text k from cocktail_candidates cc join drink_concepts dc on dc.id=cc.drink_concept_id where cc.catalog_version_id='${v}') x`)
  A.ok(JSON.stringify(candKeys(v1)) === JSON.stringify(candKeys(v3)), 'bounty candidate pool (cocktail) restored')
  A.ok(sql(`select count(*) from bounty_slots where state='scheduled' and catalog_version_id <> '${v3}'`) === '0', 'scheduled slots rebound to the rollback version')
  A.ok(sql(`select count(*) from admin_audit_log where action='catalog.rollback' and target_id='${v3}'`) === '1', 'catalog.rollback audit row written')
  const replay = await rollbackTo(v1, v2, reqId)
  A.ok(replay.data?.idempotent_replay === true && replay.data?.catalog_version_id === v3 && snap().versions === s1.versions, 'rollback replay by request id is idempotent')
  const toActive = await rollbackTo(v3, v3)
  A.ok(toActive.data?.code === 'ROLLBACK_TARGET_ACTIVE', 'rollback to active target rejected', toActive.data?.code)
  const missing = await rollbackTo(randomUUID(), v3)
  A.ok(missing.data?.code === 'ROLLBACK_TARGET_NOT_FOUND', 'rollback to missing target rejected', missing.data?.code)
  const stale = await rollbackTo(v1, randomUUID())
  A.ok(stale.data?.code === 'STALE_ACTIVE_VERSION', 'rollback with stale expected-active rejected', stale.data?.code)
  // chain: roll forward again to v2 (retired) — "rollback after activation" repeatedly
  const chain = await rollbackTo(v2, v3)
  A.ok(chain.data?.ok === true && snap().pointer === chain.data?.catalog_version_id, 'chain rollback v3→v2 content also succeeds (pointer = new revision)')
  proof('QA3A-B002', 'QA3A-B002-rollback-restores-prior', A.pass ? 'PASS' : 'FAIL', {
    summary: 'admin_rollback_catalog restores prior playable catalog as a new audited revision; history intact',
    assertions: A.list,
    db_before: s0,
    db_after: snap(),
    versions: { v1, v2, v3 },
  })

  // incompatible rollback: live objective only exists in v2
  await resetBaseline('b002b')
  const w1 = pointerId()
  const pubP = await stageAndPublish(variant({ replaceCocktailPool: 80 }))
  const w2 = pubP.pub.catalog_version_id
  await L.exposeSlots(svc, L.noonDay1Utc())
  const live = currentOffers().find((o) => o.category === 'cocktail')
  const before = snap()
  const blocked = await rollbackTo(w1, w2)
  const after = snap()
  const A2 = new Asserts()
  A2.ok(live.canonical_key.startsWith('variant-cocktail-'), 'live objective is a v2-only key', live.canonical_key)
  A2.ok(blocked.data?.code === 'ROLLBACK_BLOCKED' && (blocked.data?.blockers ?? []).some((b) => b.code === 'CURRENT_OFFER_MISSING'), 'rollback blocked: CURRENT_OFFER_MISSING', brief(blocked.data))
  A2.ok(coreEqual(before, after), 'blocked rollback leaves DB core unchanged')
  proof('QA3A-B002', 'QA3A-B002-rollback-blocked-live-objective', A2.pass ? 'PASS' : 'FAIL', { summary: 'rollback refuses when the live objective is absent from the target', assertions: A2.list, db_diff: diffSnap(before, after) })
  bFinal('QA3A-B002')
}

// ═══════════════════════════ QA3A-B003 ═══════════════════════════
async function phaseB003() {
  await resetBaseline('b003')
  const v1 = pointerId()
  const s0 = snap()
  const A = new Asserts()
  const keys = Array.from({ length: 40 }, (_, i) => `fixture-cocktail-${String(i + 1).padStart(3, '0')}`)
  const doc = variant({ restrictCocktailCandidates: keys, addDrink: { key: 'qa2a-b003-leak-drink', name: 'Qa2a Leak Drink', barKey: 'wake-view' } })
  doc.bars.push({ key: 'qa2a-b003-leak-bar', name: 'Qa2a Leak Bar', deck: null, active: true })
  const hash = await IMP.hashPayload(doc)
  // (a) direct apply (service_role) bypasses evaluate: forces REMAINING_POOL_SHORTAGE *inside* catalog_publish_apply
  const direct = await svc.rpc('catalog_publish_apply', {
    p_payload: doc,
    p_payload_hash: hash,
    p_actor_id: ADMIN_ID.player_id,
    p_source: 'publish',
    p_source_ref: { client_request_id: randomUUID() },
    p_active_version_id: v1,
  })
  const s1 = snap()
  A.ok(Boolean(direct.error) && /REMAINING_POOL_SHORTAGE/.test(direct.error.message), 'catalog_publish_apply raises REMAINING_POOL_SHORTAGE mid-apply', direct.error?.message)
  A.ok(coreEqual(s0, s1) && s0.pointer === s1.pointer, 'mid-apply failure rolled back everything: no new version, pointer/slots/offers/bars/concepts unchanged', diffSnap(s0, s1))
  A.ok(sql("select count(*) from drink_concepts where canonical_key='qa2a-b003-leak-drink'") === '0', 'new drink_concepts row from the failed apply did NOT leak (global table rolled back)')
  A.ok(sql("select count(*) from bars where canonical_key='qa2a-b003-leak-bar'") === '0', 'new bars row from the failed apply did NOT leak')
  A.ok(sql(`select count(*) from catalog_versions where catalog_id='${doc.catalog_id}'`) === '0', 'half-built catalog version row rolled back')
  A.ok(sql(`select count(*) from bounty_slots where state='scheduled' and catalog_version_id='${v1}'`) === String((s0.slots['cocktail:scheduled'] ?? 0) + (s0.slots['ingredient:scheduled'] ?? 0)), 'all scheduled slots still on v1 after failure')
  proof('QA3A-B003', 'QA3A-B003-apply-time-shortage-atomic', A.pass ? 'PASS' : 'FAIL', {
    summary: 'REMAINING_POOL_SHORTAGE raised inside apply → whole transaction rolled back (versions, offers, global rows)',
    assertions: A.list,
    db_diff: diffSnap(s0, s1),
  })

  // (b) admin path: evaluate catches the same shortage up-front → structured PUBLISH_BLOCKED + failed ledger row
  await resetBaseline('b003b')
  const at = L.noonDay1Utc()
  await L.exposeSlots(svc, at)
  const cur = currentOffers().find((o) => o.category === 'cocktail')
  const skip = await svc.rpc('dev_admin_skip_bounty_at', { p_category: 'cocktail', p_expected_offer_id: cur.offer_id, p_client_request_id: randomUUID(), p_at_utc: at, p_actor_id: ADMIN_ID.player_id })
  const after = currentOffers().find((o) => o.category === 'cocktail')
  const all = Array.from({ length: 80 }, (_, i) => `fixture-cocktail-${String(i + 1).padStart(3, '0')}`)
  const keep = [cur.canonical_key, after.canonical_key, ...all.filter((k) => k !== cur.canonical_key && k !== after.canonical_key)].slice(0, 72)
  const doc2 = variant({ restrictCocktailCandidates: keep })
  const st = await stageDoc(doc2)
  const before2 = snap()
  const reqId = randomUUID()
  const pub = await publishCand(st.candidateId, st.hash, { reqId })
  const after2 = snap()
  const ledger = await admin.rpc('admin_find_catalog_publish_request_by_id', { p_client_request_id: reqId })
  const A2 = new Asserts()
  A2.ok(skip.data?.ok === true, 'setup skip ok', brief(skip.data))
  A2.ok(pub.data?.code === 'PUBLISH_BLOCKED' && (pub.data?.blockers ?? []).some((b) => b.code === 'REMAINING_POOL_SHORTAGE'), 'admin publish blocked with REMAINING_POOL_SHORTAGE blocker', brief(pub.data?.blockers))
  A2.ok(before2.pointer === after2.pointer && before2.versions === after2.versions, 'pointer/version count unchanged on blocked publish')
  A2.ok(ledger.data?.request_status === 'failed', 'ledger row recorded as failed (reconcilable by request id)', ledger.data?.request_status)
  proof('QA3A-B003', 'QA3A-B003-evaluate-blocks-shortage', A2.pass ? 'PASS' : 'FAIL', { summary: 'evaluate pre-flight blocks the same shortage with structured blockers + failed ledger row', assertions: A2.list })
  bFinal('QA3A-B003')
}

// ═══════════════════════════ QA3A-B004 / B005 ═══════════════════════════
async function phaseB004() {
  await resetBaseline('b004')
  const v1 = pointerId()
  const s0 = snap()
  const catalogId = H.uniqueCatalogId('qa2a-b004')
  const A = new Asserts()
  // (a) concurrent STAGE, same catalog_id, distinct request ids (stage lock is per request id)
  const N = 6
  const docs = Array.from({ length: N }, () => variant({ catalogId }))
  const stages = await Promise.all(docs.map((d) => stageDoc(d)))
  const staged = sqlJson(`select coalesce(json_agg(json_build_object('id', id, 'status', status)), '[]'::json) from catalog_import_candidates where catalog_id='${catalogId}'`)
  const stagedCount = staged.filter((r) => r.status === 'staged').length
  const okCount = stages.filter((s) => s.data?.ok).length
  A.ok(okCount === N, `all ${N} concurrent stages returned ok`, { ok: okCount, errors: stages.filter((s) => !s.data?.ok).map((s) => brief(s.data ?? s.error, 200)) })
  const stageRace = stagedCount > 1
  if (stageRace) {
    defect('INT-CAT-001', 'P2', 'Concurrent admin_stage_catalog_import for one catalog_id leaves multiple staged candidates', {
      qa3a_ref: 'QA3A-B004',
      observed: `${stagedCount}/${N} candidates for catalog_id are simultaneously 'staged' (abandon-then-insert is not serialized: stage lock is keyed by client_request_id, not catalog_id; no partial unique index)`,
      impact: 'Operator can publish either duplicate; the second becomes CATALOG_ID_EXISTS/STALE. Not data-corrupting (publish serializes), but ambiguous candidate list.',
      evidence: staged,
    })
  }
  A.ok(!stageRace, 'only one staged candidate per catalog_id after concurrent stages (advisory lock on catalog_id)', { staged_count: stagedCount, rows: staged })
  // (b) concurrent PUBLISH of two different candidates: advisory lock catalog_publish → exactly one wins
  const a = await stageDoc(variant({ catalogId: H.uniqueCatalogId('qa2a-b004a') }))
  const b = await stageDoc(variant({ catalogId: H.uniqueCatalogId('qa2a-b004b') }))
  const vBefore = snap().versions
  const [pa, pb] = await Promise.all([publishCand(a.candidateId, a.hash, { expected: v1 }), publishCand(b.candidateId, b.hash, { expected: v1 })])
  const codes = [pa.data, pb.data].map((d) => (d?.ok ? 'OK' : d?.code ?? 'ERR'))
  A.ok(codes.filter((c) => c === 'OK').length === 1 && codes.includes('STALE_ACTIVE_VERSION'), 'concurrent publishes of 2 candidates: exactly one OK, other STALE_ACTIVE_VERSION', codes)
  A.ok(snap().versions === vBefore + 1 && sql("select count(*) from catalog_versions where status='active'") === '1', 'exactly one new version, exactly one active version')
  // (c) concurrent publish of two candidates SAME catalog_id (if stage race produced them)
  if (stageRace) {
    const dupRows = staged.filter((r) => r.status === 'staged').slice(0, 2)
    const v = pointerId()
    const h = (await IMP.hashPayload(docs[0]))
    const rs = await Promise.all(dupRows.map((r) => publishCand(r.id, h, { expected: v })))
    const c2 = rs.map((x) => (x.data?.ok ? 'OK' : x.data?.code ?? 'ERR'))
    A.ok(c2.filter((c) => c === 'OK').length <= 1, 'duplicate same-catalog_id candidates cannot both publish', c2)
  }
  // (d) same request id concurrently → exactly once
  const c = await stageDoc(variant({ catalogId: H.uniqueCatalogId('qa2a-b004c') }))
  const rid = randomUUID()
  const exp = pointerId()
  const vb = snap().versions
  const [r1, r2] = await Promise.all([publishCand(c.candidateId, c.hash, { reqId: rid, expected: exp }), publishCand(c.candidateId, c.hash, { reqId: rid, expected: exp })])
  A.ok(r1.data?.ok && r2.data?.ok && [r1.data.idempotent_replay, r2.data.idempotent_replay].sort().join() === 'false,true' && snap().versions === vb + 1, 'same request id concurrently publishes exactly once', [r1.data?.idempotent_replay, r2.data?.idempotent_replay])
  proof('QA3A-B004', 'QA3A-B004-concurrent-stage-publish', A.pass ? 'PASS' : 'FAIL', { summary: 'concurrent stage/publish for the same catalog_id', assertions: A.list, stage_race: { staged_count: stagedCount, n: N }, db_before: s0, db_after: snap() })

  // advisory lock proof: hold catalog_publish lock externally; publish must wait, stage must not
  await resetBaseline('b004lock')
  const exp2 = pointerId()
  const d = await stageDoc(variant())
  const holder = holdAdvisoryLock("hashtext('catalog_publish')", 4)
  const held = await waitForAdvisoryLockHeld()
  const t0 = Date.now()
  const stageDuringHold = await stageDoc(variant())
  const tStage = Date.now() - t0
  const t1 = Date.now()
  const pubHeld = await publishCand(d.candidateId, d.hash, { expected: exp2 })
  const tPub = Date.now() - t1
  holder.kill()
  const A2 = new Asserts()
  A2.ok(held, 'external session holds advisory lock hashtext(catalog_publish)')
  A2.ok(pubHeld.data?.ok === true, 'publish completes after lock released', brief(pubHeld.data?.code ?? pubHeld.error))
  A2.ok(tPub >= 2000, 'publish blocked while catalog_publish lock held (waited ≥2s)', { publish_ms: tPub })
  A2.ok(stageDuringHold.data?.ok === true && tStage < 2000, 'stage does NOT take the catalog_publish lock (returned immediately)', { stage_ms: tStage })
  proof('QA3A-B004', 'QA3A-B004-advisory-lock-proof', A2.pass ? 'PASS' : 'FAIL', { summary: 'publish serializes on pg_advisory_xact_lock(hashtext(catalog_publish)); stage does not', assertions: A2.list })
  bFinal('QA3A-B004')
}

async function phaseB005() {
  // Add Drink vs publish race (RISK-CAT-C): admin_add_drink locks (admin_add_drink_catalog, active_version) but NOT catalog_publish.
  await resetBaseline('b005')
  const v1 = pointerId()
  const st = await stageDoc(variant({ baseCatalogId: 'dev-fixture-schedule-ready-v1' }))
  const holder = holdAdvisoryLock(`hashtext('admin_add_drink_catalog'), hashtext('${v1}')`, 6)
  const held = await waitForAdvisoryLockHeld()
  const name = `QA2A Race Drink ${randomUUID().slice(0, 4)}`
  const addP = admin.rpc('admin_add_drink', { p_client_request_id: randomUUID(), p_display_name: name, p_bar_canonical_keys: ['wake-view'], p_ingredient_canonical_keys: ['lime-juice'], p_kind: 'named_cocktail' })
  await sleep(1000)
  const pub = await publishCand(st.candidateId, st.hash, { expected: v1 })
  const v2 = pointerId()
  const add = await addP
  holder.kill()
  const manual = L.qa2Json(`select amo.catalog_version_id, amo.active, amo.display_name from admin_manual_offerings amo where amo.display_name='${name}'`)
  const picker = await admin.rpc('list_drinkit_bar_drinks', { p_bar_canonical_key: 'wake-view' })
  const inPicker = (picker.data ?? []).some((d) => d.display_name === name || d.name === name)
  const A = new Asserts()
  A.ok(held, 'external lock held on admin_add_drink_catalog key')
  A.ok(pub.data?.ok === true && v2 !== v1, 'publish proceeds (not serialized against Add Drink)', brief(pub.data?.code))
  A.ok(add.data?.ok === true, 'admin_add_drink returned ok:true after lock release', brief(add.data))
  const strandedOnRetired = manual.some((m) => m.catalog_version_id === v1) && !manual.some((m) => m.catalog_version_id === v2)
  A.ok(!strandedOnRetired, 'Add Drink overlay lands on the live (new) catalog version', { manual, v1, v2 })
  A.ok(inPicker, 'newly added drink visible in the live picker', { in_picker: inPicker, picker_len: picker.data?.length })
  if (strandedOnRetired || !inPicker) {
    defect('INT-CAT-005', 'P1', 'admin_add_drink races catalog publish: overlay written to the retired catalog version', {
      qa3a_ref: 'QA3A-B005',
      observed: `add_drink read active version ${v1} before publish flipped to ${v2}; it returned ok:true but admin_manual_offerings.catalog_version_id=${manual[0]?.catalog_version_id}; drink in live picker=${inPicker}`,
      impact: 'Admin is told the drink was added but guests cannot pick it; overlay is never carried forward (publish already ran).',
      cause: 'admin_add_drink takes advisory locks (admin_add_drink, admin_add_drink_catalog:<active>) — never catalog_publish — and resolves v_catalog before waiting.',
      evidence: { manual, picker_has_drink: inPicker },
    })
  }
  proof('QA3A-B005', 'QA3A-B005-add-drink-vs-publish-race', A.pass ? 'PASS' : 'FAIL', { summary: 'deterministic interleave: add_drink resolves active version, publish flips pointer, add_drink completes', assertions: A.list, manual, versions: { v1, v2 } })
  bFinal('QA3A-B005')
}

// ═══════════════════════════ QA3A-B006 ═══════════════════════════
async function phaseB006() {
  await resetBaseline('b006')
  const v1 = pointerId()
  const A = new Asserts()
  const results = {}
  const minimalForge = { readiness: 'ready_for_scheduling' } // no hash, no counts, no fingerprint
  const baseDoc = () => variant({ baseCatalogId: 'dev-fixture-schedule-ready-v1' })

  // 0) authz: player/anon cannot call
  const player = await signIn('drink_only')
  const doc0 = baseDoc()
  const deny = await player.rpc('admin_stage_catalog_import', { p_client_request_id: randomUUID(), p_payload: doc0, p_validation: minimalForge })
  const denyAnon = await anon().rpc('admin_stage_catalog_import', { p_client_request_id: randomUUID(), p_payload: doc0, p_validation: minimalForge })
  A.ok(/ADMIN_REQUIRED/.test(deny.error?.message ?? ''), 'player JWT denied (ADMIN_REQUIRED)', deny.error?.message)
  A.ok(Boolean(denyAnon.error), 'anon denied', denyAnon.error?.message)

  // 1) minimal forged p_validation accepted for a valid doc (client-trust boundary)
  const s1 = await stageDoc(doc0, { validation: minimalForge })
  results.minimal_forged_validation_valid_doc = { ok: s1.data?.ok, code: s1.data?.code }
  A.ok(s1.data?.ok === true, 'documented: minimal forged validation {readiness} is accepted for a server-valid doc (server relies on its own recount, not the client report)', brief(s1.data))

  // 2) forged readiness cannot defeat server pool recount
  const short = variant({ cocktailCount: 70, ingredientCount: 45 })
  const s2 = await stageDoc(short, { validation: minimalForge })
  results.forged_readiness_short_pool = { code: s2.data?.code }
  A.ok(s2.data?.code === 'POOL_SHORTAGE', 'forged ready flag cannot bypass server pool recount (POOL_SHORTAGE)', s2.data?.code)

  // 3) invalid enum (tier) passes stage; explodes inside publish apply
  const badTier = baseDoc()
  badTier.cocktail_candidates[0].tier = 'bogus_tier'
  const s3 = await stageDoc(badTier, { validation: minimalForge })
  results.bogus_tier = { stage_ok: s3.data?.ok, code: s3.data?.code }
  if (s3.data?.ok) {
    const before = snap()
    const rid = randomUUID()
    const p3 = await publishCand(s3.candidateId, s3.hash, { reqId: rid })
    const after = snap()
    const led = await admin.rpc('admin_find_catalog_publish_request_by_id', { p_client_request_id: rid })
    results.bogus_tier.publish = { error: p3.error?.message, code: p3.data?.code, ledger_row: led.data }
    A.ok(Boolean(p3.error) || p3.data?.ok === false, 'bogus tier does not publish', brief(p3.error ?? p3.data))
    A.ok(coreEqual(before, after), 'failed publish (enum cast) leaves DB core unchanged (atomic)')
    const ledgerMissing = led.data === null
    results.bogus_tier.ledger_missing = ledgerMissing
    defect('INT-CAT-003', 'P2', 'Server accepts non-enum tier at stage; publish then fails with a raw RPC error and no ledger row', {
      qa3a_ref: 'QA3A-B006',
      observed: `stage ok=${s3.data?.ok}; publish error="${p3.error?.message}"; admin_find_catalog_publish_request_by_id(request) → ${ledgerMissing ? 'null (no ledger row)' : 'row'}`,
      impact: 'Frontend publishImport maps any RPC error to status "unknown" and Check Status finds no ledger → operator is stuck on an unknown that can never resolve (same lock family as ADM-008). Only reachable by bypassing the TS validator, but TS/SQL validators diverge.',
      evidence: results.bogus_tier,
    })
  } else {
    A.ok(true, 'bogus tier rejected at stage (server validates enum)', s3.data?.code)
  }

  // 4) invalid kind / price_status enum
  const badKind = baseDoc()
  badKind.drinks.find((d) => d.key === 'fixture-cocktail-002').kind = 'moonshine'
  const s4 = await stageDoc(badKind, { validation: minimalForge })
  results.bogus_kind = { stage_ok: s4.data?.ok, code: s4.data?.code ?? s4.error?.message }
  if (s4.data?.ok) {
    const p4 = await publishCand(s4.candidateId, s4.hash)
    results.bogus_kind.publish = { error: p4.error?.message, code: p4.data?.code }
  }
  const badPrice = baseDoc()
  badPrice.drinks.find((d) => d.key === 'fixture-cocktail-003').bar_offerings[0].price_status = 'free_beer'
  const s4b = await stageDoc(badPrice, { validation: minimalForge })
  results.bogus_price_status = { stage_ok: s4b.data?.ok, code: s4b.data?.code ?? s4b.error?.message }
  A.ok(true, 'enum bypass family recorded (kind / price_status)', results)

  // 5) points / tier mismatch accepted → inflated bounty points reach live offers
  const inflated = baseDoc()
  inflated.cocktail_candidates[0].points = 99999
  inflated.cocktail_candidates[0].tier = 'familiar'
  const s5 = await stageDoc(inflated, { validation: minimalForge })
  results.points_inflation = { stage_ok: s5.data?.ok, code: s5.data?.code }
  if (s5.data?.ok) {
    const p5 = await publishCand(s5.candidateId, s5.hash)
    const maxPts = sql("select coalesce(max(points),0) from bounty_slot_offers where is_active and reason like 'catalog_publish%'")
    results.points_inflation.published = p5.data?.ok
    results.points_inflation.max_points_on_live_offers = maxPts
    const candPts = sql(`select max(points) from cocktail_candidates where catalog_version_id='${p5.data?.catalog_version_id}'`)
    results.points_inflation.max_candidate_points = candPts
    if (p5.data?.ok && Number(candPts) === 99999) {
      defect('INT-CAT-002', 'P2', 'Server does not validate tier→points mapping (or ingredient known_bar_count/tier): crafted p_payload publishes arbitrary bounty points', {
        qa3a_ref: 'QA3A-B006',
        observed: `cocktail candidate tier=familiar points=99999 published; cocktail_candidates.max(points)=${candPts}; live offers max points=${maxPts}`,
        impact: 'Requires admin JWT + bypassing TS validation (RISK-CAT-B). A rogue/buggy generator could mint huge bounty points that flow into scoring.',
        evidence: results.points_inflation,
      })
      A.ok(false, 'points=99999 for tier familiar must be rejected server-side', results.points_inflation)
    } else {
      A.ok(true, 'points inflation not accepted/published', results.points_inflation)
    }
  } else {
    A.ok(true, 'points inflation rejected at stage', s5.data?.code)
  }
  // restore baseline catalog after the inflated publish
  await resetBaseline('b006-after')

  // 6) price over limit / inactive bar designated → ineligible (safe)
  const overLimit = baseDoc()
  for (let i = 1; i <= 5; i += 1) overLimit.drinks.find((d) => d.key === `fixture-cocktail-00${i}`).bar_offerings[0].price_usd = 99
  const s6 = await stageDoc(overLimit, { validation: minimalForge })
  results.price_over_limit = { stage_code: s6.data?.code, cocktail_eligible: s6.data?.cocktail_eligible }
  A.ok(s6.data?.ok === false && s6.data?.code === 'POOL_SHORTAGE', 'over-limit price on candidates → server drops eligibility → POOL_SHORTAGE', brief(s6.data))
  // 7) ingredient lying about bar coverage still recounted
  const lyingIng = baseDoc()
  lyingIng.ingredient_candidates[0].known_bar_count = 99
  lyingIng.ingredient_candidates[0].tier = 'easy_to_find'
  const s7 = await stageDoc(lyingIng, { validation: minimalForge })
  results.ingredient_metadata_lie = { stage_ok: s7.data?.ok, code: s7.data?.code }
  A.ok(s7.data?.ok === true, 'documented: ingredient known_bar_count/tier metadata is not verified (only ≥2 corroborating bars is recounted)', brief(s7.data))
  // 8) oversized payload latency (RISK-CAT-A) — 1500 extra drinks
  const big = baseDoc()
  for (let i = 0; i < 1500; i += 1) {
    big.drinks.push({ key: `qa2a-bulk-${i}`, name: `Bulk ${i}`, kind: 'beer', bar_offerings: [{ bar_key: 'poolside', ingredient_keys: [], display_ingredients: [], price_usd: 8, price_status: 'not_applicable' }] })
  }
  const bytes = JSON.stringify(big).length
  const t0 = Date.now()
  const s8 = await stageDoc(big, { validation: minimalForge })
  results.oversized = { bytes, ms: Date.now() - t0, stage_ok: s8.data?.ok, code: s8.data?.code ?? s8.error?.message }
  A.ok(true, 'oversized payload (no server cap) recorded', results.oversized)
  await svc.from('catalog_import_candidates').delete().not('id', 'is', null)
  const sFinal = snap()
  A.ok(sFinal.pointer !== undefined, 'snapshot readable')
  proof('QA3A-B006', 'QA3A-B006-crafted-validation-bypass', A.pass ? 'PASS' : 'FAIL', {
    summary: 'crafted p_validation / payload bypass attempts against server-side checks (admin JWT)',
    assertions: A.list,
    cases: results,
  })
  bFinal('QA3A-B006')
}

// ═══════════════════════════ QA3A-B007 Mobile Order ═══════════════════════════
const sub = (r) => r?.data?.preview ?? r?.data ?? {}
async function phaseB007() {
  await resetBaseline('b007')
  const at = L.noonDay1Utc()
  await L.exposeSlots(svc, at)
  const player = await signIn('drink_only')
  const author = identity('drink_only').player_id
  const cur = currentOffers()
  const curC = cur.find((o) => o.category === 'cocktail')
  const curI = cur.find((o) => o.category === 'ingredient')
  const designatedBar = curC.display_snapshot?.designated_bar_key
  const A = new Asserts()
  const ev = {}

  const mo = await player.rpc('list_drinkit_mobile_order_drinks')
  A.ok(!mo.error && (mo.data ?? []).length > 5, 'Mobile Order drink list available', { n: mo.data?.length, error: mo.error?.message, sample: mo.data?.[0] })
  const moRows = mo.data ?? []
  const moFor = (conceptKey) => moRows.find((r) => r.canonical_key === conceptKey || r.drink_key === conceptKey || r.concept_key === conceptKey)
  // cocktail: bounty drink offered at its designated bar vs via Mobile Order
  const cocktailOffering = (await L.lookupOffering(svc, designatedBar, curC.canonical_key))?.offering_id
  const moCocktail = moFor(curC.canonical_key)
  ev.mo_row_shape = moRows[0] ? Object.keys(moRows[0]) : null
  const ctlCocktail = await svc.rpc('dev_preview_drink_claims_at', { p_payload: L.drinkPayload({ barKey: designatedBar, offeringId: cocktailOffering }), p_at_utc: at, p_player_id: author })
  const ctlCat = sub(ctlCocktail)?.categories ?? {}
  A.ok(ctlCat?.cocktail?.status === 'eligible', 'control: bounty cocktail at designated physical bar is eligible', brief(ctlCat?.cocktail))
  const moOfferingId = moCocktail?.offering_id ?? cocktailOffering
  const moPayload = L.drinkPayload({ barKey: 'mobile-order', offeringId: moOfferingId })
  const moPrev = await svc.rpc('dev_preview_drink_claims_at', { p_payload: moPayload, p_at_utc: at, p_player_id: author })
  const moCat = sub(moPrev)?.categories ?? {}
  ev.mo_cocktail_preview = moCat?.cocktail
  A.ok(moCat?.cocktail?.status !== 'eligible', 'Mobile Order logging of the bounty cocktail is NOT eligible (bar mismatch / virtual)', brief(moCat?.cocktail))
  // ingredient: find a drink containing the current ingredient
  const ingDrink = L.qa2Json(`select bo.id offering_id, dc.canonical_key drink_key, b.canonical_key bar_key
    from catalog_offering_ingredients coi join ingredients i on i.id = coi.ingredient_id
    join bar_offerings bo on bo.id = coi.offering_id join bars b on b.id = bo.bar_id
    join drink_concepts dc on dc.id = bo.drink_concept_id
    where i.canonical_key = '${curI.canonical_key}' and coi.catalog_version_id = (select catalog_version_id from active_catalog_pointer where id = 1) and b.is_virtual is false
    order by dc.canonical_key limit 1`)[0]
  const ctlIng = await svc.rpc('dev_preview_drink_claims_at', { p_payload: L.drinkPayload({ barKey: ingDrink.bar_key, offeringId: ingDrink.offering_id }), p_at_utc: at, p_player_id: author })
  const ctlIngCat = sub(ctlIng)?.categories ?? {}
  A.ok(ctlIngCat?.ingredient?.status === 'eligible' || ctlIngCat?.ingredient?.status === 'confirmable' || ctlIngCat?.ingredient, 'control: ingredient bounty evaluated at physical bar', brief(ctlIngCat?.ingredient))
  const moIng = moFor(ingDrink.drink_key)
  const moIngPrev = await svc.rpc('dev_preview_drink_claims_at', { p_payload: L.drinkPayload({ barKey: 'mobile-order', offeringId: moIng?.offering_id ?? ingDrink.offering_id }), p_at_utc: at, p_player_id: author })
  const moIngCat = sub(moIngPrev)?.categories ?? {}
  ev.mo_ingredient_preview = moIngCat?.ingredient
  A.ok(moIngCat?.ingredient?.status === 'unavailable' && moIngCat?.ingredient?.reason === 'virtual_order_source', 'Mobile Order Ingredient bounty → unavailable / virtual_order_source', brief(moIngCat?.ingredient))
  // DB claims: MO log creates no bounty claims; control at physical bar does
  const claimsBefore = Number(sql(`select count(*) from bounty_claims where player_id='${author}'`))
  const moSubmit = await L.submitAt(svc, author, moPayload, at)
  const claimsAfterMo = Number(sql(`select count(*) from bounty_claims where player_id='${author}'`))
  A.ok(moSubmit.data?.ok === true, 'Mobile Order submit ok (ordinary log)', brief(moSubmit.data?.code ?? moSubmit.error))
  A.ok(claimsAfterMo === claimsBefore, 'MO log creates no bounty claim rows (before/after)', { before: claimsBefore, after: claimsAfterMo })
  const ctlSubmit = await L.submitAt(svc, author, L.drinkPayload({ barKey: designatedBar, offeringId: cocktailOffering }), at)
  const claimsAfterCtl = Number(sql(`select count(*) from bounty_claims where player_id='${author}'`))
  A.ok(ctlSubmit.data?.ok === true && claimsAfterCtl > claimsAfterMo, 'control: same drink at designated bar creates claim rows', { after_mo: claimsAfterMo, after_ctl: claimsAfterCtl })
  // Bar Bounty mismatch
  const bbMo = await svc.rpc('dev_preview_my_bar_bounty_at', { p_player_id: author, p_payload: L.drinkPayload({ barKey: 'mobile-order', offeringId: moOfferingId }), p_at_utc: at })
  ev.bar_bounty_mo = bbMo.data ?? bbMo.error?.message
  const bbJson = JSON.stringify(bbMo.data ?? {})
  A.ok(!bbMo.error && !/"eligible":\s*true/.test(bbJson) && !/"status":\s*"eligible"/.test(bbJson), 'Bar Bounty preview for Mobile Order is not eligible (virtual bar ≠ featured physical bar)', brief(bbMo.data))
  // physical-only bar counts: mobile-order excluded from list_drinkit_bars physical rows ordering
  const bars = await player.rpc('list_drinkit_bars')
  A.ok((bars.data ?? []).at(-1)?.canonical_key === 'mobile-order', 'Mobile Order listed last in bars picker', (bars.data ?? []).slice(-2).map((b) => b.canonical_key))

  // CAT-002 server side: bounty candidates designated at the virtual bar
  await resetBaseline('b007b')
  const mdoc = variant({ baseCatalogId: 'dev-fixture-schedule-ready-v1' })
  mdoc.bars.push({ key: 'mobile-order', name: 'Mobile Order', deck: null, active: true })
  for (let i = 1; i <= 5; i += 1) {
    const key = `fixture-cocktail-00${i}`
    mdoc.drinks.find((d) => d.key === key).bar_offerings.push({ bar_key: 'mobile-order', ingredient_keys: ['lime-juice'], display_ingredients: ['Lime Juice'], price_usd: 11, price_status: 'verified_within_limit', evidence_reference: `qa2a-mo-${key}` })
    const c = mdoc.cocktail_candidates.find((x) => x.drink_key === key)
    c.designated_bar_key = 'mobile-order'
  }
  const tsPrev = CAT.previewCatalogImport(mdoc)
  const mst = await stageDoc(mdoc)
  ev.cat002 = { client_ready: CAT.isReadyToStage(tsPrev), stage_ok: mst.data?.ok, stage_code: mst.data?.code, pool: mst.data?.pool }
  let designatedMo = null
  if (mst.data?.ok) {
    const mpub = await publishCand(mst.candidateId, mst.hash)
    designatedMo = Number(sql(`select count(*) from bounty_slot_offers o where o.is_active and o.display_snapshot->>'designated_bar_key'='mobile-order'`))
    const virtualFlag = sql("select is_virtual from bars where canonical_key='mobile-order'")
    ev.cat002.publish_ok = mpub.data?.ok
    ev.cat002.slots_designated_at_mobile_order = designatedMo
    ev.cat002.mobile_order_bar_still_virtual = virtualFlag
    A.ok(virtualFlag === 't', 'catalog replace keeps mobile-order bar virtual', virtualFlag)
    if (designatedMo > 0) {
      defect('INT-CAT-006', 'P2', 'Catalog stage/publish accepts Cocktail candidates designated at the virtual mobile-order bar (CAT-002 reaches live slots)', {
        qa3a_ref: 'QA3A-B007',
        cat_ref: 'CAT-002',
        observed: `${designatedMo} active bounty offers now designate mobile-order; client TS preview ready=${ev.cat002.client_ready}; server stage ok=${mst.data?.ok}`,
        impact: 'A bounty whose designated bar is the virtual Mobile Order source cannot be completed at a physical bar and MO logs are excluded → unfulfillable/ confusing live bounty. DB exclusion only protects eligibility, not scheduling.',
        evidence: ev.cat002,
      })
    }
    A.ok(designatedMo === 0, 'no live bounty is designated at the virtual mobile-order bar', ev.cat002)
  } else {
    A.ok(true, 'server rejected mobile-order designated candidates at stage', brief(mst.data))
  }
  proof('QA3A-B007', 'QA3A-B007-mobile-order-virtual-source', A.pass ? 'PASS' : 'FAIL', { summary: 'Mobile Order: cocktail not eligible, ingredient virtual_order_source, Bar Bounty mismatch, no claims; CAT-002 server path', assertions: A.list, evidence: ev })
  bFinal('QA3A-B007')
}

// ═══════════════════════════ shared: synthetic cohort ═══════════════════════════
const cohort = new L.Cohort(svc, 'qa2a-int')
async function liveClock(fn) {
  const now = new Date()
  const target = 13 * 60 + 5
  let offset = target - (now.getUTCHours() * 60 + now.getUTCMinutes())
  if (offset > 720) offset -= 1440
  if (offset <= -720) offset += 1440
  const shipDate = new Date(now.getTime() + offset * 60000).toISOString().slice(0, 10)
  const { error } = await svc.rpc('dev_seed_cruise_clock', { p_day1_ship_date: shipDate, p_base_offset_minutes: offset, p_label: 'development-only' })
  if (error) throw new Error(`live clock seed: ${error.message}`)
  await svc.from('game_control').update({ finalized_at_utc: null, status: 'active' }).in('game', ['drinkit', 'shipit'])
  await svc.rpc('dev_set_drinkit_paused', { p_paused: false })
  await svc.rpc('dev_reset_preview_gameplay_ledger')
  await activateFixture(`live-${randomUUID().slice(0, 6)}`)
  const t = new Date().toISOString()
  await svc.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: t })
  await svc.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: t })
  try {
    return await fn({ shipDate, offset })
  } finally {
    await resetBaseline('after-live')
  }
}

// ═══════════════════════════ QA3A-B008 crews (2099 dev functions) ═══════════════════════════
async function phaseB008() {
  await resetBaseline('b008')
  await cohort.adopt()
  await cohort.cleanup()
  const at = L.noonDay1Utc()
  const A = new Asserts()
  const roster0 = Number(sql("select count(*) from players p join game_memberships g on g.player_id=p.id where g.game='drinkit' and g.enabled and p.active"))
  const fillers = []
  for (let i = roster0; i < 8; i += 1) fillers.push(await cohort.makePlayer(`crew${i}`, ['drinkit']))
  const crewsBefore = Number(sql('select count(*) from bar_bounty_crew_days'))
  const e1 = await svc.rpc('dev_ensure_bar_bounty_crews_at', { p_at_utc: at, p_seed: 'qa2a-b008', p_roster_override: null })
  const day1 = e1.data
  A.ok(day1?.ok === true, 'day-1 crews generated from live roster', brief({ ok: day1?.ok, code: day1?.code, size: day1?.crews?.length }))
  const membersDay1 = (day1?.crews ?? []).flatMap((c) => c.members.map((m) => m.player_id))
  const late = await cohort.makePlayer('crewlate', ['drinkit'])
  const e2 = await svc.rpc('dev_ensure_bar_bounty_crews_at', { p_at_utc: at, p_seed: 'other-seed', p_roster_override: null })
  const membersDay1b = (e2.data?.crews ?? []).flatMap((c) => c.members.map((m) => m.player_id))
  A.ok(e2.data?.idempotent === true && JSON.stringify([...membersDay1].sort()) === JSON.stringify([...membersDay1b].sort()), 'crews are LOCKED for the day (idempotent re-ensure ignores new seed/roster)', brief({ idempotent: e2.data?.idempotent, generated: e2.data?.generated }))
  const lateAssigned = membersDay1b.includes(late)
  A.ok(!lateAssigned, 'late-added player is NOT assigned to a crew for the locked day (live consequence of roster add mid-day)', { late, assigned: lateAssigned })
  // crew member deactivated after lock
  const victim = membersDay1[0]
  await svc.from('players').update({ active: false }).eq('id', victim)
  const e3 = await svc.rpc('dev_ensure_bar_bounty_crews_at', { p_at_utc: at, p_seed: 'x', p_roster_override: null })
  const still = (e3.data?.crews ?? []).some((c) => c.members.some((m) => m.player_id === victim))
  A.ok(still, 'deactivated player remains in the locked crew (crewmates keep a dead mate)', { victim, still })
  const day = e1.data?.cruise_day ?? 1
  const mates = await svc.rpc('bar_bounty_crew_mate_ids', { p_cruise_config_id: day1?.cruise_config_id, p_day_number: day, p_player_id: membersDay1[1] })
  A.ok((mates.data ?? []).length >= 2, 'bar_bounty_crew_mate_ids unchanged by roster changes', mates.data?.length)
  proof('QA3A-B008', 'QA3A-B008-crew-day-lock', A.pass ? 'PASS' : 'FAIL', {
    summary: 'bar bounty day crews lock after first ensure: late joins unassigned, deactivated members retained (design; ops consequence)',
    assertions: A.list,
    db: { crew_days_before: crewsBefore, crew_days_after: Number(sql('select count(*) from bar_bounty_crew_days')), crew_members: Number(sql('select count(*) from bar_bounty_crew_members')) },
  })
  await cohort.cleanup()
  await svc.from('players').update({ active: true }).eq('id', victim)
}

// ═══════════════════════════ LIVE-CLOCK phase: B008 mutating read, ADM-003, B010 ═══════════════════════════
async function phaseLive() {
  await cohort.adopt()
  await cohort.cleanup()
  await liveClock(async ({ shipDate, offset }) => {
    const clock = await svc.rpc('dev_get_ship_clock_state_at', { p_at_utc: new Date().toISOString() })
    // ---- B008: admin_list_bar_bounty_crews is a mutating read ----
    {
      const A = new Asserts()
      const roster0 = Number(sql("select count(*) from players p join game_memberships g on g.player_id=p.id where g.game='drinkit' and g.enabled and p.active"))
      for (let i = roster0; i < 8; i += 1) await cohort.makePlayer(`livecrew${i}`, ['drinkit'])
      const before = { crew_days: Number(sql('select count(*) from bar_bounty_crew_days')), crews: Number(sql('select count(*) from bar_bounty_crews')) }
      const r1 = await admin.rpc('admin_list_bar_bounty_crews')
      const mid = { crew_days: Number(sql('select count(*) from bar_bounty_crew_days')), crews: Number(sql('select count(*) from bar_bounty_crews')) }
      const late = await cohort.makePlayer('livecrewlate', ['drinkit'])
      const r2 = await admin.rpc('admin_list_bar_bounty_crews')
      const ids2 = (r2.data?.crews ?? []).flatMap((c) => c.members.map((m) => m.player_id))
      const after = { crew_days: Number(sql('select count(*) from bar_bounty_crew_days')), crews: Number(sql('select count(*) from bar_bounty_crews')) }
      A.ok(r1.data?.ok === true, 'live admin_list_bar_bounty_crews returns crews at real clock', brief({ ok: r1.data?.ok, code: r1.data?.code, reason: r1.data?.reason, clock: clock.data?.lifecycle }))
      const mutating = r1.data?.ok === true && mid.crew_days === before.crew_days + 1
      A.ok(mutating, 'READ RPC created bar_bounty_crew_days/crews rows (mutating read confirmed)', { before, mid })
      A.ok(r2.data?.ok === true && !ids2.includes(late) && after.crew_days === mid.crew_days, 'second admin read after roster change returns locked crews; late joiner excluded', { after })
      if (mutating) {
        defect('INT-CRW-001', 'P2', 'admin_list_bar_bounty_crews (opening Admin Drink It!) generates and permanently locks the day\'s crews', {
          qa3a_ref: 'QA3A-B008',
          risk_ref: 'RISK-ADM-B',
          observed: `crew_days ${before.crew_days}→${mid.crew_days}, crews ${before.crews}→${mid.crews} after a read-named RPC; players added afterwards (late) are not assigned`,
          impact: 'An admin merely opening the tab before roster edits freezes the roster-of-the-day; any later add/deactivate is ignored until next day.',
          evidence: { before, mid, after },
        })
      }
      proof('QA3A-B008', 'QA3A-B008-admin-list-crews-mutating-read', mutating ? 'FAIL' : A.pass ? 'PASS' : 'INFO', { summary: 'live admin_list_bar_bounty_crews: before/after DB + late-join lock', assertions: A.list, db_before: before, db_mid: mid, db_after: after })
      bFinal('QA3A-B008')
    }

    // ---- ADM-003: ambiguous 502 after the skip applied (real frontend lib + live backend) ----
    {
      const A = new Asserts()
      const fe = SUPA.supabase
      await fe.auth.signInWithPassword({ email: ADMIN_ID.login_alias, password: PASSWORD })
      const cur = currentOffers().find((o) => o.category === 'cocktail')
      const skipsBefore = Number(sql('select count(*) from admin_bounty_skip_requests'))
      const offerBefore = cur.offer_id
      const reqId = randomUUID()
      fetchHook = async (url, _init, forward) => {
        if (url.includes('/rpc/admin_skip_current_bounty')) {
          await forward() // backend APPLIES the skip …
          return new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }) // … but the response is lost
        }
        return forward()
      }
      let res
      try {
        res = await SKIP.applyBountySkip('cocktail', offerBefore, reqId)
      } finally {
        fetchHook = null
      }
      const afterOffer = currentOffers().find((o) => o.category === 'cocktail')
      const skipsAfter = Number(sql('select count(*) from admin_bounty_skip_requests'))
      const ledger = await admin.rpc('admin_find_bounty_skip_request_by_id', { p_client_request_id: reqId })
      A.ok(skipsAfter === skipsBefore + 1 && afterOffer.offer_id !== offerBefore, 'backend APPLIED the skip (current offer changed, ledger row +1)', { offerBefore, offerAfter: afterOffer.offer_id })
      A.ok(res.status === 'unknown', 'frontend classifies a 502 as unknown (pending retained for reconcile)', { status: res.status, message: res.message })
      // double-skip safety: a NEW request id with the OLD expected offer must be rejected
      const dbl = await admin.rpc('admin_skip_current_bounty', { p_category: 'cocktail', p_expected_offer_id: offerBefore, p_client_request_id: randomUUID() })
      const skipsAfter2 = Number(sql('select count(*) from admin_bounty_skip_requests'))
      A.ok(dbl.data?.ok === false && /STALE/.test(dbl.data?.code ?? '') && skipsAfter2 === skipsAfter, 'backend refuses a double skip with the stale expected_offer (new request id)', brief(dbl.data))
      const reconciled = await SKIP.reconcileBountySkip(reqId, 'cocktail', offerBefore)
      A.ok(reconciled.status === 'ok', 'reconcile by request id recovers the applied skip', { status: reconciled.status })
      ADM_MATRIX['ADM-003'] = {
        backend_impact: 'None — skip is idempotent by request id and rejects stale expected_offer_id (no double skip).',
        frontend_impact: 'applyBountySkip classifies gateway 502/Bad Gateway as failed (isTransportOrUnknown regex) → UI clears pending though skip applied; reconcile path is bypassed.',
        reproduced_live: res.status === 'failed',
        lib_result: { status: res.status, message: res.message, code: res.code },
        db_before: { skip_requests: skipsBefore, current_offer: offerBefore },
        db_after: { skip_requests: skipsAfter, current_offer: afterOffer.offer_id },
        ledger: ledger.data ?? null,
      }
      if (res.status === 'failed') {
        defect('INT-ADM-003L', 'P1', 'ADM-003 live: gateway 502 after a successfully applied skip is reported as failed by the real client', {
          adm_ref: 'ADM-003',
          observed: `lib status=${res.status} message="${res.message}"; DB shows skip applied (offer ${offerBefore} → ${afterOffer.offer_id}) and ledger row present`,
          impact: 'Admin sees a hard failure and the pending lock is cleared although the bounty was skipped; reconcile-by-request-id is not offered.',
        })
      }
      proof('ADM-003', 'ADM-003-live-502-after-applied-skip', res.status === 'failed' ? 'FAIL' : A.pass ? 'PASS' : 'FAIL', { summary: 'real applyBountySkip + live backend + forged 502 after apply', assertions: A.list, matrix: ADM_MATRIX['ADM-003'] })
      await fe.auth.signOut()
    }

    // ---- B010: aborted semantics (skip / void / pause) ----
    {
      const results = { skip: [], void: [], pause: [] }
      const abortAfter = [0, 4, 25]
      const A = new Asserts()
      for (const ms of abortAfter) {
        const cur = currentOffers().find((o) => o.category === 'cocktail')
        const reqId = randomUUID()
        const ctrl = new AbortController()
        setTimeout(() => ctrl.abort(), ms)
        const before = Number(sql('select count(*) from admin_bounty_skip_requests'))
        const r = await admin.rpc('admin_skip_current_bounty', { p_category: 'cocktail', p_expected_offer_id: cur.offer_id, p_client_request_id: reqId }).abortSignal(ctrl.signal)
        await sleep(1200)
        const ledger = await admin.rpc('admin_find_bounty_skip_request_by_id', { p_client_request_id: reqId })
        const applied = Boolean(ledger.data)
        const mid = Number(sql('select count(*) from admin_bounty_skip_requests'))
        const retry = await admin.rpc('admin_skip_current_bounty', { p_category: 'cocktail', p_expected_offer_id: cur.offer_id, p_client_request_id: reqId })
        const after = Number(sql('select count(*) from admin_bounty_skip_requests'))
        results.skip.push({ abort_ms: ms, client_error: r.error?.message ?? null, server_applied: applied, retry_ok: retry.data?.ok, retry_replay: retry.data?.idempotent_replay ?? null, ledger_rows: { before, after_abort: mid, after_retry: after } })
        A.ok(after === before + 1, `skip abort@${ms}ms: exactly one skip after reconcile-by-retry (applied=${applied})`, results.skip.at(-1))
      }
      // void
      const author = identity('drink_only').player_id
      for (const ms of abortAfter) {
        const p = await L.submitAt(svc, author, L.drinkPayload({ barKey: 'wake-view', mode: 'generic_beer' }), new Date().toISOString())
        const subId = p.data?.submission_id
        if (!subId) {
          results.void.push({ abort_ms: ms, setup_error: brief(p.data ?? p.error) })
          continue
        }
        const reqId = randomUUID()
        const ctrl = new AbortController()
        setTimeout(() => ctrl.abort(), ms)
        const r = await admin.rpc('admin_void_submission', { p_client_request_id: reqId, p_submission_id: subId, p_expected_status: 'accepted', p_reason: 'qa2a abort probe' }).abortSignal(ctrl.signal)
        await sleep(1200)
        const found = await admin.rpc('admin_find_void_request_by_id', { p_client_request_id: reqId })
        const retry = await admin.rpc('admin_void_submission', { p_client_request_id: reqId, p_submission_id: subId, p_expected_status: 'accepted', p_reason: 'qa2a abort probe' })
        const status = sql(`select status from submissions where id='${subId}'`)
        results.void.push({ abort_ms: ms, client_error: r.error?.message ?? null, server_applied: Boolean(found.data), retry: { ok: retry.data?.ok, code: retry.data?.code, replay: retry.data?.idempotent_replay }, final_status: status })
        A.ok(status === 'voided' && retry.data?.ok !== undefined, `void abort@${ms}ms: final submission status voided exactly once`, results.void.at(-1))
      }
      // pause
      for (const ms of abortAfter.slice(0, 2)) {
        const reqId = randomUUID()
        const ctrl = new AbortController()
        setTimeout(() => ctrl.abort(), ms)
        const r = await admin.rpc('admin_set_drinkit_paused', { p_paused: true, p_client_request_id: reqId }).abortSignal(ctrl.signal)
        await sleep(1200)
        const found = await admin.rpc('admin_find_drinkit_pause_request_by_id', { p_client_request_id: reqId })
        const statusAfterAbort = sql("select status from game_control where game='drinkit'")
        const retry = await admin.rpc('admin_set_drinkit_paused', { p_paused: true, p_client_request_id: reqId })
        const unpause = await admin.rpc('admin_set_drinkit_paused', { p_paused: false, p_client_request_id: randomUUID() })
        const final = sql("select status from game_control where game='drinkit'")
        results.pause.push({ abort_ms: ms, client_error: r.error?.message ?? null, server_applied: Boolean(found.data), status_after_abort: statusAfterAbort, retry: { ok: retry.data?.ok, code: retry.data?.code }, unpause_ok: unpause.data?.ok ?? unpause.data?.code, final_status: final })
        A.ok(final === 'active', `pause abort@${ms}ms: recoverable to active`, results.pause.at(-1))
      }
      const applied = [...results.skip, ...results.void, ...results.pause].filter((x) => x.server_applied).length
      const total = [...results.skip, ...results.void, ...results.pause].length
      proof('QA3A-B010', 'QA3A-B010-aborted-semantics', A.pass ? 'PASS' : 'FAIL', {
        summary: `client abort → server outcome is durable & reconcilable (server applied ${applied}/${total} aborted calls; retry/reconcile never double-applied)`,
        assertions: A.list,
        trials: results,
        note: 'abort via AbortController on supabase-js rpc; server-side ledgers (skip/void/pause) keyed by client_request_id make retry idempotent',
      })
      bFinal('QA3A-B010')
    }
  })
}

// ═══════════════════════════ QA3A-B009 + ADM-001/002 (Edge roster + real frontend lib) ═══════════════════════════
async function phaseB009() {
  const created = { playerIds: [], authIds: [], ledger: [], aliases: [] }
  const fe = SUPA.supabase
  try {
    await resetBaseline('b009')
    await fe.auth.signInWithPassword({ email: ADMIN_ID.login_alias, password: PASSWORD })
    const A = new Asserts()
    const tok = randomUUID().slice(0, 6)
    const aliasFor = (name) => `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')}@star-princess.local`
    const players0 = Number(sql('select count(*) from players'))
    // (a) control: real createPlayer → Edge → ok; reconcile ok
    const nameA = `QA2A Int Edge ${tok}`
    const idA = randomUUID()
    created.aliases.push(aliasFor(nameA))
    const ra = await ROSTER.createPlayer({ clientRequestId: idA, displayName: nameA, password: PASSWORD, drinkitEnabled: true, shipitEnabled: false, teamId: null })
    created.ledger.push(idA)
    if (ra.result?.player_id) created.playerIds.push(ra.result.player_id)
    const ledA = await ROSTER.reconcileAuthRequest(idA)
    A.ok(ra.status === 'ok', 'Edge create_player ok via real lib', brief({ status: ra.status, message: ra.message, code: ra.code }))
    A.ok(ledA.status === 'ok', 'reconcileAuthRequest after completion → ok (control)', ledA.status)
    A.ok(Number(sql('select count(*) from players')) === players0 + 1, 'players +1', { before: players0 })
    const rosterRows = await admin.rpc('admin_list_roster')
    const visible = (rosterRows.data ?? []).some((r) => r.player_id === ra.result?.player_id || r.id === ra.result?.player_id)
    A.ok(true, `admin_list_roster visibility of newly created non-demo player = ${visible}`, { roster_len: rosterRows.data?.length, visible })

    // (b) ADM-001: ledger row in_progress (durable reservation, no worker) → real reconcile → expect unknown
    const nameB = `QA2A Int Inflight ${tok}`
    const aliasB = aliasFor(nameB)
    created.aliases.push(aliasB)
    const idB = randomUUID()
    const fp = ['create_player', nameB.trim().toLowerCase(), aliasB.trim().toLowerCase(), 'true', 'false', ''].join('|')
    const reserve = await svc.rpc('admin_roster_auth_begin', { p_client_request_id: idB, p_action: 'create_player', p_fingerprint: fp, p_actor_id: ADMIN_ID.player_id, p_player_id: null, p_login_alias: aliasB })
    created.ledger.push(idB)
    const row = () => sqlJson(`select coalesce((select row_to_json(r) from (select status, result_json, lease_expires_at_utc is not null has_lease from admin_roster_auth_requests where client_request_id='${idB}') r), 'null'::json)`)
    const dbBefore = { ledger: row(), players: Number(sql('select count(*) from players')) }
    A.ok(reserve.data?.reserved === true, 'durable in_progress reservation created (simulates Auth work in flight)', brief(reserve.data))
    const raw = await admin.rpc('admin_find_roster_auth_request_by_id', { p_client_request_id: idB })
    const rec1 = await ROSTER.reconcileAuthRequest(idB)
    const adm001 = rec1.status === 'failed'
    A.ok(raw.data?.status === 'in_progress' && raw.data?.ok === undefined, 'backend ledger shape for in-flight request: {status:in_progress} with no ok flag', brief(raw.data))
    A.ok(rec1.status === 'unknown', 'ADM-001: Check Status during in_progress must stay unknown', { lib_status: rec1.status, message: rec1.message, code: rec1.code })
    ADM_MATRIX['ADM-001'] = {
      backend_impact: 'Backend correct: durable in_progress ledger row (lease 120s), find RPC returns {status:in_progress} without ok; Edge replays/blocks other workers.',
      frontend_impact: 'reconcileLedger → asFailed(no ok) → failed → pending lock cleared while Auth provisioning may still complete.',
      reproduced_live: adm001,
      lib_result: { status: rec1.status, code: rec1.code, message: rec1.message },
      backend_ledger: raw.data,
      db_before: dbBefore,
      db_after: { ledger: row(), players: Number(sql('select count(*) from players')) },
    }
    if (adm001) {
      defect('INT-ADM-001L', 'P1', 'ADM-001 live: real reconcileAuthRequest reports failed for a durable in_progress roster ledger row', {
        adm_ref: 'ADM-001',
        observed: `admin_find_roster_auth_request_by_id → ${brief(raw.data, 300)}; lib status=${rec1.status}`,
        impact: 'Admin clears pending + re-submits while the first request may still create the Auth user (duplicate/orphan risk mitigated only by Edge alias/lease checks).',
      })
    }
    proof('B009', 'ADM-001-live-in-progress-check-status', adm001 ? 'FAIL' : A.pass ? 'PASS' : 'FAIL', { summary: 'real lib reconcileAuthRequest vs real in_progress ledger row', assertions: A.list.slice(-2), matrix: ADM_MATRIX['ADM-001'] })

    // (c) ADM-002: same request id via real Edge while reservation is in_progress → 409 OPERATION_IN_PROGRESS
    const t0 = Date.now()
    const rc = await ROSTER.createPlayer({ clientRequestId: idB, displayName: nameB, password: PASSWORD, drinkitEnabled: true, shipitEnabled: false, teamId: null })
    const edgeMs = Date.now() - t0
    const dbAfterC = { ledger: row(), players: Number(sql('select count(*) from players')), alias_player: sql(`select count(*) from players where login_alias='${aliasB}'`) }
    // also raw HTTP to capture status/body
    const sess = (await admin.auth.getSession()).data.session
    const rawEdge = await realFetch(`${API_URL}/functions/v1/admin-roster`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sess.access_token}`, apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_player', client_request_id: idB, display_name: nameB, password: PASSWORD, drinkit_enabled: true, shipit_enabled: false, team_id: null }),
    })
    const rawEdgeBody = await rawEdge.json().catch(() => null)
    const adm002 = rc.status === 'failed'
    A.ok(rawEdge.status === 409 && rawEdgeBody?.code === 'OPERATION_IN_PROGRESS', 'Edge returns 409 OPERATION_IN_PROGRESS for an in-flight request id', { status: rawEdge.status, body: rawEdgeBody })
    A.ok(rc.status === 'unknown', 'ADM-002: 409 OPERATION_IN_PROGRESS must map to unknown', { lib_status: rc.status, code: rc.code, ms: edgeMs })
    A.ok(dbAfterC.alias_player === '0', 'no player/Auth created by the blocked call (DB before/after)', dbAfterC)
    ADM_MATRIX['ADM-002'] = {
      backend_impact: 'Backend correct: only the reserved worker may call Auth; other callers wait ~1.2s then get 409 OPERATION_IN_PROGRESS; no duplicate Auth user/player.',
      frontend_impact: 'invokeRoster maps any 4xx JSON body → asFailed → failed; pending cleared although request is still in progress.',
      reproduced_live: adm002,
      lib_result: { status: rc.status, code: rc.code, message: rc.message },
      edge_http: { status: rawEdge.status, body: rawEdgeBody },
      db_before: dbBefore,
      db_after: dbAfterC,
    }
    if (adm002) {
      defect('INT-ADM-002L', 'P1', 'ADM-002 live: real createPlayer maps Edge 409 OPERATION_IN_PROGRESS to failed', {
        adm_ref: 'ADM-002',
        observed: `Edge 409 ${brief(rawEdgeBody, 200)}; lib status=${rc.status}`,
        impact: 'Same as ADM-001: pending cleared during legitimately in-flight create.',
      })
    }
    proof('B009', 'ADM-002-live-409-operation-in-progress', adm002 ? 'FAIL' : A.pass ? 'PASS' : 'FAIL', { summary: 'real createPlayer → real Edge function while ledger in_progress', assertions: A.list.slice(-3), matrix: ADM_MATRIX['ADM-002'] })

    // (d) lease expiry: after expiry the same request id is reclaimable (recovery path)
    await sql(`update admin_roster_auth_requests set lease_expires_at_utc = clock_timestamp() - interval '1 second' where client_request_id='${idB}'`)
    const rd = await ROSTER.createPlayer({ clientRequestId: idB, displayName: nameB, password: PASSWORD, drinkitEnabled: true, shipitEnabled: false, teamId: null })
    if (rd.result?.player_id) created.playerIds.push(rd.result.player_id)
    const Ad = new Asserts()
    Ad.ok(rd.status === 'ok', 'after lease expiry the same request id is reclaimed and completes', brief({ status: rd.status, code: rd.code, message: rd.message }))
    const recD = await ROSTER.reconcileAuthRequest(idB)
    Ad.ok(recD.status === 'ok', 'reconcile after completion ok', recD.status)
    proof('B009', 'B009-lease-expiry-recovery', Ad.pass ? 'PASS' : 'FAIL', { summary: 'lease expiry recovery for abandoned in_progress reservation', assertions: Ad.list })
    bFinal('QA3A-B009')
    B_STATUS['QA3A-B009'] = B_STATUS['B009']
    delete B_STATUS['B009']
    bFinal('QA3A-B009')
  } finally {
    for (const id of created.playerIds) {
      await svc.from('game_memberships').delete().eq('player_id', id)
      const { data: p } = await svc.from('players').select('auth_user_id').eq('id', id).maybeSingle()
      await svc.from('players').delete().eq('id', id)
      if (p?.auth_user_id) await svc.auth.admin.deleteUser(p.auth_user_id)
    }
    for (const alias of created.aliases) {
      const { data } = await svc.auth.admin.listUsers({ perPage: 1000 })
      const u = data?.users?.find((x) => x.email === alias)
      if (u) await svc.auth.admin.deleteUser(u.id)
      await svc.from('players').delete().eq('login_alias', alias)
    }
    if (created.ledger.length) await svc.from('admin_roster_auth_requests').delete().in('client_request_id', created.ledger)
    await fe.auth.signOut()
  }
}

// ═══════════════════════════ QA3A-B011 finale latch ═══════════════════════════
async function phaseB011() {
  await resetBaseline('b011')
  const A = new Asserts()
  const finale = sql("select finale_at_utc(c, now()) from cruise_config c where is_active").replace(' ', 'T').replace('+00', 'Z')
  const finaleMs = new Date(finale).getTime()
  const iso = (ms) => new Date(ms).toISOString()
  const latch = () => sql("select coalesce(finalized_at_utc::text,'null') from game_control where game='drinkit'")
  const before = { latch: latch(), finale }
  // read-only preview first (what the admin sees before confirming)
  const prev = await admin.rpc('admin_preview_manual_clock_correction', { p_delta_minutes: 60, p_at_utc: iso(finaleMs - 20 * 60000) })
  // the real "Set Ship Time" path: admin_apply_manual_clock_set to a ship-local time past the finale
  const shipFinale = sql("select to_char(finale_at_utc(c, now()) at time zone 'UTC' + make_interval(mins => c.base_ship_offset_minutes), 'YYYY-MM-DD\"T\"HH24:MI') from cruise_config c where is_active")
  const target = new Date(new Date(`${shipFinale}:00Z`).getTime() + 90 * 60000).toISOString().slice(0, 16)
  const reqId = randomUUID()
  const setRes = await admin.rpc('admin_apply_manual_clock_set', { p_target_ship_local: target, p_note: 'qa2a finale latch probe', p_at_utc: iso(finaleMs - 30 * 60000), p_client_request_id: reqId })
  const afterSet = latch()
  // evaluate at a time after the correction → lifecycle side effects
  const evalAfter = await svc.rpc('dev_evaluate_submission_acceptance_at', { p_game: 'drinkit', p_at_utc: iso(finaleMs - 29 * 60000), p_apply_lifecycle_side_effects: true })
  const afterEval = latch()
  // "move back": evaluate at day-1 noon → latch must remain
  const evalBack = await svc.rpc('dev_evaluate_submission_acceptance_at', { p_game: 'drinkit', p_at_utc: L.noonDay1Utc(), p_apply_lifecycle_side_effects: true })
  const afterBack = latch()
  const s = snap()
  A.ok(!setRes.error, 'admin_apply_manual_clock_set accepts a target past the finale (no server-side confirmation / refusal)', brief(setRes.error?.message ?? setRes.data, 400))
  A.ok(afterEval !== 'null' || afterSet !== 'null', 'finale latch (game_control.finalized_at_utc) set once effective time passes finale', { before: before.latch, after_set: afterSet, after_eval: afterEval })
  A.ok(afterBack !== 'null', 'latch stays set after evaluating an earlier (day-1) instant — not reversible via clock', { after_back: afterBack, code_back: evalBack.data?.code })
  // consequences
  const doc = variant()
  const st = await stageDoc(doc)
  const pv = await previewCand(st.candidateId)
  A.ok((pv.data?.blockers ?? []).some((b) => b.code === 'CATALOG_FINALE_PASSED'), 'catalog publish blocked after latch (CATALOG_FINALE_PASSED)', brief(pv.data?.blockers))
  const pubB = await publishCand(st.candidateId, st.hash)
  A.ok(pubB.data?.code === 'PUBLISH_BLOCKED' || pubB.data?.ok === false, 'publish rejected after latch', pubB.data?.code)
  const latched = afterBack !== 'null'
  if (latched) {
    defect('INT-CLK-001', 'P2', 'Set Ship Time past the finale irreversibly latches games; backend gives no refusal/confirmation (UI guard only)', {
      qa3a_ref: 'QA3A-B011',
      risk_ref: 'RISK-ADM-A',
      observed: `latch before=${before.latch} after=${afterBack}; set-time RPC returned ${setRes.error ? 'error' : 'ok'}; preview keys=${Object.keys(prev.data ?? {}).join(',')}`,
      impact: 'A mistyped ship time permanently ends the cruise for both games; only dev_seed or SQL can clear. Any guard lives in the Vue confirm dialog only.',
      note: 'Per assignment: UI guard only — Agent 1 owns the clock authority suite; this is a qa2-only observation.',
    })
  }
  proof('QA3A-B011', 'QA3A-B011-finale-latch', latched ? 'FAIL' : A.pass ? 'PASS' : 'FAIL', { summary: 'manual ship time past finale latches games irreversibly (qa2 only)', assertions: A.list, preview_keys: Object.keys(prev.data ?? {}), set_result: brief(setRes.data ?? setRes.error?.message, 600), db_before: before, db_after: { latch: afterBack, ...diffSnap(snap(), s) } })
  bFinal('QA3A-B011')
  await resetBaseline('b011-after') // dev_seed clears latch (not available in production)
}

// ═══════════════════════════ QA3A-B012 production schedule gap ═══════════════════════════
async function phaseB012() {
  const A = new Asserts()
  const procs = L.qa2Json(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') authenticated_exec, has_function_privilege('service_role', p.oid, 'execute') service_exec
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ilike '%bounty_schedule%' or p.proname ilike '%generate%schedule%' or p.proname ilike '%schedule_bounty%')`)
  const nonDev = procs.filter((p) => !p.proname.startsWith('dev_'))
  A.ok(procs.some((p) => p.proname === 'dev_generate_bounty_schedule'), 'dev_generate_bounty_schedule exists', procs)
  const adminCallable = procs.filter((p) => p.authenticated_exec && p.proname.includes('generate'))
  A.ok(adminCallable.length === 0, 'no authenticated/admin-callable schedule generator exists', adminCallable)
  const denied = await admin.rpc('dev_generate_bounty_schedule', { p_seed: 'qa2a-denied' })
  A.ok(Boolean(denied.error), 'admin JWT cannot call dev_generate_bounty_schedule (service_role only)', denied.error?.message)
  // fresh cruise with active catalog but NO schedule: publish does not create one
  await L.ensureActiveClock(svc)
  const catalog = B.buildScheduleReadyCatalog(80, 45)
  await svc.rpc('dev_activate_catalog_fixture', { p_payload: catalog })
  await svc.from('bounty_slots').delete().not('id', 'is', null).then(() => {}, () => {})
  const slots0 = Number(sql('select count(*) from bounty_slots'))
  const { pub } = await stageAndPublish(variant({ baseCatalogId: 'dev-fixture-schedule-ready-v1' }))
  const slots1 = Number(sql('select count(*) from bounty_slots'))
  const runs = Number(sql('select count(*) from bounty_schedule_runs'))
  A.ok(slots1 === 0 || slots0 === slots1, 'catalog publish alone does NOT generate a bounty schedule (rebinds existing slots only)', { slots_before: slots0, slots_after: slots1, runs, reassigned: pub.reassigned_slots })
  const cur = await svc.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: L.noonDay1Utc() })
  A.ok(true, 'player-facing current cocktail bounty without a schedule', brief(cur.data))
  const gap = nonDev.length === 0 && slots1 === 0
  if (gap) {
    defect('INT-SCHED-001', 'P1', 'No production path to create the first bounty schedule (only dev_generate_bounty_schedule, service_role)', {
      qa3a_ref: 'QA3A-B012',
      risk_ref: 'RISK-CAT-D',
      observed: `non-dev schedule RPCs: ${JSON.stringify(nonDev)}; slots after activate+publish=${slots1}; current cocktail bounty=${brief(cur.data, 200)}`,
      impact: 'Organizer cannot self-serve a launch: cruise_config → activate catalog → schedule needs service_role/dev tooling.',
    })
  }
  proof('QA3A-B012', 'QA3A-B012-production-schedule-gap', gap ? 'FAIL' : A.pass ? 'PASS' : 'FAIL', { summary: 'gap confirmed: no admin/prod schedule generator; publish never creates the first schedule', assertions: A.list, rpcs: procs })
  bFinal('QA3A-B012')
  await resetBaseline('b012-after')
}

// ═══════════════════════════ QA3A-B013 achievements across catalog replace ═══════════════════════════
const WAKE = 'wake-view'
function gauntletCatalog(catalogId, { eligibleCount, baseCatalogId, rename }) {
  const doc = B.cloneCatalog(B.buildScheduleReadyCatalog(80, 45))
  doc.catalog_id = catalogId
  doc.base_catalog_id = baseCatalogId ?? null
  doc.schema_version = '1.1'
  const cocktails = doc.drinks.filter((d) => d.kind === 'named_cocktail')
  for (let i = 0; i < eligibleCount; i += 1) {
    const d = cocktails[i]
    if (!d.bar_offerings.some((o) => o.bar_key === WAKE)) {
      d.bar_offerings.push({ bar_key: WAKE, ingredient_keys: ['lime-juice'], display_ingredients: ['Lime Juice'], price_usd: 12, price_status: 'verified_within_limit', evidence_reference: `qa2a-gauntlet-${d.key}` })
    }
  }
  const keep = new Set(cocktails.slice(0, eligibleCount).map((d) => d.key))
  for (const d of cocktails) {
    for (const o of d.bar_offerings) {
      if (o.bar_key !== WAKE) continue
      o.classification_tags = keep.has(d.key) ? (o.classification_tags ?? []).filter((t) => t !== 'collection-excluded') : [...new Set([...(o.classification_tags ?? []), 'collection-excluded'])]
    }
  }
  if (rename) {
    const d = doc.drinks.find((x) => x.key === rename.key)
    if (d) d.name = rename.name
  }
  return doc
}
const wakeKeys = (doc) => doc.drinks.filter((d) => d.kind === 'named_cocktail' && d.bar_offerings.some((o) => o.bar_key === WAKE && o.price_status !== 'verified_over_limit' && !(o.classification_tags ?? []).includes('collection-excluded'))).map((d) => d.key)
async function phaseB013() {
  await resetBaseline('b013')
  await cohort.adopt()
  await cohort.cleanup()
  const A = new Asserts()
  const author = await cohort.makePlayer('b013a', ['drinkit'])
  const partner = await cohort.makePlayer('b013b', ['drinkit'])
  const status = async (defId, owner) => L.collectionStatus(svc, defId, owner)
  const insertCollection = (extra = {}) => cohort.insertDef('b013-collection', 'offering_collection', { bar_key: WAKE, ...extra })
  const logNamed = async (player, offeringId, at) => {
    await L.exposeSlots(svc, at)
    return L.submitAt(svc, player, L.drinkPayload({ barKey: WAKE, offeringId }), at)
  }
  const v1Id = H.uniqueCatalogId('qa2a-b013-v1')
  const v1Doc = gauntletCatalog(v1Id, { eligibleCount: 11 })
  const v1Keys = wakeKeys(v1Doc)
  const p1 = await stageAndPublish(v1Doc)
  const versionA = p1.pub.catalog_version_id
  const personal = await insertCollection()
  const collective = await insertCollection({ scope: 'collective' })
  const idsV1 = {}
  for (const k of v1Keys) idsV1[k] = (await L.lookupOffering(svc, WAKE, k)).offering_id
  const logged = v1Keys.slice(0, 8)
  const okLogs = []
  for (let i = 0; i < logged.length; i += 1) {
    const r = await logNamed(author, idsV1[logged[i]], L.slotUtc(1, `12:${String(i).padStart(2, '0')}:00`))
    okLogs.push(r.data?.ok === true)
  }
  const mid = await status(personal, author)
  A.ok(okLogs.every(Boolean) && mid.live_target === 11 && mid.live_current === 8 && mid.earned === false, 'baseline progress 8/11 before replace', { okLogs, mid: { t: mid.live_target, c: mid.live_current, e: mid.earned } })
  const awardsBefore = Number(sql(`select count(*) from achievement_awards where owner_player_id='${author}'`))
  const claimsBefore = Number(sql(`select count(*) from bounty_claims where player_id='${author}'`))
  const subsBefore = Number(sql(`select count(*) from submissions where author_player_id='${author}'`))
  const v2Id = H.uniqueCatalogId('qa2a-b013-v2')
  const v2Doc = gauntletCatalog(v2Id, { eligibleCount: 13, baseCatalogId: v1Id, rename: { key: logged[0], name: 'Lorem Renamed Cocktail' } })
  const p2 = await stageAndPublish(v2Doc, { expected: versionA })
  const after = await status(personal, author)
  const idsV2 = {}
  for (const k of v1Keys) idsV2[k] = (await L.lookupOffering(svc, WAKE, k)).offering_id
  A.ok(JSON.stringify(idsV1) === JSON.stringify(idsV2), 'bar_offerings ids stable across publish', { n: v1Keys.length })
  A.ok(after.live_target === 13 && after.live_current === 8 && after.earned === false, 'progress carried 8/11 → 8/13 after replace', { t: after.live_target, c: after.live_current })
  const collAfter = await status(collective, author)
  A.ok(collAfter.live_target === 13 && collAfter.live_current === 8, 'collective definition progress carried', { t: collAfter.live_target, c: collAfter.live_current })
  A.ok(Number(sql(`select count(*) from submissions where author_player_id='${author}'`)) === subsBefore && Number(sql(`select count(*) from bounty_claims where player_id='${author}'`)) === claimsBefore && Number(sql(`select count(*) from achievement_awards where owner_player_id='${author}'`)) === awardsBefore, 'no submissions/claims/awards lost across publish (before/after counts)', { subsBefore, claimsBefore, awardsBefore })
  // key change = new identity (explicit semantic)
  const v3Id = H.uniqueCatalogId('qa2a-b013-v3')
  const v3Doc = B.cloneCatalog(v2Doc)
  v3Doc.catalog_id = v3Id
  v3Doc.base_catalog_id = v2Id
  const rd = v3Doc.drinks.find((d) => d.key === logged[1])
  rd.key = `renamed-${logged[1]}`
  for (const c of v3Doc.cocktail_candidates) if (c.drink_key === logged[1]) c.drink_key = rd.key
  await stageAndPublish(v3Doc, { expected: p2.pub.catalog_version_id })
  const keyChange = await status(personal, author)
  A.ok(keyChange.live_current === 7, 'explicit key change creates a new identity (8 → 7, no fuzzy merge)', { c: keyChange.live_current })
  // completed award retained across expansion + exclusion
  await resetBaseline('b013c')
  await cohort.adopt()
  await cohort.cleanup()
  const a2 = await cohort.makePlayer('b013c', ['drinkit'])
  const b2 = await cohort.makePlayer('b013d', ['drinkit'])
  const w1Id = H.uniqueCatalogId('qa2a-b013c-v1')
  const w1Doc = gauntletCatalog(w1Id, { eligibleCount: 11 })
  const w1Keys = wakeKeys(w1Doc)
  const q1 = await stageAndPublish(w1Doc)
  const pDef = await insertCollection()
  const cDef = await insertCollection({ scope: 'collective' })
  const ids = {}
  for (const k of w1Keys) ids[k] = (await L.lookupOffering(svc, WAKE, k)).offering_id
  for (let i = 0; i < w1Keys.length; i += 1) await logNamed(a2, ids[w1Keys[i]], L.slotUtc(1, `13:${String(i).padStart(2, '0')}:00`))
  await logNamed(b2, ids[w1Keys[0]], L.slotUtc(1, '14:00:00'))
  const earned = await status(pDef, a2)
  const earnedC = await status(cDef, a2)
  A.ok(earned.earned === true && earnedC.earned === true, 'completed 11/11 personal + collective awards earned', { p: earned.earned, c: earnedC.earned })
  const w2Doc = gauntletCatalog(H.uniqueCatalogId('qa2a-b013c-v2'), { eligibleCount: 13, baseCatalogId: w1Id })
  const q2 = await stageAndPublish(w2Doc, { expected: q1.pub.catalog_version_id })
  const earned2 = await status(pDef, a2)
  A.ok(earned2.award_id === earned.award_id && earned2.earned === true && earned2.live_target === 13 && earned2.pin_covered === true, 'completed award retained after menu expands 11 → 13', { award_same: earned2.award_id === earned.award_id, target: earned2.live_target })
  const dropKey = w1Keys.at(-1)
  const w3Doc = B.cloneCatalog(w2Doc)
  w3Doc.catalog_id = H.uniqueCatalogId('qa2a-b013c-v3')
  w3Doc.base_catalog_id = w2Doc.catalog_id
  for (const d of w3Doc.drinks) if (d.key === dropKey) for (const o of d.bar_offerings) if (o.bar_key === WAKE) o.classification_tags = [...new Set([...(o.classification_tags ?? []), 'collection-excluded'])]
  await stageAndPublish(w3Doc, { expected: q2.pub.catalog_version_id })
  const earned3 = await status(pDef, a2)
  A.ok(earned3.award_id === earned.award_id && earned3.pin_covered === true && earned3.live_target === 12, 'earned pin holds after an original offering is excluded (12 target)', { target: earned3.live_target })
  proof('QA3A-B013', 'QA3A-B013-achievement-progress-across-replace', A.pass ? 'PASS' : 'FAIL', { summary: 'collection progress + earned awards survive full admin publish replacement', assertions: A.list })
  bFinal('QA3A-B013')
  await cohort.cleanup()
  await L.sweepAwardsSince(svc, STARTED_AT)
}

// ═══════════════════════════ QA3A-B014 organizer sacred ═══════════════════════════
async function phaseB014() {
  const now = L.organizerCruiseId()
  proof('QA3A-B014', 'QA3A-B014-organizer-sacred', 'BLOCKED', {
    summary: 'organizer production cruise_config / roster / teams / active catalog are out of scope for Agent 2 (read-only cruise-id check only)',
    reason: 'SAFETY: never mutate :54321 organizer or :55321 Agent1; no organizer snapshot approval given',
    organizer_cruise_id_read_only: { before: ORG_BEFORE, now, expected: L.ORGANIZER_CRUISE_EXPECTED, unchanged: ORG_BEFORE === now },
  })
  bFinal('QA3A-B014', 'BLOCKED')
}

// ═══════════════════════════ CATX: exhaustive catalog ═══════════════════════════
async function phaseCATX() {
  await resetBaseline('catx')
  const A = new Asserts()
  const v1 = pointerId()
  const s0 = snap()
  // --- valid replacement: stage, preview, activate, verify pointer, candidates, rarity
  const doc = variant({ baseCatalogId: 'dev-fixture-schedule-ready-v1', cocktailCount: 85, ingredientCount: 45 })
  const st = await stageDoc(doc)
  const pv = await previewCand(st.candidateId)
  A.ok(st.data?.ok && pv.data?.safe_to_publish, 'valid replacement staged + preview safe', brief({ pool: st.data?.pool, diff_keys: Object.keys(pv.data?.diff ?? {}) }))
  A.ok(pv.data?.diff?.cocktail_candidates?.added_count !== undefined && pv.data?.diff?.offerings && pv.data?.schedule?.available_pool, 'preview exposes diff + schedule availability', brief({ added: pv.data?.diff?.cocktail_candidates?.added_count, pool: pv.data?.schedule?.available_pool }))
  const pub = await publishCand(st.candidateId, st.hash)
  const v2 = pub.data?.catalog_version_id
  A.ok(pub.data?.ok && pointerId() === v2, 'activation moved the pointer', brief(pub.data?.reassigned_slots))
  const cc = sqlJson(`select json_build_object('total', count(*), 'eligible', count(*) filter (where eligible), 'tiers', (select coalesce(json_object_agg(tier, n), '{}'::json) from (select tier, count(*) n from cocktail_candidates where catalog_version_id='${v2}' group by 1) t)) from cocktail_candidates where catalog_version_id='${v2}'`)
  A.ok(cc.total === 85 && cc.eligible === 85, 'cocktail bounty candidates queryable on new version (85 eligible)', cc)
  const ic = sqlJson(`select json_build_object('total', count(*), 'eligible', count(*) filter (where eligible)) from ingredient_candidates where catalog_version_id='${v2}'`)
  A.ok(ic.total === 45 && ic.eligible === 45, 'ingredient candidates queryable (45 eligible)', ic)
  // rarity: declared known_bar_count vs actual distinct active-bar named-cocktail coverage
  const rarity = L.qa2Json(`select i.canonical_key, ic.tier, ic.known_bar_count declared,
      (select count(distinct bo.bar_id) from catalog_offering_ingredients coi join bar_offerings bo on bo.id=coi.offering_id join catalog_version_drink_concepts cvdc on cvdc.catalog_version_id=coi.catalog_version_id and cvdc.drink_concept_id=bo.drink_concept_id and cvdc.kind='named_cocktail'
        join catalog_version_bars cvb on cvb.catalog_version_id=coi.catalog_version_id and cvb.bar_id=bo.bar_id and cvb.active
        where coi.catalog_version_id=ic.catalog_version_id and coi.ingredient_id=ic.ingredient_id) actual
    from ingredient_candidates ic join ingredients i on i.id=ic.ingredient_id where ic.catalog_version_id='${v2}'`)
  const mismatch = rarity.filter((r) => Number(r.declared) !== Number(r.actual))
  A.ok(mismatch.length === 0, 'ingredient rarity: declared known_bar_count == actual corroborating bars (fixture-consistent)', { checked: rarity.length, mismatches: mismatch.slice(0, 3) })
  // MO relationships across publish
  const moVirtual = sql("select is_virtual from bars where canonical_key='mobile-order'")
  A.ok(moVirtual === 't', 'mobile-order bar remains virtual across publish', moVirtual)
  const player = await signIn('drink_only')
  const moList = await player.rpc('list_drinkit_mobile_order_drinks')
  A.ok(!moList.error && (moList.data ?? []).length > 0, 'Mobile Order drink list still served from new catalog', { n: moList.data?.length })
  // MO menu restriction carry-forward (verified-menu table is keyed by catalog_version_id)
  const concept = sql(`select drink_concept_id from catalog_version_drink_concepts where catalog_version_id='${v2}' limit 1`)
  await sql(`insert into mobile_order_menu_concepts (catalog_version_id, drink_concept_id, active) values ('${v2}', '${concept}', true)`)
  const restrictedBefore = sql(`select mobile_order_menu_is_restricted('${v2}')`)
  const moBefore = (await player.rpc('list_drinkit_mobile_order_drinks')).data?.length
  const pub2 = await stageAndPublish(variant({ baseCatalogId: doc.catalog_id, cocktailCount: 85, ingredientCount: 45 }), { expected: v2 })
  const v3 = pub2.pub.catalog_version_id
  const restrictedAfter = sql(`select mobile_order_menu_is_restricted('${v3}')`)
  const moAfter = (await player.rpc('list_drinkit_mobile_order_drinks')).data?.length
  A.ok(restrictedBefore === 't' && moBefore === 1, 'setup: verified Mobile Order menu restricts list to 1 concept', { restrictedBefore, moBefore })
  A.ok(restrictedAfter === 't', 'Mobile Order verified-menu restriction survives catalog publish', { restrictedAfter, moBefore, moAfter })
  if (restrictedAfter !== 't') {
    defect('INT-CAT-004', 'P2', 'catalog_publish_apply does not carry mobile_order_menu_concepts forward: a verified Mobile Order menu silently reverts to unrestricted search', {
      qa3a_ref: 'QA3A-B007',
      observed: `restricted(v2)=${restrictedBefore} list=${moBefore}; restricted(v3 after publish)=${restrictedAfter} list=${moAfter}`,
      impact: 'After any publish/rollback the guest Mobile Order picker widens from the verified OceanNow set to all concepts at physical bars.',
    })
  }
  await sql("delete from mobile_order_menu_concepts where true")
  // rollback after activation
  const rb = await rollbackTo(v1, v3)
  A.ok(rb.data?.ok === true, 'rollback after activation to the original version succeeds', brief(rb.data?.code))
  proof('QA3A-CATX', 'CATX-valid-replacement-lifecycle', A.pass ? 'PASS' : 'FAIL', { summary: 'stage → preview → activate → pointer → candidates/rarity → MO relationships → rollback', assertions: A.list, candidates: { cocktail: cc, ingredient: ic }, db_before: s0, db_after: snap() })

  // --- malformed / hostile inputs against the server (forged validation so server checks execute)
  await resetBaseline('catx2')
  const baseDoc = () => variant({ baseCatalogId: 'dev-fixture-schedule-ready-v1' })
  const mk = (name, fn) => ({ name, payload: (() => { const d = baseDoc(); const r = fn(d); return r === undefined ? d : r })() })
  const cases = [
    { name: 'null payload', payload: null },
    { name: 'array payload', payload: [] },
    { name: 'string payload', payload: 'x' },
    { name: 'number payload', payload: 7 },
    mk('missing bars', (d) => { delete d.bars }),
    mk('drinks null', (d) => { d.drinks = null }),
    mk('bars object not array', (d) => { d.bars = {} }),
    mk('schema 9.9', (d) => { d.schema_version = '9.9' }),
    mk('mode delta', (d) => { d.mode = 'delta' }),
    mk('catalog_id uppercase', (d) => { d.catalog_id = 'BAD ID' }),
    mk('catalog_id empty', (d) => { d.catalog_id = '' }),
    mk('catalog_id 200 chars', (d) => { d.catalog_id = 'a'.repeat(200) }),
    mk("catalog_id sql-ish", (d) => { d.catalog_id = "x'; drop table bars;--" }),
    mk('base_catalog_id self', (d) => { d.base_catalog_id = d.catalog_id }),
    mk('duplicate bar key', (d) => { d.bars.push({ ...d.bars[0] }) }),
    mk('duplicate drink key', (d) => { d.drinks.push({ ...d.drinks[0] }) }),
    mk('duplicate ingredient key', (d) => { d.ingredients.push({ ...d.ingredients[0] }) }),
    mk('offering unknown bar', (d) => { d.drinks[5].bar_offerings[0].bar_key = 'no-such-bar' }),
    mk('offering unknown ingredient', (d) => { d.drinks[5].bar_offerings[0].ingredient_keys = ['no-such-ing'] }),
    mk('candidate without offering', (d) => { d.cocktail_candidates.push({ drink_key: 'ghost', designated_bar_key: 'wake-view', tier: 'familiar', points: 25 }) }),
    mk('key format uppercase', (d) => { d.drinks[7].key = 'Bad_Key' }),
    mk('price string abc', (d) => { d.drinks.find((x) => x.key === 'fixture-cocktail-004').bar_offerings[0].price_usd = 'abc' }),
    mk('points string abc', (d) => { d.cocktail_candidates[3].points = 'abc' }),
    mk('points overflow 2^40', (d) => { d.cocktail_candidates[3].points = 2 ** 40 }),
    mk('negative price', (d) => { d.drinks.find((x) => x.key === 'fixture-cocktail-005').bar_offerings[0].price_usd = -5 }),
    mk('unknown top-level junk (100KB)', (d) => { d.x_junk = 'j'.repeat(100_000) }),
    mk('inactive designated bar', (d) => { d.cocktail_candidates.slice(0, 10).forEach((c) => { c.designated_bar_key = 'inactive-lounge' }) }),
    mk('classification tag invalid', (d) => { d.drinks[9].bar_offerings[0].classification_tags = ['not-a-real-tag'] }),
  ]
  const outcomes = []
  const candBefore = Number(sql('select count(*) from catalog_import_candidates'))
  for (const c of cases) {
    const before = snap()
    let data = null
    let err = null
    try {
      const r = await admin.rpc('admin_stage_catalog_import', { p_client_request_id: randomUUID(), p_payload: c.payload, p_validation: { readiness: 'ready_for_scheduling', error_count: 0 } })
      data = r.data
      err = r.error?.message ?? null
    } catch (e) {
      err = `THROWN ${e}`
    }
    const after = snap()
    const accepted = data?.ok === true
    outcomes.push({ case: c.name, accepted, code: data?.code ?? null, raw_error: err, structured: data && data.ok === false, core_unchanged: coreEqual(before, after) })
  }
  const accepted = outcomes.filter((o) => o.accepted)
  const rawErrors = outcomes.filter((o) => o.raw_error)
  const candAfter = Number(sql('select count(*) from catalog_import_candidates'))
  const A2 = new Asserts()
  A2.ok(outcomes.every((o) => o.core_unchanged), 'malformed stages never mutate versions/offers/pointer', outcomes.filter((o) => !o.core_unchanged))
  A2.ok(candAfter - candBefore === accepted.length, 'only accepted payloads created candidate rows (failed stages leave none)', { accepted: accepted.map((o) => o.case), delta: candAfter - candBefore })
  A2.ok(rawErrors.length === 0, 'every rejection is a structured {ok:false, code} (no raw RPC exceptions)', rawErrors.map((o) => ({ case: o.case, err: o.raw_error })))
  if (rawErrors.length) {
    defect('INT-CAT-007', 'P3', 'Stage returns raw Postgres/RPC exceptions (not structured codes) for malformed scalar types', {
      qa3a_ref: 'QA3A-CATX',
      observed: rawErrors.map((o) => `${o.case}: ${o.raw_error}`),
      impact: 'stageImport maps RPC errors to "unknown" (not failed); only reachable by bypassing the TS validator.',
    })
  }
  const unsafe = accepted.filter((o) => ['unknown top-level junk (100KB)', 'classification tag invalid'].includes(o.case) === false)
  A2.ok(unsafe.length === 0, 'no structurally invalid payload accepted by the server', unsafe)
  proof('QA3A-CATX', 'CATX-malformed-inputs', A2.pass ? 'PASS' : 'FAIL', { summary: `${cases.length} hostile payloads against admin_stage_catalog_import (forged validation)`, assertions: A2.list, outcomes })
  await svc.from('catalog_import_candidates').delete().not('id', 'is', null)
  bFinal('QA3A-CATX')
}

// ═══════════════════════════ ADM-004 / ADM-005 / ADM-006 / ADM-007 ═══════════════════════════
async function phaseADM() {
  await resetBaseline('adm')
  const fe = SUPA.supabase
  await fe.auth.signInWithPassword({ email: ADMIN_ID.login_alias, password: PASSWORD })
  const sBefore = snap()

  // ---- ADM-004: void error classification with the real lib
  {
    const A = new Asserts()
    const dbBefore = { submissions: Number(sql('select count(*) from submissions')), void_reqs: Number(sql('select count(*) from admin_void_requests')) }
    const malformed = await VOID.applyVoidSubmission({ clientRequestId: randomUUID(), submissionId: 'not-a-uuid', expectedStatus: 'accepted' })
    const notFound = await VOID.applyVoidSubmission({ clientRequestId: randomUUID(), submissionId: randomUUID(), expectedStatus: 'accepted' })
    // finale: latch then void
    await svc.from('game_control').update({ finalized_at_utc: new Date().toISOString() }).eq('game', 'drinkit')
    const finale = await VOID.applyVoidSubmission({ clientRequestId: randomUUID(), submissionId: randomUUID(), expectedStatus: 'accepted' })
    await svc.from('game_control').update({ finalized_at_utc: null }).eq('game', 'drinkit')
    const dbAfter = { submissions: Number(sql('select count(*) from submissions')), void_reqs: Number(sql('select count(*) from admin_void_requests')) }
    A.ok(notFound.status === 'failed' && notFound.code === 'not_found', 'valid-but-unknown UUID → failed/not_found (backend returns ok:false payload)', { status: notFound.status, code: notFound.code })
    A.ok(finale.status === 'failed' || finale.code === 'finale' || finale.status === 'unknown', 'finale-locked void classification recorded', { status: finale.status, code: finale.code, message: finale.message })
    A.ok(malformed.status === 'failed', 'ADM-004: deterministic RPC error (malformed UUID → 22P02) must be failed, not unknown', { status: malformed.status, message: malformed.message })
    const reproduced = malformed.status === 'unknown'
    ADM_MATRIX['ADM-004'] = {
      backend_impact: 'Backend returns ok:false {code:SUBMISSION_NOT_FOUND|FINALE_LOCKED} PAYLOADS for the documented deterministic cases (classified correctly by the client). Only RPC *errors* (e.g. malformed UUID pasted into the void box — RISK-ADM-D) hit the faulty unknown mapping.',
      frontend_impact: 'applyVoidSubmission returns unknown for every RPC error except ADMIN_REQUIRED → pending lock + Retry loop for a request that can never succeed.',
      reproduced_live: reproduced,
      lib_results: { malformed: { status: malformed.status, message: malformed.message }, not_found: { status: notFound.status, code: notFound.code }, finale: { status: finale.status, code: finale.code } },
      db_before: dbBefore,
      db_after: dbAfter,
      narrower_than_filed: true,
    }
    if (reproduced) {
      defect('INT-ADM-004L', 'P2', 'ADM-004 live (narrowed): malformed submission UUID yields unknown + Retry lock; documented FINALE_LOCKED/NOT_FOUND cases are payload-classified correctly', {
        adm_ref: 'ADM-004',
        observed: `malformed id → ${malformed.status} "${malformed.message}"; unknown UUID → ${notFound.status}/${notFound.code}; finale → ${finale.status}/${finale.code}`,
        impact: 'Reachable via pasted-UUID typo; the original FINALE_LOCKED/SUBMISSION_NOT_FOUND repro is NOT reachable with this backend.',
      })
    }
    proof('ADM-004', 'ADM-004-live-void-error-classification', reproduced ? 'FAIL' : A.pass ? 'PASS' : 'FAIL', { summary: 'real applyVoidSubmission vs live backend responses', assertions: A.list, matrix: ADM_MATRIX['ADM-004'] })
  }

  // ---- ADM-005: Ship clock — frontend-only; backend idempotency evidence
  {
    const A = new Asserts()
    const at = L.noonDay1Utc()
    const reqId = randomUUID()
    const ev0 = Number(sql('select count(*) from ship_clock_events'))
    const r1 = await admin.rpc('admin_apply_manual_clock_correction', { p_delta_minutes: 60, p_note: 'qa2a adm-005', p_at_utc: at, p_client_request_id: reqId })
    const ev1 = Number(sql('select count(*) from ship_clock_events'))
    const r2 = await admin.rpc('admin_apply_manual_clock_correction', { p_delta_minutes: 60, p_note: 'qa2a adm-005', p_at_utc: at, p_client_request_id: reqId })
    const ev2 = Number(sql('select count(*) from ship_clock_events'))
    const found = await admin.rpc('admin_find_clock_event_by_request_id', { p_client_request_id: reqId })
    A.ok(!r1.error && ev1 === ev0 + 1, 'manual correction applied once', { ev0, ev1, error: r1.error?.message })
    A.ok(r2.data?.idempotent_replay === true && ev2 === ev1, 'replay by request id is idempotent (no second clock event)', { ev2 })
    A.ok(Boolean(found.data), 'admin_find_clock_event_by_request_id finds the event (reconcile path exists server-side)', brief(found.data, 200))
    ADM_MATRIX['ADM-005'] = {
      backend_impact: 'None — clock correction is ledgered by client_request_id; replay returns the same event; find-by-id supports reconcile.',
      frontend_impact: 'ShipClockSection.confirmManual try/finally without catch (Vue SFC). Not headlessly executable; source contract failure from QA-3A stands.',
      reproduced_live: false,
      classification: 'frontend_only',
      db_before: { clock_events: ev0 },
      db_after: { clock_events: ev2 },
    }
    proof('ADM-005', 'ADM-005-backend-idempotent-frontend-only', A.pass ? 'INFO' : 'FAIL', { summary: 'frontend-only defect; backend clock correction idempotent/reconcilable', assertions: A.list, matrix: ADM_MATRIX['ADM-005'] })
  }

  // ---- ADM-006: sign-out keeps the access token valid server-side (pending lock inheritance is client storage)
  {
    const A = new Asserts()
    const c = await signIn('admin')
    const tok = (await c.auth.getSession()).data.session.access_token
    await c.auth.signOut()
    const r = await realFetch(`${API_URL}/rest/v1/rpc/admin_list_catalog_versions`, { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: '{}' })
    const tokenStillWorks = r.status === 200
    A.ok(true, `access token after signOut still authorizes admin RPC = ${tokenStillWorks} (JWT stateless until exp)`, { status: r.status })
    ADM_MATRIX['ADM-006'] = {
      backend_impact: tokenStillWorks ? 'Minor: signOut does not revoke the access JWT server-side (valid until exp, default 1h); no admin pending state lives server-side.' : 'signOut token rejected server-side.',
      frontend_impact: 'session.signOut clears player pendings only; seven star-princess.admin.* localStorage keys persist for the next admin on the same browser (source contract).',
      reproduced_live: false,
      classification: 'frontend_only',
      access_token_valid_after_signout: tokenStillWorks,
    }
    if (tokenStillWorks) {
      defect('INT-AUTH-001', 'P3', 'Access JWT remains valid after supabase signOut until expiry (no server-side revocation of the access token)', {
        adm_ref: 'ADM-006',
        observed: `admin_list_catalog_versions with pre-signOut token → HTTP ${r.status}`,
        impact: 'Shared-device handoff: a captured token works until exp; combine with ADM-006 (admin pending locks survive sign-out).',
      })
    }
    proof('ADM-006', 'ADM-006-backend-token-vs-frontend-pending', 'INFO', { summary: 'frontend-only pending-lock defect; backend token behaviour recorded', assertions: A.list, matrix: ADM_MATRIX['ADM-006'] })
  }

  // ---- ADM-007: admin with zero game enrollments
  {
    const A = new Asserts()
    const tok = randomUUID().slice(0, 6)
    const email = `qa2a-int-zerogames-${tok}@star-princess.local`
    let authId = null
    let pid = null
    try {
      const u = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
      authId = u.data.user.id
      const p = await svc.from('players').insert({ display_name: `QA2A Int ZeroGames ${tok}`, login_alias: email, is_admin: true, active: true, auth_user_id: authId }).select('id').single()
      pid = p.data.id
      const c = anon()
      await c.auth.signInWithPassword({ email, password: PASSWORD })
      const profile = await c.rpc('get_my_session_profile')
      const overview = await c.rpc('admin_overview_summary')
      const versions = await c.rpc('admin_list_catalog_versions')
      const memberships = Number(sql(`select count(*) from game_memberships where player_id='${pid}'`))
      A.ok(memberships === 0, 'synthetic admin has zero game enrollments', { memberships })
      A.ok(!overview.error && !versions.error, 'backend still serves admin RPCs to an admin with zero games (lockout is client-router only)', { overview: overview.error?.message ?? 'ok', versions: versions.error?.message ?? 'ok' })
      A.ok(true, 'session profile for zero-game admin', brief(profile.data, 400))
      // can an admin remove their own game access via the roster RPC?
      await svc.from('game_memberships').insert([{ player_id: pid, game: 'drinkit', enabled: true }, { player_id: pid, game: 'shipit', enabled: true }])
      const fp = await c.rpc('admin_roster_player_fingerprint', { p_player_id: pid })
      const self = await c.rpc('admin_set_player_access', { p_client_request_id: randomUUID(), p_player_id: pid, p_active: true, p_drinkit_enabled: false, p_shipit_enabled: false, p_team_id: null, p_expected_fingerprint: typeof fp.data === 'string' ? fp.data : fp.data?.fingerprint ?? '' })
      const enabledAfter = Number(sql(`select count(*) from game_memberships where player_id='${pid}' and enabled`))
      const selfRemovalAllowed = self.data?.ok === true && enabledAfter === 0
      A.ok(true, `admin_set_player_access self-removal of both games = ${self.data?.ok} (${self.data?.code ?? self.error?.message ?? 'ok'})`, brief(self.data ?? self.error?.message, 300))
      ADM_MATRIX['ADM-007'] = {
        backend_impact: selfRemovalAllowed ? 'Backend ALLOWS an admin to remove their own Drink It!/Ship It! access (ADMIN_SELF_LOCKOUT only guards active=false / admin flag), producing a zero-game admin that backend still authorizes.' : `Backend guard: ${self.data?.code ?? self.error?.message}`,
        frontend_impact: 'Router redirects enabledGames.length===0 to /unavailable before requiresAdmin → /admin unreachable (source contract).',
        reproduced_live: false,
        classification: selfRemovalAllowed ? 'backend_allows_frontend_locks' : 'backend_prevents_self_removal',
        db_after: { memberships_enabled: enabledAfter },
        set_access_result: self.data ?? self.error?.message,
      }
      if (selfRemovalAllowed) {
        defect('INT-ADM-007L', 'P1', 'ADM-007 live: admin_set_player_access lets an admin disable their own game access; backend then authorizes a zero-game admin the router locks out', {
          adm_ref: 'ADM-007',
          observed: `self.ok=${self.data?.ok}; enabled memberships after=${enabledAfter}; admin RPCs still succeed (overview=${overview.error?.message ?? 'ok'})`,
          impact: 'Self-lockout from /admin with no in-app recovery (SQL required).',
        })
      }
      proof('ADM-007', 'ADM-007-live-zero-game-admin', selfRemovalAllowed ? 'FAIL' : 'INFO', { summary: 'real backend vs zero-game admin + self-removal path', assertions: A.list, matrix: ADM_MATRIX['ADM-007'] })
    } finally {
      if (pid) {
        await svc.from('game_memberships').delete().eq('player_id', pid)
        await svc.from('admin_roster_access_requests').delete().eq('actor_id', pid).then(() => {}, () => {})
        await svc.from('players').delete().eq('id', pid)
      }
      if (authId) await svc.auth.admin.deleteUser(authId)
    }
  }
  await fe.auth.signOut()
  const sAfter = snap()
  rec.record('ADM-004-007-db-diff', 'INFO', { summary: 'DB core before/after ADM-004..007 probes', db_diff: diffSnap(sBefore, sAfter) })
}

// ═══════════════════════════ ADM-008 / ADM-009 / CAT-001 (real lib + component-flow replica) ═══════════════════════════
async function phaseCAT001() {
  await resetBaseline('cat001')
  const fe = SUPA.supabase
  const signInFe = () => fe.auth.signInWithPassword({ email: ADMIN_ID.login_alias, password: PASSWORD })
  await signInFe()
  mem.clear()
  const activeVersionId = () => pointerId()
  // === replica of CatalogImportSection.vue runStageAndPreview (lines 113-174) around REAL lib calls ===
  async function runStageAndPreview(payload, { beforePreview } = {}) {
    const requestId = IMP.newCatalogImportRequestId()
    PEND.writePendingAdminCatalogImport({ action: 'stage', clientRequestId: requestId, catalogId: payload.catalog_id ?? null })
    const staged = await IMP.stageImport(payload, requestId)
    if (staged.status !== 'ok') {
      PEND.clearPendingAdminCatalogImport()
      return { phase: 'stage_failed', staged }
    }
    PEND.writePendingAdminCatalogImport({
      action: 'publish',
      clientRequestId: requestId,
      catalogId: staged.result.catalog_id ?? null,
      candidateId: staged.candidateId,
      expectedActiveCatalogVersionId: activeVersionId(),
      expectedPayloadHash: staged.payloadHash,
    })
    if (beforePreview) await beforePreview()
    const preview = await IMP.previewPublish(staged.candidateId)
    if (preview.status !== 'ok') return { phase: 'preview_failed', staged, preview } // NOTE: no clearPending (component behaviour)
    PEND.clearPendingAdminCatalogImport()
    return { phase: 'preview_ok', staged, preview }
  }
  // replica of runPublish (lines 178-231)
  async function runPublish(candidateId, payloadHash) {
    const requestId = IMP.newCatalogImportRequestId()
    PEND.writePendingAdminCatalogImport({ action: 'publish', clientRequestId: requestId, candidateId, expectedActiveCatalogVersionId: activeVersionId(), expectedPayloadHash: payloadHash })
    const result = await IMP.publishImport({ clientRequestId: requestId, candidateId, expectedActiveCatalogVersionId: activeVersionId(), expectedPayloadHash: payloadHash })
    if (result.status === 'ok' || result.status === 'failed') PEND.clearPendingAdminCatalogImport()
    return { requestId, result }
  }
  // replica of checkPendingStatus (lines 233-267)
  async function checkPendingStatus() {
    const pending = PEND.readPendingAdminCatalogImport()
    if (!pending) return { cleared: false, outcome: null }
    const result = await IMP.findPublishRequest(pending.clientRequestId)
    if (result.status === 'ok' || result.status === 'failed') PEND.clearPendingAdminCatalogImport()
    return { outcome: result, pending_after: PEND.readPendingAdminCatalogImport() }
  }

  // ---- CAT-001 / ADM-008: stage ok, preview fails (admin session expires between the two calls)
  {
    const A = new Asserts()
    const before = snap()
    const doc = variant({ baseCatalogId: 'dev-fixture-schedule-ready-v1' })
    const flow = await runStageAndPreview(doc, { beforePreview: async () => { await fe.auth.signOut() } })
    const pending = PEND.readPendingAdminCatalogImport()
    const mid = snap()
    await signInFe()
    const check1 = await checkPendingStatus()
    const check2 = await checkPendingStatus()
    const stillPending = PEND.readPendingAdminCatalogImport()
    const ledgerForPendingId = await admin.rpc('admin_find_catalog_publish_request_by_id', { p_client_request_id: pending?.clientRequestId })
    const candidate = sqlJson(`select coalesce((select row_to_json(c) from (select status from catalog_import_candidates where id='${flow.staged?.candidateId}') c), 'null'::json)`)
    A.ok(flow.phase === 'preview_failed', 'stage succeeded then preview failed (session expiry) → flow stops at preview_failed', { phase: flow.phase, preview: flow.preview && { status: flow.preview.status, code: flow.preview.code } })
    A.ok(Boolean(pending) && pending.action === 'publish' && pending.clientRequestId === flow.staged?.clientRequestId, 'pending rewritten as action=publish using the STAGE request id and NOT cleared', pending)
    A.ok(candidate?.status === 'staged' && mid.pointer === before.pointer && mid.versions === before.versions, 'backend state clean: candidate staged, pointer/versions unchanged (no lock server-side)', { candidate, db_diff: diffSnap(before, mid) })
    A.ok(ledgerForPendingId.data === null, 'publish ledger has NO row for the pending request id (Check Status looks up an id never used)', ledgerForPendingId.data)
    A.ok(check1.outcome?.status === 'unknown' && check2.outcome?.status === 'unknown' && Boolean(stillPending), 'Check Status repeatedly returns unknown; pending never clears (stuck)', { check1: check1.outcome?.message, check2: check2.outcome?.message, still_pending: Boolean(stillPending) })
    A.ok(!stillPending, 'EXPECTED: pending cleared or a Discard exists after preview failure', { still_pending: Boolean(stillPending) })
    // backend recovery path proves lock is purely client-side
    const pub = await publishCand(flow.staged.candidateId, flow.staged.payloadHash)
    const sRecover = snap()
    A.ok(pub.data?.ok === true, 'backend can still publish that candidate with a fresh request id (lock is client-side only)', brief(pub.data?.code ?? 'ok'))
    ADM_MATRIX['ADM-008'] = ADM_MATRIX['CAT-001'] = {
      backend_impact: 'None. Candidate remains staged and publishable; pointer/versions untouched; no server lock or orphan ledger row.',
      frontend_impact: 'Pending record (action=publish, id=stage request id) is never cleared on preview failure; Check Status queries a non-existent ledger id → unknown forever; Stage/inputs disabled until localStorage key is deleted.',
      reproduced_live: Boolean(stillPending),
      lib_calls: 'real stageImport / previewPublish / findPublishRequest + pending libs; component glue replicated line-for-line',
      pending_record: pending,
      db_before: before,
      db_mid: mid,
      db_after_recovery: sRecover,
    }
    if (stillPending) {
      defect('INT-CAT-001L', 'P1', 'CAT-001/ADM-008 live: preview failure after a successful stage leaves a non-clearable pending publish record keyed to the stage request id', {
        adm_ref: 'ADM-008',
        cat_ref: 'CAT-001',
        observed: `pending=${brief(pending, 300)}; ledger(find)=null; Check Status ×2 → ${check1.outcome?.status}/${check2.outcome?.status}; backend candidate=${candidate?.status}`,
        impact: 'Admin cannot stage another catalog without clearing browser storage; backend is healthy.',
      })
    }
    proof('ADM-008', 'ADM-008-CAT-001-live-preview-failure-lock', stillPending ? 'FAIL' : A.pass ? 'PASS' : 'FAIL', { summary: 'stage ok → preview fails → pending stuck; backend clean and recoverable', assertions: A.list, matrix: ADM_MATRIX['ADM-008'] })
    proof('CAT-001', 'CAT-001-live-frontend-vs-backend', stillPending ? 'FAIL' : 'PASS', { summary: 'CAT-001 = same mechanism as ADM-008; impact frontend-only', matrix: ADM_MATRIX['CAT-001'] })
    mem.clear()
  }

  // ---- ADM-009: second publish tap ignores pending; first (lost) publish already applied
  {
    await resetBaseline('adm009')
    await signInFe()
    mem.clear()
    const A = new Asserts()
    const before = snap()
    const doc = variant({ baseCatalogId: 'dev-fixture-schedule-ready-v1' })
    const flow = await runStageAndPreview(doc)
    const { candidateId, payloadHash } = flow.staged
    // tap 1: publish R1 reaches the backend (applied) but the response is lost → pending R1 stays
    const r1 = randomUUID()
    PEND.writePendingAdminCatalogImport({ action: 'publish', clientRequestId: r1, candidateId, expectedActiveCatalogVersionId: activeVersionId(), expectedPayloadHash: payloadHash })
    const applied = await publishCand(candidateId, payloadHash, { reqId: r1 })
    const afterFirst = snap()
    // tap 2: runPublish has no pending guard → mints R2
    const second = await runPublish(candidateId, payloadHash)
    const afterSecond = snap()
    const pendingAfter = PEND.readPendingAdminCatalogImport()
    const r1Ledger = await admin.rpc('admin_find_catalog_publish_request_by_id', { p_client_request_id: r1 })
    A.ok(applied.data?.ok === true && afterFirst.versions === before.versions + 1, 'first (lost-response) publish applied: pointer moved once', brief(applied.data?.reassigned_slots))
    A.ok(second.result.status === 'failed' && ['candidate_not_staged', 'stale_active'].includes(second.result.code), 'second tap mints a NEW request id and is rejected by the backend (safe)', { status: second.result.status, code: second.result.code, server: second.result.serverCode })
    A.ok(afterSecond.versions === afterFirst.versions && afterSecond.pointer === afterFirst.pointer, 'no double publish (DB before/after second tap identical)')
    A.ok(pendingAfter === null && r1Ledger.data?.request_status === 'completed', 'client pending (R1) was overwritten then cleared while R1 ledger says completed → UI shows failure for a publish that succeeded', { pending_after: pendingAfter, r1_ledger: r1Ledger.data?.request_status })
    ADM_MATRIX['ADM-009'] = {
      backend_impact: 'None — backend rejects the second request (CANDIDATE_ALREADY_PUBLISHED / STALE_ACTIVE_VERSION); exactly one version added.',
      frontend_impact: 'runPublish ignores existing pending: overwrites R1 with R2, reports failure and clears pending although R1 completed; reconcile for R1 is lost.',
      reproduced_live: second.result.status === 'failed' && pendingAfter === null && r1Ledger.data?.request_status === 'completed',
      second_publish: { status: second.result.status, code: second.result.code, server_code: second.result.serverCode },
      r1_ledger_status: r1Ledger.data?.request_status,
      db_before: before,
      db_after_first: afterFirst,
      db_after_second: afterSecond,
    }
    if (ADM_MATRIX['ADM-009'].reproduced_live) {
      defect('INT-ADM-009L', 'P2', 'ADM-009 live: double-tap publish after a lost response shows failure and drops the reconcile handle for the publish that succeeded', {
        adm_ref: 'ADM-009',
        observed: `R1 ledger=completed; R2 → ${second.result.code}; pending cleared`,
        impact: 'Operator sees "failed" while the live catalog already changed; mitigated by backend idempotency/stale checks (no double publish).',
      })
    }
    proof('ADM-009', 'ADM-009-live-publish-ignores-pending', ADM_MATRIX['ADM-009'].reproduced_live ? 'FAIL' : A.pass ? 'PASS' : 'FAIL', { summary: 'second runPublish with pending present: backend safe, UI misleading', assertions: A.list, matrix: ADM_MATRIX['ADM-009'] })
    mem.clear()
  }
  await fe.auth.signOut()
}

// ═══════════════════════════ restore + driver ═══════════════════════════
async function restoreLaunchBaseline() {
  try {
    await L.ensureActiveClock(svc)
    const catalog = JSON.parse(readFileSync('content/catalogs/launch-candidate-v1.json', 'utf8'))
    const a = await svc.rpc('dev_activate_catalog_fixture', { p_payload: catalog })
    if (a.error) throw new Error(a.error.message)
    const s = await svc.rpc('dev_generate_bounty_schedule', { p_seed: 'qa2a-final' })
    if (s.error) throw new Error(s.error.message)
    await svc.rpc('dev_seed_daily_assignments')
    return { restored: 'launch-candidate-v1', pointer_catalog_id: snap().pointer_catalog_id }
  } catch (e) {
    try {
      await resetBaseline('final-fixture')
      return { restored: 'dev-fixture-schedule-ready-v1 (launch restore failed)', error: String(e.message ?? e) }
    } catch (e2) {
      return { restored: false, error: String(e2.message ?? e2) }
    }
  }
}

const PHASES = [
  ['B001', phaseB001],
  ['B002', phaseB002],
  ['B003', phaseB003],
  ['B004', phaseB004],
  ['B005', phaseB005],
  ['B006', phaseB006],
  ['B007', phaseB007],
  ['B008', phaseB008],
  ['B009', phaseB009],
  ['B011', phaseB011],
  ['B012', phaseB012],
  ['B013', phaseB013],
  ['B014', phaseB014],
  ['CATX', phaseCATX],
  ['ADM', phaseADM],
  ['CAT001', phaseCAT001],
  ['LIVE', phaseLive],
]

let fatal = null
let restored = null
try {
  admin = (await L.signInAdmin(anon, PASSWORD)).client
  rec.record('ENV-SAFETY', 'PASS', { summary: `API ${API_URL} contains :56321; organizer cruise (read-only) ${ORG_BEFORE}`, organizer_before: ORG_BEFORE, organizer_expected_match: ORG_BEFORE === L.ORGANIZER_CRUISE_EXPECTED })
  const clock0 = await resetBaseline('start')
  rec.record('ENV-CLOCK-RESET', 'PASS', { summary: 'dev_seed_cruise_clock(2099-01-03,-240), finalized cleared, drinkit unpaused, fixture catalog + schedule', clock: clock0.cruise })
  for (const [id, fn] of PHASES) {
    if (!want(id) && !(id === 'B008' && want('LIVE'))) continue
    try {
      console.log(`\n──── phase ${id} ────`)
      await fn()
    } catch (e) {
      const key = id.startsWith('B') ? `QA3A-${id}` : id
      rec.record(`${key}-PROBE-ERROR`, 'BLOCKED', { summary: `phase ${id} aborted: ${String(e?.message ?? e).slice(0, 300)}`, stack: String(e?.stack ?? e).split('\n').slice(0, 6) })
      B_STATUS[key] ??= { proofs: [] }
      B_STATUS[key].proofs.push({ id: `${key}-PROBE-ERROR`, status: 'BLOCKED', summary: String(e?.message ?? e).slice(0, 200) })
      bFinal(key)
    }
  }
} catch (e) {
  fatal = e
  rec.record('FATAL', 'BLOCKED', { summary: String(e?.stack ?? e) })
} finally {
  try {
    const cleanup = await cohort.cleanup()
    cleanup.sweep = await L.sweepAwardsSince(svc, STARTED_AT)
    rec.record('CLEANUP-COHORT', 'INFO', { summary: 'synthetic qa2a-int players removed', leftovers: { qa2a_int_players: sql("select count(*) from players where login_alias like 'qa2a-int-%'"), qa2a_guests: sql("select count(*) from players where login_alias like 'qa2a.int.%'") }, notes: cleanup })
  } catch (e) {
    rec.record('CLEANUP-COHORT', 'INFO', { summary: `cleanup error ${e}` })
  }
  restored = await restoreLaunchBaseline()
  rec.record('RESTORE-BASELINE', restored.restored ? 'INFO' : 'BLOCKED', { summary: `qa2 left on ${restored.restored}`, ...restored })
  await vite.close()
}

// ───────────────────────────── finish ─────────────────────────────
const org = L.assertOrg(ORG_BEFORE)
rec.record('ORGANIZER-CRUISE-UNCHANGED', org.unchanged && org.matches_expected ? 'PASS' : 'FAIL', { summary: `organizer cruise id ${org.after} (read-only select)`, ...org })

for (const id of [...Array.from({ length: 14 }, (_, i) => `QA3A-B${String(i + 1).padStart(3, '0')}`)]) {
  if (!B_STATUS[id]) B_STATUS[id] = { status: want(id.replace('QA3A-', '')) ? 'BLOCKED' : 'NOT_RUN', completed: false, proofs: [] }
}
const totals = rec.totals()
const completedB = Object.entries(B_STATUS)
  .filter(([id]) => /^QA3A-B\d+$/.test(id))
  .filter(([, v]) => v.completed)
  .map(([id]) => id.replace('QA3A-', ''))
  .sort()

L.writeJson(OUT_JSON, {
  generated_at: new Date().toISOString(),
  backend: { url: L.QA2_URL, project: 'star-princess-qa2-backend' },
  only: ONLY,
  organizer: org,
  totals,
  completed_b_items: completedB,
  b_status: B_STATUS,
  defects,
  results: rec.results,
})
L.writeJson(MATRIX_JSON, {
  generated_at: new Date().toISOString(),
  agent: 'QA-4A Agent 2',
  script: 'scripts/qa2a/probe/admin-catalog.mjs',
  backend: { url: L.QA2_URL, project: 'star-princess-qa2-backend', ports: { api: 56321, db: 56322 } },
  organizer_cruise: { expected: L.ORGANIZER_CRUISE_EXPECTED, end: org.after, unchanged: org.unchanged && org.matches_expected },
  totals,
  completed_b_items: completedB,
  qa3a_b_items: Object.fromEntries(Object.entries(B_STATUS).filter(([id]) => /^QA3A-B\d+$/.test(id)).map(([id, v]) => [id, { status: v.status, completed: v.completed, proofs: v.proofs }])),
  adm_cat_matrix: ADM_MATRIX,
  defects,
  final_qa2_state: restored,
  evidence: OUT_JSON,
})
console.log('TOTALS', totals, 'completed B:', completedB.join(','))
console.log('DEFECTS', defects.map((d) => `${d.id}(${d.severity})`).join(' '))
process.exit(fatal ? 1 : 0)
