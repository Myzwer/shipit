import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { acceptPhotoFraming } from '../../lib/acceptPhotoFraming.mjs'
import { EVIDENCE_DIR } from './env.mjs'

export async function ensureEvidenceDir() {
  await mkdir(EVIDENCE_DIR, { recursive: true })
}

export function mobileContextOptions(viewport = { width: 390, height: 844 }) {
  return {
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    // Emulation only — not physical iPhone Safari / Android Chrome.
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 QA2A-Emulation',
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {{ baseUrl: string, password: string, displayName: string }} opts
 */
export async function loginAs(page, { baseUrl, password, displayName }) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-name', { timeout: 20000 })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('[data-testid="login-submit"]')
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 25000 })
}

export async function logout(page, baseUrl) {
  // Prefer account/logout controls when present; fall back to clearing storage.
  const logoutBtn = page.locator(
    '[data-testid="logout"], button:has-text("Log out"), button:has-text("Sign out")',
  )
  if (await logoutBtn.count()) {
    await logoutBtn.first().click()
    await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {})
  }
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.context().clearCookies()
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
}

export async function shot(page, name) {
  await ensureEvidenceDir()
  const path = join(EVIDENCE_DIR, `${name}.png`)
  await page.screenshot({ path, fullPage: true })
  return path
}

export { acceptPhotoFraming }

/**
 * Ordinary drink log through wizard (optional companions / photo / bounty rows).
 * @param {import('playwright').Page} page
 * @param {{ caption?: string, companionPlayerId?: string | null, generic?: 'beer'|'wine'|'other', withPhoto?: string | null, preferBarKey?: string | null }} opts
 */
export async function completeOrdinaryDrinkLog(page, opts = {}) {
  const {
    caption = 'QA2A ordinary log',
    companionPlayerId = null,
    generic = 'beer',
    withPhoto = null,
    preferBarKey = null,
  } = opts

  await page.waitForSelector('[data-testid="log-wizard"]', { timeout: 20000 })
  await page.waitForSelector('[data-testid="bar-list"]', { timeout: 20000 })
  if (preferBarKey) {
    const row = page.locator(`[data-testid="bar-row-${preferBarKey}"]`)
    if (await row.count()) await row.first().click()
    else await page.locator('[data-testid^="bar-row-"]').first().click()
  } else {
    await page.locator('[data-testid^="bar-row-"]').first().click()
  }

  await page.waitForSelector('[data-testid="wizard-drink-step"]')
  if (generic === 'beer' || generic === 'wine' || generic === 'other') {
    // Prefer catalog offerings when present; fall back to requested generic.
    const listed = page.locator('[data-testid^="drink-row-"]').first()
    if (await listed.count()) await listed.click()
    else await page.click(`[data-testid="drink-generic-${generic}"]`)
  } else {
    await page.click(`[data-testid="drink-generic-${generic}"]`)
  }

  await page.waitForSelector('[data-testid="wizard-friends-step"]')
  if (companionPlayerId) {
    const friend = page.locator(`[data-testid="friend-row-${companionPlayerId}"]`)
    if (await friend.count()) await friend.click()
  }
  await page.evaluate(() => {
    const nav = document.querySelector('.floating-bottom-nav')
    if (nav) nav.style.pointerEvents = 'none'
  })
  const friendsCont = page.locator('[data-testid="friends-continue"]')
  await friendsCont.scrollIntoViewIfNeeded()
  await friendsCont.click({ force: true })

  await page.waitForSelector('[data-testid="wizard-photo-step"]')
  await page.fill('[data-testid="caption-input"]', caption)
  if (withPhoto) {
    await page.locator('[data-testid="photo-upload-input"]').setInputFiles(withPhoto)
    await acceptPhotoFraming(page)
    await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 45000 })
  }
  await page.locator('[data-testid="photo-continue"]').click({ force: true })

  await page.waitForSelector('[data-testid="wizard-review-step"]')
  await page.waitForSelector('[data-testid="submit-drink"]:not([disabled])', { timeout: 25000 })
  await page.locator('[data-testid="submit-drink"]').click({ force: true })

  const unclaimed = page.locator('[data-testid="modal-unclaimed"]')
  if (await unclaimed.isVisible().catch(() => false)) {
    await page.click('[data-testid="modal-primary"]')
  }

  await page.waitForURL(/\/drinkit\/gallery/, { timeout: 45000 })
}

/** Advance drink step preferring a listed offering over generics/unlisted. */
export async function pickDrinkOffering(page) {
  await page.waitForSelector('[data-testid="wizard-drink-step"]', { timeout: 20000 })
  const listed = page.locator('[data-testid^="drink-row-"]').first()
  if (await listed.count()) {
    await listed.click()
    return 'listed'
  }
  await page.click('[data-testid="drink-generic-beer"]')
  return 'generic-beer'
}

/**
 * Finish log wizard from whatever step bounty prefill landed on
 * (cocktail/ingredient claims often skip bar+drink → friends).
 */
export async function advanceLogWizardToReview(page, caption = 'QA2A bounty claim') {
  await page.waitForSelector('[data-testid="log-wizard"]', { timeout: 20000 })
  await page.evaluate(() => {
    const nav = document.querySelector('.floating-bottom-nav')
    if (nav) nav.style.pointerEvents = 'none'
  })

  const from = new URL(page.url()).searchParams.get('from') || ''
  const prefilledClaim = ['cocktail', 'ingredient', 'bar'].includes(from)

  // Prefill applies asynchronously after mount — wait for the intended step so we
  // do not click a random bar and derail cocktail/ingredient claim deep links.
  if (prefilledClaim) {
    await page
      .waitForSelector(
        '[data-testid="wizard-friends-step"], [data-testid="wizard-drink-step"], [data-testid="wizard-photo-step"], [data-testid="wizard-review-step"]',
        { timeout: 20000 },
      )
      .catch(() => {})
  }

  for (let guard = 0; guard < 8; guard++) {
    if (await page.locator('[data-testid="wizard-review-step"]').count()) return

    if (!prefilledClaim && (await page.locator('[data-testid="bar-list"]').count())) {
      await page.locator('[data-testid^="bar-row-"]').first().click()
      await page.waitForTimeout(400)
      continue
    }
    if (await page.locator('[data-testid="wizard-drink-step"]').count()) {
      await pickDrinkOffering(page)
      await page.waitForTimeout(400)
      continue
    }
    if (await page.locator('[data-testid="wizard-friends-step"]').count()) {
      const cont = page.locator('[data-testid="friends-continue"]')
      // Friend roster can be extremely long; jump to the continue control.
      await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="friends-continue"]')
        btn?.scrollIntoView({ block: 'center' })
      })
      await cont.click({ force: true })
      await page.waitForTimeout(600)
      continue
    }
    if (await page.locator('[data-testid="wizard-photo-step"]').count()) {
      const captionInput = page.locator('[data-testid="caption-input"]')
      if (await captionInput.count()) await captionInput.fill(caption)
      await page.locator('[data-testid="photo-continue"]').click({ force: true })
      await page.waitForTimeout(600)
      continue
    }
    // Prefill still settling on bar flash — wait rather than clicking.
    if (prefilledClaim && (await page.locator('[data-testid="bar-list"]').count())) {
      await page.waitForTimeout(500)
      continue
    }
    break
  }
  await page.waitForSelector('[data-testid="wizard-review-step"]', { timeout: 25000 })
}

/**
 * Ship It scavenger: first open challenge → photo → submit.
 */
export async function completeScavengerSubmit(page, fixturePath, caption = 'QA2A shipit') {
  await page.waitForSelector('[data-testid="shipit-challenge-list"]', { timeout: 20000 })
  const openCard = page.locator('[data-testid^="shipit-challenge-"][data-completed="false"]').first()
  await openCard.click()
  await page.waitForSelector('[data-testid="scavenger-submit-page"]')
  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixturePath)
  await acceptPhotoFraming(page)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 45000 })
  const cap = page.locator('[data-testid="scavenger-caption"]')
  if (await cap.count()) await cap.fill(caption)
  await page.click('[data-testid="scavenger-continue-review"]')
  await page.waitForSelector('[data-testid="scavenger-review-step"]')
  await page.click('[data-testid="scavenger-submit"]')
  await page.waitForURL(/\/shipit\/(gallery|challenges)/, { timeout: 60000 })
}
