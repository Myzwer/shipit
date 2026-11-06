/**
 * Phase 4B3 Gate A: lost submit_scavenger response → reload → Retry → original gallery.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase4b3:recovery
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const __dir = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
const envUrl = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!password || !envUrl || !serviceKey || !anonKey) {
  console.error('Need LOCAL_TEST_PASSWORD + Supabase env')
  process.exit(1)
}

const summary = JSON.parse(
  await readFile(join(__dir, '../.local/test-identities.json'), 'utf8'),
)
const both = summary.identities.find((i) => i.key === 'both')
const service = createClient(envUrl, serviceKey, { auth: { persistSession: false } })
await service.rpc('dev_reset_scavenger_test_data')

const fixtureJpg = join(__dir, '../tests/fixtures/tiny.jpg')
const shotDir = join(__dir, '../docs/phase4b3-screenshots')
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
  await page.selectOption('#login-name', { label: both.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 20000 })

  await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
  const openCard = page.locator('[data-testid^="shipit-challenge-"][data-completed="false"]').first()
  const challengeHref = await openCard.getAttribute('data-testid')
  await openCard.click()
  await page.waitForSelector('[data-testid="scavenger-submit-page"]')

  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  await page.locator('[data-testid="scavenger-continue-review"]').click()
  await page.waitForSelector('[data-testid="scavenger-review-step"]')

  // Allow server commit but drop the HTTP response body so the client treats it as unknown.
  let acceptedSubmissionId = null
  await page.route('**/rest/v1/rpc/submit_scavenger**', async (route) => {
    const response = await route.fetch()
    const json = await response.json()
    if (json?.ok && json?.submission_id) acceptedSubmissionId = json.submission_id
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'simulated lost response' }),
    })
  })

  await page.click('[data-testid="scavenger-submit"]')
  await page.waitForSelector('[data-testid="scavenger-unknown"]', { timeout: 30000 })
  pass('lost-response-unknown-ui')
  await page.unroute('**/rest/v1/rpc/submit_scavenger**')

  const pending = await page.evaluate(() =>
    localStorage.getItem('star-princess.shipit.pendingScavengerSubmit.v1'),
  )
  if (!pending) throw new Error('pending submit missing from localStorage')
  pass('pending-persisted')

  // Reload challenge URL — must show Retry, not Already Completed.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="scavenger-unknown"]', { timeout: 20000 })
  const already = await page.locator('[data-testid="scavenger-already-done"]').count()
  if (already > 0) throw new Error('showed already-completed instead of pending recovery')
  pass('reload-shows-pending')
  await page.screenshot({ path: join(shotDir, 'phase4b3-LIVE-scavenger-recovery.png'), fullPage: true })

  await page.click('[data-testid="scavenger-submit"]')
  await page.waitForURL(/\/shipit\/gallery/, { timeout: 30000 })
  await page.waitForSelector('[data-testid="shipit-gallery-card"]')
  pass('retry-gallery')

  const { count: completions } = await service
    .from('scavenger_completions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  if (completions !== 1) throw new Error(`expected 1 completion, got ${completions}`)
  pass('exactly-one-completion')

  if (!acceptedSubmissionId) {
    // Recover from gallery query
    acceptedSubmissionId = new URL(page.url()).searchParams.get('submission')
  }
  const { count: photos } = await service
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('bound_submission_id', acceptedSubmissionId)
    .eq('status', 'bound')
  if (photos !== 1) throw new Error(`expected 1 bound photo, got ${photos}`)
  pass('exactly-one-bound-photo')
  void challengeHref
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
  await page.screenshot({ path: join(shotDir, 'phase4b3-LIVE-recovery-failure.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length && results.length > 0 ? 0 : 1)
