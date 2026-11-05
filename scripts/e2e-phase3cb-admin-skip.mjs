/**
 * Phase 3C-B Playwright: Admin Skip confirmation + lost-response recovery.
 *
 *   LOCAL_TEST_PASSWORD='…' npx vite-node scripts/seed-skip-reserves.ts
 *   LOCAL_TEST_PASSWORD='…' node scripts/e2e-phase3cb-admin-skip.mjs [baseUrl]
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD')
  process.exit(1)
}

const summary = JSON.parse(
  await readFile(join(dirname(fileURLToPath(import.meta.url)), '../.local/test-identities.json'), 'utf8'),
)
const admin = summary.identities.find((i) => i.key === 'admin')
if (!admin) {
  console.error('Missing admin identity')
  process.exit(1)
}

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
  await page.selectOption('#login-name', { label: admin.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 20000 })

  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bounty-skip-section"]', { timeout: 20000 })
  pass('admin-skip-section')

  await page.waitForSelector('[data-testid="skip-cocktail-name"]', { timeout: 15000 })
  const cocktailBtn = page.locator('[data-testid="skip-cocktail"]')
  await page.waitForTimeout(500)
  if (await cocktailBtn.isDisabled()) {
    fail('skip-cocktail-enabled', 'Skip Cocktail disabled — run seed-skip-reserves.ts first')
  } else {
    await cocktailBtn.click()
    await page.waitForSelector('[data-testid="skip-confirm-modal"]')
    const body = await page.locator('[data-testid="skip-confirm-modal"]').innerText()
    if (!body.includes('Skip Current Bounty')) throw new Error('missing confirm title')
    pass('skip-confirm-modal')
    await page.click('[data-testid="skip-confirm-apply"]')
    await page.waitForSelector('[data-testid="skip-feedback"][data-kind="success"]', {
      timeout: 20000,
    })
    pass('skip-success')
  }

  // Lost-response: persist pending + fail reconcile once
  await page.evaluate(() => {
    localStorage.setItem(
      'star-princess.admin.pendingBountySkip.v1',
      JSON.stringify({
        version: 1,
        clientRequestId: crypto.randomUUID(),
        category: 'ingredient',
        expectedOfferId: '00000000-0000-4000-8000-000000000001',
        cruiseConfigId: null,
        createdAt: new Date().toISOString(),
      }),
    )
  })
  await page.route('**/rest/v1/rpc/admin_find_bounty_skip_request_by_id**', async (route) => {
    await route.abort('failed')
  })
  await page.route('**/rest/v1/rpc/admin_skip_current_bounty**', async (route) => {
    await route.abort('failed')
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="skip-feedback"][data-kind="unknown"]', {
    timeout: 15000,
  })
  pass('pending-unknown-on-reload')
  const retryVisible = await page.locator('[data-testid="retry-same-skip"]').isVisible()
  if (!retryVisible) throw new Error('retry same skip missing')
  pass('retry-same-skip-visible')
  await page.evaluate(() => localStorage.removeItem('star-princess.admin.pendingBountySkip.v1'))
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
const total = results.length
console.log(`${passed}/${total} passed`)
process.exit(passed === total && total > 0 ? 0 : 1)
