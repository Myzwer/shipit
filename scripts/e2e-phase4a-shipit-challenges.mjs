/**
 * Phase 4A Playwright: Ship It! Home progress + Challenges list.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/e2e-phase4a-shipit-challenges.mjs [baseUrl]
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
const ship = summary.identities.find((i) => i.key === 'ship_only')
if (!ship) {
  console.error('Missing ship_only identity')
  process.exit(1)
}

const outDir = join(root, 'docs/phase4a-screenshots')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()
const results = []

function pass(name) {
  results.push({ name, ok: true })
  console.log(`PASS ${name}`)
}
function fail(name, detail) {
  results.push({ name, ok: false, detail })
  console.error(`FAIL ${name}: ${detail}`)
}

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.selectOption('#login-name', { label: ship.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/shipit', { timeout: 20000 })
  await page.waitForSelector('[data-testid="shipit-progress"]', { timeout: 20000 })
  pass('shipit-home-progress')

  const categories = [
    'classic_ship_landmarks',
    'food_and_drink_discoveries',
    'quirky_details_and_hidden_artifacts',
    'interactive_crew_and_activity',
    'creative_team_and_action_shots',
    'all',
  ]
  for (const key of categories) {
    if (await page.locator(`[data-testid="shipit-progress-${key}"]`).count()) {
      pass(`progress-row-${key}`)
    } else {
      fail(`progress-row-${key}`, 'missing')
    }
  }

  await page.waitForSelector('[data-testid="shipit-leaderboard"]')
  pass('shipit-leaderboard')
  await page.screenshot({ path: join(outDir, 'phase4a-shipit-home.png'), fullPage: false })

  await page.click('[data-testid="shipit-progress-classic_ship_landmarks"]')
  await page.waitForURL('**/shipit/challenges**', { timeout: 15000 })
  await page.waitForSelector('[data-testid="shipit-challenge-list"]', { timeout: 20000 })
  pass('category-nav-to-list')

  const filter = page.locator('[data-testid="shipit-challenge-filter"]')
  await expectFilter(filter)

  await page.screenshot({
    path: join(outDir, 'phase4a-shipit-challenges-classic.png'),
    fullPage: false,
  })

  // All Challenges via direct route (clears category filter)
  await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="shipit-section-classic_ship_landmarks"]', {
    timeout: 20000,
  })
  await page.waitForSelector('[data-testid="shipit-section-creative_team_and_action_shots"]', {
    timeout: 20000,
  })
  const sections = await page.locator('section[data-testid^="shipit-section-"]').count()
  if (sections === 5) pass('all-five-sections')
  else fail('all-five-sections', `count=${sections}`)

  await page.screenshot({
    path: join(outDir, 'phase4a-shipit-challenges-all.png'),
    fullPage: false,
  })

  // Unfinished card shows unavailable notice (no pretend completion)
  const openCard = page.locator('[data-actionable="true"]').first()
  await openCard.click()
  await page.waitForSelector('[data-testid="shipit-submission-unavailable"]')
  pass('no-fake-completion-action')
  await page.click('[data-testid="shipit-submission-unavailable-dismiss"]')
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
} finally {
  await writeFile(
    join(outDir, 'README.md'),
    `# Phase 4A screenshots (390×844)

| File | Notes |
|---|---|
| \`phase4a-shipit-home.png\` | Live Home progress + leaderboard |
| \`phase4a-shipit-challenges-classic.png\` | Category-filtered list |
| \`phase4a-shipit-challenges-all.png\` | All five category sections |

Photo-required submission is intentionally unavailable in 4A.
`,
  )
  await browser.close()
}

async function expectFilter(filter) {
  if (await filter.count()) pass('challenge-filter')
  else fail('challenge-filter', 'missing')
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
