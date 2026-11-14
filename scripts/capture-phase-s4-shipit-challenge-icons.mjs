/**
 * Phase S4 — Ship It! challenge icon assignment captures.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-phase-s4-shipit-challenge-icons.mjs
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

const outDir = join(root, 'docs/phase-s4-shipit-challenge-icons')
await mkdir(outDir, { recursive: true })

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

async function gotoChallenges(page, category) {
  const launch = await page.$('[data-testid="launch-shipit"]')
  if (launch) await launch.click()
  const url =
    category && category !== 'all'
      ? `${baseUrl}/shipit/challenges?category=${category}`
      : `${baseUrl}/shipit/challenges`
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="shipit-challenge-list"]', { timeout: 20000 })
  await page.waitForSelector('[data-testid^="shipit-section-"]', { timeout: 15000 })
  await page.waitForTimeout(400)
}

async function collectIconAudit(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid^="shipit-challenge-"]')]
    const rows = cards.map((card) => {
      const key = card.getAttribute('data-testid')?.replace('shipit-challenge-', '') ?? ''
      const completed = card.getAttribute('data-completed') === 'true'
      const iconSlot = card.querySelector('.challenge-card__icon')
      const semantic = iconSlot?.getAttribute('data-challenge-icon') ?? null
      const svg = card.querySelector('.challenge-card__icon svg')
      const faName = svg?.getAttribute('data-icon') ?? null
      return { key, completed, semantic, faName }
    })
    const contentIcons = rows
      .filter((r) => !r.completed)
      .map((r) => r.faName)
      .filter(Boolean)
    return {
      cardCount: rows.length,
      completedCount: rows.filter((r) => r.completed).length,
      completedUseCheckmark: rows
        .filter((r) => r.completed)
        .every((r) => r.semantic === 'status.completed' && r.faName === 'circle-check'),
      distinctContentFaIcons: [...new Set(contentIcons)],
      rows,
    }
  })
}

const browser = await chromium.launch({ headless: true })
const report = { player: player.display_name, audits: {} }

try {
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await login(page, player.display_name)

  await gotoChallenges(page, 'all')
  report.audits.all = await collectIconAudit(page)
  await page.screenshot({
    path: join(outDir, 'after-402-viewport-icons.png'),
    fullPage: false,
  })
  await page.screenshot({
    path: join(outDir, 'after-402-fullpage-icons.png'),
    fullPage: true,
  })

  // Crop of several available cards showing variety
  const firstSection = page.locator('[data-testid="shipit-section-classic_ship_landmarks"]')
  const box = await firstSection.boundingBox()
  if (box) {
    await page.screenshot({
      path: join(outDir, 'after-402-classic-icons.png'),
      clip: {
        x: 0,
        y: Math.max(0, box.y - 8),
        width: 402,
        height: Math.min(520, box.height + 16),
      },
    })
  }

  await gotoChallenges(page, 'food_and_drink_discoveries')
  report.audits.food = await collectIconAudit(page)
  await page.screenshot({
    path: join(outDir, 'after-402-food-icons.png'),
    fullPage: false,
  })

  await gotoChallenges(page, 'quirky_details_and_hidden_artifacts')
  report.audits.quirky = await collectIconAudit(page)
  await page.screenshot({
    path: join(outDir, 'after-402-quirky-icons.png'),
    fullPage: false,
  })

  await writeFile(join(outDir, 'icon-audit.json'), JSON.stringify(report, null, 2))
  console.log(
    `All-filter cards=${report.audits.all.cardCount} distinctFa=${report.audits.all.distinctContentFaIcons.length} completedCheck=${report.audits.all.completedUseCheckmark}`,
  )
  console.log(`Wrote screenshots to ${outDir}`)
} finally {
  await browser.close()
}
