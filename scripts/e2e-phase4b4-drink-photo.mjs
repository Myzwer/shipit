/**
 * Phase 4B4 Playwright: ordinary drink log optional photo + recovery.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase4b4
 */
import { mkdir } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const __dir = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
const envUrl = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!password || !envUrl || !serviceKey || !anonKey) {
  console.error('Need LOCAL_TEST_PASSWORD + Supabase env')
  process.exit(1)
}

const summary = JSON.parse(
  await readFile(join(__dir, '../.local/test-identities.json'), 'utf8'),
)
const drinkOnly = summary.identities.find((i) => i.key === 'drink_only')
const service = createClient(envUrl, serviceKey, { auth: { persistSession: false } })

const fixtureJpg = join(__dir, '../tests/fixtures/tiny.jpg')
const shotDir = join(__dir, '../docs/phase4b4-screenshots')
await mkdir(shotDir, { recursive: true })

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

async function wizardThroughFriends() {
  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="log-wizard"]')
  await page.waitForSelector('[data-testid="bar-list"]')
  await page.locator('[data-testid^="bar-row-"]').first().click()
  await page.waitForSelector('[data-testid="wizard-drink-step"]')
  await page.click('[data-testid="drink-generic-beer"]')
  await page.waitForSelector('[data-testid="wizard-friends-step"]')
  await page.click('[data-testid="friends-continue"]')
  await page.waitForSelector('[data-testid="wizard-photo-step"]')
}

try {
  await loginAs(drinkOnly.display_name)

  // No-photo ordinary log — no extra friction.
  await wizardThroughFriends()
  await page.waitForSelector('[data-testid="photo-optional-skip"]')
  await page.fill('[data-testid="caption-input"]', 'No photo caption')
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="wizard-review-step"]')
  await page.waitForSelector('[data-testid="review-photo-placeholder"]')
  pass('no-photo-placeholder')
  await page.click('[data-testid="submit-drink"]')
  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 30000 })
  await page.waitForSelector('[data-testid="gallery-submission-card"]')
  const noPhotoImg = await page.locator('[data-testid="gallery-photo"]').count()
  if (noPhotoImg > 0) throw new Error('expected placeholder, got photo')
  pass('no-photo-submit-gallery')

  // Take/Upload → preview → Review → real Gallery photo.
  await wizardThroughFriends()
  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  pass('photo-staged')
  await page.fill('[data-testid="caption-input"]', 'With photo')
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="review-photo-preview"]')
  await page.screenshot({
    path: join(shotDir, 'phase4b4-LIVE-review-with-photo.png'),
    fullPage: true,
  })
  pass('review-photo-preview')

  await page.click('[data-testid="submit-drink"]')
  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 30000 })
  await page.waitForSelector('[data-testid="gallery-photo"]', { timeout: 30000 })
  const subId = new URL(page.url()).searchParams.get('submission')
  await page.screenshot({
    path: join(shotDir, 'phase4b4-LIVE-gallery-with-photo.png'),
    fullPage: true,
  })
  pass('gallery-real-photo')

  const { data: bound } = await service
    .from('photos')
    .select('id, status, purpose')
    .eq('bound_submission_id', subId)
    .eq('status', 'bound')
  if (!bound?.length || bound[0].purpose !== 'drink_log') {
    throw new Error('expected bound drink_log photo')
  }
  pass('db-bound-drink-log-photo')

  // Explicit optional-photo removal.
  await wizardThroughFriends()
  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  await page.click('[data-testid="photo-remove"]')
  await page.waitForSelector('[data-testid="photo-optional-skip"]')
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="review-photo-placeholder"]')
  pass('explicit-photo-remove')

  // Staging failure → Retry (abort confirm_photo_upload).
  await wizardThroughFriends()
  await page.route('**/rest/v1/rpc/confirm_photo_upload**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'simulated staging failure' }),
    })
  })
  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-retry"]', {
    timeout: 30000,
  })
  pass('staging-failure-retry')
  await page.unroute('**/rest/v1/rpc/confirm_photo_upload**')
  // User can still continue without photo (honor > friction).
  const removeBtn = page.locator('[data-testid="photo-remove"]')
  if (await removeBtn.count()) await removeBtn.click()
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="wizard-review-step"]')
  pass('continue-after-staging-fail-without-implying-photo')

  // Lost submit response → reload → same-UUID recovery.
  await wizardThroughFriends()
  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="wizard-review-step"]')
  // Wait for preview ready so submit enables.
  await page.waitForSelector('[data-testid="submit-drink"]:not([disabled])', { timeout: 30000 })

  let acceptedId = null
  await page.route('**/rest/v1/rpc/submit_drink**', async (route) => {
    const response = await route.fetch()
    const json = await response.json()
    if (json?.ok && json?.submission_id) acceptedId = json.submission_id
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'simulated lost response' }),
    })
  })
  await page.click('[data-testid="submit-drink"]')
  await page.waitForSelector('[data-testid="modal-unknown"]', { timeout: 30000 })
  const pending = await page.evaluate(() =>
    localStorage.getItem('star-princess.drinkit.pendingDrinkSubmit.v1'),
  )
  if (!pending) throw new Error('pending drink submit missing')
  pass('lost-submit-pending')
  await page.unroute('**/rest/v1/rpc/submit_drink**')

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="modal-unknown"]', { timeout: 20000 })
  const pendingAfter = await page.evaluate(() =>
    localStorage.getItem('star-princess.drinkit.pendingDrinkSubmit.v1'),
  )
  if (!pendingAfter) throw new Error('pending lost on reload')
  await page.click('[data-testid="modal-primary"]')
  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 30000 })
  const recovered = new URL(page.url()).searchParams.get('submission')
  if (acceptedId && recovered !== acceptedId) {
    throw new Error(`recovered ${recovered} != accepted ${acceptedId}`)
  }
  pass('lost-submit-same-uuid-recovery')
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
  await page
    .screenshot({ path: join(shotDir, 'phase4b4-LIVE-drink-photo-failure.png'), fullPage: true })
    .catch(() => {})
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length && results.length > 0 ? 0 : 1)
