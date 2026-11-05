/**
 * Phase 2D-B2.1 — durable Pause/Resume request-id + finale latch closeout.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signInAs } from '../helpers/localSupabase'
import {
  activateReadyCatalogAndSchedule,
  loadBountyFixtures,
  DEV_BASE_OFFSET_MIN,
} from '../helpers/bountyFixtures'
import type { ClockFixtures } from '../helpers/clockFixtures'
import { randomUUID } from 'node:crypto'

let fixtures: ClockFixtures

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
})

beforeEach(async () => {
  const { error } = await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
})

describe('Phase 2D-B2.1 pause request durability', () => {
  it('6 same request id + same state cannot create a second mutation/audit', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const admin = await signInAs(fixtures, 'admin')
    const id = randomUUID()
    const first = await admin.rpc('admin_set_drinkit_paused', {
      p_paused: true,
      p_client_request_id: id,
    })
    expect(first.error).toBeNull()
    expect(first.data.changed).toBe(true)
    expect(first.data.paused).toBe(true)

    const { count: auditsAfterFirst } = await fixtures.service!
      .from('admin_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'drinkit_pause')
      .contains('after_json', { client_request_id: id })

    const replay = await admin.rpc('admin_set_drinkit_paused', {
      p_paused: true,
      p_client_request_id: id,
    })
    expect(replay.error).toBeNull()
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.changed).toBe(false)
    expect(replay.data.paused).toBe(true)

    const { count: auditsAfterReplay } = await fixtures.service!
      .from('admin_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'drinkit_pause')
      .contains('after_json', { client_request_id: id })

    expect(auditsAfterReplay).toBe(auditsAfterFirst)
  })

  it('7 same request id + opposite state is rejected', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const admin = await signInAs(fixtures, 'admin')
    const id = randomUUID()
    const first = await admin.rpc('admin_set_drinkit_paused', {
      p_paused: true,
      p_client_request_id: id,
    })
    expect(first.error).toBeNull()

    const opposite = await admin.rpc('admin_set_drinkit_paused', {
      p_paused: false,
      p_client_request_id: id,
    })
    expect(opposite.error).toBeTruthy()
    expect(opposite.error?.message ?? '').toMatch(/REQUEST_ID_OPERATION_MISMATCH/i)

    const status = await admin.rpc('admin_get_drinkit_pause_status')
    expect(status.data.drinkit.paused).toBe(true)
  })

  it('8 Pause → Resume → replay original Pause does not pause again', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const admin = await signInAs(fixtures, 'admin')
    const pauseId = randomUUID()
    const resumeId = randomUUID()

    await admin.rpc('admin_set_drinkit_paused', {
      p_paused: true,
      p_client_request_id: pauseId,
    })
    await admin.rpc('admin_set_drinkit_paused', {
      p_paused: false,
      p_client_request_id: resumeId,
    })
    const mid = await admin.rpc('admin_get_drinkit_pause_status')
    expect(mid.data.drinkit.paused).toBe(false)

    const replay = await admin.rpc('admin_set_drinkit_paused', {
      p_paused: true,
      p_client_request_id: pauseId,
    })
    expect(replay.error).toBeNull()
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.paused).toBe(true) // original result payload
    // Live state must remain running — replay must not re-apply.
    const after = await admin.rpc('admin_get_drinkit_pause_status')
    expect(after.data.drinkit.paused).toBe(false)
  })

  it('9 two concurrent identical requests resolve safely', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const admin = await signInAs(fixtures, 'admin')
    const id = randomUUID()
    const [a, b] = await Promise.all([
      admin.rpc('admin_set_drinkit_paused', { p_paused: true, p_client_request_id: id }),
      admin.rpc('admin_set_drinkit_paused', { p_paused: true, p_client_request_id: id }),
    ])
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(a.data.paused).toBe(true)
    expect(b.data.paused).toBe(true)
    const changedCount = [a.data.changed, b.data.changed].filter(Boolean).length
    expect(changedCount).toBeLessThanOrEqual(1)

    const { count } = await fixtures.service!
      .from('admin_drinkit_pause_requests')
      .select('*', { count: 'exact', head: true })
      .eq('client_request_id', id)
    expect(count).toBe(1)

    const status = await admin.rpc('admin_get_drinkit_pause_status')
    expect(status.data.drinkit.paused).toBe(true)
    expect(status.data.shipit.paused).toBe(false)
  })

  it('10 another admin intervening change is not overwritten by original replay', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const admin = await signInAs(fixtures, 'admin')
    // Simulate intervening organizer action with a distinct request id.
    const firstId = randomUUID()
    const otherId = randomUUID()
    await admin.rpc('admin_set_drinkit_paused', {
      p_paused: true,
      p_client_request_id: firstId,
    })
    await admin.rpc('admin_set_drinkit_paused', {
      p_paused: false,
      p_client_request_id: otherId,
    })
    expect((await admin.rpc('admin_get_drinkit_pause_status')).data.drinkit.paused).toBe(false)

    // Lost-response recovery replays the original Pause id — must not re-pause.
    const replay = await admin.rpc('admin_set_drinkit_paused', {
      p_paused: true,
      p_client_request_id: firstId,
    })
    expect(replay.data.idempotent_replay).toBe(true)
    expect((await admin.rpc('admin_get_drinkit_pause_status')).data.drinkit.paused).toBe(false)

    // Lookup still returns the original recorded outcome for reconcile UI.
    const found = await admin.rpc('admin_find_drinkit_pause_request_by_id', {
      p_client_request_id: firstId,
    })
    expect(found.error).toBeNull()
    expect(found.data.desired_paused).toBe(true)
    expect(found.data.paused).toBe(true)
  })

  it('13 non-admin mutations remain denied', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const player = await signInAs(fixtures, 'drink_only')
    const denied = await player.rpc('admin_set_drinkit_paused', {
      p_paused: true,
      p_client_request_id: randomUUID(),
    })
    expect(denied.error?.message ?? '').toMatch(/ADMIN_REQUIRED/i)
    const find = await player.rpc('admin_find_drinkit_pause_request_by_id', {
      p_client_request_id: randomUUID(),
    })
    expect(find.error?.message ?? '').toMatch(/ADMIN_REQUIRED/i)
  })

  it('14 Ship It! remains unaffected', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const admin = await signInAs(fixtures, 'admin')
    await admin.rpc('admin_set_drinkit_paused', {
      p_paused: true,
      p_client_request_id: randomUUID(),
    })
    const status = await admin.rpc('admin_get_drinkit_pause_status')
    expect(status.data.drinkit.paused).toBe(true)
    expect(status.data.shipit.paused).toBe(false)
    const { data: ship } = await fixtures.service!
      .from('game_control')
      .select('status, paused_at_utc')
      .eq('game', 'shipit')
      .single()
    expect(ship?.status).not.toBe('paused')
    expect(ship?.paused_at_utc).toBeNull()
  })

  it('15 Friday finale locks Pause/Resume even with no prior read latch', async () => {
    // Cruise whose Friday 6 PM Ship Time is already in the past (no player/admin read yet).
    const past = await fixtures.service!.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2000-01-01',
      p_base_offset_minutes: 0,
      p_label: 'development-only',
    })
    expect(past.error).toBeNull()
    await activateReadyCatalogAndSchedule(fixtures.service!, 'finale-no-prior-read')

    // Clear any latch written during activate — mutation must still reject on ship-time cutoff.
    await fixtures.service!
      .from('game_control')
      .update({ finalized_at_utc: null, status: 'active', paused_at_utc: null, paused_by: null })
      .eq('game', 'drinkit')
    await fixtures.service!
      .from('game_control')
      .update({ finalized_at_utc: null, status: 'active' })
      .eq('game', 'shipit')

    const stillOpen = await fixtures.service!
      .from('game_control')
      .select('finalized_at_utc, status')
      .eq('game', 'drinkit')
      .single()
    expect(stillOpen.data?.finalized_at_utc).toBeNull()
    expect(stillOpen.data?.status).toBe('active')

    const admin = await signInAs(fixtures, 'admin')
    // Direct mutation with no prior get_ship_clock_state / pause status read.
    const pause = await admin.rpc('admin_set_drinkit_paused', {
      p_paused: true,
      p_client_request_id: randomUUID(),
    })
    expect(pause.error).toBeTruthy()
    expect(pause.error?.message ?? '').toMatch(/FINALE_LOCKED/i)

    // RAISE rolls back the in-transaction latch attempt — state must still be unpaused.
    const afterPause = await fixtures.service!
      .from('game_control')
      .select('finalized_at_utc, status, paused_at_utc')
      .eq('game', 'drinkit')
      .single()
    expect(afterPause.data?.status).not.toBe('paused')
    expect(afterPause.data?.paused_at_utc).toBeNull()

    // Successful status read latches durably; Resume stays locked.
    const status = await admin.rpc('admin_get_drinkit_pause_status')
    expect(status.error).toBeNull()
    expect(status.data.drinkit.finalized_at_utc).not.toBeNull()

    const resume = await admin.rpc('admin_set_drinkit_paused', {
      p_paused: false,
      p_client_request_id: randomUUID(),
    })
    expect(resume.error?.message ?? '').toMatch(/FINALE_LOCKED/i)
  })

  it('find-by-id returns null for unknown ids; ledger is admin-readable', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const admin = await signInAs(fixtures, 'admin')
    const missing = await admin.rpc('admin_find_drinkit_pause_request_by_id', {
      p_client_request_id: randomUUID(),
    })
    expect(missing.error).toBeNull()
    expect(missing.data).toBeNull()

    const id = randomUUID()
    await admin.rpc('admin_set_drinkit_paused', {
      p_paused: true,
      p_client_request_id: id,
    })
    const found = await admin.rpc('admin_find_drinkit_pause_request_by_id', {
      p_client_request_id: id,
    })
    expect(found.data.fingerprint).toBe('drinkit_paused:true')
  })
})
