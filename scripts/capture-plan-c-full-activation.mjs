/**
 * Activation smoke for Plan C full-coverage Wrapped fixture.
 * Does not change clock/finale — assumes qa:activate wrapped already succeeded.
 *
 *   node scripts/capture-plan-c-full-activation.mjs [baseUrl]
 */
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'docs/qa/wrapped-plan-c-full/activation')
mkdirSync(outDir, { recursive: true })

const baseUrl = process.argv[2] || 'http://127.0.0.1:5173'
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  readFileSync(join(root, '.local/runtime-qual-password.txt'), 'utf8').trim()
if (!password || password.length < 12) {
  console.error('LOCAL_TEST_PASSWORD or .local/runtime-qual-password.txt required')
  process.exit(1)
}

async function login(page, displayName) {
  const res = await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 60000 })
  console.log(`login goto status=${res?.status()} url=${page.url()} as=${displayName}`)
  await page.waitForTimeout(1500)
  await page.getByTestId('login-name-trigger').waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="login-name-trigger"]')
    return el instanceof HTMLButtonElement && !el.disabled
  }, null, { timeout: 30000 })
  await page.locator('#login-name').selectOption({ label: displayName })
  await page.fill('#login-password', password)
  await page.getByTestId('login-submit').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 25000 })
  await page.waitForTimeout(800)
}

async function openWrapped(page, game) {
  await page.goto(`${baseUrl}/${game}/wrapped`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  if (await page.getByTestId('wrapped-not-available').count()) {
    throw new Error(`${game}: wrapped-not-available`)
  }
  const start = page.getByTestId('wrapped-start')
  if (await start.count()) {
    await start.click()
    await page.waitForTimeout(600)
  }
  await page.waitForSelector('[data-testid="wrapped-results"]', { timeout: 25000 })
}

async function probeGame(page, { game, expectedSlides, expectedPhotos, label }) {
  await openWrapped(page, game)

  const introCards = page.getByTestId('wrapped-intro-card')
  const storyCards = page.getByTestId('wrapped-story-card')
  const photoCards = page.getByTestId('wrapped-photo-card')
  const introCount = await introCards.count()
  const storyCount = await storyCards.count()
  const photoCount = await photoCards.count()
  const totalSlides = introCount + storyCount + photoCount

  // Counter text like "01 / 16" (intro + stories)
  const counterText = await page.locator('text=/\\d+\\s*\\/\\s*\\d+/').first().textContent().catch(() => null)

  // Photo integrity: every photo card should eventually show an img (not permanent fallback)
  const photoSrcs = []
  const broken = []
  for (let i = 0; i < photoCount; i++) {
    const card = photoCards.nth(i)
    await card.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    const img = card.locator('img')
    const fallback = card.getByTestId('wrapped-photo-fallback')
    if (await img.count()) {
      const src = await img.first().getAttribute('src')
      photoSrcs.push(src)
      if (!src || src.includes('no_image')) broken.push({ index: i, reason: 'bad_src', src })
      else {
        const ok = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url, { method: 'GET' })
            return res.ok
          } catch {
            return false
          }
        }, src)
        if (!ok) broken.push({ index: i, reason: 'fetch_failed', src: src?.slice(0, 80) })
      }
    } else if (await fallback.count()) {
      broken.push({ index: i, reason: 'fallback_visible' })
    } else {
      broken.push({ index: i, reason: 'no_img' })
    }
  }

  const uniquePhotos = new Set(photoSrcs.filter(Boolean))

  // Leaderboard
  const lb = page.getByTestId('wrapped-leaderboard')
  await lb.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  const lbVisible = (await lb.count()) > 0
  const champ = await page.getByTestId('wrapped-lb-champion').textContent().catch(() => null)
  const modeA = page.getByTestId('wrapped-lb-mode-points')
  const modeB = page.getByTestId('wrapped-lb-mode-completions').or(page.getByTestId('wrapped-lb-mode-bounties'))
  // Try both common mode test ids / buttons inside leaderboard
  const modeButtons = page.locator('[data-testid^="wrapped-lb-mode-"]')
  const modeCount = await modeButtons.count()
  let modesClicked = 0
  for (let i = 0; i < Math.min(modeCount, 3); i++) {
    await modeButtons.nth(i).click()
    modesClicked += 1
    await page.waitForTimeout(250)
  }

  const lbShot = join(outDir, `${game}-402-leaderboard.png`)
  await page.screenshot({ path: lbShot, fullPage: false })

  // All Stats
  const stats = page.getByTestId('wrapped-all-stats')
  await stats.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  const statsVisible = (await stats.count()) > 0
  const mine = page.getByTestId('wrapped-stats-mine')
  const ours = page.getByTestId('wrapped-stats-ours')
  if (await mine.count()) await mine.click()
  await page.waitForTimeout(200)
  if (await ours.count()) await ours.click()
  await page.waitForTimeout(200)
  const rows = await page.getByTestId('wrapped-stats-row').count()

  const statsShot = join(outDir, `${game}-402-all-stats.png`)
  await page.screenshot({ path: statsShot, fullPage: false })

  // Carousel top
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  const topShot = join(outDir, `${game}-402-carousel-top.png`)
  await page.screenshot({ path: topShot, fullPage: false })

  // Mid carousel swipe/scroll if possible
  const carousel = page.locator('[data-testid="wrapped-results"]').first()
  await carousel.evaluate((el) => {
    const scroller = el.querySelector('[class*="carousel"], [class*="track"], .peek') || el
    if (scroller && 'scrollLeft' in scroller) scroller.scrollLeft += 280
  }).catch(() => {})
  await page.waitForTimeout(400)
  const midShot = join(outDir, `${game}-402-carousel-mid.png`)
  await page.screenshot({ path: midShot, fullPage: false })

  const modesOk = modeCount >= 1 && modesClicked === Math.min(modeCount, 3)
  const ok =
    totalSlides === expectedSlides &&
    photoCount === expectedPhotos &&
    broken.length === 0 &&
    uniquePhotos.size === photoSrcs.length &&
    lbVisible &&
    statsVisible &&
    rows > 0 &&
    modesOk

  return {
    label,
    game,
    ok,
    totalSlides,
    expectedSlides,
    introCount,
    storyCount,
    photoCount,
    expectedPhotos,
    counterText,
    uniquePhotoCount: uniquePhotos.size,
    brokenPhotos: broken,
    leaderboard: {
      visible: lbVisible,
      champion: champ?.trim()?.slice(0, 120) || null,
      modeCount,
      modesClicked,
      modesOk,
    },
    allStats: { visible: statsVisible, rows },
    screenshots: [topShot, midShot, lbShot, statsShot],
  }
}

const browser = await chromium.launch({ headless: true })
const report = {
  captured_at: new Date().toISOString(),
  baseUrl,
  viewport: { width: 402, height: 874 },
  games: [],
}

async function withAccount(displayName, fn) {
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  try {
    await login(page, displayName)
    return await fn(page)
  } finally {
    await context.close()
  }
}

try {
  report.games.push(
    await withAccount('David F.', (page) =>
      probeGame(page, {
        game: 'drinkit',
        expectedSlides: 16,
        expectedPhotos: 6,
        label: 'David F. Drink It!',
      }),
    ),
  )
  report.games.push(
    await withAccount('Katie', (page) =>
      probeGame(page, {
        game: 'shipit',
        expectedSlides: 13,
        expectedPhotos: 4,
        label: 'Katie Ship It!',
      }),
    ),
  )
} finally {
  await browser.close()
}

report.ok = report.games.every((g) => g.ok)
writeFileSync(join(outDir, 'SMOKE.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exit(1)
console.log(`\nActivation smoke OK — screenshots in ${outDir}`)
