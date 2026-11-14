/**
 * Force the remint race: mid-flight resetAll + second performSubmit.
 * Variant A: pending LS cleared (discard bug / lost slot) → expect 2 keys without fix
 * Variant B: pending LS kept → second submit should reuse key if we fix performSubmit
 */
import { chromium } from 'playwright'
import { loadQa2aEnv, identity } from '../qa2a/lib/env.mjs'
import { loginAs, mobileContextOptions } from './lib/diag.mjs'

const env = await loadQa2aEnv()
const drinkOnly = identity(env.summary, 'drink_only')
const browser = await chromium.launch({ headless: true })

async function fillReview(page) {
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
    `R1 remint ${Date.now()} ${Math.random().toString(16).slice(2, 6)}`,
  )
  await page.locator('[data-testid="photo-continue"]').click({ force: true })
  await page.waitForSelector('[data-testid="submit-drink"]:not([disabled])')
}

async function runVariant(name, { clearPending }) {
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
  await page.evaluate(() => {
    localStorage.removeItem('star-princess.drinkit.pendingDrinkSubmit.v1')
  })
  await page.route('**/rest/v1/rpc/submit_drink', async (route) => {
    await new Promise((r) => setTimeout(r, 1000))
    await route.continue()
  })
  await fillReview(page)

  const before = await env.service
    .from('submissions')
    .select('id')
    .eq('author_player_id', drinkOnly.player_id)
    .eq('game', 'drinkit')
    .order('created_at', { ascending: false })
    .limit(10)
  const beforeIds = new Set((before.data || []).map((s) => s.id))

  const detail = await page.evaluate(async (clearPendingFlag) => {
    const wizard = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get(
      'drinkLogWizard',
    )
    const first = wizard.performSubmit()
    await new Promise((r) => setTimeout(r, 60))
    const keyAfterFirst = wizard.idempotencyKey
    const pendingRaw = localStorage.getItem('star-princess.drinkit.pendingDrinkSubmit.v1')
    const pending = pendingRaw ? JSON.parse(pendingRaw) : null
    wizard.resetAll()
    wizard.active = true
    wizard.step = 'review'
    if (!pending) return { error: 'missing pending' }
    wizard.selectedBar = {
      bar_id: 'x',
      canonical_key: pending.payload.bar_canonical_key,
      name: 'Bar',
      deck: 1,
      is_virtual: false,
    }
    wizard.selectedDrink = {
      mode: pending.payload.drink.mode,
      offeringId: pending.payload.drink.offering_id,
      displayName: 'Drink',
    }
    wizard.caption = pending.payload.caption || ''
    wizard.preview = { cruise_config_id: pending.cruiseConfigId }
    wizard.previewStatus = 'ready'
    wizard.selectedClaims = []
    if (clearPendingFlag) {
      localStorage.removeItem('star-princess.drinkit.pendingDrinkSubmit.v1')
    }
    const second = wizard.performSubmit()
    const outcomes = await Promise.all([first, second])
    return {
      keyAfterFirst,
      keyAfterSecond: wizard.idempotencyKey,
      cleared: clearPendingFlag,
      outcomes: outcomes.map((o) => ({
        kind: o.kind,
        code: o.result?.code,
        id: o.result?.submission_id,
        replay: o.result?.idempotent_replay === true,
      })),
    }
  }, clearPending)

  await page.waitForTimeout(400)
  const after = await env.service
    .from('submissions')
    .select('id, status, idempotency_key, caption')
    .eq('author_player_id', drinkOnly.player_id)
    .eq('game', 'drinkit')
    .order('created_at', { ascending: false })
    .limit(10)
  const newOnes = (after.data || []).filter((s) => !beforeIds.has(s.id))
  const row = {
    name,
    detail,
    rpcKeys,
    uniqueRpcKeys: [...new Set(rpcKeys)],
    newSubs: newOnes.length,
    rows: newOnes,
  }
  console.log(JSON.stringify(row, null, 2))
  await context.close()
  return row
}

const a = await runVariant('A_clear_pending_remint', { clearPending: true })
const b = await runVariant('B_keep_pending', { clearPending: false })
await browser.close()
const aBad = a.uniqueRpcKeys.length > 1 || (a.detail?.outcomes?.[0]?.id !== a.detail?.outcomes?.[1]?.id)
const bBad = b.uniqueRpcKeys.length > 1 || (b.detail?.outcomes?.[0]?.id !== b.detail?.outcomes?.[1]?.id)
console.log(
  JSON.stringify(
    {
      A_dup_rpc_or_id: aBad,
      B_dup_rpc_or_id: bBad,
      A_keys: a.uniqueRpcKeys,
      B_keys: b.uniqueRpcKeys,
      // newSubs can include concurrent suite noise; authoritative signal is unique RPC keys / shared id
      A_matching_caption: (a.rows || []).filter((r) =>
        String(r.caption || '').includes(String(a.detail?.keyAfterFirst || '').slice(0, 0)),
      ).length,
    },
    null,
    2,
  ),
)
process.exit(aBad || bBad ? 2 : 0)
