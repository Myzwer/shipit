/**
 * Phase 2D-B2 screenshots at 390×844.
 * LIVE = real local backend after seed; MOCKED = route stubs for finale only.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const drink = summary.identities.find((i) => i.key === 'drink_only')
const admin = summary.identities.find((i) => i.key === 'admin')
const outDir = join(root, 'docs/phase2db2-screenshots')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()

async function shot(file) {
  const buffer = await page.screenshot({ type: 'png', fullPage: false })
  await writeFile(join(outDir, file), buffer)
  console.log(`wrote ${file}`)
}

async function loginAs(displayName) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 20000 })
}

async function scrollToCard(steps) {
  const track = page.locator('[data-testid="bounty-carousel"]')
  for (let i = 0; i < steps; i++) {
    await track.evaluate((el) => el.scrollBy({ left: el.clientWidth * 0.85, behavior: 'instant' }))
    await page.waitForTimeout(350)
  }
}

// LIVE active cards
await loginAs(drink.display_name)
if (!page.url().includes('/drinkit')) {
  await page.getByRole('button', { name: 'Launch' }).first().click().catch(() => {})
  await page.waitForURL('**/drinkit')
}
await page.waitForSelector('[data-bounty-presentation="active"]')
await page.waitForTimeout(500)
await shot('phase2db2-LIVE-active-cocktail.png')
await scrollToCard(1)
await shot('phase2db2-LIVE-active-ingredient.png')
await scrollToCard(1)
await shot('phase2db2-LIVE-active-bar.png')
await scrollToCard(1)
await shot('phase2db2-LIVE-active-daily.png')

await page.getByRole('button', { name: 'Log Out' }).click()
await page.waitForURL('**/login')

// Admin running / pause confirm / paused
await loginAs(admin.display_name)
await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="game-status-section"]')
await page.waitForTimeout(400)
await shot('phase2db2-LIVE-admin-running.png')
await page.click('[data-testid="pause-drinkit"]')
await page.waitForSelector('[data-testid="pause-confirm-modal"]')
await page.waitForTimeout(200)
await shot('phase2db2-LIVE-admin-pause-confirm.png')
await page.click('[data-testid="pause-confirm-apply"]')
await page.waitForFunction(() => {
  return document.querySelector('[data-testid="drinkit-pause-state"]')?.getAttribute('data-paused') === 'true'
})
await page.waitForTimeout(300)
await shot('phase2db2-LIVE-admin-paused.png')

await page.getByRole('button', { name: 'Back to Home' }).click()
await page.waitForURL((url) => !new URL(url).pathname.endsWith('/admin'), { timeout: 15000 })
if (!page.url().includes('/drinkit')) {
  await page.getByRole('button', { name: 'Launch' }).first().click()
  await page.waitForURL('**/drinkit', { timeout: 20000 })
}
await page.waitForSelector('[data-bounty-presentation="paused"]')
await page.waitForTimeout(400)
await shot('phase2db2-LIVE-home-paused.png')

await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
await page.click('[data-testid="resume-drinkit"]')
await page.click('[data-testid="pause-confirm-apply"]')
await page.waitForFunction(() => {
  return document.querySelector('[data-testid="drinkit-pause-state"]')?.getAttribute('data-paused') === 'false'
})
await page.getByRole('button', { name: 'Back to Home' }).click()
await page.waitForURL((url) => !new URL(url).pathname.endsWith('/admin'), { timeout: 15000 })
if (!page.url().includes('/drinkit')) {
  await page.getByRole('button', { name: 'Launch' }).first().click()
  await page.waitForURL('**/drinkit', { timeout: 20000 })
}
await page.waitForSelector('[data-bounty-presentation="active"]')
await page.waitForTimeout(400)
await shot('phase2db2-LIVE-home-resumed.png')

await page.getByRole('button', { name: 'Log Out' }).click()
await page.waitForURL('**/login')

// MOCKED finale
await page.route('**/rest/v1/rpc/*', async (route) => {
  const url = route.request().url()
  const offset = -240
  const shipLocal = '2099-01-09T18:30:00'
  const atUtc = new Date(Date.parse(`${shipLocal}Z`) - offset * 60_000).toISOString()
  if (url.includes('get_my_drinkit_home_board') || url.includes('get_ship_clock_state')) {
    const clock = {
      configured: true,
      at_utc: atUtc,
      offset_minutes: offset,
      ship_local: shipLocal,
      ship_date: '2099-01-09',
      cruise_day: 7,
      lifecycle: 'final',
      finalized: true,
      games: {
        drinkit: { status: 'final', paused: false, finalized_at_utc: atUtc },
        shipit: { status: 'final', paused: false, finalized_at_utc: atUtc },
      },
    }
    if (url.includes('get_ship_clock_state')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(clock) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        at_utc: atUtc,
        cruise_day: 7,
        lifecycle: { status: 'finale', reason: 'friday_6pm_cutoff', cruise_day: 7 },
        clock,
        cocktail: { status: 'finale', reason: 'friday_6pm_cutoff' },
        ingredient: { status: 'finale', reason: 'friday_6pm_cutoff' },
        bar: { status: 'finale', reason: 'friday_6pm_cutoff' },
        daily: { status: 'finale', reason: 'friday_6pm_cutoff' },
      }),
    })
  }
  if (url.includes('get_my_current_')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'finale', reason: 'friday_6pm_cutoff' }),
    })
  }
  return route.continue()
})

await loginAs(drink.display_name)
if (!page.url().includes('/drinkit')) {
  await page.waitForURL('**/drinkit')
}
await page.waitForSelector('[data-bounty-presentation="finale"]')
await page.waitForTimeout(400)
await shot('phase2db2-MOCKED-finale.png')

await writeFile(
  join(outDir, 'README.md'),
  `# Phase 2D-B2 screenshots (390×844)

| File | Backend |
|---|---|
| \`phase2db2-LIVE-active-*.png\` | Live zero-arg board after seed |
| \`phase2db2-LIVE-admin-*.png\` | Live Admin Pause/Resume |
| \`phase2db2-LIVE-home-paused.png\` / \`…-resumed.png\` | Live after actual pause/resume |
| \`phase2db2-MOCKED-finale.png\` | Mocked RPC stubs only |

Mocked finale does **not** prove database authorization.
`,
)

await browser.close()
console.log('done')
