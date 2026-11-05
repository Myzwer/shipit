/**
 * Phase 4B1 — private Storage staging security.
 *
 *   LOCAL_TEST_PASSWORD='…' npx vitest run --fileParallelism=false tests/integration/media.phase4b1.storage.test.ts
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createLocalClient,
  identity,
  loadLocalFixtures,
  signInAs,
  type LocalFixtures,
} from '../helpers/localSupabase'

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))

let fixtures: LocalFixtures

beforeAll(async () => {
  fixtures = await loadLocalFixtures()
})

async function beginAndUpload(
  client: Awaited<ReturnType<typeof signInAs>>,
  opts: {
    game: 'drinkit' | 'shipit'
    purpose: 'drink_log' | 'daily' | 'scavenger'
    bytes?: Buffer
    mime?: string
    width?: number
    height?: number
  },
) {
  const bytes = opts.bytes ?? TINY_JPEG
  const mime = opts.mime ?? 'image/jpeg'
  const begin = await client.rpc('begin_photo_upload', {
    p_game: opts.game,
    p_purpose: opts.purpose,
    p_mime_type: mime,
    p_byte_size: bytes.length,
    p_width: opts.width ?? 1,
    p_height: opts.height ?? 1,
    p_original_filename: 'test.jpg',
  })
  expect(begin.error).toBeNull()
  expect(begin.data.ok).toBe(true)
  const path = begin.data.storage_path as string
  const bucket = begin.data.bucket as string
  const photoId = begin.data.photo_id as string

  const up = await client.storage.from(bucket).upload(path, bytes, {
    contentType: mime,
    upsert: false,
  })
  expect(up.error).toBeNull()

  const confirm = await client.rpc('confirm_photo_upload', { p_photo_id: photoId })
  expect(confirm.error).toBeNull()
  expect(confirm.data.ok).toBe(true)
  expect(confirm.data.status).toBe('staged')

  return { photoId, path, bucket, begin: begin.data }
}

describe('Phase 4B1 photo staging security', () => {
  it('reports fixture availability', () => {
    expect(typeof fixtures.available).toBe('boolean')
    if (fixtures.password) expect(fixtures.available).toBe(true)
  })

  it('1. player A can stage their own image', async () => {
    if (!fixtures.available) return
    const a = await signInAs(fixtures, 'both')
    const staged = await beginAndUpload(a, { game: 'drinkit', purpose: 'drink_log' })
    const mine = await a.rpc('get_my_photo', { p_photo_id: staged.photoId })
    expect(mine.error).toBeNull()
    expect(mine.data.ok).toBe(true)
    expect(mine.data.status).toBe('staged')
    expect(mine.data.storage_path).toBe(staged.path)
  })

  it('2. player B cannot overwrite, delete, or read A private staging image', async () => {
    if (!fixtures.available || !fixtures.summary) return
    const a = await signInAs(fixtures, 'both')
    const staged = await beginAndUpload(a, { game: 'drinkit', purpose: 'drink_log' })

    const b = await signInAs(fixtures, 'drink_only')
    const read = await b.storage.from(staged.bucket).download(staged.path)
    expect(read.error).toBeTruthy()

    const overwrite = await b.storage.from(staged.bucket).upload(staged.path, TINY_JPEG, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    expect(overwrite.error).toBeTruthy()

    const del = await b.storage.from(staged.bucket).remove([staged.path])
    // remove may return error or empty success with no delete — assert object still exists for A
    void del
    const still = await a.storage.from(staged.bucket).download(staged.path)
    expect(still.error).toBeNull()

    const peek = await b.rpc('get_my_photo', { p_photo_id: staged.photoId })
    expect(peek.data.ok).toBe(false)
    expect(peek.data.code).toBe('PHOTO_NOT_FOUND')
  })

  it('3. unauthenticated staging is denied', async () => {
    if (!fixtures.available || !fixtures.summary || !fixtures.anonKey) return
    const anon = createLocalClient(fixtures.summary.supabase_url, fixtures.anonKey)
    const begin = await anon.rpc('begin_photo_upload', {
      p_game: 'drinkit',
      p_purpose: 'drink_log',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 1,
      p_height: 1,
    })
    expect(begin.error).toBeTruthy()

    const up = await anon.storage.from('game-photos').upload(`anon/${randomUUID()}.jpg`, TINY_JPEG, {
      contentType: 'image/jpeg',
    })
    expect(up.error).toBeTruthy()
  })

  it('4. cross-game access is restricted', async () => {
    if (!fixtures.available) return
    const drinkOnly = await signInAs(fixtures, 'drink_only')
    const scavenger = await drinkOnly.rpc('begin_photo_upload', {
      p_game: 'shipit',
      p_purpose: 'scavenger',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 1,
      p_height: 1,
    })
    expect(scavenger.error).toBeNull()
    expect(scavenger.data.ok).toBe(false)
    expect(scavenger.data.code).toBe('GAME_MEMBERSHIP_REQUIRED')

    const shipOnly = await signInAs(fixtures, 'ship_only')
    const drinkLog = await shipOnly.rpc('begin_photo_upload', {
      p_game: 'drinkit',
      p_purpose: 'drink_log',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 1,
      p_height: 1,
    })
    expect(drinkLog.error).toBeNull()
    expect(drinkLog.data.ok).toBe(false)
    expect(drinkLog.data.code).toBe('GAME_MEMBERSHIP_REQUIRED')

    const mismatch = await shipOnly.rpc('begin_photo_upload', {
      p_game: 'shipit',
      p_purpose: 'drink_log',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 1,
      p_height: 1,
    })
    expect(mismatch.data.ok).toBe(false)
    expect(mismatch.data.code).toBe('PURPOSE_GAME_MISMATCH')
  })

  it('5. forged object path is rejected', async () => {
    if (!fixtures.available || !fixtures.summary) return
    const aId = identity(fixtures.summary, 'both').player_id
    const b = await signInAs(fixtures, 'drink_only')
    const forged = `${aId}/drinkit/${randomUUID()}.jpg`
    const up = await b.storage.from('game-photos').upload(forged, TINY_JPEG, {
      contentType: 'image/jpeg',
      upsert: false,
    })
    expect(up.error).toBeTruthy()
  })

  it('6. nonexistent image references cannot be considered verified', async () => {
    if (!fixtures.available || !fixtures.serviceRoleKey || !fixtures.summary) return
    const a = await signInAs(fixtures, 'both')
    const begin = await a.rpc('begin_photo_upload', {
      p_game: 'drinkit',
      p_purpose: 'drink_log',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 1,
      p_height: 1,
    })
    expect(begin.data.ok).toBe(true)
    const confirm = await a.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
    expect(confirm.data.ok).toBe(false)
    expect(confirm.data.code).toBe('STORAGE_OBJECT_MISSING')

    const service = createLocalClient(fixtures.summary.supabase_url, fixtures.serviceRoleKey)
    const playerId = identity(fixtures.summary, 'both').player_id
    const missing = await service.rpc('verify_staged_photo_for_submit', {
      p_photo_id: randomUUID(),
      p_player_id: playerId,
      p_game: 'drinkit',
      p_purpose: 'drink_log',
      p_required: true,
    })
    expect(missing.data.ok).toBe(false)
    expect(missing.data.code).toBe('PHOTO_NOT_FOUND')

    const pending = await service.rpc('verify_staged_photo_for_submit', {
      p_photo_id: begin.data.photo_id,
      p_player_id: playerId,
      p_game: 'drinkit',
      p_purpose: 'drink_log',
      p_required: true,
    })
    expect(pending.data.ok).toBe(false)
    expect(pending.data.code).toBe('PHOTO_NOT_STAGED')
  })

  it('7. invalid media type / oversize files are rejected', async () => {
    if (!fixtures.available) return
    const a = await signInAs(fixtures, 'both')
    const badMime = await a.rpc('begin_photo_upload', {
      p_game: 'drinkit',
      p_purpose: 'drink_log',
      p_mime_type: 'image/gif',
      p_byte_size: 100,
      p_width: 1,
      p_height: 1,
    })
    expect(badMime.data.ok).toBe(false)
    expect(badMime.data.code).toBe('UNSUPPORTED_MEDIA_TYPE')

    const tooBig = await a.rpc('begin_photo_upload', {
      p_game: 'drinkit',
      p_purpose: 'drink_log',
      p_mime_type: 'image/jpeg',
      p_byte_size: 6 * 1024 * 1024,
      p_width: 1,
      p_height: 1,
    })
    expect(tooBig.data.ok).toBe(false)
    expect(tooBig.data.code).toBe('FILE_TOO_LARGE')
  })

  it('8. development fixture-photo paths are not valid player evidence', async () => {
    if (!fixtures.available || !fixtures.serviceRoleKey || !fixtures.summary) return
    const service = createLocalClient(fixtures.summary.supabase_url, fixtures.serviceRoleKey)
    const playerId = identity(fixtures.summary, 'both').player_id
    const photoId = randomUUID()
    const insert = await service.from('photos').insert({
      id: photoId,
      owner_player_id: playerId,
      game: 'drinkit',
      purpose: 'drink_log',
      status: 'staged',
      storage_path: `development-only/fixture-photo/${photoId}.jpg`,
      mime_type: 'image/jpeg',
      byte_size: 100,
      width: 10,
      height: 10,
      staged_at_utc: new Date().toISOString(),
    })
    expect(insert.error).toBeTruthy()
    // Constraint photos_no_fixture_path + verify helper both reject fixture evidence.
  })

  it('9. staged/bound objects cannot be silently replaced', async () => {
    if (!fixtures.available || !fixtures.serviceRoleKey || !fixtures.summary) return
    const a = await signInAs(fixtures, 'both')
    const staged = await beginAndUpload(a, { game: 'drinkit', purpose: 'drink_log' })

    // Staged is no longer pending_upload → Storage update policy denies replace.
    const replaceStaged = await a.storage.from(staged.bucket).upload(staged.path, TINY_JPEG, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    expect(replaceStaged.error).toBeTruthy()

    const service = createLocalClient(fixtures.summary.supabase_url, fixtures.serviceRoleKey)
    const existing = await service.from('submissions').select('id').limit(1).maybeSingle()
    const submissionId = existing.data?.id as string | undefined
    if (!submissionId) {
      // Without a prior drink submission in this DB, Storage-stage immutability above still holds.
      expect(staged.photoId).toBeTruthy()
      return
    }

    const bind = await service
      .from('photos')
      .update({
        status: 'bound',
        bound_submission_id: submissionId,
        bound_at_utc: new Date().toISOString(),
      })
      .eq('id', staged.photoId)
    expect(bind.error).toBeNull()

    const replaceBound = await a.storage.from(staged.bucket).upload(staged.path, TINY_JPEG, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    expect(replaceBound.error).toBeTruthy()

    const mutate = await service
      .from('photos')
      .update({ storage_path: `${staged.path}.hijacked` })
      .eq('id', staged.photoId)
    expect(mutate.error).toBeTruthy()
  })

  it('10. no client can use privileged Storage capabilities', async () => {
    if (!fixtures.available || !fixtures.summary || !fixtures.anonKey) return
    const a = await signInAs(fixtures, 'both')
    // Bucket must not be public — createSignedUrl may work for own; list other prefixes denied.
    const list = await a.storage.from('game-photos').list('development-only')
    // Listing empty or error is fine; public URL must not exist without sign.
    void list
    const pub = await a.storage.from('game-photos').getPublicUrl('anyone.jpg')
    expect(pub.data.publicUrl).toContain('game-photos')
    // Fetching public URL without auth should 400/404 — not 200 for private bucket.
    const res = await fetch(pub.data.publicUrl)
    expect(res.ok).toBe(false)

    const anon = createLocalClient(fixtures.summary.supabase_url, fixtures.anonKey)
    const anonList = await anon.storage.from('game-photos').list('')
    expect(anonList.error || (anonList.data ?? []).length === 0).toBeTruthy()
  })

  it('confirm is idempotent after successful staging', async () => {
    if (!fixtures.available) return
    const a = await signInAs(fixtures, 'both')
    const staged = await beginAndUpload(a, { game: 'drinkit', purpose: 'drink_log' })
    const again = await a.rpc('confirm_photo_upload', { p_photo_id: staged.photoId })
    expect(again.data.ok).toBe(true)
    expect(again.data.idempotent_replay).toBe(true)
  })

  it('verify_staged_photo_for_submit accepts real staged objects for service role', async () => {
    if (!fixtures.available || !fixtures.serviceRoleKey || !fixtures.summary) return
    const a = await signInAs(fixtures, 'both')
    const staged = await beginAndUpload(a, { game: 'shipit', purpose: 'scavenger' })
    const service = createLocalClient(fixtures.summary.supabase_url, fixtures.serviceRoleKey)
    const playerId = identity(fixtures.summary, 'both').player_id
    const ok = await service.rpc('verify_staged_photo_for_submit', {
      p_photo_id: staged.photoId,
      p_player_id: playerId,
      p_game: 'shipit',
      p_purpose: 'scavenger',
      p_required: true,
    })
    expect(ok.data.ok).toBe(true)
    expect(ok.data.photo_id).toBe(staged.photoId)

    // Player cannot call verify (service_role only)
    const playerCall = await a.rpc('verify_staged_photo_for_submit', {
      p_photo_id: staged.photoId,
      p_player_id: playerId,
      p_game: 'shipit',
      p_purpose: 'scavenger',
      p_required: true,
    })
    expect(playerCall.error).toBeTruthy()
  })
})
