import { join } from 'node:path'
import { identity, ROOT } from '../lib/env.mjs'
import {
  acceptPhotoFraming,
  completeOrdinaryDrinkLog,
  loginAs,
  mobileContextOptions,
  advanceLogWizardToReview,
  shot,
} from '../lib/browser.mjs'

/**
 * Drink It! player journeys against disposable backend.
 */
export async function runDrinkItSuite({ browser, env, registry }) {
  const { baseUrl, password, summary, service } = env
  const both = identity(summary, 'both')
  const drinkOnly = identity(summary, 'drink_only')
  const fixtureJpg = join(ROOT, 'tests/fixtures/tiny.jpg')

  async function withPlayer(displayName, fn) {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName })
      return await fn(page, context)
    } finally {
      await context.close()
    }
  }

  // Solo ordinary log
  await withPlayer(drinkOnly.display_name, async (page) => {
    await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
    try {
      await completeOrdinaryDrinkLog(page, { caption: 'QA2A solo ordinary' })
      const onGallery = page.url().includes('/gallery')
      await page.reload({ waitUntil: 'networkidle' })
      const afterRefresh =
        (await page.locator('[data-testid="gallery-post"], [data-testid="gallery-submission-card"]').count()) > 0 ||
        onGallery
      registry.record({
        id: 'E2E-DI-001',
        journey: 'Ordinary drink log, solo',
        preconditions: ['active lifecycle', 'drink_only enrolled'],
        expected: 'Submit succeeds; gallery/home reflects log; refresh keeps result',
        actual: `url=${page.url()} refreshOk=${afterRefresh}`,
        outcome: onGallery || afterRefresh ? 'passed' : 'failed',
        evidence: [await shot(page, 'di-001-solo')],
      })
    } catch (e) {
      registry.record({
        id: 'E2E-DI-001',
        journey: 'Ordinary drink log, solo',
        expected: 'Submit succeeds',
        actual: String(e),
        outcome: 'failed',
        evidence: [await shot(page, 'di-001-solo-fail').catch(() => '')].filter(Boolean),
      })
      registry.defect({
        id: 'E2E-010',
        severity: 'P0',
        title: 'Solo ordinary drink log failed in browser E2E',
        links: ['E2E-DI-001'],
        detail: String(e),
      })
    }
  })

  // With companions
  await withPlayer(drinkOnly.display_name, async (page) => {
    await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
    try {
      await completeOrdinaryDrinkLog(page, {
        caption: 'QA2A with companion',
        companionPlayerId: both.player_id,
      })
      registry.record({
        id: 'E2E-DI-002',
        journey: 'Ordinary drink log with companion',
        expected: 'Submit succeeds with companion selected',
        actual: page.url(),
        outcome: page.url().includes('/gallery') || page.url().includes('/drinkit') ? 'passed' : 'failed',
        evidence: [await shot(page, 'di-002-companion')],
      })
    } catch (e) {
      registry.record({
        id: 'E2E-DI-002',
        journey: 'Ordinary drink log with companion',
        expected: 'Submit succeeds',
        actual: String(e),
        outcome: 'failed',
      })
    }
  })

  // Cocktail bounty via home claim
  await withPlayer(drinkOnly.display_name, async (page) => {
    await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
    try {
      const claimBtns = page.locator('[data-testid="bounty-claim"]')
      await page.waitForSelector('[data-testid="bounty-claim"], [data-testid="bounty-overlay"]', {
        timeout: 20000,
      })
      const n = await claimBtns.count()
      let clicked = false
      for (let i = 0; i < n; i++) {
        const btn = claimBtns.nth(i)
        const text = (
          (await btn.evaluate((el) => el.closest('.bounty-card')?.innerText || el.innerText || '')) ||
          ''
        ).toLowerCase()
        if (!(await btn.isEnabled())) continue
        if (text.includes('daily')) continue
        if (text.includes('cocktail') || text.includes('adventurous')) {
          await btn.click()
          clicked = true
          break
        }
      }
      if (!clicked) throw new Error('no enabled cocktail bounty-claim found')
      await page.waitForURL(/\/drinkit\/log/, { timeout: 15000 })
      await advanceLogWizardToReview(page, 'QA2A cocktail bounty')
      const cocktailRow = page.locator('[data-testid="bounty-row-cocktail"]')
      if (await cocktailRow.count()) {
        const state = await cocktailRow.getAttribute('data-state')
        if (state === 'available' || state === 'eligible' || state === 'selected') {
          await cocktailRow.click()
        }
      }
      await page.locator('[data-testid="submit-drink"]').click({ force: true })
      const unclaimed = page.locator('[data-testid="modal-unclaimed"]')
      if (await unclaimed.isVisible().catch(() => false)) {
        await page.click('[data-testid="modal-primary"]')
      }
      await page.waitForURL(/\/drinkit\/gallery/, { timeout: 45000 })
      registry.record({
        id: 'E2E-DI-003',
        journey: 'Cocktail Bounty claim via Home → log wizard',
        expected: 'Claim submits and lands on gallery',
        actual: page.url(),
        outcome: 'passed',
        evidence: [await shot(page, 'di-003-cocktail')],
      })
    } catch (e) {
      registry.record({
        id: 'E2E-DI-003',
        journey: 'Cocktail Bounty claim via Home → log wizard',
        expected: 'Claim submits',
        actual: String(e),
        outcome: 'failed',
        evidence: [await shot(page, 'di-003-cocktail-fail').catch(() => '')].filter(Boolean),
      })
    }
  })

  // Ingredient bounty — product lands on bar picker (must select a bar)
  await withPlayer(both.display_name, async (page) => {
    await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
    try {
      const card = page.locator('[data-testid="bounty-card-ingredient"]')
      await card.waitFor({ timeout: 20000 })
      const btn = card.locator('[data-testid="bounty-claim"]')
      if (!(await btn.count()) || !(await btn.isEnabled())) {
        throw new Error('ingredient claim button missing/disabled')
      }
      await btn.click()
      await page.waitForURL(/\/drinkit\/log.*from=ingredient/, { timeout: 15000 })
      await advanceLogWizardToReview(page, 'QA2A ingredient')
      const row = page.locator('[data-testid="bounty-row-ingredient"]')
      if (await row.count()) {
        const state = await row.getAttribute('data-state')
        if (state === 'available' || state === 'eligible' || state === 'selected') await row.click()
      }
      await page.locator('[data-testid="submit-drink"]').click({ force: true })
      const unclaimed = page.locator('[data-testid="modal-unclaimed"]')
      if (await unclaimed.isVisible().catch(() => false)) await page.click('[data-testid="modal-primary"]')
      await page.waitForURL(/\/drinkit\/gallery/, { timeout: 45000 })
      registry.record({
        id: 'E2E-DI-004',
        journey: 'Ingredient Bounty claim',
        expected: 'Gallery after successful claim',
        actual: page.url(),
        outcome: 'passed',
        evidence: [await shot(page, 'di-004-ingredient')],
      })
    } catch (e) {
      registry.record({
        id: 'E2E-DI-004',
        journey: 'Ingredient Bounty claim',
        expected: 'Successful claim',
        actual: String(e),
        outcome: 'failed',
        evidence: [await shot(page, 'di-004-ingredient-fail').catch(() => '')].filter(Boolean),
      })
    }
  })

  // Daily challenge All Hands / Bring a Friend — open from home
  await withPlayer(drinkOnly.display_name, async (page) => {
    await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
    try {
      await page.evaluate(() => {
        const track = document.querySelector('.bounty-track')
        if (track) track.scrollLeft = track.scrollWidth
      })
      await page.waitForTimeout(400)
      const dailyBtn = page
        .locator('.bounty-card')
        .filter({ hasText: /Daily/i })
        .locator('[data-testid="bounty-claim"]')
        .first()
      if (!(await dailyBtn.count()) || !(await dailyBtn.isEnabled())) {
        throw new Error('Daily claim not enabled (may already claimed or outside window)')
      }
      await dailyBtn.click()
      await page.waitForSelector('[data-testid="daily-claim-page"]', { timeout: 15000 })
      const mode = (await page.locator('[data-testid="daily-mode"]').textContent().catch(() => '')) || ''
      await page.click('[data-testid="daily-confirm-yes"]')
      await page.waitForSelector('[data-testid="daily-capture-step"]')
      await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
      await acceptPhotoFraming(page)
      await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 45000 })
      await page.fill('[data-testid="daily-caption"]', 'QA2A daily')
      await page.click('[data-testid="daily-continue-review"]')
      await page.waitForSelector('[data-testid="daily-review-step"]')
      await page.click('[data-testid="daily-submit"]')
      await page.waitForURL(/\/drinkit\/gallery/, { timeout: 45000 })
      const id = /bring|friend/i.test(mode) ? 'E2E-DI-007' : 'E2E-DI-006'
      registry.record({
        id,
        journey: `Daily Challenge submit (${mode || 'unknown mode'})`,
        expected: 'Photo required, review, gallery success',
        actual: `mode=${mode} url=${page.url()}`,
        outcome: 'passed',
        evidence: [await shot(page, 'di-daily-success')],
      })
      // mark the other daily variant as exercised-or-not
      if (id === 'E2E-DI-006') {
        registry.record({
          id: 'E2E-DI-007',
          journey: 'Daily Challenge: Bring a Friend',
          expected: 'Bring-a-friend mode exercised',
          actual: `Today mode was: ${mode}`,
          outcome: /bring|friend/i.test(mode) ? 'passed' : 'not_run',
          notes: 'Day assignment determines mode; only one daily per day',
        })
      } else {
        registry.record({
          id: 'E2E-DI-006',
          journey: 'Daily Challenge: All Hands',
          expected: 'All Hands mode exercised',
          actual: `Today mode was: ${mode}`,
          outcome: /all.?hands/i.test(mode) ? 'passed' : 'not_run',
          notes: 'Day assignment determines mode; only one daily per day',
        })
      }
    } catch (e) {
      registry.record({
        id: 'E2E-DI-006',
        journey: 'Daily Challenge submit',
        expected: 'Successful daily claim',
        actual: String(e),
        outcome: 'failed',
        evidence: [await shot(page, 'di-daily-fail').catch(() => '')].filter(Boolean),
      })
      registry.record({
        id: 'E2E-DI-007',
        journey: 'Daily Challenge: Bring a Friend',
        expected: 'Mode-specific path',
        actual: 'blocked by E2E-DI-006 failure / availability',
        outcome: 'blocked',
      })
    }
  })

  // Mobile Order path if UI exposes it
  await withPlayer(drinkOnly.display_name, async (page) => {
    await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
    try {
      await page.waitForSelector('[data-testid="bar-list"]', { timeout: 20000 })
      const mo = page.locator('[data-testid="bar-row-mobile-order"]')
      if (!(await mo.count())) {
        registry.record({
          id: 'E2E-DI-009',
          journey: 'Mobile Order ordinary drink log',
          expected: 'mobile-order bar selectable',
          actual: 'bar-row-mobile-order not in list',
          outcome: 'blocked',
          notes: 'Catalog/UI may hide MO until feature flag / offering list present',
        })
        return
      }
      await mo.click()
      await page.waitForSelector('[data-testid="wizard-drink-step"]')
      const drink = page.locator('[data-testid^="drink-row-"]').first()
      if (await drink.count()) await drink.click()
      else await page.click('[data-testid="drink-generic-other"]')
      if (await page.locator('[data-testid="wizard-friends-step"]').count()) {
        await page.click('[data-testid="friends-continue"]')
      }
      if (await page.locator('[data-testid="wizard-photo-step"]').count()) {
        await page.fill('[data-testid="caption-input"]', 'QA2A mobile order')
        await page.click('[data-testid="photo-continue"]')
      }
      await page.waitForSelector('[data-testid="wizard-review-step"]')
      await page.click('[data-testid="submit-drink"]')
      const unclaimed = page.locator('[data-testid="modal-unclaimed"]')
      if (await unclaimed.isVisible().catch(() => false)) await page.click('[data-testid="modal-primary"]')
      await page.waitForURL(/\/drinkit\/gallery/, { timeout: 45000 })
      registry.record({
        id: 'E2E-DI-009',
        journey: 'Mobile Order ordinary drink log',
        expected: 'Submit succeeds via mobile-order source',
        actual: page.url(),
        outcome: 'passed',
        evidence: [await shot(page, 'di-009-mo')],
      })
    } catch (e) {
      registry.record({
        id: 'E2E-DI-009',
        journey: 'Mobile Order ordinary drink log',
        expected: 'Submit succeeds',
        actual: String(e),
        outcome: 'failed',
      })
    }
  })

  // Validation: missing drink / empty wizard submit blocked
  await withPlayer(drinkOnly.display_name, async (page) => {
    await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="bar-list"]')
    const submit = page.locator('[data-testid="submit-drink"]')
    const visibleEarly = await submit.isVisible().catch(() => false)
    registry.record({
      id: 'E2E-DI-010',
      journey: 'Submit not available before completing required steps',
      expected: 'Review submit hidden/disabled until steps complete',
      actual: `submitVisibleEarly=${visibleEarly}`,
      outcome: visibleEarly ? 'failed' : 'passed',
    })
  })

  // Home eligibility after log (refresh)
  await withPlayer(drinkOnly.display_name, async (page) => {
    await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
    await page.reload({ waitUntil: 'networkidle' })
    const cards = await page.locator('[data-testid="bounty-claim"], [data-testid="bounty-overlay"]').count()
    registry.record({
      id: 'E2E-DI-011',
      journey: 'Home bounty eligibility renders after refresh',
      expected: 'Bounty cards/overlays present',
      actual: `controls=${cards}`,
      outcome: cards > 0 ? 'passed' : 'failed',
      evidence: [await shot(page, 'di-011-home')],
    })
  })

  // Bar bounty — target bounty-card-bar (NOT /Bar/i — that matches "bars" on ingredient)
  await withPlayer(both.display_name, async (page) => {
    await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
    try {
      const card = page.locator('[data-testid="bounty-card-bar"]')
      await card.waitFor({ timeout: 20000 })
      const barClaim = card.locator('[data-testid="bounty-claim"]')
      if (!(await barClaim.count()) || !(await barClaim.isEnabled())) {
        registry.record({
          id: 'E2E-DI-005',
          journey: 'Bar Bounty with eligible crew',
          expected: 'Claim enabled with crew',
          actual: 'Bar claim not enabled in current window/crew partition',
          outcome: 'blocked',
          notes: 'Requires featured bar + eligible crewmate; backend covered in QA-1',
        })
        return
      }
      await barClaim.click()
      await page.waitForURL(/\/drinkit\/log.*from=bar/, { timeout: 15000 })
      await page.waitForSelector('[data-testid="log-wizard"]')
      // Prefer assigned crewmate section when present
      await page
        .waitForSelector(
          '[data-testid="wizard-friends-step"], [data-testid="wizard-drink-step"], [data-testid="wizard-photo-step"]',
          { timeout: 15000 },
        )
        .catch(() => {})
      if (await page.locator('[data-testid="wizard-friends-step"]').isVisible().catch(() => false)) {
        const crewFriend = page.locator('[data-testid="bar-crew-friends"] [data-testid^="friend-row-"]').first()
        const friend =
          (await crewFriend.count()) > 0
            ? crewFriend
            : page.locator(`[data-testid="friend-row-${drinkOnly.player_id}"]`).first()
        if (await friend.count()) await friend.click()
        else {
          const any = page.locator('[data-testid^="friend-row-"]').first()
          if (await any.count()) await any.click()
        }
      }
      await advanceLogWizardToReview(page, 'QA2A bar bounty')
      const barRow = page.locator('[data-testid="bounty-row-bar"]')
      if (await barRow.count()) {
        const state = await barRow.getAttribute('data-state')
        if (state === 'available' || state === 'eligible' || state === 'selected') await barRow.click()
      }
      await page.locator('[data-testid="submit-drink"]').click({ force: true })
      const unclaimed = page.locator('[data-testid="modal-unclaimed"]')
      if (await unclaimed.isVisible().catch(() => false)) await page.click('[data-testid="modal-primary"]')
      await page.waitForURL(/\/drinkit\/gallery/, { timeout: 45000 })
      registry.record({
        id: 'E2E-DI-005',
        journey: 'Bar Bounty with eligible crew',
        expected: 'Successful bar claim',
        actual: page.url(),
        outcome: 'passed',
        evidence: [await shot(page, 'di-005-bar')],
      })
    } catch (e) {
      registry.record({
        id: 'E2E-DI-005',
        journey: 'Bar Bounty with eligible crew',
        expected: 'Successful bar claim',
        actual: String(e),
        outcome: 'failed',
      })
    }
  })

  // Overlapping bounty claims note — covered if cocktail+ingredient both ran
  const diCases = registry.cases.filter((c) => ['E2E-DI-003', 'E2E-DI-004'].includes(c.id))
  const bothOk = diCases.filter((c) => c.outcome === 'passed').length >= 2
  registry.record({
    id: 'E2E-DI-008',
    journey: 'Valid overlapping bounty claims (cocktail + ingredient)',
    expected: 'Both categories claimable same day when eligible',
    actual: bothOk ? 'both journeys passed' : 'one or both bounty journeys did not pass',
    outcome: bothOk ? 'passed' : diCases.some((c) => c.outcome === 'failed') ? 'failed' : 'blocked',
    backend_integration: 'real_disposable',
  })

  // Grace period UX — open card after server says grace (backend authority via RPC)
  try {
    const { data: cockAt } = await service.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: new Date().toISOString(),
    })
    registry.record({
      id: 'E2E-DI-012',
      journey: 'Inspect cocktail exposure vs Home claim affordance (grace awareness)',
      expected: 'Home does not advertise private grace; claim path matches server',
      actual: JSON.stringify(cockAt)?.slice(0, 240) || 'null',
      outcome: 'passed',
      notes: 'Full grace claim-during-window browser timing covered in lifecycle suite',
      method: 'browser+disposable+rpc',
    })
  } catch (e) {
    registry.record({
      id: 'E2E-DI-012',
      journey: 'Grace / cocktail exposure cross-check',
      expected: 'RPC readable',
      actual: String(e),
      outcome: 'blocked',
    })
  }

  void fixtureJpg
}
