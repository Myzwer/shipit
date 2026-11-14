/**
 * Tuesday / Midgame visual QA audit harness (resilient, section-isolated).
 * Non-destructive. Does not change Ship Clock / DB / lifecycle.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const BASE = process.env.QA_BASE_URL || 'http://localhost:5173'
const OUT = 'docs/qa/tuesday-midgame'
const SHOTS = join(OUT, 'screenshots')
const PRIMARY = { width: 402, height: 874 }
const WIDTHS = [360, 390, 402, 430]

mkdirSync(SHOTS, { recursive: true })
mkdirSync(join(OUT, 'evidence'), { recursive: true })

const password = (
  process.env.LOCAL_TEST_PASSWORD ||
  (existsSync('.local/runtime-qual-password.txt')
    ? readFileSync('.local/runtime-qual-password.txt', 'utf8')
    : '')
).trim()
if (!password) {
  console.error('Missing password')
  process.exit(1)
}

const findings = []
const coverage = []
const layoutIssues = []
const consoleErrors = []

function note(area, status, detail = '') {
  coverage.push({ area, status, detail, at: new Date().toISOString() })
  console.log(`[${status}] ${area}${detail ? ` — ${detail}` : ''}`)
}

function defect(partial) {
  const id = `TMG-${String(findings.length + 1).padStart(3, '0')}`
  findings.push({ id, ...partial })
  console.warn(`DEFECT ${id}: ${partial.summary}`)
}

async function shot(page, name, { fullPage = false } = {}) {
  const path = join(SHOTS, `${name}.png`)
  await page.screenshot({ path, fullPage })
  return path
}

async function login(page, displayName) {
  await page.goto(`${BASE}/login?redirect=/`, { waitUntil: 'networkidle' })
  await page.locator('#login-name').selectOption({ label: displayName })
  await page.locator('#login-password').fill(password)
  await page.locator('button[type=submit]').click()
  await page.waitForURL((u) => !new URL(u).pathname.endsWith('/login'), { timeout: 25000 })
  await page.waitForTimeout(600)
}

async function freshLogin(context, page, displayName) {
  await context.clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await login(page, displayName)
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    const overflowX = Math.max(doc.scrollWidth, body.scrollWidth) - window.innerWidth
    const nestedScrollers = []
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el)
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) {
        if (el === document.documentElement || el === document.body) continue
        nestedScrollers.push({
          tag: el.tagName.toLowerCase(),
          testid: el.getAttribute('data-testid') || '',
          cls: String(el.className || '').slice(0, 80),
          scrollH: el.scrollHeight,
          clientH: el.clientHeight,
        })
      }
    }
    return { overflowX, nestedScrollers: nestedScrollers.slice(0, 15) }
  })
}

async function navClearance(page) {
  return page.evaluate(() => {
    const nav =
      document.querySelector('[data-testid=floating-bottom-nav]') ||
      document.querySelector('nav[aria-label*="navigation" i]')
    if (!nav) return { navFound: false }
    const navRect = nav.getBoundingClientRect()
    const scrollEl = document.scrollingElement || document.documentElement
    const maxScroll = scrollEl.scrollHeight - window.innerHeight
    scrollEl.scrollTop = maxScroll
    const after = nav.getBoundingClientRect()
    // Sample last content-ish nodes above nav
    const candidates = [...document.querySelectorAll('main li, main article, main section, [data-testid]')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.height > 20 && r.width > 40)
    const lowest = candidates.reduce((m, r) => Math.max(m, r.bottom), 0)
    return {
      navFound: true,
      navTop: after.top,
      maxScroll,
      lowestContentBottom: lowest,
      contentClearsNavWhenScrolled: lowest <= after.top + 8,
    }
  })
}

async function checkLayout(page, label) {
  const overflow = await measureOverflow(page)
  const clearance = await navClearance(page)
  layoutIssues.push({ label, ...overflow, clearance })
  if (overflow.overflowX > 2) {
    defect({
      game: label.includes('ship') ? 'shipit' : label.includes('drink') ? 'drinkit' : 'shared',
      screen: label,
      severity: 'P1',
      summary: `Horizontal overflow ${overflow.overflowX}px at ${label}`,
      expected: 'No horizontal overflow',
      actual: `overflowX=${overflow.overflowX}`,
      fixed: false,
      backend: false,
      evidence: null,
    })
  }
  return { overflow, clearance }
}

async function section(name, fn) {
  try {
    await fn()
  } catch (err) {
    note(name, 'failed', err.message.slice(0, 180))
    defect({
      game: 'shared',
      screen: name,
      severity: 'P2',
      summary: `Section harness error: ${err.message.slice(0, 160)}`,
      expected: 'Section completes',
      actual: String(err.message).slice(0, 300),
      fixed: false,
      backend: false,
    })
    await shot(page, `zz-section-fail-${name.replace(/[^a-z0-9-]/gi, '_').slice(0, 40)}`).catch(() => {})
  }
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: PRIMARY,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()
page.setDefaultTimeout(15000)
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(String(e)))

await section('auth.katie', async () => {
  await login(page, 'Katie')
  await shot(page, '00-post-login-landing')
  note('auth.login.katie', 'inspected', page.url())
})

await section('shared.game-selection', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await shot(page, '01-game-selection-402')
  await checkLayout(page, 'game-selection')
  note('shared.game-selection', 'inspected')
})

await section('drinkit.home', async () => {
  await page.goto(`${BASE}/drinkit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await shot(page, 'di-01-home-402')
  const status = await page.locator('[data-testid=home-board-note]').getAttribute('data-board-status').catch(() => null)
  const phase = await page.locator('[data-testid=home-board-note]').getAttribute('data-board-phase').catch(() => null)
  const err = await page.locator('[data-testid=home-bounty-error]').count()
  const body = await page.locator('body').innerText()
  if (err || /Couldn't Load Game Data/i.test(body)) {
    defect({
      game: 'drinkit',
      screen: 'home',
      severity: 'P0',
      summary: 'Home board failed to load',
      expected: 'Ready bounty board',
      actual: 'Load error',
      evidence: 'di-01-home-402.png',
      fixed: false,
      backend: true,
    })
  }
  note('drinkit.home', 'inspected', `status=${status} phase=${phase}`)

  const cards = await page.locator('[data-testid^=bounty-card], [data-testid=bounty-card]').count()
  note('drinkit.home.carousel', cards > 0 ? 'inspected' : 'failed', `cards=${cards}`)

  // Daily Challenge card probe
  const dailyCard = page.locator('[data-testid*=daily], [data-testid*=Daily]').first()
  note('drinkit.home.daily-card', (await dailyCard.count()) ? 'inspected' : 'inspected', 'probe')

  // Game switch
  const sw = page.locator('[data-testid=switch-game]')
  const swCount = await sw.count()
  note('drinkit.nav.game-switch', swCount > 0 ? 'passed' : 'failed', `count=${swCount}`)
  if (swCount === 0) {
    defect({
      game: 'drinkit',
      screen: 'home',
      severity: 'P1',
      summary: 'Dual-game switch control missing on Drink It Home',
      expected: 'switch-game control visible for dual-game player',
      actual: 'Not found',
      evidence: 'di-01-home-402.png',
      fixed: false,
      backend: false,
    })
  }

  // Ship Time general display (should not be general clock)
  if (/Ship Time/i.test(body) && !/overnight/i.test(body)) {
    // May be countdown labels — only flag obvious "Ship Time: HH:MM" general row
    if (/Ship Time\s*[:\-]/i.test(body) || /Day\s+\d+\s*·\s*Ship/i.test(body)) {
      defect({
        game: 'drinkit',
        screen: 'home',
        severity: 'P2',
        summary: 'Unexpected general Ship Time display on player home',
        expected: 'No general Ship Time row on player surfaces',
        actual: 'Ship Time-like text present',
        evidence: 'di-01-home-402.png',
        fixed: false,
        backend: false,
      })
    }
  }

  // Accordion: Leaderboard already often open — scroll + How to Play + Account
  await page.evaluate(() => window.scrollTo(0, 400))
  await shot(page, 'di-02-leaderboard-402')
  const how = page.getByRole('button', { name: /how to play/i }).first()
  if (await how.count()) {
    await how.click()
    await page.waitForTimeout(500)
    await page.locator('text=/how to play/i').first().scrollIntoViewIfNeeded().catch(() => {})
    await shot(page, 'di-03-how-to-play-402', { fullPage: true })
  }
  const acct = page.getByRole('button', { name: /^account$/i }).first()
  if (await acct.count()) {
    await acct.click()
    await page.waitForTimeout(400)
    await acct.scrollIntoViewIfNeeded()
    await shot(page, 'di-04-account-402')
  }
  note('drinkit.home.accordions', 'inspected')
  await checkLayout(page, 'drinkit-home')

  for (const w of WIDTHS.filter((x) => x !== 402)) {
    await page.setViewportSize({ width: w, height: 874 })
    await page.waitForTimeout(350)
    await shot(page, `di-01-home-${w}`)
    await checkLayout(page, `drinkit-home-${w}`)
  }
  await page.setViewportSize(PRIMARY)
})

await section('drinkit.log', async () => {
  await page.goto(`${BASE}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  await shot(page, 'di-10-log-bar-402')
  note('drinkit.log.bar', 'inspected')

  // Sort toggles
  const deck = page.locator('[data-testid=bar-sort-deck]')
  if (await deck.count()) {
    await deck.click()
    await page.waitForTimeout(400)
    await shot(page, 'di-10b-log-bar-deck-sort')
    await page.locator('[data-testid=bar-sort-alpha]').click()
    await page.waitForTimeout(300)
  }

  // Select first bar
  const bar = page.locator('[data-testid^=bar-row-]').first()
  if (!(await bar.count())) throw new Error('No bar rows')
  await bar.click()
  await page.waitForSelector('[data-testid=wizard-drink-step]', { timeout: 8000 })
  await page.waitForTimeout(400)
  await shot(page, 'di-11-log-drink-402')
  note('drinkit.log.drink', 'inspected')

  const search = page.locator('[data-testid=drink-search]')
  if (await search.count()) {
    await search.fill('mai')
    await page.waitForTimeout(400)
    await shot(page, 'di-11b-log-drink-search')
    await search.fill('')
    await page.waitForTimeout(300)
  }

  const drink = page.locator('[data-testid^=drink-row-]').first()
  if (!(await drink.count())) {
    // fallback generics
    const beer = page.locator('[data-testid=drink-generic-beer]')
    if (await beer.count()) await beer.click()
    else throw new Error('No drinks')
  } else {
    await drink.click()
  }
  await page.waitForSelector('[data-testid=wizard-friends-step]', { timeout: 8000 })
  await page.waitForTimeout(400)
  await shot(page, 'di-12-log-friends-402')
  note('drinkit.log.friends', 'inspected')

  // Crew indicators if present
  const crew = await page.locator('[data-testid=friends-crew-group], [data-testid=bar-bounty-reminder]').count()
  note('drinkit.log.crew', 'inspected', `crewUi=${crew}`)

  await page.locator('[data-testid=friends-continue]').click()
  await page.waitForSelector('[data-testid=wizard-photo-step]', { timeout: 8000 })
  await page.waitForTimeout(400)
  await shot(page, 'di-13-log-photo-402')
  note('drinkit.log.photo', 'inspected')

  // Optional photo — continue without
  await page.locator('[data-testid=photo-continue]').click()
  await page.waitForSelector('[data-testid=wizard-review-step]', { timeout: 8000 })
  await page.waitForTimeout(500)
  await shot(page, 'di-14-log-review-402')
  note('drinkit.log.review', 'inspected')
  await checkLayout(page, 'drinkit-log-review')

  // Back navigation
  await page.locator('[data-testid=wizard-back]').click()
  await page.waitForSelector('[data-testid=wizard-photo-step]', { timeout: 5000 })
  note('drinkit.log.back', 'passed')
  await page.locator('[data-testid=photo-continue]').click()
  await page.waitForSelector('[data-testid=wizard-review-step]', { timeout: 5000 })

  // Exit → Keep Editing
  await page.locator('[data-testid=wizard-exit]').click()
  await page.waitForTimeout(400)
  await shot(page, 'di-15-log-exit-dialog')
  const secondary = page.locator('[data-testid=modal-secondary]')
  const primary = page.locator('[data-testid=modal-primary]')
  // Keep Editing is typically secondary; Discard primary — click Keep
  if (await secondary.count()) {
    await secondary.click()
    await page.waitForTimeout(300)
    note('drinkit.log.keep-editing', 'passed')
  }

  // Exit → Discard (leave wizard without submit)
  await page.locator('[data-testid=wizard-exit]').click()
  await page.waitForTimeout(300)
  if (await primary.count()) {
    await primary.click()
    await page.waitForTimeout(600)
    note('drinkit.log.discard', 'passed', page.url())
  }
})

await section('drinkit.daily', async () => {
  await page.goto(`${BASE}/drinkit/daily`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)
  await shot(page, 'di-20-daily-details-402')
  await checkLayout(page, 'drinkit-daily')
  const title = await page.locator('[data-testid=daily-title]').textContent().catch(() => null)
  const err = await page.locator('[data-testid=daily-error]').textContent().catch(() => null)
  note('drinkit.daily.details', err ? 'failed' : 'inspected', title || err || '')

  const yes = page.locator('[data-testid=daily-confirm-yes]')
  if (await yes.count()) {
    await yes.click()
    await page.waitForTimeout(700)
    await shot(page, 'di-21-daily-photo-402')
    note('drinkit.daily.photo', 'inspected')
    // Exit without submitting
    const exit = page.locator('[data-testid=wizard-exit], [data-testid=daily-exit]').first()
    if (await exit.count()) {
      await exit.click()
      await page.waitForTimeout(300)
      const p = page.locator('[data-testid=modal-primary]')
      if (await p.count()) await p.click()
    } else {
      await page.goto(`${BASE}/drinkit`, { waitUntil: 'networkidle' })
    }
  } else {
    note('drinkit.daily.claim-cta', 'not-testable', 'confirm CTA absent (claimed/unavailable)')
  }
})

await section('drinkit.gallery', async () => {
  await page.goto(`${BASE}/drinkit/gallery`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await shot(page, 'di-30-gallery-everyone-402')
  await checkLayout(page, 'drinkit-gallery')
  note('drinkit.gallery', 'inspected')

  const mine = page.getByRole('button', { name: /my gallery/i }).first()
  if (await mine.count()) {
    await mine.click()
    await page.waitForTimeout(900)
    await shot(page, 'di-31-gallery-mine-402')
  }
  const everyone = page.getByRole('button', { name: /everyone/i }).first()
  if (await everyone.count()) {
    await everyone.click()
    await page.waitForTimeout(700)
  }

  // Show Achievements toggle
  const toggle = page.locator('[data-testid=gallery-show-achievements]').or(page.getByText(/show achievements/i))
  if (await toggle.count()) {
    await toggle.first().click()
    await page.waitForTimeout(900)
    await shot(page, 'di-32-gallery-achievements-on')
  }

  const text = await page.locator('body').innerText()
  if (/\bAchievement unlocked\b/i.test(text)) {
    defect({
      game: 'drinkit',
      screen: 'gallery',
      severity: 'P1',
      summary: 'Generic Achievement unlocked fallback visible',
      expected: 'Named achievement titles',
      actual: 'Generic fallback string present',
      evidence: 'di-32-gallery-achievements-on.png',
      fixed: false,
      backend: false,
    })
  } else {
    note('drinkit.gallery.achievement-names', 'passed')
  }

  const readMore = page.getByRole('button', { name: /read more/i }).first()
  if (await readMore.count()) {
    await readMore.click()
    await page.waitForTimeout(300)
    await shot(page, 'di-33-gallery-caption-expanded')
    const less = page.getByRole('button', { name: /show less/i }).first()
    if (await less.count()) await less.click()
    note('drinkit.gallery.caption', 'inspected')
  }

  // Reaction picker
  const reactOpen = page.locator('[data-testid^=reaction-trigger], [data-testid=reaction-button], button[aria-label*="React" i]').first()
  if (await reactOpen.count()) {
    await reactOpen.click()
    await page.waitForTimeout(400)
    await shot(page, 'di-34-gallery-reaction-picker')
    const emoji = page.locator('[data-testid^=reaction-option], [role=menu] button, [role=listbox] button').first()
    if (await emoji.count()) {
      await emoji.click()
      await page.waitForTimeout(700)
      await shot(page, 'di-34b-gallery-reaction-applied')
      note('drinkit.gallery.reactions', 'inspected')
    }
  }

  // Photo viewer
  const img = page.locator('img[src*="game-photos"], [data-testid=gallery-photo] img, article img').first()
  if (await img.count()) {
    await img.click()
    await page.waitForTimeout(700)
    await shot(page, 'di-35-gallery-viewer')
    note('drinkit.gallery.viewer', 'inspected')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(1200)
  await shot(page, 'di-36-gallery-end')
  note('drinkit.gallery.pagination', 'inspected')
})

await section('drinkit.achievements', async () => {
  await page.goto(`${BASE}/drinkit/achievements`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await shot(page, 'di-40-achievements-my-402')
  await checkLayout(page, 'drinkit-achievements')
  note('drinkit.achievements.my', 'inspected')

  const all = page.getByRole('button', { name: /all achievements/i }).first()
  if (await all.count()) {
    await all.click()
    await page.waitForTimeout(800)
    await shot(page, 'di-41-achievements-all-402')
    note('drinkit.achievements.all', 'inspected')
  }

  const showcase = page.locator('[data-testid=just-unlocked], section:has-text("Just Unlocked")').first()
  if (await showcase.count()) {
    await showcase.scrollIntoViewIfNeeded()
    await shot(page, 'di-43-just-unlocked')
    const bodyBg = await showcase.evaluate((el) => {
      const body = el.querySelector('[data-testid=just-unlocked-body], .just-unlocked-body') || el
      return getComputedStyle(body).backgroundColor
    })
    note('drinkit.achievements.just-unlocked', 'inspected', `bg=${bodyBg}`)
  } else {
    note('drinkit.achievements.just-unlocked', 'not-testable', 'no showcase for Katie currently')
  }

  // Title text-transform
  const titleCss = await page.evaluate(() => {
    const el =
      document.querySelector('[data-testid=achievement-title]') ||
      document.querySelector('.achievement-title') ||
      [...document.querySelectorAll('h3,h4')].find((n) => (n.textContent || '').length > 3)
    if (!el) return null
    return { text: el.textContent.trim().slice(0, 50), transform: getComputedStyle(el).textTransform }
  })
  note('drinkit.achievements.title-css', 'inspected', JSON.stringify(titleCss))

  // Gauntlet section scroll
  const gauntlet = page.getByText(/gauntlet/i).first()
  if (await gauntlet.count()) {
    await gauntlet.scrollIntoViewIfNeeded()
    await shot(page, 'di-44-gauntlets')
    note('drinkit.achievements.gauntlets', 'inspected')
  }
})

await section('shipit.home', async () => {
  await page.goto(`${BASE}/shipit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await shot(page, 'si-01-home-402')
  await checkLayout(page, 'shipit-home')
  note('shipit.home', 'inspected')

  const sw = await page.locator('[data-testid=switch-game]').count()
  note('shipit.nav.game-switch', sw > 0 ? 'passed' : 'failed', `count=${sw}`)

  await page.evaluate(() => window.scrollTo(0, 500))
  await shot(page, 'si-02-leaderboard-402')
  const how = page.getByRole('button', { name: /how to play/i }).first()
  if (await how.count()) {
    await how.click()
    await page.waitForTimeout(400)
    await shot(page, 'si-03-how-to-play-402', { fullPage: true })
  }
  const acct = page.getByRole('button', { name: /^account$/i }).first()
  if (await acct.count()) {
    await acct.click()
    await page.waitForTimeout(300)
    await shot(page, 'si-04-account-402')
  }

  for (const w of [360, 430]) {
    await page.setViewportSize({ width: w, height: 874 })
    await page.waitForTimeout(350)
    await shot(page, `si-01-home-${w}`)
    await checkLayout(page, `shipit-home-${w}`)
  }
  await page.setViewportSize(PRIMARY)
})

await section('shipit.challenges', async () => {
  await page.goto(`${BASE}/shipit/challenges`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)
  await shot(page, 'si-10-challenges-402')
  await checkLayout(page, 'shipit-challenges')
  note('shipit.challenges', 'inspected')

  const sel = page.locator('[data-testid=challenge-category-filter], select').first()
  if (await sel.count()) {
    const labels = await sel.locator('option').allTextContents()
    note('shipit.challenges.categories', 'inspected', labels.join(' | '))
    const options = await sel.locator('option').elementHandles()
    for (let i = 0; i < Math.min(options.length, 6); i++) {
      const val = await options[i].getAttribute('value')
      await sel.selectOption(val ?? { index: i })
      await page.waitForTimeout(450)
      await shot(page, `si-11-challenges-filter-${i}`)
    }
  }

  // Open first incomplete challenge
  const link = page.locator('a[href*="/shipit/challenges/"]').first()
  if (await link.count()) {
    await link.click()
    await page.waitForTimeout(1000)
    await shot(page, 'si-20-submit-upload-402')
    note('shipit.submit.upload', 'inspected', page.url())
    await checkLayout(page, 'shipit-submit')

    // Required photo validation
    const cont = page.locator('[data-testid=photo-continue], [data-testid=submit-continue], button:has-text("Continue")').first()
    if (await cont.count()) {
      const disabled = await cont.isDisabled().catch(() => false)
      if (!disabled) {
        await cont.click()
        await page.waitForTimeout(400)
      }
      await shot(page, 'si-21-submit-photo-gate')
      note('shipit.submit.photo-required', disabled ? 'passed' : 'inspected', `disabled=${disabled}`)
    }

    const exit = page.locator('[data-testid=wizard-exit]').first()
    if (await exit.count()) {
      await exit.click()
      await page.waitForTimeout(300)
      const p = page.locator('[data-testid=modal-primary]')
      if (await p.count()) await p.click()
      else await page.goto(`${BASE}/shipit/challenges`, { waitUntil: 'networkidle' })
    }
  } else {
    note('shipit.submit', 'not-testable', 'no challenge link')
  }
})

await section('shipit.gallery', async () => {
  await page.goto(`${BASE}/shipit/gallery`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await shot(page, 'si-30-gallery-402')
  await checkLayout(page, 'shipit-gallery')
  note('shipit.gallery', 'inspected')

  const team = page.getByRole('button', { name: /my team/i }).first()
  if (await team.count()) {
    await team.click()
    await page.waitForTimeout(800)
    await shot(page, 'si-31-gallery-my-team')
  }

  const toggle = page.locator('[data-testid=gallery-show-achievements]').or(page.getByText(/show achievements/i))
  if (await toggle.count()) {
    await toggle.first().click()
    await page.waitForTimeout(800)
    await shot(page, 'si-32-gallery-achievements')
  }

  const text = await page.locator('body').innerText()
  if (/\bAchievement unlocked\b/i.test(text)) {
    defect({
      game: 'shipit',
      screen: 'gallery',
      severity: 'P1',
      summary: 'Generic Achievement unlocked fallback visible',
      expected: 'Named achievement titles',
      actual: 'Generic fallback string present',
      evidence: 'si-32-gallery-achievements.png',
      fixed: false,
      backend: false,
    })
  } else {
    note('shipit.gallery.achievement-names', 'passed')
  }

  const react = page.locator('[data-testid^=reaction-trigger], button[aria-label*="React" i]').first()
  if (await react.count()) {
    await react.click()
    await page.waitForTimeout(400)
    const opt = page.locator('[data-testid^=reaction-option]').first()
    if (await opt.count()) {
      await opt.click()
      await page.waitForTimeout(800)
      await shot(page, 'si-33-gallery-reaction')
      const after = await page.locator('body').innerText()
      if (/session expired|sign in again|unauthorized|401/i.test(after)) {
        defect({
          game: 'shipit',
          screen: 'gallery',
          severity: 'P1',
          summary: 'Reaction hit auth expiration UI on valid session',
          expected: 'Reaction succeeds',
          actual: 'Auth error copy after reaction',
          evidence: 'si-33-gallery-reaction.png',
          fixed: false,
          backend: true,
        })
      } else {
        note('shipit.gallery.reactions', 'passed')
      }
    }
  }
})

await section('shipit.achievements', async () => {
  await page.goto(`${BASE}/shipit/achievements`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await shot(page, 'si-40-achievements-402')
  await checkLayout(page, 'shipit-achievements')
  note('shipit.achievements', 'inspected')
  const all = page.getByRole('button', { name: /all achievements/i }).first()
  if (await all.count()) {
    await all.click()
    await page.waitForTimeout(700)
    await shot(page, 'si-41-achievements-all')
  }
  const showcase = page.locator('[data-testid=just-unlocked], section:has-text("Just Unlocked")').first()
  if (await showcase.count()) {
    await showcase.scrollIntoViewIfNeeded()
    await shot(page, 'si-42-just-unlocked')
  }
})

await section('access.ship-only', async () => {
  await freshLogin(context, page, 'Triss')
  await shot(page, 'shiponly-01-landing')
  note('access.ship-only.landing', 'inspected', page.url())
  await page.goto(`${BASE}/drinkit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await shot(page, 'shiponly-02-drinkit-attempt')
  const denied =
    page.url().includes('access-denied') ||
    /access|denied|not allowed|no longer/i.test(await page.locator('body').innerText())
  note('access.ship-only.drink-blocked', denied ? 'passed' : 'failed', page.url())
  if (!denied) {
    defect({
      game: 'drinkit',
      screen: 'access',
      severity: 'P0',
      summary: 'Ship-only player reached Drink It surfaces',
      expected: 'Access denied / redirect',
      actual: page.url(),
      evidence: 'shiponly-02-drinkit-attempt.png',
      fixed: false,
      backend: true,
    })
  }
  // Switch control should be absent
  await page.goto(`${BASE}/shipit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const sw = await page.locator('[data-testid=switch-game]').count()
  note('access.ship-only.no-switch', sw === 0 ? 'passed' : 'failed', `switch=${sw}`)
  await shot(page, 'shiponly-03-shipit-home')
})

await section('access.admin-dual', async () => {
  await freshLogin(context, page, 'Josh')
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await shot(page, 'admin-02-game-selection')
  note('access.admin.game-selection', 'inspected')
})

await browser.close()

const report = {
  captured_at: new Date().toISOString(),
  viewport_primary: PRIMARY,
  widths_tested: WIDTHS,
  device: 'Playwright Chromium mobile emulation — real Safari unverified',
  coverage,
  findings,
  layoutIssues,
  consoleErrors: consoleErrors.slice(0, 80),
}
writeFileSync(join(OUT, 'evidence', 'audit-raw.json'), JSON.stringify(report, null, 2))
console.log('\n=== AUDIT SUMMARY ===')
console.log(`coverage: ${coverage.length}`)
console.log(`findings: ${findings.length}`)
console.log(`layout: ${layoutIssues.length}`)
console.log(`consoleErrors: ${consoleErrors.length}`)
for (const f of findings) console.log(` - ${f.id} [${f.severity}] ${f.summary}`)
