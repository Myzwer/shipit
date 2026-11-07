/**
 * Phase 9A visual fidelity screenshots (core player journeys).
 *
 * Requires Vite + local Supabase + provisioned identities + LOCAL_TEST_PASSWORD.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
 *   LOCAL_TEST_PASSWORD='…' npm run screenshots:phase9a
 */
import { execSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Ensure mid-cruise open bounty hours (Gate 1 / Phase 8 tests may leave finale latched).
console.log('Aligning Ship Clock to mid-cruise bounty window…')
execSync('npm run db:seed-bounty-now', { cwd: root, stdio: 'inherit', env: process.env })

const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const both = summary.identities.find((i) => i.key === 'both')
const drinkOnly = summary.identities.find((i) => i.key === 'drink_only')
const shipOnly = summary.identities.find((i) => i.key === 'ship_only')
if (!both || !drinkOnly || !shipOnly) {
  console.error('Need both / drink_only / ship_only identities')
  process.exit(1)
}

const outDir = join(root, 'docs/phase9a-screenshots')
await mkdir(outDir, { recursive: true })

const viewports = [
  { name: '360', width: 360, height: 740 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: 'desktop', width: 1280, height: 800 },
]

const browser = await chromium.launch({ headless: true })
const results = []

function pass(name) {
  results.push({ name, ok: true })
  console.log(`PASS ${name}`)
}
function fail(name, detail) {
  results.push({ name, ok: false, detail })
  console.error(`FAIL ${name}: ${detail}`)
}

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

async function shot(page, file, fullPage = true) {
  await page.screenshot({ path: join(outDir, file), fullPage })
}

try {
  // Primary fidelity set at 390px
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await shot(page, '01-login.png')
  pass('login')

  await login(page, both.display_name)
  await page.waitForSelector('[data-testid="game-selection"]', { timeout: 15000 })
  await shot(page, '02-game-selection.png')
  pass('game-selection')

  await page.click('[data-testid="launch-drinkit"]')
  await page.waitForURL('**/drinkit', { timeout: 15000 })
  await page.waitForSelector('[data-testid="bounty-carousel"], [data-testid="home-bounty-error"]', {
    timeout: 20000,
  })
  await page
    .waitForFunction(
      () => {
        const err = document.querySelector('[data-testid="home-bounty-error"]')
        if (err) return true
        const claim = document.querySelector('[data-testid="bounty-claim"]')
        const title = document.querySelector('[data-testid="bounty-carousel"] h3')
        return Boolean(claim && title && !/loading/i.test(title.textContent || ''))
      },
      { timeout: 20000 },
    )
    .catch(() => {})
  await page.waitForTimeout(400)
  await shot(page, '03-drinkit-home.png')
  pass('drinkit-home')

  await page.click('[data-nav="action"]')
  await page.waitForURL('**/drinkit/log**', { timeout: 15000 })
  await page.waitForSelector('[data-testid="wizard-bar-step"]', { timeout: 15000 })
  await shot(page, '04-drinkit-log-bar.png')
  pass('drinkit-log-bar')

  const firstBar = page.locator('[data-testid^="bar-row-"]').first()
  if (await firstBar.count()) {
    await firstBar.click()
    await page.waitForSelector('[data-testid="wizard-drink-step"]', { timeout: 15000 })
    await shot(page, '05-drinkit-log-drink.png')
    pass('drinkit-log-drink')

    const firstDrink = page.locator('[data-testid^="drink-row-"]').first()
    if (await firstDrink.count()) {
      await firstDrink.click()
      await page.waitForSelector('[data-testid="wizard-friends-step"]', { timeout: 15000 })
      await shot(page, '06-drinkit-log-friends.png')
      pass('drinkit-log-friends')

      await page.click('[data-testid="friends-continue"]')
      await page.waitForSelector('[data-testid="wizard-photo-step"]', { timeout: 15000 })
      await shot(page, '07-drinkit-log-photo.png')
      pass('drinkit-log-photo')

      await page.click('[data-testid="photo-continue"]')
      await page.waitForSelector('[data-testid="wizard-review-step"]', { timeout: 20000 })
      await page.waitForSelector('[data-testid="review-bounties"], [data-testid="preview-retry"]', {
        timeout: 20000,
      })
      await page
        .waitForFunction(
          () => {
            const rows = document.querySelectorAll('[data-testid^="bounty-row-"]')
            return rows.length >= 1
          },
          { timeout: 15000 },
        )
        .catch(() => {})
      await page.locator('[data-testid="wizard-review-step"]').scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
      await shot(page, '08-drinkit-log-review.png')
      pass('drinkit-log-review')
    } else {
      fail('drinkit-log-drink-select', 'no drink options')
    }
  } else {
    fail('drinkit-log-bar-select', 'no bar options')
  }

  await page.goto(`${baseUrl}/shipit`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="shipit-progress"], [data-testid="shipit-leaderboard"]', {
    timeout: 20000,
  })
  await shot(page, '09-shipit-home.png')
  pass('shipit-home')

  await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="shipit-challenge-list"]', { timeout: 20000 })
  await shot(page, '10-shipit-challenges.png')
  pass('shipit-challenges')

  await context.close()

  // Responsive spot-checks (drink home + ship challenges)
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.name === 'desktop' ? 1 : 2,
      isMobile: vp.name !== 'desktop',
      hasTouch: vp.name !== 'desktop',
    })
    const p = await ctx.newPage()
    await login(p, drinkOnly.display_name)
    await p.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
    await p.waitForSelector('[data-testid="bounty-carousel"], [data-testid="home-bounty-error"]', {
      timeout: 20000,
    })
    await shot(p, `responsive-drinkit-home-${vp.name}.png`, false)
    pass(`responsive-drinkit-${vp.name}`)

    await login(p, shipOnly.display_name)
    await p.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
    await p.waitForSelector('[data-testid="shipit-challenge-list"]', { timeout: 20000 })
    await shot(p, `responsive-shipit-challenges-${vp.name}.png`, false)
    pass(`responsive-shipit-${vp.name}`)
    await ctx.close()
  }
} catch (err) {
  fail('phase9a-capture', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
await writeFile(
  join(outDir, 'RESULTS.md'),
  [
    '# Phase 9A screenshot capture results',
    '',
    ...results.map((r) => `- ${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? `: ${r.detail}` : ''}`),
    '',
  ].join('\n'),
)

if (failed.length) {
  console.error(`Phase 9A screenshots: ${failed.length} failed`)
  process.exit(1)
}
console.log(`Phase 9A screenshots: ${results.length} passed → ${outDir}`)
