/**
 * Phase 4B2 Gates A/B — abandon via Storage API; idempotent begin + lost confirm recovery.
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

describe('Phase 4B2 Gate A — abandon uses Storage API', () => {
  it('marks abandoned without SQL object delete; client Storage remove + mark cleaned', async () => {
    if (!fixtures.available || !fixtures.serviceRoleKey || !fixtures.summary) return
    const a = await signInAs(fixtures, 'both')
    const begin = await a.rpc('begin_photo_upload', {
      p_game: 'drinkit',
      p_purpose: 'drink_log',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 1,
      p_height: 1,
      p_client_request_id: randomUUID(),
    })
    expect(begin.data.ok).toBe(true)
    await a.storage.from(begin.data.bucket).upload(begin.data.storage_path, TINY_JPEG, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    await a.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })

    const abandon = await a.rpc('abandon_photo_upload', { p_photo_id: begin.data.photo_id })
    expect(abandon.data.ok).toBe(true)
    expect(abandon.data.status).toBe('abandoned')
    expect(abandon.data.cleanup_status).toBe('pending')

    const service = createLocalClient(fixtures.summary.supabase_url, fixtures.serviceRoleKey)
    const { data: obj } = await service.storage.from(begin.data.bucket).list(
      begin.data.storage_path.split('/').slice(0, -1).join('/'),
    )
    // Object metadata should still exist after abandon RPC (no SQL delete).
    const name = begin.data.storage_path.split('/').pop()
    const stillThere = (obj ?? []).some((o) => o.name === name)
    expect(stillThere).toBe(true)

    const removed = await a.storage.from(begin.data.bucket).remove([begin.data.storage_path])
    expect(removed.error).toBeNull()
    const cleaned = await a.rpc('mark_photo_storage_cleaned', { p_photo_id: begin.data.photo_id })
    expect(cleaned.data.ok).toBe(true)
    expect(cleaned.data.cleanup_status).toBe('completed')
  })

  it('refuses Storage delete of staged (non-abandoned) objects', async () => {
    if (!fixtures.available) return
    const a = await signInAs(fixtures, 'both')
    const begin = await a.rpc('begin_photo_upload', {
      p_game: 'shipit',
      p_purpose: 'scavenger',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 1,
      p_height: 1,
      p_client_request_id: randomUUID(),
    })
    await a.storage.from(begin.data.bucket).upload(begin.data.storage_path, TINY_JPEG, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    await a.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
    const del = await a.storage.from(begin.data.bucket).remove([begin.data.storage_path])
    // Policy should deny — object remains or error reported
    const mine = await a.rpc('get_my_photo', { p_photo_id: begin.data.photo_id })
    expect(mine.data.status).toBe('staged')
    expect(mine.data.storage_object_present).toBe(true)
    void del
  })
})

describe('Phase 4B2 Gate B — begin idempotency + confirm reconcile', () => {
  it('same begin request id returns the same reservation', async () => {
    if (!fixtures.available) return
    const a = await signInAs(fixtures, 'both')
    const req = randomUUID()
    const first = await a.rpc('begin_photo_upload', {
      p_game: 'shipit',
      p_purpose: 'scavenger',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 2,
      p_height: 2,
      p_client_request_id: req,
    })
    const second = await a.rpc('begin_photo_upload', {
      p_game: 'shipit',
      p_purpose: 'scavenger',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 2,
      p_height: 2,
      p_client_request_id: req,
    })
    expect(first.data.ok).toBe(true)
    expect(second.data.ok).toBe(true)
    expect(second.data.idempotent_replay).toBe(true)
    expect(second.data.photo_id).toBe(first.data.photo_id)
    expect(second.data.storage_path).toBe(first.data.storage_path)
  })

  it('confirm after upload-without-confirm recovers staging', async () => {
    if (!fixtures.available) return
    const a = await signInAs(fixtures, 'both')
    const begin = await a.rpc('begin_photo_upload', {
      p_game: 'shipit',
      p_purpose: 'scavenger',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 1,
      p_height: 1,
      p_client_request_id: randomUUID(),
    })
    await a.storage.from(begin.data.bucket).upload(begin.data.storage_path, TINY_JPEG, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    // Simulate lost confirm: call confirm twice
    const c1 = await a.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
    const c2 = await a.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
    expect(c1.data.ok).toBe(true)
    expect(c2.data.ok).toBe(true)
    expect(c2.data.idempotent_replay).toBe(true)
  })
})
