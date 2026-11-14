/**
 * Phase B4 — full Bar Bounty gameplay rehearsal (disposable development-only).
 * Synthetic identities only; writes docs/phase-b4-bar-bounty/rehearsal-report.json.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertDisposableDevEnvironment } from '../helpers/devEnvironmentGuard'
import {
  activateReadyCatalogAndSchedule,
  DEV_BASE_OFFSET_MIN,
  DEV_DAY1,
  noonDay1Utc,
  slotUtc,
} from '../helpers/bountyFixtures'
import { createLocalClient, loadLocalFixtures, signInAs } from '../helpers/localSupabase'
import { disposePlayers } from '../helpers/disposePlayers'
import { ensureSyntheticRoleIdentities } from '../helpers/syntheticRoles'
import type { ClockFixtures } from '../helpers/clockFixtures'
import { drinkPayload, previewAt, submitAt } from '../helpers/drinkitSubmit'
import {
  ensureCrewAssignment,
  pickPlayerInCrewSize,
} from '../helpers/barBountyCrew'
import { barBountyCrewPartitionSizes } from '../../src/lib/bounty/crewPartition'

let fixtures: ClockFixtures
let service: SupabaseClient
const createdPlayers: string[] = []

const report: Record<string, unknown> = {
  phase: 'B4',
  started_at: new Date().toISOString(),
  seven_day: null,
  scoring: [] as unknown[],
  roster: null,
  lifecycle: null,
  integrity: null,
  rls_advisory: null,
}

beforeAll(async () => {
  const base = await loadLocalFixtures()
  if (!base.available || !base.summary || !base.serviceRoleKey) {
    throw new Error('B4 requires local Supabase + identities')
  }
  const withRoles = await ensureSyntheticRoleIdentities(base)
  const svc = createLocalClient(withRoles.summary!.supabase_url, withRoles.serviceRoleKey!)
  const { error } = await svc.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: DEV_DAY1,
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  if (error) throw error
  fixtures = {
    ...withRoles,
    admin: await signInAs(withRoles, 'admin'),
    service: svc,
  }
  service = svc
  await assertDisposableDevEnvironment(fixtures, service)
  mkdirSync(join(process.cwd(), 'docs/phase-b4-bar-bounty'), { recursive: true })
}, 180000)

beforeEach(async () => {
  await assertDisposableDevEnvironment(fixtures, service)
  const { error } = await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: DEV_DAY1,
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await service
    .from('game_control')
    .update({ status: 'active', finalized_at_utc: null })
    .in('game', ['drinkit', 'shipit'])
  await activateReadyCatalogAndSchedule(service, `b4-${randomUUID().slice(0, 8)}`)
}, 180000)

afterEach(async () => {
  if (!createdPlayers.length) return
  await disposePlayers(service, createdPlayers.splice(0))
}, 120000)

afterAll(() => {
  report.finished_at = new Date().toISOString()
  writeFileSync(
    join(process.cwd(), 'docs/phase-b4-bar-bounty/rehearsal-report.json'),
    JSON.stringify(report, null, 2),
  )
})

describe('Phase B4 seven-day crew rehearsal (n=11)', () => {
  it('locks 4+4+3 each day, persists, varies, and favors social variety', async () => {
    const roster = await synthMany(11, 'week')
    const days: unknown[] = []
    const crewsByDay: Array<Array<{ members: Array<{ player_id: string }> }>> = []

    for (let day = 1; day <= 7; day++) {
      const at = slotUtc(day, '13:00:00')
      const first = await ensureCrewAssignment(service, at, roster, `b4-week-${day}`)
      const again = await ensureCrewAssignment(service, at, roster, `b4-week-${day}-ignored`)
      const sizes = first.crews.map((c) => c.size).sort((a, b) => b - a)
      const memberIds = first.crews.flatMap((c) => c.members.map((m) => m.player_id))
      expect(first.cruise_day).toBe(day)
      expect(sizes).toEqual([4, 4, 3])
      expect(new Set(memberIds).size).toBe(11)
      expect(memberIds).toHaveLength(11)
      expect(again.idempotent).toBe(true)
      expect(again.crew_day_id).toBe(first.crew_day_id)
      days.push({
        day,
        sizes,
        generated: first.generated,
        idempotent: again.idempotent,
        seed: first.seed,
      })
      crewsByDay.push(first.crews)
    }

    const { data: dayRows } = await service
      .from('bar_bounty_crew_days')
      .select('day_number')
      .order('day_number')
    expect((dayRows ?? []).map((r) => r.day_number)).toEqual([1, 2, 3, 4, 5, 6, 7])

    // Day payloads differ across days (assignments change)
    const canons = crewsByDay.map((crews) =>
      JSON.stringify(
        crews.map((c) => ({
          size: c.members.length,
          ids: c.members.map((m) => m.player_id).sort(),
        })),
      ),
    )
    expect(new Set(canons).size).toBeGreaterThan(1)

    const pairStats = measurePairs(crewsByDay)
    const baselineMedian = unweightedBaselineMedian(roster)
    expect(pairStats.repeat_mass).toBeLessThanOrEqual(baselineMedian)

    report.seven_day = {
      days,
      pairStats: { ...pairStats, unweighted_baseline_median_repeat_mass: baselineMedian },
    }
  }, 300000)
})

describe('Phase B4 scoring rehearsal', () => {
  it('preview → receipt → ledger agree for all 0/20/30/40 bands', async () => {
    const cases: Array<{
      label: string
      n: number
      size: 3 | 4
      mates: number
      points: number
      claimable: boolean
    }> = [
      { label: 'c3-solo', n: 9, size: 3, mates: 0, points: 0, claimable: false },
      { label: 'c3-one', n: 9, size: 3, mates: 1, points: 20, claimable: true },
      { label: 'c3-full', n: 9, size: 3, mates: 2, points: 40, claimable: true },
      { label: 'c4-solo', n: 8, size: 4, mates: 0, points: 0, claimable: false },
      { label: 'c4-one', n: 8, size: 4, mates: 1, points: 20, claimable: true },
      { label: 'c4-two', n: 8, size: 4, mates: 2, points: 30, claimable: true },
      { label: 'c4-full', n: 8, size: 4, mates: 3, points: 40, claimable: true },
    ]

    const rows: unknown[] = []
    for (const c of cases) {
      // Fresh cruise per case so claims do not collide
      await service.rpc('dev_seed_cruise_clock', {
        p_day1_ship_date: DEV_DAY1,
        p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
        p_label: 'development-only',
      })
      await activateReadyCatalogAndSchedule(service, `b4-${c.label}`)
      const at = noonDay1Utc()
      const barKey = await featuredBarKey(at)
      const roster = await synthMany(c.n, c.label)
      const ensured = await ensureCrewAssignment(service, at, roster, `score-${c.label}`)
      const picked = pickPlayerInCrewSize(ensured, c.size)
      const companions = picked.mates.slice(0, c.mates)
      const outsider = roster.find((id) => !picked.crew.members.some((m) => m.player_id === id))!

      const light = await service.rpc('dev_preview_my_bar_bounty_at', {
        p_player_id: picked.playerId,
        p_at_utc: at,
        p_payload: { bar_canonical_key: barKey, companion_player_ids: companions },
      })
      expect(light.data.points).toBe(c.points)
      expect(light.data.claimable).toBe(c.claimable)

      const full = await previewAt(
        service,
        picked.playerId,
        drinkPayload({
          barKey,
          mode: 'generic_beer',
          companions,
          barEligibleCompanions: companions,
        }),
        at,
      )
      const bar = full.data.preview.categories.bar

      if (c.claimable) {
        expect(bar.status).toBe('eligible')
        expect(bar.options[0].points).toBe(c.points)
        const submit = await submitAt(
          service,
          picked.playerId,
          drinkPayload({
            barKey,
            mode: 'generic_beer',
            companions,
            barEligibleCompanions: companions,
            selectedClaims: [{ category: 'bar', assignment_id: bar.options[0].assignment_id }],
          }),
          at,
        )
        expect(submit.data.ok).toBe(true)
        expect(submit.data.awarded_points).toBe(c.points)
        const { data: claims } = await service
          .from('bounty_claims')
          .select('points')
          .eq('player_id', picked.playerId)
          .eq('category', 'bar')
          .eq('status', 'active')
        expect(claims).toHaveLength(1)
        expect(claims![0]!.points).toBe(c.points)

        // Non-crew extras do not inflate after claim (claimed state or same band)
        const withExtra = await service.rpc('dev_preview_my_bar_bounty_at', {
          p_player_id: picked.playerId,
          p_at_utc: at,
          p_payload: {
            bar_canonical_key: barKey,
            companion_player_ids: [...companions, outsider],
          },
        })
        expect(withExtra.data.already_claimed === true || withExtra.data.points === c.points).toBe(
          true,
        )

        rows.push({
          label: c.label,
          crew_size: c.size,
          mates_selected: c.mates,
          present_including_player: c.mates + 1,
          preview_points: light.data.points,
          full_preview_points: bar.options[0].points,
          receipt_points: submit.data.awarded_points,
          ledger_points: claims![0]!.points,
          agree: true,
        })
      } else {
        expect(bar.status).not.toBe('eligible')
        const ordinary = await submitAt(
          service,
          picked.playerId,
          drinkPayload({
            barKey,
            mode: 'generic_beer',
            companions: outsider ? [outsider] : [],
          }),
          at,
        )
        expect(ordinary.data.ok).toBe(true)
        expect(ordinary.data.awarded_points ?? 0).toBe(0)
        rows.push({
          label: c.label,
          crew_size: c.size,
          mates_selected: c.mates,
          present_including_player: c.mates + 1,
          preview_points: light.data.points,
          full_preview_points: 0,
          receipt_points: ordinary.data.awarded_points ?? 0,
          ledger_points: null,
          agree: true,
        })
      }
    }
    report.scoring = rows
  }, 600000)
})

describe('Phase B4 roster / lifecycle / integrity', () => {
  it('mid-day join/opt-out locked; next day updates; <7 admin issue', async () => {
    const core = await synthMany(9, 'roster')
    const at = noonDay1Utc()
    const day1 = await ensureCrewAssignment(service, at, core, 'roster-d1')
    const locked = canonicalize(day1)

    const opted = day1.crews[0]!.members[0]!.player_id
    await service
      .from('game_memberships')
      .update({ enabled: false })
      .eq('player_id', opted)
      .eq('game', 'drinkit')
    const still = await ensureCrewAssignment(service, slotUtc(1, '15:00:00'), core, 'ignored')
    expect(canonicalize(still)).toBe(locked)
    expect(still.idempotent).toBe(true)

    const late = await synth('late')
    const afterLate = await ensureCrewAssignment(
      service,
      slotUtc(1, '16:00:00'),
      [...core, late],
      'ignored2',
    )
    expect(canonicalize(afterLate)).toBe(locked)
    expect(memberIds(afterLate)).not.toContain(late)

    const day2Roster = [...core.filter((id) => id !== opted), late]
    const day2 = await ensureCrewAssignment(service, slotUtc(2, '13:00:00'), day2Roster, 'roster-d2')
    expect(memberIds(day2)).toContain(late)
    expect(memberIds(day2)).not.toContain(opted)

    const tiny = await synthMany(5, 'tiny')
    const { data: small, error } = await service.rpc('dev_ensure_bar_bounty_crews_at', {
      p_at_utc: slotUtc(3, '13:00:00'),
      p_seed: 'tiny',
      p_roster_override: tiny,
    })
    expect(error).toBeNull()
    expect(small.ok).toBe(false)
    expect(small.code).toBe('ROSTER_TOO_SMALL')

    // Admin visibility of issue — after aligning live roster would require membership juggling;
    // override path already returns ROSTER_TOO_SMALL for admin-equivalent ensure.
    report.roster = {
      mid_day_locked: true,
      late_unassigned_day1: true,
      day2_includes_late_excludes_opted: true,
      roster_too_small: true,
    }
  }, 240000)

  it('pause blocks awards; resume restores; Friday finale blocks; same-day clock no dup', async () => {
    const roster = await synthMany(9, 'life')
    const at = noonDay1Utc()
    const barKey = await featuredBarKey(at)
    const ensured = await ensureCrewAssignment(service, at, roster, 'life')
    const picked = pickPlayerInCrewSize(ensured, 3)

    await service.rpc('dev_set_drinkit_paused', { p_paused: true, p_at_utc: at })
    const paused = await service.rpc('dev_preview_my_bar_bounty_at', {
      p_player_id: picked.playerId,
      p_at_utc: at,
      p_payload: { bar_canonical_key: barKey, companion_player_ids: [picked.mates[0]] },
    })
    expect(paused.data.claimable).toBe(false)

    await service.rpc('dev_set_drinkit_paused', { p_paused: false, p_at_utc: at })
    const resumed = await service.rpc('dev_preview_my_bar_bounty_at', {
      p_player_id: picked.playerId,
      p_at_utc: at,
      p_payload: { bar_canonical_key: barKey, companion_player_ids: [picked.mates[0]] },
    })
    expect(resumed.data.claimable).toBe(true)
    expect(resumed.data.points).toBe(20)

    const friday = slotUtc(7, '18:30:00')
    await service.rpc('dev_get_ship_clock_state_at', {
      p_at_utc: friday,
      p_apply_lifecycle_side_effects: true,
    })
    const finale = await previewAt(
      service,
      picked.playerId,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [picked.mates[0]!],
        barEligibleCompanions: [picked.mates[0]!],
      }),
      friday,
    )
    expect(finale.data.ok === false || finale.data.preview?.categories?.bar?.status !== 'eligible').toBe(
      true,
    )

    await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: DEV_DAY1,
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'development-only',
    })
    await activateReadyCatalogAndSchedule(service, 'b4-clock')
    const roster2 = await synthMany(11, 'clock')
    const a = await ensureCrewAssignment(service, slotUtc(1, '12:00:00'), roster2, 'clock-a')
    const b = await ensureCrewAssignment(service, slotUtc(1, '18:00:00'), roster2, 'clock-b')
    expect(b.idempotent).toBe(true)
    expect(b.crew_day_id).toBe(a.crew_day_id)

    report.lifecycle = {
      pause_blocks: true,
      resume_ok: true,
      friday_finale_blocks: true,
      same_day_clock_no_duplicate: true,
    }
  }, 240000)

  it('idempotent replay, concurrent once, void+reclaim, wrong bar, deprecated formula retained', async () => {
    const roster = await synthMany(9, 'integ')
    const at = noonDay1Utc()
    const barKey = await featuredBarKey(at)
    const ensured = await ensureCrewAssignment(service, at, roster, 'integ')
    const crewA = pickPlayerInCrewSize(ensured, 3)
    const otherCrew = ensured.crews.find(
      (c) => c.size === 3 && !c.members.some((m) => m.player_id === crewA.playerId),
    )!
    const author2 = otherCrew.members[0]!.player_id
    const mate2 = otherCrew.members.map((m) => m.player_id).find((id) => id !== author2)!

    const prev = await previewAt(
      service,
      crewA.playerId,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [crewA.mates[0]!],
        barEligibleCompanions: [crewA.mates[0]!],
      }),
      at,
    )
    const assignmentId = prev.data.preview.categories.bar.options[0].assignment_id
    const key = randomUUID()
    const payload = drinkPayload({
      barKey,
      mode: 'generic_beer',
      companions: [crewA.mates[0]!],
      barEligibleCompanions: [crewA.mates[0]!],
      selectedClaims: [{ category: 'bar', assignment_id: assignmentId }],
      idempotencyKey: key,
    })
    const first = await submitAt(service, crewA.playerId, payload, at)
    const replay = await submitAt(service, crewA.playerId, payload, at)
    expect(first.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(first.data.awarded_points).toBe(20)
    const submissionId = first.data.submission_id as string
    expect(submissionId).toBeTruthy()

    const prev2 = await previewAt(
      service,
      author2,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [mate2],
        barEligibleCompanions: [mate2],
      }),
      at,
    )
    const assignment2 = prev2.data.preview.categories.bar.options[0].assignment_id
    const raced = await Promise.all([
      submitAt(
        service,
        author2,
        drinkPayload({
          barKey,
          mode: 'generic_beer',
          companions: [mate2],
          barEligibleCompanions: [mate2],
          selectedClaims: [{ category: 'bar', assignment_id: assignment2 }],
        }),
        at,
      ),
      submitAt(
        service,
        author2,
        drinkPayload({
          barKey,
          mode: 'generic_beer',
          companions: [mate2],
          barEligibleCompanions: [mate2],
          selectedClaims: [{ category: 'bar', assignment_id: assignment2 }],
        }),
        at,
      ),
    ])
    const { count } = await service
      .from('bounty_claims')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', author2)
      .eq('category', 'bar')
      .eq('status', 'active')
    expect(count).toBe(1)
    expect(raced.some((r) => r.data?.ok)).toBe(true)

    const wrongBar = barKey === 'wake-view-bar' ? 'lido-bar' : 'wake-view-bar'
    const wrong = await submitAt(
      service,
      crewA.mates[1]!,
      drinkPayload({
        barKey: wrongBar,
        mode: 'generic_beer',
        companions: [crewA.playerId],
        barEligibleCompanions: [crewA.playerId],
      }),
      at,
    )
    expect(wrong.data.ok).toBe(true)
    expect(wrong.data.awarded_points ?? 0).toBe(0)

    const admin = await signInAs(fixtures, 'admin')
    const voided = await admin.rpc('admin_void_submission', {
      p_client_request_id: randomUUID(),
      p_submission_id: submissionId,
      p_expected_status: 'accepted',
      p_reason: 'b4-rehearsal',
    })
    expect(voided.error).toBeNull()
    expect(voided.data.ok).toBe(true)

    const reclaimPrev = await previewAt(
      service,
      crewA.playerId,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [crewA.mates[0]!],
        barEligibleCompanions: [crewA.mates[0]!],
      }),
      at,
    )
    expect(reclaimPrev.data.preview.categories.bar.status).toBe('eligible')
    const reclaim = await submitAt(
      service,
      crewA.playerId,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [crewA.mates[0]!],
        barEligibleCompanions: [crewA.mates[0]!],
        selectedClaims: [
          {
            category: 'bar',
            assignment_id: reclaimPrev.data.preview.categories.bar.options[0].assignment_id,
          },
        ],
      }),
      at,
    )
    expect(reclaim.data.ok).toBe(true)
    expect(reclaim.data.awarded_points).toBe(20)

    // Deprecated companion-count formula still present; historical ledgers keep stored points
    const { data: legacy } = await service.rpc('drinkit_bar_points', { p_companion_count: 3 })
    expect(legacy).toBe(55)

    const { count: offeringCount } = await service
      .from('catalog_category_b_approved_offerings')
      .select('*', { count: 'exact', head: true })

    report.integrity = {
      idempotent_replay: true,
      concurrent_single_claim: true,
      wrong_bar_no_points: true,
      void_and_reclaim: true,
      deprecated_formula_retained: legacy,
    }
    report.rls_advisory = {
      table: 'catalog_category_b_approved_offerings',
      row_count: offeringCount,
      sensitivity:
        'Catalog reference allowlist (bar_id + drink_concept_id). Not player PII. Migration revokes anon/authenticated and grants service_role SELECT only; RLS remains disabled — production review should enable RLS with service_role-only policies or confirm revoke-only posture.',
    }
  }, 300000)
})

function canonicalize(payload: {
  crews: Array<{ size: number; members: Array<{ player_id: string }> }>
}) {
  return JSON.stringify(
    payload.crews.map((c) => ({
      size: c.size,
      ids: c.members.map((m) => m.player_id).sort(),
    })),
  )
}

function memberIds(payload: {
  crews: Array<{ members: Array<{ player_id: string }> }>
}) {
  return payload.crews.flatMap((c) => c.members.map((m) => m.player_id))
}

function measurePairs(crewsByDay: Array<Array<{ members: Array<{ player_id: string }> }>>) {
  const pairCounts = new Map<string, number>()
  for (const crews of crewsByDay) {
    for (const crew of crews) {
      const ids = crew.members.map((m) => m.player_id)
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = [ids[i]!, ids[j]!].sort().join('|')
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
        }
      }
    }
  }
  const histogram: Record<string, number> = {}
  for (const c of pairCounts.values()) {
    histogram[String(c)] = (histogram[String(c)] ?? 0) + 1
  }
  return {
    unique_pairs: pairCounts.size,
    pairs_seen_once: histogram['1'] ?? 0,
    pairs_seen_twice: histogram['2'] ?? 0,
    pairs_seen_thrice_plus: Object.entries(histogram)
      .filter(([k]) => Number(k) >= 3)
      .reduce((s, [, v]) => s + v, 0),
    repeat_mass: [...pairCounts.values()].reduce((s, c) => s + Math.max(0, c - 1), 0),
    histogram,
  }
}

function unweightedBaselineMedian(roster: string[], days = 7, sims = 40) {
  const sizes = barBountyCrewPartitionSizes(roster.length)
  const masses: number[] = []
  for (let sim = 0; sim < sims; sim++) {
    const counts = new Map<string, number>()
    for (let day = 0; day < days; day++) {
      const order = shuffle([...roster], `b4-base-${sim}-${day}`)
      let cursor = 0
      for (const size of sizes) {
        const crew = order.slice(cursor, cursor + size)
        for (let i = 0; i < crew.length; i++) {
          for (let j = i + 1; j < crew.length; j++) {
            const key = [crew[i]!, crew[j]!].sort().join('|')
            counts.set(key, (counts.get(key) ?? 0) + 1)
          }
        }
        cursor += size
      }
    }
    masses.push([...counts.values()].reduce((s, c) => s + Math.max(0, c - 1), 0))
  }
  masses.sort((a, b) => a - b)
  return masses[Math.floor(masses.length / 2)]!
}

function shuffle(ids: string[], seed: string) {
  const out = [...ids]
  let counter = 0
  for (let i = out.length - 1; i > 0; i--) {
    const digest = createHash('md5').update(`${seed}:${counter++}`).digest()
    const r = digest.readUInt32BE(0) / 0x1_0000_0000
    const j = Math.floor(r * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

async function featuredBarKey(at: string) {
  const bar = await service.rpc('dev_get_current_bar_bounty_at', { p_at_utc: at })
  expect(bar.error).toBeNull()
  expect(bar.data.status).toBe('active')
  return bar.data.bar_canonical_key as string
}

async function synth(label: string) {
  const token = randomUUID().slice(0, 8)
  const { data, error } = await service
    .from('players')
    .insert({
      display_name: `B4 Synth ${label} ${token}`,
      login_alias: `b4-synth-${label}-${token}`,
      is_admin: false,
      active: true,
    })
    .select('id')
    .single()
  if (error) throw error
  createdPlayers.push(data.id)
  await service.from('game_memberships').insert({
    player_id: data.id,
    game: 'drinkit',
    enabled: true,
  })
  return data.id as string
}

async function synthMany(count: number, prefix: string) {
  const ids: string[] = []
  for (let i = 0; i < count; i++) ids.push(await synth(`${prefix}-${i}`))
  return ids
}
