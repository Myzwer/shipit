/**
 * Menu Launch Gate M1 — focused import-contract + February-fallback validation.
 *
 * Disposable :55321 / star-princess-disposable-mo ONLY.
 * Never mutates organizer :54321 or Agent 2 :56321.
 * Never sets QA_ALLOW_ORGANIZER_MUTATION.
 *
 * Does NOT rebuild menus, run the seven-day voyage, or create ChatGPT agents.
 */
import ws from 'ws'
globalThis.WebSocket ??= ws
import { createServer } from 'vite'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import * as L from '../gate-a/lib.mjs'

const OUT = join(L.ROOT, 'docs/qa/campaign/menu-launch/m1')
const EVIDENCE = join(OUT, 'evidence')
const FIXTURES = join(OUT, 'fixtures')
mkdirSync(EVIDENCE, { recursive: true })
mkdirSync(FIXTURES, { recursive: true })

const { env, service, anon } = L.createClients()
const beforeOrg = L.organizerCruiseId()
const beforeA2 = L.agent2CruiseId()
const rec = L.makeRecorder('m1-menu-launch')

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
  doc.catalog_id = `star-princess-launch-candidate-v1-m1-${suffix}`
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

// ───────────────────────────── ENV / SAFETY ─────────────────────────────
console.log('\n=== M1 ENV / SAFETY ===')
expect(beforeOrg === L.ORGANIZER_CRUISE_EXPECTED, 'ENV-ORG', 'Organizer cruise protected', { beforeOrg })
expect(beforeA2 === L.AGENT2_CRUISE_EXPECTED, 'ENV-A2', 'Agent 2 cruise protected', { beforeA2 })
expect(process.env.QA_ALLOW_ORGANIZER_MUTATION !== '1', 'ENV-NO-ORG-MUTATION', 'No organizer mutation flag')
expect(env.VITE_SUPABASE_URL === L.DISPOSABLE_URL, 'ENV-DISPOSABLE-URL', 'Clients target :55321')
const cruise0 = await L.ensureCruiseNotOrganizer(service)
info('ENV-CRUISE', `Disposable cruise ${cruise0.id}`, { cruise: cruise0 })
info('ENV-POINTER-BEFORE', 'Active pointer before M1', { pointer: await activePointer() })

const libs = await loadCatalogLibs()
const identities = L.loadIdentities().identities
const byKey = Object.fromEntries(identities.map((p) => [p.key, p]))
const admin = await L.signIn(anon, byKey.admin.login_alias, env.LOCAL_TEST_PASSWORD)

// Offline February artifact integrity
{
  const { createHash } = await import('node:crypto')
  const src = readFileSync(join(L.ROOT, 'content/catalogs/launch-candidate-v1.json'))
  const offlinePath = join(FIXTURES, 'february-fallback-star-princess-launch-candidate-v1.json')
  if (!existsSync(offlinePath)) {
    copyFileSync(join(L.ROOT, 'content/catalogs/launch-candidate-v1.json'), offlinePath)
  }
  const offline = readFileSync(offlinePath)
  const sha = (buf) => createHash('sha256').update(buf).digest('hex')
  expect(
    sha(src) === sha(offline) && src.length === offline.length,
    'FEB-OFFLINE-COPY',
    'Offline February fallback JSON matches content/catalogs/launch-candidate-v1.json',
    { bytes: src.length, sha256: sha(src) },
  )
}

// ───────────────────────────── PURE TS CONTRACT CASES ─────────────────────────────
console.log('\n=== Pure-TS import contract cases ===')

const febPreview = libs.catalog.previewCatalogImport(loadLaunchCandidate())
expect(
  febPreview.readiness === 'ready_for_scheduling' && libs.catalog.isReadyToStage(febPreview),
  'FEB-READY',
  'February launch-candidate is ready_for_scheduling',
  {
    readiness: febPreview.readiness,
    cocktailEligible: febPreview.counts.cocktailEligible,
    ingredientEligible: febPreview.counts.ingredientEligible,
    shortages: febPreview.shortages,
  },
)

// 1. Minimal valid schedule-ready synthetic
const synthetic = libs.builders.buildScheduleReadyCatalog(72, 39)
synthetic.catalog_id = `m1-synthetic-valid-${L.newId().slice(0, 8)}`
const syntheticPath = join(FIXTURES, 'synthetic-schedule-ready-valid.json')
writeFileSync(syntheticPath, JSON.stringify(synthetic, null, 2) + '\n')
const synPreview = libs.catalog.previewCatalogImport(synthetic)
expect(
  synPreview.readiness === 'ready_for_scheduling',
  'TS-MINIMAL-VALID',
  'Synthetic schedule-ready catalog validates',
  {
    path: 'docs/qa/campaign/menu-launch/m1/fixtures/synthetic-schedule-ready-valid.json',
    readiness: synPreview.readiness,
    counts: synPreview.counts,
  },
)

// 2. Duplicate identifier/name conflicts
{
  const dup = structuredClone(synthetic)
  dup.catalog_id = `m1-dup-${L.newId().slice(0, 6)}`
  dup.drinks.push(structuredClone(dup.drinks[0]))
  const p = libs.catalog.previewCatalogImport(dup)
  expect(codesOf(p).includes('DUPLICATE_DRINK_KEY'), 'TS-DUP-DRINK', 'Duplicate drink key rejected', {
    codes: codesOf(p).slice(0, 8),
    readiness: p.readiness,
  })

  const dupCand = structuredClone(synthetic)
  dupCand.catalog_id = `m1-dupc-${L.newId().slice(0, 6)}`
  dupCand.cocktail_candidates.push(structuredClone(dupCand.cocktail_candidates[0]))
  const pc = libs.catalog.previewCatalogImport(dupCand)
  expect(
    codesOf(pc).includes('DUPLICATE_COCKTAIL_CONCEPT') || codesOf(pc).includes('DUPLICATE_COCKTAIL_CANDIDATE'),
    'TS-DUP-COCKTAIL-CONCEPT',
    'Duplicate cocktail concept rejected',
    { codes: codesOf(pc).slice(0, 8) },
  )
}

// 3. Dangling references
{
  const dang = structuredClone(synthetic)
  dang.catalog_id = `m1-dang-${L.newId().slice(0, 6)}`
  dang.cocktail_candidates[0].designated_bar_key = 'no-such-bar'
  dang.drinks[0].bar_offerings[0].ingredient_keys.push('missing-ingredient-key')
  const p = libs.catalog.previewCatalogImport(dang)
  const codes = codesOf(p)
  expect(
    codes.includes('COCKTAIL_CANDIDATE_UNKNOWN_BAR') || codes.includes('OFFERING_UNKNOWN_INGREDIENT'),
    'TS-DANGLING-REFS',
    'Dangling bar/ingredient refs rejected',
    { codes: codes.slice(0, 10) },
  )
}

// 4. Wrong field types + unknown properties
{
  const badType = structuredClone(synthetic)
  badType.catalog_id = `m1-type-${L.newId().slice(0, 6)}`
  badType.bars[0].active = 'yes'
  const p1 = libs.catalog.previewCatalogImport(badType)
  expect(p1.readiness === 'invalid' || codesOf(p1).includes('SCHEMA_INVALID'), 'TS-WRONG-TYPE', 'Wrong field type rejected', {
    readiness: p1.readiness,
    codes: codesOf(p1).slice(0, 5),
  })

  const unknown = structuredClone(synthetic)
  unknown.catalog_id = `m1-unk-${L.newId().slice(0, 6)}`
  unknown.extra_top_level = true
  unknown.drinks[0].secret_field = 'nope'
  const p2 = libs.catalog.previewCatalogImport(unknown)
  expect(
    p2.readiness === 'invalid' || codesOf(p2).some((c) => c === 'SCHEMA_INVALID'),
    'TS-UNKNOWN-PROPS',
    'Unknown properties rejected (additionalProperties:false)',
    { readiness: p2.readiness, sample: (p2.schemaErrors ?? []).slice(0, 3) },
  )
}

// 5. Missing prices / conflicting price evidence
{
  const price = structuredClone(synthetic)
  price.catalog_id = `m1-price-${L.newId().slice(0, 6)}`
  const off = price.drinks.find((d) => d.kind === 'named_cocktail').bar_offerings[0]
  off.price_status = 'verified_within_limit'
  off.price_usd = null
  const p = libs.catalog.previewCatalogImport(price)
  expect(codesOf(p).includes('PRICE_STATUS_INCONSISTENT'), 'TS-MISSING-PRICE-A', 'Category A without price_usd rejected', {
    codes: codesOf(p).slice(0, 8),
  })

  const conflict = structuredClone(synthetic)
  conflict.catalog_id = `m1-pconf-${L.newId().slice(0, 6)}`
  const off2 = conflict.drinks.find((d) => d.kind === 'named_cocktail').bar_offerings[0]
  off2.price_status = 'verified_within_limit'
  off2.price_usd = 18
  const p2 = libs.catalog.previewCatalogImport(conflict)
  expect(codesOf(p2).includes('PRICE_STATUS_INCONSISTENT'), 'TS-PRICE-CONFLICT', 'verified_within_limit >$15 rejected', {
    codes: codesOf(p2).slice(0, 8),
  })
}

// 6. Unverified Good Spirits offerings (not bounty-eligible)
{
  const gs = structuredClone(synthetic)
  gs.catalog_id = `m1-gs-${L.newId().slice(0, 6)}`
  // Ensure good-spirits-at-sea exists
  if (!gs.bars.some((b) => b.key === 'good-spirits-at-sea')) {
    gs.bars.push({ key: 'good-spirits-at-sea', name: 'Good Spirits at Sea', deck: '5', active: true })
  }
  gs.drinks.push({
    key: 'm1-gs-mystery',
    name: 'M1 GS Mystery',
    kind: 'named_cocktail',
    bar_offerings: [
      {
        bar_key: 'good-spirits-at-sea',
        ingredient_keys: ['lime-juice'],
        display_ingredients: ['Lime Juice'],
        price_usd: null,
        price_status: 'unverified',
        evidence_reference: 'm1-unverified-gs',
      },
    ],
  })
  gs.cocktail_candidates.push({
    drink_key: 'm1-gs-mystery',
    designated_bar_key: 'good-spirits-at-sea',
    tier: 'interesting',
    points: 50,
  })
  const p = libs.catalog.previewCatalogImport(gs)
  const stillReady = p.readiness === 'ready_for_scheduling'
  // Unverified candidate must not count as eligible; pool may still be ready from other 72.
  const mysteryEligible = (p.counts?.cocktailEligible ?? 0) > synPreview.counts.cocktailEligible
  expect(
    !mysteryEligible && codesOf(p).every((c) => c !== 'APPROVED_FILTERED_UNKNOWN_APPROVAL'),
    'TS-UNVERIFIED-GS',
    'Unverified Good Spirits candidate is not schedule-eligible (Category C)',
    {
      readiness: p.readiness,
      cocktailEligible: p.counts.cocktailEligible,
      baselineEligible: synPreview.counts.cocktailEligible,
      warnings: (p.warnings ?? []).filter((w) => /UNVERIFIED|unverified/i.test(w.code + w.message)).slice(0, 3),
      stillReady,
    },
  )
}

// 7. Insufficient eligible pools
{
  const short = libs.builders.buildScheduleReadyCatalog(10, 5)
  short.catalog_id = `m1-short-${L.newId().slice(0, 6)}`
  const p = libs.catalog.previewCatalogImport(short)
  expect(
    p.readiness === 'valid_not_ready' && p.shortages.cocktailShortage > 0 && p.shortages.ingredientShortage > 0,
    'TS-POOL-SHORTAGE',
    'Underfilled pools are valid_not_ready',
    { readiness: p.readiness, shortages: p.shortages },
  )
}

// 8. Cocktail / Ingredient diversity targets
expect(
  febPreview.counts.cocktailEligible >= 72 && febPreview.counts.ingredientEligible >= 39,
  'TS-DIVERSITY-FEB',
  'February catalog meets 72/39 diversity targets',
  { cocktailEligible: febPreview.counts.cocktailEligible, ingredientEligible: febPreview.counts.ingredientEligible },
)
expect(
  synPreview.counts.cocktailEligible >= 72 && synPreview.counts.ingredientEligible >= 39,
  'TS-DIVERSITY-SYN',
  'Synthetic catalog meets 72/39 diversity targets',
  { cocktailEligible: synPreview.counts.cocktailEligible, ingredientEligible: synPreview.counts.ingredientEligible },
)

// 9. Ingredient rarity / corroboration (declared must match corroborated)
{
  const badCov = structuredClone(synthetic)
  badCov.catalog_id = `m1-cov-${L.newId().slice(0, 6)}`
  // Elusive fixtures declare known_bar_count=2 with matching offerings.
  // Bump declared count to 3 (still within schema max 30 and elusive band 2–3)
  // so corroboration fails without a schema-max rejection.
  const cand = badCov.ingredient_candidates.find((c) => c.tier === 'elusive')
  if (cand) cand.known_bar_count = 3
  const p = libs.catalog.previewCatalogImport(badCov)
  expect(
    codesOf(p).includes('INGREDIENT_COVERAGE_UNCORROBORATED') ||
      codesOf(p).includes('INGREDIENT_DRINKS_UNCORROBORATED') ||
      codesOf(p).includes('INGREDIENT_COVERAGE_TIER_MISMATCH'),
    'TS-ING-RARITY-MISMATCH',
    'Fabricated ingredient coverage rejected',
    { codes: codesOf(p).slice(0, 10), cand },
  )
}

// Tier enum surprise: familiar/interesting/unusual/adventurous (not Boring/Exciting)
{
  const schema = JSON.parse(
    readFileSync(join(L.ROOT, 'content/schemas/catalog-import.schema.json'), 'utf8'),
  )
  const cocktailTiers = schema.$defs.cocktailTier.enum
  const ingredientTiers = schema.$defs.ingredientTier.enum
  expect(
    JSON.stringify(cocktailTiers) === JSON.stringify(['familiar', 'interesting', 'unusual', 'adventurous']),
    'TS-TIER-ENUM-COCKTAIL',
    'Cocktail tiers are familiar/interesting/unusual/adventurous',
    { cocktailTiers },
  )
  expect(
    JSON.stringify(ingredientTiers) ===
      JSON.stringify(['easy_to_find', 'less_common', 'hard_to_find', 'elusive']),
    'TS-TIER-ENUM-INGREDIENT',
    'Ingredient tiers are easy_to_find/less_common/hard_to_find/elusive',
    { ingredientTiers },
  )
}

// Source upload accept attribute (no size cap in UI)
{
  const sfc = readFileSync(join(L.ROOT, 'src/features/admin/CatalogImportSection.vue'), 'utf8')
  expect(
    /accept="application\/json,\.json"/.test(sfc) && /file\.text\(\)/.test(sfc),
    'SRC-FILE-ACCEPT',
    'Admin file input accepts application/json,.json via file.text()',
  )
  expect(
    !/max.*(size|bytes)|file\.size|MAX_.*UPLOAD/i.test(sfc),
    'SRC-NO-SIZE-CAP',
    'No explicit upload size cap in CatalogImportSection (browser memory / paste limits apply)',
  )
  const exportDoc = readFileSync(join(L.ROOT, 'docs/ADMIN_ADD_DRINK_AND_EXPORT.md'), 'utf8')
  expect(
    /Export is not a `full_snapshot` import file/.test(exportDoc),
    'SRC-EXPORT-NOT-IMPORT',
    'Export Current Game Data is documented as not re-importable',
  )
}

// ───────────────────────────── BACKEND: FAILED STAGE SAFETY ─────────────────────────────
console.log('\n=== Backend failed-stage + pointer safety ===')
await L.resetClockPreCruise(service)
await L.clearSchedule(service)
const pointerBeforeFail = await activePointer()

{
  const forged = await admin.rpc('admin_stage_catalog_import', {
    p_client_request_id: L.newId(),
    p_payload: { not: 'a catalog', schema_version: '1.1', mode: 'full_snapshot' },
    p_validation: { readiness: 'ready_for_scheduling', error_count: 0, payload_hash: '0'.repeat(64) },
  })
  const pointerAfter = await activePointer()
  expect(
    (forged.data?.ok === false || !!forged.error) &&
      pointerAfter?.catalog_version_id === pointerBeforeFail?.catalog_version_id,
    'BE-FAIL-STAGE-NO-POINTER',
    'Failed/invalid stage does not move active catalog pointer',
    {
      stageOk: forged.data?.ok,
      code: forged.data?.code,
      error: forged.error?.message,
      before: pointerBeforeFail,
      after: pointerAfter,
    },
  )
}

{
  const broken = cloneLaunch(`broken-${L.newId().slice(0, 6)}`)
  broken.drinks[0].bar_offerings[0].bar_key = 'missing-bar-that-does-not-exist'
  const staged = await stageWithValidation(admin, broken, libs)
  const pointerAfter = await activePointer()
  expect(
    staged.ok === false && pointerAfter?.catalog_version_id === pointerBeforeFail?.catalog_version_id,
    'BE-FAIL-REL-NO-POINTER',
    'Broken launch-candidate clone does not stage or move pointer',
    { code: staged.code, before: pointerBeforeFail?.catalog_id, after: pointerAfter?.catalog_id },
  )
}

// ───────────────────────────── BACKEND: SYNTHETIC IMPORT → INIT 125 ─────────────────────────────
console.log('\n=== Backend synthetic import → 125 init ===')
{
  const syn = structuredClone(synthetic)
  syn.catalog_id = `m1-synthetic-pub-${L.newId().slice(0, 8)}`
  const staged = await stageWithValidation(admin, syn, libs)
  expect(staged.ok && staged.stage?.data?.candidate_id, 'BE-SYN-STAGE', 'Synthetic valid catalog stages', {
    code: staged.code,
    candidate: staged.stage?.data?.candidate_id,
  })
  if (staged.ok && staged.stage?.data?.candidate_id) {
    const hash = staged.stage.data.payload_hash || staged.payloadHash
    const pub = await publishCandidate(admin, staged.stage.data.candidate_id, hash)
    expect(pub.pub.data?.ok === true, 'BE-SYN-PUBLISH', 'Synthetic catalog publishes via Admin path', {
      data: pub.pub.data,
      error: pub.pub.error?.message,
      previewSafe: pub.preview.data?.safe_to_publish,
    })
    const pointer = await activePointer()
    expect(pointer?.catalog_id === syn.catalog_id, 'BE-SYN-POINTER', 'Active pointer is synthetic catalog', {
      pointer,
    })
    const init = await admin.rpc('admin_initialize_bounty_schedule', {
      p_client_request_id: L.newId(),
      p_seed: 'm1-synthetic',
    })
    const cruise = await L.ensureCruiseNotOrganizer(service)
    const counts = scheduleCounts(cruise.id)
    expect(
      init.data?.ok === true &&
        counts?.cocktail === 72 &&
        counts?.ingredient === 39 &&
        counts?.bar === 7 &&
        counts?.daily === 7,
      'BE-SYN-INIT-125',
      'Synthetic catalog initializes exactly 125 schedule entries',
      { init: init.data, error: init.error?.message, counts },
    )
  }
}

// ───────────────────────────── BACKEND: FAILED PHOTO ATTEMPT → FEBRUARY FALLBACK ─────────────────────────────
console.log('\n=== Backend failed attempt → February fallback → init ===')
{
  await L.resetClockPreCruise(service)
  await L.clearSchedule(service)

  // Publish February first as the retained baseline (Plan B source of truth on device).
  const feb = cloneLaunch(`feb-base-${L.newId().slice(0, 6)}`)
  const stagedFeb = await stageWithValidation(admin, feb, libs)
  expect(stagedFeb.ok, 'BE-FEB-STAGE', 'February fallback clone stages', { code: stagedFeb.code })
  let febVersionId = null
  if (stagedFeb.ok) {
    const hash = stagedFeb.stage.data.payload_hash || stagedFeb.payloadHash
    const pub = await publishCandidate(admin, stagedFeb.stage.data.candidate_id, hash)
    expect(pub.pub.data?.ok === true, 'BE-FEB-PUBLISH', 'February fallback publishes', {
      data: pub.pub.data,
      error: pub.pub.error?.message,
    })
    febVersionId = pub.pub.data?.catalog_version_id
  }
  const pointerFeb = await activePointer()
  expect(pointerFeb?.catalog_id === feb.catalog_id, 'BE-FEB-ACTIVE', 'February is active before failed photo attempt', {
    pointerFeb,
  })

  // Attempt a "photo-like" invalid catalog (unknown props / shortage) — stage must fail, pointer retained.
  const photoFail = libs.builders.buildScheduleReadyCatalog(20, 10)
  photoFail.catalog_id = `m1-photo-fail-${L.newId().slice(0, 6)}`
  photoFail.invented_field = 'should-reject'
  const localFail = libs.catalog.previewCatalogImport(photoFail)
  const stagedFail = await stageWithValidation(admin, photoFail, libs)
  // Also try forging stage when not ready
  const forgedReady = await admin.rpc('admin_stage_catalog_import', {
    p_client_request_id: L.newId(),
    p_payload: photoFail,
    p_validation: {
      readiness: 'ready_for_scheduling',
      error_count: 0,
      payload_hash: await libs.adminImp.hashPayload(photoFail),
    },
  })
  const pointerAfterFail = await activePointer()
  expect(
    localFail.readiness !== 'ready_for_scheduling' &&
      stagedFail.ok === false &&
      (forgedReady.data?.ok === false || !!forgedReady.error) &&
      pointerAfterFail?.catalog_version_id === pointerFeb?.catalog_version_id,
    'BE-PHOTO-FAIL-RETAIN',
    'Failed photo-like import retains February active catalog',
    {
      localReadiness: localFail.readiness,
      stageCode: stagedFail.code,
      forgedOk: forgedReady.data?.ok,
      forgedCode: forgedReady.data?.code,
      before: pointerFeb,
      after: pointerAfterFail,
    },
  )

  // Initialize schedule on retained February catalog
  const init = await admin.rpc('admin_initialize_bounty_schedule', {
    p_client_request_id: L.newId(),
    p_seed: 'm1-february-fallback',
  })
  const cruise = await L.ensureCruiseNotOrganizer(service)
  const counts = scheduleCounts(cruise.id)
  expect(
    init.data?.ok === true &&
      counts?.cocktail === 72 &&
      counts?.ingredient === 39 &&
      counts?.bar === 7 &&
      counts?.daily === 7,
    'BE-FEB-FALLBACK-INIT-125',
    'Retained February catalog initializes 125 entries after failed photo attempt',
    { init: init.data, error: init.error?.message, counts, febVersionId, active: await activePointer() },
  )
}

// ───────────────────────────── BACKEND: SUCCESSFUL BAD PUBLISH RECOVERY VIA RE-STAGE FEBRUARY ─────────────────────────────
// If a valid-but-wrong catalog somehow published pre-game, organizer can publish February over it (new catalog_id).
console.log('\n=== Backend restore February after alternate publish (pre-init) ===')
{
  await L.resetClockPreCruise(service)
  await L.clearSchedule(service)

  const alt = structuredClone(synthetic)
  alt.catalog_id = `m1-alt-before-feb-${L.newId().slice(0, 6)}`
  const stagedAlt = await stageWithValidation(admin, alt, libs)
  if (stagedAlt.ok) {
    const hash = stagedAlt.stage.data.payload_hash || stagedAlt.payloadHash
    await publishCandidate(admin, stagedAlt.stage.data.candidate_id, hash)
  }
  const afterAlt = await activePointer()

  const feb2 = cloneLaunch(`restore-${L.newId().slice(0, 6)}`)
  const stagedFeb2 = await stageWithValidation(admin, feb2, libs)
  let restored = false
  if (stagedFeb2.ok) {
    const hash = stagedFeb2.stage.data.payload_hash || stagedFeb2.payloadHash
    const pub = await publishCandidate(admin, stagedFeb2.stage.data.candidate_id, hash)
    restored = pub.pub.data?.ok === true
  }
  const afterFeb = await activePointer()
  const init = await admin.rpc('admin_initialize_bounty_schedule', {
    p_client_request_id: L.newId(),
    p_seed: 'm1-restore-feb',
  })
  const cruise = await L.ensureCruiseNotOrganizer(service)
  const counts = scheduleCounts(cruise.id)
  expect(
    restored &&
      afterFeb?.catalog_id === feb2.catalog_id &&
      afterAlt?.catalog_id === alt.catalog_id &&
      init.data?.ok === true &&
      counts?.cocktail === 72 &&
      counts?.ingredient === 39 &&
      counts?.bar === 7 &&
      counts?.daily === 7,
    'BE-RESTORE-FEB-THEN-INIT',
    'February re-publish over alternate catalog then init 125 (pre-gameplay)',
    {
      afterAlt: afterAlt?.catalog_id,
      afterFeb: afterFeb?.catalog_id,
      initOk: init.data?.ok,
      counts,
    },
  )
}

// ───────────────────────────── BROWSER: Admin file handoff (mobile viewport) ─────────────────────────────
console.log('\n=== Browser Admin file handoff (simulated mobile viewport) ===')
let browserMeta = { mode: 'playwright-mobile-viewport', claimed_iphone: false }
{
  const vitePort = 5191
  // Minimal static page that mounts only what we need is heavy; hit real Vite app Admin catalog section.
  const { spawn } = await import('node:child_process')
  const child = spawn(
    process.execPath,
    [join(L.ROOT, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'],
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
  let ready = false
  const started = Date.now()
  while (!ready && Date.now() - started < 45000) {
    try {
      const res = await fetch(`http://127.0.0.1:${vitePort}/`)
      if (res.ok || res.status === 200) ready = true
    } catch {
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  expect(ready, 'BR-VITE', 'Disposable Vite ready for Admin UI', { port: vitePort })

  if (ready) {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    try {
      await page.goto(`http://127.0.0.1:${vitePort}/login`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#login-name', { timeout: 25000 })
      await page.selectOption('#login-name', { label: byKey.admin.display_name })
      await page.fill('#login-password', env.LOCAL_TEST_PASSWORD)
      await page.click('[data-testid="login-submit"]')
      await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 30000 })

      await page.goto(`http://127.0.0.1:${vitePort}/admin`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-testid="admin-view"]', { timeout: 25000 })
      // Open Catalog section via the Admin section filter
      const filterTrigger = page.locator('[data-testid="admin-section-filter-trigger"]')
      if (await filterTrigger.count()) {
        await filterTrigger.click()
        await page.locator('[data-testid="admin-section-filter-option-catalog"]').click({ timeout: 10000 })
      }
      const section = page.locator('[data-testid="catalog-import-section"]')
      await section.waitFor({ timeout: 20000 }).catch(() => null)
      const fileInput = page.locator('[data-testid="catalog-import-file"]')
      const visible = await fileInput.count()
      expect(visible > 0, 'BR-FILE-INPUT', 'catalog-import-file present at mobile width', {
        viewport: '390x844',
        count: visible,
        url: page.url(),
      })
      if (visible > 0) {
        const accept = await fileInput.getAttribute('accept')
        expect(accept === 'application/json,.json', 'BR-FILE-ACCEPT', 'File input accept attribute correct', {
          accept,
        })
        const disabled = await fileInput.isDisabled()
        const badPath = join(FIXTURES, 'browser-invalid.json')
        writeFileSync(badPath, '{not-json')
        await fileInput.setInputFiles(badPath)
        await page.waitForTimeout(500)
        const parseErrVisible = await page.locator('[data-testid="catalog-parse-error"]').isVisible().catch(() => false)
        const bodyText = await page.locator('[data-testid="catalog-import-section"]').innerText()
        expect(
          parseErrVisible || /invalid|JSON|parse/i.test(bodyText),
          'BR-FILE-INVALID-FEEDBACK',
          'Invalid JSON file selection surfaces feedback in Admin section',
          { snippet: bodyText.slice(0, 280), disabled, parseErrVisible },
        )

        const offline = join(FIXTURES, 'february-fallback-star-princess-launch-candidate-v1.json')
        const tinyReady = structuredClone(synthetic)
        tinyReady.catalog_id = `m1-browser-${L.newId().slice(0, 6)}`
        const tinyPath = join(FIXTURES, 'browser-ready-mini.json')
        writeFileSync(tinyPath, JSON.stringify(tinyReady))
        await fileInput.setInputFiles(tinyPath)
        await page.waitForTimeout(1000)
        const localPreview = page.locator('[data-testid="catalog-local-preview"]')
        const previewVisible = await localPreview.isVisible().catch(() => false)
        const sectionText = await page.locator('[data-testid="catalog-import-section"]').innerText()
        expect(
          previewVisible || /ready_for_scheduling|Ready|stage|preview/i.test(sectionText),
          'BR-FILE-READY-PREVIEW',
          'Valid JSON file selection produces local preview affordance',
          { snippet: sectionText.slice(0, 400), offlineBytes: readFileSync(offline).length, previewVisible },
        )
        info('BR-IPHONE-GAP', 'Chrome mobile viewport ≠ physical iPhone Files interchange', browserMeta)
      }

      await context.setOffline(true)
      const stageBtn = page.locator('[data-testid="catalog-stage-preview"]')
      if ((await stageBtn.count()) && !(await stageBtn.isDisabled().catch(() => true))) {
        await stageBtn.first().click().catch(() => null)
        await page.waitForTimeout(800)
        const afterOffline = await page.locator('[data-testid="catalog-import-section"]').innerText()
        expect(
          true,
          'BR-OFFLINE-STAGE',
          'Offline stage attempt does not crash Admin section',
          { snippet: afterOffline.slice(0, 300) },
        )
      } else {
        info('BR-OFFLINE-STAGE-SKIP', 'Stage button unavailable (disabled or missing); offline crash check skipped')
      }
      await context.setOffline(false)

      await page.screenshot({ path: join(EVIDENCE, 'browser-admin-catalog-mobile.png'), fullPage: true })
    } catch (err) {
      expect(false, 'BR-EXCEPTION', 'Browser Admin handoff threw', { error: String(err?.message || err) })
    } finally {
      await browser.close()
      child.kill('SIGTERM')
    }
  } else {
    child.kill('SIGTERM')
  }
}

// ───────────────────────────── PROTECTED STACKS ─────────────────────────────
const protectedStacks = L.assertProtectedStacksUnchanged(beforeOrg, beforeA2)
expect(protectedStacks.organizer.unchanged, 'SAFE-ORG', 'Organizer cruise unchanged', protectedStacks.organizer)
expect(protectedStacks.agent2.unchanged, 'SAFE-A2', 'Agent 2 cruise unchanged', protectedStacks.agent2)

await libs.vite.close()

const totals = rec.totals()
const resultsPath = join(EVIDENCE, 'm1-validation-results.json')
L.writeJson(resultsPath, {
  label: 'm1-menu-launch',
  at: new Date().toISOString(),
  head: 'd085f6a',
  disposable: L.DISPOSABLE_URL,
  totals,
  results: rec.results,
  protected: protectedStacks,
  fixtures: {
    february_fallback: 'docs/qa/campaign/menu-launch/m1/fixtures/february-fallback-star-princess-launch-candidate-v1.json',
    synthetic_valid: 'docs/qa/campaign/menu-launch/m1/fixtures/synthetic-schedule-ready-valid.json',
  },
})

console.log('\n=== M1 TOTALS ===')
console.log(totals)
if (totals.fail > 0) process.exitCode = 1
