/**
 * Probe: post-success remint race (resetAll clears key before nav completes).
 */
import { chromium } from 'playwright'
import { loadQa2aEnv, identity } from '../qa2a/lib/env.mjs'
import { loginAs, mobileContextOptions } from './lib/diag.mjs'

const env = await loadQa2aEnv()
const drinkOnly = identity(env.summary, 'drink_only')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext(mobileContextOptions())
const page = await context.newPage()
const rpcKeys = []
page.on('request', (req) => {
  if (!req.url().includes('/rpc/submit_drink')) return
  try {
    rpcKeys.push(req.postDataJSON()?.p_payload?.idempotency_key ?? null)
  } catch {
    rpcKeys.push('err')
  }
})

await loginAs(page, {
  baseUrl: env.baseUrl,
  password: env.password,
  displayName: drinkOnly.display_name,
})

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
await page.fill('[data-testid="caption-input"]', 'R1 double-success race')
await page.locator('[data-testid="photo-continue"]').click({ force: true })
await page.waitForSelector('[data-testid="submit-drink"]:not([disabled])')

const before = await env.service
  .from('submissions')
  .select('id')
  .eq('author_player_id', drinkOnly.player_id)
  .eq('game', 'drinkit')
  .order('created_at', { ascending: false })
  .limit(10)
const beforeIds = new Set((before.data || []).map((s) => s.id))

const btn = page.locator('[data-testid="submit-drink"]')
// Fire many clicks around the success/resetAll window, then nav away like S07.
await btn.click({ force: true })
for (let i = 0; i < 8; i++) {
  await btn.click({ force: true }).catch(() => {})
  await page.waitForTimeout(15)
}
await page.goto(`${env.baseUrl}/drinkit`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)

const after = await env.service
  .from('submissions')
  .select('id, status, idempotency_key, caption')
  .eq('author_player_id', drinkOnly.player_id)
  .eq('game', 'drinkit')
  .order('created_at', { ascending: false })
  .limit(10)
const newOnes = (after.data || []).filter((s) => !beforeIds.has(s.id))
console.log(
  JSON.stringify(
    {
      rpcKeys,
      uniqueRpcKeys: [...new Set(rpcKeys)],
      newSubs: newOnes.length,
      rows: newOnes,
    },
    null,
    2,
  ),
)
await browser.close()
process.exit(newOnes.length <= 1 ? 0 : 2)
