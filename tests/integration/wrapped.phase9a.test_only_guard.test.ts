/**
 * Phase 9A Gate 1 — test_only Wrapped awards only on development-only cruises.
 *
 * Non-dev cruise assertions call wrapped_compute_group_awards directly because
 * timed DEV helpers refuse when cruise_config.label ≠ development-only.
 */
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  dayDate,
  loadClockFixtures,
  shipLocalToUtcIso,
  DEV_BASE_OFFSET_MIN,
  type ClockFixtures,
} from '../helpers/clockFixtures'
import { identity } from '../helpers/localSupabase'

const hasPassword = Boolean(process.env.LOCAL_TEST_PASSWORD)

describe.runIf(hasPassword)('Phase 9A Wrapped test_only guard', () => {
  let fx: ClockFixtures
  let cruiseId: string

  beforeAll(async () => {
    fx = await loadClockFixtures()
    if (!fx.available || !fx.service || !fx.summary) {
      throw new Error('Phase 9A guard tests require local Supabase + LOCAL_TEST_PASSWORD')
    }
    const { data: cfg } = await fx.service!
      .from('cruise_config')
      .select('id, label')
      .eq('is_active', true)
      .single()
    cruiseId = cfg!.id as string
    expect(cfg!.label).toBe('development-only')
  }, 60_000)

  function at(day: number, time: string) {
    return shipLocalToUtcIso(dayDate(day), time, DEV_BASE_OFFSET_MIN)
  }

  it('shows test_only awards on development-only cruise', async () => {
    const finale = at(7, '18:00:00')
    await fx.service!.rpc('dev_get_ship_clock_state_at', {
      p_at_utc: finale,
      p_apply_lifecycle_side_effects: true,
    })

    const drinkOnly = identity(fx.summary!, 'drink_only')
    const { data, error } = await fx.service!.rpc('dev_get_my_wrapped_at', {
      p_player_id: drinkOnly.player_id,
      p_game: 'drinkit',
      p_at_utc: finale,
    })
    expect(error).toBeNull()
    expect(data.ok).toBe(true)
    const awards = data.group_awards as Array<{ stable_key: string; test_only: boolean }>
    expect(awards.some((a) => a.test_only && a.stable_key.startsWith('test-'))).toBe(true)
  })

  it('hides test_only awards on a non-development cruise; keeps authorized non-test award', async () => {
    const finale = at(7, '18:05:00')
    await fx.service!.from('game_control').update({
      finalized_at_utc: finale,
      status: 'final',
    })

    const { data: before } = await fx.service!
      .from('cruise_config')
      .select('id, label')
      .eq('id', cruiseId)
      .single()
    expect(before!.label).toBe('development-only')

    await fx.service!
      .from('cruise_config')
      .update({ label: 'rehearsal-not-development' })
      .eq('id', cruiseId)

    const prodKey = `phase9a-guard-authorized-${randomUUID().slice(0, 8)}`
    const { error: insErr } = await fx.service!.from('wrapped_award_definitions').insert({
      game: 'drinkit',
      stable_key: prodKey,
      title: 'Authorized Points Lead',
      quip: 'Non-test definition for guard verification.',
      metric_key: 'total_points',
      selection_rule: 'max',
      icon_key: 'score.leaderboard',
      sort_order: 1,
      enabled: true,
      test_only: false,
      allow_zero_win: false,
    })
    expect(insErr).toBeNull()

    try {
      const { data: awards, error } = await fx.service!.rpc('wrapped_compute_group_awards', {
        p_game: 'drinkit',
        p_cruise_config_id: cruiseId,
      })
      expect(error).toBeNull()
      const list = awards as Array<{
        stable_key: string
        test_only: boolean
        status: string
      }>
      expect(Array.isArray(list)).toBe(true)
      expect(list.every((a) => a.test_only === false)).toBe(true)
      expect(list.some((a) => a.stable_key.startsWith('test-'))).toBe(false)
      expect(list.some((a) => a.stable_key === prodKey)).toBe(true)
    } finally {
      await fx.service!.from('wrapped_award_definitions').delete().eq('stable_key', prodKey)
      await fx.service!
        .from('cruise_config')
        .update({ label: 'development-only' })
        .eq('id', cruiseId)
    }
  })
})
