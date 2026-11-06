/**
 * Phase 5A Playwright: Gallery feed, reactions, photo viewer, unread.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
 *   LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase5a
 */
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

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
const both = summary.identities.find((i) => i.key === 'both')
const service = createClient(envUrl, serviceKey, { auth: { persistSession: false } })
const fixtureJpg = join(__dir, '../tests/fixtures/tiny.jpg')
const shotDir = join(__dir, '../docs/phase5a-screenshots')
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

async function wizardNoPhotoSubmit() {
  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bar-list"]')
  await page.locator('[data-testid^="bar-row-"]').first().click()
  await page.click('[data-testid="drink-generic-beer"]')
  await page.click('[data-testid="friends-continue"]')
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="submit-drink"]:not([disabled])', { timeout: 30000 })
  await page.click('[data-testid="submit-drink"]')
  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 30000 })
}

async function wizardWithPhotoSubmit() {
  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bar-list"]')
  await page.locator('[data-testid^="bar-row-"]').first().click()
  await page.click('[data-testid="drink-generic-beer"]')
  await page.click('[data-testid="friends-continue"]')
  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="submit-drink"]:not([disabled])', { timeout: 30000 })
  await page.click('[data-testid="submit-drink"]')
  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 30000 })
}

try {
  await loginAs(drinkOnly.display_name)
  await wizardNoPhotoSubmit()
  await page.waitForSelector('[data-testid="gallery-feed"]')
  await page.waitForSelector('[data-testid="gallery-post"]')
  await page.waitForSelector('[data-testid="gallery-post-placeholder"]')
  pass('drink-no-photo-post')

  await wizardWithPhotoSubmit()
  await page.waitForSelector('[data-testid="gallery-post-photo"]', { timeout: 30000 })
  pass('drink-with-photo-post')
  await page.screenshot({ path: join(shotDir, 'phase5a-LIVE-drink-gallery.png'), fullPage: true })

  await page.click('[data-testid="gallery-post-photo"]')
  await page.waitForSelector('[data-testid="gallery-photo-viewer"]')
  await page.waitForSelector('[data-testid="gallery-photo-download"]')
  pass('photo-viewer')
  await page.click('[data-testid="gallery-photo-close"]')

  const firstPost = page.locator('[data-testid="gallery-post"]').first()
  await firstPost.locator('[data-testid="gallery-react-heart"]').click()
  await page.waitForTimeout(400)
  const heartPressed = await firstPost
    .locator('[data-testid="gallery-react-heart"]')
    .getAttribute('aria-pressed')
  if (heartPressed !== 'true') throw new Error('heart not selected')
  pass('reaction-add')
  await firstPost.locator('[data-testid="gallery-react-laugh"]').click()
  await page.waitForTimeout(400)
  pass('reaction-change')
  await firstPost.locator('[data-testid="gallery-react-laugh"]').click()
  await page.waitForTimeout(400)
  pass('reaction-remove')

  await page.click('[data-testid="gallery-filter-mine"]')
  await page.waitForSelector('[data-testid="gallery-post"]')
  pass('filter-mine')
  await page.click('[data-testid="gallery-filter-everyone"]')

  // Seed peer post for unread (service-role timed submit)
  const offering = await service.from('bar_offerings').select('id, bar_id').limit(1).single()
  const bar = await service.from('bars').select('canonical_key').eq('id', offering.data.bar_id).single()
  const peerSub = await service.rpc('dev_submit_drink_at', {
    p_payload: {
      idempotency_key: randomUUID(),
      bar_canonical_key: bar.data.canonical_key,
      drink: { mode: 'named_catalog', offering_id: offering.data.id },
      companion_player_ids: [],
      bar_eligible_companion_ids: [],
      selected_claims: [],
      caption: 'peer unread',
      photo_storage_key: null,
    },
    p_at_utc: new Date().toISOString(),
    p_player_id: both.player_id,
  })
  if (!peerSub.data?.ok) throw new Error(`peer submit failed: ${peerSub.data?.code ?? peerSub.error?.message}`)

  await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const dots = await page.locator('[data-testid="gallery-unread-dot"]').count()
  if (dots < 1) throw new Error('expected gallery unread dot')
  pass('unread-dot')

  await page.locator('[data-nav="gallery"]').click()
  await page.waitForSelector('[data-testid="gallery-feed"]')
  await page.waitForTimeout(800)
  const dotsAfter = await page.locator('[data-testid="gallery-unread-dot"]').count()
  if (dotsAfter > 0) throw new Error('Everyone load should clear unread')
  pass('everyone-clears-unread')

  // Ship It gallery
  await context.clearCookies()
  await page.evaluate(() => localStorage.clear())
  await loginAs(both.display_name)
  await page.goto(`${baseUrl}/shipit/gallery`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="gallery-feed"][data-game="shipit"]')
  pass('shipit-gallery-opens')
  await page.screenshot({ path: join(shotDir, 'phase5a-LIVE-ship-gallery.png'), fullPage: true })
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
  await page
    .screenshot({ path: join(shotDir, 'phase5a-LIVE-failure.png'), fullPage: true })
    .catch(() => {})
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length && results.length > 0 ? 0 : 1)
