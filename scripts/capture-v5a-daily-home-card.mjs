/**
 * Phase V5A — Daily Challenge Home card simplification screenshots.
 *
 * Captures before/after references, meetup-time fixture, neighboring cards,
 * Details confirmation, claimed + overnight states at 360 / 402 / 430.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-v5a-daily-home-card.mjs [baseUrl]
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'
import ws from 'ws'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'docs/v5a-daily-home-card')
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
mkdirSync(join(outDir, 'before'), { recursive: true })
mkdirSync(join(outDir, 'after'), { recursive: true })

// Preserve C2 overloaded card as the before baseline when available.
const beforeSrc = join(root, 'docs/phase-c2-daily/all-hands-home-402.png')
try {
  copyFileSync(beforeSrc, join(outDir, 'before/all-hands-home-402.png'))
  console.log('copied before baseline from phase-c2-daily')
} catch {
  console.warn('no phase-c2 before baseline found; continuing')
}

function readSupabaseEnv() {
  try {
    const envText = execSync('npx supabase status -o env', {
      encoding: 'utf8',
      env: { ...process.env, DO_NOT_TRACK: '1', SUPABASE_INTERNAL_NO_TELEMETRY: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return {
      apiUrl: envText.match(/^API_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, ''),
      serviceKey: envText.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, ''),
    }
  } catch {
    // Local demo defaults when `supabase status` cannot write telemetry.
    return {
      apiUrl: 'http://127.0.0.1:54321',
      serviceKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
    }
  }
}

const { apiUrl, serviceKey } = readSupabaseEnv()
if (!apiUrl || !serviceKey) throw new Error('Missing Supabase API URL / service role key')
const service = createClient(apiUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

const summary = JSON.parse(readFileSync(join(root, '.local/test-identities.json'), 'utf8'))
const player =
  summary.identities.find((i) => i.key === 'josh_forrester') ||
  summary.identities.find((i) => !i.is_admin && (i.games || []).includes('drinkit'))
if (!player) throw new Error('No Drink It! player identity found')

async function alignDay(cruiseDay) {
  // Seed Cocktail/Ingredient slots for the requested cruise day so Home stays "active".
  const seed = execSync(`node scripts/seed-local-bounty-now.mjs --day=${cruiseDay} --hour=13`, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, LOCAL_TEST_PASSWORD: password },
  })
  console.log(seed.trim().split('\n').slice(-3).join('\n'))
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
  else await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="bounty-carousel"]', { timeout: 20000 })
  await page.waitForTimeout(500)
}

async function reloadDrinkHome(page) {
  await page.goto(`${baseUrl}/drinkit?ts=${Date.now()}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="bounty-carousel"]', { timeout: 20000 })
  await page.waitForTimeout(500)
}

async function focusDailyCard(page) {
  const card = page.locator('[data-testid="bounty-card-daily"]')
  await card.first().scrollIntoViewIfNeeded()
  // Click toward the right edge of the carousel track to advance to Daily.
  for (let i = 0; i < 4; i++) {
    const text = await card.first().innerText()
    if (/Daily Challenge/i.test(text) && /Points/i.test(text)) break
    await page.locator('[data-testid="bounty-carousel"]').evaluate((el) => {
      el.scrollBy({ left: el.clientWidth * 0.7, behavior: 'instant' })
    })
    await page.waitForTimeout(350)
  }
  await page.waitForTimeout(400)
}

async function shot(page, relPath, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.waitForTimeout(280)
  await page.screenshot({
    path: join(outDir, relPath),
    fullPage: false,
  })
  console.log('wrote', relPath)
}

async function shotCard(page, relPath, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.waitForTimeout(280)
  const card = page.locator('[data-testid="bounty-card-daily"]').first()
  await card.screenshot({ path: join(outDir, relPath) })
  console.log('wrote', relPath)
}

const report = {
  phase: 'V5A',
  player: player.key,
  cases: {},
  limitations: [
    'Final schedule seeds meeting_time_ship_local as null for all 7 days.',
    'Home only shows structured meeting_time_ship_local; free-text admin_announcement meetup notes remain on Details only and are not parsed into Home times.',
  ],
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  ...devices['iPhone 12'],
  viewport: { width: 402, height: 874 },
})
const page = await context.newPage()

await login(page, player.display_name)

// --- 1 + 2: All Hands Tequila Shot (no structured meetup) ---
const day1 = await alignDay(1)
await setMeetingTime(1, null)
await reloadDrinkHome(page)
await focusDailyCard(page)
const allHandsText = await page.locator('[data-testid="bounty-card-daily"]').first().innerText()
report.cases.allHands = {
  title: day1.title,
  hasAllHands: /All Hands/i.test(allHandsText),
  hasViewDetails: /View Details/i.test(allHandsText),
  hasClaimIt: /\bClaim It\b/i.test(allHandsText),
  hasAvailableUntil: /Available until/i.test(allHandsText),
  hasInstructions: /shot of tequila/i.test(allHandsText),
  hasLocationPrefix: /Location:/i.test(allHandsText),
  textSnippet: allHandsText.replace(/\s+/g, ' ').slice(0, 220),
}
await shotCard(page, 'after/01-all-hands-card-402.png', widths[1])
for (const vp of widths) {
  await focusDailyCard(page)
  await shot(page, `after/01-all-hands-home-${vp.name}.png`, vp)
}

// Neighboring bounties context (Daily focused, peeks visible)
await focusDailyCard(page)
await shot(page, 'after/02-among-neighbors-402.png', widths[1])

// Details still has full instructions
await page.goto(`${baseUrl}/drinkit/daily?ts=${Date.now()}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="daily-claim-page"]', { timeout: 20000 })
await page.waitForSelector('[data-testid="daily-title"], [data-testid="daily-already-claimed"], [data-testid="daily-error"]', {
  timeout: 20000,
})
const detailsTitle = await page.getByTestId('daily-title').innerText().catch(() => null)
const detailsInstructions = await page.getByTestId('daily-instructions').innerText().catch(() => null)
const detailsLocation = await page.getByTestId('daily-location').innerText().catch(() => null)
const detailsPoints = await page.getByTestId('daily-points').innerText().catch(() => null)
report.cases.detailsRetain = {
  title: detailsTitle,
  hasInstructions: Boolean(detailsInstructions),
  instructionsSnippet: detailsInstructions?.slice(0, 120) ?? null,
  location: detailsLocation,
  points: detailsPoints,
}
await shot(page, 'after/03-details-confirm-402.png', widths[1])

// --- 3: Structured meetup time (Day 1 with meeting_time_ship_local) ---
await setMeetingTime(1, '14:30:00')
await reloadDrinkHome(page)
await focusDailyCard(page)
const meetupText = await page.locator('[data-testid="bounty-card-daily"]').first().innerText()
report.cases.meetupTime = {
  hasMeetAt: /Meet at 2:30 PM/i.test(meetupText),
  hasAvailableUntil: /Available until/i.test(meetupText),
  textSnippet: meetupText.replace(/\s+/g, ' ').slice(0, 220),
}
await shot(page, 'after/04-meetup-time-home-402.png', widths[1])
await shotCard(page, 'after/04-meetup-time-card-402.png', widths[1])
await page.goto(`${baseUrl}/drinkit/daily?ts=${Date.now()}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="daily-meeting-time"], [data-testid="daily-title"]', {
  timeout: 15000,
})
const detailsMeet = await page.getByTestId('daily-meeting-time').innerText().catch(() => null)
report.cases.detailsMeetup = { meetingTime: detailsMeet }
await shot(page, 'after/04-meetup-time-details-402.png', widths[1])
await setMeetingTime(1, null)

// --- Bring-a-friend / simple (no All Hands, no meetup) ---
const day3 = await alignDay(3)
await reloadDrinkHome(page)
await focusDailyCard(page)
const friendText = await page.locator('[data-testid="bounty-card-daily"]').first().innerText()
report.cases.bringAFriend = {
  title: day3.title,
  hasAllHands: /All Hands/i.test(friendText),
  hasBringFriendEyebrow: /Bring a Friend/i.test(friendText),
  hasViewDetails: /View Details/i.test(friendText),
  hasInstructions: /Irish side/i.test(friendText),
  textSnippet: friendText.replace(/\s+/g, ' ').slice(0, 220),
}
await shot(page, 'after/05-bring-friend-home-402.png', widths[1])
for (const vp of widths.filter((w) => w.name !== '402')) {
  await shot(page, `after/05-bring-friend-home-${vp.name}.png`, vp)
}

function activeClock(shipLocal = '2099-01-03T13:30:00', cruiseDay = 1) {
  const offset = -240
  const atUtc = new Date(Date.parse(`${shipLocal}Z`) - offset * 60_000).toISOString()
  return {
    configured: true,
    at_utc: atUtc,
    offset_minutes: offset,
    ship_local: shipLocal,
    ship_date: shipLocal.slice(0, 10),
    cruise_day: cruiseDay,
    lifecycle: 'active',
    finalized: false,
    games: {
      drinkit: { status: 'active', paused: false, finalized_at_utc: null },
      shipit: { status: 'active', paused: false, finalized_at_utc: null },
    },
  }
}

const cocktailStub = {
  status: 'active',
  offer_id: 'c-stub',
  slot_key: 'cocktail:day:1:h13',
  offering_id: 'off-stub',
  drink_name: 'Fixture Spritz',
  designated_bar_key: 'piazza',
  designated_bar_name: 'Fixture Piazza',
  tier: 'familiar',
  points: 25,
  listed_ingredients: [{ ingredient_key: 'prosecco', display_label: 'Prosecco' }],
  public_end_utc: new Date(Date.now() + 3600_000).toISOString(),
  cruise_day: 1,
}

const ingredientStub = {
  status: 'active',
  offer_id: 'i-stub',
  slot_key: 'ingredient:day:1:h12',
  ingredient_key: 'orgeat',
  display_name: 'Fixture Orgeat',
  tier: 'less_common',
  points: 50,
  known_bar_count: 5,
  public_end_utc: new Date(Date.now() + 7200_000).toISOString(),
  cruise_day: 1,
}

const barStub = {
  status: 'active',
  assignment_id: 'b-stub',
  cruise_day: 1,
  bar_id: 'uuid-bar',
  bar_canonical_key: 'wake-view',
  bar_display_name: 'Wake View',
  points_base: 20,
  points_per_companion: 0,
  points_cap: 40,
  points_min: 20,
  points_max: 40,
  public_end_utc: new Date(Date.now() + 8 * 3600_000).toISOString(),
}

async function mockHomeBoard(page, dailyOverride, clockOverride) {
  await page.unroute('**/rest/v1/rpc/get_my_drinkit_home_board*').catch(() => {})
  await page.route('**/rest/v1/rpc/get_my_drinkit_home_board*', async (route) => {
    const clock = clockOverride || activeClock()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        cocktail: cocktailStub,
        ingredient: ingredientStub,
        bar: barStub,
        daily: dailyOverride,
        clock,
        cruise_day: clock.cruise_day,
      }),
    })
  })
}

// --- Long title (home board mock) ---
await mockHomeBoard(page, {
  status: 'active',
  challenge_id: 'fixture-long-title',
  cruise_day: 1,
  title: "Bartender's Extremely Long Island Choice Night Special",
  instructions: 'Long title fixture — instructions belong on Details.',
  location_name: "O'Malley's Irish Pub",
  meeting_time_ship_local: null,
  is_all_hands: false,
  participation_mode: 'bring_a_friend',
  admin_announcement: null,
  photo_required: true,
  points: 50,
  public_end_utc: new Date(Date.now() + 6 * 3600_000).toISOString(),
})
await reloadDrinkHome(page)
await focusDailyCard(page)
await shot(page, 'after/06-long-title-home-402.png', widths[1])
await shotCard(page, 'after/06-long-title-card-402.png', widths[1])

// --- Claimed state ---
await mockHomeBoard(page, {
  status: 'already_claimed',
  reason: 'category_used_today',
  cruise_day: 1,
  challenge_id: 'fixture-claimed',
  title: 'Tequila Shot',
  points: 50,
})
await reloadDrinkHome(page)
await focusDailyCard(page)
await page.waitForTimeout(600)
const claimedOverlay = await page
  .locator('[data-testid="bounty-card-daily"] [data-overlay="claimed"]')
  .count()
report.cases.claimed = { overlayCount: claimedOverlay }
await shot(page, 'after/07-claimed-home-402.png', widths[1])

// --- Overnight ---
const overnightClock = activeClock('2099-01-03T23:30:00', 1)
await page.unroute('**/rest/v1/rpc/get_my_drinkit_home_board*').catch(() => {})
await page.route('**/rest/v1/rpc/get_my_drinkit_home_board*', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      cocktail: { status: 'unavailable', reason: 'no_public_slot' },
      ingredient: { status: 'unavailable', reason: 'no_public_slot' },
      bar: { status: 'unavailable', reason: 'no_public_slot' },
      daily: { status: 'unavailable', reason: 'no_public_slot' },
      clock: overnightClock,
      cruise_day: 1,
    }),
  })
})
await reloadDrinkHome(page)
await focusDailyCard(page)
const overnightOverlay = await page
  .locator('[data-testid="bounty-card-daily"] [data-overlay="overnight"]')
  .count()
report.cases.overnight = { overlayCount: overnightOverlay }
await shot(page, 'after/08-overnight-home-402.png', widths[1])
await page.unroute('**/rest/v1/rpc/get_my_drinkit_home_board*').catch(() => {})

await browser.close()

// Restore a normal day-1 clock without meetup time for local continuity.
await setMeetingTime(1, null)
await alignDay(1)

writeFileSync(join(outDir, 'qa-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
console.log('PASS v5a-daily-home-card →', outDir)
