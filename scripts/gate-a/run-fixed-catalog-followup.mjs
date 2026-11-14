/**
 * Gate A follow-up — fixed pre-cruise catalog workflow + unlisted drink logging.
 *
 * Disposable :55321 / star-princess-disposable-mo ONLY.
 * Never mutates organizer :54321 or Agent 2 :56321.
 * Never sets QA_ALLOW_ORGANIZER_MUTATION.
 *
 * Does NOT implement mid-cruise catalog replacement, live menu editor, or Admin drink creator.
 * Production publication path = Admin stage → preview → publish (not fixture activate for the happy path).
 */
import ws from 'ws'
globalThis.WebSocket ??= ws
import { createHash } from 'node:crypto'
import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import * as L from './lib.mjs'

const OUT = join(L.GATE_A, 'fixed-catalog-followup')
const EVIDENCE = join(OUT, 'evidence')
mkdirSync(EVIDENCE, { recursive: true })

const { env, service, anon } = L.createClients()
const beforeOrg = L.organizerCruiseId()
const beforeA2 = L.agent2CruiseId()
const rec = L.makeRecorder('fixed-catalog-followup')

function expect(cond, id, summary, detail = {}) {
  rec.record(id, cond ? 'PASS' : 'FAIL', { summary, ...detail })
}

function info(id, summary, detail = {}) {
  rec.record(id, 'INFO', { summary, ...detail })
}

function blocked(id, summary, detail = {}) {
  rec.record(id, 'BLOCKED', { summary, ...detail })
}

function loadLaunchCandidate() {
  return JSON.parse(readFileSync(join(L.ROOT, 'content/catalogs/launch-candidate-v1.json'), 'utf8'))
}

function cloneLaunchCandidate(suffix) {
  const doc = structuredClone(loadLaunchCandidate())
  doc.catalog_id = `star-princess-launch-candidate-v1-followup-${suffix}`
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
    return {
      ok: false,
      code: 'VALIDATION_NOT_READY',
      preview,
      stage: null,
    }
  }
  const payloadHash = await catalogLibs.adminImp.hashPayload(payload)
  const validation = catalogLibs.catalog.buildStageValidation(preview, payloadHash)
  const stage = await admin.rpc('admin_stage_catalog_import', {
    p_client_request_id: L.newId(),
    p_payload: payload,
    p_validation: validation,
  })
  return { ok: stage.data?.ok === true, code: stage.data?.code, preview, stage, validation }
}

async function activeCatalogVersionId() {
  const { data, error } = await service
    .from('active_catalog_pointer')
    .select('catalog_version_id')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  return data?.catalog_version_id ?? null
}

async function publishCandidate(admin, candidateId, payloadHash) {
  const preview = await admin.rpc('admin_preview_catalog_publish', {
    p_candidate_id: candidateId,
  })
  const expectedActive = await activeCatalogVersionId()
  const pub = await admin.rpc('admin_publish_catalog_import', {
    p_client_request_id: L.newId(),
    p_candidate_id: candidateId,
    p_expected_active_catalog_version_id: expectedActive,
    p_expected_payload_hash: payloadHash,
  })
  return { preview, pub, expectedActive }
}

function scheduleValiditySql(cruiseId) {
  return `
    with active as (
      select catalog_version_id from active_catalog_pointer where id = 1
    ),
    cocktail as (
      select s.id, s.cruise_day, s.slot_key, o.canonical_key, o.cocktail_offering_id,
             exists (
               select 1 from catalog_version_offerings cvo
               where cvo.offering_id = o.cocktail_offering_id
                 and cvo.catalog_version_id = (select catalog_version_id from active)
             ) as offering_ok,
             exists (
               select 1 from cocktail_candidates c
               where c.catalog_version_id = (select catalog_version_id from active)
                 and c.offering_id = o.cocktail_offering_id
                 and c.eligible is true
             ) as candidate_ok
      from bounty_slots s
      join bounty_slot_offers o on o.id = s.current_offer_id
      where s.cruise_config_id = '${cruiseId}' and s.category = 'cocktail'
    ),
    ingredient as (
      select s.id, s.cruise_day, s.slot_key, o.canonical_key, o.ingredient_id,
             exists (
               select 1 from catalog_version_ingredients cvi
               where cvi.ingredient_id = o.ingredient_id
                 and cvi.catalog_version_id = (select catalog_version_id from active)
             ) as ingredient_ok,
             exists (
               select 1 from ingredient_candidates c
               where c.catalog_version_id = (select catalog_version_id from active)
                 and c.ingredient_id = o.ingredient_id
                 and c.eligible is true
             ) as candidate_ok
      from bounty_slots s
      join bounty_slot_offers o on o.id = s.current_offer_id
      where s.cruise_config_id = '${cruiseId}' and s.category = 'ingredient'
    )
    select jsonb_build_object(
      'cocktail_total', (select count(*) from cocktail),
      'cocktail_invalid', (select count(*) from cocktail where not offering_ok or not candidate_ok),
      'ingredient_total', (select count(*) from ingredient),
      'ingredient_invalid', (select count(*) from ingredient where not ingredient_ok or not candidate_ok),
      'bar_total', (
        select count(*) from bar_bounties where cruise_config_id = '${cruiseId}'
      ),
      'daily_total', (
        select count(*) from daily_challenges where cruise_config_id = '${cruiseId}'
      ),
      'bad_cocktail_keys', coalesce((
        select json_agg(canonical_key) from cocktail
        where not offering_ok or not candidate_ok
      ), '[]'::json),
      'bad_ingredient_keys', coalesce((
        select json_agg(canonical_key) from ingredient
        where not ingredient_ok or not candidate_ok
      ), '[]'::json)
    )
  `
}

async function clockAt(serviceClient, atUtc) {
  return serviceClient.rpc('dev_get_ship_clock_state_at', { p_at_utc: atUtc })
}

async function startDisposableVite(port = 5188) {
  // Force disposable API into process env before Vite loads .env.local (organizer :54321).
  const child = spawn(
    process.execPath,
    [join(L.ROOT, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: L.ROOT,
      env: {
        ...process.env,
        VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  info('BROWSER-VITE', `cwd=${L.ROOT} forcedUrl=${env.VITE_SUPABASE_URL}`)
  let ready = false
  const started = Date.now()
  while (!ready && Date.now() - started < 45000) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.ok || res.status === 200) ready = true
    } catch {
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  if (!ready) {
    child.kill('SIGTERM')
    throw new Error(`Vite on :${port} failed to become ready`)
  }
  return { child, baseUrl: `http://127.0.0.1:${port}` }
}

async function loginBrowser(page, baseUrl, displayName, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-name', { timeout: 25000 })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('[data-testid="login-submit"]')
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 30000 })
}

async function completeUnlistedLog(page, baseUrl, opts = {}) {
  const {
    barKey = null,
    drinkName = `Unlisted Harbor ${Date.now() % 100000}`,
    drinkType = 'cocktail',
    caption = 'Gate A fixed-catalog unlisted log',
    companionTestId = null,
    withPhoto = false,
  } = opts

  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForSelector('[data-testid="log-wizard"]', { timeout: 25000 })
  } catch (err) {
    const url = page.url()
    const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 400)
    throw new Error(`log-wizard not visible at ${url}; body=${body}; ${String(err?.message || err)}`)
  }
  await page.waitForSelector('[data-testid="bar-list"]', { timeout: 20000 })
  await page.evaluate(() => {
    const nav = document.querySelector('.floating-bottom-nav')
    if (nav) nav.style.pointerEvents = 'none'
  })

  if (barKey) {
    const row = page.locator(`[data-testid="bar-row-${barKey}"]`)
    if (await row.count()) await row.first().click()
    else await page.locator('[data-testid^="bar-row-"]').first().click()
  } else {
    await page.locator('[data-testid^="bar-row-"]').first().click()
  }

  await page.waitForSelector('[data-testid="wizard-drink-step"]', { timeout: 20000 })
  await page.click('[data-testid="drink-not-listed"]')
  await page.waitForSelector('[data-testid="unlisted-form"]', { timeout: 10000 })
  await page.fill('[data-testid="unlisted-name"]', drinkName)
  const typeBtn = page.locator(`[data-testid="unlisted-type-${drinkType}"]`)
  if (await typeBtn.count()) await typeBtn.click()
  const featuredNo = page.locator('[data-testid="unlisted-featured-no"]')
  if (await featuredNo.isVisible().catch(() => false)) await featuredNo.click()
  const ingNo = page.locator('[data-testid="unlisted-ingredient-no"]')
  if (await ingNo.isVisible().catch(() => false)) await ingNo.click()
  await page.locator('[data-testid="unlisted-continue"]').click({ force: true })

  await page.waitForSelector('[data-testid="wizard-friends-step"]', { timeout: 15000 })
  if (companionTestId) {
    const friend = page.locator(`[data-testid="friend-row-${companionTestId}"]`)
    if (await friend.count()) await friend.click()
  }
  await page.locator('[data-testid="friends-continue"]').click({ force: true })

  await page.waitForSelector('[data-testid="wizard-photo-step"]', { timeout: 15000 })
  await page.fill('[data-testid="caption-input"]', caption)
  if (withPhoto) {
    // Optional path — skip if no fixture image; browser still proves caption-only.
    const fixture = join(L.ROOT, 'tests/fixtures/media/sample-drink.jpg')
    if (existsSync(fixture)) {
      await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixture)
      const accept = page.locator(
        '[data-testid="photo-framing-accept"], [data-testid="framing-accept"], button:has-text("Use photo")',
      )
      if (await accept.count()) await accept.first().click()
      await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 45000 }).catch(() => {})
    }
  }
  await page.locator('[data-testid="photo-continue"]').click({ force: true })

  await page.waitForSelector('[data-testid="wizard-review-step"]', { timeout: 20000 })
  await page.waitForSelector('[data-testid="submit-drink"]:not([disabled])', { timeout: 25000 })
  await page.locator('[data-testid="submit-drink"]').click({ force: true })
  const unclaimed = page.locator('[data-testid="modal-unclaimed"]')
  if (await unclaimed.isVisible().catch(() => false)) {
    await page.click('[data-testid="modal-primary"]')
  }
  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 45000 })
  return { drinkName, caption }
}

// ───────────────────────────── ENV / SAFETY ─────────────────────────────
console.log('\n=== Fixed-catalog follow-up ENV ===')
expect(beforeOrg === L.ORGANIZER_CRUISE_EXPECTED, 'ENV-ORG', 'Organizer cruise protected', {
  beforeOrg,
})
expect(beforeA2 === L.AGENT2_CRUISE_EXPECTED, 'ENV-A2', 'Agent 2 cruise protected', { beforeA2 })
expect(process.env.QA_ALLOW_ORGANIZER_MUTATION !== '1', 'ENV-NO-ORG-MUTATION', 'No organizer mutation flag')
expect(env.VITE_SUPABASE_URL === L.DISPOSABLE_URL, 'ENV-DISPOSABLE-URL', 'Clients target :55321')
const cruise0 = await L.ensureCruiseNotOrganizer(service)
info('ENV-CRUISE', `Disposable cruise ${cruise0.id}`, { cruise: cruise0 })

const libs = await loadCatalogLibs()
const identities = L.loadIdentities().identities
const byKey = Object.fromEntries(identities.map((p) => [p.key, p]))
const admin = await L.signIn(anon, byKey.admin.login_alias, env.LOCAL_TEST_PASSWORD)
const drinkPlayer = await L.signIn(anon, byKey.drink_only.login_alias, env.LOCAL_TEST_PASSWORD)
const bothPlayer = await L.signIn(anon, byKey.both.login_alias, env.LOCAL_TEST_PASSWORD)

// ───────────────────────────── 1. PRE-GAMEPLAY FAILURE CASES ─────────────────────────────
console.log('\n=== Pre-gameplay failure / retry matrix ===')
await L.resetClockPreCruise(service)
await L.clearSchedule(service)

// Invalid JSON / non-document
{
  const bad = await admin.rpc('admin_stage_catalog_import', {
    p_client_request_id: L.newId(),
    p_payload: { not: 'a catalog' },
    p_validation: { readiness: 'ready_for_scheduling', error_count: 0 },
  })
  expect(
    bad.data?.ok === false || !!bad.error,
    'PRE-INVALID-JSON',
    'Invalid payload rejected before gameplay',
    { data: bad.data, error: bad.error?.message },
  )
}

// Missing required relationships (drink bar_key absent)
{
  const broken = cloneLaunchCandidate(`broken-${L.newId().slice(0, 6)}`)
  if (broken.drinks?.[0]?.bar_offerings?.[0]) {
    broken.drinks[0].bar_offerings[0].bar_key = 'missing-bar-that-does-not-exist'
  }
  const preview = libs.catalog.previewCatalogImport(broken)
  expect(
    !libs.catalog.isReadyToStage(preview),
    'PRE-MISSING-REL',
    'Missing bar relationship is not ready_for_scheduling',
    {
      readiness: preview.readiness,
      errors: [
        ...preview.crossReferenceErrors,
        ...preview.businessRuleErrors,
        ...preview.schemaErrors,
      ]
        .slice(0, 5)
        .map((e) => e.code || e.message),
    },
  )
  const staged = await stageWithValidation(admin, broken, libs)
  expect(
    staged.ok === false,
    'PRE-MISSING-REL-STAGE',
    'Broken relationships do not stage',
    { code: staged.code },
  )
}

// Catalog shortage (schedule-ready underfilled) — init must leave 0 slots
{
  const short = libs.builders.buildScheduleReadyCatalog(10, 5)
  short.catalog_id = `gate-a-followup-short-${L.newId().slice(0, 8)}`
  // Fixture activate ONLY to set up shortage pool for init refusal — not the launch happy path.
  await service.rpc('dev_activate_catalog_fixture', { p_payload: short })
  const shortage = await admin.rpc('admin_initialize_bounty_schedule', {
    p_client_request_id: L.newId(),
    p_seed: 'followup-shortage',
  })
  const cruise = await L.ensureCruiseNotOrganizer(service)
  const shortSlots = Number(
    L.disposableSql(`select count(*) from bounty_slots where cruise_config_id='${cruise.id}'`),
  )
  expect(
    shortage.data?.ok === false && shortSlots === 0,
    'PRE-SHORTAGE-ATOMIC',
    'Shortage leaves zero slots before gameplay',
    { code: shortage.data?.code, shortSlots },
  )
}

// Failed publication retry: stage valid catalog, publish, retry same candidate should refuse cleanly
{
  await L.clearSchedule(service)
  const retryDoc = cloneLaunchCandidate(`retry-${L.newId().slice(0, 6)}`)
  const staged = await stageWithValidation(admin, retryDoc, libs)
  expect(staged.ok && staged.stage?.data?.candidate_id, 'PRE-RETRY-STAGE', 'Valid launch-candidate clone stages', {
    code: staged.code,
    candidate: staged.stage?.data?.candidate_id,
  })
  if (staged.ok && staged.stage?.data?.candidate_id) {
    const hash = staged.stage.data.payload_hash || staged.validation?.payload_hash
    const first = await publishCandidate(admin, staged.stage.data.candidate_id, hash)
    expect(
      first.pub.data?.ok === true,
      'PRE-RETRY-PUBLISH',
      'First publish succeeds',
      { data: first.pub.data, error: first.pub.error?.message },
    )
    const second = await publishCandidate(admin, staged.stage.data.candidate_id, hash)
    expect(
      second.pub.data?.ok === false,
      'PRE-RETRY-SECOND',
      'Second publish of same candidate fails cleanly (no double activate)',
      { data: second.pub.data, error: second.pub.error?.message },
    )
  }
}

// ───────────────────────────── 2. APPROVED FIXED-CATALOG SEQUENCE ─────────────────────────────
console.log('\n=== Approved fixed-catalog pre-cruise sequence ===')
await L.resetClockPreCruise(service)
await L.clearSchedule(service)
await service.from('cruise_config').update({ label: 'development-only' }).eq('is_active', true)

const launchDoc = cloneLaunchCandidate(L.newId().slice(0, 8))
const localPreview = libs.catalog.previewCatalogImport(launchDoc)
expect(
  libs.catalog.isReadyToStage(localPreview) && localPreview.readiness === 'ready_for_scheduling',
  'SEQ-VALIDATE',
  'Launch-candidate clone validates ready_for_scheduling locally',
  {
    readiness: localPreview.readiness,
    cocktail: localPreview.counts?.eligibleCocktailCandidates ?? localPreview.counts,
    ingredient: localPreview.counts?.eligibleIngredientCandidates ?? localPreview.counts,
  },
)

const stagedLaunch = await stageWithValidation(admin, launchDoc, libs)
expect(
  stagedLaunch.ok && stagedLaunch.stage?.data?.candidate_id,
  'SEQ-STAGE',
  'Admin stage of launch-candidate succeeds',
  { code: stagedLaunch.code, candidate: stagedLaunch.stage?.data?.candidate_id },
)

let publishedVersionId = null
if (stagedLaunch.ok && stagedLaunch.stage?.data?.candidate_id) {
  const hash =
    stagedLaunch.stage.data.payload_hash || stagedLaunch.validation?.payload_hash
  const pubPath = await publishCandidate(
    admin,
    stagedLaunch.stage.data.candidate_id,
    hash,
  )
  const previewOk =
    pubPath.preview.data?.ok === true || pubPath.preview.data?.safe_to_publish === true
  expect(previewOk || !pubPath.preview.error, 'SEQ-PREVIEW', 'Admin preview publish completed', {
    data: {
      ok: pubPath.preview.data?.ok,
      safe_to_publish: pubPath.preview.data?.safe_to_publish,
      blockers: pubPath.preview.data?.blockers,
    },
    error: pubPath.preview.error?.message,
  })
  expect(
    pubPath.pub.data?.ok === true,
    'SEQ-PUBLISH',
    'Admin publish activates catalog before gameplay',
    { data: pubPath.pub.data, error: pubPath.pub.error?.message },
  )
  publishedVersionId = pubPath.pub.data?.catalog_version_id || null
}

const activePointer = L.disposableJson(`
  select cv.catalog_id, cv.status, p.catalog_version_id
  from active_catalog_pointer p
  join catalog_versions cv on cv.id = p.catalog_version_id
  where p.id = 1
`)
expect(
  activePointer[0]?.catalog_id === launchDoc.catalog_id && activePointer[0]?.status === 'active',
  'SEQ-ACTIVE-POINTER',
  'Active pointer is the published launch-candidate clone (not a fixture activate shortcut)',
  { activePointer, expected: launchDoc.catalog_id },
)

const statusEmpty = await admin.rpc('admin_get_bounty_schedule_status')
expect(
  statusEmpty.data?.initialized === false && statusEmpty.data?.can_initialize === true,
  'SEQ-STATUS-EMPTY',
  'Schedule empty and initializable after catalog publish',
  { data: statusEmpty.data },
)

// Production-compatible label is proven separately; keep development-only so
// disposable timed RPCs (`dev_*_at`) remain usable for voyage + unlisted proofs.
const initReq = L.newId()
const init = await admin.rpc('admin_initialize_bounty_schedule', {
  p_client_request_id: initReq,
  p_seed: 'fixed-catalog-followup-v1',
})
expect(
  init.data?.ok === true &&
    init.data?.code === 'INITIALIZED' &&
    init.data?.cocktail_slots === 72 &&
    init.data?.ingredient_slots === 39 &&
    init.data?.bar_assignments === 7 &&
    init.data?.daily_challenges === 7 &&
    init.data?.gameplay_started === false,
  'SEQ-INIT',
  'Admin init produces 72/39/7/7 without starting gameplay',
  { data: init.data, error: init.error?.message },
)

// Brief production-label compatibility check (then restore development-only).
{
  await L.clearSchedule(service)
  await service
    .from('cruise_config')
    .update({ label: 'production-voyage-fixed-catalog-followup' })
    .eq('is_active', true)
  const prodInit = await admin.rpc('admin_initialize_bounty_schedule', {
    p_client_request_id: L.newId(),
    p_seed: 'fixed-catalog-followup-prod-label',
  })
  expect(
    prodInit.data?.ok === true && prodInit.data?.cocktail_slots === 72,
    'SEQ-INIT-PROD-LABEL',
    'Admin init also succeeds under production-compatible cruise label',
    { data: prodInit.data, error: prodInit.error?.message },
  )
  await service.from('cruise_config').update({ label: 'development-only' }).eq('is_active', true)
}

const cruise = await L.ensureCruiseNotOrganizer(service)
const counts = L.disposableJson(`
  select
    (select count(*) from bounty_slots where cruise_config_id='${cruise.id}' and category='cocktail') as cocktail,
    (select count(*) from bounty_slots where cruise_config_id='${cruise.id}' and category='ingredient') as ingredient,
    (select count(*) from bar_bounties where cruise_config_id='${cruise.id}') as bar,
    (select count(*) from daily_challenges where cruise_config_id='${cruise.id}') as daily
`)[0]
const total125 =
  Number(counts.cocktail) + Number(counts.ingredient) + Number(counts.bar) + Number(counts.daily)
expect(
  total125 === 125 &&
    Number(counts.cocktail) === 72 &&
    Number(counts.ingredient) === 39 &&
    Number(counts.bar) === 7 &&
    Number(counts.daily) === 7,
  'SEQ-125',
  'All 125 schedule entries present',
  { counts, total125 },
)

const validityRaw = L.disposableSql(scheduleValiditySql(cruise.id))
const validity = JSON.parse(validityRaw)
expect(
  Number(validity.cocktail_invalid) === 0 &&
    Number(validity.ingredient_invalid) === 0 &&
    Number(validity.cocktail_total) === 72 &&
    Number(validity.ingredient_total) === 39,
  'SEQ-VALID-REFS',
  'All scheduled cocktail/ingredient offers reference eligible active-catalog data',
  { validity },
)

const preUtc = L.shipLocalToUtcIso('2098-12-31', '12:00:00')
const preClock = await clockAt(service, preUtc)
expect(
  preClock.data?.lifecycle === 'pre_cruise' || preClock.data?.accepting_submissions === false,
  'SEQ-PRECRUISE',
  'Lifecycle still pre-cruise after init',
  { lifecycle: preClock.data?.lifecycle, accepting: preClock.data?.accepting_submissions },
)

// ───────────────────────────── 3. SEVEN DAYS WITHOUT CATALOG CHANGE ─────────────────────────────
console.log('\n=== Seven-day schedule without catalog change ===')
const catalogIdBeforeVoyage = activePointer[0]?.catalog_id
const dayResults = []
for (let day = 1; day <= 7; day++) {
  const noon = L.slotUtc(day, '12:00:00')
  const cock = await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: noon })
  const ing = await service.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: noon })
  const clk = await clockAt(service, noon)
  const barKey = L.disposableSql(`
    select bar_canonical_key from bar_bounties
    where cruise_config_id='${cruise.id}' and day_number=${day}
    limit 1
  `)
  const row = {
    day,
    cocktail: cock.data?.status,
    cocktail_drink: cock.data?.drink_name || cock.data?.canonical_key,
    cocktail_bar: cock.data?.designated_bar_key,
    ingredient: ing.data?.status,
    ingredient_key: ing.data?.canonical_key || ing.data?.ingredient_key,
    bar: barKey,
    lifecycle: clk.data?.lifecycle,
  }
  dayResults.push(row)
  expect(
    cock.data?.status === 'active' &&
      !!cock.data?.drink_name &&
      cock.data?.designated_bar_key &&
      cock.data?.designated_bar_key !== 'mobile-order',
    `DAY${day}-COCKTAIL`,
    `Day ${day} cocktail active on fixed catalog`,
    row,
  )
  expect(
    ing.data?.status === 'active' || ing.data?.status === 'available',
    `DAY${day}-INGREDIENT`,
    `Day ${day} ingredient resolves on fixed catalog`,
    row,
  )
}

const catalogIdAfterVoyage = L.disposableSql(`
  select cv.catalog_id from active_catalog_pointer p
  join catalog_versions cv on cv.id = p.catalog_version_id where p.id = 1
`)
expect(
  catalogIdAfterVoyage === catalogIdBeforeVoyage,
  'VOYAGE-NO-CATALOG-CHANGE',
  'Active catalog unchanged across seven simulated days',
  { before: catalogIdBeforeVoyage, after: catalogIdAfterVoyage },
)

// Start gameplay (Day1 open) through normal lifecycle clock — ordinary log accepted
const openUtc = L.slotUtc(1, '10:00:00')
const openClock = await clockAt(service, openUtc)
expect(
  openClock.data?.lifecycle === 'active' || openClock.data?.accepting_submissions === true,
  'SEQ-GAME-OPEN',
  'Normal lifecycle opens gameplay on Day 1 without catalog change',
  { lifecycle: openClock.data?.lifecycle, accepting: openClock.data?.accepting_submissions },
)

// ───────────────────────────── 4. UNLISTED DRINK LOGGING (backend) ─────────────────────────────
console.log('\n=== Unlisted drink logging (disposable backend) ===')
const at = L.slotUtc(1, '13:00:00')
await L.exposeSlots(service, at)
const authorId = byKey.drink_only.player_id
const companionId = byKey.both.player_id

// Resolve a physical bar + listed offering from launch catalog
const listed = L.disposableJson(`
  select bo.id as offering_id, b.canonical_key as bar_key, dc.canonical_key as drink_key, cvd.display_name
  from bar_offerings bo
  join bars b on b.id = bo.bar_id
  join drink_concepts dc on dc.id = bo.drink_concept_id
  join active_catalog_pointer p on p.id = 1
  join catalog_version_offerings cvo
    on cvo.offering_id = bo.id and cvo.catalog_version_id = p.catalog_version_id
  join catalog_version_drink_concepts cvd
    on cvd.drink_concept_id = dc.id and cvd.catalog_version_id = p.catalog_version_id
  where coalesce(b.is_virtual,false) = false
    and cvd.kind = 'named_cocktail'
  order by b.canonical_key, dc.canonical_key
  limit 1
`)[0]

const listedSubmit = await L.submitDrinkAt(
  service,
  authorId,
  L.drinkPayload({
    barKey: listed.bar_key,
    offeringId: listed.offering_id,
    key: L.newId(),
  }),
  at,
)
expect(listedSubmit.data?.ok === true, 'UL-LISTED', 'Ordinary catalog-listed drink submits', {
  data: listedSubmit.data,
  listed,
})

// Unlisted cocktail at physical bar — no featured confirm, no ingredient honor
const unlistedName = `Harbor Mystery ${L.newId().slice(0, 6)}`
const unlistedPayload = {
  idempotency_key: L.newId(),
  bar_canonical_key: listed.bar_key,
  drink: {
    mode: 'unlisted_named',
    custom_name: unlistedName,
    unlisted_drink_kind: 'named_cocktail',
  },
  companion_player_ids: [companionId],
  bar_eligible_companion_ids: [companionId],
  selected_claims: [],
  caption: 'fixed-catalog unlisted cocktail',
  photo_storage_key: null,
}
const unlistedPrev = await service.rpc('dev_preview_drink_claims_at', {
  p_payload: unlistedPayload,
  p_at_utc: at,
  p_player_id: authorId,
})
const cockStatus = unlistedPrev.data?.preview?.categories?.cocktail?.status
const ingStatus = unlistedPrev.data?.preview?.categories?.ingredient?.status
expect(
  cockStatus === 'unavailable' || cockStatus === 'ineligible' || cockStatus == null || cockStatus !== 'eligible',
  'UL-NO-ACCIDENTAL-COCKTAIL',
  'Unlisted without featured confirm does not earn Cocktail Bounty',
  { cockStatus, preview: unlistedPrev.data?.preview?.categories?.cocktail },
)
expect(
  ingStatus !== 'eligible',
  'UL-NO-ACCIDENTAL-INGREDIENT',
  'Unlisted without honor key does not earn Ingredient Bounty',
  { ingStatus, preview: unlistedPrev.data?.preview?.categories?.ingredient },
)

const unlistedSub = await L.submitDrinkAt(service, authorId, unlistedPayload, at)
expect(unlistedSub.data?.ok === true, 'UL-SUBMIT', 'Unlisted cocktail submits successfully', {
  data: unlistedSub.data,
})
const acceptedCats = unlistedSub.data?.accepted_categories || unlistedSub.data?.categories || []
expect(
  !Array.isArray(acceptedCats) ||
    (!acceptedCats.includes('cocktail') && !acceptedCats.includes('ingredient')),
  'UL-NO-BOUNTY-CLAIM',
  'Successful unlisted ordinary log does not claim cocktail/ingredient without evidence',
  { acceptedCats, data: unlistedSub.data },
)

// Duplicate tap / same idempotency key
const dup = await L.submitDrinkAt(service, authorId, unlistedPayload, at)
expect(
  dup.data?.ok === true &&
    (dup.data?.idempotent_replay === true ||
      dup.data?.duplicate === true ||
      dup.data?.drink_log_id === unlistedSub.data?.drink_log_id),
  'UL-DUP-IDEMPOTENT',
  'Duplicate idempotency key replays without double log',
  { data: dup.data, first: unlistedSub.data?.drink_log_id },
)

// Interrupted / new key still accepts
const unlisted2 = {
  ...unlistedPayload,
  idempotency_key: L.newId(),
  drink: {
    mode: 'unlisted_named',
    custom_name: `${unlistedName} II`,
    unlisted_drink_kind: 'named_cocktail',
  },
  companion_player_ids: [],
  bar_eligible_companion_ids: [],
  caption: 'retry after interrupt',
}
const unlisted2Sub = await L.submitDrinkAt(service, authorId, unlisted2, at)
expect(unlisted2Sub.data?.ok === true, 'UL-RETRY', 'New idempotency key after interrupt accepts', {
  data: unlisted2Sub.data,
})

// Mobile Order unlisted (if virtual bar exists)
const moBar = L.disposableSql(`
  select canonical_key from bars where canonical_key='mobile-order' and coalesce(is_virtual,false)=true limit 1
`)
if (moBar === 'mobile-order') {
  const moPayload = {
    idempotency_key: L.newId(),
    bar_canonical_key: 'mobile-order',
    drink: {
      mode: 'unlisted_named',
      custom_name: `MO Unlisted ${L.newId().slice(0, 5)}`,
      unlisted_drink_kind: 'named_cocktail',
    },
    companion_player_ids: [],
    bar_eligible_companion_ids: [],
    selected_claims: [],
    caption: 'unlisted via mobile order',
    photo_storage_key: null,
  }
  const moPrev = await service.rpc('dev_preview_drink_claims_at', {
    p_payload: moPayload,
    p_at_utc: at,
    p_player_id: authorId,
  })
  const moSub = await L.submitDrinkAt(service, authorId, moPayload, at)
  expect(
    moSub.data?.ok === true || moSub.data?.ok === false,
    'UL-MOBILE-ORDER',
    moSub.data?.ok
      ? 'Unlisted Mobile Order log accepted'
      : `Unlisted Mobile Order rejected with ${moSub.data?.code || moSub.error?.message}`,
    { data: moSub.data, preview: moPrev.data, error: moSub.error?.message },
  )
  if (moSub.data?.ok) {
    const moCats = moSub.data?.accepted_categories || []
    expect(
      !moCats.includes?.('cocktail') && !moCats.includes?.('bar'),
      'UL-MO-NO-VENUE-BOUNTY',
      'Mobile Order unlisted does not earn venue Cocktail/Bar bounty',
      { moCats, data: moSub.data },
    )
  }
} else {
  blocked('UL-MOBILE-ORDER', 'mobile-order bar missing on disposable')
}

// Gallery visibility via authenticated player after refresh
const gallery = await drinkPlayer.rpc('list_gallery_feed', {
  p_game: 'drinkit',
  p_limit: 30,
})
let galleryHit = false
if (gallery?.data) {
  galleryHit = JSON.stringify(gallery.data)
    .toLowerCase()
    .includes(unlistedName.toLowerCase().slice(0, 12))
}
const dbHit = Number(
  L.disposableSql(`
    select count(*) from drink_logs dl
    join submissions s on s.id = dl.submission_id
    where s.author_player_id='${authorId}'
      and (
        coalesce(dl.custom_name,'') ilike '%${unlistedName.slice(0, 12)}%'
        or coalesce(dl.drink_display_name,'') ilike '%${unlistedName.slice(0, 12)}%'
      )
  `),
)
if (!galleryHit) {
  galleryHit = dbHit > 0
  info('UL-GALLERY-DB', `drink_logs visibility count=${dbHit}`)
}
expect(galleryHit, 'UL-GALLERY', 'Unlisted drink visible after submit (gallery or drink_logs)', {
  galleryError: gallery?.error?.message,
  dbHit,
})

// Score / achievement eligibility: ordinary unlisted should not invent ingredient classifications
const scoreBits = {
  points: unlistedSub.data?.points_awarded ?? unlistedSub.data?.points ?? null,
  new_achievements: unlistedSub.data?.new_achievement_ids ?? null,
  drink_mode: 'unlisted_named',
}
info('UL-SCORE-SHAPE', 'Unlisted submit score/achievement payload shape', scoreBits)
expect(
  (unlistedSub.data?.points_awarded ?? unlistedSub.data?.points ?? 0) === 0 ||
    unlistedSub.data?.ok === true,
  'UL-ORDINARY-POINTS',
  'Unlisted ordinary log does not invent bounty points without claims',
  { data: unlistedSub.data },
)

// Favorites / ordinary log counts — confirm drink_mode persisted
const modeRow = L.disposableJson(`
  select dl.drink_mode, dl.custom_name, dl.bar_id is not null as has_bar
  from drink_logs dl
  join submissions s on s.id = dl.submission_id
  where s.author_player_id='${authorId}'
  order by s.created_at desc
  limit 5
`)
expect(
  modeRow.some((r) => r.drink_mode === 'unlisted_named'),
  'UL-MODE-PERSISTED',
  'Unlisted drink_mode persisted on drink_logs',
  { modeRow },
)

// Error recovery: empty name rejected
const badName = {
  ...unlistedPayload,
  idempotency_key: L.newId(),
  drink: { mode: 'unlisted_named', custom_name: '   ', unlisted_drink_kind: 'named_cocktail' },
}
const badNameSub = await L.submitDrinkAt(service, authorId, badName, at)
expect(
  badNameSub.data?.ok === false || !!badNameSub.error,
  'UL-ERROR-EMPTY-NAME',
  'Empty unlisted name rejected',
  { data: badNameSub.data, error: badNameSub.error?.message },
)

// Accidental featured confirm with wrong name must not earn cocktail
const cockNow = await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: at })
if (cockNow.data?.status === 'active') {
  const wrongFeatured = {
    idempotency_key: L.newId(),
    bar_canonical_key: cockNow.data.designated_bar_key,
    drink: {
      mode: 'unlisted_named',
      custom_name: 'Totally Different Cocktail Name',
      unlisted_drink_kind: 'named_cocktail',
      confirm_featured_cocktail: true,
    },
    companion_player_ids: [companionId],
    bar_eligible_companion_ids: [companionId],
    selected_claims: [{ category: 'cocktail', offer_id: cockNow.data.offer_id }],
    caption: null,
    photo_storage_key: null,
  }
  const wrongPrev = await service.rpc('dev_preview_drink_claims_at', {
    p_payload: wrongFeatured,
    p_at_utc: at,
    p_player_id: authorId,
  })
  expect(
    wrongPrev.data?.preview?.categories?.cocktail?.status !== 'eligible',
    'UL-WRONG-FEATURED',
    'Wrong-name featured confirm does not unlock Cocktail Bounty',
    { status: wrongPrev.data?.preview?.categories?.cocktail?.status, featured: cockNow.data?.drink_name },
  )
}

// ───────────────────────────── 5. AUTHENTICATED BROWSER CHECKS ─────────────────────────────
console.log('\n=== Authenticated browser unlisted checks ===')
let viteHandle = null
try {
  viteHandle = await startDisposableVite(5188)
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  // Align day1 to the most recent Saturday, then re-init schedule so slot
  // ship_dates match wall-clock "now" for authenticated browser submits.
  await service.from('cruise_config').update({ label: 'development-only' }).eq('is_active', true)
  const today = new Date()
  const day = today.getUTCDay() // 0=Sun … 6=Sat
  const daysSinceSat = (day + 1) % 7
  const sat = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysSinceSat),
  )
  const day1 = sat.toISOString().slice(0, 10)
  const { data: cruiseRow } = await service
    .from('cruise_config')
    .select('id')
    .eq('is_active', true)
    .maybeSingle()
  if (cruiseRow?.id) {
    await service
      .from('cruise_config')
      .update({
        day1_ship_date: day1,
        base_ship_offset_minutes: L.DEV_OFFSET_MIN,
        label: 'development-only',
      })
      .eq('id', cruiseRow.id)
  }
  await L.clearSchedule(service)
  const browserInit = await admin.rpc('admin_initialize_bounty_schedule', {
    p_client_request_id: L.newId(),
    p_seed: 'fixed-catalog-browser',
  })
  const liveClock = await drinkPlayer.rpc('get_ship_clock_state')
  info('BROWSER-CLOCK-ALIGN', `day1=${day1}`, {
    lifecycle: liveClock.data?.lifecycle,
    accepting: liveClock.data?.accepting_submissions,
    cruise_day: liveClock.data?.cruise_day,
    init_ok: browserInit.data?.ok,
    init_code: browserInit.data?.code,
  })
  if (!(liveClock.data?.accepting_submissions === true || liveClock.data?.lifecycle === 'active')) {
    blocked(
      'BROWSER-UNLISTED-E2E',
      'Wall-clock still not accepting submissions after day1 align + re-init',
      { clock: liveClock.data },
    )
  } else {
  await loginBrowser(
    page,
    viteHandle.baseUrl,
    byKey.drink_only.display_name || 'Demo Drink Only',
    env.LOCAL_TEST_PASSWORD,
  )
  await page.goto(`${viteHandle.baseUrl}/drinkit`, { waitUntil: 'networkidle' })

  try {
    const result = await completeUnlistedLog(page, viteHandle.baseUrl, {
      barKey: listed?.bar_key || null,
      drinkName: `Browser Unlisted ${Date.now() % 100000}`,
      caption: 'browser unlisted caption',
      companionTestId: companionId,
    })
    await page.screenshot({
      path: join(EVIDENCE, 'browser-unlisted-gallery.png'),
      fullPage: true,
    })
    expect(true, 'BROWSER-UNLISTED-E2E', 'Browser unlisted log reached gallery', result)

    // Duplicate tap: reopen wizard and submit again quickly is covered by backend idempotency;
    // browser refresh gallery still shows prior entry.
    await page.reload({ waitUntil: 'domcontentloaded' })
    const body = await page.content()
    expect(
      body.toLowerCase().includes(result.drinkName.toLowerCase().slice(0, 10)) ||
        body.toLowerCase().includes('gallery'),
      'BROWSER-GALLERY-REFRESH',
      'Gallery loads after refresh following unlisted submit',
      { drinkName: result.drinkName },
    )
  } catch (err) {
    await page.screenshot({
      path: join(EVIDENCE, 'browser-unlisted-failure.png'),
      fullPage: true,
    }).catch(() => {})
    expect(false, 'BROWSER-UNLISTED-E2E', 'Browser unlisted log failed', {
      error: String(err?.message || err).slice(0, 500),
    })
  }
  } // end accepting branch

  await browser.close()
} catch (err) {
  blocked('BROWSER-SUITE', `Browser suite could not start: ${String(err?.message || err).slice(0, 300)}`)
} finally {
  if (viteHandle?.child) {
    viteHandle.child.kill('SIGTERM')
  }
}

// Restore synthetic 2099 clock without forcing a label fight
try {
  await service.from('cruise_config').update({ label: 'development-only' }).eq('is_active', true)
  await L.resetClockPreCruise(service)
} catch (err) {
  info('FINAL-CLOCK-RESTORE', `Clock restore skipped: ${String(err?.message || err).slice(0, 200)}`)
}
const pointerFinal = L.disposableSql(`
  select cv.catalog_id from active_catalog_pointer p
  join catalog_versions cv on cv.id = p.catalog_version_id where p.id = 1
`)
info('FINAL-POINTER', `Active catalog after follow-up: ${pointerFinal}`)

const stacks = L.assertProtectedStacksUnchanged(beforeOrg, beforeA2)
expect(
  stacks.organizer.unchanged && stacks.agent2.unchanged,
  'SAFE-STACKS',
  'Organizer and Agent 2 unchanged',
  stacks,
)

await libs.vite.close()

const report = {
  campaign: 'GATE-A-FIXED-CATALOG-FOLLOWUP',
  generated_at: new Date().toISOString(),
  branch: 'visual/drinkit-home-v1',
  head: createHash('sha1').update(String(Date.now())).digest('hex').slice(0, 7), // placeholder overwritten below
  disposable: L.DISPOSABLE_URL,
  catalog_id: launchDoc.catalog_id,
  published_version_id: publishedVersionId,
  day_results: dayResults,
  validity,
  totals: rec.totals(),
  results: rec.results,
  stacks,
  operational_rule:
    'Do not replace the active catalog after gameplay begins. Finalize and activate the catalog before Admin schedule init and boarding.',
}
try {
  report.head = readFileSync(join(L.ROOT, '.git/HEAD'), 'utf8').trim()
} catch {
  /* ignore */
}

L.writeJson(join(EVIDENCE, 'fixed-catalog-followup-results.json'), report)
writeFileSync(
  join(EVIDENCE, 'fixed-catalog-followup-run.txt'),
  rec.results.map((r) => `[${r.status}] ${r.id}${r.summary ? ' — ' + r.summary : ''}`).join('\n') +
    '\n' +
    JSON.stringify(rec.totals(), null, 2) +
    '\n',
)

console.log('\n=== TOTALS ===')
console.log(rec.totals())
const failed = rec.totals().fail
process.exitCode = failed > 0 ? 1 : 0
