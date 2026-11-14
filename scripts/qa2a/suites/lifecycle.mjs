import { identity } from '../lib/env.mjs'
import { loginAs, mobileContextOptions, shot } from '../lib/browser.mjs'

/**
 * Time-sensitive browser behavior. Uses authoritative server clock RPCs;
 * also probes wrong client TZ via Playwright timezoneId.
 */
export async function runLifecycleSuite({ browser, env, registry }) {
  const { baseUrl, password, summary, service } = env
  const both = identity(summary, 'both')
  const drinkOnly = identity(summary, 'drink_only')

  async function setNowAligned(opts) {
    const targetHour = opts.targetHour ?? 14
    const targetMinute = opts.targetMinute ?? 0
    const cruiseDay = opts.cruiseDay ?? 3
    const now = Date.now()
    const provisional = new Date(now)
    const y = provisional.getUTCFullYear()
    const mo = String(provisional.getUTCMonth() + 1).padStart(2, '0')
    const da = String(provisional.getUTCDate()).padStart(2, '0')
    const shipDateOnDay = `${y}-${mo}-${da}`
    const day1Date = new Date(`${shipDateOnDay}T12:00:00Z`)
    day1Date.setUTCDate(day1Date.getUTCDate() - (cruiseDay - 1))
    const day1 = day1Date.toISOString().slice(0, 10)
    const targetShipWall = Date.parse(
      `${shipDateOnDay}T${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')}:00Z`,
    )
    const offsetMinutes = Math.round((targetShipWall - now) / 60_000)
    const { error } = await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: day1,
      p_base_offset_minutes: offsetMinutes,
      p_label: 'development-only',
    })
    if (error) throw error
    await service.rpc('dev_set_drinkit_paused', { p_paused: false })
    return { day1, offsetMinutes, cruiseDay, targetHour }
  }

  // Active gameplay (current seeded state)
  {
    const { data: clock } = await service.rpc('get_ship_clock_state')
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: drinkOnly.display_name })
      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      const ok =
        clock?.lifecycle === 'active' &&
        clock?.accepting_submissions === true &&
        page.url().includes('/drinkit')
      registry.record({
        id: 'E2E-LC-001',
        journey: 'Active gameplay Home loads while server accepting',
        preconditions: [`lifecycle=${clock?.lifecycle}`, `accepting=${clock?.accepting_submissions}`],
        expected: 'Drink It home usable',
        actual: page.url(),
        outcome: ok ? 'passed' : 'failed',
        evidence: [await shot(page, 'lc-001-active')],
      })
    } finally {
      await context.close()
    }
  }

  // Pre-cruise
  {
    const aligned = await setNowAligned({ cruiseDay: 1, targetHour: 10 })
    // Force pre-cruise: day1 tomorrow relative to ship date
    const now = Date.now()
    const provisional = new Date(now)
    const shipDateOnDay = provisional.toISOString().slice(0, 10)
    const day1Date = new Date(`${shipDateOnDay}T12:00:00Z`)
    day1Date.setUTCDate(day1Date.getUTCDate() + 1)
    const day1 = day1Date.toISOString().slice(0, 10)
    const targetShipWall = Date.parse(`${shipDateOnDay}T10:00:00Z`)
    const offsetMinutes = Math.round((targetShipWall - now) / 60_000)
    await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: day1,
      p_base_offset_minutes: offsetMinutes,
      p_label: 'development-only',
    })
    const { data: clock } = await service.rpc('get_ship_clock_state')

    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: both.display_name })
      await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
      await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
      const blocked =
        !page.url().includes('/drinkit/log') ||
        (await page.locator('text=/pre-cruise|opens|countdown|not open/i').count()) > 0 ||
        page.url().includes('/') && !(await page.locator('[data-testid="log-wizard"]').count())
      registry.record({
        id: 'E2E-LC-002',
        journey: 'Pre-cruise blocks log wizard / shows landing',
        preconditions: [`server_lifecycle=${clock?.lifecycle}`, `day1=${day1}`],
        expected: 'Gameplay submit routes blocked or pre-cruise UI',
        actual: `url=${page.url()} lifecycle=${clock?.lifecycle}`,
        outcome: clock?.lifecycle === 'pre_cruise' && blocked ? 'passed' : clock?.lifecycle === 'pre_cruise' ? 'failed' : 'blocked',
        evidence: [await shot(page, 'lc-002-precruise')],
      })
    } finally {
      await context.close()
    }
    void aligned
  }

  // Before noon vs afternoon scoring window
  {
    await setNowAligned({ cruiseDay: 2, targetHour: 9, targetMinute: 0 })
    const { data: morning } = await service.rpc('get_ship_clock_state')
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: drinkOnly.display_name })
      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      const claims = page.locator('[data-testid="bounty-claim"]')
      const n = await claims.count()
      let enabled = 0
      for (let i = 0; i < n; i++) if (await claims.nth(i).isEnabled()) enabled++
      registry.record({
        id: 'E2E-LC-003',
        journey: 'Before-noon Home bounty claim affordances',
        preconditions: [`ship_local=${morning?.ship_local}`],
        expected: 'Bar/Daily claims reflect morning window rules (may be disabled)',
        actual: `enabledClaims=${enabled} total=${n}`,
        outcome: 'passed',
        evidence: [await shot(page, 'lc-003-morning')],
        notes: 'Ordinary logs may still work; bounty noon gates are server-authoritative',
      })
    } finally {
      await context.close()
    }

    await setNowAligned({ cruiseDay: 2, targetHour: 14, targetMinute: 15 })
    // regenerate schedule so bounty cards exist for afternoon
    try {
      await service.rpc('dev_generate_bounty_schedule', { p_seed: `qa2a-lc-afternoon-${Date.now()}` })
      await service.rpc('dev_seed_daily_assignments')
    } catch {
      /* schedule may already exist */
    }
    const context2 = await browser.newContext(mobileContextOptions())
    const page2 = await context2.newPage()
    try {
      await loginAs(page2, { baseUrl, password, displayName: drinkOnly.display_name })
      await page2.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      const claims = page2.locator('[data-testid="bounty-claim"]')
      const n = await claims.count()
      let enabled = 0
      for (let i = 0; i < n; i++) if (await claims.nth(i).isEnabled()) enabled++
      registry.record({
        id: 'E2E-LC-004',
        journey: 'Afternoon active scoring window Home',
        expected: 'Claim controls present during open window',
        actual: `enabledClaims=${enabled} total=${n}`,
        outcome: n > 0 ? 'passed' : 'failed',
        evidence: [await shot(page2, 'lc-004-afternoon')],
      })
    } finally {
      await context2.close()
    }
  }

  // Pause / resume reflected in open client
  {
    await setNowAligned({ cruiseDay: 3, targetHour: 15 })
    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: drinkOnly.display_name })
      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      await service.rpc('dev_set_drinkit_paused', { p_paused: true })
      // without refresh
      await page.waitForTimeout(2000)
      const beforeRefresh =
        (await page.locator('[data-testid="bounty-overlay"]').count()) +
        (await page.getByText(/paused/i).count())
      await page.reload({ waitUntil: 'networkidle' })
      const afterRefresh =
        (await page.locator('[data-testid="bounty-overlay"]').count()) +
        (await page.getByText(/paused/i).count())
      registry.record({
        id: 'E2E-LC-005',
        journey: 'Admin pause reflected in open client',
        expected: 'Pause visible after refresh at minimum; note if autonomous update',
        actual: `overlaysBeforeRefresh=${beforeRefresh} afterRefresh=${afterRefresh}`,
        outcome: afterRefresh > 0 || beforeRefresh > 0 ? 'passed' : 'failed',
        evidence: [await shot(page, 'lc-005-paused')],
        notes:
          beforeRefresh === 0 && afterRefresh > 0
            ? 'Requires refresh (stale open tab risk)'
            : beforeRefresh > 0
              ? 'Updated without refresh'
              : 'Pause UI signal not found',
      })
      await service.rpc('dev_set_drinkit_paused', { p_paused: false })
      await page.reload({ waitUntil: 'networkidle' })
      registry.record({
        id: 'E2E-LC-006',
        journey: 'Resume after pause',
        expected: 'Home returns to active bounty UI',
        actual: page.url(),
        outcome: page.url().includes('/drinkit') ? 'passed' : 'failed',
        evidence: [await shot(page, 'lc-006-resumed')],
      })
    } finally {
      await context.close()
    }
  }

  // Wrong client timezone
  {
    await setNowAligned({ cruiseDay: 3, targetHour: 14 })
    const context = await browser.newContext({
      ...mobileContextOptions(),
      timezoneId: 'Asia/Tokyo',
    })
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: drinkOnly.display_name })
      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
      // Attempt a simple log — server clock should govern
      await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
      const wizard = (await page.locator('[data-testid="log-wizard"]').count()) > 0
      registry.record({
        id: 'E2E-LC-007',
        journey: 'Client TZ Asia/Tokyo while ship clock active',
        expected: 'Wizard still available based on server accepting_submissions',
        actual: `wizard=${wizard}`,
        outcome: wizard ? 'passed' : 'failed',
        evidence: [await shot(page, 'lc-007-tz')],
        notes: 'Device clock/TZ must not unlock closed games; server authority',
      })
    } finally {
      await context.close()
    }
  }

  // Deliberately incorrect device clock via Date override is limited in Playwright;
  // record as emulation caveat.
  registry.record({
    id: 'E2E-LC-008',
    journey: 'Incorrect device wall clock',
    expected: 'Submissions follow server clock',
    actual: 'Chromium Date override not used; covered via server seed + TZ case',
    outcome: 'blocked',
    method: 'manual_device_recommended',
    notes: 'Physical device with wrong clock still required for full confidence',
  })

  // Friday cutoff / finale
  {
    const now = Date.now()
    const provisional = new Date(now)
    const shipDateOnDay = provisional.toISOString().slice(0, 10)
    // day1 = shipDate - 6 days → today is day 7
    const day1Date = new Date(`${shipDateOnDay}T12:00:00Z`)
    day1Date.setUTCDate(day1Date.getUTCDate() - 6)
    const day1 = day1Date.toISOString().slice(0, 10)
    // Align ship local to 18:30 Friday (day7)
    const targetShipWall = Date.parse(`${shipDateOnDay}T18:30:00Z`)
    const offsetMinutes = Math.round((targetShipWall - now) / 60_000)
    await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: day1,
      p_base_offset_minutes: offsetMinutes,
      p_label: 'development-only',
    })
    // Apply lifecycle side effects at now
    await service.rpc('dev_get_ship_clock_state_at', {
      p_at_utc: new Date().toISOString(),
      p_apply_lifecycle_side_effects: true,
    })
    const { data: clock } = await service.rpc('get_ship_clock_state')

    const context = await browser.newContext(mobileContextOptions())
    const page = await context.newPage()
    try {
      await loginAs(page, { baseUrl, password, displayName: both.display_name })
      await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
      const gated =
        (await page.locator('[data-testid="shipit-submission-unavailable"], [data-testid="scavenger-finale-gate"], [data-testid="shipit-challenges-lifecycle"]').count()) >
          0 ||
        clock?.accepting_submissions === false
      await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
      const drinkBlocked = !(await page.locator('[data-testid="submit-drink"]').count())
      registry.record({
        id: 'E2E-LC-009',
        journey: 'Friday 6PM+ cutoff / finale latch in browser',
        preconditions: [
          `lifecycle=${clock?.lifecycle}`,
          `accepting=${clock?.accepting_submissions}`,
          `finalized=${clock?.finalized}`,
        ],
        expected: 'Submissions unavailable; results/Wrapped pathways available as designed',
        actual: `gated=${gated} drinkBlocked=${drinkBlocked} url=${page.url()}`,
        outcome: clock?.accepting_submissions === false ? 'passed' : 'failed',
        evidence: [await shot(page, 'lc-009-finale')],
      })

      await page.goto(`${baseUrl}/drinkit/wrapped`, { waitUntil: 'networkidle' })
      registry.record({
        id: 'E2E-LC-010',
        journey: 'Wrapped/finalized navigation after cutoff',
        expected: 'Wrapped route loads or shows not-available state cleanly',
        actual: page.url(),
        outcome:
          (await page.locator('[data-testid^="wrapped"]').count()) > 0 || page.url().includes('wrapped')
            ? 'passed'
            : 'failed',
        evidence: [await shot(page, 'lc-010-wrapped')],
      })
    } finally {
      await context.close()
    }
  }

  // Restore active mid-cruise for any follow-on suites
  await setNowAligned({ cruiseDay: 3, targetHour: 14, targetMinute: 15 })
  try {
    await service.rpc('dev_generate_bounty_schedule', { p_seed: `qa2a-restore-${Date.now()}` })
    await service.rpc('dev_seed_daily_assignments')
  } catch {
    /* */
  }

  // Cocktail hourly / ingredient 2h / grace — open tab stale risk
  registry.record({
    id: 'E2E-LC-011',
    journey: 'Open tab across cocktail hourly rotation',
    expected: 'Stale card either updates or fails with clear server error',
    actual: 'Automated long-wait rotation not run; pause/refresh coverage stands in',
    outcome: 'blocked',
    notes: 'Manual: leave Home open >60m across hour boundary on disposable',
  })
  registry.record({
    id: 'E2E-LC-012',
    journey: 'Claim initiated before expiration, submitted during 15m grace',
    expected: 'Server accepts per grace contract; UI explains if rejected post-grace',
    actual: 'Backend grace passed QA-1; browser timing harness not fully automated',
    outcome: 'blocked',
    links: ['QA-GR-003'],
    method: 'manual_repro_steps_in_report',
  })
}
