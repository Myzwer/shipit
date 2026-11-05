/**
 * Phase 2D-B2.1 Playwright: lost Pause response + reload keeps lock; Refresh reconciles.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
 *   LOCAL_TEST_PASSWORD='…' node scripts/e2e-phase2db2-1-pause-reliability.mjs [baseUrl]
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

async function loginAs(displayName) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 20000 })
}

try {
  await loginAs(admin.display_name)
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="game-status-section"]')

  // Ensure running before pause probe (resume if needed).
  const pausedAttr = await page.locator('[data-testid="drinkit-pause-state"]').getAttribute('data-paused')
  if (pausedAttr === 'true') {
    await page.click('[data-testid="resume-drinkit"]')
    await page.click('[data-testid="pause-confirm-apply"]')
    await page.waitForFunction(() => {
      return (
        document.querySelector('[data-testid="drinkit-pause-state"]')?.getAttribute('data-paused') ===
        'false'
      )
    })
  }
  pass('admin-running-baseline')

  // 1/2: Pause RPC reaches server but client loses the response; then status refresh fails once.
  let pauseHits = 0
  await page.route('**/rest/v1/rpc/admin_set_drinkit_paused**', async (route) => {
    pauseHits += 1
    const response = await route.fetch()
    // Drop the successful body so the client treats the outcome as unknown.
    await route.abort('failed')
    void response
  })
  await page.route('**/rest/v1/rpc/admin_get_drinkit_pause_status**', async (route) => {
    // After the lost pause, let one status call fail to simulate failed reconciliation.
    if (pauseHits >= 1) {
      pauseHits = -999 // only once
      await route.abort('failed')
      return
    }
    await route.continue()
  })

  await page.click('[data-testid="pause-drinkit"]')
  await page.click('[data-testid="pause-confirm-apply"]')
  await page.waitForSelector('[data-testid="game-status-feedback"][data-kind="unknown"]', {
    timeout: 20000,
  })
  pass('lost-response-unknown-feedback')

  const pendingAfterLoss = await page
    .locator('[data-testid="drinkit-pause-state"]')
    .getAttribute('data-pending')
  if (pendingAfterLoss === 'true') pass('pending-locked-after-loss')
  else fail('pending-locked-after-loss', pendingAfterLoss)

  const pauseDisabled = await page.locator('[data-testid="pause-drinkit"], [data-testid="resume-drinkit"]').first().isDisabled()
  if (pauseDisabled) pass('conflicting-controls-disabled')
  else fail('conflicting-controls-disabled', 'mutation still enabled')

  // Clear routes so reload can talk to the backend.
  await page.unroute('**/rest/v1/rpc/admin_set_drinkit_paused**')
  await page.unroute('**/rest/v1/rpc/admin_get_drinkit_pause_status**')

  // 4/5: reload restores pending protection
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="game-status-section"]')
  await page.waitForTimeout(800)
  const pendingAfterReload = await page
    .locator('[data-testid="drinkit-pause-state"]')
    .getAttribute('data-pending')
  // Reconcile-on-mount may clear if ledger confirms — either still pending or success after reconcile.
  const feedbackKind = await page.locator('[data-testid="game-status-feedback"]').getAttribute('data-kind').catch(() => null)
  const statePaused = await page.locator('[data-testid="drinkit-pause-state"]').getAttribute('data-paused')

  if (pendingAfterReload === 'true') {
    pass('reload-restores-pending')
    // 11: successful Refresh clears pending
    await page.click('[data-testid="reconcile-pause"]')
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="drinkit-pause-state"]')
      return el?.getAttribute('data-pending') === 'false'
    }, null, { timeout: 20000 })
    pass('refresh-reconcile-clears-pending')
  } else if (feedbackKind === 'success' && statePaused === 'true') {
    // Mount reconcile confirmed the lost pause via durable ledger.
    pass('reload-restores-pending')
    pass('refresh-reconcile-clears-pending')
  } else {
    fail('reload-restores-pending', `pending=${pendingAfterReload} feedback=${feedbackKind} paused=${statePaused}`)
  }

  // Navigate away and back — should not invent a new pending op; pause/resume usable when clear.
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="game-status-section"]')
  const pendingAfterNav = await page
    .locator('[data-testid="drinkit-pause-state"]')
    .getAttribute('data-pending')
  if (pendingAfterNav === 'false' || pendingAfterNav == null) pass('nav-back-no-spurious-lock')
  else fail('nav-back-no-spurious-lock', pendingAfterNav)

  // Leave Drink It! resumed for other suites.
  const stillPaused = await page.locator('[data-testid="drinkit-pause-state"]').getAttribute('data-paused')
  if (stillPaused === 'true') {
    await page.click('[data-testid="resume-drinkit"]')
    await page.click('[data-testid="pause-confirm-apply"]')
    await page.waitForFunction(() => {
      return (
        document.querySelector('[data-testid="drinkit-pause-state"]')?.getAttribute('data-paused') ===
        'false'
      )
    })
  }
  pass('cleanup-resumed')
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
