/**
 * Phase 5C Gate 3 — expired unbound photo cleanup runner RPCs + Storage API.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createLocalClient,
  loadLocalFixtures,
  signInAs,
  type LocalFixtures,
} from '../helpers/localSupabase'

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))
let fixtures: LocalFixtures

beforeAll(async () => {
  fixtures = await loadLocalFixtures()
})

describe('Phase 5C photo cleanup runner', () => {
  it('cleans old abandoned; preserves recent, staged, bound, voided-bound; denies players', async () => {
    if (!fixtures.available || !fixtures.serviceRoleKey || !fixtures.summary) return
    const service = createLocalClient(fixtures.summary.supabase_url, fixtures.serviceRoleKey)
    const player = await signInAs(fixtures, 'both')

    // Player cannot call privileged cleanup
    const denied = await player.rpc('claim_photo_cleanup_batch', {
      p_ttl_hours: 72,
      p_limit: 5,
      p_claim_token: randomUUID(),
    })
    expect(denied.error?.message ?? '').toMatch(/SERVICE_ROLE_REQUIRED|permission|42501/i)

    async function begin(statusAgeHours: number, confirm: boolean) {
      const begin = await player.rpc('begin_photo_upload', {
        p_game: 'drinkit',
        p_purpose: 'drink_log',
        p_mime_type: 'image/jpeg',
        p_byte_size: TINY_JPEG.length,
        p_width: 2,
        p_height: 2,
        p_client_request_id: randomUUID(),
      })
      expect(begin.data.ok).toBe(true)
      await player.storage.from(begin.data.bucket).upload(begin.data.storage_path, TINY_JPEG, {
        contentType: 'image/jpeg',
        upsert: true,
      })
      if (confirm) {
        await player.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
      }
      if (statusAgeHours > 0) {
        const past = new Date(Date.now() - statusAgeHours * 3600 * 1000).toISOString()
        await service.from('photos').update({ created_at: past }).eq('id', begin.data.photo_id)
      }
      return begin.data as { photo_id: string; bucket: string; storage_path: string }
    }

    const oldPending = await begin(80, false)
    const oldAbandoned = await begin(80, true)
    await player.rpc('abandon_photo_upload', { p_photo_id: oldAbandoned.photo_id })
    const recentAbandoned = await begin(1, true)
    await player.rpc('abandon_photo_upload', { p_photo_id: recentAbandoned.photo_id })
    const staged = await begin(80, true)

    // Bound photo (and later void) must be preserved
    const boundBegin = await begin(80, true)
    const { data: cruise } = await service.from('cruise_config').select('id').eq('is_active', true).maybeSingle()
    // Force-bind via service for cleanup isolation (no full submit needed)
    const fakeSub = randomUUID()
    if (cruise?.id) {
      await service.from('submissions').insert({
        id: fakeSub,
        author_player_id: fixtures.summary!.identities.find((i) => i.key === 'both')!.player_id,
        idempotency_key: randomUUID(),
        game: 'drinkit',
        kind: 'drink_log',
        cruise_config_id: cruise.id,
        received_at_utc: new Date().toISOString(),
        ship_day: 1,
        status: 'accepted',
        request_payload_hash: 'x',
        request_payload_json: {},
        result_json: {},
        display_snapshot_json: {},
      })
      await service
        .from('photos')
        .update({
          status: 'bound',
          bound_submission_id: fakeSub,
          bound_at_utc: new Date().toISOString(),
          storage_cleanup_status: 'not_needed',
        })
        .eq('id', boundBegin.photo_id)
    }

    const token = randomUUID()
    const claim = await service.rpc('claim_photo_cleanup_batch', {
      p_ttl_hours: 72,
      p_limit: 50,
      p_claim_token: token,
    })
    expect(claim.error).toBeNull()
    expect(claim.data.ok).toBe(true)
    const ids = (claim.data.photos as { photo_id: string }[]).map((p) => p.photo_id)
    expect(ids).toContain(oldPending.photo_id)
    expect(ids).toContain(oldAbandoned.photo_id)
    expect(ids).not.toContain(recentAbandoned.photo_id)
    expect(ids).not.toContain(staged.photo_id)
    expect(ids).not.toContain(boundBegin.photo_id)

    // Concurrent second claim should not double-take fresh claims (token held)
    const claim2 = await service.rpc('claim_photo_cleanup_batch', {
      p_ttl_hours: 72,
      p_limit: 50,
      p_claim_token: randomUUID(),
    })
    const ids2 = (claim2.data.photos as { photo_id: string }[]).map((p) => p.photo_id)
    expect(ids2).not.toContain(oldAbandoned.photo_id)

    for (const row of claim.data.photos as { photo_id: string; bucket: string; storage_path: string }[]) {
      await service.storage.from(row.bucket).remove([row.storage_path])
      const done = await service.rpc('complete_photo_cleanup', {
        p_photo_id: row.photo_id,
        p_claim_token: token,
        p_object_missing: false,
      })
      expect(done.data.ok).toBe(true)
    }

    // Missing object reconcile
    const miss = await begin(90, true)
    await player.rpc('abandon_photo_upload', { p_photo_id: miss.photo_id })
    await service.from('photos').update({ created_at: new Date(Date.now() - 90 * 3600 * 1000).toISOString() }).eq('id', miss.photo_id)
    await service.storage.from(miss.bucket).remove([miss.storage_path])
    const token3 = randomUUID()
    const claim3 = await service.rpc('claim_photo_cleanup_batch', {
      p_ttl_hours: 72,
      p_limit: 10,
      p_claim_token: token3,
    })
    const missRow = (claim3.data.photos as { photo_id: string }[]).find((p) => p.photo_id === miss.photo_id)
    expect(missRow).toBeTruthy()
    const reconciled = await service.rpc('complete_photo_cleanup', {
      p_photo_id: miss.photo_id,
      p_claim_token: token3,
      p_object_missing: true,
    })
    expect(reconciled.data.ok).toBe(true)
    expect(reconciled.data.object_missing).toBe(true)

    // Bound still present
    const { data: boundRow } = await service.from('photos').select('status, storage_cleanup_status').eq('id', boundBegin.photo_id).single()
    expect(boundRow!.status).toBe('bound')
    expect(boundRow!.storage_cleanup_status).toBe('not_needed')

    // Staged preserved
    const { data: stagedRow } = await service.from('photos').select('status').eq('id', staged.photo_id).single()
    expect(stagedRow!.status).toBe('staged')

    // Fail path remains retryable
    const failPhoto = await begin(100, true)
    await player.rpc('abandon_photo_upload', { p_photo_id: failPhoto.photo_id })
    await service.from('photos').update({ created_at: new Date(Date.now() - 100 * 3600 * 1000).toISOString() }).eq('id', failPhoto.photo_id)
    const tokenFail = randomUUID()
    const claimFail = await service.rpc('claim_photo_cleanup_batch', {
      p_ttl_hours: 72,
      p_limit: 5,
      p_claim_token: tokenFail,
    })
    expect((claimFail.data.photos as { photo_id: string }[]).some((p) => p.photo_id === failPhoto.photo_id)).toBe(true)
    const failed = await service.rpc('fail_photo_cleanup', {
      p_photo_id: failPhoto.photo_id,
      p_claim_token: tokenFail,
      p_detail: 'simulated storage failure',
    })
    expect(failed.data.ok).toBe(true)
    expect(failed.data.cleanup_status).toBe('failed')
    const { data: failRow } = await service.from('photos').select('storage_cleanup_status, cleanup_claim_token').eq('id', failPhoto.photo_id).single()
    expect(failRow!.storage_cleanup_status).toBe('failed')
    expect(failRow!.cleanup_claim_token).toBeNull()

    // Voided submission photo (still bound) must never be a cleanup candidate
    if (cruise?.id) {
      await service
        .from('submissions')
        .update({ status: 'voided', voided_at_utc: new Date().toISOString() })
        .eq('id', fakeSub)
      const tokenVoid = randomUUID()
      const claimVoid = await service.rpc('claim_photo_cleanup_batch', {
        p_ttl_hours: 72,
        p_limit: 50,
        p_claim_token: tokenVoid,
      })
      const voidIds = (claimVoid.data.photos as { photo_id: string }[]).map((p) => p.photo_id)
      expect(voidIds).not.toContain(boundBegin.photo_id)
      const { data: stillBound } = await service
        .from('photos')
        .select('status, storage_cleanup_status, bound_submission_id')
        .eq('id', boundBegin.photo_id)
        .single()
      expect(stillBound!.status).toBe('bound')
      expect(stillBound!.bound_submission_id).toBe(fakeSub)
      expect(stillBound!.storage_cleanup_status).toBe('not_needed')
    }

    // Cleanup vs bind race: claimed abandoned photo that becomes bound mid-flight is preserved
    const race = await begin(95, true)
    await player.rpc('abandon_photo_upload', { p_photo_id: race.photo_id })
    await service
      .from('photos')
      .update({ created_at: new Date(Date.now() - 95 * 3600 * 1000).toISOString() })
      .eq('id', race.photo_id)
    const tokenRace = randomUUID()
    const claimRace = await service.rpc('claim_photo_cleanup_batch', {
      p_ttl_hours: 72,
      p_limit: 10,
      p_claim_token: tokenRace,
    })
    expect((claimRace.data.photos as { photo_id: string }[]).some((p) => p.photo_id === race.photo_id)).toBe(
      true,
    )
    const raceSub = randomUUID()
    if (cruise?.id) {
      await service.from('submissions').insert({
        id: raceSub,
        author_player_id: fixtures.summary!.identities.find((i) => i.key === 'both')!.player_id,
        idempotency_key: randomUUID(),
        game: 'drinkit',
        kind: 'drink_log',
        cruise_config_id: cruise.id,
        received_at_utc: new Date().toISOString(),
        ship_day: 1,
        status: 'accepted',
        request_payload_hash: 'race',
        request_payload_json: {},
        result_json: {},
        display_snapshot_json: {},
      })
      await service
        .from('photos')
        .update({
          status: 'bound',
          bound_submission_id: raceSub,
          bound_at_utc: new Date().toISOString(),
        })
        .eq('id', race.photo_id)
      const raceDone = await service.rpc('complete_photo_cleanup', {
        p_photo_id: race.photo_id,
        p_claim_token: tokenRace,
        p_object_missing: false,
      })
      expect(raceDone.data.ok).toBe(false)
      expect(raceDone.data.code).toBe('PHOTO_BOUND_PRESERVED')
      const { data: raceRow } = await service
        .from('photos')
        .select('status, storage_cleanup_status, cleanup_claim_token')
        .eq('id', race.photo_id)
        .single()
      expect(raceRow!.status).toBe('bound')
      expect(raceRow!.storage_cleanup_status).toBe('not_needed')
      expect(raceRow!.cleanup_claim_token).toBeNull()
      // Object must still exist (runner must not treat this as cleaned)
      const listed = await service.storage.from(race.bucket).list(race.storage_path.split('/').slice(0, -1).join('/'))
      const name = race.storage_path.split('/').pop()
      expect((listed.data ?? []).some((f) => f.name === name)).toBe(true)
    }
  })
})
