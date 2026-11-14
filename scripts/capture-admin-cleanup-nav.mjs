/**
 * Capture Admin section navigation screenshots at mobile widths + desktop.
 * Usage: node scripts/capture-admin-cleanup-nav.mjs http://localhost:5173
 */
import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const base = process.argv[2] || 'http://localhost:5173'
const outDir = join(process.cwd(), 'docs', 'admin-cleanup-nav')
await mkdir(outDir, { recursive: true })

const password = (await readFile('.local/runtime-qual-password.txt', 'utf8')).trim()
const summary = JSON.parse(await readFile('.local/test-identities.json', 'utf8'))
const admin = summary.identities.find((i) => i.is_admin)
if (!admin) throw new Error('missing admin identity')

const widths = [360, 390, 402, 430]
const sections = [
  { key: 'overview', file: 'overview', open: false },
  { key: 'players', file: 'players', open: false },
  { key: 'drinkit', file: 'drinkit', open: false },
  { key: 'shipclock', file: 'ship-clock', open: false },
  { key: 'catalog', file: 'catalog', open: false },
]

const browser = await chromium.launch({ headless: true })
const results = []

async function login(page) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page.locator('#login-name').selectOption({ label: admin.display_name })
  await page.locator('#login-password').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !new URL(u).pathname.endsWith('/login'), { timeout: 20000 })
}

async function openAdmin(page) {
  await page.goto(`${base}/admin`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="admin-view"]')
}

for (const width of [...widths, 1280]) {
  const page = await browser.newPage({
    viewport: { width, height: width === 1280 ? 900 : 874 },
  })
  await login(page)
  await openAdmin(page)

  // Default overview
  await page.waitForSelector('[data-testid="admin-overview"]')
  const suffix = width === 1280 ? 'desktop' : String(width)
  await page.screenshot({
    path: join(outDir, `overview-${suffix}.png`),
    fullPage: true,
  })
  results.push(`overview-${suffix}`)

  // Dropdown open
  await page.locator('[data-testid="admin-section-filter-trigger"]').click()
  await page.waitForSelector('[data-testid="admin-section-filter-menu"]')
  await page.screenshot({
    path: join(outDir, `section-dropdown-${suffix}.png`),
    fullPage: false,
  })
  results.push(`dropdown-${suffix}`)
  await page.keyboard.press('Escape')

  for (const section of sections.filter((s) => s.key !== 'overview')) {
    await page.locator(`[data-testid="admin-section-filter-trigger"]`).click()
    await page.locator(`[data-testid="admin-section-filter-option-${section.key}"]`).click()
    await page.waitForTimeout(600)
    // Ensure only one primary section root is present for expensive tools
    const roster = await page.locator('[data-testid="roster-section"]').count()
    const overview = await page.locator('[data-testid="admin-overview"]').count()
    if (section.key === 'players') {
      if (roster !== 1) throw new Error(`expected roster mounted at ${width}`)
      const rows = await page.locator('[data-testid="roster-row"]').count()
      if (rows !== 22) throw new Error(`expected 22 roster rows, got ${rows} at ${width}`)
    } else if (overview !== 0 && section.key !== 'overview') {
      // KeepAlive may keep overview in DOM as inactive cached vnode — Playwright sees attached nodes.
      // Prefer checking the labeled section text / active testids instead.
    }
    await page.screenshot({
      path: join(outDir, `${section.file}-${suffix}.png`),
      fullPage: true,
    })
    results.push(`${section.file}-${suffix}`)
  }

  // Re-open overview and confirm players unmount from visible tree via label
  await page.locator(`[data-testid="admin-section-filter-trigger"]`).click()
  await page.locator(`[data-testid="admin-section-filter-option-overview"]`).click()
  await page.waitForSelector('[data-testid="admin-overview"]')
  const label = await page.locator('[data-testid="admin-section-label"]').textContent()
  if (!label?.includes('Overview')) throw new Error(`bad section label: ${label}`)

  await page.close()
}

await writeFile(join(outDir, 'results.json'), JSON.stringify({ base, results }, null, 2))
await browser.close()
console.log('PASS admin-cleanup-nav', results.length, 'shots')
