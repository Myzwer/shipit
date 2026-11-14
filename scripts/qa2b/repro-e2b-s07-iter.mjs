/**
 * Multi-iter E2B-S07 variants for R1 root-cause isolation.
 */
import { chromium } from 'playwright'
import { loadQa2aEnv, identity } from '../qa2a/lib/env.mjs'
import { loginAs, mobileContextOptions } from './lib/diag.mjs'

const env = await loadQa2aEnv()
const drinkOnly = identity(env.summary, 'drink_only')
const browser = await chromium.launch({ headless: true })
const results = []

async function recent(limit = 8) {
  return env.service
    .from('submissions')
    .select('id, created_at, kind, status, idempotency_key')
    .eq('author_player_id', drinkOnly.player_id)
    .eq('game', 'drinkit')
    .order('created_at', { ascending: false })
    .limit(limit)
}

async function fillToSubmit(page, { delayRpcMs = 0 } = {}) {
  if (delayRpcMs > 0) {
    await page.route('**/rest/v1/rpc/submit_drink', async (route) => {
      await new Promise((r) => setTimeout(r, delayRpcMs))
      await route.continue()
    })
  }
  await page.goto(`${env.baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bar-list"]')
  await page.locator('[data-testid^="bar-row-"]').first().click()
  await page.waitForSelector('[data-testid="wizard-drink-step"]')
  const listed = page.locator('[data-testid^="drink-row-"]').first()
  if (await listed.count()) await listed.click()
  else await page.click('[data-testid="drink-generic-beer"]')
  await page.waitForSelector('[data-testid="wizard-friends-step"]')
  await page.evaluate(() => {
    const nav = document.querySelector('.floating-bottom-nav')
    if (nav) nav.style.pointerEvents = 'none'
  })
  await page.locator('[data-testid="friends-continue"]').click({ force: true })
  await page.waitForSelector('[data-testid="wizard-photo-step"]')
  await page.fill(
    '[data-testid="caption-input"]',
    `R1 S07 ${Date.now()} ${Math.random().toString(16).slice(2, 8)}`,
  )
  await page.locator('[data-testid="photo-continue"]').click({ force: true })
  await page.waitForSelector('[data-testid="submit-drink"]:not([disabled])')
}

async function runCase(name, fn) {
  const context = await browser.newContext(mobileContextOptions())
  const page = await context.newPage()
  const rpcKeys = []
  page.on('request', (req) => {
    if (!req.url().includes('/rpc/submit_drink')) return
    try {
      const body = req.postDataJSON()
      rpcKeys.push(body?.p_payload?.idempotency_key ?? null)
    } catch {
      rpcKeys.push('parse_error')
    }
  })
  try {
    await loginAs(page, {
      baseUrl: env.baseUrl,
      password: env.password,
      displayName: drinkOnly.display_name,
    })
    const before = await recent()
    const beforeIds = new Set((before.data || []).map((s) => s.id))
    await fn(page)
    await page.waitForTimeout(2200)
    const after = await recent()
    const newOnes = (after.data || []).filter((s) => !beforeIds.has(s.id))
    const row = {
      name,
      rpcCount: rpcKeys.length,
      rpcKeys,
      newSubs: newOnes.length,
      statuses: newOnes.map((s) => s.status),
      keys: newOnes.map((s) => s.idempotency_key),
      url: page.url(),
    }
    results.push(row)
    console.log(JSON.stringify(row))
  } catch (e) {
    results.push({ name, error: String(e) })
    console.log(JSON.stringify({ name, error: String(e) }))
  } finally {
    await context.close()
  }
}

// A: original hard goto
await runCase('A_hard_goto', async (page) => {
  await fillToSubmit(page)
  await page.locator('[data-testid="submit-drink"]').click({ force: true })
  await page.goto(`${env.baseUrl}/drinkit`, { waitUntil: 'domcontentloaded' })
})

// B: delayed RPC + hard goto
await runCase('B_delay_hard_goto', async (page) => {
  await fillToSubmit(page, { delayRpcMs: 2500 })
  await page.locator('[data-testid="submit-drink"]').click({ force: true })
  await page.waitForTimeout(50)
  await page.goto(`${env.baseUrl}/drinkit`, { waitUntil: 'domcontentloaded' })
})

// C: soft SPA home via router during delayed submit (nav re-enabled)
await runCase('C_soft_home_delayed', async (page) => {
  await fillToSubmit(page, { delayRpcMs: 2500 })
  await page.evaluate(() => {
    const nav = document.querySelector('.floating-bottom-nav')
    if (nav) nav.style.pointerEvents = ''
  })
  await page.locator('[data-testid="submit-drink"]').click({ force: true })
  await page.waitForTimeout(50)
  // Prefer Drink It home control if present; else router push
  const home = page.locator('a[href="/drinkit"], [data-testid="nav-drinkit"], [data-testid="home-link"]')
  if (await home.count()) {
    await home.first().click({ force: true }).catch(() => {})
  }
  await page.evaluate(() => {
    // force SPA navigation attempt
    window.history.pushState({}, '', '/drinkit')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.waitForTimeout(3000)
})

// D: submit then confirm exit discard while delayed
await runCase('D_exit_discard_delayed', async (page) => {
  await fillToSubmit(page, { delayRpcMs: 2500 })
  await page.locator('[data-testid="submit-drink"]').click({ force: true })
  await page.waitForTimeout(80)
  // Header exit if available
  const exit = page.locator('[data-testid="wizard-exit"], [data-testid="exit-wizard"]')
  if (await exit.count()) {
    await exit.first().click({ force: true })
    const confirm = page.locator('[data-testid="exit-confirm"], button:has-text("Exit")')
    if (await confirm.count()) await confirm.first().click({ force: true })
  } else {
    await page.goto(`${env.baseUrl}/drinkit`, { waitUntil: 'domcontentloaded' })
  }
  await page.waitForTimeout(3000)
})

// E: hard goto then immediately reopen log (pending recovery / possible second intent)
await runCase('E_nav_then_reopen_log', async (page) => {
  await fillToSubmit(page, { delayRpcMs: 800 })
  await page.locator('[data-testid="submit-drink"]').click({ force: true })
  await page.goto(`${env.baseUrl}/drinkit`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await page.goto(`${env.baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  // If recovery UI offers retry, click it
  const retry = page.locator(
    '[data-testid="submit-drink"]:not([disabled]), [data-testid="retry-submit"], button:has-text("Retry")',
  )
  if (await retry.count()) {
    await retry.first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(1500)
  }
})

// F: triple click with no delay (S03 adjacency)
await runCase('F_triple_click', async (page) => {
  await fillToSubmit(page)
  const btn = page.locator('[data-testid="submit-drink"]')
  await Promise.all([
    btn.click({ force: true }),
    btn.click({ force: true }),
    btn.click({ force: true }),
  ])
  await page.waitForTimeout(2000)
})

console.log('\nSUMMARY')
console.log(JSON.stringify(results, null, 2))
await browser.close()
const bad = results.filter((r) => (r.newSubs ?? 0) > 1 || (r.rpcCount ?? 0) > 1)
process.exit(bad.length ? 2 : 0)
