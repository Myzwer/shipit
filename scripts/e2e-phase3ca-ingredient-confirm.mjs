/**
 * Phase 3C-A Playwright: confirm missing ingredient → submit → correction row.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
 *   LOCAL_TEST_PASSWORD='…' node scripts/e2e-phase3ca-ingredient-confirm.mjs [baseUrl]
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD')
  process.exit(1)
}

const envUrl = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!envUrl || !serviceKey) {
  console.error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const summary = JSON.parse(
  await readFile(join(dirname(fileURLToPath(import.meta.url)), '../.local/test-identities.json'), 'utf8'),
)
const drinkOnly = summary.identities.find((i) => i.key === 'drink_only')
const both = summary.identities.find((i) => i.key === 'both')
if (!drinkOnly || !both) {
  console.error('Missing identities')
  process.exit(1)
}

const service = createClient(envUrl, serviceKey, { auth: { persistSession: false } })

async function findMismatchTarget() {
  const { data: pointer } = await service
    .from('active_catalog_pointer')
    .select('catalog_version_id')
    .eq('id', 1)
    .single()
  const catalogId = pointer.catalog_version_id

  // Prefer current ship-time ingredient via player-shaped board after seed.
  const { data: offers } = await service
    .from('bounty_slot_offers')
    .select('id, ingredient_id, display_snapshot, exposed_at_utc, slot_id')
    .not('ingredient_id', 'is', null)
    .not('exposed_at_utc', 'is', null)
    .order('exposed_at_utc', { ascending: false })
    .limit(5)
  const offer = offers?.[0]
  if (!offer?.ingredient_id) throw new Error('no exposed ingredient offer')

  const { data: ing } = await service
    .from('ingredients')
    .select('canonical_key')
    .eq('id', offer.ingredient_id)
    .single()

  const { data: catalogOfferings } = await service
    .from('catalog_version_offerings')
    .select('offering_id')
    .eq('catalog_version_id', catalogId)
    .limit(200)

  for (const row of catalogOfferings ?? []) {
    const { data: has } = await service
      .from('catalog_offering_ingredients')
      .select('ingredient_id')
      .eq('catalog_version_id', catalogId)
      .eq('offering_id', row.offering_id)
      .eq('ingredient_id', offer.ingredient_id)
      .maybeSingle()
    if (has) continue

    const { data: offering } = await service
      .from('bar_offerings')
      .select('id, bar_id, drink_concept_id')
      .eq('id', row.offering_id)
      .single()
    const { data: bar } = await service
      .from('bars')
      .select('canonical_key')
      .eq('id', offering.bar_id)
      .single()
    const { data: concept } = await service
      .from('catalog_version_drink_concepts')
      .select('display_name')
      .eq('catalog_version_id', catalogId)
      .eq('drink_concept_id', offering.drink_concept_id)
      .maybeSingle()
    if (!bar?.canonical_key || !concept?.display_name) continue
    return {
      barKey: bar.canonical_key,
      offeringId: offering.id,
      drinkName: concept.display_name,
      ingredientKey: ing.canonical_key,
      ingredientId: offer.ingredient_id,
      offerId: offer.id,
    }
  }
  throw new Error('no mismatch offering found')
}

const target = await findMismatchTarget()
console.log('target', target.barKey, target.drinkName, target.ingredientKey)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()
const results = []

function pass(name) {
  results.push({ name, ok: true })
  console.log(`PASS ${name}`)
}
function fail(name, detail) {
  results.push({ name, ok: false, detail })
  console.error(`FAIL ${name}: ${detail}`)
}

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.selectOption('#login-name', { label: drinkOnly.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 20000 })

  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="log-wizard"]')

  // If recovery modal from prior run, retry/clear via exit isn't available — force clear storage.
  await page.evaluate(() => localStorage.removeItem('star-princess.drinkit.pendingDrinkSubmit.v1'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bar-list"]')

  await page.click(`[data-testid="bar-row-${target.barKey}"]`)
  await page.waitForSelector('[data-testid="wizard-drink-step"]')
  await page.click(`[data-testid="drink-row-${target.offeringId}"]`)
  pass('selected-mismatch-drink')

  await page.waitForSelector('[data-testid="wizard-friends-step"]')
  await page.click(`[data-testid="friend-row-${both.player_id}"]`)
  await page.click('[data-testid="friends-continue"]')

  await page.waitForSelector('[data-testid="photo-unavailable"]')
  await page.click('[data-testid="photo-continue"]')

  await page.waitForSelector('[data-testid="wizard-review-step"]')
  await page.waitForSelector('[data-testid="ingredient-mismatch-link"]', { timeout: 20000 })
  pass('mismatch-link-visible')

  await page.click('[data-testid="ingredient-mismatch-link"]')
  await page.waitForSelector('[data-testid="modal-ingredient-confirm"]')
  await page.click('[data-testid="modal-primary"]')
  pass('confirmed-yes')

  await page.waitForSelector('[data-testid="bounty-row-ingredient"][data-state="selected"], [data-testid="bounty-row-ingredient"][data-state="available"]', {
    timeout: 20000,
  })
  const ingState = await page.getAttribute('[data-testid="bounty-row-ingredient"]', 'data-state')
  if (ingState === 'available') {
    await page.click('[data-testid="bounty-row-ingredient"]')
  }
  pass(`ingredient-row-${ingState}`)

  await page.click('[data-testid="submit-drink"]')
  const unclaimed = page.locator('[data-testid="modal-unclaimed"]')
  if (await unclaimed.isVisible().catch(() => false)) {
    await page.click('[data-testid="modal-primary"]')
  }

  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 30000 })
  const submissionId = await page.getAttribute('[data-testid="gallery-submission-card"]', 'data-submission-id')
  if (!submissionId) throw new Error('missing submission id')
  pass('submitted')

  const { data: sub } = await service
    .from('submissions')
    .select('result_json')
    .eq('id', submissionId)
    .single()
  const points = sub?.result_json?.awarded_points
  if (!(typeof points === 'number' && points > 0)) throw new Error(`expected points, got ${points}`)
  pass(`awarded-${points}`)

  const { data: corrections, error: cErr } = await service
    .from('ingredient_corrections')
    .select('id, offering_id, ingredient_id, active, source_submission_id')
    .eq('offering_id', target.offeringId)
    .eq('ingredient_id', target.ingredientId)
  if (cErr) throw cErr
  if (!corrections?.length || !corrections[0].active) throw new Error('correction missing')
  if (corrections[0].source_submission_id !== submissionId) throw new Error('source submission mismatch')
  pass('db-correction')

  // Recovery: write a fake pending and reload wizard — should show Retry, not new intent.
  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.evaluate(
    ({ key, playerId, barKey }) => {
      localStorage.setItem(
        'star-princess.drinkit.pendingDrinkSubmit.v1',
        JSON.stringify({
          version: 1,
          clientRequestId: key,
          playerId,
          cruiseConfigId: null,
          payload: {
            idempotency_key: key,
            bar_canonical_key: barKey,
            drink: { mode: 'generic_beer' },
            companion_player_ids: [],
            bar_eligible_companion_ids: [],
            selected_claims: [],
            caption: null,
            photo_storage_key: null,
          },
          summary: { barName: 'Recovery Bar', drinkName: 'Recovery Drink' },
          createdAt: new Date().toISOString(),
        }),
      )
    },
    { key: crypto.randomUUID(), playerId: drinkOnly.player_id, barKey: target.barKey },
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="modal-unknown"]', { timeout: 15000 })
  pass('pending-recovery-modal')
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
const total = results.length
console.log(`${passed}/${total} passed`)
process.exit(passed === total && total > 0 ? 0 : 1)
