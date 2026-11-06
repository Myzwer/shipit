/**
 * Phase 7B1 Playwright: achievement unlock celebration over Gallery.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
 *   LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase7b1
 */
import { mkdir, readFile } from 'node:fs/promises'
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
const shotDir = join(__dir, '../docs/phase7b1-screenshots')
await mkdir(shotDir, { recursive: true })

async function seedCelebrationDefs() {
  await service.from('achievement_definitions').delete().eq('test_only', true)
  await service.from('achievement_definitions').insert([
    {
      stable_key: 'e2e-celebration-first-sip',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'milestones',
      title: 'E2E First Sip',
      display_description: 'Log any drink for the celebration popup.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'event_count',
      condition_config: { event: 'drink_log', threshold: 1 },
    },
    {
      stable_key: 'e2e-celebration-beer',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'E2E Beer Badge',
      display_description: 'Log a generic beer.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'exact_match',
      condition_config: { drink_mode: 'generic_beer' },
    },
  ])
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
  await seedCelebrationDefs()
  await loginAs(drinkOnly.display_name)

  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bar-list"]')
  await page.locator('[data-testid^="bar-row-"]').first().click()
  await page.click('[data-testid="drink-generic-beer"]')
  await page.click('[data-testid="friends-continue"]')
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="submit-drink"]:not([disabled])', { timeout: 30000 })
  await page.click('[data-testid="submit-drink"]')

  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 30000 })
  await page.waitForSelector('[data-testid="achievement-unlock-popup"]', { timeout: 15000 })
  const title = await page.locator('[data-testid="achievement-unlock-title"]').innerText()
  if (!/Achievement/.test(title)) throw new Error(`unexpected title: ${title}`)
  const items = await page.locator('[data-testid="achievement-unlock-item"]').count()
  if (items < 1) throw new Error('expected at least one unlock item')
  await page.screenshot({
    path: join(shotDir, 'phase7b1-celebration-batch.png'),
    fullPage: false,
  })
  pass('celebration-popup')

  await page.click('[data-testid="achievement-unlock-cta"]')
  await page.waitForURL(/\/drinkit\/achievements/, { timeout: 15000 })
  await page.waitForSelector('[data-testid="achievements-view"]')
  await page.waitForSelector(
    '[data-testid="achievements-mine-list"] [data-testid="achievement-card"]',
    { timeout: 20000 },
  )
  await page.screenshot({
    path: join(shotDir, 'phase7b1-my-achievements-after.png'),
    fullPage: false,
  })
  pass('see-them-navigates-mine')

  // Dismiss path: earn nothing new on gallery revisit — popup must not reappear.
  await page.goto(`${baseUrl}/drinkit/gallery`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const popupVisible = await page.locator('[data-testid="achievement-unlock-popup"]').count()
  if (popupVisible !== 0) throw new Error('popup reappeared after celebration')
  pass('no-duplicate-celebration')
} catch (err) {
  fail('uncaught', err instanceof Error ? err.message : String(err))
  await page.screenshot({ path: join(shotDir, 'phase7b1-FAIL.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
