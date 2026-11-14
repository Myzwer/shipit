/**
 * Phase S6 — Ship It! Gallery visual fidelity captures vs approved Drink It! Gallery.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-phase-s6-gallery.mjs
 *   # or relies on .local/runtime-qual-password.txt
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://localhost:5173'
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
  summary.identities.find(
    (i) => Array.isArray(i.games) && i.games.includes('shipit') && i.games.includes('drinkit'),
  ) ||
  summary.identities.find((i) => Array.isArray(i.games) && i.games.includes('shipit'))

if (!player) {
  console.error('No dual/Ship It! identity found in .local/test-identities.json')
  process.exit(1)
}
console.log(`Using identity ${player.key} (${player.display_name})`)

const outDir = join(root, 'docs/phase-s6-gallery')
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

async function openGallery(page, game) {
  await page.goto(`${baseUrl}/${game}/gallery`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="gallery-feed"]', { timeout: 20000 })
  await page
    .waitForSelector(
      '[data-testid="gallery-post"], [data-testid="gallery-empty"], [data-testid="gallery-skeletons"]',
      { timeout: 20000 },
    )
    .catch(() => null)
  await page.waitForTimeout(900)
}

async function measureGallery(page) {
  return page.evaluate(() => {
    const header = document.querySelector('[data-testid="section-header"]')
    const h1 = header?.querySelector('h1')
    const shipTime = document.querySelector('[data-testid="ship-time-indicator"]')
    const duplicate = document.querySelector('[data-testid="gallery-heading"]')
    const filters = document.querySelector('[data-testid="gallery-filters"]')
    const filterBtns = [...(filters?.querySelectorAll('button') ?? [])]
    const toggle = document.querySelector('[data-testid="gallery-show-achievements"]')
    const posts = [...document.querySelectorAll('[data-testid="gallery-post"]')]
    const polaroids = document.querySelectorAll('.gallery-polaroid')
    const awards = document.querySelectorAll('[data-testid="gallery-achievement-card"]')
    const pills = document.querySelectorAll('.gallery-react-pill')
    const rules = document.querySelectorAll('[data-testid="gallery-feed-rule"]')
    const nav = document.querySelector('.floating-bottom-nav')
    const feed = document.querySelector('[data-testid="gallery-feed"]')
    const firstFilter = filterBtns[0]
    const firstPill = pills[0]
    const firstPolaroid = polaroids[0]
    const firstAward = awards[0]
    const cs = (el) => (el ? getComputedStyle(el) : null)
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        left: Math.round(r.left),
      }
    }
    return {
      game: feed?.getAttribute('data-game'),
      headerTitle: h1?.textContent?.trim() ?? null,
      headerSticky: cs(header)?.position === 'sticky',
      headerBg: cs(header)?.backgroundColor ?? null,
      shipTimePresent: Boolean(shipTime),
      duplicateHeading: Boolean(duplicate),
      filterLabels: filterBtns.map((b) => b.textContent?.trim()),
      filterGeom: filterBtns.map((b) => ({
        ...rect(b),
        bg: cs(b)?.backgroundImage || cs(b)?.backgroundColor,
        radius: cs(b)?.borderRadius,
        fontSize: cs(b)?.fontSize,
        fontWeight: cs(b)?.fontWeight,
      })),
      togglePresent: Boolean(toggle),
      toggleChecked: toggle?.checked ?? null,
      postCount: posts.length,
      polaroidCount: polaroids.length,
      awardCount: awards.length,
      pillCount: pills.length,
      ruleCount: rules.length,
      firstPolaroid: firstPolaroid
        ? {
            ...rect(firstPolaroid),
            bg: cs(firstPolaroid)?.backgroundColor,
            radius: cs(firstPolaroid)?.borderRadius,
            padding: cs(firstPolaroid)?.padding,
          }
        : null,
      firstAward: firstAward
        ? {
            ...rect(firstAward),
            bg: cs(firstAward)?.backgroundImage || cs(firstAward)?.backgroundColor,
          }
        : null,
      firstPill: firstPill
        ? {
            ...rect(firstPill),
            bg: cs(firstPill)?.backgroundImage || cs(firstPill)?.backgroundColor,
          }
        : null,
      firstFilter: firstFilter ? rect(firstFilter) : null,
      navPresent: Boolean(nav),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      pageBg: cs(document.querySelector('.theme-ship, .theme-drink'))?.backgroundImage ?? null,
      kinds: posts.slice(0, 8).map((p) => p.getAttribute('data-kind')),
    }
  })
}

const browser = await chromium.launch({ headless: true })
const report = {
  player: player.display_name,
  viewports: {},
  interactions: {},
  comparisons: {},
}

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

    await openGallery(page, 'drinkit')
    const drink = await measureGallery(page)
    await page.screenshot({
      path: join(outDir, `drinkit-top-${vp.name}.png`),
      fullPage: false,
    })
    if (vp.name === '402') {
      await page.screenshot({
        path: join(outDir, 'drinkit-full-402.png'),
        fullPage: true,
      })
    }

    await openGallery(page, 'shipit')
    const ship = await measureGallery(page)
    await page.screenshot({
      path: join(outDir, `shipit-top-${vp.name}.png`),
      fullPage: false,
    })
    if (vp.name === '402') {
      await page.screenshot({
        path: join(outDir, 'shipit-full-402.png'),
        fullPage: true,
      })

      const photoPost = page.locator('[data-testid="gallery-post"][data-kind="scavenger"]').first()
      if (await photoPost.count()) {
        await photoPost.scrollIntoViewIfNeeded()
        await page.waitForTimeout(300)
        await photoPost.screenshot({ path: join(outDir, '02-shipit-photo-post.png') })
      }

      const awardPost = page.locator('[data-testid="gallery-post"][data-kind="achievement"]').first()
      if (await awardPost.count()) {
        await awardPost.scrollIntoViewIfNeeded()
        await page.waitForTimeout(300)
        await awardPost.screenshot({ path: join(outDir, '03-shipit-achievement.png') })
      }

      const firstTwo = page.locator('[data-testid="gallery-post"]')
      if ((await firstTwo.count()) >= 2) {
        const box1 = await firstTwo.nth(0).boundingBox()
        const box2 = await firstTwo.nth(1).boundingBox()
        if (box1 && box2) {
          const top = Math.min(box1.y, box2.y)
          const bottom = Math.max(box1.y + box1.height, box2.y + box2.height)
          await page.screenshot({
            path: join(outDir, '04-shipit-two-posts-dividers.png'),
            clip: {
              x: 0,
              y: Math.max(0, top - 8),
              width: vp.width,
              height: Math.min(vp.height, bottom - top + 24),
            },
          })
        }
      }

      // Achievements enabled (default)
      await page.screenshot({
        path: join(outDir, '05-shipit-achievements-on.png'),
        fullPage: false,
      })
      const awardCountOn = await page.locator('[data-testid="gallery-achievement-card"]').count()

      // Toggle off
      await page.locator('[data-testid="gallery-show-achievements"]').click()
      await page.waitForTimeout(400)
      const awardCountOff = await page.locator('[data-testid="gallery-achievement-card"]').count()
      await page.screenshot({
        path: join(outDir, '06-shipit-achievements-off.png'),
        fullPage: false,
      })
      report.interactions.showAchievements = {
        on: awardCountOn,
        off: awardCountOff,
        hidesAwards: awardCountOff === 0 && awardCountOn > 0,
      }
      // restore
      await page.locator('[data-testid="gallery-show-achievements"]').click()
      await page.waitForTimeout(300)

      // My Team filter
      await page.locator('[data-testid="gallery-filter-team"]').click()
      await page.waitForTimeout(800)
      await page.screenshot({
        path: join(outDir, '07-shipit-my-team.png'),
        fullPage: false,
      })
      report.interactions.myTeamFilterActive = await page
        .locator('[data-testid="gallery-filter-team"]')
        .getAttribute('aria-selected')

      // back to everyone for remaining shots
      await page.locator('[data-testid="gallery-filter-everyone"]').click()
      await page.waitForTimeout(800)

      // Full photo viewer
      const photoBtn = page.locator('[data-testid="gallery-post-photo"]').first()
      if (await photoBtn.count()) {
        await photoBtn.click()
        await page.waitForSelector('[data-testid="gallery-photo-viewer"]', { timeout: 10000 })
        await page.waitForTimeout(400)
        await page.screenshot({
          path: join(outDir, '08-shipit-photo-viewer.png'),
          fullPage: false,
        })
        await page.locator('[data-testid="gallery-photo-close"]').click()
        await page.waitForTimeout(300)
      }

      // Reaction float
      const heart = page.locator('[data-testid="gallery-react-heart"]').first()
      if (await heart.count()) {
        const pressed = await heart.getAttribute('aria-pressed')
        if (pressed === 'true') await heart.click()
        await page.waitForTimeout(250)
        await heart.click()
        await page.waitForTimeout(120)
        const floatVisible = await page.locator('[data-testid="gallery-react-float"]').count()
        report.interactions.reactionFloat = floatVisible > 0
        await page.screenshot({
          path: join(outDir, '02b-shipit-reaction-float.png'),
          fullPage: false,
        })
        await page.waitForTimeout(900)
      }

      // Near bottom of feed
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(700)
      await page.screenshot({
        path: join(outDir, '09-shipit-feed-bottom.png'),
        fullPage: false,
      })
      const endVisible = await page.locator('[data-testid="gallery-end"]').isVisible().catch(() => false)
      const navBox = await page.locator('.floating-bottom-nav').boundingBox()
      report.interactions.feedBottom = { endVisible, navPresent: Boolean(navBox) }
    }

    report.viewports[vp.name] = { drink, ship }
    report.comparisons[vp.name] = {
      bothNonStickyHeaders: drink.headerSticky === false && ship.headerSticky === false,
      neitherShowsShipTime: !drink.shipTimePresent && !ship.shipTimePresent,
      neitherDuplicateHeading: !drink.duplicateHeading && !ship.duplicateHeading,
      filterWidthDelta: Math.abs((drink.firstFilter?.w ?? 0) - (ship.firstFilter?.w ?? 0)),
      filterHeightDelta: Math.abs((drink.firstFilter?.h ?? 0) - (ship.firstFilter?.h ?? 0)),
      polaroidRadiusMatch:
        (drink.firstPolaroid?.radius ?? null) === (ship.firstPolaroid?.radius ?? null) ||
        !ship.firstPolaroid ||
        !drink.firstPolaroid,
      shipUsesPolaroids: ship.polaroidCount > 0 || ship.postCount === 0,
      shipUsesPills: ship.pillCount > 0 || ship.postCount === 0,
      noOverflow: !drink.overflowX && !ship.overflowX,
      shipFilterLabels: ship.filterLabels,
    }

    console.log(
      `${vp.name}: ship sticky=${ship.headerSticky} shipTime=${ship.shipTimePresent} polaroids=${ship.polaroidCount} pills=${ship.pillCount} Δfilter=${report.comparisons[vp.name].filterWidthDelta}x${report.comparisons[vp.name].filterHeightDelta}`,
    )

    await context.close()
  }

  await writeFile(join(outDir, 'RESULTS.json'), JSON.stringify(report, null, 2))
  console.log(`Wrote ${outDir}`)
} finally {
  await browser.close()
}
