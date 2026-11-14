/**
 * QA-2B — E2E-011 / E2E-012 flakiness investigation.
 * Disposable :55321 only. No product repairs. No organizer mutation.
 *
 * Usage:
 *   unset QA_ALLOW_ORGANIZER_MUTATION
 *   node scripts/qa2b/investigate-bounty-flakes.mjs [--iters=5]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { loadQa2aEnv, identity } from '../qa2a/lib/env.mjs'
import {
  advanceWizardInstrumented,
  attachNetworkTrace,
  clickBountyClaim,
  ensureEvidenceDir,
  loginAs,
  mobileContextOptions,
  shot,
} from './lib/diag.mjs'
import { EVIDENCE_DIR, REPORT_DIR } from './lib/paths.mjs'

const iters = Number(process.argv.find((a) => a.startsWith('--iters='))?.split('=')[1] || 5)

async function homeBoard(service, playerId) {
  // Prefer RPC if present
  const { data, error } = await service.rpc('get_my_drinkit_home_board')
  if (!error) return { data, error: null, via: 'rpc-as-service-may-fail' }
  void playerId
  return { data: null, error: error?.message || String(error), via: 'rpc' }
}

async function submitClaimFromReview(page, bountyRowTestId) {
  const row = page.locator(`[data-testid="${bountyRowTestId}"]`)
  let rowState = null
  if (await row.count()) {
    rowState = await row.getAttribute('data-state')
    // `selected` is already on the submit payload — clicking it deselects
    // (E2B-002 false fail). Only click `available` to opt in.
    if (rowState === 'available') {
      await row.click()
      rowState = (await row.getAttribute('data-state')) || rowState
    }
  }
  // Capture all bounty row states for forensics
  const bountyStates = await page.evaluate(() => {
    const out = {}
    for (const id of ['cocktail', 'ingredient', 'bar']) {
      const el = document.querySelector(`[data-testid="bounty-row-${id}"]`)
      out[id] = el ? el.getAttribute('data-state') : null
    }
    return out
  })
  await page.locator('[data-testid="submit-drink"]').click({ force: true })
  const unclaimed = page.locator('[data-testid="modal-unclaimed"]')
  if (await unclaimed.isVisible().catch(() => false)) {
    await page.click('[data-testid="modal-primary"]')
  }
  const ingredientConfirm = page.locator('[data-testid="modal-ingredient-confirm"]')
  if (await ingredientConfirm.isVisible().catch(() => false)) {
    await page.click('[data-testid="modal-primary"]')
  }
  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 45000 })
  return { rowState, bountyStates }
}

async function runIngredientIteration({ browser, env, player, iter, resetMode }) {
  const { baseUrl, password, service } = env
  const context = await browser.newContext(mobileContextOptions())
  const page = await context.newPage()
  const net = attachNetworkTrace(page)
  const started = Date.now()
  const result = {
    kind: 'ingredient',
    iter,
    resetMode,
    player: player.display_name,
    player_id: player.player_id,
    phases: {},
    ok: false,
    failPhase: null,
    classification_hint: null,
  }

  try {
    await loginAs(page, { baseUrl, password, displayName: player.display_name })
    result.phases.login_ms = Date.now() - started

    const navStart = Date.now()
    await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
    result.phases.home_nav_ms = Date.now() - navStart
    await shot(page, `flake-ing-home-i${iter}`)

    const claimStart = Date.now()
    const claim = await clickBountyClaim(page, 'ingredient')
    result.phases.claim_click = claim
    result.phases.claim_click_ms = Date.now() - claimStart
    if (!claim.clicked) {
      result.failPhase = 'claim-button'
      result.error = claim.reason
      result.classification_hint = 'fixture_or_eligibility'
      await shot(page, `flake-ing-no-claim-i${iter}`)
      return result
    }

    try {
      await page.waitForURL(/\/drinkit\/log/, { timeout: 15000 })
      result.phases.nav_to_log_ms = Date.now() - claimStart
      result.phases.log_url = page.url()
    } catch (e) {
      result.failPhase = 'navigation-to-log'
      result.error = String(e)
      result.classification_hint = 'product_or_harness_nav'
      await shot(page, `flake-ing-navfail-i${iter}`)
      return result
    }

    // Optional companion for ingredient (not required)
    if (await page.locator('[data-testid="wizard-friends-step"]').isVisible().catch(() => false)) {
      result.phases.landed_on = 'friends'
    }

    const adv = await advanceWizardInstrumented(page, { caption: `QA2B ingredient i${iter}` })
    result.phases.wizard = {
      ok: adv.ok,
      timeline_len: adv.timeline.length,
      labels: adv.timeline.map((t) => t.label),
      final_url: adv.finalState?.url,
      friendRows: adv.finalState?.friendRows,
      visible_keys: Object.entries(adv.finalState?.visible || {})
        .filter(([, v]) => v?.present)
        .map(([k]) => k),
    }
    result.phases.wizard_timeline = adv.timeline.map((t) => ({
      label: t.label,
      disabled: t.disabled,
      error: t.error,
      friendRows: t.state?.friendRows,
      step:
        t.state?.visible?.['wizard-review-step']?.present
          ? 'review'
          : t.state?.visible?.['wizard-photo-step']?.present
            ? 'photo'
            : t.state?.visible?.['wizard-friends-step']?.present
              ? 'friends'
              : t.state?.visible?.['wizard-drink-step']?.present
                ? 'drink'
                : t.state?.visible?.['bar-list']?.present
                  ? 'bar'
                  : 'unknown',
    }))

    if (!adv.ok) {
      result.failPhase = 'wizard-to-review'
      result.error = adv.error
      const last = adv.timeline.at(-1)
      const stuck = result.phases.wizard_timeline.at(-1)?.step
      result.stuck_step = stuck
      // Heuristic classification
      if (stuck === 'friends' || last?.label?.includes('friends-continue-click-blocked')) {
        result.classification_hint = 'harness_or_ux_friends_continue'
      } else if (stuck === 'bar' || last?.label === 'prefill-bar-flash-wait') {
        result.classification_hint = 'prefill_race_harness'
      } else if (stuck === 'photo') {
        result.classification_hint = 'photo_step_stall'
      } else {
        result.classification_hint = 'unresolved_wizard_stall'
      }
      await shot(page, `flake-ing-wizard-fail-i${iter}`)
      await writeFile(
        join(EVIDENCE_DIR, `flake-ing-timeline-i${iter}.json`),
        JSON.stringify({ result, timeline: adv.timeline, net: net.slice(-40) }, null, 2),
      )
      return result
    }

    const submitStart = Date.now()
    try {
      const submitMeta = await submitClaimFromReview(page, 'bounty-row-ingredient')
      result.phases.submit_ms = Date.now() - submitStart
      result.phases.gallery_url = page.url()
      result.phases.submit_meta = submitMeta
      result.ok = true
      await shot(page, `flake-ing-success-i${iter}`)
    } catch (e) {
      result.failPhase = 'submit-or-gallery'
      result.error = String(e)
      result.phases.submit_ms = Date.now() - submitStart
      result.classification_hint = 'submit_server_or_ui'
      await shot(page, `flake-ing-submit-fail-i${iter}`)
    }

    // Authoritative DB check: recent submissions for player
    try {
      const { data: logs, error } = await service
        .from('submissions')
        .select('id, created_at, game, kind, status, voided_at_utc, result_json')
        .eq('author_player_id', player.player_id)
        .eq('game', 'drinkit')
        .order('created_at', { ascending: false })
        .limit(3)
      result.phases.db_recent_submissions = logs
      if (error) result.phases.db_err = error.message
    } catch (e) {
      result.phases.db_err = String(e)
    }

    return result
  } catch (e) {
    result.failPhase = 'uncaught'
    result.error = String(e)
    result.classification_hint = 'environmental'
    await shot(page, `flake-ing-uncaught-i${iter}`).catch(() => {})
    return result
  } finally {
    result.phases.total_ms = Date.now() - started
    result.net_tail = net.slice(-25)
    await context.close()
  }
}

async function runBarIteration({ browser, env, player, companion, iter, selectCompanion }) {
  const { baseUrl, password, service } = env
  const context = await browser.newContext(mobileContextOptions())
  const page = await context.newPage()
  const net = attachNetworkTrace(page)
  const started = Date.now()
  const result = {
    kind: 'bar',
    iter,
    player: player.display_name,
    companion: companion?.display_name || null,
    selectCompanion,
    phases: {},
    ok: false,
    failPhase: null,
  }

  try {
    await loginAs(page, { baseUrl, password, displayName: player.display_name })
    await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
    await shot(page, `flake-bar-home-i${iter}`)

    const claim = await clickBountyClaim(page, 'bar')
    result.phases.claim_click = claim
    if (!claim.clicked) {
      result.failPhase = 'claim-button'
      result.error = claim.reason
      result.classification_hint = 'crew_or_window_eligibility'
      return result
    }
    await page.waitForURL(/\/drinkit\/log/, { timeout: 15000 })
    result.phases.log_url = page.url()

    // Wait briefly for prefill; select companion if required
    await page
      .waitForSelector(
        '[data-testid="wizard-friends-step"], [data-testid="wizard-drink-step"], [data-testid="wizard-photo-step"]',
        { timeout: 15000 },
      )
      .catch(() => {})

    if (selectCompanion && companion) {
      const friendsVisible = await page
        .locator('[data-testid="wizard-friends-step"]')
        .isVisible()
        .catch(() => false)
      result.phases.friends_visible_before_adv = friendsVisible
      if (friendsVisible) {
        const row = page.locator(`[data-testid="friend-row-${companion.player_id}"]`)
        if (await row.count()) {
          await row.scrollIntoViewIfNeeded()
          await row.click()
          result.phases.companion_selected = companion.player_id
        } else {
          const first = page.locator('[data-testid^="friend-row-"]').first()
          if (await first.count()) {
            await first.click()
            result.phases.companion_selected = 'first-available'
          } else {
            result.phases.companion_selected = 'none-found'
          }
        }
      }
    }

    const adv = await advanceWizardInstrumented(page, { caption: `QA2B bar i${iter}` })
    result.phases.wizard = {
      ok: adv.ok,
      labels: adv.timeline.map((t) => t.label),
      friendRows: adv.finalState?.friendRows,
    }
    result.phases.wizard_timeline = adv.timeline.map((t) => ({
      label: t.label,
      step:
        t.state?.visible?.['wizard-review-step']?.present
          ? 'review'
          : t.state?.visible?.['wizard-photo-step']?.present
            ? 'photo'
            : t.state?.visible?.['wizard-friends-step']?.present
              ? 'friends'
              : t.state?.visible?.['wizard-drink-step']?.present
                ? 'drink'
                : t.state?.visible?.['bar-list']?.present
                  ? 'bar'
                  : 'unknown',
    }))

    if (!adv.ok) {
      result.failPhase = 'wizard-to-review'
      result.error = adv.error
      result.stuck_step = result.phases.wizard_timeline.at(-1)?.step
      if (result.stuck_step === 'friends') result.classification_hint = 'harness_or_ux_friends_continue'
      else if (result.stuck_step === 'bar') result.classification_hint = 'prefill_race_harness'
      else result.classification_hint = 'unresolved_wizard_stall'
      await shot(page, `flake-bar-wizard-fail-i${iter}`)
      await writeFile(
        join(EVIDENCE_DIR, `flake-bar-timeline-i${iter}.json`),
        JSON.stringify({ result, timeline: adv.timeline, net: net.slice(-40) }, null, 2),
      )
      return result
    }

    try {
      const submitMeta = await submitClaimFromReview(page, 'bounty-row-bar')
      result.ok = true
      result.phases.gallery_url = page.url()
      result.phases.submit_meta = submitMeta
      await shot(page, `flake-bar-success-i${iter}`)
    } catch (e) {
      result.failPhase = 'submit-or-gallery'
      result.error = String(e)
      result.classification_hint = 'submit_server_or_ui'
      await shot(page, `flake-bar-submit-fail-i${iter}`)
    }

    const { data: logs, error } = await service
      .from('submissions')
      .select('id, created_at, game, kind, status, voided_at_utc, result_json')
      .eq('author_player_id', player.player_id)
      .eq('game', 'drinkit')
      .order('created_at', { ascending: false })
      .limit(3)
    result.phases.db_recent_submissions = logs
    if (error) result.phases.db_err = error.message
    return result
  } catch (e) {
    result.failPhase = 'uncaught'
    result.error = String(e)
    result.classification_hint = 'environmental'
    return result
  } finally {
    result.phases.total_ms = Date.now() - started
    result.net_tail = net.slice(-25)
    await context.close()
  }
}

function summarize(runs) {
  const total = runs.length
  const passed = runs.filter((r) => r.ok).length
  const failed = total - passed
  const byPhase = {}
  const byHint = {}
  for (const r of runs) {
    if (!r.ok) {
      byPhase[r.failPhase || 'unknown'] = (byPhase[r.failPhase || 'unknown'] || 0) + 1
      byHint[r.classification_hint || 'none'] = (byHint[r.classification_hint || 'none'] || 0) + 1
    }
  }
  return { total, passed, failed, fail_rate: total ? failed / total : 0, byPhase, byHint }
}

async function main() {
  if (process.env.QA_ALLOW_ORGANIZER_MUTATION === '1') {
    throw new Error('REFUSE: QA_ALLOW_ORGANIZER_MUTATION must not be set')
  }
  const env = await loadQa2aEnv()
  // loadQa2aEnv returns cruise without lifecycle column — ok
  if (!env.cruise?.id) {
    // Fallback: clock config_id
    env.cruise = { id: env.clock.config_id, label: env.clock.config_label }
  }

  console.log(
    JSON.stringify(
      {
        url: env.url,
        cruise: env.cruise.id,
        lifecycle: env.clock.lifecycle,
        day: env.clock.cruise_day,
        ship_local: env.clock.ship_local,
        iters,
      },
      null,
      2,
    ),
  )

  await mkdir(REPORT_DIR, { recursive: true })
  await ensureEvidenceDir()

  const drinkOnly = identity(env.summary, 'drink_only')
  const both = identity(env.summary, 'both')
  // Extra players for isolation across iterations
  const extras = ['june_becker', 'dan_becker', 'karl_becker', 'jordan_shirley', 'aaron_mills']
    .map((k) => {
      try {
        return identity(env.summary, k)
      } catch {
        return null
      }
    })
    .filter(Boolean)

  const browser = await chromium.launch({ headless: true })
  const ingredientRuns = []
  const barRuns = []

  try {
    // --- Ingredient: same player repeated (contamination check) ---
    for (let i = 1; i <= iters; i++) {
      console.log(`\n--- Ingredient iter ${i}/${iters} player=${both.display_name} ---`)
      const r = await runIngredientIteration({
        browser,
        env,
        player: both,
        iter: i,
        resetMode: 'same-player-no-db-reset',
      })
      ingredientRuns.push(r)
      console.log(r.ok ? 'PASS' : `FAIL @ ${r.failPhase}`, r.classification_hint || '', r.stuck_step || '')
      // After first success, further claims may be ineligible — still record
    }

    // --- Ingredient: rotate fresh-ish players ---
    for (let i = 1; i <= Math.min(iters, extras.length); i++) {
      const player = extras[i - 1]
      console.log(`\n--- Ingredient fresh player iter ${i} ${player.display_name} ---`)
      const r = await runIngredientIteration({
        browser,
        env,
        player,
        iter: `F${i}`,
        resetMode: 'rotated-player',
      })
      ingredientRuns.push(r)
      console.log(r.ok ? 'PASS' : `FAIL @ ${r.failPhase}`, r.classification_hint || '', r.stuck_step || '')
    }

    // --- Bar: with companion selection vs without ---
    for (let i = 1; i <= iters; i++) {
      const selectCompanion = i % 2 === 1
      console.log(`\n--- Bar iter ${i}/${iters} companion=${selectCompanion} ---`)
      const r = await runBarIteration({
        browser,
        env,
        player: both,
        companion: drinkOnly,
        iter: i,
        selectCompanion,
      })
      barRuns.push(r)
      console.log(r.ok ? 'PASS' : `FAIL @ ${r.failPhase}`, r.classification_hint || '', r.stuck_step || '')
    }

    // Bar with alternate player pairs (crew partitions)
    const pairs = [
      [identity(env.summary, 'josh_forrester'), identity(env.summary, 'katie_forrester')],
      [identity(env.summary, 'dan_becker'), identity(env.summary, 'cindy_becker')],
    ]
    for (let i = 0; i < pairs.length; i++) {
      const [player, companion] = pairs[i]
      console.log(`\n--- Bar crew pair ${i + 1} ${player.display_name}+${companion.display_name} ---`)
      const r = await runBarIteration({
        browser,
        env,
        player,
        companion,
        iter: `C${i + 1}`,
        selectCompanion: true,
      })
      barRuns.push(r)
      console.log(r.ok ? 'PASS' : `FAIL @ ${r.failPhase}`, r.classification_hint || '', r.stuck_step || '')
    }
  } finally {
    await browser.close()
  }

  const report = {
    generated_at: new Date().toISOString(),
    env: {
      supabase_url: env.url,
      cruise_id: env.cruise.id,
      lifecycle: env.clock.lifecycle,
      cruise_day: env.clock.cruise_day,
      ship_local: env.clock.ship_local,
      baseUrl: env.baseUrl,
    },
    e2e_011_ingredient: {
      summary: summarize(ingredientRuns),
      runs: ingredientRuns,
    },
    e2e_012_bar: {
      summary: summarize(barRuns),
      runs: barRuns,
    },
  }

  await writeFile(join(EVIDENCE_DIR, 'flake-investigation-raw.json'), JSON.stringify(report, null, 2))
  await writeFile(join(REPORT_DIR, 'flake-investigation-raw.json'), JSON.stringify(report, null, 2))
  console.log('\n=== INGREDIENT SUMMARY ===')
  console.log(JSON.stringify(report.e2e_011_ingredient.summary, null, 2))
  console.log('\n=== BAR SUMMARY ===')
  console.log(JSON.stringify(report.e2e_012_bar.summary, null, 2))
  console.log(`Wrote ${join(REPORT_DIR, 'flake-investigation-raw.json')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
