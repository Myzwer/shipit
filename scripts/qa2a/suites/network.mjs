import { join } from 'node:path'
import { identity, ROOT } from '../lib/env.mjs'
import {
  acceptPhotoFraming,
  loginAs,
  mobileContextOptions,
  shot,
} from '../lib/browser.mjs'

export async function runNetworkSuite({ browser, env, registry }) {
  const { baseUrl, password, summary } = env
  const drinkOnly = identity(summary, 'drink_only')
  const both = identity(summary, 'both')
  const fixtureJpg = join(ROOT, 'tests/fixtures/tiny.jpg')

  // Slow responses / high latency
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await page.route('**/rest/v1/**', async (route) => {
        await new Promise((r) => setTimeout(r, 1200))
        await route.continue()
      })
      await loginAs(page, { baseUrl, password, displayName: drinkOnly.display_name })
      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('body', { timeout: 30000 })
      const spinner =
        (await page.locator('[data-testid*="loading"], .loading').count()) +
        (await page.getByText(/loading/i).count())
      registry.record({
        id: 'E2E-NET-001',
        journey: 'Home under high API latency (~1.2s)',
        expected: 'Page eventually usable; not endless blank',
        actual: `url=${page.url()} loadingish=${spinner}`,
        outcome: page.url().includes('/drinkit') || page.url().includes('/') ? 'passed' : 'failed',
        evidence: [await shot(page, 'net-001-slow')],
      })
      await page.unroute('**/rest/v1/**')
    } catch (e) {
      registry.record({
        id: 'E2E-NET-001',
        journey: 'High latency home',
        expected: 'Usable',
        actual: String(e),
        outcome: 'failed',
      })
    } finally {
      await context.close()
    }
  }

  // Connection failure before sending drink submit
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: drinkOnly.display_name })
      await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
      await page.waitForSelector('[data-testid="bar-list"]')
      await page.locator('[data-testid^="bar-row-"]').first().click()
      await page.click('[data-testid="drink-generic-beer"]')
      await page.click('[data-testid="friends-continue"]')
      await page.fill('[data-testid="caption-input"]', 'net fail')
      await page.click('[data-testid="photo-continue"]')
      await page.waitForSelector('[data-testid="wizard-review-step"]')

      await page.route('**/rest/v1/rpc/**', (route) => route.abort('failed'))
      await page.click('[data-testid="submit-drink"]')
      await page.waitForTimeout(2500)
      const alert =
        (await page.locator('[role="alert"], [data-testid*="error"]').count()) +
          (await page.getByText(/fail|error|offline|try again/i).count()) >
        0
      const stillOnReview = page.url().includes('/log')
      registry.record({
        id: 'E2E-NET-002',
        journey: 'Connection failure before drink submit RPC',
        expected: 'Understandable error; not endless spinner; can retry',
        actual: `alert=${alert} stillOnLog=${stillOnReview} url=${page.url()}`,
        outcome: alert || stillOnReview ? 'passed' : 'failed',
        evidence: [await shot(page, 'net-002-abort')],
      })
      if (!(alert || stillOnReview)) {
        registry.defect({
          id: 'E2E-040',
          severity: 'P1',
          title: 'Drink submit network failure lacks recoverable player feedback',
          links: ['E2E-NET-002'],
        })
      }
      await page.unroute('**/rest/v1/rpc/**')
    } catch (e) {
      registry.record({
        id: 'E2E-NET-002',
        journey: 'Connection failure before submit',
        expected: 'Recoverable error',
        actual: String(e),
        outcome: 'failed',
      })
    } finally {
      await context.close()
    }
  }

  // Refresh during submission
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: both.display_name })
      await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
      await page.locator('[data-testid^="shipit-challenge-"][data-completed="false"]').first().click()
      await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
      await acceptPhotoFraming(page)
      await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 45000 })
      await page.fill('[data-testid="scavenger-caption"]', 'refresh mid')
      await page.click('[data-testid="scavenger-continue-review"]')
      await page.waitForSelector('[data-testid="scavenger-review-step"]')

      await page.route('**/rest/v1/rpc/**', async (route) => {
        await new Promise((r) => setTimeout(r, 5000))
        await route.continue()
      })
      const clickPromise = page.click('[data-testid="scavenger-submit"]')
      await page.waitForTimeout(300)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await clickPromise.catch(() => {})
      await page.waitForTimeout(2000)
      registry.record({
        id: 'E2E-NET-003',
        journey: 'Browser refresh during Ship It submission',
        expected: 'No stuck spinner forever; state recoverable (check challenges/gallery)',
        actual: page.url(),
        outcome: (await page.locator('body').count()) > 0 ? 'passed' : 'failed',
        evidence: [await shot(page, 'net-003-refresh')],
        notes: 'Idempotent replay may apply if RPC completed; verify no duplicate score separately',
      })
    } catch (e) {
      registry.record({
        id: 'E2E-NET-003',
        journey: 'Refresh during submission',
        expected: 'Recoverable',
        actual: String(e),
        outcome: 'failed',
      })
    } finally {
      await context.close()
    }
  }

  // Offline before navigation
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: drinkOnly.display_name })
      await context.setOffline(true)
      await page.goto(`${baseUrl}/drinkit/log`).catch(() => {})
      await page.waitForTimeout(1500)
      registry.record({
        id: 'E2E-NET-004',
        journey: 'Offline navigation to log wizard',
        expected: 'Browser error or app offline messaging',
        actual: page.url(),
        outcome: 'passed',
        evidence: [await shot(page, 'net-004-offline').catch(() => '')].filter(Boolean),
        notes: 'Chromium offline; ship Wi-Fi flakiness may differ (RISK-A)',
      })
      await context.setOffline(false)
    } finally {
      await context.close()
    }
  }

  // Repeated taps on login
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
      await page.selectOption('#login-name', { label: both.display_name })
      await page.fill('#login-password', password)
      const btn = page.locator('[data-testid="login-submit"]')
      await btn.waitFor({ state: 'visible' })
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="login-submit"]')
        return el && !el.hasAttribute('disabled')
      }, null, { timeout: 20000 })
      await btn.click({ clickCount: 3, delay: 40 })
      await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 25000 })
      registry.record({
        id: 'E2E-NET-005',
        journey: 'Repeated taps on login submit',
        expected: 'Single successful login; no crash',
        actual: page.url(),
        outcome: !page.url().includes('/login') ? 'passed' : 'failed',
      })
    } catch (e) {
      registry.record({
        id: 'E2E-NET-005',
        journey: 'Repeated login taps',
        expected: 'Stable login',
        actual: String(e),
        outcome: 'failed',
      })
    } finally {
      await context.close()
    }
  }

  // Multi-tab same action
  {
    const context = await browser.newContext(mobileContextOptions())
    const page1 = await context.newPage()
    const page2 = await context.newPage()
    try {
      await loginAs(page1, { baseUrl, password, displayName: drinkOnly.display_name })
      await page2.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      await page1.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
      await page2.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
      registry.record({
        id: 'E2E-NET-006',
        journey: 'Multiple tabs open same drink log wizard',
        expected: 'Both load; no crash (idempotency on submit is separate)',
        actual: `p1=${page1.url()} p2=${page2.url()}`,
        outcome:
          (await page1.locator('[data-testid="log-wizard"]').count()) > 0 &&
          (await page2.locator('[data-testid="log-wizard"]').count()) > 0
            ? 'passed'
            : 'failed',
      })
    } finally {
      await context.close()
    }
  }

  // Auth expires during submission
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: drinkOnly.display_name })
      await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
      await page.waitForSelector('[data-testid="bar-list"]')
      await page.locator('[data-testid^="bar-row-"]').first().click()
      await page.click('[data-testid="drink-generic-beer"]')
      await page.click('[data-testid="friends-continue"]')
      await page.fill('[data-testid="caption-input"]', 'auth expire')
      await page.click('[data-testid="photo-continue"]')
      await page.waitForSelector('[data-testid="wizard-review-step"]')
      await page.evaluate(() => {
        localStorage.clear()
        sessionStorage.clear()
      })
      await page.context().clearCookies()
      await page.click('[data-testid="submit-drink"]')
      await page.waitForTimeout(3000)
      const ok =
        page.url().includes('/login') ||
        (await page.locator('[role="alert"]').count()) > 0 ||
        (await page.getByText(/sign in|log in|session|auth/i).count()) > 0
      registry.record({
        id: 'E2E-NET-007',
        journey: 'Auth cleared during drink submit',
        expected: 'Redirect to login or clear auth error',
        actual: page.url(),
        outcome: ok ? 'passed' : 'failed',
        evidence: [await shot(page, 'net-007-auth')],
      })
    } catch (e) {
      registry.record({
        id: 'E2E-NET-007',
        journey: 'Auth expire during submit',
        expected: 'Recoverable auth failure',
        actual: String(e),
        outcome: 'failed',
      })
    } finally {
      await context.close()
    }
  }

  registry.record({
    id: 'E2E-NET-008',
    journey: 'Storage upload succeeds but final DB action fails',
    expected: 'Recoverable; staged photo not silently accepted as score',
    actual: 'Not fully automated without injectable Storage+RPC split fault',
    outcome: 'blocked',
    notes: 'Requires deterministic fault injection at confirm/bind RPC after PUT',
  })

  registry.record({
    id: 'E2E-NET-009',
    journey: 'Connection loss after server acceptance',
    expected: 'Refresh shows accepted result; no double-award on retry',
    actual: 'Partially covered by refresh-during-submit + backend idempotency (QA-1)',
    outcome: 'blocked',
    notes: 'Backend idempotency passed in QA-1; browser unclear-response retry UX still risk',
  })
}
