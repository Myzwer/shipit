/**
 * Phase 2D-B2 Playwright: four live Home cards + Admin Pause/Resume round-trip.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
 *   LOCAL_TEST_PASSWORD='…' node scripts/e2e-phase2db2-daily-pause.mjs [baseUrl]
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD')
  process.exit(1)
}

const summary = JSON.parse(
  await readFile(join(dirname(fileURLToPath(import.meta.url)), '../.local/test-identities.json'), 'utf8'),
)
const drink = summary.identities.find((i) => i.key === 'drink_only')
const admin = summary.identities.find((i) => i.key === 'admin')
if (!drink || !admin) {
  console.error('Missing identities')
  process.exit(1)
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

async function waitCard(id, presentation = 'active') {
  await page.waitForFunction(
    ({ id, presentation }) => {
      const el = document.querySelector(`[data-testid="bounty-card-${id}"]`)
      return el?.getAttribute('data-bounty-presentation') === presentation
    },
    { id, presentation },
    { timeout: 20000 },
  )
}

try {
  await loginAs(drink.display_name)
  if (!page.url().includes('/drinkit')) {
    await page.getByRole('button', { name: 'Launch' }).first().click().catch(() => {})
    await page.waitForURL('**/drinkit', { timeout: 20000 })
  }
  await waitCard('cocktail', 'active')
  pass('cocktail-active')
  await waitCard('ingredient', 'active')
  pass('ingredient-active')

  const track = page.locator('[data-testid="bounty-carousel"]')
  await track.evaluate((el) => el.scrollBy({ left: el.clientWidth * 0.85, behavior: 'instant' }))
  await page.waitForTimeout(400)
  await track.evaluate((el) => el.scrollBy({ left: el.clientWidth * 0.85, behavior: 'instant' }))
  await page.waitForTimeout(400)
  const barPres = await page.locator('[data-testid="bounty-card-bar"]').getAttribute(
    'data-bounty-presentation',
  )
  if (barPres === 'active') pass('bar-active')
  else fail('bar-active', `presentation=${barPres}`)

  await track.evaluate((el) => el.scrollBy({ left: el.clientWidth * 0.85, behavior: 'instant' }))
  await page.waitForTimeout(400)
  const dailyText = await page.locator('[data-testid="bounty-card-daily"]').innerText()
  const dailyPres = await page.locator('[data-testid="bounty-card-daily"]').getAttribute(
    'data-bounty-presentation',
  )
  if (dailyPres === 'active' && /50 Points/i.test(dailyText)) pass('daily-active')
  else fail('daily-active', `${dailyPres} ${dailyText.slice(0, 120)}`)

  const note = page.locator('[data-testid="home-board-note"]')
  const phase = await note.getAttribute('data-board-phase')
  if (phase === 'active') pass('active-banner-phase')
  else fail('active-banner-phase', phase)

  // Admin pause
  await page.getByRole('button', { name: 'Log Out' }).click()
  await page.waitForURL('**/login')
  await loginAs(admin.display_name)
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="game-status-section"]')
  await page.waitForSelector('[data-testid="drinkit-pause-state"]')
  const running = await page.locator('[data-testid="drinkit-pause-state"]').getAttribute('data-paused')
  if (running === 'false') pass('admin-running')
  else fail('admin-running', running)

  await page.click('[data-testid="pause-drinkit"]')
  await page.waitForSelector('[data-testid="pause-confirm-modal"]')
  pass('pause-confirm-modal')
  await page.click('[data-testid="pause-confirm-apply"]')
  await page.waitForFunction(() => {
    return document.querySelector('[data-testid="drinkit-pause-state"]')?.getAttribute('data-paused') === 'true'
  }, null, { timeout: 15000 })
  pass('admin-paused')

  await page.getByRole('button', { name: 'Back to Home' }).click()
  // Admin has both games — Back lands on selection, not Drink It! Home.
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/admin'), { timeout: 15000 })
  if (!page.url().includes('/drinkit')) {
    await page.getByRole('button', { name: 'Launch' }).first().click()
    await page.waitForURL('**/drinkit', { timeout: 20000 })
  }
  await waitCard('cocktail', 'paused')
  const pausedNotePhase = await page.locator('[data-testid="home-board-note"]').getAttribute(
    'data-board-phase',
  )
  if (pausedNotePhase === 'paused') pass('home-paused-no-live-banner')
  else fail('home-paused-no-live-banner', pausedNotePhase)

  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
  await page.click('[data-testid="resume-drinkit"]')
  await page.click('[data-testid="pause-confirm-apply"]')
  await page.waitForFunction(() => {
    return document.querySelector('[data-testid="drinkit-pause-state"]')?.getAttribute('data-paused') === 'false'
  }, null, { timeout: 15000 })
  pass('admin-resumed')

  await page.getByRole('button', { name: 'Back to Home' }).click()
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/admin'), { timeout: 15000 })
  if (!page.url().includes('/drinkit')) {
    await page.getByRole('button', { name: 'Launch' }).first().click()
    await page.waitForURL('**/drinkit', { timeout: 20000 })
  }
  await waitCard('cocktail', 'active')
  pass('home-resumed-active')
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
