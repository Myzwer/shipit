import { join } from 'node:path'
import { identity, ROOT } from '../lib/env.mjs'
import {
  acceptPhotoFraming,
  completeScavengerSubmit,
  loginAs,
  mobileContextOptions,
  shot,
} from '../lib/browser.mjs'

export async function runShipItSuite({ browser, env, registry }) {
  const { baseUrl, password, summary, service } = env
  const both = identity(summary, 'both')
  const shipOnly = identity(summary, 'ship_only')
  const drinkOnly = identity(summary, 'drink_only')
  const fixtureJpg = join(ROOT, 'tests/fixtures/tiny.jpg')
  const portrait = join(ROOT, 'tests/fixtures/portrait.jpg')

  // Reset scavenger test data for clean runs when RPC exists
  try {
    await service.rpc('dev_reset_scavenger_test_data')
  } catch {
    /* optional on some schemas */
  }

  // Challenge list + categories
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: both.display_name })
      await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
      await page.waitForSelector('[data-testid="shipit-challenge-list"]', { timeout: 20000 })
      const cards = await page.locator('[data-testid^="shipit-challenge-"]').count()
      const sections = await page.locator('[data-testid^="shipit-section-"]').count()
      registry.record({
        id: 'E2E-SI-001',
        journey: 'Challenge list loads with categories',
        expected: 'Multiple challenges visible across category sections',
        actual: `cards=${cards} sections=${sections}`,
        outcome: cards >= 5 && sections >= 1 ? 'passed' : 'failed',
        evidence: [await shot(page, 'si-001-list')],
      })
    } finally {
      await context.close()
    }
  }

  // Full submit journey
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: both.display_name })
      await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
      const openCard = page.locator('[data-testid^="shipit-challenge-"][data-completed="false"]').first()
      const key = await openCard.getAttribute('data-testid')
      await openCard.click()
      await page.waitForSelector('[data-testid="scavenger-submit-page"]')

      const cont = page.locator('[data-testid="scavenger-continue-review"]')
      const blocked = !(await cont.isEnabled())
      registry.record({
        id: 'E2E-SI-002',
        journey: 'Photo required before continue',
        expected: 'Continue disabled without photo',
        actual: `enabled=${await cont.isEnabled()}`,
        outcome: blocked ? 'passed' : 'failed',
      })

      await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
      await acceptPhotoFraming(page)
      await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 45000 })
      await page.fill('[data-testid="scavenger-caption"]', 'QA2A shipit caption')
      await cont.click()
      await page.waitForSelector('[data-testid="scavenger-review-step"]')
      registry.record({
        id: 'E2E-SI-003',
        journey: 'Review screen reflects selections',
        expected: 'Review step visible after photo',
        actual: 'review visible',
        outcome: 'passed',
        evidence: [await shot(page, 'si-003-review')],
      })

      await page.click('[data-testid="scavenger-submit"]')
      await page.waitForURL(/\/shipit\/(gallery|challenges)/, { timeout: 60000 })
      registry.record({
        id: 'E2E-SI-004',
        journey: 'Scavenger submit success',
        expected: 'Navigate to gallery or challenges with success',
        actual: page.url(),
        outcome: 'passed',
        evidence: [await shot(page, 'si-004-success')],
      })

      await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
      if (key) {
        const completed = page.locator(`[data-testid="${key}"][data-completed="true"]`)
        const ok = (await completed.count()) > 0
        registry.record({
          id: 'E2E-SI-005',
          journey: 'Completed challenge display after submit',
          expected: 'Challenge marked completed',
          actual: `key=${key} completed=${ok}`,
          outcome: ok ? 'passed' : 'failed',
          evidence: [await shot(page, 'si-005-completed')],
        })
      }

      // Duplicate attempt — completed cards are disabled; treat non-actionable as pass
      if (key) {
        const card = page.locator(`[data-testid="${key}"]`)
        const actionable = (await card.getAttribute('data-actionable')) === 'true'
        if (actionable) {
          await card.click()
          await page.waitForTimeout(1000)
        }
        const already =
          !actionable ||
          (await page.locator('[data-testid="scavenger-already-done"]').count()) > 0 ||
          (await page.locator('[data-testid="scavenger-finale-gate"]').count()) > 0
        registry.record({
          id: 'E2E-SI-006',
          journey: 'Duplicate challenge attempt blocked',
          expected: 'Already-done / non-actionable completed card',
          actual: `actionable=${actionable} already=${already} url=${page.url()}`,
          outcome: already ? 'passed' : 'failed',
          evidence: [await shot(page, 'si-006-dup')],
        })
      }
    } catch (e) {
      registry.record({
        id: 'E2E-SI-004b',
        journey: 'Scavenger submit success (catch)',
        expected: 'Submit works',
        actual: String(e),
        outcome: 'failed',
        evidence: [],
      })
      registry.defect({
        id: 'E2E-020',
        severity: 'P0',
        title: 'Ship It scavenger browser submit failed',
        links: ['E2E-SI-004b'],
        detail: String(e),
      })
    } finally {
      await context.close()
    }
  }

  // Teammate sees completion (same team: both + ship_only are Demo Team Alpha)
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: shipOnly.display_name })
      await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
      const completed = await page.locator('[data-testid^="shipit-challenge-"][data-completed="true"]').count()
      registry.record({
        id: 'E2E-SI-007',
        journey: 'Teammate sees team completion',
        expected: 'At least one completed challenge visible to teammate',
        actual: `completedVisible=${completed}`,
        outcome: completed >= 1 ? 'passed' : 'failed',
        evidence: [await shot(page, 'si-007-teammate')],
      })
    } finally {
      await context.close()
    }
  }

  // Wrong-game access
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: drinkOnly.display_name })
      await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
      const blocked =
        page.url().includes('access-denied') ||
        !(await page.locator('[data-testid="shipit-challenge-list"]').count())
      registry.record({
        id: 'E2E-SI-008',
        journey: 'Wrong-game access to Ship It challenges',
        expected: 'Denied / no challenge list',
        actual: page.url(),
        outcome: blocked ? 'passed' : 'failed',
      })
    } finally {
      await context.close()
    }
  }

  // Second challenge variant (portrait photo) — representative tier
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: both.display_name })
      await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
      await completeScavengerSubmit(page, portrait, 'QA2A portrait challenge')
      registry.record({
        id: 'E2E-SI-009',
        journey: 'Second challenge submit (portrait photo variant)',
        expected: 'Another open challenge completes',
        actual: page.url(),
        outcome: 'passed',
        evidence: [await shot(page, 'si-009-portrait')],
      })
    } catch (e) {
      registry.record({
        id: 'E2E-SI-009',
        journey: 'Second challenge submit (portrait photo variant)',
        expected: 'Completes',
        actual: String(e),
        outcome: 'failed',
      })
    } finally {
      await context.close()
    }
  }

  // Two teammates racing same challenge
  {
    const contextA = await browser.newContext(mobileContextOptions())
    const contextB = await browser.newContext(mobileContextOptions())
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()
    try {
      await loginAs(pageA, { baseUrl, password, displayName: both.display_name })
      await loginAs(pageB, { baseUrl, password, displayName: shipOnly.display_name })
      await pageA.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
      await pageB.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
      const openA = pageA.locator('[data-testid^="shipit-challenge-"][data-completed="false"]').first()
      const testId = await openA.getAttribute('data-testid')
      if (!testId) throw new Error('no open challenge')
      await openA.click()
      await pageB.locator(`[data-testid="${testId}"]`).click()
      await pageA.waitForSelector('[data-testid="scavenger-submit-page"]')
      await pageB.waitForSelector('[data-testid="scavenger-submit-page"]')

      async function stage(page) {
        await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixtureJpg)
        await acceptPhotoFraming(page)
        await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 45000 })
        await page.fill('[data-testid="scavenger-caption"]', 'race')
        await page.click('[data-testid="scavenger-continue-review"]')
        await page.waitForSelector('[data-testid="scavenger-review-step"]')
      }
      await stage(pageA)
      await stage(pageB)
      await Promise.all([
        pageA.click('[data-testid="scavenger-submit"]'),
        pageB.click('[data-testid="scavenger-submit"]'),
      ])
      await pageA.waitForTimeout(4000)
      await pageB.waitForTimeout(2000)

      // Count active completions for this challenge via service if possible
      const challengeKey = testId.replace('shipit-challenge-', '')
      const { count } = await service
        .from('scavenger_completions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('challenge_canonical_key', challengeKey)

      const ambiguousA = await pageA.locator('text=/error|failed|already/i').count()
      const ambiguousB = await pageB.locator('text=/error|failed|already/i').count()
      const ok = count === 1 || count === null
      registry.record({
        id: 'E2E-SI-010',
        journey: 'Two teammates submit same challenge nearly simultaneously',
        expected: 'Exactly one team completion; no ambiguous double success',
        actual: `dbCount=${count} urlA=${pageA.url()} urlB=${pageB.url()} alertsA=${ambiguousA} alertsB=${ambiguousB}`,
        outcome: count === 1 ? 'passed' : count != null && count > 1 ? 'failed' : 'blocked',
        evidence: [
          await shot(pageA, 'si-010-a'),
          await shot(pageB, 'si-010-b'),
        ],
      })
      if (count != null && count > 1) {
        registry.defect({
          id: 'E2E-021',
          severity: 'P0',
          title: 'Duplicate Ship It team score from concurrent teammate submits',
          links: ['E2E-SI-010', 'QA-SI-002'],
        })
      }
      void ok
    } catch (e) {
      registry.record({
        id: 'E2E-SI-010',
        journey: 'Two teammates submit same challenge nearly simultaneously',
        expected: 'Single completion',
        actual: String(e),
        outcome: 'failed',
      })
    } finally {
      await contextA.close()
      await contextB.close()
    }
  }

  // Standings update smoke
  {
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: both.display_name })
      await page.goto(`${baseUrl}/shipit`, { waitUntil: 'networkidle' })
      const lb = await page.locator('[data-testid="shipit-leaderboard"], [data-testid="leaderboard-list"]').count()
      registry.record({
        id: 'E2E-SI-011',
        journey: 'Ship It home standings visible after submissions',
        expected: 'Leaderboard section present',
        actual: `lb=${lb}`,
        outcome: lb > 0 ? 'passed' : 'failed',
        evidence: [await shot(page, 'si-011-standings')],
      })
    } finally {
      await context.close()
    }
  }

  // Friday cutoff — browser presentation (lifecycle suite deep-dives)
  registry.record({
    id: 'E2E-SI-012',
    journey: 'Friday 6PM cutoff browser behavior',
    expected: 'Covered in lifecycle suite E2E-LC-*',
    actual: 'delegated',
    outcome: 'not_run',
    notes: 'See LIFECYCLE_BROWSER_E2E.md',
  })
}
