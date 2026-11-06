/**
 * Phase 7B2 Playwright: working catalog unlock + celebration with real titles.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
 *   npm run db:load-working-achievements
 *   LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase7b2
 */
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

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

const summary = JSON.parse(
  await readFile(join(__dir, '../.local/test-identities.json'), 'utf8'),
)
const drinkOnly = summary.identities.find((i) => i.key === 'drink_only')
const service = createClient(envUrl, serviceKey, { auth: { persistSession: false } })
const shotDir = join(__dir, '../docs/phase7b2-screenshots')
await mkdir(shotDir, { recursive: true })

// Ensure working catalog is loaded (idempotent).
execSync('npm run db:load-working-achievements', {
  cwd: join(__dir, '..'),
  stdio: 'inherit',
  env: { ...process.env, ...readSupabaseEnv() },
})

// Clear prior awards/logs for drink_only so first-sip celebration is clean.
await service.from('achievement_awards').delete().eq('owner_player_id', drinkOnly.player_id)
await service.from('drink_logs').delete().eq('player_id', drinkOnly.player_id)
// Also clear gallery events for this player if needed — awards delete is enough for unlock.

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
  const body = await page.locator('[data-testid="achievement-unlock-card"]').innerText()
  if (!/Wasted away again in Margaritaville/.test(body)) {
    throw new Error(`missing D-001 title in celebration: ${body.slice(0, 200)}`)
  }
  if (!/Can’t beat the classics|Can't beat the classics/.test(body)) {
    throw new Error(`missing D-035 title in celebration: ${body.slice(0, 200)}`)
  }
  await page.screenshot({
    path: join(shotDir, 'phase7b2-celebration-working-titles.png'),
    fullPage: false,
  })
  pass('working-title-celebration')

  await page.click('[data-testid="achievement-unlock-cta"]')
  await page.waitForURL(/\/drinkit\/achievements/, { timeout: 15000 })
  await page.waitForSelector(
    '[data-testid="achievements-mine-list"] [data-testid="achievement-card"]',
    { timeout: 20000 },
  )
  const mine = await page.locator('[data-testid="achievements-mine-list"]').innerText()
  if (!/Wasted away again in Margaritaville/.test(mine)) {
    throw new Error('My Achievements missing working D-001 title')
  }
  await page.screenshot({
    path: join(shotDir, 'phase7b2-my-achievements-working.png'),
    fullPage: false,
  })
  pass('my-achievements-working-titles')

  await page.click('[data-testid="achievements-tab-all"]')
  await page.waitForSelector('[data-testid="achievements-group-milestones"], [data-testid="achievement-card"]', {
    timeout: 20000,
  })
  await page.screenshot({
    path: join(shotDir, 'phase7b2-all-achievements.png'),
    fullPage: false,
  })
  pass('all-achievements-lists')
} catch (err) {
  fail('uncaught', err instanceof Error ? err.message : String(err))
  await page.screenshot({ path: join(shotDir, 'phase7b2-FAIL.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
