/**
 * Daily Challenge visual bug-fix verification — Ship Time row + caption field.
 * Captures confirm + capture steps at 360 / 402 / 430 CSS px.
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-daily-visual-fixes.mjs [baseUrl] [before|after]
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'
import ws from 'ws'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const phase = process.argv[3] === 'before' ? 'before' : 'after'
const outDir = join(root, 'docs/daily-visual-fixes', phase)
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  readFileSync(join(root, '.local/runtime-qual-password.txt'), 'utf8').trim()
const baseUrl = process.argv[2] || 'http://localhost:5173'
const widths = [
  { name: '360', width: 360, height: 800 },
  { name: '402', width: 402, height: 874 },
  { name: '430', width: 430, height: 932 },
]

if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD or .local/runtime-qual-password.txt')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })

const envText = execSync('npx supabase status -o env', { encoding: 'utf8' })
const apiUrl = envText.match(/^API_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
const serviceKey = envText.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
const service = createClient(apiUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

const summary = JSON.parse(readFileSync(join(root, '.local/test-identities.json'), 'utf8'))
const player =
  summary.identities.find(
    (i) => i.key === 'katie_forrester' && (i.games || []).includes('drinkit'),
  ) ||
  summary.identities.find((i) => !i.is_admin && (i.games || []).includes('drinkit'))
if (!player) throw new Error('No Drink It! player identity found')

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
}

await alignDay(1)

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

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  ...devices['iPhone 12'],
  viewport: { width: 402, height: 874 },
})
const page = await context.newPage()

await login(page, player.display_name)
const launch = await page.$('[data-testid="launch-drinkit"]')
if (launch) await launch.click()
await page.goto(`${baseUrl}/drinkit/daily?ts=${Date.now()}`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="daily-claim-page"]', { timeout: 20000 })
await page.waitForSelector('[data-testid="daily-confirm-step"], [data-testid="daily-already-claimed"], [data-testid="daily-error"]', {
  timeout: 20000,
})

const results = {
  phase,
  player: player.key,
  widths: {},
}

for (const vp of widths) {
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await page.waitForTimeout(300)

  const shipTimeCount = await page.locator('[data-testid="ship-time-indicator"]').count()
  const meetupOrAnnouncement =
    (await page.locator('[data-testid="daily-announcement"]').count()) +
    (await page.locator('[data-testid="daily-location"]').count())

  await page.screenshot({
    path: join(outDir, `confirm-${vp.name}.png`),
    fullPage: false,
  })

  const confirmExists = (await page.locator('[data-testid="daily-confirm-yes"]').count()) > 0
  let captionBg = null
  let captionClasses = null

  if (confirmExists) {
    await page.click('[data-testid="daily-confirm-yes"]')
    await page.waitForSelector('[data-testid="daily-capture-step"]', { timeout: 10000 })
    await page.waitForSelector('[data-testid="daily-caption"]', { timeout: 10000 })
    await page.waitForTimeout(250)

    captionClasses = await page.getByTestId('daily-caption').getAttribute('class')
    captionBg = await page.getByTestId('daily-caption').evaluate((el) => {
      const cs = getComputedStyle(el)
      return { backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage }
    })

    await page.locator('[data-testid="daily-caption"]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(outDir, `capture-${vp.name}.png`),
      fullPage: false,
    })

    // Return to confirm for next viewport (fresh navigation keeps state consistent).
    await page.goto(`${baseUrl}/drinkit/daily?ts=${Date.now()}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="daily-confirm-step"], [data-testid="daily-already-claimed"]', {
      timeout: 20000,
    })
  }

  results.widths[vp.name] = {
    shipTimeCount,
    meetupOrAnnouncement,
    captionBg,
    captionClasses,
    hasWhiteCaptionClass: captionClasses?.includes('bg-white') ?? false,
  }
}

await browser.close()

const reportPath = join(outDir, 'report.json')
writeFileSync(reportPath, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
console.log(`PASS daily-visual-fixes (${phase}) →`, outDir)
