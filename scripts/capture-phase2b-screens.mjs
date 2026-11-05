/**
 * Capture Phase 2B Admin Ship Clock screenshots at 390×844 (DPR 2).
 *
 * Requires Vite + local Supabase + provision + LOCAL_TEST_PASSWORD.
 * Prefer SUPABASE_SERVICE_ROLE_KEY so development-only clock data is seeded.
 *
 * Usage: LOCAL_TEST_PASSWORD='…' node scripts/capture-phase2b-screens.mjs [baseUrl]
 */
import { execSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD before capturing Phase 2B screenshots.')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const admin = summary.identities.find((i) => i.key === 'admin')
if (!admin) {
  console.error('Missing admin identity — run npm run db:provision')
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
  if (error) throw error
  await sb.rpc('admin_upsert_ship_clock_plan_day', {
    p_day_number: 2,
    p_delta_minutes: 60,
    p_enabled: true,
    p_at_utc: '2099-01-03T14:00:00Z',
  })
  await sb.rpc('admin_upsert_ship_clock_plan_day', {
    p_day_number: 5,
    p_delta_minutes: -60,
    p_enabled: true,
    p_at_utc: '2099-01-03T14:00:00Z',
  })
  console.log('Seeded development-only Ship Clock for screenshots')
} else {
  console.warn('No service role key — screenshots may show unconfigured clock')
}

const outDir = join(root, 'docs/phase2b-screenshots')
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

await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
await page.selectOption('#login-name', { label: admin.display_name })
await page.fill('#login-password', password)
await page.click('button[type="submit"]')
await page.waitForURL((url) => !url.pathname.endsWith('/login'))
await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="ship-clock-section"]')
await page.waitForTimeout(500)
await shot('phase2b-admin-clock-overview.png')

await page.click('[data-testid="plus-1h"]')
await page.waitForSelector('[data-testid="confirm-dialog"]')
await page.waitForTimeout(300)
await shot('phase2b-admin-manual-preview.png')
await page.getByRole('button', { name: 'Cancel' }).click()

await page.locator('[data-testid="plan-schedule"]').scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
await shot('phase2b-admin-schedule.png')

await browser.close()
console.log(`Phase 2B screenshots written to ${outDir}`)
