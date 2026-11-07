/**
 * Phase 10A — representative screenshots for the Visual Fidelity Agent.
 *
 * Assumes demo scenario already seeded and `npm run dev` is serving the app.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run screenshots:phase10a
 *   PHASE10A_SCENARIO=tuesday LOCAL_TEST_PASSWORD='…' npm run screenshots:phase10a
 */
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dir = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
const scenario = process.env.PHASE10A_SCENARIO || 'embarkation'
if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD')
  process.exit(1)
}

const summary = JSON.parse(await readFile(join(__dir, '../.local/test-identities.json'), 'utf8'))
const both = summary.identities.find((i) => i.key === 'both') || summary.identities.find((i) => i.games?.includes('drinkit'))
const ship = summary.identities.find((i) => i.key === 'ship_only') || both
const drink = summary.identities.find((i) => i.key === 'drink_only') || both

const shotDir = join(__dir, '../docs/phase10a-screenshots', scenario)
await mkdir(shotDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()

async function loginAs(displayName) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
}

async function shot(name) {
  const path = join(shotDir, `${name}.png`)
  await page.screenshot({ path, fullPage: true })
  console.log('SHOT', path)
}

try {
  await loginAs(drink.display_name)
  await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await shot('01-drinkit-home')

  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await shot('02-drink-log-wizard')

  await page.goto(`${baseUrl}/drinkit/gallery`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await shot('03-drinkit-gallery')

  await page.goto(`${baseUrl}/drinkit/achievements`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await shot('04-drinkit-achievements')

  await loginAs(ship.display_name)
  await page.goto(`${baseUrl}/shipit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await shot('05-shipit-home')

  await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await shot('06-shipit-challenges')

  await page.goto(`${baseUrl}/shipit/gallery`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await shot('07-shipit-gallery')

  if (scenario === 'wrapped') {
    await loginAs(both.display_name)
    await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    await shot('08-wrapped-drinkit')
    await page.goto(`${baseUrl}/shipit`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    await shot('09-wrapped-shipit')
  }

  console.log('Phase 10A screenshots complete for', scenario)
} finally {
  await browser.close()
}
