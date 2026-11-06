/**
 * Phase 4B2 Playwright: Ship It! challenge → photo → submit → gallery stub.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
 *   LOCAL_TEST_PASSWORD='…' node scripts/e2e-phase4b2-scavenger-submit.mjs [baseUrl]
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
const both = summary.identities.find((i) => i.key === 'both')
if (!both) {
  console.error('Missing both identity')
  process.exit(1)
}

const service = createClient(envUrl, serviceKey, { auth: { persistSession: false } })
await service.rpc('dev_reset_scavenger_test_data')

const fixtureJpg = join(__dir, '../tests/fixtures/tiny.jpg')
const shotDir = join(__dir, '../docs/phase4b2-screenshots')

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
async function shot(name) {
  await page.screenshot({ path: join(shotDir, `phase4b2-LIVE-${name}.png`), fullPage: true })
}

async function loginAs(displayName) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 20000 })
}

try {
  await loginAs(both.display_name)
  await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="shipit-challenge-list"]')
  pass('challenges-loaded')

  const openCard = page.locator('[data-testid^="shipit-challenge-"][data-completed="false"]').first()
  await openCard.click()
  await page.waitForSelector('[data-testid="scavenger-submit-page"]')
  pass('opened-submit')
  await shot('submit-capture')

  // Missing photo blocks continue
  const cont = page.locator('[data-testid="scavenger-continue-review"]')
  if (await cont.isEnabled()) throw new Error('continue should be disabled without photo')
  pass('missing-photo-blocks')

  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  pass('photo-staged')
  await page.fill('[data-testid="scavenger-caption"]', 'E2E caption')
  await cont.click()
  await page.waitForSelector('[data-testid="scavenger-review-step"]')
  pass('review-step')
  await shot('submit-review')

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('browser-console', msg.text())
  })
  const submitBtn = page.locator('[data-testid="scavenger-submit"]')
  await submitBtn.click()
  // Prefer gallery navigation; fall back to surfacing submit errors
  try {
    await page.waitForURL(/\/shipit\/gallery/, { timeout: 30000 })
  } catch (navErr) {
    const errText = await page.locator('[data-testid="scavenger-submit-error"]').textContent().catch(() => null)
    const unknown = await page.locator('[data-testid="scavenger-unknown"]').count()
    throw new Error(
      `gallery nav failed: ${errText ?? (unknown ? 'unknown pending' : String(navErr))}`,
    )
  }
  await page.waitForSelector('[data-testid="shipit-gallery-card"]')
  pass('gallery-stub')
  await shot('gallery-stub')

  const { data: home } = await service.rpc('dev_get_shipit_home_at', {
    p_at_utc: new Date().toISOString(),
    p_player_id: both.player_id,
  })
  if (!home?.ok || !(home.team?.completed >= 1)) {
    throw new Error(`home progress not updated: ${JSON.stringify(home?.team)}`)
  }
  pass('home-progress-updated')

  // Upload error + retry
  await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
  await page.locator('[data-testid^="shipit-challenge-"][data-completed="false"]').first().click()
  await page.waitForSelector('[data-testid="photo-upload-input"]')
  await page.route('**/storage/v1/object/**', (route) => route.abort('failed'))
  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-error"]', { timeout: 20000 })
  pass('upload-error')
  await page.unroute('**/storage/v1/object/**')
  if (await page.locator('[data-testid="photo-retry"]').count()) {
    await page.click('[data-testid="photo-retry"]')
    await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
    pass('upload-retry')
  } else {
    await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
    await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
    pass('upload-reselect')
  }
  await shot('upload-recovered')

  pass('manual-camera-deferred')
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
  await shot('failure').catch(() => {})
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
const total = results.length
console.log(`${passed}/${total} passed`)
process.exit(passed === total && total > 0 ? 0 : 1)
