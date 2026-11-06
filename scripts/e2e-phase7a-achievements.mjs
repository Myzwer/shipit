/**
 * Phase 7A Playwright: Achievements lists, unread, gallery award card.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
 *   # Seed test catalog via service role (integration helper pattern) before run, or
 *   # rely on empty production list + nav wiring checks.
 *   LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase7a
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
const shotDir = join(__dir, '../docs/phase7a-screenshots')
await mkdir(shotDir, { recursive: true })

async function seedMinimalCatalog() {
  await service.from('achievement_definitions').delete().eq('test_only', true)
  await service.from('achievement_definitions').insert({
    stable_key: 'e2e-first-drink',
    game: 'drinkit',
    owner_type: 'player',
    group_key: 'milestones',
    title: 'E2E First Sip',
    display_description: 'Log any drink.',
    secret: false,
    exclusive: false,
    enabled: true,
    test_only: true,
    condition_type: 'event_count',
    condition_config: { event: 'drink_log', threshold: 1 },
  })
}

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

try {
  await seedMinimalCatalog()

  await loginAs(drinkOnly.display_name)
  await page.goto(`${baseUrl}/drinkit/achievements`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="achievements-view"]')
  pass('achievements-route')

  await page.click('[data-testid="achievements-tab-all"]')
  await page.waitForSelector('[data-testid="achievement-card"]', { timeout: 15000 })
  pass('all-achievements-list')

  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bar-list"]')
  await page.locator('[data-testid^="bar-row-"]').first().click()
  await page.click('[data-testid="drink-generic-beer"]')
  await page.click('[data-testid="friends-continue"]')
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="submit-drink"]:not([disabled])', { timeout: 30000 })
  await page.click('[data-testid="submit-drink"]')
  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 30000 })
  await page.waitForSelector('[data-testid="gallery-achievement-card"]', { timeout: 20000 })
  pass('gallery-achievement-card')

  await page.goto(`${baseUrl}/drinkit/achievements`, { waitUntil: 'networkidle' })
  await page.click('[data-testid="achievements-tab-mine"]')
  await page.waitForSelector('[data-testid="achievement-card"][data-earned="true"]', {
    timeout: 15000,
  })
  pass('my-achievements-earned')
  await page.screenshot({ path: join(shotDir, 'phase7a-LIVE-achievements.png'), fullPage: true })

  // Dot should clear after My Achievements load
  const dot = page.locator('[data-testid="achievements-unread-dot"]')
  if ((await dot.count()) === 0) pass('unread-cleared')
  else fail('unread-cleared', 'dot still visible')

  await context.clearCookies()
  await page.evaluate(() => localStorage.clear())
  await loginAs(both.display_name)
  await page.goto(`${baseUrl}/shipit/achievements`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="achievements-view"][data-game="shipit"]')
  pass('shipit-achievements-route')
} catch (e) {
  fail('uncaught', e instanceof Error ? e.message : String(e))
  await page.screenshot({ path: join(shotDir, 'phase7a-FAIL.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
