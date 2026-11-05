/**
 * Capture Phase 1B mobile screenshots at 390×844 (DPR 2 → 780×1688).
 *
 * Requires:
 *   - Vite app running (default http://127.0.0.1:5173)
 *   - Local Supabase + provisioned identities
 *   - LOCAL_TEST_PASSWORD set
 *
 * Usage: LOCAL_TEST_PASSWORD='…' node scripts/capture-phase1b-screens.mjs [baseUrl]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD before capturing Phase 1B screenshots.')
  process.exit(1)
}

const summary = JSON.parse(
  await readFile(join(dirname(fileURLToPath(import.meta.url)), '../.local/test-identities.json'), 'utf8'),
)
const both = summary.identities.find((i) => i.key === 'both')
if (!both) {
  console.error('Missing dual-game identity in .local/test-identities.json — run npm run db:provision')
  process.exit(1)
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../docs/phase1b-screenshots')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
})
const page = await context.newPage()

async function shot(file) {
  const buffer = await page.screenshot({ type: 'png', fullPage: false })
  await writeFile(join(outDir, file), buffer)
  console.log(`wrote ${file} (${buffer.length} bytes)`)
}

async function loginAs(displayName) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#login-name')
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 })
}

// Login screen (logged out)
await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=Welcome Aboard')
await page.waitForTimeout(400)
await shot('phase1b-login.png')

// Dual-game chooser
await loginAs(both.display_name)
await page.waitForSelector('text=DRINK IT!')
await page.waitForTimeout(400)
await shot('phase1b-game-chooser.png')

await page.click('button:has-text("Launch")')
await page.waitForURL('**/drinkit')
await page.waitForSelector('text=Daily Bounties')
await page.waitForTimeout(400)
await shot('phase1b-drinkit-home.png')

await page.click('button[aria-label="Switch to Ship It!"]')
await page.waitForURL('**/shipit')
await page.waitForSelector(`text=Signed in as ${both.display_name}`)
await page.waitForTimeout(400)
await shot('phase1b-shipit-home.png')

await browser.close()
console.log(
  JSON.stringify({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    expectedPngPixels: { width: 780, height: 1688 },
    outDir,
  }),
)
