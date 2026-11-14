/**
 * Photo framing — set_photo_framing ownership + persistence.
 *
 *   LOCAL_TEST_PASSWORD='…' npx vitest run --fileParallelism=false tests/integration/media.photo-framing.test.ts
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadLocalFixtures, signInAs, type LocalFixtures } from '../helpers/localSupabase'

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))

let fixtures: LocalFixtures

beforeAll(async () => {
  fixtures = await loadLocalFixtures()
})

async function stageLandscape(client: Awaited<ReturnType<typeof signInAs>>) {
  const begin = await client.rpc('begin_photo_upload', {
    p_game: 'drinkit',
    p_purpose: 'drink_log',
    p_mime_type: 'image/jpeg',
    p_byte_size: TINY_JPEG.length,
    p_width: 1600,
    p_height: 900,
    p_original_filename: 'frame-test.jpg',
  })
  expect(begin.error).toBeNull()
  expect(begin.data.ok).toBe(true)
  const photoId = begin.data.photo_id as string
  const path = begin.data.storage_path as string
  const bucket = begin.data.bucket as string
  const up = await client.storage.from(bucket).upload(path, TINY_JPEG, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  expect(up.error).toBeNull()
  const confirm = await client.rpc('confirm_photo_upload', { p_photo_id: photoId })
  expect(confirm.error).toBeNull()
  expect(confirm.data.ok).toBe(true)
  return { photoId, path, bucket }
}

describe('photo framing persistence', () => {
  it('reports fixture availability', () => {
    expect(typeof fixtures.available).toBe('boolean')
  })

  it('stores framing on staged photos and returns it from get_my_photo', async () => {
    if (!fixtures.available) return
    const a = await signInAs(fixtures, 'josh_forrester')
    const staged = await stageLandscape(a)

    const set = await a.rpc('set_photo_framing', {
      p_photo_id: staged.photoId,
      p_crop_zoom: 2,
      p_crop_center_x: 0.35,
      p_crop_center_y: 0.5,
    })
    expect(set.error).toBeNull()
    expect(set.data.ok).toBe(true)
    expect(Number(set.data.framing.zoom)).toBe(2)
    expect(Number(set.data.framing.center_x)).toBeCloseTo(0.35, 3)

    const mine = await a.rpc('get_my_photo', { p_photo_id: staged.photoId })
    expect(mine.error).toBeNull()
    expect(mine.data.ok).toBe(true)
    expect(Number(mine.data.framing.zoom)).toBe(2)
    expect(Number(mine.data.framing.center_x)).toBeCloseTo(0.35, 3)

    await a.rpc('abandon_photo_upload', { p_photo_id: staged.photoId })
  })

  it('snaps illegal centers into the valid pan window for the zoom', async () => {
    if (!fixtures.available) return
    const a = await signInAs(fixtures, 'josh_forrester')
    const staged = await stageLandscape(a)

    // zoom 1 landscape → center_y must be 0.5
    const set = await a.rpc('set_photo_framing', {
      p_photo_id: staged.photoId,
      p_crop_zoom: 1,
      p_crop_center_x: 0.1,
      p_crop_center_y: 0.1,
    })
    expect(set.data.ok).toBe(true)
    expect(Number(set.data.framing.center_y)).toBeCloseTo(0.5, 3)
    expect(Number(set.data.framing.center_x)).toBeGreaterThanOrEqual(0.25 - 1e-3)

    await a.rpc('abandon_photo_upload', { p_photo_id: staged.photoId })
  })

  it('refuses framing updates from another player', async () => {
    if (!fixtures.available) return
    const a = await signInAs(fixtures, 'josh_forrester')
    const staged = await stageLandscape(a)
    const b = await signInAs(fixtures, 'katie_forrester')

    const denied = await b.rpc('set_photo_framing', {
      p_photo_id: staged.photoId,
      p_crop_zoom: 3,
      p_crop_center_x: 0.5,
      p_crop_center_y: 0.5,
    })
    expect(denied.data.ok).toBe(false)
    expect(denied.data.code).toBe('PHOTO_NOT_FOUND')

    await a.rpc('abandon_photo_upload', { p_photo_id: staged.photoId })
  })
})
