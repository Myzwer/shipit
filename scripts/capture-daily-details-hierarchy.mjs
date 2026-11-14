/**
 * Daily Details hierarchy refinement screenshots.
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-daily-details-hierarchy.mjs [baseUrl]
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'
import ws from 'ws'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'docs/daily-details-hierarchy')
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  readFileSync(join(root, '.local/runtime-qual-password.txt'), 'utf8').trim()
const baseUrl = process.argv[2] || 'http://localhost:5173'
const widths = [
  { name: '360', width: 360, height: 800 },
  { name: '402', width: 402, height: 874 },
]

if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const apiUrl = 'http://127.0.0.1:54321'
const serviceKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const service = createClient(apiUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})
const summary = JSON.parse(readFileSync(join(root, '.local/test-identities.json'), 'utf8'))
const player =
  summary.identities.find((i) => i.key === 'josh_forrester') ||
  summary.identities.find((i) => (i.games || []).includes('drinkit'))

async function alignDay(day) {
  execSync(`node scripts/seed-local-bounty-now.mjs --day=${day} --hour=13`, {
    cwd: root,
    env: { ...process.env, LOCAL_TEST_PASSWORD: password },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await service.rpc('dev_seed_daily_assignments')
}

async function setMeeting(day, time) {
  const { error } = await service
    .from('daily_challenges')
    .update({ meeting_time_ship_local: time })
    .eq('day_number', day)
  if (error) throw error
}

async function setAnnouncement(day, text) {
  const { error } = await service
    .from('daily_challenges')
    .update({ admin_announcement: text })
    .eq('day_number', day)
  if (error) throw error
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.selectOption('#login-name', { label: player.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
}

async function openDaily(page) {
  await page.goto(`${baseUrl}/drinkit/daily?ts=${Date.now()}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="daily-confirm-step"]', { timeout: 20000 })
}

async function shot(page, name, vp) {
  await page.setViewportSize(vp)
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(outDir, name), fullPage: false })
  console.log('wrote', name)
}

const report = {
  discrepancy:
    'UI explains All Hands as miss-the-meetup = miss-the-challenge, but server still accepts Daily claims without attendance validation; admin announcements do not gate claims (phase C1). Display-only explanation — no new enforcement added.',
  cases: {},
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  ...devices['iPhone 12'],
  viewport: { width: 402, height: 874 },
})
await login(page)

// 1. All Hands + scheduled meetup
await alignDay(1)
await setMeeting(1, '15:00:00')
await setAnnouncement(1, 'Meet everyone there at 3pm ship time!')
await openDaily(page)
const allHands = await page.locator('[data-testid="daily-confirm-step"]').innerText()
report.cases.allHandsMeetup = {
  hasRule: /miss the meetup/i.test(allHands),
  hasMeetupPrefixDup: /Meetup:\s*Meet/i.test(allHands),
  hasMeetAt: /Meet at 3:00 PM/i.test(allHands),
  hasAnnouncement: /Meet everyone there at 3pm/i.test(allHands),
  hasYesAddPhoto: /Yes — Add Photo/i.test(allHands),
  hasContinueToPhoto: /Continue to Photo/i.test(allHands),
  orderOk:
    allHands.indexOf('What to Do') < allHands.indexOf('Kick off') &&
    allHands.indexOf('Kick off') < allHands.indexOf('miss the meetup') &&
    allHands.indexOf('miss the meetup') < allHands.indexOf('Meet at 3:00 PM') &&
    allHands.indexOf('Meet at') < allHands.indexOf('Did you complete'),
}
await shot(page, '01-all-hands-meetup-402.png', widths[1])
await shot(page, '01-all-hands-meetup-360.png', widths[0])

// Full screen with completion CTA
await shot(page, '04-completion-cta-402.png', widths[1])

// Continue advances to photo without submit
await page.click('[data-testid="daily-confirm-yes"]')
await page.waitForSelector('[data-testid="daily-capture-step"]', { timeout: 10000 })
report.cases.advancesToPhoto = {
  ok: true,
  urlStillDaily: page.url().includes('/drinkit/daily'),
}
await shot(page, '05-photo-step-402.png', widths[1])

// 2. Bring a Friend / no All Hands meetup
await setMeeting(1, null)
await setAnnouncement(1, null)
await alignDay(3)
await openDaily(page)
const friend = await page.locator('[data-testid="daily-confirm-step"]').innerText()
report.cases.bringFriend = {
  title: (await page.getByTestId('daily-title').innerText()).trim(),
  hasAllHandsRule: /miss the meetup/i.test(friend),
  hasMeetup: (await page.locator('[data-testid="daily-meetup"]').count()) > 0,
  hasYesAddPhoto: /Yes — Add Photo/i.test(friend),
}
await shot(page, '02-bring-friend-402.png', widths[1])
await shot(page, '02-bring-friend-360.png', widths[0])

// 3. Long instructions (day 2 Switcheroo, All Hands)
await alignDay(2)
await openDaily(page)
const long = await page.getByTestId('daily-instructions').innerText()
report.cases.longInstructions = {
  title: (await page.getByTestId('daily-title').innerText()).trim(),
  len: long.trim().length,
  hasRule: (await page.locator('[data-testid="daily-all-hands-rule"]').count()) > 0,
}
await shot(page, '03-long-instructions-402.png', widths[1])
await shot(page, '03-long-instructions-360.png', widths[0])

await browser.close()
await setMeeting(1, null)
await setAnnouncement(1, null)
await alignDay(1)

writeFileSync(join(outDir, 'qa-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
console.log('PASS →', outDir)
