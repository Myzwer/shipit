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

async function login(page) {
  await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'networkidle' })
  await page.selectOption('#login-name', { label: drink.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
}

for (const vp of [
  { name: '360', width: 360, height: 800 },
  { name: '402', width: 402, height: 874 },
  { name: '430', width: 430, height: 932 },
]) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await login(page)
  await page.goto('http://127.0.0.1:5173/drinkit/achievements', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="achievement-card"]', { timeout: 25000 })
  await page.waitForTimeout(700)

  // No ship time strip
  const shipTime = await page.locator('text=SHIP TIME').count()
  console.log(vp.name, 'ship_time_count', shipTime)

  await page.screenshot({ path: join(shotDir, `vf1-mine-${vp.name}.png`), fullPage: false })

  if (vp.name === '402') {
    await page.click('[data-testid="achievements-filter-trigger"]')
    await page.waitForSelector('[data-testid="achievements-filter-menu"]')
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(shotDir, 'vf1-filter-open-402.png'), fullPage: false })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // short title card
    const short = page.locator('[data-stable-key="working-drinkit-dwd-margarita-kickoff"]')
    if (await short.count()) {
      await short.screenshot({ path: join(shotDir, 'vf1-earned-short-402.png') })
    }
    // long title
    const long = page.locator('[data-stable-key="working-drinkit-d072"]')
    if (await long.count()) {
      await long.scrollIntoViewIfNeeded()
      await page.waitForTimeout(200)
      await long.screenshot({ path: join(shotDir, 'vf1-earned-long-402.png') })
    } else {
      const longAlt = page.locator('[data-stable-key="working-drinkit-d001"]')
      await longAlt.screenshot({ path: join(shotDir, 'vf1-earned-long-402.png') })
    }

    // full page for hierarchy overview
    await page.screenshot({ path: join(shotDir, 'vf1-mine-full-402.png'), fullPage: true })
  }

  await context.close()
  console.log('SHOT', vp.name)
}

await browser.close()
console.log('VF1_OK')
