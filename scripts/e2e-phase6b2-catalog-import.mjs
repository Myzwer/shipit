/**
 * Phase 6B2 Playwright: Catalog Import stage/preview/publish (dev fixtures only).
 *
 *   LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase6b2
 */
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
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
const shotDir = join(__dir, '../docs/phase6b2-screenshots')
await mkdir(shotDir, { recursive: true })

execSync('npx vite-node scripts/write-e2e-6b2-catalogs.ts', {
  cwd: join(__dir, '..'),
  stdio: 'inherit',
  env: process.env,
})
const seedCatalog = JSON.parse(
  await readFile(join(__dir, '../.local/e2e-6b2-base-catalog.json'), 'utf8'),
)
const nextCatalog = JSON.parse(
  await readFile(join(__dir, '../.local/e2e-6b2-publish-catalog.json'), 'utf8'),
)

const service = createClient(envUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

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

try {
  const { error: actErr } = await service.rpc('dev_activate_catalog_fixture', {
    p_payload: seedCatalog,
  })
  if (actErr) throw actErr
  await service.rpc('dev_generate_bounty_schedule', {
    p_seed: `e2e-6b2-${randomUUID().slice(0, 6)}`,
  })
  await service.rpc('dev_seed_daily_assignments')

  await loginWith(drinkOnly.display_name, password)
  await page.goto(`${baseUrl}/admin`)
  await page.waitForTimeout(800)
  if (!page.url().includes('/admin')) pass('non-admin redirected from /admin')
  else fail('non-admin redirected from /admin', page.url())

  await loginWith(adminId.display_name, password)
  await page.goto(`${baseUrl}/admin`)
  await page.waitForSelector('[data-testid="catalog-import-section"]', { timeout: 15000 })
  await page.screenshot({ path: join(shotDir, '01-import-section.png'), fullPage: true })
  pass('admin sees Catalog Import')

  const distinction = page.getByTestId('catalog-import-export-distinction')
  if ((await distinction.textContent())?.includes('not a directly importable')) {
    pass('export vs import distinction shown')
  } else fail('export vs import distinction shown', 'missing copy')

  await page.getByTestId('catalog-import-paste').fill('{ "not": "a catalog" }')
  await page.waitForTimeout(300)
  const readiness = await page.getByTestId('catalog-local-preview').textContent()
  if (readiness?.includes('invalid') || (await page.getByTestId('catalog-local-errors').count()) > 0) {
    pass('invalid JSON shows local validation errors')
  } else fail('invalid JSON shows local validation errors', readiness ?? '')

  await page.getByTestId('catalog-import-paste').fill(JSON.stringify(nextCatalog))
  await page.waitForSelector('[data-testid="catalog-local-preview"]', { timeout: 5000 })
  await page.getByTestId('catalog-stage-preview').click()
  await page.waitForSelector('[data-testid="catalog-server-preview"]', { timeout: 45000 })
  await page.screenshot({ path: join(shotDir, '02-server-preview.png'), fullPage: true })
  pass('stage & preview publish succeeded')

  const safe = await page.getByTestId('catalog-safe-to-publish').textContent()
  if (safe?.toLowerCase().includes('yes')) pass('preview reports safe to publish')
  else fail('preview reports safe to publish', safe ?? '')

  await page.getByTestId('catalog-publish-prepare').click()
  await page.getByTestId('catalog-publish-confirm-yes').click()
  await page.waitForSelector('[data-testid="catalog-import-feedback"][data-kind="success"]', {
    timeout: 45000,
  })
  await page.screenshot({ path: join(shotDir, '03-published.png'), fullPage: true })
  pass('publish confirmed')

  // Refresh versions display after publish
  await page.waitForTimeout(500)
  const active = await page.getByTestId('catalog-active-version').textContent()
  if (active?.includes(nextCatalog.catalog_id)) pass('active version shows published catalog_id')
  else fail('active version shows published catalog_id', active ?? '')
} catch (err) {
  await page.screenshot({ path: join(shotDir, '99-failure.png'), fullPage: true }).catch(() => {})
  fail('uncaught', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
