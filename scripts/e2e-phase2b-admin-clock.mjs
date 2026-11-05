/**
 * Browser journey: admin Ship Clock overview + non-admin blocked from /admin.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/e2e-phase2b-admin-clock.mjs [baseUrl]
 */
import { execSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const admin = summary.identities.find((i) => i.key === 'admin')
const both = summary.identities.find((i) => i.key === 'both')
if (!admin || !both) {
  console.error('Missing provisioned identities')
  process.exit(1)
}

function readServiceRole() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const raw = execSync('npx supabase status -o env', { encoding: 'utf8' })
  for (const line of raw.split('\n')) {
    const match = line.match(/^(?:SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY)=(.*)$/)
    if (match) return match[1].replace(/^"|"$/g, '')
  }
  return ''
}

const serviceKey = readServiceRole()
if (serviceKey) {
  const sb = createClient(summary.supabase_url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await sb.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: -240,
    p_label: 'development-only',
  })
  if (error) {
    console.error('dev_seed_cruise_clock failed', error.message)
    process.exit(1)
  }
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
  await page.selectOption('#login-name', { label: both.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.endsWith('/login'))
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
  if (!page.url().includes('/admin')) pass('non-admin-blocked-from-admin')
  else fail('non-admin-blocked-from-admin', page.url())

  await context.clearCookies()
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.selectOption('#login-name', { label: admin.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.endsWith('/login'))
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="ship-clock-section"]')
  const overview = await page.locator('[data-testid="clock-overview"]').textContent()
  if (overview?.includes('Current Ship Time')) pass('admin-clock-overview')
  else fail('admin-clock-overview', overview ?? 'missing')

  if (await page.locator('[data-testid="plan-schedule"]').count()) pass('admin-plan-schedule')
  else fail('admin-plan-schedule', 'missing')

  await page.click('[data-testid="plus-1h"]')
  await page.waitForSelector('[data-testid="confirm-dialog"]')
  const dialog = await page.locator('[data-testid="confirm-dialog"]').textContent()
  if (dialog?.includes('Apply Ship Time Change?')) pass('admin-manual-preview')
  else fail('admin-manual-preview', dialog ?? 'missing')
  await page.getByRole('button', { name: 'Cancel' }).click()
} catch (err) {
  fail('phase2b-e2e', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
if (failed.length) {
  console.error(JSON.stringify(failed, null, 2))
  process.exit(1)
}
console.log(`phase2b e2e ok (${results.length} checks)`)
