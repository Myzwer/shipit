/**
 * Phase S2 — Ship It! Home visual fidelity captures.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-phase-s2-shipit-home.mjs
 *   # or relies on .local/runtime-qual-password.txt
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  (await readFile(join(dirname(fileURLToPath(import.meta.url)), '../.local/runtime-qual-password.txt'), 'utf8')).trim()

if (!password || password.length < 12) {
  console.error('Set LOCAL_TEST_PASSWORD or .local/runtime-qual-password.txt')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const player =
  summary.identities.find((i) => i.key === 'josh_forrester') ||
  summary.identities.find((i) => Array.isArray(i.games) && i.games.includes('shipit')) ||
  summary.identities[0]

if (!player) {
  console.error('No Ship It! identity found in .local/test-identities.json')
  process.exit(1)
}
console.log(`Using identity ${player.key} (${player.display_name})`)

const outDir = join(root, 'docs/phase-s2-shipit-home')
await mkdir(outDir, { recursive: true })

const viewports = [
  { name: '360', width: 360, height: 740 },
  { name: '390', width: 390, height: 844 },
  { name: '402', width: 402, height: 874 },
  { name: '430', width: 430, height: 932 },
]

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
  await page.waitForSelector('#login-name', { timeout: 15000 })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
}

async function gotoShipHome(page) {
  const launch = await page.$('[data-testid="launch-shipit"]')
  if (launch) await launch.click()
  else await page.goto(`${baseUrl}/shipit`, { waitUntil: 'networkidle' })
  await page.waitForURL('**/shipit', { timeout: 15000 })
  await page.waitForSelector(
    '[data-testid="shipit-progress"], [data-testid="shipit-home-error"]',
    { timeout: 20000 },
  )
  await page.waitForTimeout(500)
}

async function measure(page) {
  return page.evaluate(() => {
    const header = document.querySelector('[data-testid="section-header"]')
    const h1 = header?.querySelector('h1')
    const shipTime = document.querySelector('[data-testid="ship-time-indicator"]')
    const leaderboard = document.querySelector('[data-testid="shipit-leaderboard"]')
    const band = leaderboard?.querySelector('.ui-section-band')
    const progress = document.querySelector('[data-testid="shipit-progress"]')
    const rules = document.querySelector('[data-testid="how-to-play"]')
    const main = document.querySelector('main')
    const headerCs = header ? getComputedStyle(header) : null
    const h1Cs = h1 ? getComputedStyle(h1) : null
    const lbRect = leaderboard?.getBoundingClientRect()
    const bandRect = band?.getBoundingClientRect()
    const mainRect = main?.getBoundingClientRect()
    return {
      headerSticky: headerCs?.position === 'sticky',
      headerTitle: h1?.textContent?.trim() ?? null,
      headerFontSize: h1Cs?.fontSize ?? null,
      shipTimePresent: Boolean(shipTime),
      mainMaxWidth: main ? getComputedStyle(main).maxWidth : null,
      mainPaddingLeft: main ? getComputedStyle(main).paddingLeft : null,
      leaderboardLeft: lbRect ? Math.round(lbRect.left) : null,
      leaderboardWidth: lbRect ? Math.round(lbRect.width) : null,
      bandLeft: bandRect ? Math.round(bandRect.left) : null,
      bandWidth: bandRect ? Math.round(bandRect.width) : null,
      viewportWidth: window.innerWidth,
      progressTitle: progress?.querySelector('h2')?.textContent?.trim() ?? null,
      rulesPresent: Boolean(rules),
      accordionCount: rules ? rules.querySelectorAll('details').length : 0,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    }
  })
}

const browser = await chromium.launch({ headless: true })
const report = { player: player.display_name, viewports: {}, checks: {} }

try {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    await login(page, player.display_name)
    await gotoShipHome(page)

    const m = await measure(page)
    report.viewports[vp.name] = m

    await page.screenshot({
      path: join(outDir, `after-${vp.name}-viewport.png`),
      fullPage: false,
    })

    if (vp.name === '402') {
      await page.screenshot({
        path: join(outDir, 'after-402-fullpage.png'),
        fullPage: true,
      })

      // Header + Team Progress
      const progress = page.locator('[data-testid="shipit-progress"]')
      const progressBox = await progress.boundingBox()
      if (progressBox) {
        await page.screenshot({
          path: join(outDir, 'after-402-header-progress.png'),
          clip: {
            x: 0,
            y: 0,
            width: vp.width,
            height: Math.min(vp.height, progressBox.y + progressBox.height + 8),
          },
        })
      }

      // Leaderboard section
      const lb = page.locator('[data-testid="shipit-leaderboard"]')
      await lb.scrollIntoViewIfNeeded()
      await page.waitForTimeout(200)
      const lbBox = await lb.boundingBox()
      if (lbBox) {
        await page.screenshot({
          path: join(outDir, 'after-402-leaderboard.png'),
          clip: {
            x: 0,
            y: Math.max(0, lbBox.y - 4),
            width: vp.width,
            height: Math.min(vp.height - 80, lbBox.height + 8),
          },
        })
      }

      // How to Play collapsed
      const rules = page.locator('[data-testid="how-to-play"]')
      await rules.scrollIntoViewIfNeeded()
      await page.waitForTimeout(200)
      const rulesBox = await rules.boundingBox()
      if (rulesBox) {
        await page.screenshot({
          path: join(outDir, 'after-402-how-to-play-collapsed.png'),
          clip: {
            x: 0,
            y: Math.max(0, rulesBox.y - 4),
            width: vp.width,
            height: Math.min(vp.height - 80, Math.min(rulesBox.height, 520) + 8),
          },
        })
      }

      // Expand first accordion
      const firstDetails = page.locator('[data-testid="how-to-play"] details').first()
      await firstDetails.locator('summary').click()
      await page.waitForTimeout(250)
      const rulesBoxOpen = await rules.boundingBox()
      if (rulesBoxOpen) {
        await page.screenshot({
          path: join(outDir, 'after-402-how-to-play-expanded.png'),
          clip: {
            x: 0,
            y: Math.max(0, rulesBoxOpen.y - 4),
            width: vp.width,
            height: Math.min(vp.height - 80, Math.min(rulesBoxOpen.height, 640) + 8),
          },
        })
      }

      // Account section
      const account = page.locator('text=Signed in as').first()
      await account.scrollIntoViewIfNeeded()
      await page.waitForTimeout(200)
      const accountCard = page.locator('.ui-mint-panel').last()
      const accountBox = await accountCard.boundingBox()
      if (accountBox) {
        await page.screenshot({
          path: join(outDir, 'after-402-account.png'),
          clip: {
            x: Math.max(0, accountBox.x - 8),
            y: Math.max(0, accountBox.y - 8),
            width: Math.min(vp.width, accountBox.width + 16),
            height: accountBox.height + 16,
          },
        })
      }

      report.checks = {
        noShipTime: !m.shipTimePresent,
        headerNotSticky: !m.headerSticky,
        fullWidthLeaderboard: m.bandLeft === 0 && m.bandWidth === vp.width,
        homeTitleLarge: m.headerFontSize ? parseFloat(m.headerFontSize) >= 24 : false,
        accordionCount: m.accordionCount,
        noHorizontalOverflow: !m.overflowX,
      }
    }

    console.log(
      `${vp.name}: shipTime=${m.shipTimePresent} sticky=${m.headerSticky} band=${m.bandLeft}/${m.bandWidth} font=${m.headerFontSize}`,
    )
    await context.close()
  }

  await writeFile(join(outDir, 'measurements.json'), JSON.stringify(report, null, 2))
  console.log(`Wrote ${outDir}`)
  console.log('checks', report.checks)
} finally {
  await browser.close()
}
