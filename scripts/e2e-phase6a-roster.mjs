/**
 * Phase 6A Playwright: Admin roster create / membership / password reset.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase6a
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
const shotDir = join(__dir, '../docs/phase6a-screenshots')
await mkdir(shotDir, { recursive: true })

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

const displayName = `E2E Roster ${randomUUID().slice(0, 6)}`
const playerPassword = `E2E-Roster-${randomUUID().slice(0, 8)}!x1`
const resetPassword = `E2E-Reset-${randomUUID().slice(0, 8)}!y2`
const loginAlias = `${displayName
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '.')
  .replace(/^\.+|\.+$/g, '')}@star-princess.local`

try {
  // Non-admin cannot open roster actions
  await loginAs(drinkOnly.display_name)
  await page.goto(`${baseUrl}/admin`)
  await page.waitForTimeout(800)
  const bounced = !page.url().includes('/admin')
  if (bounced) pass('non-admin redirected from /admin')
  else fail('non-admin redirected from /admin', page.url())

  await loginAs(adminId.display_name)
  await page.goto(`${baseUrl}/admin`)
  await page.waitForSelector('[data-testid="roster-section"]', { timeout: 15000 })
  await page.screenshot({ path: join(shotDir, '01-roster-list.png'), fullPage: true })
  pass('admin sees Players & Teams')

  await page.getByTestId('roster-add-player').click()
  await page.getByTestId('roster-add-name').fill(displayName)
  await page.getByTestId('roster-add-password').fill(playerPassword)
  const drinkToggle = page.getByTestId('roster-add-drinkit')
  const shipToggle = page.getByTestId('roster-add-shipit')
  if (!(await drinkToggle.isChecked())) await drinkToggle.check()
  if (!(await shipToggle.isChecked())) await shipToggle.check()
  const teamSelect = page.getByTestId('roster-add-team')
  const optionValues = await teamSelect.locator('option').evaluateAll((opts) =>
    opts.map((o) => ({ value: o.value, label: o.textContent?.trim() ?? '' })),
  )
  const pick = optionValues.find((o) => o.value)
  if (pick) await teamSelect.selectOption(pick.value)
  await page.screenshot({ path: join(shotDir, '02-add-player-form.png'), fullPage: true })
  await page.getByTestId('roster-add-submit').click()
  await page.waitForTimeout(3000)
  const createdVisible = await page.getByText(displayName).count()
  if (createdVisible > 0) pass('create player appears in roster')
  else fail('create player appears in roster', 'name not listed')

  const service = createClient(envUrl, serviceKey, { auth: { persistSession: false } })
  const adminClient = createClient(envUrl, anonKey, { auth: { persistSession: false } })
  await adminClient.auth.signInWithPassword({
    email: adminId.login_alias,
    password,
  })
  const { data: roster } = await adminClient.rpc('admin_list_roster')
  const row = roster.find((p) => p.display_name === displayName)
  if (!row) throw new Error('created player missing from roster RPC')
  const teamId = row.team?.team_id ?? null

  try {
    await loginWith(displayName, playerPassword)
    pass('new player can log in')
  } catch (err) {
    fail('new player can log in', err instanceof Error ? err.message : String(err))
  }

  await page.goto(`${baseUrl}/`)
  await page.waitForTimeout(800)
  if (page.url().includes('/drinkit') || page.url().includes('/shipit') || page.url().endsWith('/')) {
    if (page.url().endsWith('/') || page.url().match(/5173\/?$/)) {
      const drinkLink = page.getByRole('link', { name: /drink it/i })
      if (await drinkLink.count()) await drinkLink.first().click()
      else await page.goto(`${baseUrl}/drinkit`)
    } else if (!page.url().includes('/drinkit')) {
      await page.goto(`${baseUrl}/drinkit`)
    }
    await page.waitForURL(/drinkit/, { timeout: 10000 }).catch(() => {})
    if (page.url().includes('/drinkit')) pass('dual-game player can open Drink It!')
    else fail('dual-game player can open Drink It!', page.url())

    await page.goto(`${baseUrl}/shipit`)
    await page.waitForTimeout(800)
    if (page.url().includes('/shipit')) pass('dual-game switch to Ship It!')
    else fail('dual-game switch to Ship It!', page.url())
  } else {
    fail('dual-game player can open Drink It!', page.url())
    fail('dual-game switch to Ship It!', page.url())
  }

  // Admin removes Drink It! for the new player via RPC, then verify routing as that player
  const { data: rosterFresh } = await adminClient.rpc('admin_list_roster')
  const rowFresh = rosterFresh.find((p) => p.player_id === row.player_id)
  const access = await adminClient.rpc('admin_set_player_access', {
    p_client_request_id: randomUUID(),
    p_player_id: row.player_id,
    p_active: true,
    p_drinkit_enabled: false,
    p_shipit_enabled: true,
    p_team_id: teamId,
    p_expected_fingerprint: rowFresh.state_fingerprint,
  })
  if (!access.data?.ok) throw new Error(`access update failed: ${JSON.stringify(access.data)}`)

  await page.goto(`${baseUrl}/drinkit`)
  await page.waitForTimeout(1500)
  if (
    page.url().includes('access-denied') ||
    page.url().includes('shipit') ||
    page.url().includes('unavailable')
  ) {
    pass('removing Drink It! blocks Drink It! route')
  } else {
    fail('removing Drink It! blocks Drink It! route', page.url())
  }

  await page.goto(`${baseUrl}/shipit`)
  await page.waitForTimeout(1000)
  if (page.url().includes('/shipit')) pass('Ship It! still available after Drink It! removed')
  else fail('Ship It! still available after Drink It! removed', page.url())

  // Password reset via Edge Function then login
  const reset = await fetch(`${envUrl}/functions/v1/admin-roster`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${(await adminClient.auth.getSession()).data.session.access_token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'reset_password',
      client_request_id: randomUUID(),
      player_id: row.player_id,
      password: resetPassword,
    }),
  })
  const resetJson = await reset.json()
  if (resetJson.ok) pass('admin password reset succeeds')
  else fail('admin password reset succeeds', JSON.stringify(resetJson))

  await loginWith(displayName, resetPassword)
  pass('login works with reset password')

  await page.screenshot({ path: join(shotDir, '03-after-reset-login.png'), fullPage: true })

  // Cleanup: deactivate test player so login directory stays tidy
  const { data: roster2 } = await adminClient.rpc('admin_list_roster')
  const row2 = roster2.find((p) => p.player_id === row.player_id)
  await adminClient.rpc('admin_set_player_access', {
    p_client_request_id: randomUUID(),
    p_player_id: row.player_id,
    p_active: false,
    p_drinkit_enabled: false,
    p_shipit_enabled: false,
    p_team_id: teamId,
    p_expected_fingerprint: row2.state_fingerprint,
  })
  const authLookup = await service.rpc('admin_roster_get_player_auth', {
    p_player_id: row.player_id,
  })
  if (authLookup.data?.auth_user_id) {
    await service.auth.admin.deleteUser(authLookup.data.auth_user_id).catch(() => {})
  }
} catch (err) {
  fail('phase6a harness', err instanceof Error ? err.message : String(err))
  await page.screenshot({ path: join(shotDir, 'failure.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)
