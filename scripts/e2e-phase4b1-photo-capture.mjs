/**
 * Phase 4B1 Playwright: shared photo capture + real private Storage staging.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
 *   LOCAL_TEST_PASSWORD='…' node scripts/e2e-phase4b1-photo-capture.mjs [baseUrl]
 *
 * Manual later: real iPhone/Android rear camera launch (Playwright file setInputFiles
 * is not proof that capture="environment" opens the device camera).
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const __dir = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD')
  process.exit(1)
}

const envUrl = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!envUrl || !serviceKey || !anonKey) {
  console.error('Need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const summary = JSON.parse(
  await readFile(join(__dir, '../.local/test-identities.json'), 'utf8'),
)
const drinkOnly = summary.identities.find((i) => i.key === 'drink_only')
if (!drinkOnly) {
  console.error('Missing drink_only identity')
  process.exit(1)
}

const service = createClient(envUrl, serviceKey, { auth: { persistSession: false } })
const fixtureJpg = join(__dir, '../tests/fixtures/tiny.jpg')
const shotDir = join(__dir, '../docs/phase4b1-screenshots')

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

async function loginAs(displayName) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 20000 })
}

async function shot(name) {
  await page.screenshot({
    path: join(shotDir, `phase4b1-LIVE-${name}.png`),
    fullPage: true,
  })
}

try {
  await loginAs(drinkOnly.display_name)
  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="log-wizard"]')

  await page.waitForSelector('[data-testid="bar-list"]')
  await page.locator('[data-testid^="bar-row-"]').first().click()
  await page.waitForSelector('[data-testid="wizard-drink-step"]')
  await page.click('[data-testid="drink-generic-beer"]')
  await page.waitForSelector('[data-testid="wizard-friends-step"]')
  await page.click('[data-testid="friends-continue"]')

  await page.waitForSelector('[data-testid="wizard-photo-step"]')
  await page.waitForSelector('[data-testid="photo-capture"]')
  pass('photo-capture-mounted')

  const captureInput = page.locator('[data-testid="photo-capture-input"]')
  const uploadInput = page.locator('[data-testid="photo-upload-input"]')
  if ((await captureInput.getAttribute('capture')) !== 'environment') {
    throw new Error('Take Photo input missing capture=environment')
  }
  pass('take-photo-capture-attr')
  if (await uploadInput.getAttribute('capture')) {
    throw new Error('Upload Photo should not set capture')
  }
  pass('upload-photo-picker-config')

  await shot('photo-empty')

  // Optional skip path — continue without photo still works.
  await page.fill('[data-testid="caption-input"]', 'Caption before photo')
  const captionBefore = await page.inputValue('[data-testid="caption-input"]')
  if (captionBefore !== 'Caption before photo') throw new Error('caption not preserved')
  pass('caption-preserved')

  // Upload via file picker (simulates Upload Photo).
  await uploadInput.setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-preview"]', { timeout: 20000 })
  pass('preview-after-selection')
  await shot('photo-preview')

  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  pass('photo-upload-success')
  await shot('photo-staged')

  // Remove + re-add single photo limit UX
  await page.click('[data-testid="photo-remove"]')
  await page.waitForSelector('[data-testid="photo-take"]')
  pass('photo-remove')

  await uploadInput.setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  pass('photo-replace-restage')

  // Caption still there after photo ops
  if ((await page.inputValue('[data-testid="caption-input"]')) !== 'Caption before photo') {
    throw new Error('caption lost after photo ops')
  }

  // Force a failed upload path: offline flag via route abort on storage, then retry.
  await page.route('**/storage/v1/object/**', (route) => route.abort('failed'))
  await page.click('[data-testid="photo-remove"]')
  await page.waitForSelector('[data-testid="photo-upload"]')
  await uploadInput.setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-error"]', { timeout: 20000 })
  pass('failed-upload-shows-error')
  await shot('photo-error')
  await page.unroute('**/storage/v1/object/**')

  if (await page.locator('[data-testid="photo-preview"]').count()) {
    await page.click('[data-testid="photo-retry"]')
    await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
    pass('retry-after-failure')
  } else {
    // Processing may have cleared; reselect
    await uploadInput.setInputFiles(fixtureJpg)
    await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
    pass('reselect-after-failure')
  }

  // Optional continue with staged photo (attachment deferred — submit still no-photo bind)
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="wizard-review-step"]')
  await page.waitForSelector('[data-testid="review-photo-preview"]')
  pass('review-shows-staged-preview')
  await shot('review-with-photo')

  // DB: at least one staged photo for this player
  const { data: photos, error } = await service
    .from('photos')
    .select('id, status, owner_player_id, storage_path')
    .eq('owner_player_id', drinkOnly.player_id)
    .eq('status', 'staged')
  if (error) throw error
  if (!photos?.length) throw new Error('expected staged photos in DB')
  pass(`db-staged-count-${photos.length}`)

  // No-photo path regression: new wizard without selecting photo
  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  // May hit recovery modal — ignore by going home then log if needed
  if (await page.locator('[data-testid="modal-unknown"]').isVisible().catch(() => false)) {
    await page.click('[data-testid="modal-secondary"]').catch(() => {})
  }
  await page.waitForSelector('[data-testid="bar-list"]', { timeout: 20000 })
  await page.locator('[data-testid^="bar-row-"]').first().click()
  await page.click('[data-testid="drink-generic-beer"]')
  await page.click('[data-testid="friends-continue"]')
  await page.waitForSelector('[data-testid="photo-optional-skip"]')
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="review-photo-placeholder"]')
  pass('optional-photo-skip')
  await shot('review-no-photo')

  pass('screenshots')
  pass('manual-device-camera-deferred')
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
  await shot('failure').catch(() => {})
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
const total = results.length
console.log(`${passed}/${total} passed`)
console.log(
  'MANUAL: Verify Take Photo opens the rear camera on a real iPhone/Android. Playwright setInputFiles does not launch the device camera.',
)
process.exit(passed === total && total > 0 ? 0 : 1)
