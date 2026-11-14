/**
 * Phase PC1-FE1 — Pre-Cruise homepage + rules screenshots.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-pc1-precruise.mjs
 *
 * Does not mutate Ship Clock / lifecycle. Opening Soon uses a response fixture.
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
const both =
  summary.identities.find((i) => i.key === 'both') ||
  summary.identities.find(
    (i) => Array.isArray(i.games) && i.games.includes('drinkit') && i.games.includes('shipit'),
  )
if (!both) {
  console.error('Need a dual-game identity (drinkit + shipit)')
  process.exit(1)
}
console.log(`Using identity ${both.key} (${both.display_name})`)

const outDir = join(root, 'docs/qa/pc1-precruise')
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

async function shot(page, name) {
  const path = join(outDir, `${name}.png`)
  await page.screenshot({ path, fullPage: false })
  console.log('wrote', path)
  return path
}

async function assertNoGameplayNav(page) {
  const count = await page.locator('nav[aria-label$="navigation"]').count()
  if (count > 0) throw new Error('Gameplay bottom nav should be hidden in pre-cruise')
}

async function openCategory(page, key) {
  await page.locator('[data-testid="rules-category-trigger"]').click()
  await page.locator(`[data-testid="rules-category-option-${key}"]`).click()
  await page.waitForTimeout(200)
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const page = await context.newPage()
const evidence = {
  captured_at: new Date().toISOString(),
  identity: both.key,
  checks: [],
}

try {
  await page.setViewportSize({ width: 402, height: 874 })
  await login(page, both.display_name)

  // 1. Pre-Cruise Home
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="game-selection"][data-precruise="true"]', {
    timeout: 15000,
  })
  await page.waitForSelector('[data-testid="countdown-units"], [data-testid="countdown-opening-soon"]', {
    timeout: 15000,
  })
  await assertNoGameplayNav(page)
  await shot(page, '01-precruise-home-402')

  // Routing gate: gameplay URL should bounce home
  await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="game-selection"]', { timeout: 10000 })
  if (!page.url().endsWith('/') && !page.url().match(/\/$/)) {
    // allow query-less root
  }
  const gated = new URL(page.url()).pathname === '/'
  evidence.checks.push({ name: 'gate-drinkit-home', ok: gated, url: page.url() })
  if (!gated) throw new Error(`Expected /drinkit gate → /, got ${page.url()}`)

  // Width sweep for home
  for (const vp of viewports.filter((v) => v.name !== '402')) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="game-selection"][data-precruise="true"]')
    await shot(page, `01-precruise-home-${vp.name}`)
  }
  await page.setViewportSize({ width: 402, height: 874 })

  // 2. Drink It! Rules — Quick Rules
  await page.goto(`${baseUrl}/drinkit/rules`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="drinkit-rules"]', { timeout: 15000 })
  await assertNoGameplayNav(page)
  await shot(page, '02-drinkit-rules-quick-402')

  // Expand first accordion
  const firstDetails = page.locator('[data-testid="rules-accordions"] details').first()
  await firstDetails.locator('summary').click()
  await page.waitForTimeout(200)
  await shot(page, '02b-drinkit-rules-quick-expanded-402')

  // 3. Drink It! Rules — Full Rules
  await openCategory(page, 'full')
  await shot(page, '03-drinkit-rules-full-402')

  // Width checks for drink rules
  for (const vp of viewports.filter((v) => v.name !== '402')) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await shot(page, `03-drinkit-rules-full-${vp.name}`)
  }
  await page.setViewportSize({ width: 402, height: 874 })

  // 4. Ship It! Rules — Quick Rules
  await page.goto(`${baseUrl}/shipit/rules`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="shipit-rules"]', { timeout: 15000 })
  await assertNoGameplayNav(page)
  await shot(page, '04-shipit-rules-quick-402')

  // 5. Ship It! Rules — Strategy Guide + FAQ
  await openCategory(page, 'strategy')
  await shot(page, '05-shipit-rules-strategy-402')
  await openCategory(page, 'faq')
  await shot(page, '05b-shipit-rules-faq-402')

  // Back button returns home
  await page.locator('[data-testid="rules-back"]').click()
  await page.waitForSelector('[data-testid="game-selection"]', { timeout: 10000 })
  evidence.checks.push({
    name: 'rules-back-home',
    ok: new URL(page.url()).pathname === '/',
    url: page.url(),
  })

  // 6. Opening Soon via isolated clock fixture (no DB mutation)
  await page.route('**/rest/v1/rpc/get_ship_clock_state*', async (route) => {
    const response = await route.fetch()
    const json = await response.json()
    const past = new Date(Date.now() - 60_000).toISOString()
    const patched = {
      ...json,
      lifecycle: 'pre_cruise',
      accepting_submissions: false,
      cruise_opens_at_utc: past,
      shipit_opens_at_utc: past,
      drinkit_opens_at_utc: past,
      at_utc: new Date().toISOString(),
    }
    await route.fulfill({
      status: response.status(),
      headers: { ...response.headers(), 'content-type': 'application/json' },
      body: JSON.stringify(patched),
    })
  })
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="countdown-opening-soon"]', { timeout: 15000 })
  await shot(page, '06-opening-soon-402')
  await page.unroute('**/rest/v1/rpc/get_ship_clock_state*')

  // Overflow probe on home
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowX: doc.scrollWidth > doc.clientWidth + 1,
    }
  })
  evidence.checks.push({ name: 'no-horizontal-overflow-home', ok: !overflow.overflowX, ...overflow })

  await writeFile(join(outDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log('evidence', evidence)
  console.log('done →', outDir)
} finally {
  await browser.close()
}
