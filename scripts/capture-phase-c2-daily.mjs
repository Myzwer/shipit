/**
 * Phase C2 screenshots — All Hands + announcement, Bring a Friend, Admin editor.
 * Viewport-only (no fullPage) to avoid infinite-scroll blowups.
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-phase-c2-daily.mjs [baseUrl]
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'
import ws from 'ws'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'docs/phase-c2-daily')
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  readFileSync(join(root, '.local/runtime-qual-password.txt'), 'utf8').trim()
const baseUrl = process.argv[2] || 'http://localhost:5173'
const widths = [
  { name: '360', width: 360, height: 800 },
  { name: '390', width: 390, height: 844 },
  { name: '402', width: 402, height: 874 },
  { name: '430', width: 430, height: 932 },
]

if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD or .local/runtime-qual-password.txt')
  process.exit(1)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const envText = execSync('npx supabase status -o env', { encoding: 'utf8' })
const apiUrl = envText.match(/^API_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
const anonKey = envText.match(/^ANON_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
const serviceKey = envText.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
const service = createClient(apiUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

const summary = JSON.parse(readFileSync(join(root, '.local/test-identities.json'), 'utf8'))
const organizer = summary.identities.find((i) => i.is_admin)
if (!organizer) throw new Error('No admin identity in test-identities.json')

async function alignDay(cruiseDay) {
  const now = Date.now()
  const shipDate = new Date(now).toISOString().slice(0, 10)
  const target = Date.parse(`${shipDate}T13:30:00Z`)
  const offset = Math.round((target - now) / 60_000)
  const day1 = new Date(`${shipDate}T12:00:00Z`)
  day1.setUTCDate(day1.getUTCDate() - (cruiseDay - 1))
  const clock = await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: day1.toISOString().slice(0, 10),
    p_base_offset_minutes: offset,
    p_label: 'development-only',
  })
  if (clock.error) throw clock.error
  const pause = await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  if (pause.error) throw pause.error
  const daily = await service.rpc('dev_seed_daily_assignments')
  if (daily.error) throw daily.error
  const check = await service.rpc('dev_get_current_daily_challenge_at', {
    p_at_utc: new Date().toISOString(),
  })
  if (check.error) throw check.error
  if (check.data?.cruise_day !== cruiseDay) {
    throw new Error(
      `alignDay(${cruiseDay}) landed on cruise_day=${check.data?.cruise_day} title=${check.data?.title}`,
    )
  }
  return offset
}

await alignDay(1)

const authClient = createClient(apiUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})
const { data: adminAuth, error: adminAuthErr } = await authClient.auth.signInWithPassword({
  email: organizer.login_alias,
  password,
})
if (adminAuthErr) throw adminAuthErr
const adminClient = createClient(apiUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${adminAuth.session.access_token}` } },
  realtime: { transport: ws },
})
const set = await adminClient.rpc('admin_set_daily_challenge_announcement', {
  p_day_number: 1,
  p_announcement: 'Meet @ 3 PM',
  p_client_request_id: crypto.randomUUID(),
})
if (set.error || !set.data?.ok) {
  throw new Error(`announce failed: ${set.error?.message || set.data?.code}`)
}

async function login(page, displayName) {
  await page.context().clearCookies()
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
  })
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#login-name', { timeout: 20000 })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
}

async function gotoDrinkHome(page) {
  const launch = await page.$('[data-testid="launch-drinkit"]')
  if (launch) await launch.click()
  else await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bounty-carousel"]', { timeout: 20000 })
  await page.waitForTimeout(500)
}

async function focusDailyCard(page) {
  const card = page.locator('[data-testid="bounty-card-daily"]')
  await card.first().scrollIntoViewIfNeeded()
  await card.first().click()
  await page.waitForTimeout(400)
}

async function shot(page, name, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.waitForTimeout(250)
  await page.screenshot({
    path: join(outDir, `${name}-${viewport.name}.png`),
    fullPage: false,
  })
}

async function shotAll(page, name) {
  for (const vp of widths) await shot(page, name, vp)
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  ...devices['iPhone 12'],
  viewport: { width: 390, height: 844 },
})
const page = await context.newPage()

await login(page, organizer.display_name)
await gotoDrinkHome(page)
await focusDailyCard(page)
await shotAll(page, 'all-hands-home')
await page.setViewportSize({ width: 1024, height: 900 })
await page.screenshot({ path: join(outDir, 'all-hands-home-desktop.png'), fullPage: false })

await page.goto(`${baseUrl}/drinkit/daily`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="daily-claim-page"]', { timeout: 20000 })
await page.waitForSelector('[data-testid="daily-title"]', { timeout: 20000 })
const allHandsTitle = await page.getByTestId('daily-title').innerText()
if (allHandsTitle.trim() !== 'Tequila Shot') {
  throw new Error(`Expected Tequila Shot, got ${allHandsTitle}`)
}
await shotAll(page, 'all-hands-claim')

await alignDay(3)
// Hard reload so the SPA cannot keep a Day-1 Daily Challenge from the prior cruise config.
await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="bounty-carousel"]', { timeout: 20000 })
await focusDailyCard(page)
await shotAll(page, 'bring-friend-home')

await page.goto(`${baseUrl}/drinkit/daily?ts=${Date.now()}`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="daily-title"]', { timeout: 20000 })
await page.waitForFunction(
  () => document.querySelector('[data-testid="daily-title"]')?.textContent?.trim() === 'Irish Pub Pick',
  null,
  { timeout: 15000 },
)
const friendTitle = await page.getByTestId('daily-title').innerText()
const friendMode = await page.getByTestId('daily-mode').innerText()
if (friendTitle.trim() !== 'Irish Pub Pick') {
  throw new Error(`Expected Irish Pub Pick, got ${friendTitle}`)
}
if (!/bring a friend/i.test(friendMode)) {
  throw new Error(`Expected Bring a Friend mode, got ${friendMode}`)
}
await shotAll(page, 'bring-friend-claim')

await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="daily-announcements-section"]', { timeout: 20000 })
await page.locator('[data-testid="daily-announcements-section"]').scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await shotAll(page, 'admin-announcements')
await page.setViewportSize({ width: 1024, height: 900 })
await page.locator('[data-testid="daily-announcements-section"]').scrollIntoViewIfNeeded()
await page.screenshot({ path: join(outDir, 'admin-announcements-desktop.png'), fullPage: false })

await browser.close()

// Leave development-only cruise on Tuesday-ish day 4 for organizer demo continuity.
await alignDay(4)
console.log('PASS phase-c2-daily screenshots →', outDir)
