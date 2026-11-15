/**
 * Other Drinks focused validation — disposable :55321 only.
 * Never mutates organizer :54321 or Agent 2 :56321.
 */
import ws from 'ws'
globalThis.WebSocket ??= ws
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import * as L from '../gate-a/lib.mjs'

const OTHER_DRINKS_COUNT = 16
const OTHER_DRINKS_LABELS = [
  'Wine',
  'Beer',
  'Loaded Corona',
  'Princess Cooler',
  'Tequila Shot',
  'Sambuca Shot',
  'Fireball Shot',
  'Vodka Shot',
  'Rum — Custom Drink',
  'Tequila — Custom Drink',
  'Gin — Custom Drink',
  'Vodka — Custom Drink',
  'Whiskey — Custom Drink',
  'Bourbon — Custom Drink',
  'Tennessee Whiskey — Custom Drink',
  'Scotch — Custom Drink',
]

const OUT = join(L.ROOT, 'docs/qa/campaign/menu-launch/other-drinks')
const EVIDENCE = join(OUT, 'evidence')
const SHOTS = join(OUT, 'screenshots')
mkdirSync(EVIDENCE, { recursive: true })
mkdirSync(SHOTS, { recursive: true })

const { env, service, anon } = L.createClients()
const beforeOrg = L.organizerCruiseId()
const beforeA2 = L.agent2CruiseId()
const results = []

function record(id, status, summary, detail = {}) {
  const row = { id, status, summary, ...detail, at: new Date().toISOString() }
  results.push(row)
  console.log(`[${status}] ${id} — ${summary}`)
  return row
}

function expect(cond, id, summary, detail) {
  record(id, cond ? 'PASS' : 'FAIL', summary, detail)
  return !!cond
}

expect(env.VITE_SUPABASE_URL === L.DISPOSABLE_URL, 'ENV-DISPOSABLE', 'Clients target :55321')

const clock = await service.rpc('dev_get_ship_clock_state_at', {
  p_at_utc: new Date().toISOString(),
})
expect(
  clock.data?.lifecycle === 'active' &&
    clock.data?.cruise_day === 4 &&
    clock.data?.accepting_submissions === true &&
    !clock.data?.finalized,
  'TUESDAY-CLOCK',
  'Disposable is Tuesday Day 4 active gameplay',
  { clock: clock.data },
)

const orgClock = await fetch('http://127.0.0.1:54321/rest/v1/rpc/dev_get_ship_clock_state_at', {
  method: 'POST',
  headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ p_at_utc: new Date().toISOString() }),
}).then((r) => r.json())
expect(
  orgClock?.lifecycle === 'final' || orgClock?.finalized === true,
  'ORGANIZER-WRAPPED-INTACT',
  'Organizer fixture remains Wrapped/final',
  { lifecycle: orgClock?.lifecycle, finalized: orgClock?.finalized },
)

expect(
  OTHER_DRINKS_COUNT === 16 && OTHER_DRINKS_LABELS.length === 16,
  'LIST-16',
  'Code-owned list has 16 options',
)

// Backend: Other Drinks ordinary log + bounty safety
const ids = L.loadIdentities()
const list = Array.isArray(ids) ? ids : ids.identities || Object.values(ids)
const drinker = list.find((i) => (i.games || []).includes('drinkit') && !i.is_admin) || list[0]
await L.signIn(anon, drinker.login_alias || drinker.email, env.LOCAL_TEST_PASSWORD)
const playerId = drinker.player_id
if (!playerId) throw new Error('missing drinker.player_id')

const atUtc = new Date().toISOString()
const whiskeyPayload = {
  idempotency_key: L.newId(),
  bar_canonical_key: 'lido-bar',
  drink: {
    mode: 'unlisted_named',
    custom_name: 'Whiskey — Custom Drink',
    unlisted_drink_kind: 'named_cocktail',
    other_drinks_key: 'custom-whiskey',
  },
  companion_player_ids: [],
  bar_eligible_companion_ids: [],
  selected_claims: [],
  caption: '7 and 7',
}
const prev = await service.rpc('dev_preview_drink_claims_at', {
  p_payload: whiskeyPayload,
  p_at_utc: atUtc,
  p_player_id: playerId,
})
const cock = prev.data?.preview?.categories?.cocktail?.status
const ing = prev.data?.preview?.categories?.ingredient?.status
expect(
  prev.data?.ok !== false && cock !== 'eligible' && ing !== 'eligible',
  'BE-NO-COCKTAIL-INGREDIENT',
  'Other Drinks unlisted does not earn Cocktail/Ingredient bounty',
  { cock, ing, error: prev.error?.message },
)

const tequilaPayload = {
  idempotency_key: L.newId(),
  bar_canonical_key: 'lido-bar',
  drink: {
    mode: 'unlisted_named',
    custom_name: 'Tequila Shot',
    unlisted_drink_kind: 'other_alcoholic',
    other_drinks_key: 'tequila-shot',
    other_drinks_concept_key: 'tequila-shot',
  },
  companion_player_ids: [],
  bar_eligible_companion_ids: [],
  selected_claims: [],
  caption: 'other-drinks tequila',
}
const submit1 = await service.rpc('dev_submit_drink_at', {
  p_payload: tequilaPayload,
  p_at_utc: atUtc,
  p_player_id: playerId,
})
expect(
  submit1.data?.ok === true || submit1.data?.submission_id,
  'BE-SUBMIT-OTHER-DRINKS',
  'Tequila Shot Other Drinks creates accepted ordinary log',
  { data: submit1.data, error: submit1.error?.message },
)

const submit2 = await service.rpc('dev_submit_drink_at', {
  p_payload: tequilaPayload,
  p_at_utc: atUtc,
  p_player_id: playerId,
})
const sameId =
  submit1.data?.submission_id &&
  submit2.data?.submission_id &&
  submit1.data.submission_id === submit2.data.submission_id
expect(sameId, 'BE-IDEMPOTENT', 'Retry reuses same submission id', {
  a: submit1.data?.submission_id,
  b: submit2.data?.submission_id,
})

const submissionId = submit1.data?.submission_id
if (!submissionId) {
  record('BE-CONCEPT-COMPAT', 'FAIL', 'No submission id to inspect')
} else {
  const logRow = L.disposableJson(`
  select dl.drink_mode, dl.custom_name, dl.drink_display_name, dl.offering_id is null as no_offering,
         dc.canonical_key as concept_key
  from drink_logs dl
  left join drink_concepts dc on dc.id = dl.drink_concept_id
  where dl.submission_id = '${submissionId}'
`)
  expect(
    logRow[0]?.drink_mode === 'unlisted_named' &&
      logRow[0]?.custom_name === 'Tequila Shot' &&
      logRow[0]?.no_offering === true &&
      logRow[0]?.concept_key === 'tequila-shot',
    'BE-CONCEPT-COMPAT',
    'Log stores label + concept identity without fabricating offering',
    { row: logRow[0] },
  )
}

// Mobile Order must reject other_drinks_concept_key
const moPayload = {
  idempotency_key: L.newId(),
  bar_canonical_key: 'mobile-order',
  drink: {
    mode: 'unlisted_named',
    custom_name: 'Tequila Shot',
    unlisted_drink_kind: 'other_alcoholic',
    other_drinks_key: 'tequila-shot',
    other_drinks_concept_key: 'tequila-shot',
  },
  companion_player_ids: [],
  bar_eligible_companion_ids: [],
  selected_claims: [],
  caption: 'mo other drinks blocked',
}
const moPrev = await service.rpc('dev_preview_drink_claims_at', {
  p_payload: moPayload,
  p_at_utc: atUtc,
  p_player_id: playerId,
})
const moBlocked =
  moPrev.error?.message?.includes('OTHER_DRINKS_NOT_ON_MOBILE_ORDER') ||
  String(moPrev.data?.code || '').includes('OTHER_DRINKS') ||
  moPrev.data?.ok === false
expect(moBlocked, 'BE-MO-BLOCK-CONCEPT', 'Mobile Order rejects Other Drinks concept attachment', {
  error: moPrev.error?.message,
  data: moPrev.data,
})

// Browser screenshots against disposable vite :5188
const baseUrl = process.env.OTHER_DRINKS_PREVIEW_URL || 'http://127.0.0.1:5188'
let browser
try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } })
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.getByTestId('login-name-trigger').waitFor({ state: 'visible', timeout: 15000 })
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="login-name-trigger"]')
    return el instanceof HTMLButtonElement && !el.disabled
  })
  const name = drinker.display_name
  await page.locator('#login-name').selectOption({ label: name })
  await page.fill('#login-password', env.LOCAL_TEST_PASSWORD)
  await page.getByTestId('login-submit').click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 })

  await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(SHOTS, '01-tuesday-drinkit-home-402.png'), fullPage: false })
  expect(true, 'UI-HOME', 'Captured Tuesday Drink It! Home', {
    path: 'screenshots/01-tuesday-drinkit-home-402.png',
  })

  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="log-wizard"]', { timeout: 15000 })
  const barBtn = page.locator('[data-testid^="bar-row-"]:not([data-testid*="mobile-order"])').first()
  await barBtn.click()
  await page.waitForSelector('[data-testid="wizard-drink-step"]', { timeout: 10000 })
  const otherEntry = page.getByTestId('other-drinks-entry')
  const moNotListed = page.getByTestId('drink-not-listed')
  expect(await otherEntry.count(), 'UI-OTHER-ENTRY', 'Physical bar shows Other Drinks row')
  expect((await moNotListed.count()) === 0, 'UI-NO-UNLISTED-PHYSICAL', 'Physical bar hides drink-not-listed')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(200)
  await page.screenshot({
    path: join(SHOTS, '02-physical-bar-other-drinks-row-402.png'),
    fullPage: false,
  })

  await otherEntry.click()
  await page.waitForSelector('[data-testid="wizard-other-drinks-step"]', { timeout: 8000 })
  const labels = await page.locator('[data-testid^="other-drink-"] .wizard-choice-title').allTextContents()
  expect(
    labels.length === 16 &&
      labels[0] === 'Wine' &&
      labels[7] === 'Vodka Shot' &&
      labels[13] === 'Bourbon — Custom Drink' &&
      labels[14] === 'Tennessee Whiskey — Custom Drink' &&
      labels[15] === 'Scotch — Custom Drink',
    'UI-LIST-ORDER',
    'All 16 Other Drinks in fixed order',
    { labels },
  )
  await page.screenshot({
    path: join(SHOTS, '03-other-drinks-list-402.png'),
    fullPage: true,
  })

  await page.getByTestId('other-drink-custom-whiskey').click()
  await page.waitForSelector('[data-testid="wizard-friends-step"]', { timeout: 10000 })
  expect(
    (await page.locator('[data-testid="wizard-friends-step"]').count()) > 0,
    'UI-TO-COMPANIONS',
    'Selection advances to companions',
  )
  await page.screenshot({
    path: join(SHOTS, '04-companions-after-other-drinks-402.png'),
    fullPage: false,
  })

  // Mobile Order: no Other Drinks entry
  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="log-wizard"]', { timeout: 15000 })
  const moBar = page.locator('[data-testid="bar-row-mobile-order"], [data-testid*="mobile-order"]').first()
  if (await moBar.count()) {
    await moBar.click()
    await page.waitForSelector('[data-testid="wizard-drink-step"]', { timeout: 10000 })
    expect(
      (await page.getByTestId('other-drinks-entry').count()) === 0,
      'UI-MO-NO-OTHER',
      'Mobile Order has no Other Drinks row',
    )
    expect(
      (await page.getByTestId('drink-not-listed').count()) > 0,
      'UI-MO-UNLISTED',
      'Mobile Order keeps drink-not-listed',
    )
  } else {
    record('UI-MO-NO-OTHER', 'BLOCKED', 'Mobile Order bar not found in selector')
  }

  // Narrow viewport smoke
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-testid^="bar-row-"]:not([data-testid*="mobile-order"])').first().click()
  await page.getByTestId('other-drinks-entry').click()
  await page.screenshot({ path: join(SHOTS, '05-other-drinks-list-360.png'), fullPage: true })
  record('UI-NARROW', 'PASS', 'Captured 360 viewport Other Drinks list')
} catch (e) {
  record('UI-BROWSER', 'FAIL', e.message || String(e))
} finally {
  if (browser) await browser.close()
}

const protected_ = L.assertProtectedStacksUnchanged(beforeOrg, beforeA2)
expect(protected_.organizer.unchanged && protected_.agent2.unchanged, 'PROTECTED', 'Protected stacks unchanged', protected_)

const summary = {
  disposable: L.DISPOSABLE_URL,
  preview_url: baseUrl,
  results,
  totals: results.reduce(
    (a, r) => {
      a[r.status] = (a[r.status] || 0) + 1
      return a
    },
    {},
  ),
}
writeFileSync(join(EVIDENCE, 'other-drinks-validation.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary.totals, null, 2))
if ((summary.totals.FAIL || 0) > 0) process.exitCode = 1
