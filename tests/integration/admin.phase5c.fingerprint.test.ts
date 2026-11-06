/**
 * Phase 5C Gate 1 — Admin Void fingerprint includes reason (v2) + legacy v1 replay.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  activateReadyCatalogAndSchedule,
  DEV_BASE_OFFSET_MIN,
  loadBountyFixtures,
  noonDay1Utc,
} from '../helpers/bountyFixtures'
import { drinkPayload, exposeCurrentSlots, playerId, submitAt } from '../helpers/drinkitSubmit'
import { signInAs } from '../helpers/localSupabase'
import type { ClockFixtures } from '../helpers/clockFixtures'

let fixtures: ClockFixtures

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
})

beforeEach(async () => {
  await fixtures.service!.rpc('dev_reset_scavenger_test_data')
  await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(fixtures.service!, `5c-fp-${randomUUID().slice(0, 8)}`)
})

function local() {
  return {
    available: true as const,
    password: fixtures.password!,
    summary: fixtures.summary!,
    anonKey: fixtures.anonKey!,
    serviceRoleKey: fixtures.serviceRoleKey!,
  }
}

async function makeSubmission() {
  const at = noonDay1Utc()
  await exposeCurrentSlots(fixtures.service!, at)
  const res = await submitAt(
    fixtures.service!,
    playerId(fixtures, 'drink_only'),
    drinkPayload({ barKey: 'wake-view', mode: 'generic_beer', selectedClaims: [] }),
    at,
  )
  expect(res.data.ok).toBe(true)
  return res.data.submission_id as string
}

describe('Phase 5C void fingerprint v2', () => {
  it('same UUID + identical reason replays; changed reason mismatches', async () => {
    const submissionId = await makeSubmission()
    const admin = await signInAs(local(), 'admin')
    const req = randomUUID()

    const first = await admin.rpc('admin_void_submission', {
      p_client_request_id: req,
      p_submission_id: submissionId,
      p_expected_status: 'accepted',
      p_reason: 'alpha',
    })
    expect(first.data.ok).toBe(true)

    const replay = await admin.rpc('admin_void_submission', {
      p_client_request_id: req,
      p_submission_id: submissionId,
      p_expected_status: 'accepted',
      p_reason: 'alpha',
    })
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)

    const mismatch = await admin.rpc('admin_void_submission', {
      p_client_request_id: req,
      p_submission_id: submissionId,
      p_expected_status: 'accepted',
      p_reason: 'beta',
    })
    expect(mismatch.data.ok).toBe(false)
    expect(mismatch.data.code).toBe('REQUEST_ID_OPERATION_MISMATCH')

    const audit = await fixtures.service!
      .from('admin_audit_log')
      .select('id')
      .eq('action', 'submission.void')
      .eq('target_id', submissionId)
    expect(audit.data).toHaveLength(1)
  })

  it('legacy v1 fingerprint reconciles when stored reason matches', async () => {
    const submissionId = await makeSubmission()
    const admin = await signInAs(local(), 'admin')
    const req = randomUUID()
    const legacyFp = `void_submission:${submissionId}:accepted`

    // Simulate a Phase 5B ledger row (v1 fingerprint, null reason) with successful result.
    await fixtures.service!.from('admin_void_requests').insert({
      client_request_id: req,
      fingerprint: legacyFp,
      submission_id: submissionId,
      expected_status: 'accepted',
      reason: null,
      actor_id: playerId(fixtures, 'admin'),
      result_json: { ok: true, voided: true, submission_id: submissionId },
      received_at_utc: new Date().toISOString(),
    })

    const replay = await admin.rpc('admin_void_submission', {
      p_client_request_id: req,
      p_submission_id: submissionId,
      p_expected_status: 'accepted',
      p_reason: null,
    })
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.legacy_fingerprint_replay).toBe(true)

    const reasonChange = await admin.rpc('admin_void_submission', {
      p_client_request_id: req,
      p_submission_id: submissionId,
      p_expected_status: 'accepted',
      p_reason: 'new-reason',
    })
    expect(reasonChange.data.ok).toBe(false)
    expect(reasonChange.data.code).toBe('REQUEST_ID_OPERATION_MISMATCH')
  })

  it('changed submission id with same UUID mismatches', async () => {
    const a = await makeSubmission()
    const b = await makeSubmission()
    const admin = await signInAs(local(), 'admin')
    const req = randomUUID()
    const first = await admin.rpc('admin_void_submission', {
      p_client_request_id: req,
      p_submission_id: a,
      p_expected_status: 'accepted',
      p_reason: 'x',
    })
    expect(first.data.ok).toBe(true)
    const mismatch = await admin.rpc('admin_void_submission', {
      p_client_request_id: req,
      p_submission_id: b,
      p_expected_status: 'accepted',
      p_reason: 'x',
    })
    expect(mismatch.data.ok).toBe(false)
    expect(mismatch.data.code).toBe('REQUEST_ID_OPERATION_MISMATCH')
  })
})
