/**
 * Capture Phase 2D-B1 Home bounty screenshots at 390×844.
 *
 * LIVE (backend): active Cocktail + Ingredient after seed-local-bounty-now.
 * MOCKED (route stubs): overnight, paused, finale — labeled in filenames.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-phase2db1-screens.mjs [baseUrl]
 */
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
const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const drink = summary.identities.find((i) => i.key === 'drink_only')
if (!drink) {
  console.error('Missing drink_only identity')
  process.exit(1)
}

const outDir = join(root, 'docs/phase2db1-screenshots')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()

async function shot(file) {
  const buffer = await page.screenshot({ type: 'png', fullPage: false })
  await writeFile(join(outDir, file), buffer)
  console.log(`wrote ${file} (${buffer.length} bytes)`)
}

async function login() {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.selectOption('#login-name', { label: drink.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/drinkit', { timeout: 20000 })
  await page.waitForSelector('[data-testid="bounty-carousel"]')
}

function mockBountyApis(scenario) {
  return page.route('**/rest/v1/rpc/*', async (route) => {
    const url = route.request().url()
    const offset = -240
    const shipLocal =
      scenario === 'overnight'
        ? '2099-01-03T23:30:00'
        : scenario === 'preopen'
          ? '2099-01-03T10:00:00'
          : scenario === 'finale'
            ? '2099-01-09T18:30:00'
            : '2099-01-03T14:00:00'
    // Keep at_utc consistent with ship_local + offset (visual fixture only).
    const atUtc = new Date(Date.parse(`${shipLocal}Z`) - offset * 60_000).toISOString()
    const clock = {
      configured: true,
      at_utc: atUtc,
      offset_minutes: offset,
      ship_local: shipLocal,
      ship_date: scenario === 'finale' ? '2099-01-09' : '2099-01-03',
      cruise_day: scenario === 'finale' ? 7 : 1,
      lifecycle: scenario === 'finale' ? 'final' : 'active',
      finalized: scenario === 'finale',
      games: {
        drinkit: {
          status: scenario === 'paused' ? 'paused' : scenario === 'finale' ? 'final' : 'active',
          paused: scenario === 'paused',
          finalized_at_utc: scenario === 'finale' ? atUtc : null,
        },
        shipit: { status: 'active', paused: false, finalized_at_utc: null },
      },
    }

    if (url.includes('get_ship_clock_state')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(clock) })
    }
    if (url.includes('get_my_current_cocktail_bounty') || url.includes('get_my_current_ingredient_bounty')) {
      const status =
        scenario === 'paused' ? 'paused' : scenario === 'finale' ? 'finale' : 'unavailable'
      const reason =
        scenario === 'paused'
          ? 'drinkit_paused'
          : scenario === 'finale'
            ? 'friday_6pm_cutoff'
            : 'no_public_slot'
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status, reason }),
      })
    }
    return route.continue()
  })
}

// --- LIVE active screenshots ---
await login()
await page.waitForSelector('[data-bounty-presentation="active"]', { timeout: 20000 }).catch(() => null)
await page.waitForTimeout(600)
await shot('phase2db1-LIVE-active-cocktail.png')

const track = page.locator('[data-testid="bounty-carousel"]')
await track.evaluate((el) => {
  el.scrollBy({ left: el.clientWidth * 0.85, behavior: 'instant' })
})
await page.waitForTimeout(500)
await shot('phase2db1-LIVE-active-ingredient.png')

await page.getByRole('button', { name: 'Log Out' }).click()
await page.waitForURL('**/login')

// --- MOCKED state screenshots ---
for (const scenario of ['preopen', 'overnight', 'paused', 'finale']) {
  await context.unroute('**/rest/v1/rpc/*').catch(() => {})
  await mockBountyApis(scenario)
  await login()
  await page.waitForTimeout(700)
  await shot(`phase2db1-MOCKED-${scenario}.png`)
  await page.getByRole('button', { name: 'Log Out' }).click()
  await page.waitForURL('**/login')
  await context.unroute('**/rest/v1/rpc/*')
}

await writeFile(
  join(outDir, 'README.md'),
  `# Phase 2D-B1 screenshots (390×844)

| File | Backend | Notes |
|---|---|---|
| \`phase2db1-LIVE-active-cocktail.png\` | **Live** zero-arg RPCs after \`seed-local-bounty-now\` | Cocktail card centered |
| \`phase2db1-LIVE-active-ingredient.png\` | **Live** | Ingredient card after swipe |
| \`phase2db1-MOCKED-preopen.png\` | **Mocked** RPC route stubs | Game begins at noon |
| \`phase2db1-MOCKED-overnight.png\` | **Mocked** | See You Tomorrow |
| \`phase2db1-MOCKED-paused.png\` | **Mocked** | Pause messaging |
| \`phase2db1-MOCKED-finale.png\` | **Mocked** | Finale / unavailable |

Mocked screenshots prove UI state rendering only — they do **not** prove database authorization.
`,
)

await browser.close()
console.log('done')
