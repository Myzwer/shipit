/**
 * Browser journey: dual-game login → refresh → switch → logout.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/e2e-phase1b-login.mjs [baseUrl]
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
const both = summary.identities.find((i) => i.key === 'both')
const drink = summary.identities.find((i) => i.key === 'drink_only')
if (!both || !drink) {
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

try {
  // Unauthenticated protection
  await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
  if (page.url().includes('/login')) pass('unauthenticated-redirect')
  else fail('unauthenticated-redirect', page.url())

  // Clear redirect from the unauthenticated probe, then login → chooser
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.selectOption('#login-name', { label: both.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => {
    const path = new URL(url).pathname
    return path === '/' || path === ''
  }, { timeout: 15000 })
  await page.waitForSelector('text=DRINK IT!')
  pass('dual-game-login-chooser')

  // Refresh restores session on chooser
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('text=DRINK IT!')
  if (page.url().includes('/login')) fail('session-restore-refresh', page.url())
  else pass('session-restore-refresh')

  // Switch Drink → Ship
  await page.getByRole('button', { name: 'Launch' }).first().click()
  await page.waitForURL('**/drinkit')
  await page.click('button[aria-label="Switch to Ship It!"]')
  await page.waitForURL('**/shipit')
  await page.waitForSelector(`text=Signed in as ${both.display_name}`)
  await page.waitForSelector(`text=Team: ${both.team ?? 'Demo Team Alpha'}`)
  pass('dual-game-switch')

  // Logout
  await page.getByRole('button', { name: 'Log Out' }).click()
  await page.waitForURL('**/login')
  pass('logout')

  // Drink-only: unauthorized /shipit
  await page.selectOption('#login-name', { label: drink.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/drinkit', { timeout: 15000 })
  pass('drink-only-home')

  await page.goto(`${baseUrl}/shipit`, { waitUntil: 'networkidle' })
  const denied =
    page.url().includes('/access-denied') ||
    (await page.getByText('You no longer have access to Ship It!').count()) > 0
  if (denied) pass('drink-only-blocks-shipit')
  else fail('drink-only-blocks-shipit', page.url())

  // Non-admin cannot open Admin tools
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
  if (!page.url().includes('/admin')) pass('non-admin-blocks-admin')
  else fail('non-admin-blocks-admin', page.url())

  // Invalid credentials
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  // May already be authed as drink_only — log out if account visible
  if (!page.url().includes('/login')) {
    const logout = page.getByRole('button', { name: 'Log Out' })
    if ((await logout.count()) > 0) {
      await logout.click()
      await page.waitForURL('**/login')
    } else {
      // access-denied / home without visible logout — force login route after sign-out via storage clear
      await context.clearCookies()
      await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
    }
  }
  await page.selectOption('#login-name', { label: drink.display_name })
  await page.fill('#login-password', 'wrong-password-not-real')
  await page.click('button[type="submit"]')
  await page.waitForSelector("text=That name and password didn't match")
  pass('invalid-credentials-ui')
} catch (error) {
  fail('unexpected', error instanceof Error ? error.message : String(error))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, failed: failed.length, results }, null, 2))
process.exit(failed.length ? 1 : 0)
