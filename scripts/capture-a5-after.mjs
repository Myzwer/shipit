/**
 * Stage A5 after screenshots at reference viewports.
 * LOCAL_TEST_PASSWORD='…' node scripts/capture-a5-after.mjs
 */
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
if (!password) {
  console.error('Need LOCAL_TEST_PASSWORD')
  process.exit(1)
}
const summary = JSON.parse(
  await readFile(join(process.cwd(), '.local/test-identities.json'), 'utf8'),
)
const drink = summary.identities.find((i) => (i.games || []).includes('drinkit'))
const shotDir = join(process.cwd(), 'docs/a5-achievements-screenshots')
await mkdir(shotDir, { recursive: true })

const viewports = [
  { name: '360', width: 360, height: 800 },
  { name: '390', width: 390, height: 844 },
  { name: '402', width: 402, height: 874 },
  { name: '430', width: 430, height: 932 },
  { name: 'desktop', width: 1280, height: 900 },
]

const browser = await chromium.launch({ headless: true })

async function login(page, displayName) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
}

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.name === 'desktop' ? 1 : 2,
    isMobile: vp.name !== 'desktop',
    hasTouch: vp.name !== 'desktop',
  })
  const page = await context.newPage()
  await login(page, drink.display_name)

  await page.goto(`${baseUrl}/drinkit/achievements`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="achievements-view"]', { timeout: 20000 })
  await page.waitForSelector('[data-testid="achievement-card"], [data-testid="achievements-empty"]', {
    timeout: 20000,
  })
  await page.waitForTimeout(700)
  await page.screenshot({
    path: join(shotDir, `after-mine-${vp.name}.png`),
    fullPage: true,
  })

  await page.click('[data-testid="achievements-tab-all"]')
  await page.waitForSelector('[data-testid="achievement-card"], [data-testid="gauntlet-tracker"]', {
    timeout: 25000,
  })
  await page.waitForTimeout(900)
  await page.screenshot({
    path: join(shotDir, `after-all-${vp.name}.png`),
    fullPage: true,
  })

  if (vp.name === '402') {
    const tracker = page.locator('[data-testid="gauntlet-tracker"]').first()
    if (await tracker.count()) {
      await tracker.scrollIntoViewIfNeeded()
      await page.locator('[data-testid="gauntlet-toggle-checklist"]').first().click()
      await page.waitForTimeout(800)
      await page.screenshot({
        path: join(shotDir, 'after-all-gauntlet-expanded-402.png'),
        fullPage: true,
      })
    }
  }

  console.log('SHOT', vp.name)
  await context.close()
}

await browser.close()
console.log('AFTER_OK', shotDir)
