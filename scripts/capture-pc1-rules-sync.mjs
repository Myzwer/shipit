/**
 * PC1 Final Rules Sync — capture in-game How to Play (mocked active lifecycle).
 * Does NOT mutate Ship Clock / DB lifecycle. Pre-Cruise env stays untouched.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-pc1-rules-sync.mjs [baseUrl]
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

const outDir = join(root, 'docs/qa/pc1-rules-sync')
await mkdir(outDir, { recursive: true })

const viewports = [
  { name: '360', width: 360, height: 740 },
  { name: '402', width: 402, height: 874 },
  { name: '430', width: 430, height: 932 },
]

const evidence = {
  captured_at: new Date().toISOString(),
  identity: both.key,
  note: 'Active-game homes via mocked get_ship_clock_state lifecycle=active; no DB lifecycle change',
  checks: [],
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

async function mockActiveLifecycle(page) {
  await page.route('**/rest/v1/rpc/get_ship_clock_state*', async (route) => {
    const response = await route.fetch()
    const json = await response.json()
    const patched = {
      ...json,
      lifecycle: 'active',
      accepting_submissions: true,
      finalized: false,
      cruise_day: typeof json.cruise_day === 'number' && json.cruise_day > 0 ? json.cruise_day : 1,
      games: {
        ...(json.games ?? {}),
        drinkit: {
          ...(json.games?.drinkit ?? {}),
          status: 'active',
          paused: false,
          finalized_at_utc: null,
        },
        shipit: {
          ...(json.games?.shipit ?? {}),
          status: 'active',
          paused: false,
          finalized_at_utc: null,
        },
      },
    }
    await route.fulfill({
      status: response.status(),
      headers: { ...response.headers(), 'content-type': 'application/json' },
      body: JSON.stringify(patched),
    })
  })
}

async function mockShipItHomeIfNeeded(page) {
  // When env is truly pre_cruise, get_my_shipit_home may still return payload;
  // ensure we always have a payload so How to Play mounts.
  await page.route('**/rest/v1/rpc/get_my_shipit_home*', async (route) => {
    const response = await route.fetch()
    let json
    try {
      json = await response.json()
    } catch {
      json = null
    }
    if (json && json.ok !== false && json.team) {
      return route.fulfill({
        status: response.status(),
        headers: { ...response.headers(), 'content-type': 'application/json' },
        body: JSON.stringify({
          ...json,
          lifecycle: {
            ...(json.lifecycle ?? {}),
            status: 'active',
          },
        }),
      })
    }
    const fixture = {
      ok: true,
      team: { id: '00000000-0000-4000-8000-000000000001', name: 'Fixture Team' },
      lifecycle: { status: 'active' },
      categories: [
        {
          category: 'classic_ship_landmarks',
          label: 'Classic Ship Landmarks',
          completed: 0,
          total: 10,
          points: 0,
        },
      ],
      overall: { completed: 0, total: 50, points: 0 },
      leaderboard: [],
    }
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fixture),
    })
  })
}

async function mockDrinkItHomeBoard(page) {
  await page.route('**/rest/v1/rpc/get_my_drinkit_home_board*', async (route) => {
    const response = await route.fetch()
    let json
    try {
      json = await response.json()
    } catch {
      json = null
    }
    if (json && (json.ok === true || json.cards || json.board)) {
      return route.fulfill({
        status: response.status(),
        headers: { ...response.headers(), 'content-type': 'application/json' },
        body: JSON.stringify(json),
      })
    }
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        lifecycle: 'active',
        phase: 'daytime',
        cards: [],
      }),
    })
  })
}

async function textOfRules(page) {
  return page.locator('[data-testid="game-rules-panel"]').innerText()
}

async function collectCategoryTexts(page) {
  const keys = ['quick', 'full', 'strategy', 'faq']
  const texts = {}
  for (const key of keys) {
    await page.locator(`[data-testid="rules-nav-${key}"]`).click()
    await page.waitForTimeout(150)
    texts[key] = await textOfRules(page)
  }
  return texts
}

async function shot(page, name, fullPage = false) {
  const path = join(outDir, `${name}.png`)
  await page.screenshot({ path, fullPage })
  console.log('wrote', path)
  return path
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const page = await context.newPage()

try {
  await page.setViewportSize({ width: 402, height: 874 })
  await login(page, both.display_name)

  // --- Pre-Cruise baseline (no mock) ---
  await page.goto(`${baseUrl}/drinkit/rules`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="drinkit-rules"] [data-testid="game-rules-panel"]', {
    timeout: 15000,
  })
  const preDrink = await collectCategoryTexts(page)
  await page.locator('[data-testid="rules-nav-quick"]').click()
  await shot(page, 'precruise-drinkit-quick-402')

  await page.goto(`${baseUrl}/shipit/rules`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="shipit-rules"] [data-testid="game-rules-panel"]', {
    timeout: 15000,
  })
  const preShip = await collectCategoryTexts(page)
  await page.locator('[data-testid="rules-nav-quick"]').click()
  await shot(page, 'precruise-shipit-quick-402')

  // Confirm still on Pre-Cruise clock in live env (before mock)
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="game-selection"][data-precruise="true"]', {
    timeout: 15000,
  })
  evidence.checks.push({ name: 'env-still-precruise-before-mock', ok: true })

  // --- Active homes via isolated clock fixture ---
  await mockActiveLifecycle(page)
  await mockShipItHomeIfNeeded(page)
  await mockDrinkItHomeBoard(page)

  // Drink It! home rules
  await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="how-to-play"] [data-testid="game-rules-panel"]', {
    timeout: 20000,
  })
  const activeDrink = await collectCategoryTexts(page)
  await page.locator('[data-testid="rules-nav-quick"]').click()
  await page.locator('[data-testid="how-to-play"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await shot(page, 'active-drinkit-rules-quick-402')

  for (const vp of viewports.filter((v) => v.name !== '402')) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.locator('[data-testid="how-to-play"]').scrollIntoViewIfNeeded()
    await shot(page, `active-drinkit-rules-quick-${vp.name}`)
  }
  await page.setViewportSize({ width: 402, height: 874 })

  // Full + FAQ samples
  await page.locator('[data-testid="rules-nav-full"]').click()
  await page.waitForTimeout(150)
  await page.locator('[data-testid="how-to-play"]').scrollIntoViewIfNeeded()
  await shot(page, 'active-drinkit-rules-full-402')
  await page.locator('[data-testid="rules-nav-faq"]').click()
  await page.waitForTimeout(150)
  await page.locator('[data-testid="how-to-play"]').scrollIntoViewIfNeeded()
  await shot(page, 'active-drinkit-rules-faq-402')

  // Ship It! home rules
  await page.goto(`${baseUrl}/shipit`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="how-to-play"] [data-testid="game-rules-panel"]', {
    timeout: 20000,
  })
  const activeShip = await collectCategoryTexts(page)
  await page.locator('[data-testid="rules-nav-quick"]').click()
  await page.locator('[data-testid="how-to-play"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await shot(page, 'active-shipit-rules-quick-402')

  for (const vp of viewports.filter((v) => v.name !== '402')) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.locator('[data-testid="how-to-play"]').scrollIntoViewIfNeeded()
    await shot(page, `active-shipit-rules-quick-${vp.name}`)
  }
  await page.setViewportSize({ width: 402, height: 874 })

  await page.locator('[data-testid="rules-nav-strategy"]').click()
  await page.waitForTimeout(150)
  await page.locator('[data-testid="how-to-play"]').scrollIntoViewIfNeeded()
  await shot(page, 'active-shipit-rules-strategy-402')

  // Content identity checks
  for (const key of ['quick', 'full', 'strategy', 'faq']) {
    const drinkMatch = preDrink[key] === activeDrink[key]
    const shipMatch = preShip[key] === activeShip[key]
    evidence.checks.push({
      name: `drinkit-${key}-identical`,
      ok: drinkMatch,
      preLen: preDrink[key]?.length ?? 0,
      activeLen: activeDrink[key]?.length ?? 0,
    })
    evidence.checks.push({
      name: `shipit-${key}-identical`,
      ok: shipMatch,
      preLen: preShip[key]?.length ?? 0,
      activeLen: activeShip[key]?.length ?? 0,
    })
    if (!drinkMatch) console.error(`MISMATCH drinkit ${key}`)
    if (!shipMatch) console.error(`MISMATCH shipit ${key}`)
  }

  // Nav + next footer smoke
  await page.locator('[data-testid="rules-nav-quick"]').click()
  await page.locator('[data-testid="rules-section-next"]').click()
  await page.waitForTimeout(200)
  const fullActive = await page.locator('[data-testid="rules-nav-full"]').getAttribute('aria-current')
  evidence.checks.push({ name: 'next-footer-to-full', ok: fullActive === 'page' })

  // Overflow at 360
  await page.setViewportSize({ width: 360, height: 740 })
  await page.locator('[data-testid="how-to-play"]').scrollIntoViewIfNeeded()
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowX: doc.scrollWidth > doc.clientWidth + 1,
    }
  })
  evidence.checks.push({ name: 'no-horizontal-overflow-360', ok: !overflow.overflowX, ...overflow })

  // Drop mock and confirm Pre-Cruise env restored for this browser session
  await page.unroute('**/rest/v1/rpc/get_ship_clock_state*')
  await page.unroute('**/rest/v1/rpc/get_my_shipit_home*')
  await page.unroute('**/rest/v1/rpc/get_my_drinkit_home_board*')
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="game-selection"][data-precruise="true"]', {
    timeout: 15000,
  })
  evidence.checks.push({ name: 'env-precruise-after-unmock', ok: true, url: page.url() })

  const failed = evidence.checks.filter((c) => !c.ok)
  evidence.ok = failed.length === 0
  evidence.failed = failed

  await writeFile(join(outDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log('evidence', JSON.stringify(evidence, null, 2))
  if (!evidence.ok) {
    console.error('Some checks failed')
    process.exitCode = 1
  } else {
    console.log('done →', outDir)
  }
} finally {
  await browser.close()
}
