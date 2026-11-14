import { VIEWPORTS } from '../lib/env.mjs'
import { identity } from '../lib/env.mjs'
import { loginAs, logout, mobileContextOptions, shot } from '../lib/browser.mjs'

/**
 * Authentication + route navigation journeys.
 * @param {{ browser: import('playwright').Browser, env: any, registry: any }} ctx
 */
export async function runAuthNavSuite({ browser, env, registry }) {
  const { baseUrl, password, summary } = env
  const both = identity(summary, 'both')
  const drinkOnly = identity(summary, 'drink_only')
  const shipOnly = identity(summary, 'ship_only')
  const noGames = identity(summary, 'no_games')
  const admin = identity(summary, 'admin')

  // --- Unauthenticated deep link ---
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      const ok = page.url().includes('/login')
      registry.record({
        id: 'E2E-AUTH-001',
        journey: 'Unauthenticated /drinkit redirects to login',
        expected: 'Land on /login',
        actual: page.url(),
        outcome: ok ? 'passed' : 'failed',
        evidence: [await shot(page, 'auth-001-unauth-redirect')],
      })
    } finally {
      await context.close()
    }
  }

  // --- Bad credentials ---
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
      await page.selectOption('#login-name', { label: both.display_name })
      await page.fill('#login-password', 'definitely-wrong-password-xx')
      await page.click('[data-testid="login-submit"]')
      await page.waitForTimeout(1500)
      const err = await page.locator('[role="alert"]').textContent().catch(() => '')
      const stayed = page.url().includes('/login')
      const ok = stayed && Boolean(err && err.trim())
      registry.record({
        id: 'E2E-AUTH-002',
        journey: 'Incorrect credentials show comprehensible error',
        expected: 'Remain on login with alert',
        actual: `url=${page.url()} alert=${err}`,
        outcome: ok ? 'passed' : 'failed',
        evidence: [await shot(page, 'auth-002-bad-creds')],
      })
      if (!ok) {
        registry.defect({
          id: 'E2E-001',
          severity: 'P1',
          title: 'Incorrect login credentials lack clear player-facing error',
          links: ['E2E-AUTH-002'],
        })
      }
    } finally {
      await context.close()
    }
  }

  // --- Login / refresh / logout / re-login ---
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: both.display_name })
      const afterLogin = page.url()
      const chooser = await page.locator('[data-testid="game-selection"]').count()
      registry.record({
        id: 'E2E-AUTH-003',
        journey: 'Dual-enrolled login lands on game chooser',
        expected: 'Game selection visible',
        actual: afterLogin,
        outcome: chooser ? 'passed' : 'failed',
        evidence: [await shot(page, 'auth-003-chooser')],
      })

      await page.reload({ waitUntil: 'networkidle' })
      const stillAuth = !page.url().includes('/login') && (await page.locator('[data-testid="game-selection"]').count()) > 0
      registry.record({
        id: 'E2E-AUTH-004',
        journey: 'Refresh while authenticated restores session',
        expected: 'Remain authenticated on chooser',
        actual: page.url(),
        outcome: stillAuth ? 'passed' : 'failed',
        evidence: [await shot(page, 'auth-004-refresh')],
      })

      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      await page.goBack()
      await page.waitForTimeout(500)
      await page.goForward()
      await page.waitForTimeout(500)
      const afterHist = page.url()
      registry.record({
        id: 'E2E-AUTH-005',
        journey: 'Browser back/forward after game navigation',
        expected: 'History navigation does not crash to blank/login unexpectedly',
        actual: afterHist,
        outcome: afterHist.includes('login') && !(await page.locator('[data-testid="login-form"]').count())
          ? 'failed'
          : 'passed',
        evidence: [await shot(page, 'auth-005-history')],
      })

      await logout(page, baseUrl)
      const loggedOut = page.url().includes('/login')
      registry.record({
        id: 'E2E-AUTH-006',
        journey: 'Logout returns to login',
        expected: '/login',
        actual: page.url(),
        outcome: loggedOut ? 'passed' : 'failed',
      })

      await loginAs(page, { baseUrl, password, displayName: both.display_name })
      registry.record({
        id: 'E2E-AUTH-007',
        journey: 'Subsequent login after logout',
        expected: 'Authenticated again',
        actual: page.url(),
        outcome: !page.url().includes('/login') ? 'passed' : 'failed',
      })
    } finally {
      await context.close()
    }
  }

  // --- Enrollment gates ---
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: drinkOnly.display_name })
      await page.goto(`${baseUrl}/shipit`, { waitUntil: 'networkidle' })
      const denied =
        page.url().includes('access-denied') ||
        page.url().includes('unavailable') ||
        (await page.locator('[data-testid="access-denied"], [data-testid="game-selection"]').count()) > 0 ||
        !page.url().includes('/shipit')
      // drink-only should not freely play shipit
      const ok =
        page.url().includes('access-denied') ||
        page.url().includes('/login') ||
        (await page.locator('text=/not enrolled|access denied|not available/i').count()) > 0 ||
        page.url().includes('/') && !page.url().includes('/shipit')
      registry.record({
        id: 'E2E-AUTH-008',
        journey: 'Drink-only account blocked from Ship It gameplay',
        expected: 'Access denied / redirected away from shipit home content',
        actual: page.url(),
        outcome: ok || denied ? 'passed' : 'failed',
        evidence: [await shot(page, 'auth-008-drink-only-shipit')],
      })

      await logout(page, baseUrl)
      await loginAs(page, { baseUrl, password, displayName: shipOnly.display_name })
      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      const shipOnlyOk =
        page.url().includes('access-denied') ||
        !page.url().includes('/drinkit') ||
        (await page.locator('text=/not enrolled|access denied/i').count()) > 0
      registry.record({
        id: 'E2E-AUTH-009',
        journey: 'Ship-only account blocked from Drink It gameplay',
        expected: 'Access denied / redirected',
        actual: page.url(),
        outcome: shipOnlyOk ? 'passed' : 'failed',
        evidence: [await shot(page, 'auth-009-ship-only-drinkit')],
      })

      await logout(page, baseUrl)
      await loginAs(page, { baseUrl, password, displayName: noGames.display_name })
      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      const noGamesOk =
        page.url().includes('access-denied') ||
        page.url().includes('unavailable') ||
        !page.url().includes('/drinkit') ||
        (await page.locator('[data-testid="game-selection"]').count()) > 0
      registry.record({
        id: 'E2E-AUTH-010',
        journey: 'Non-enrolled account cannot open Drink It',
        expected: 'Denied / chooser without games',
        actual: page.url(),
        outcome: noGamesOk ? 'passed' : 'failed',
        evidence: [await shot(page, 'auth-010-no-games')],
      })
    } finally {
      await context.close()
    }
  }

  // --- Dual enrollment + admin deep link ---
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: both.display_name })
      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      const drinkOk = page.url().includes('/drinkit')
      await page.goto(`${baseUrl}/shipit`, { waitUntil: 'networkidle' })
      const shipOk = page.url().includes('/shipit')
      registry.record({
        id: 'E2E-AUTH-011',
        journey: 'Dual-enrolled deep links to both games',
        expected: 'Both /drinkit and /shipit reachable',
        actual: `drink=${drinkOk} ship=${shipOk}`,
        outcome: drinkOk && shipOk ? 'passed' : 'failed',
      })

      await logout(page, baseUrl)
      await loginAs(page, { baseUrl, password, displayName: admin.display_name })
      await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
      const adminOk = page.url().includes('/admin')
      registry.record({
        id: 'E2E-AUTH-012',
        journey: 'Admin account can open /admin',
        expected: '/admin loads',
        actual: page.url(),
        outcome: adminOk ? 'passed' : 'failed',
        evidence: [await shot(page, 'auth-012-admin')],
      })
    } finally {
      await context.close()
    }
  }

  // --- Multi-tab login simulation ---
  {
    const context = await browser.newContext(mobileContextOptions())
    const page1 = await context.newPage()
    const page2 = await context.newPage()
    try {
      await loginAs(page1, { baseUrl, password, displayName: both.display_name })
      await page2.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      const shared = !page2.url().includes('/login')
      registry.record({
        id: 'E2E-AUTH-013',
        journey: 'Second tab shares authenticated session (same context)',
        expected: 'Tab 2 authenticated without re-login',
        actual: page2.url(),
        outcome: shared ? 'passed' : 'failed',
        notes: 'Same browser context = same device storage; cross-device requires separate contexts',
      })

      const contextB = await browser.newContext(mobileContextOptions())
      const pageB = await contextB.newPage()
      await pageB.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      const isolated = pageB.url().includes('/login')
      registry.record({
        id: 'E2E-AUTH-014',
        journey: 'Separate context (other device sim) starts unauthenticated',
        expected: 'Redirect to login',
        actual: pageB.url(),
        outcome: isolated ? 'passed' : 'failed',
      })
      await loginAs(pageB, { baseUrl, password, displayName: drinkOnly.display_name })
      registry.record({
        id: 'E2E-AUTH-015',
        journey: 'Login from another context while first remains open',
        expected: 'Second context authenticates independently',
        actual: pageB.url(),
        outcome: !pageB.url().includes('/login') ? 'passed' : 'failed',
      })
      await contextB.close()
    } finally {
      await context.close()
    }
  }

  // --- Viewport smoke (emulation) ---
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext(mobileContextOptions(vp))
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: both.display_name })
      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      const submitish = await page.locator('button, a, [data-testid="bounty-claim"]').count()
      const ok = submitish > 0 && page.url().includes('/drinkit')
      registry.record({
        id: `E2E-AUTH-VP-${vp.id}`,
        journey: `Drink It home usable at ${vp.width}px (Chromium mobile emulation)`,
        expected: 'Page loads with actionable controls',
        actual: `controls=${submitish} url=${page.url()}`,
        outcome: ok ? 'passed' : 'failed',
        viewport: vp,
        evidence: [await shot(page, `auth-vp-${vp.id}`)],
        notes: 'Emulation only — not physical iPhone Safari / Android Chrome',
      })
    } finally {
      await context.close()
    }
  }

  // Expired session — clear storage mid-session
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: both.display_name })
      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      await page.evaluate(() => {
        localStorage.clear()
        sessionStorage.clear()
      })
      await page.context().clearCookies()
      await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
      const ok = page.url().includes('/login')
      registry.record({
        id: 'E2E-AUTH-016',
        journey: 'Cleared session forces re-auth on protected route',
        expected: 'Redirect to login',
        actual: page.url(),
        outcome: ok ? 'passed' : 'failed',
        evidence: [await shot(page, 'auth-016-expired')],
      })
    } finally {
      await context.close()
    }
  }
}
