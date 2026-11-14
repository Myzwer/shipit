/**
 * Phase V4 visual QA — achievement unlock popup + gallery outline.
 * Injects celebration store state so organizer awards are not consumed.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-v4-achievement-popup.mjs
 */
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  (await readFile(join(dirname(fileURLToPath(import.meta.url)), '../.local/runtime-qual-password.txt'), 'utf8')).trim()

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const organizer = summary.identities.find((i) => i.is_admin === true)
if (!organizer) {
  console.error('Need admin identity in .local/test-identities.json')
  process.exit(1)
}

const outDir = join(root, 'docs/v4-achievement-popup-screenshots')
await mkdir(outDir, { recursive: true })

const mockupSrc = join(
  root,
  'handoff/design/original-final-mockups/2. Drink It - Achivement Popup.jpg',
)
await copyFile(mockupSrc, join(outDir, '00-mockup-reference.jpg')).catch(() => {})

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

function sampleCards(n) {
  const catalog = [
    {
      title: 'The Gintlemen',
      description: 'Have 3 gin drinks',
      icon_key: 'score.cocktail',
      stable_key: 'qa-gintlemen',
    },
    {
      title: "These Boots Are Made for Walkin'",
      description: 'Log your first drink of the cruise.',
      icon_key: 'score.bolt',
      stable_key: 'qa-boots',
    },
    {
      title: "Can't beat the classics",
      description: 'Log a drink using the Beer option.',
      icon_key: 'score.beer',
      stable_key: 'qa-beer',
    },
    {
      title: 'Margarita Kickoff',
      description: 'Log a margarita.',
      icon_key: 'score.lemon',
      stable_key: 'qa-marg',
    },
    {
      title: 'Morning Glory',
      description: 'Log a drink before noon.',
      icon_key: 'score.sun',
      stable_key: 'qa-morning',
    },
    {
      title: 'Ship Shape Sip',
      description: 'Log a drink on a sea day.',
      icon_key: 'theme.drink-it',
      stable_key: 'qa-sea',
    },
  ]
  return catalog.slice(0, n).map((row, i) => ({
    definition_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    stable_key: row.stable_key,
    game: 'drinkit',
    group_key: 'other',
    exclusive: false,
    secret: false,
    icon_key: row.icon_key,
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

async function shot(page, file) {
  await page.screenshot({ path: join(outDir, file), fullPage: false })
}

try {
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await login(page, organizer.display_name)

  await page.goto(`${baseUrl}/drinkit/gallery`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="gallery-feed"]', { timeout: 20000 })
  await page.waitForTimeout(500)
  await shot(page, '01-gallery-before-popup-402.png')
  pass('gallery-before')

  // Single unlock
  await openCelebration(page, sampleCards(1))
  const singleIcon = await page.getAttribute('[data-testid="achievement-unlock-icon"]', 'data-icon-key')
  const singleMode = await page.getAttribute('[data-testid="achievement-unlock-popup"]', 'data-mode')
  const ctaSingle = await page.locator('[data-testid="achievement-unlock-cta"]').innerText()
  if (singleMode !== 'single') throw new Error(`expected single mode, got ${singleMode}`)
  if (singleIcon !== 'score.cocktail') throw new Error(`expected cocktail icon, got ${singleIcon}`)
  if (!/See It/i.test(ctaSingle)) throw new Error(`expected See It, got ${ctaSingle}`)
  await shot(page, '02-single-unlock-402.png')
  pass('single-unlock-402')

  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 874 })
    await page.waitForTimeout(200)
    await shot(page, `02-single-unlock-${width}.png`)
  }
  pass('single-unlock-widths')

  await page.setViewportSize({ width: 402, height: 874 })
  await page.click('[data-testid="achievement-unlock-close"]')
  await page.waitForSelector('[data-testid="achievement-unlock-popup"]', { state: 'detached', timeout: 5000 })
  await shot(page, '03-gallery-after-dismiss-402.png')
  pass('gallery-after-dismiss')

  // Multi unlock (six)
  await openCelebration(page, sampleCards(6))
  const batchMode = await page.getAttribute('[data-testid="achievement-unlock-popup"]', 'data-mode')
  const batchTitle = await page.locator('[data-testid="achievement-unlock-title"]').innerText()
  const itemCount = await page.locator('[data-testid="achievement-unlock-item"]').count()
  const ctaBatch = await page.locator('[data-testid="achievement-unlock-cta"]').innerText()
  const batchIcon = await page.locator('[data-testid="achievement-unlock-batch-icon"]').count()
  if (batchMode !== 'batch') throw new Error(`expected batch mode, got ${batchMode}`)
  if (!/6 Achievements Unlocked/i.test(batchTitle)) throw new Error(`bad title: ${batchTitle}`)
  if (itemCount !== 6) throw new Error(`expected 6 names, got ${itemCount}`)
  if (!/See All/i.test(ctaBatch)) throw new Error(`expected See All, got ${ctaBatch}`)
  if (batchIcon !== 1) throw new Error('expected badge-check batch icon')
  await shot(page, '04-multi-unlock-six-402.png')
  pass('multi-unlock-402')

  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 874 })
    await page.waitForTimeout(200)
    await shot(page, `04-multi-unlock-six-${width}.png`)
  }
  pass('multi-unlock-widths')

  await page.setViewportSize({ width: 402, height: 874 })
  await page.click('[data-testid="achievement-unlock-close"]')
  await page.waitForSelector('[data-testid="achievement-unlock-popup"]', { state: 'detached', timeout: 5000 })

  // Outline regression: sticky ?submission= must clear; flash must not persist
  const probeId = '11111111-1111-4111-8111-111111111111'
  await page.goto(`${baseUrl}/drinkit/gallery?submission=${probeId}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="gallery-feed"]', { timeout: 20000 })
  await page.waitForTimeout(300)
  const urlMid = page.url()
  if (urlMid.includes('submission=')) {
    // allow brief moment for replace
    await page.waitForTimeout(400)
  }
  const urlAfter = page.url()
  if (new URL(urlAfter).searchParams.has('submission')) {
    throw new Error(`submission query still present: ${urlAfter}`)
  }
  await page.waitForTimeout(1600)
  const flashLeft = await page.locator('[data-flash="1"]').count()
  if (flashLeft !== 0) throw new Error(`flash highlight still present (${flashLeft})`)
  await shot(page, '05-gallery-no-persistent-outline-402.png')
  pass('no-persistent-outline')

  // Ship It! equivalent styling
  await page.goto(`${baseUrl}/shipit/gallery`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="gallery-feed"]', { timeout: 20000 })
  const shipCards = sampleCards(1).map((c) => ({ ...c, game: 'shipit', icon_key: 'theme.ship-it' }))
  await openCelebration(page, shipCards)
  const shipRootClass = await page.getAttribute('[data-testid="achievement-unlock-popup"]', 'class')
  if (!shipRootClass?.includes('theme-ship')) throw new Error('missing theme-ship on popup root')
  await shot(page, '06-shipit-single-unlock-402.png')
  pass('shipit-single')

  await page.click('[data-testid="achievement-unlock-close"]')
  await openCelebration(page, sampleCards(3).map((c) => ({ ...c, game: 'shipit' })))
  await shot(page, '07-shipit-multi-unlock-402.png')
  pass('shipit-multi')

  // Keyboard focus still works on filter controls after popup work
  await page.click('[data-testid="achievement-unlock-close"]')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await shot(page, '08-keyboard-focus-still-visible-402.png')
  pass('keyboard-focus-smoke')

  await context.close()
} catch (err) {
  fail('uncaught', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
await writeFile(
  join(outDir, 'qa-notes.json'),
  JSON.stringify({ results, failed: failed.length }, null, 2),
)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
console.log(`Screenshots → ${outDir}`)
process.exit(failed.length ? 1 : 0)
