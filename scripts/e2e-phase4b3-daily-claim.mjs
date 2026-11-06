/**
 * Phase 4B3 Playwright: Home Daily Claim It → photo → submit → gallery.
 */
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
const drink = summary.identities.find((i) => i.key === 'drink_only')
const service = createClient(envUrl, serviceKey, { auth: { persistSession: false } })

const fixtureJpg = join(__dir, '../tests/fixtures/tiny.jpg')
const shotDir = join(__dir, '../docs/phase4b3-screenshots')
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
  await page.selectOption('#login-name', { label: drink.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 20000 })

  await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bounty-claim"]')

  // Find Daily card Claim It (enabled)
  const cards = page.locator('.bounty-card')
  const count = await cards.count()
  let claimed = false
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i)
    const heading = await card.locator('h3').first().textContent().catch(() => '')
    const btn = card.locator('[data-testid="bounty-claim"]')
    if ((await btn.isEnabled()) && (await card.textContent())?.includes('Daily')) {
      await btn.click()
      claimed = true
      break
    }
    void heading
  }
  if (!claimed) {
    // Carousel may show Daily off-center — scroll to last real card
    await page.evaluate(() => {
      const track = document.querySelector('.bounty-track')
      if (track) track.scrollLeft = track.scrollWidth
    })
    await page.waitForTimeout(400)
    const dailyBtn = page.locator('.bounty-card').filter({ hasText: 'Daily Challenge' }).locator('[data-testid="bounty-claim"]').first()
    await dailyBtn.click()
  }

  await page.waitForSelector('[data-testid="daily-claim-page"]', { timeout: 15000 })
  pass('opened-daily')
  await page.waitForSelector('[data-testid="daily-instructions"]')
  pass('instructions-shown')
  await page.click('[data-testid="daily-confirm-yes"]')
  await page.waitForSelector('[data-testid="daily-capture-step"]')

  const cont = page.locator('[data-testid="daily-continue-review"]')
  if (await cont.isEnabled()) throw new Error('continue should be disabled without photo')
  pass('photo-required')

  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  await page.fill('[data-testid="daily-caption"]', 'E2E daily caption')
  await cont.click()
  await page.waitForSelector('[data-testid="daily-review-step"]')
  await page.screenshot({ path: join(shotDir, 'phase4b3-LIVE-daily-review.png'), fullPage: true })
  pass('review')

  await page.click('[data-testid="daily-submit"]')
  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 30000 })
  await page.waitForSelector('[data-testid="gallery-submission-card"][data-kind="daily"]')
  const points = await page.locator('[data-testid="gallery-points"]').textContent()
  if (!points?.includes('50')) throw new Error(`expected 50 points, got ${points}`)
  pass('gallery-50')
  await page.screenshot({ path: join(shotDir, 'phase4b3-LIVE-daily-gallery.png'), fullPage: true })

  const { count: claims } = await service
    .from('bounty_claims')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', drink.player_id)
    .eq('category', 'daily')
    .eq('status', 'active')
  if (claims !== 1) throw new Error(`expected 1 daily claim, got ${claims}`)
  pass('db-claim')

  await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
  // Claimed state — Daily Claim It disabled
  await page.waitForTimeout(800)
  pass('home-returned')
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
  await page.screenshot({ path: join(shotDir, 'phase4b3-LIVE-daily-failure.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length && results.length > 0 ? 0 : 1)
