/**
 * Focused E2B-S07 reproduction for R1 diagnosis.
 * Mutates disposable :55321 only. Never sets QA_ALLOW_ORGANIZER_MUTATION.
 */
import { chromium } from 'playwright'
import { loadQa2aEnv, identity } from '../qa2a/lib/env.mjs'
import { loginAs, mobileContextOptions } from './lib/diag.mjs'

const env = await loadQa2aEnv()
const drinkOnly = identity(env.summary, 'drink_only')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext(mobileContextOptions())
const page = await context.newPage()

const rpcCalls = []
page.on('request', (req) => {
  const url = req.url()
  if (!url.includes('/rpc/submit_drink')) return
  let body = null
  try {
    body = req.postDataJSON()
  } catch {
    body = req.postData()
  }
  const key =
    body?.p_payload?.idempotency_key ??
    (typeof body === 'object' ? body?.idempotency_key : null)
  rpcCalls.push({
    at: new Date().toISOString(),
    method: req.method(),
    key,
    payloadPreview: body?.p_payload
      ? {
          bar: body.p_payload.bar_canonical_key,
          drink: body.p_payload.drink,
          caption: body.p_payload.caption,
        }
      : null,
  })
  console.log('RPC submit_drink', rpcCalls.length, 'key=', key)
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
await page.fill('[data-testid="caption-input"]', 'R1 S07 repro')
await page.locator('[data-testid="photo-continue"]').click({ force: true })
await page.waitForSelector('[data-testid="submit-drink"]:not([disabled])')

const before = await env.service
  .from('submissions')
  .select('id, created_at, kind, status, idempotency_key, result_json')
  .eq('author_player_id', drinkOnly.player_id)
  .eq('game', 'drinkit')
  .order('created_at', { ascending: false })
  .limit(10)

console.log('before count', before.data?.length)

await page.locator('[data-testid="submit-drink"]').click({ force: true })
await page.goto(`${env.baseUrl}/drinkit`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

const after = await env.service
  .from('submissions')
  .select('id, created_at, kind, status, idempotency_key, result_json')
  .eq('author_player_id', drinkOnly.player_id)
  .eq('game', 'drinkit')
  .order('created_at', { ascending: false })
  .limit(10)

const beforeIds = new Set((before.data || []).map((s) => s.id))
const newOnes = (after.data || []).filter((s) => !beforeIds.has(s.id))

console.log(
  JSON.stringify(
    {
      rpcCalls,
      newSubs: newOnes.map((s) => ({
        id: s.id,
        status: s.status,
        kind: s.kind,
        idempotency_key: s.idempotency_key,
        created_at: s.created_at,
        points: s.result_json?.points_awarded ?? s.result_json?.total_points ?? null,
        caption: s.result_json?.caption ?? null,
      })),
      home: page.url(),
      pendingInStorage: await page.evaluate(() =>
        localStorage.getItem('star-princess.drinkit.pendingDrinkSubmit.v1'),
      ),
    },
    null,
    2,
  ),
)

await browser.close()
process.exit(newOnes.length <= 1 ? 0 : 2)
