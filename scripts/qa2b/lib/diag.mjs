/**
 * Diagnostic helpers for QA-2B bounty flakiness investigation.
 * No application code changes — harness instrumentation only.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { EVIDENCE_DIR } from './paths.mjs'
import { loginAs, mobileContextOptions } from '../../qa2a/lib/browser.mjs'

export { loginAs, mobileContextOptions }

export async function ensureEvidenceDir() {
  await mkdir(EVIDENCE_DIR, { recursive: true })
}

export async function shot(page, name) {
  await ensureEvidenceDir()
  const path = join(EVIDENCE_DIR, `${name}.png`)
  await page.screenshot({ path, fullPage: true })
  return path
}

/** Snapshot of wizard / home state for timeout forensics. */
export async function captureWizardState(page) {
  return page.evaluate(() => {
    const testids = [
      'log-wizard',
      'bar-list',
      'wizard-drink-step',
      'wizard-friends-step',
      'wizard-photo-step',
      'wizard-review-step',
      'friends-continue',
      'photo-continue',
      'submit-drink',
      'bounty-row-cocktail',
      'bounty-row-ingredient',
      'bounty-row-bar',
      'bounty-row-daily',
      'modal-unclaimed',
      'photo-staged-ready',
    ]
    const visible = {}
    for (const id of testids) {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el) {
        visible[id] = null
        continue
      }
      const style = window.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      visible[id] = {
        present: true,
        display: style.display,
        visibility: style.visibility,
        disabled: el instanceof HTMLButtonElement ? el.disabled : null,
        state: el.getAttribute('data-state'),
        text: (el.innerText || '').slice(0, 80),
        inView: rect.height > 0 && rect.width > 0,
        top: Math.round(rect.top),
      }
    }
    const friendRows = document.querySelectorAll('[data-testid^="friend-row-"]').length
    const drinkRows = document.querySelectorAll('[data-testid^="drink-row-"]').length
    const barRows = document.querySelectorAll('[data-testid^="bar-row-"]').length
    const nav = document.querySelector('.floating-bottom-nav')
    return {
      url: location.href,
      friendRows,
      drinkRows,
      barRows,
      floatingNav: nav
        ? {
            pointerEvents: getComputedStyle(nav).pointerEvents,
            zIndex: getComputedStyle(nav).zIndex,
            rect: nav.getBoundingClientRect().toJSON?.() || null,
          }
        : null,
      visible,
      bodySnippet: (document.body?.innerText || '').slice(0, 400),
    }
  })
}

/**
 * Instrumented advance through log wizard with step timeline.
 * Returns { ok, timeline, finalState, error }.
 * Does NOT increase product timeouts silently — records where stalls happen.
 */
export async function advanceWizardInstrumented(page, { caption = 'QA2B claim', maxLoops = 12, settleMs = 450 } = {}) {
  const timeline = []
  const mark = async (label, extra = {}) => {
    const state = await captureWizardState(page).catch((e) => ({ error: String(e) }))
    timeline.push({ t: Date.now(), label, ...extra, state })
  }

  await page.waitForSelector('[data-testid="log-wizard"]', { timeout: 20000 })
  await page.evaluate(() => {
    const nav = document.querySelector('.floating-bottom-nav')
    if (nav) nav.style.pointerEvents = 'none'
  })
  await mark('wizard-mounted')

  const from = new URL(page.url()).searchParams.get('from') || ''
  const cocktailPrefill = from === 'cocktail'
  const ingredientClaim = from === 'ingredient'
  const barClaim = from === 'bar'
  // Ingredient intentionally starts on bar; ordinary logs also pick a bar.
  // Cocktail/bar deep links should skip past bar once prefill settles.
  const mustPickBar = ingredientClaim || (!cocktailPrefill && !barClaim)

  if (cocktailPrefill || barClaim) {
    try {
      await page.waitForSelector(
        '[data-testid="wizard-friends-step"], [data-testid="wizard-drink-step"], [data-testid="wizard-photo-step"], [data-testid="wizard-review-step"]',
        { timeout: 20000 },
      )
      await mark('prefill-settled')
    } catch (e) {
      await mark('prefill-settle-timeout', { error: String(e) })
    }
  } else if (ingredientClaim) {
    await mark('ingredient-expects-bar-picker')
    try {
      await page.waitForSelector('[data-testid="bar-list"]', { timeout: 20000 })
      await mark('ingredient-bar-list-ready')
    } catch (e) {
      await mark('ingredient-bar-list-timeout', { error: String(e) })
    }
  }

  for (let guard = 0; guard < maxLoops; guard++) {
    if (await page.locator('[data-testid="wizard-review-step"]').count()) {
      await mark('review-reached', { guard })
      return { ok: true, timeline, finalState: timeline.at(-1)?.state, error: null }
    }

    if (mustPickBar && (await page.locator('[data-testid="bar-list"]').count())) {
      await mark('click-bar', { guard, reason: ingredientClaim ? 'ingredient-requires-bar' : 'ordinary' })
      await page.locator('[data-testid^="bar-row-"]').first().click()
      await page.waitForTimeout(settleMs)
      continue
    }

    if (await page.locator('[data-testid="wizard-drink-step"]').count()) {
      await mark('pick-drink', { guard, ingredientClaim })
      if (ingredientClaim) {
        // Ingredient scoring requires affirming the drink contains today's ingredient.
        // Use Not Listed → cocktail type → Yes → Continue (catalog coincidence is unreliable).
        const notListed = page.locator('[data-testid="drink-not-listed"]')
        if (await notListed.count()) {
          await notListed.click()
          await page.waitForSelector('[data-testid="unlisted-form"]', { timeout: 10000 })
          await page.fill('[data-testid="unlisted-name"]', `QA2B Ingredient ${Date.now() % 100000}`)
          const cocktailType = page.locator('[data-testid="unlisted-type-cocktail"]')
          if (await cocktailType.count()) await cocktailType.click()
          const yes = page.locator('[data-testid="unlisted-ingredient-yes"]')
          if (await yes.count()) await yes.click()
          // Featured-cocktail confirm may appear — answer No so we stay on ingredient path.
          const featuredNo = page.locator('[data-testid="unlisted-featured-no"]')
          if (await featuredNo.isVisible().catch(() => false)) await featuredNo.click()
          await page.locator('[data-testid="unlisted-continue"]').click({ force: true })
          await mark('ingredient-unlisted-affirmed')
          await page.waitForTimeout(settleMs)
          continue
        }
      }
      const listed = page.locator('[data-testid^="drink-row-"]').first()
      if (await listed.count()) await listed.click()
      else await page.click('[data-testid="drink-generic-beer"]')
      await page.waitForTimeout(settleMs)
      continue
    }

    if (await page.locator('[data-testid="wizard-friends-step"]').count()) {
      const cont = page.locator('[data-testid="friends-continue"]')
      const disabled = await cont.isDisabled().catch(() => null)
      await mark('friends-continue-attempt', { guard, disabled })
      await page.evaluate(() => {
        document.querySelector('[data-testid="friends-continue"]')?.scrollIntoView({ block: 'center' })
      })
      // Capture whether continue is covered without force
      const box = await cont.boundingBox().catch(() => null)
      try {
        await cont.click({ timeout: 3000 })
        await mark('friends-continue-click-ok', { guard, box })
      } catch (clickErr) {
        await mark('friends-continue-click-blocked', { guard, box, error: String(clickErr) })
        await cont.click({ force: true })
        await mark('friends-continue-force-click', { guard })
      }
      await page.waitForTimeout(settleMs + 200)
      continue
    }

    if (await page.locator('[data-testid="wizard-photo-step"]').count()) {
      await mark('photo-continue', { guard })
      const captionInput = page.locator('[data-testid="caption-input"]')
      if (await captionInput.count()) await captionInput.fill(caption)
      await page.locator('[data-testid="photo-continue"]').click({ force: true })
      await page.waitForTimeout(settleMs + 200)
      continue
    }

    if ((cocktailPrefill || barClaim) && (await page.locator('[data-testid="bar-list"]').count())) {
      await mark('prefill-bar-flash-wait', { guard })
      await page.waitForTimeout(500)
      continue
    }

    await mark('loop-no-match-break', { guard })
    break
  }

  try {
    await page.waitForSelector('[data-testid="wizard-review-step"]', { timeout: 8000 })
    await mark('review-late')
    return { ok: true, timeline, finalState: await captureWizardState(page), error: null }
  } catch (e) {
    const finalState = await captureWizardState(page)
    await mark('review-timeout', { error: String(e) })
    return { ok: false, timeline, finalState, error: String(e) }
  }
}

export async function clickBountyClaim(page, kind) {
  // kind: cocktail | ingredient | bar | daily
  // Prefer stable card testids — NEVER match /Bar/i against body text ("8 bars").
  await page.waitForSelector(
    '[data-testid="bounty-carousel"], [data-testid="bounty-claim"], [data-testid="bounty-overlay"]',
    { timeout: 20000 },
  )

  if (kind === 'daily') {
    const card = page.locator('[data-testid="bounty-card-daily"]')
    if (await card.count()) {
      await card.scrollIntoViewIfNeeded()
      const dailyBtn = card.locator('[data-testid="bounty-claim"]')
      if (!(await dailyBtn.count()) || !(await dailyBtn.isEnabled())) {
        return { clicked: false, reason: 'daily-claim-disabled-or-missing' }
      }
      await dailyBtn.click()
      return { clicked: true, via: 'bounty-card-daily' }
    }
    return { clicked: false, reason: 'daily-card-missing' }
  }

  const cardId = `bounty-card-${kind}`
  const card = page.locator(`[data-testid="${cardId}"]`)
  if (!(await card.count())) {
    return { clicked: false, reason: `${cardId}-missing` }
  }
  await card.scrollIntoViewIfNeeded()
  const btn = card.locator('[data-testid="bounty-claim"]')
  const overlay = card.locator('[data-testid="bounty-overlay"]')
  const enabled = (await btn.count()) > 0 && (await btn.isEnabled())
  const cardText = ((await card.innerText().catch(() => '')) || '').slice(0, 160)
  if (!enabled) {
    return {
      clicked: false,
      reason: `${kind}-claim-disabled-or-missing`,
      cardText,
      overlay: (await overlay.count()) > 0,
    }
  }
  await btn.click()
  return { clicked: true, via: cardId, cardText }
}

export function attachNetworkTrace(page) {
  const events = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      events.push({ t: Date.now(), kind: 'console', type: msg.type(), text: msg.text().slice(0, 300) })
    }
  })
  page.on('pageerror', (err) => {
    events.push({ t: Date.now(), kind: 'pageerror', text: String(err).slice(0, 300) })
  })
  page.on('response', async (res) => {
    const u = res.url()
    if (!/rpc\/|rest\/v1\/|storage\//.test(u)) return
    const short = u.replace(/^https?:\/\/[^/]+/, '').slice(0, 160)
    events.push({
      t: Date.now(),
      kind: 'response',
      status: res.status(),
      url: short,
      timing: res.request().timing?.() || null,
    })
  })
  return events
}
