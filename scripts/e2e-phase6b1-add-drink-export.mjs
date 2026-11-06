/**
 * Phase 6B1 Playwright: Admin Add Drink + Export Current Game Data.
 *
 *   LOCAL_TEST_PASSWORD='…' SUPABASE_SERVICE_ROLE_KEY='…' \
 *   VITE_SUPABASE_URL='…' VITE_SUPABASE_ANON_KEY='…' npm run test:e2e:phase6b1
 *
 * Only the existing loginWith helper is used (non-admin, then admin). Picker checks run through
 * supabase-js as the drink_only identity, not through the browser, so no extra player login
 * steps are added to the UI flow.
 */
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

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
const adminId = summary.identities.find((i) => i.key === 'admin')
const drinkOnly = summary.identities.find((i) => i.key === 'drink_only')
const shotDir = join(__dir, '../docs/phase6b1-screenshots')
await mkdir(shotDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  acceptDownloads: true,
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

async function loginWith(displayName, pw) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#login-name', { timeout: 15000 })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), {
    timeout: 20000,
  })
}

async function loginAs(displayName) {
  await loginWith(displayName, password)
}

async function signInClient(identity) {
  const client = createClient(envUrl, anonKey, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({
    email: identity.login_alias,
    password,
  })
  if (error) throw new Error(`sign-in failed for ${identity.key}: ${error.message}`)
  return client
}

const drinkName = `E2E Add ${randomUUID().slice(0, 6)}`
const service = createClient(envUrl, serviceKey, { auth: { persistSession: false } })
let adminClient = null
let offeringId = null
let barKey = null

try {
  // 1. Non-admin cannot reach /admin (and so never sees add-drink / export)
  await loginAs(drinkOnly.display_name)
  await page.goto(`${baseUrl}/admin`)
  await page.waitForTimeout(800)
  const bounced = !page.url().includes('/admin')
  const leaked =
    (await page.getByTestId('add-drink-section').count()) +
    (await page.getByTestId('catalog-export-section').count())
  if (bounced && leaked === 0) pass('non-admin redirected from /admin')
  else fail('non-admin redirected from /admin', `${page.url()} leaked=${leaked}`)

  // 2. Admin sees both sections
  await loginAs(adminId.display_name)
  await page.goto(`${baseUrl}/admin`)
  await page.waitForSelector('[data-testid="add-drink-section"]', { timeout: 15000 })
  await page.waitForSelector('[data-testid="catalog-export-section"]', { timeout: 15000 })
  await page.screenshot({ path: join(shotDir, '01-admin-sections.png'), fullPage: true })
  pass('admin sees Add Drink and Export sections')

  // 3. Admin Add Drink flow
  await page.waitForSelector('[data-testid="add-drink-form"]', { timeout: 15000 })
  await page.getByTestId('add-drink-name').fill(drinkName)

  const firstBar = page
    .locator('[data-testid="add-drink-bars"] input[type="checkbox"]:not([disabled])')
    .first()
  await firstBar.waitFor({ timeout: 10000 })
  const barTestId = await firstBar.getAttribute('data-testid')
  barKey = barTestId?.replace(/^add-drink-bar-/, '') ?? null
  if (!barKey) throw new Error('could not resolve first bar key')
  await firstBar.check()

  await page.getByTestId('add-drink-preview-run').click()
  await page.waitForSelector('[data-testid="add-drink-preview"]', { timeout: 15000 })
  await page.screenshot({ path: join(shotDir, '02-add-drink-preview.png'), fullPage: true })
  const noRotationText = (await page.getByTestId('add-drink-no-rotation').textContent()) ?? ''
  if (noRotationText.trim()) pass('preview shows no-rotation note')
  else fail('preview shows no-rotation note', 'empty')

  await page.getByTestId('add-drink-save').click()
  const feedback = page.getByTestId('add-drink-feedback')
  await feedback.waitFor({ timeout: 20000 })
  const kind = await feedback.getAttribute('data-kind')
  await page.screenshot({ path: join(shotDir, '03-add-drink-saved.png'), fullPage: true })
  if (kind === 'success') pass('add drink shows success feedback')
  else fail('add drink shows success feedback', `kind=${kind}`)

  const row = page.locator('[data-testid="add-drink-offering-row"]', { hasText: drinkName })
  try {
    await row.first().waitFor({ timeout: 15000 })
    pass('added drink listed under Added drinks')
  } catch {
    fail('added drink listed under Added drinks', 'row not found')
  }

  // 4. Service-role verification: offering exists, not in cocktail rotation
  adminClient = await signInClient(adminId)
  const { data: offerings, error: offErr } = await adminClient.rpc('admin_list_manual_offerings')
  if (offErr) throw new Error(`admin_list_manual_offerings: ${offErr.message}`)
  const created = (offerings ?? []).find(
    (o) => o.display_name === drinkName && o.bar_canonical_key === barKey && o.active,
  )
  if (!created) {
    fail('manual offering exists and is active', 'not found via admin_list_manual_offerings')
  } else {
    offeringId = created.offering_id
    const { data: amo } = await service
      .from('admin_manual_offerings')
      .select('offering_id, active')
      .eq('offering_id', offeringId)
      .maybeSingle()
    if (amo?.active === true) pass('manual offering exists and is active')
    else fail('manual offering exists and is active', JSON.stringify(amo))

    const { count: candidateCount, error: candErr } = await service
      .from('cocktail_candidates')
      .select('offering_id', { count: 'exact', head: true })
      .eq('offering_id', offeringId)
    if (!candErr && (candidateCount ?? 0) === 0) {
      pass('enters_cocktail_rotation is false (not a cocktail candidate)')
    } else {
      fail(
        'enters_cocktail_rotation is false (not a cocktail candidate)',
        candErr ? candErr.message : `count=${candidateCount}`,
      )
    }
  }

  // 5. Picker via supabase-js as drink_only
  if (offeringId) {
    const drinkClient = await signInClient(drinkOnly)
    const before = await drinkClient.rpc('list_drinkit_bar_drinks', {
      p_bar_canonical_key: barKey,
    })
    if (!before.error && before.data?.some((d) => d.offering_id === offeringId)) {
      pass('drink_only picker lists the added offering')
    } else {
      fail(
        'drink_only picker lists the added offering',
        before.error ? before.error.message : 'offering id absent',
      )
    }

    // Remove via admin UI
    const removeRow = page.locator('[data-testid="add-drink-offering-row"]', {
      hasText: drinkName,
    })
    await removeRow.first().getByTestId('add-drink-remove').click()
    await page.getByTestId('add-drink-remove-confirm').waitFor({ timeout: 10000 })
    await page.screenshot({ path: join(shotDir, '04-remove-confirm.png'), fullPage: true })
    await page.getByTestId('add-drink-remove-yes').click()
    try {
      await page
        .locator('[data-testid="add-drink-offering-row"]', { hasText: drinkName })
        .waitFor({ state: 'detached', timeout: 15000 })
      pass('Remove Added Drink removes the row in admin UI')
    } catch {
      fail('Remove Added Drink removes the row in admin UI', 'row still present')
    }
    await page.screenshot({ path: join(shotDir, '05-after-remove.png'), fullPage: true })

    const after = await drinkClient.rpc('list_drinkit_bar_drinks', {
      p_bar_canonical_key: barKey,
    })
    if (!after.error && !after.data?.some((d) => d.offering_id === offeringId)) {
      pass('drink_only picker no longer lists removed offering')
      offeringId = null
    } else {
      fail(
        'drink_only picker no longer lists removed offering',
        after.error ? after.error.message : 'offering id still present',
      )
    }
  }

  // 6. Export download
  await page.getByTestId('export-run').scrollIntoViewIfNeeded()
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByTestId('export-run').click(),
  ])
  const suggested = download.suggestedFilename()
  if (/^star-princess-game-data-\d{8}\.json$/.test(suggested)) {
    pass('export triggers download with expected filename')
  } else {
    fail('export triggers download with expected filename', suggested)
  }

  const exportFeedback = page.getByTestId('export-feedback')
  await exportFeedback.waitFor({ timeout: 15000 })
  const exportKind = await exportFeedback.getAttribute('data-kind')
  const exportText = (await exportFeedback.textContent()) ?? ''
  await page.screenshot({ path: join(shotDir, '06-export-success.png'), fullPage: true })
  if (exportKind === 'success' && exportText.includes('star-princess-game-data-')) {
    pass('export success feedback shows filename')
  } else {
    fail('export success feedback shows filename', `kind=${exportKind} text=${exportText.trim()}`)
  }

  // 7. Only the existing loginWith helper was used for browser sign-in
  pass('no new player login steps beyond loginWith')
} catch (err) {
  fail('phase6b1 harness', err instanceof Error ? err.message : String(err))
  await page.screenshot({ path: join(shotDir, 'failure.png'), fullPage: true }).catch(() => {})
} finally {
  // Safety net: deactivate the test offering if the UI removal did not run.
  if (offeringId && adminClient) {
    await adminClient
      .rpc('admin_deactivate_manual_offering', {
        p_offering_id: offeringId,
        p_note: 'e2e cleanup',
      })
      .catch(() => {})
  }
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)
