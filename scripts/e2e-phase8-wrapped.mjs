/**
 * Phase 8 Playwright: Awards Mode nav + Wrapped intro/results.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
 *   LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase8
 */
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import ws from 'ws'

const __dir = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
const envUrl = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!password || !envUrl || !serviceKey || !anonKey) {
  console.error('Need LOCAL_TEST_PASSWORD + Supabase env (VITE_SUPABASE_URL, keys)')
  process.exit(1)
}

function readSupabaseEnv() {
  const raw = execSync('npx supabase status -o env', { encoding: 'utf8' })
  const env = {}
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  return env
}

const sbEnv = readSupabaseEnv()
const summary = JSON.parse(
  await readFile(join(__dir, '../.local/test-identities.json'), 'utf8'),
)
const drinkOnly = summary.identities.find((i) => i.key === 'drink_only')
const shipOnly = summary.identities.find((i) => i.key === 'ship_only')
const both = summary.identities.find((i) => i.key === 'both')
const service = createClient(envUrl || sbEnv.API_URL, serviceKey || sbEnv.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
})

const shotDir = join(__dir, '../docs/phase8-screenshots')
await mkdir(shotDir, { recursive: true })

// Latch finale for UI rehearsal (development-only cruise).
const { data: cfg } = await service
  .from('cruise_config')
  .select('id, day1_ship_date, base_ship_offset_minutes')
  .eq('is_active', true)
  .single()
const day1 = new Date(`${cfg.day1_ship_date}T00:00:00Z`)
day1.setUTCDate(day1.getUTCDate() + 6)
const day7 = day1.toISOString().slice(0, 10)
const ship = new Date(`${day7}T18:00:00Z`)
const finaleUtc = new Date(ship.getTime() - cfg.base_ship_offset_minutes * 60_000).toISOString()

await service.rpc('dev_get_ship_clock_state_at', {
  p_at_utc: finaleUtc,
  p_apply_lifecycle_side_effects: true,
})
await service.from('wrapped_reveals').delete().neq('player_id', '00000000-0000-0000-0000-000000000000')

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
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
}

try {
  // Drink It! intro
  await loginAs(drinkOnly.display_name)
  await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wrapped-intro"], [data-testid="wrapped-results"]', {
    timeout: 20000,
  })
  const drinkIntro = await page.locator('[data-testid="wrapped-intro"]').count()
  if (drinkIntro) {
    await page.screenshot({ path: join(shotDir, 'drinkit-wrapped-intro.png'), fullPage: true })
    pass('drinkit-intro')
    await page.click('[data-testid="wrapped-start"]')
    await page.waitForSelector('[data-testid="wrapped-results"]', { timeout: 15000 })
  } else {
    pass('drinkit-already-revealed')
  }
  await page.screenshot({ path: join(shotDir, 'drinkit-wrapped-results.png'), fullPage: true })
  if (await page.locator('[data-testid="wrapped-leaderboard"]').count()) {
    await page.screenshot({ path: join(shotDir, 'drinkit-final-leaderboard.png'), fullPage: true })
    pass('leaderboard-visible')
  } else {
    fail('leaderboard-visible', 'missing on drinkit results')
  }
  if (await page.locator('[data-testid="wrapped-award-card"]').count()) {
    await page.screenshot({ path: join(shotDir, 'drinkit-group-awards.png'), fullPage: true })
    pass('group-awards-visible')
  } else {
    pass('group-awards-empty-ok')
  }
  const nav = page.locator('nav[data-awards-mode="true"]')
  if ((await nav.count()) === 0) fail('awards-nav', 'missing data-awards-mode')
  else pass('awards-nav')
  const navKeys = await page.locator('[data-testid="nav-item"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-nav')),
  )
  if (navKeys.join(',') === 'wrapped,gallery,achievements') pass('three-tab-nav')
  else fail('three-tab-nav', navKeys.join(','))

  // Achievements still reachable
  await page.click('[data-nav="achievements"]')
  await page.waitForURL(/achievements/, { timeout: 10000 })
  await page.screenshot({ path: join(shotDir, 'drinkit-achievements-finale.png'), fullPage: true })
  pass('achievements-reachable')

  // Ship It! intro (independent reveal)
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  // sign out via storage clear
  await context.clearCookies()
  await page.evaluate(() => localStorage.clear())
  await loginAs(shipOnly.display_name)
  await page.goto(`${baseUrl}/shipit`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wrapped-intro"], [data-testid="wrapped-results"]', {
    timeout: 20000,
  })
  if (await page.locator('[data-testid="wrapped-intro"]').count()) {
    await page.screenshot({ path: join(shotDir, 'shipit-wrapped-intro.png'), fullPage: true })
    pass('shipit-intro')
    await page.click('[data-testid="wrapped-start"]')
    await page.waitForSelector('[data-testid="wrapped-results"]', { timeout: 15000 })
  } else {
    pass('shipit-already-revealed')
  }
  await page.screenshot({ path: join(shotDir, 'shipit-wrapped-results.png'), fullPage: true })

  // Dual-game independent reveals
  await context.clearCookies()
  await page.evaluate(() => localStorage.clear())
  await loginAs(both.display_name)
  await page.goto(`${baseUrl}/drinkit/wrapped`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wrapped-intro"], [data-testid="wrapped-results"]', {
    timeout: 20000,
  })
  pass('dual-drink-wrapped')
  await page.goto(`${baseUrl}/shipit/wrapped`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="wrapped-intro"], [data-testid="wrapped-results"]', {
    timeout: 20000,
  })
  pass('dual-ship-wrapped')

  // Ensure Ship It! results for dual user, then nav screenshot
  if (await page.locator('[data-testid="wrapped-intro"]').count()) {
    await page.click('[data-testid="wrapped-start"]')
    await page.waitForSelector('[data-testid="wrapped-results"]', { timeout: 15000 })
  }
  await page.screenshot({ path: join(shotDir, 'shipit-final-leaderboard.png'), fullPage: true })
  await page.screenshot({ path: join(shotDir, 'post-finale-navigation.png') })
  pass('nav-screenshot')
} catch (err) {
  fail('e2e-crash', err instanceof Error ? err.message : String(err))
  await page.screenshot({ path: join(shotDir, 'phase8-error.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2))
process.exit(failed.length ? 1 : 0)
