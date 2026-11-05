/**
 * Phase 3B Playwright: real no-photo drink log through local Supabase.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
 *   LOCAL_TEST_PASSWORD='…' node scripts/e2e-phase3b-log-wizard.mjs [baseUrl]
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD')
  process.exit(1)
}

const envUrl = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!envUrl || !serviceKey) {
  console.error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for DB assert')
  process.exit(1)
}

const summary = JSON.parse(
  await readFile(join(dirname(fileURLToPath(import.meta.url)), '../.local/test-identities.json'), 'utf8'),
)
const drinkOnly = summary.identities.find((i) => i.key === 'drink_only')
const both = summary.identities.find((i) => i.key === 'both')
if (!drinkOnly || !both) {
  console.error('Missing identities')
  process.exit(1)
}

const service = createClient(envUrl, serviceKey, { auth: { persistSession: false } })

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
  await loginAs(drinkOnly.display_name)
  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="log-wizard"]')
  pass('wizard-opens')

  const shot = async (name) => {
    await page.screenshot({
      path: join(
        dirname(fileURLToPath(import.meta.url)),
        `../docs/phase3b-screenshots/phase3b-LIVE-${name}.png`,
      ),
      fullPage: true,
    })
  }

  // Prefer today's featured bar when available so Bar points can score.
  const { data: barBounty } = await service.rpc('get_my_current_bar_bounty')
  // service_role may not have player context — read via seeded assignment instead
  const { data: board } = await service.from('bar_bounties').select('bar_canonical_key').limit(1)
  void barBounty
  const featuredKey = board?.[0]?.bar_canonical_key

  await page.waitForSelector('[data-testid="bar-list"]')
  await page.click('[data-testid="bar-sort-deck"]')
  await shot('bar-deck-sort')
  await page.click('[data-testid="bar-sort-alpha"]')
  await shot('bar-step')
  const barSel = featuredKey
    ? page.locator(`[data-testid="bar-row-${featuredKey}"]`)
    : page.locator('[data-testid^="bar-row-"]').first()
  await barSel.first().click()
  pass('bar-selected')

  await page.waitForSelector('[data-testid="wizard-drink-step"]')
  await shot('drink-step')
  await page.click('[data-testid="drink-generic-beer"]')
  pass('drink-generic-beer')

  await page.waitForSelector('[data-testid="wizard-friends-step"]')
  if ((await page.locator('[data-testid="friends-list"]').count()) !== 1) {
    throw new Error('expected one friends list')
  }
  const friendBtn = page.locator(`[data-testid="friend-row-${both.player_id}"]`)
  if (!(await friendBtn.count())) throw new Error('companion both missing')
  await friendBtn.click()
  await shot('friends-step')
  const reminderVisible = await page.locator('[data-testid="bar-bounty-reminder"]').isVisible().catch(() => false)
  pass(reminderVisible ? 'friends-with-bar-reminder' : 'friends-single-selector')
  await page.click('[data-testid="friends-continue"]')

  await page.waitForSelector('[data-testid="photo-unavailable"]')
  await page.fill('[data-testid="caption-input"]', 'Phase 3B e2e caption')
  await shot('photo-step')
  await page.click('[data-testid="photo-continue"]')
  pass('photo-caption-no-upload')

  await page.waitForSelector('[data-testid="wizard-review-step"]')
  await page.waitForSelector('[data-testid="submit-drink"]:not([disabled])', { timeout: 20000 })
  await shot('review-step')
  // Ensure Bar row selected if eligible
  const barRow = page.locator('[data-testid="bounty-row-bar"]')
  if (await barRow.count()) {
    const state = await barRow.getAttribute('data-state')
    if (state === 'available') await barRow.click()
  }
  await page.click('[data-testid="submit-drink"]')

  const unclaimed = page.locator('[data-testid="modal-unclaimed"]')
  if (await unclaimed.isVisible().catch(() => false)) {
    await page.click('[data-testid="modal-primary"]')
  }

  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 30000 })
  await page.waitForSelector('[data-testid="gallery-submission-card"]')
  const submissionId = await page.getAttribute('[data-testid="gallery-submission-card"]', 'data-submission-id')
  if (!submissionId) throw new Error('missing submission id')
  pass('gallery-stub')

  const { data: sub, error } = await service
    .from('submissions')
    .select('id, result_json, author_player_id')
    .eq('id', submissionId)
    .single()
  if (error) throw error
  if (sub.author_player_id !== drinkOnly.player_id) throw new Error('author mismatch')
  const points = sub.result_json?.awarded_points
  if (typeof points !== 'number') throw new Error('missing awarded_points')
  const { count: claimCount } = await service
    .from('bounty_claims')
    .select('*', { count: 'exact', head: true })
    .eq('submission_id', submissionId)
  pass(`db-submission-points-${points}-claims-${claimCount ?? 0}`)

  await shot('gallery-stub')
  pass('screenshots')
} catch (err) {
  fail('suite-error', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
const total = results.length
console.log(`${passed}/${total} passed`)
process.exit(passed === total && total > 0 ? 0 : 1)
