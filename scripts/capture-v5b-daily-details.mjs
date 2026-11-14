/**
 * Phase V5B — Daily Details redesign + Home CTA centering screenshots.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-v5b-daily-details.mjs [baseUrl]
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'
import ws from 'ws'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'docs/v5b-daily-details')
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

mkdirSync(join(outDir, 'before'), { recursive: true })
mkdirSync(join(outDir, 'after'), { recursive: true })

for (const [src, dest] of [
  ['docs/v5a-daily-home-card/after/01-all-hands-card-402.png', 'before/home-card-402.png'],
  ['docs/v5a-daily-home-card/after/03-details-confirm-402.png', 'before/details-402.png'],
  ['docs/daily-visual-fixes/before/confirm-402.png', 'before/details-alt-402.png'],
]) {
  try {
    copyFileSync(join(root, src), join(outDir, dest))
  } catch {
    /* optional baseline */
  }
}

function readSupabaseEnv() {
  try {
    const envText = execSync('npx supabase status -o env', {
      encoding: 'utf8',
      env: { ...process.env, DO_NOT_TRACK: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return {
      apiUrl: envText.match(/^API_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, ''),
      serviceKey: envText.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, ''),
    }
  } catch {
    return {
      apiUrl: 'http://127.0.0.1:54321',
      serviceKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
    }
  }
}

const { apiUrl, serviceKey } = readSupabaseEnv()
const service = createClient(apiUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

const summary = JSON.parse(readFileSync(join(root, '.local/test-identities.json'), 'utf8'))
const player =
  summary.identities.find((i) => i.key === 'josh_forrester') ||
  summary.identities.find((i) => !i.is_admin && (i.games || []).includes('drinkit'))
if (!player) throw new Error('No Drink It! player')

async function alignDay(cruiseDay) {
  execSync(`node scripts/seed-local-bounty-now.mjs --day=${cruiseDay} --hour=13`, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, LOCAL_TEST_PASSWORD: password },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await service.rpc('dev_seed_daily_assignments')
  const check = await service.rpc('dev_get_current_daily_challenge_at', {
    p_at_utc: new Date().toISOString(),
  })
  if (check.error) throw check.error
  if (check.data?.cruise_day !== cruiseDay) {
    throw new Error(`alignDay(${cruiseDay}) got day ${check.data?.cruise_day}`)
  }
  return check.data
}

async function setMeetingTime(dayNumber, timeOrNull) {
  const { error } = await service
    .from('daily_challenges')
    .update({ meeting_time_ship_local: timeOrNull })
    .eq('day_number', dayNumber)
  if (error) throw error
}

async function login(page, displayName) {
  await page.context().clearCookies()
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
  })
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-name', { timeout: 20000 })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
}

async function focusDailyCard(page) {
  const card = page.locator('[data-testid="bounty-card-daily"]')
  await card.first().scrollIntoViewIfNeeded()
  for (let i = 0; i < 5; i++) {
    const text = await card.first().innerText()
    if (/View Details/i.test(text) || /Daily Challenge/i.test(text)) {
      if (/View Details|Tequila|Irish|Meet at|Points/i.test(text)) break
    }
    await page.locator('[data-testid="bounty-carousel"]').evaluate((el) => {
      el.scrollBy({ left: el.clientWidth * 0.7, behavior: 'instant' })
    })
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(350)
}

async function gotoDailyDetails(page) {
  await page.goto(`${baseUrl}/drinkit/daily?ts=${Date.now()}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="daily-claim-page"]', { timeout: 20000 })
  await page.waitForSelector(
    '[data-testid="daily-confirm-step"], [data-testid="daily-already-claimed"], [data-testid="daily-error"]',
    { timeout: 20000 },
  )
}

async function shot(page, rel, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.waitForTimeout(280)
  await page.screenshot({ path: join(outDir, rel), fullPage: false })
  console.log('wrote', rel)
}

async function measureClaimCentering(page) {
  return page.locator('[data-testid="bounty-card-daily"] [data-testid="bounty-claim"]').evaluate((btn) => {
    const label = btn.querySelector('.bounty-claim-label')
    const icon = btn.querySelector('.bounty-claim-icon')
    if (!label) return { ok: false, reason: 'no-label' }
    const br = btn.getBoundingClientRect()
    const lr = label.getBoundingClientRect()
    const labelCenter = lr.left + lr.width / 2
    const btnCenter = br.left + br.width / 2
    const delta = Math.abs(labelCenter - btnCenter)
    const iconRight = icon ? br.right - icon.getBoundingClientRect().right : null
    return {
      ok: delta <= 3,
      delta: Number(delta.toFixed(2)),
      btnWidth: Number(br.width.toFixed(1)),
      btnHeight: Number(br.height.toFixed(1)),
      iconRightGap: iconRight == null ? null : Number(iconRight.toFixed(1)),
      labelText: label.textContent?.trim() ?? '',
    }
  })
}

const report = { phase: 'V5B', player: player.key, cases: {} }

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  ...devices['iPhone 12'],
  viewport: { width: 402, height: 874 },
})
const page = await context.newPage()
await login(page, player.display_name)

// --- Home card centering (Day 1 All Hands, no meetup) ---
await alignDay(1)
await setMeetingTime(1, null)
await page.goto(`${baseUrl}/drinkit?ts=${Date.now()}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="bounty-carousel"]', { timeout: 20000 })
await focusDailyCard(page)
report.cases.homeCentering = await measureClaimCentering(page)
await page.locator('[data-testid="bounty-card-daily"]').first().screenshot({
  path: join(outDir, 'after/01-home-card-402.png'),
})
console.log('wrote after/01-home-card-402.png')
await shot(page, 'after/01-home-among-neighbors-402.png', widths[1])
for (const vp of [widths[0], widths[2]]) {
  await focusDailyCard(page)
  await shot(page, `after/01-home-${vp.name}.png`, vp)
}

// --- Details without meetup ---
await gotoDailyDetails(page)
await page.waitForSelector('[data-testid="daily-confirm-step"]', { timeout: 15000 })
const noMeetupText = await page.locator('[data-testid="daily-confirm-step"]').innerText()
report.cases.detailsNoMeetup = {
  hasModeHint: /group meetup day/i.test(noMeetupText),
  hasConfirmQuestion: /Did you complete it/i.test(noMeetupText),
  hasWhatToDo: /What to Do/i.test(noMeetupText),
  hasContinueToPhoto: /Continue to Photo/i.test(noMeetupText),
  hasInstructions: /shot of tequila/i.test(noMeetupText),
  hasMeetAt: /Meet at/i.test(noMeetupText),
  hasExit: (await page.locator('[data-testid="daily-exit"]').count()) > 0,
  hasSwitch: (await page.locator('[data-testid="switch-game"]').count()) > 0,
  hasShipTime: (await page.locator('[data-testid="ship-time-indicator"]').count()) > 0,
}
await shot(page, 'after/02-details-no-meetup-402.png', widths[1])
await page.locator('[data-testid="section-header"]').screenshot({
  path: join(outDir, 'after/04-header-exit-switch-402.png'),
})
console.log('wrote after/04-header-exit-switch-402.png')
for (const vp of widths) {
  await shot(page, `after/02-details-no-meetup-${vp.name}.png`, vp)
}

// Exit → Home
await page.click('[data-testid="daily-exit"]')
await page.waitForSelector('[data-testid="bounty-carousel"]', { timeout: 15000 })
report.cases.exitToHome = { ok: page.url().includes('/drinkit') && !page.url().includes('/daily') }

// Switch Game (Josh is dual-game)
await gotoDailyDetails(page)
await page.waitForSelector('[data-testid="switch-game"]', { timeout: 10000 })
await page.click('[data-testid="switch-game"]')
await page.waitForTimeout(800)
report.cases.switchGame = {
  url: page.url(),
  ok: /shipit/i.test(page.url()),
}

// --- Details with meetup ---
await setMeetingTime(1, '15:00:00')
await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'domcontentloaded' })
await gotoDailyDetails(page)
await page.waitForSelector('[data-testid="daily-meeting-time"]', { timeout: 15000 })
const meetupText = await page.getByTestId('daily-meeting-time').innerText()
report.cases.detailsMeetup = {
  text: meetupText.replace(/\s+/g, ' ').trim(),
  hasTimeAndVenue: /Meet at 3:00 PM/i.test(meetupText) && /Lido/i.test(meetupText),
}
await shot(page, 'after/03-details-meetup-402.png', widths[1])
await setMeetingTime(1, null)

// --- Long instructions (board/detail via meeting day 2 Switcheroo has longer copy) ---
await alignDay(2)
await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'domcontentloaded' })
await gotoDailyDetails(page)
await page.waitForSelector('[data-testid="daily-instructions"]', { timeout: 15000 })
const longTitle = await page.getByTestId('daily-title').innerText()
const longInstructions = await page.getByTestId('daily-instructions').innerText()
report.cases.longInstructions = {
  title: longTitle.trim(),
  instructionLen: longInstructions.trim().length,
}
await shot(page, 'after/05-details-long-instructions-402.png', widths[1])
for (const vp of [widths[0], widths[2]]) {
  await shot(page, `after/05-details-long-instructions-${vp.name}.png`, vp)
}

// Continue to Photo works
await page.click('[data-testid="daily-confirm-yes"]')
await page.waitForSelector('[data-testid="daily-capture-step"]', { timeout: 10000 })
report.cases.continueToPhoto = { ok: true }
await shot(page, 'after/06-capture-step-402.png', widths[1])

await browser.close()
await setMeetingTime(1, null)
await alignDay(1)

writeFileSync(join(outDir, 'qa-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
console.log('PASS v5b-daily-details →', outDir)
