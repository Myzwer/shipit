import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const password = process.env.LOCAL_TEST_PASSWORD
if (!password) { console.error('Need LOCAL_TEST_PASSWORD'); process.exit(1) }
const summary = JSON.parse(await readFile('.local/test-identities.json', 'utf8'))
const drink = summary.identities.find((i) => (i.games || []).includes('drinkit'))
const shotDir = join(process.cwd(), 'docs/a5-achievements-screenshots')
await mkdir(shotDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()
await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'networkidle' })
await page.selectOption('#login-name', { label: drink.display_name })
await page.fill('#login-password', password)
await page.click('button[type="submit"]')
await page.waitForURL((url) => !url.pathname.includes('/login'))
await page.goto('http://127.0.0.1:5173/drinkit/achievements', { waitUntil: 'networkidle' })
await page.click('[data-testid="achievements-tab-all"]')
await page.waitForSelector('[data-testid="gauntlet-tracker"]', { timeout: 25000 })

// Prefer a tracker that isn't Lido team-only if available; otherwise first tracker
const trackers = page.locator('[data-testid="gauntlet-tracker"]')
const count = await trackers.count()
console.log('trackers', count)
const target = trackers.first()
await target.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await target.screenshot({ path: join(shotDir, 'gauntlet-collapsed-402.png') })

// Confirm no external bar header immediately above first tracker in DOM text sense:
const hasPills = await page.locator('[data-testid^="gauntlet-filter-"]').count()
console.log('filter_pills', hasPills)

await target.locator('[data-testid="gauntlet-toggle-checklist"]').click()
await page.waitForSelector('[data-testid="gauntlet-checklist"]')
await page.waitForTimeout(700)
await target.screenshot({ path: join(shotDir, 'gauntlet-expanded-402.png') })

// Also capture Lido area (team earned + tracker) if present
const lido = page.locator('[data-bar-key="lido-bar"]')
if (await lido.count()) {
  await lido.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  // screenshot surrounding section including any earned team card above
  const box = await lido.boundingBox()
  if (box) {
    await page.screenshot({
      path: join(shotDir, 'gauntlet-lido-context-402.png'),
      clip: {
        x: Math.max(0, box.x - 8),
        y: Math.max(0, box.y - 120),
        width: Math.min(402, box.width + 16),
        height: Math.min(700, box.height + 140),
      },
    })
  }
}

const titleText = await target.locator('h3').first().innerText()
console.log('tracker_title', JSON.stringify(titleText))
console.log('GAUNTLET_VF_OK')
await browser.close()
