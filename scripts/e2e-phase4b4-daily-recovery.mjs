/**
 * Phase 4B4 Gate: Daily pending recovery after day close / rollover / pause.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase4b4:daily-recovery
 */
import { mkdir, readFile } from 'node:fs/promises'
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

await mkdir(join(__dir, '../docs/phase4b4-screenshots'), { recursive: true })

const summary = JSON.parse(
  await readFile(join(__dir, '../.local/test-identities.json'), 'utf8'),
)
const drink = summary.identities.find((i) => i.key === 'drink_only')
const both = summary.identities.find((i) => i.key === 'both')
const service = createClient(envUrl, serviceKey, { auth: { persistSession: false } })

const fixtureJpg = join(__dir, '../tests/fixtures/tiny.jpg')
const shotDir = join(__dir, '../docs/phase4b4-screenshots')
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

async function openDailyClaim() {
  await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bounty-claim"]')
  await page.evaluate(() => {
    const track = document.querySelector('.bounty-track')
    if (track) track.scrollLeft = track.scrollWidth
  })
  await page.waitForTimeout(400)
  const dailyBtn = page
    .locator('.bounty-card')
    .filter({ hasText: 'Daily Challenge' })
    .locator('[data-testid="bounty-claim"]')
    .first()
  await dailyBtn.click()
  await page.waitForSelector('[data-testid="daily-claim-page"]', { timeout: 15000 })
}

try {
  await loginAs(drink.display_name)
  await openDailyClaim()
  await page.click('[data-testid="daily-confirm-yes"]')
  await page.waitForSelector('[data-testid="daily-capture-step"]')
  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  await page.click('[data-testid="daily-continue-review"]')
  await page.waitForSelector('[data-testid="daily-review-step"]')

  let acceptedSubmissionId = null
  let acceptedChallengeId = null
  await page.route('**/rest/v1/rpc/submit_daily**', async (route) => {
    const response = await route.fetch()
    const json = await response.json()
    if (json?.ok && json?.submission_id) {
      acceptedSubmissionId = json.submission_id
    }
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'simulated lost response' }),
    })
  })

  await page.click('[data-testid="daily-submit"]')
  await page.waitForSelector('[data-testid="daily-unknown"]', { timeout: 30000 })
  pass('1-lost-response-unknown')
  await page.unroute('**/rest/v1/rpc/submit_daily**')

  const pendingRaw = await page.evaluate(() =>
    localStorage.getItem('star-princess.drinkit.pendingDailySubmit.v1'),
  )
  if (!pendingRaw) throw new Error('pending daily missing')
  const pending = JSON.parse(pendingRaw)
  acceptedChallengeId = pending.payload.challenge_id
  const pendingUuid = pending.clientRequestId
  pass('1-pending-persisted')

  // Simulate day closed: pause + reload — recovery must still show.
  await service.rpc('dev_set_drinkit_paused', { p_paused: true })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="daily-recovery-banner"]', { timeout: 20000 })
  pass('3-recovery-during-pause')
  await page.screenshot({
    path: join(shotDir, 'phase4b4-LIVE-daily-recovery-pause.png'),
    fullPage: true,
  })

  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await page.click('[data-testid="daily-submit"]')
  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 30000 })
  await page.waitForSelector('[data-testid="gallery-submission-card"][data-kind="daily"]')
  const gallerySub = new URL(page.url()).searchParams.get('submission')
  if (acceptedSubmissionId && gallerySub !== acceptedSubmissionId) {
    throw new Error(`gallery submission ${gallerySub} != accepted ${acceptedSubmissionId}`)
  }
  pass('1-retry-original-gallery')

  const { count: claims } = await service
    .from('bounty_claims')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', drink.player_id)
    .eq('category', 'daily')
    .eq('status', 'active')
  if (claims !== 1) throw new Error(`expected 1 daily claim, got ${claims}`)
  pass('6-no-duplicate-claims')

  const { count: photos } = await service
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('bound_submission_id', gallerySub)
    .eq('status', 'bound')
  if (photos !== 1) throw new Error(`expected 1 bound photo, got ${photos}`)
  pass('6-no-duplicate-photos')

  // Peer cannot see pending: login as both with drink's pending still cleared (success cleared it).
  // Re-seed a foreign pending in both's storage and ensure drink_only scope clears it.
  await context.clearCookies()
  await page.evaluate(() => localStorage.clear())
  await loginAs(both.display_name)
  await page.evaluate(
    ({ pendingJson, playerId }) => {
      const parsed = JSON.parse(pendingJson)
      parsed.playerId = playerId
      localStorage.setItem('star-princess.drinkit.pendingDailySubmit.v1', JSON.stringify(parsed))
    },
    {
      pendingJson: JSON.stringify({
        version: 1,
        clientRequestId: pendingUuid,
        playerId: drink.player_id,
        cruiseConfigId: null,
        payload: {
          idempotency_key: pendingUuid,
          challenge_id: acceptedChallengeId,
          photo_id: '00000000-0000-4000-8000-000000000099',
          caption: null,
        },
        summary: { title: 'Foreign', points: 50 },
        createdAt: new Date().toISOString(),
      }),
      playerId: drink.player_id,
    },
  )
  await page.goto(`${baseUrl}/drinkit/daily`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const recoveryAsPeer = await page.locator('[data-testid="daily-recovery-banner"]').count()
  if (recoveryAsPeer > 0) throw new Error('peer saw foreign pending recovery')
  const cleared = await page.evaluate(() =>
    localStorage.getItem('star-princess.drinkit.pendingDailySubmit.v1'),
  )
  if (cleared) throw new Error('foreign pending was not cleared for other player')
  pass('5-peer-cannot-recover-foreign-pending')

  // Rejection after never-accepted + closed window: stage pending, pause, retry → definitive reject.
  await context.clearCookies()
  await page.evaluate(() => localStorage.clear())
  await loginAs(drink.display_name)
  // Use a fresh never-accepted UUID with a real staged photo still on drink account after reset needs new photo —
  // inject pending pointing at random photo; server rejects PHOTO_*; UI unlocks.
  const rejectKey = crypto.randomUUID()
  await page.evaluate(
    ({ key, challengeId, playerId }) => {
      localStorage.setItem(
        'star-princess.drinkit.pendingDailySubmit.v1',
        JSON.stringify({
          version: 1,
          clientRequestId: key,
          playerId,
          cruiseConfigId: null,
          payload: {
            idempotency_key: key,
            challenge_id: challengeId,
            photo_id: '11111111-1111-4111-8111-111111111111',
            caption: null,
          },
          summary: { title: 'Unaccepted', points: 50 },
          createdAt: new Date().toISOString(),
        }),
      )
    },
    { key: rejectKey, challengeId: acceptedChallengeId, playerId: drink.player_id },
  )
  await page.goto(`${baseUrl}/drinkit/daily`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="daily-recovery-banner"]', { timeout: 15000 })
  await page.click('[data-testid="daily-submit"]')
  await page.waitForSelector('[data-testid="daily-submit-error"], [data-testid="daily-error"], [data-testid="daily-already-claimed"]', {
    timeout: 30000,
  })
  const stillPending = await page.evaluate(() =>
    localStorage.getItem('star-princess.drinkit.pendingDailySubmit.v1'),
  )
  if (stillPending) throw new Error('definitive rejection should clear pending')
  pass('4-definitive-rejection-clears-pending')

  // Day-2 assignment must not silently replace Day-1 pending: inject pending then open daily with different challenge.
  // Already claimed today → recovery still preferred when pending exists for a different challenge.
  // Re-inject pending for original challenge while today is already claimed.
  await page.evaluate(
    ({ key, challengeId, playerId }) => {
      localStorage.setItem(
        'star-princess.drinkit.pendingDailySubmit.v1',
        JSON.stringify({
          version: 1,
          clientRequestId: key,
          playerId,
          cruiseConfigId: null,
          payload: {
            idempotency_key: key,
            challenge_id: challengeId,
            photo_id: '22222222-2222-4222-8222-222222222222',
            caption: null,
          },
          summary: { title: 'Prior day pending', points: 50 },
          createdAt: new Date().toISOString(),
        }),
      )
    },
    {
      key: crypto.randomUUID(),
      challengeId: '00000000-0000-4000-8000-000000000001',
      playerId: drink.player_id,
    },
  )
  await page.goto(`${baseUrl}/drinkit/daily`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="daily-recovery-banner"]', { timeout: 15000 })
  const title = await page.locator('[data-testid="daily-title"]').textContent()
  if (!title?.includes('Prior day pending') && !(await page.locator('[data-testid="daily-recovery-banner"]').count())) {
    throw new Error('expected recovery of prior pending over new day assignment')
  }
  pass('2-prior-pending-over-new-assignment')
  await page.screenshot({
    path: join(shotDir, 'phase4b4-LIVE-daily-recovery-rollover.png'),
    fullPage: true,
  })
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
  await page
    .screenshot({ path: join(shotDir, 'phase4b4-LIVE-daily-recovery-failure.png'), fullPage: true })
    .catch(() => {})
} finally {
  try {
    await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  } catch {
    /* ignore */
  }
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length && results.length > 0 ? 0 : 1)
