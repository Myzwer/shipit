/**
 * Phase V5 — achievement unlock celebration motion frames + short recordings.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-v5-achievement-celebration.mjs http://localhost:5173
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://localhost:5173'
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  (await readFile(join(dirname(fileURLToPath(import.meta.url)), '../.local/runtime-qual-password.txt'), 'utf8')).trim()

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const organizer = summary.identities.find((i) => i.is_admin === true)
if (!organizer) {
  console.error('Need admin identity')
  process.exit(1)
}

const outDir = join(root, 'docs/v5-achievement-celebration-screenshots')
await mkdir(outDir, { recursive: true })

const results = []
function pass(name) {
  results.push({ name, ok: true })
  console.log(`PASS ${name}`)
}
function fail(name, detail) {
  results.push({ name, ok: false, detail })
  console.error(`FAIL ${name}: ${detail}`)
}

function sampleCards(n, game = 'drinkit') {
  const catalog = [
    { title: 'The Gintlemen', description: 'Have 3 gin drinks', icon_key: 'score.cocktail' },
    { title: "These Boots Are Made for Walkin'", description: 'Log your first drink.', icon_key: 'score.bolt' },
    { title: "Can't beat the classics", description: 'Log a beer.', icon_key: 'score.beer' },
    { title: 'Margarita Kickoff', description: 'Log a margarita.', icon_key: 'score.lemon' },
    { title: 'Morning Glory', description: 'Log before noon.', icon_key: 'score.sun' },
    { title: 'Ship Shape Sip', description: 'Log on a sea day.', icon_key: 'theme.drink-it' },
  ]
  return catalog.slice(0, n).map((row, i) => ({
    definition_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    stable_key: `qa-${i}`,
    game,
    group_key: 'other',
    exclusive: false,
    secret: false,
    icon_key: game === 'shipit' && i === 0 ? 'theme.ship-it' : row.icon_key,
    title: row.title,
    description: row.description,
    earned: true,
    awarded_at_utc: new Date().toISOString(),
    award_id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    progress: null,
    exclusive_claimed: false,
    exclusive_owner_name: null,
    masked: false,
    view: 'mine',
  }))
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

async function openCelebration(page, cards) {
  await page.evaluate((payload) => {
    const app = document.querySelector('#app')?.__vue_app__
    const pinia = app?.config?.globalProperties?.$pinia
    const store = pinia?._s?.get('achievementCelebration')
    if (!store) throw new Error('achievementCelebration store not found')
    store.visibleCards = payload
    store.open = true
    store.loading = false
    store.pending = null
  }, cards)
  await page.waitForSelector('[data-testid="achievement-unlock-popup"]', { timeout: 5000 })
}

async function closeCelebration(page) {
  const close = page.locator('[data-testid="achievement-unlock-close"]')
  if (await close.count()) {
    await close.click({ force: true })
    await page.waitForSelector('[data-testid="achievement-unlock-popup"]', {
      state: 'detached',
      timeout: 5000,
    })
  }
}

async function captureFrameSequence(page, prefix, delaysMs) {
  for (const ms of delaysMs) {
    await page.waitForTimeout(ms)
    await page.screenshot({
      path: join(outDir, `${prefix}-t${String(ms).padStart(3, '0')}ms.png`),
      fullPage: false,
    })
  }
}

const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: join(outDir, 'videos'), size: { width: 402, height: 874 } },
  })
  const page = await context.newPage()
  await login(page, organizer.display_name)

  // Drink It! single — frame sequence + settled
  await page.goto(`${baseUrl}/drinkit/gallery`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="gallery-feed"]', { timeout: 20000 })
  await openCelebration(page, sampleCards(1))
  const celebrating = await page.getAttribute('[data-testid="achievement-unlock-popup"]', 'class')
  if (!celebrating?.includes('is-celebrating') && !celebrating?.includes('is-reduced-motion')) {
    throw new Error('missing celebration class')
  }
  await captureFrameSequence(page, '01-drinkit-single', [40, 120, 220, 360, 520, 700])
  await page.screenshot({ path: join(outDir, '01-drinkit-single-settled-402.png'), fullPage: false })
  pass('drinkit-single-frames')

  // Immediate close during entrance
  await closeCelebration(page)
  await openCelebration(page, sampleCards(1))
  await page.waitForTimeout(80)
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="achievement-unlock-popup"]', {
    state: 'detached',
    timeout: 5000,
  })
  pass('escape-during-entrance')

  // Multi
  await openCelebration(page, sampleCards(6))
  await captureFrameSequence(page, '02-drinkit-multi', [40, 140, 280, 450, 650])
  await page.screenshot({ path: join(outDir, '02-drinkit-multi-settled-402.png'), fullPage: false })
  const mode = await page.getAttribute('[data-testid="achievement-unlock-popup"]', 'data-mode')
  if (mode !== 'batch') throw new Error(`expected batch, got ${mode}`)
  pass('drinkit-multi-frames')

  // Widths settled
  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 874 })
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(outDir, `02-drinkit-multi-settled-${width}.png`),
      fullPage: false,
    })
  }
  await page.setViewportSize({ width: 402, height: 874 })
  pass('drinkit-multi-widths')

  // No replay on unrelated reactive updates while still open
  const epochBefore = await page.getAttribute(
    '[data-testid="achievement-unlock-popup"]',
    'data-celebration-epoch',
  )
  await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const pinia = app?.config?.globalProperties?.$pinia
    const store = pinia?._s?.get('achievementCelebration')
    if (!store) throw new Error('store missing')
    // Touch visible cards without closing — should not remount / re-bump epoch.
    store.visibleCards = store.visibleCards.map((c) => ({ ...c }))
  })
  await page.waitForTimeout(350)
  const stillOpen = await page.locator('[data-testid="achievement-unlock-popup"]').count()
  if (stillOpen !== 1) throw new Error('popup closed during rerender probe')
  const epochAfter = await page.getAttribute(
    '[data-testid="achievement-unlock-popup"]',
    'data-celebration-epoch',
  )
  if (epochBefore !== epochAfter) {
    throw new Error(`celebration epoch changed on rerender (${epochBefore} → ${epochAfter})`)
  }
  pass('no-replay-on-rerender')

  await closeCelebration(page)

  // Ship It!
  await page.goto(`${baseUrl}/shipit/gallery`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="gallery-feed"]', { timeout: 20000 })
  await openCelebration(page, sampleCards(1, 'shipit'))
  await captureFrameSequence(page, '03-shipit-single', [60, 200, 400, 650])
  await page.screenshot({ path: join(outDir, '03-shipit-single-settled-402.png'), fullPage: false })
  const shipClass = await page.getAttribute('[data-testid="achievement-unlock-popup"]', 'class')
  if (!shipClass?.includes('theme-ship')) throw new Error('missing theme-ship')
  pass('shipit-single')

  await closeCelebration(page)
  await openCelebration(page, sampleCards(3, 'shipit'))
  await captureFrameSequence(page, '04-shipit-multi', [60, 220, 480])
  await page.screenshot({ path: join(outDir, '04-shipit-multi-settled-402.png'), fullPage: false })
  pass('shipit-multi')

  await closeCelebration(page)

  // See It navigation
  await page.goto(`${baseUrl}/drinkit/gallery`, { waitUntil: 'networkidle' })
  await openCelebration(page, sampleCards(1))
  await page.click('[data-testid="achievement-unlock-cta"]')
  await page.waitForURL(/\/drinkit\/achievements/, { timeout: 15000 })
  pass('see-it-navigates')

  await context.close()

  // Reduced motion in a fresh context
  const reducedCtx = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  })
  const reducedPage = await reducedCtx.newPage()
  await login(reducedPage, organizer.display_name)
  await reducedPage.goto(`${baseUrl}/drinkit/gallery`, { waitUntil: 'networkidle' })
  await openCelebration(reducedPage, sampleCards(1))
  const reducedAttr = await reducedPage.getAttribute(
    '[data-testid="achievement-unlock-popup"]',
    'data-reduced-motion',
  )
  const reducedClass = await reducedPage.getAttribute(
    '[data-testid="achievement-unlock-popup"]',
    'class',
  )
  if (reducedAttr !== '1' && !reducedClass?.includes('is-reduced-motion')) {
    throw new Error(`reduced motion not applied: attr=${reducedAttr} class=${reducedClass}`)
  }
  await reducedPage.waitForTimeout(200)
  await reducedPage.screenshot({
    path: join(outDir, '05-reduced-motion-402.png'),
    fullPage: false,
  })
  // Close during “entrance” still works
  await reducedPage.keyboard.press('Escape')
  await reducedPage.waitForSelector('[data-testid="achievement-unlock-popup"]', {
    state: 'detached',
    timeout: 5000,
  })
  pass('reduced-motion')

  await reducedCtx.close()
} catch (err) {
  fail('uncaught', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
await writeFile(
  join(outDir, 'qa-notes.json'),
  JSON.stringify(
    {
      durations: {
        backdrop: '180ms ease-out',
        card: '300ms cubic-bezier(0.22, 1.35, 0.36, 1)',
        iconSingle: '560ms @ 70ms delay',
        iconBatch: '620ms stronger pop',
        starburst: '~600ms rays + halo + sparks',
      },
      results,
      failed: failed.length,
    },
    null,
    2,
  ),
)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
console.log(`Artifacts → ${outDir}`)
process.exit(failed.length ? 1 : 0)
