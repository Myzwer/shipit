/**
 * Phase S3 — Ship It! Challenges visual fidelity captures.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-phase-s3-shipit-challenges.mjs
 *   # or relies on .local/runtime-qual-password.txt
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  (
    await readFile(
      join(dirname(fileURLToPath(import.meta.url)), '../.local/runtime-qual-password.txt'),
      'utf8',
    )
  ).trim()

if (!password || password.length < 12) {
  console.error('Set LOCAL_TEST_PASSWORD or .local/runtime-qual-password.txt')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const player =
  summary.identities.find((i) => i.key === 'josh_forrester') ||
  summary.identities.find((i) => Array.isArray(i.games) && i.games.includes('shipit')) ||
  summary.identities.find((i) => i.key === 'ship_only') ||
  summary.identities[0]

if (!player) {
  console.error('No Ship It! identity found in .local/test-identities.json')
  process.exit(1)
}
console.log(`Using identity ${player.key} (${player.display_name})`)

const outDir = join(root, 'docs/phase-s3-shipit-challenges')
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

async function gotoChallenges(page) {
  const launch = await page.$('[data-testid="launch-shipit"]')
  if (launch) await launch.click()
  await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="shipit-challenge-list"]', { timeout: 20000 })
  await page.waitForSelector('[data-testid^="shipit-section-"]', { timeout: 15000 })
  await page.waitForTimeout(500)
}

async function measure(page) {
  return page.evaluate(() => {
    const header = document.querySelector('[data-testid="section-header"]')
    const h1 = header?.querySelector('h1')
    const shipTime = document.querySelector('[data-testid="ship-time-indicator"]')
    const filter = document.querySelector('[data-testid="shipit-challenge-filter"]')
    const filterLabel = document.querySelector('.challenge-filter span')
    const cards = [...document.querySelectorAll('[data-testid^="shipit-challenge-"]')]
    const completed = cards.filter((c) => c.getAttribute('data-completed') === 'true')
    const available = cards.filter((c) => c.getAttribute('data-completed') === 'false')
    const sections = [...document.querySelectorAll('[data-testid^="shipit-section-"]')]
    const longHeading = sections
      .map((s) => s.querySelector('h2')?.textContent?.trim() ?? '')
      .sort((a, b) => b.length - a.length)[0]
    const headerCs = header ? getComputedStyle(header) : null
    const h1Cs = h1 ? getComputedStyle(h1) : null
    const filterCs = filter ? getComputedStyle(filter) : null
    const filterRect = filter?.getBoundingClientRect()
    const firstAvail = available[0]
    const firstDone = completed[0]
    const availRect = firstAvail?.getBoundingClientRect()
    const doneRect = firstDone?.getBoundingClientRect()
    const availCs = firstAvail ? getComputedStyle(firstAvail) : null
    const doneCs = firstDone ? getComputedStyle(firstDone) : null
    const icons = cards.map((c) => {
      const svg = c.querySelector('svg')
      return svg?.getAttribute('data-icon') || svg?.className?.baseVal || null
    })
    const distinctIcons = [...new Set(icons.filter(Boolean))]
    const visibleCardCount = cards.filter((c) => {
      const r = c.getBoundingClientRect()
      return r.top < window.innerHeight - 80 && r.bottom > 120
    }).length

    return {
      headerSticky: headerCs?.position === 'sticky',
      headerTitle: h1?.textContent?.trim() ?? null,
      headerFontSize: h1Cs?.fontSize ?? null,
      shipTimePresent: Boolean(shipTime),
      filterWidth: filterRect ? Math.round(filterRect.width) : null,
      filterLabel: filterLabel?.textContent?.trim() ?? null,
      filterBackground: filterCs?.backgroundImage || filterCs?.backgroundColor || null,
      sectionCount: sections.length,
      longHeading,
      availableCardHeight: availRect ? Math.round(availRect.height) : null,
      completedCardHeight: doneRect ? Math.round(doneRect.height) : null,
      availableBackground: availCs?.backgroundImage || availCs?.backgroundColor || null,
      completedBackground: doneCs?.backgroundImage || doneCs?.backgroundColor || null,
      completedHasArrow: firstDone
        ? Boolean(firstDone.querySelector('[data-icon="chevron-right"], .fa-chevron-right'))
        : null,
      visibleCardCount,
      distinctRenderedIcons: distinctIcons,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      viewportWidth: window.innerWidth,
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
    await gotoChallenges(page)

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

      // Header + filter + first category
      const firstSection = page.locator('[data-testid^="shipit-section-"]').first()
      const firstBox = await firstSection.boundingBox()
      if (firstBox) {
        await page.screenshot({
          path: join(outDir, 'after-402-header-filter-category.png'),
          clip: {
            x: 0,
            y: 0,
            width: vp.width,
            height: Math.min(vp.height, firstBox.y + Math.min(firstBox.height, 280)),
          },
        })
      }

      // Available + completed cards close-up in first section
      const available = page.locator('[data-actionable="true"]').first()
      const completed = page.locator('[data-completed="true"]').first()
      if (await available.count()) {
        await available.scrollIntoViewIfNeeded()
        await page.waitForTimeout(150)
        const box = await available.boundingBox()
        if (box) {
          await page.screenshot({
            path: join(outDir, 'after-402-available-card.png'),
            clip: {
              x: Math.max(0, box.x - 12),
              y: Math.max(0, box.y - 12),
              width: Math.min(vp.width, box.width + 24),
              height: box.height + 24,
            },
          })
        }
      }
      if (await completed.count()) {
        await completed.scrollIntoViewIfNeeded()
        await page.waitForTimeout(150)
        const box = await completed.boundingBox()
        if (box) {
          await page.screenshot({
            path: join(outDir, 'after-402-completed-card.png'),
            clip: {
              x: Math.max(0, box.x - 12),
              y: Math.max(0, box.y - 12),
              width: Math.min(vp.width, box.width + 24),
              height: box.height + 24,
            },
          })
        }
      }

      // Long category heading (interactive crew)
      const longSection = page.locator(
        '[data-testid="shipit-section-interactive_crew_and_activity"]',
      )
      if (await longSection.count()) {
        await longSection.scrollIntoViewIfNeeded()
        await page.waitForTimeout(200)
        const box = await longSection.boundingBox()
        if (box) {
          await page.screenshot({
            path: join(outDir, 'after-402-long-category.png'),
            clip: {
              x: 0,
              y: Math.max(0, box.y - 8),
              width: vp.width,
              height: Math.min(220, box.height + 16),
            },
          })
        }
      }

      // Filter opened / changed (custom themed menu, not native <select>)
      await page.locator('[data-testid="shipit-challenge-filter-trigger"]').click()
      await page.waitForSelector('[data-testid="shipit-challenge-filter-menu"]', { timeout: 5000 })
      await page.screenshot({
        path: join(outDir, 'after-402-filter-open.png'),
        fullPage: false,
      })
      await page
        .locator('[data-testid="shipit-challenge-filter-option-food_and_drink_discoveries"]')
        .click()
      await page.waitForSelector('[data-testid="shipit-section-food_and_drink_discoveries"]', {
        timeout: 15000,
      })
      await page.waitForTimeout(400)
      await page.screenshot({
        path: join(outDir, 'after-402-filter-food.png'),
        fullPage: false,
      })

      // Back to all, scroll near bottom
      await page.locator('[data-testid="shipit-challenge-filter-trigger"]').click()
      await page.locator('[data-testid="shipit-challenge-filter-option-all"]').click()
      await page.waitForSelector('[data-testid="shipit-section-creative_team_and_action_shots"]', {
        timeout: 15000,
      })
      const lastSection = page.locator(
        '[data-testid="shipit-section-creative_team_and_action_shots"]',
      )
      await lastSection.scrollIntoViewIfNeeded()
      await page.waitForTimeout(250)
      await page.screenshot({
        path: join(outDir, 'after-402-bottom-scroll.png'),
        fullPage: false,
      })

      report.checks = {
        noShipTime: !m.shipTimePresent,
        headerNotSticky: !m.headerSticky,
        compactFilter: (m.filterWidth ?? 999) < 220,
        homeTitleLarge: m.headerFontSize ? parseFloat(m.headerFontSize) >= 24 : false,
        hasAvailableGradient: Boolean(m.availableBackground?.includes('gradient')),
        completedMuted: Boolean(m.completedBackground && !m.completedBackground.includes('bbdff5')),
        noCompletedArrow: m.completedHasArrow === false || m.completedHasArrow === null,
        denserViewport: (m.visibleCardCount ?? 0) >= 4,
        noHorizontalOverflow: !m.overflowX,
        fiveSections: m.sectionCount === 5,
      }
    }

    console.log(
      `${vp.name}: shipTime=${m.shipTimePresent} sticky=${m.headerSticky} filterW=${m.filterWidth} cardsVisible=${m.visibleCardCount} font=${m.headerFontSize}`,
    )
    await context.close()
  }

  await writeFile(join(outDir, 'measurements.json'), JSON.stringify(report, null, 2))
  console.log(`Wrote ${outDir}`)
  console.log('checks', report.checks)
} finally {
  await browser.close()
}
