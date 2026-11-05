/**
 * Phase 2D-B1 Playwright: live zero-arg player RPCs on Drink It! Home.
 *
 * Prerequisites:
 *   - Local Supabase + provision
 *   - Vite at baseUrl
 *   - node scripts/seed-local-bounty-now.mjs   (active open window)
 *   - LOCAL_TEST_PASSWORD set
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/e2e-phase2db1-home-bounties.mjs [baseUrl]
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
const both = summary.identities.find((i) => i.key === 'both')
if (!drink || !both) {
  console.error('Missing provisioned identities')
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

try {
  await loginAs(drink.display_name)
  await page.waitForURL('**/drinkit', { timeout: 20000 })
  await page.waitForSelector('[data-testid="bounty-carousel"]', { timeout: 20000 })

  const cocktail = page.locator('[data-testid="bounty-card-cocktail"]')
  await cocktail.waitFor({ state: 'visible', timeout: 20000 })
  const presentation = await cocktail.getAttribute('data-bounty-presentation')
  if (presentation === 'active') pass('live-cocktail-active')
  else fail('live-cocktail-active', `presentation=${presentation}`)

  const cocktailText = await cocktail.innerText()
  if (/Location:/i.test(cocktailText) && /\d+ Points/.test(cocktailText)) {
    pass('live-cocktail-fields')
  } else fail('live-cocktail-fields', cocktailText.slice(0, 200))

  const claimDisabled = await cocktail.locator('[data-testid="bounty-claim"]').isDisabled()
  if (claimDisabled) pass('claim-it-disabled')
  else fail('claim-it-disabled', 'Claim It was enabled')

  // Swipe to ingredient (scroll carousel)
  const track = page.locator('[data-testid="bounty-carousel"]')
  await track.evaluate((el) => {
    el.scrollBy({ left: el.clientWidth * 0.85, behavior: 'instant' })
  })
  await page.waitForTimeout(500)
  const ingredient = page.locator('[data-testid="bounty-card-ingredient"]')
  const ingPresentation = await ingredient.getAttribute('data-bounty-presentation')
  const ingText = await ingredient.innerText()
  if (ingPresentation === 'active' && /Available at \d+ bars?/i.test(ingText)) {
    pass('live-ingredient-active')
  } else fail('live-ingredient-active', `${ingPresentation} ${ingText.slice(0, 200)}`)

  if (!/wake-view|qualifying|future/i.test(ingText)) pass('no-ingredient-spoilers')
  else fail('no-ingredient-spoilers', ingText.slice(0, 200))

  // Second player sees the board (same shared objectives — validated in integration tests)
  await page.getByRole('button', { name: 'Log Out' }).click()
  await page.waitForURL('**/login')
  await loginAs(both.display_name)
  if (page.url().includes('/drinkit') || page.url().endsWith('/') || page.url().match(/\/$/)) {
    if (!page.url().includes('/drinkit')) {
      await page.getByRole('button', { name: 'Launch' }).first().click()
      await page.waitForURL('**/drinkit')
    }
    await page.waitForSelector('[data-testid="bounty-card-cocktail"]')
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="bounty-card-cocktail"]')
      const p = el?.getAttribute('data-bounty-presentation')
      return p && p !== 'loading'
    }, null, { timeout: 20000 })
    const p2 = await page.locator('[data-testid="bounty-card-cocktail"]').getAttribute(
      'data-bounty-presentation',
    )
    if (p2 === 'active') pass('second-player-active')
    else fail('second-player-active', `presentation=${p2}`)
  } else {
    fail('second-player-active', page.url())
  }

  // Background/foreground: hide then show triggers refresh (no throw)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(800)
  const after = await page.locator('[data-testid="bounty-card-cocktail"]').getAttribute(
    'data-bounty-presentation',
  )
  if (after === 'active' || after === 'loading') pass('foreground-refresh-survives')
  else fail('foreground-refresh-survives', `presentation=${after}`)
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
