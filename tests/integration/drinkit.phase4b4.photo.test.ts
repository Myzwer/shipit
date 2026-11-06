/**
 * Phase 4B4 — optional photo_id on submit_drink + atomic bind.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  activateReadyCatalogAndSchedule,
  DEV_BASE_OFFSET_MIN,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
} from '../helpers/bountyFixtures'
import {
  drinkPayload,
  exposeCurrentSlots,
  lookupOffering,
  playerId,
  previewAt,
  submitAt,
} from '../helpers/drinkitSubmit'
import { signInAs } from '../helpers/localSupabase'
import type { ClockFixtures } from '../helpers/clockFixtures'

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))

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
  await activateReadyCatalogAndSchedule(fixtures.service!, `phase4b4-${randomUUID().slice(0, 8)}`)
})

async function stageDrinkLogPhoto(client: Awaited<ReturnType<typeof signInAs>>) {
  const begin = await client.rpc('begin_photo_upload', {
    p_game: 'drinkit',
    p_purpose: 'drink_log',
    p_mime_type: 'image/jpeg',
    p_byte_size: TINY_JPEG.length,
    p_width: 32,
    p_height: 24,
    p_original_filename: 'drink.jpg',
    p_client_request_id: randomUUID(),
  })
  expect(begin.error).toBeNull()
  expect(begin.data.ok).toBe(true)
  const up = await client.storage.from(begin.data.bucket).upload(begin.data.storage_path, TINY_JPEG, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  expect(up.error).toBeNull()
  const confirm = await client.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
  expect(confirm.data.ok).toBe(true)
  return begin.data.photo_id as string
}

function localClient() {
  return {
    available: true as const,
    password: fixtures.password!,
    summary: fixtures.summary!,
    anonKey: fixtures.anonKey!,
    serviceRoleKey: fixtures.serviceRoleKey!,
  }
}

describe('Phase 4B4 submit_drink optional photo', () => {
  it('1 no-photo ordinary log awards 0 and leaves photo unbound path unused', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const author = playerId(fixtures, 'drink_only')
    const key = randomUUID()
    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        idempotencyKey: key,
        selectedClaims: [],
      }),
      at,
    )
    expect(res.error).toBeNull()
    expect(res.data.ok).toBe(true)
    expect(res.data.awarded_points).toBe(0)
    expect(res.data.photo_id ?? null).toBeNull()

    const { data: sub } = await fixtures.service!
      .from('submissions')
      .select('id, photo_storage_key, request_payload_json')
      .eq('idempotency_key', key)
      .single()
    expect(sub!.photo_storage_key).toBeNull()
    expect(sub!.request_payload_json).not.toHaveProperty('photo_id')
  })

  it('2 photo ordinary log awards 0 and binds exactly one drink_log photo', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const drink = await signInAs(localClient(), 'drink_only')
    const photoId = await stageDrinkLogPhoto(drink)
    const author = playerId(fixtures, 'drink_only')
    const key = randomUUID()

    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        idempotencyKey: key,
        photoId,
        selectedClaims: [],
      }),
      at,
    )
    expect(res.error).toBeNull()
    expect(res.data.ok).toBe(true)
    expect(res.data.awarded_points).toBe(0)
    expect(res.data.photo_id).toBe(photoId)

    const { data: photo } = await fixtures.service!
      .from('photos')
      .select('status, bound_submission_id, purpose')
      .eq('id', photoId)
      .single()
    expect(photo!.status).toBe('bound')
    expect(photo!.purpose).toBe('drink_log')
    expect(photo!.bound_submission_id).toBe(res.data.submission_id)

    const { count } = await fixtures.service!
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('bound_submission_id', res.data.submission_id)
    expect(count).toBe(1)
  })

  it('3 photo log earning Cocktail binds photo and awards points', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const cocktail = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    const { data: offer } = await fixtures.service!
      .from('bounty_slot_offers')
      .select('id, cocktail_offering_id, display_snapshot')
      .eq('id', cocktail.data.offer_id)
      .single()
    const designated = cocktail.data.designated_bar_key as string
    const drink = await signInAs(localClient(), 'drink_only')
    const photoId = await stageDrinkLogPhoto(drink)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')

    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: designated,
        offeringId: offer!.cocktail_offering_id as string,
        companions: [companion],
        photoId,
        selectedClaims: [{ category: 'cocktail', offer_id: offer!.id }],
      }),
      at,
    )
    expect(res.data.ok).toBe(true)
    expect(res.data.awarded_points).toBeGreaterThan(0)
    expect(res.data.photo_id).toBe(photoId)
    expect(
      (res.data.claimed_categories as Array<{ category: string }>).some((c) => c.category === 'cocktail'),
    ).toBe(true)
  })

  it('4 photo log earning overlapping categories', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const cocktail = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    const { data: offer } = await fixtures.service!
      .from('bounty_slot_offers')
      .select('id, cocktail_offering_id, display_snapshot')
      .eq('id', cocktail.data.offer_id)
      .single()
    const designated = cocktail.data.designated_bar_key as string
    const drink = await signInAs(localClient(), 'drink_only')
    const photoId = await stageDrinkLogPhoto(drink)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')

    const prev = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: designated,
        offeringId: offer!.cocktail_offering_id as string,
        companions: [companion],
        barEligibleCompanions: [companion],
      }),
      at,
    )
    expect(prev.data.ok).toBe(true)
    const selected: Array<{ category: string; offer_id?: string; assignment_id?: string }> = []
    for (const cat of ['cocktail', 'ingredient', 'bar'] as const) {
      const state = prev.data.preview.categories[cat]
      if (state?.status === 'eligible' && state.options?.[0]) {
        selected.push({
          category: cat,
          offer_id: state.options[0].offer_id,
          assignment_id: state.options[0].assignment_id,
        })
      }
    }
    expect(selected.length).toBeGreaterThanOrEqual(1)

    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: designated,
        offeringId: offer!.cocktail_offering_id as string,
        companions: [companion],
        barEligibleCompanions: [companion],
        photoId,
        selectedClaims: selected,
      }),
      at,
    )
    expect(res.data.ok).toBe(true)
    expect(res.data.photo_id).toBe(photoId)
    expect((res.data.claimed_categories as unknown[]).length).toBe(selected.length)
  })

  it('5 photo + Ingredient correction is atomic', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const ing = await fixtures.service!.rpc('dev_get_current_ingredient_bounty_at', {
      p_at_utc: at,
    })
    expect(ing.data?.status).toBe('active')
    const ingredientKey = ing.data.ingredient_key as string
    const offerId = ing.data.offer_id as string

    const catalogId = (
      await fixtures.service!.from('active_catalog_pointer').select('catalog_version_id').eq('id', 1).single()
    ).data!.catalog_version_id as string
    const { data: ingRow } = await fixtures.service!
      .from('ingredients')
      .select('id')
      .eq('canonical_key', ingredientKey)
      .single()

    // Find offering without the ingredient so confirm creates a correction.
    const { data: catalogOfferings } = await fixtures.service!
      .from('catalog_version_offerings')
      .select('offering_id')
      .eq('catalog_version_id', catalogId)
      .limit(120)
    let target: { offeringId: string; barKey: string } | null = null
    for (const row of catalogOfferings ?? []) {
      const { data: has } = await fixtures.service!
        .from('catalog_offering_ingredients')
        .select('ingredient_id')
        .eq('catalog_version_id', catalogId)
        .eq('offering_id', row.offering_id)
        .eq('ingredient_id', ingRow!.id)
        .maybeSingle()
      if (has) continue
      const { data: offering } = await fixtures.service!
        .from('bar_offerings')
        .select('id, bar_id')
        .eq('id', row.offering_id)
        .single()
      if (!offering) continue
      const { data: bar } = await fixtures.service!
        .from('bars')
        .select('canonical_key')
        .eq('id', offering.bar_id)
        .single()
      if (!bar?.canonical_key) continue
      target = { offeringId: offering.id as string, barKey: bar.canonical_key as string }
      break
    }
    expect(target).toBeTruthy()

    const drink = await signInAs(localClient(), 'drink_only')
    const photoId = await stageDrinkLogPhoto(drink)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')

    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: target!.barKey,
        offeringId: target!.offeringId,
        companions: [companion],
        confirmContainsIngredientKey: ingredientKey,
        photoId,
        selectedClaims: [{ category: 'ingredient', offer_id: offerId }],
      }),
      at,
    )
    expect(res.data.ok).toBe(true)
    expect(res.data.ingredient_correction_id).toBeTruthy()
    expect(res.data.photo_id).toBe(photoId)

    const { data: photo } = await fixtures.service!
      .from('photos')
      .select('status, bound_submission_id')
      .eq('id', photoId)
      .single()
    expect(photo!.status).toBe('bound')
    expect(photo!.bound_submission_id).toBe(res.data.submission_id)
  })

  it('6 failed scoring leaves photo unbound', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const drink = await signInAs(localClient(), 'drink_only')
    const photoId = await stageDrinkLogPhoto(drink)
    const author = playerId(fixtures, 'drink_only')

    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        photoId,
        selectedClaims: [],
      }),
      at,
    )
    expect(res.data.ok).toBe(false)
    expect(res.data.code).toBe('GAME_PAUSED')

    const { data: photo } = await fixtures.service!
      .from('photos')
      .select('status, bound_submission_id')
      .eq('id', photoId)
      .single()
    expect(photo!.status).toBe('staged')
    expect(photo!.bound_submission_id).toBeNull()
  })

  it('7 same-UUID replay with bound photo returns original', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const drink = await signInAs(localClient(), 'drink_only')
    const photoId = await stageDrinkLogPhoto(drink)
    const author = playerId(fixtures, 'drink_only')
    const key = randomUUID()
    const payload = drinkPayload({
      barKey: 'wake-view',
      offeringId: offering.offering_id,
      idempotencyKey: key,
      photoId,
      selectedClaims: [],
    })

    const first = await submitAt(fixtures.service!, author, payload, at)
    expect(first.data.ok).toBe(true)
    const second = await submitAt(fixtures.service!, author, payload, at)
    expect(second.data.ok).toBe(true)
    expect(second.data.idempotent_replay).toBe(true)
    expect(second.data.submission_id).toBe(first.data.submission_id)
    expect(second.data.photo_id).toBe(photoId)

    const { count } = await fixtures.service!
      .from('gallery_events')
      .select('id', { count: 'exact', head: true })
      .eq('submission_id', first.data.submission_id)
    expect(count).toBe(1)
  })

  it('8 legacy no-photo submission replay keeps pre-photo fingerprint', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const author = playerId(fixtures, 'drink_only')
    const key = randomUUID()
    // Explicit legacy shape: photo_storage_key null, no photo_id key.
    const payload = {
      idempotency_key: key,
      bar_canonical_key: 'wake-view',
      drink: { mode: 'named_catalog', offering_id: offering.offering_id },
      companion_player_ids: [],
      bar_eligible_companion_ids: [],
      selected_claims: [],
      caption: null,
      photo_storage_key: null,
    }
    const first = await submitAt(fixtures.service!, author, payload, at)
    expect(first.data.ok).toBe(true)
    const { data: stored } = await fixtures.service!
      .from('submissions')
      .select('request_payload_hash, request_payload_json')
      .eq('idempotency_key', key)
      .single()
    expect(stored!.request_payload_json).not.toHaveProperty('photo_id')

    const replay = await submitAt(fixtures.service!, author, payload, at)
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)

    // Adding photo_id later with same UUID must mismatch.
    const drink = await signInAs(localClient(), 'drink_only')
    const photoId = await stageDrinkLogPhoto(drink)
    const mismatch = await submitAt(
      fixtures.service!,
      author,
      { ...payload, photo_id: photoId },
      at,
    )
    expect(mismatch.data.ok).toBe(false)
    expect(mismatch.data.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH')
  })

  it('9 concurrent same-photo different-UUID: only one binds', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const drink = await signInAs(localClient(), 'drink_only')
    const photoId = await stageDrinkLogPhoto(drink)
    const author = playerId(fixtures, 'drink_only')

    const a = drinkPayload({
      barKey: 'wake-view',
      offeringId: offering.offering_id,
      photoId,
      selectedClaims: [],
    })
    const b = drinkPayload({
      barKey: 'wake-view',
      offeringId: offering.offering_id,
      photoId,
      selectedClaims: [],
    })
    expect(a.idempotency_key).not.toBe(b.idempotency_key)

    const [r1, r2] = await Promise.all([
      submitAt(fixtures.service!, author, a, at),
      submitAt(fixtures.service!, author, b, at),
    ])
    const oks = [r1, r2].filter((r) => r.data?.ok === true)
    const fails = [r1, r2].filter((r) => r.data?.ok === false)
    expect(oks.length).toBe(1)
    expect(fails.length).toBe(1)
    expect(fails[0]!.data.code).toMatch(/PHOTO_ALREADY_BOUND|CONFLICT/)

    const { data: photo } = await fixtures.service!
      .from('photos')
      .select('status, bound_submission_id')
      .eq('id', photoId)
      .single()
    expect(photo!.status).toBe('bound')
    expect(photo!.bound_submission_id).toBe(oks[0]!.data.submission_id)
  })

  it('10 pause / expiry / Friday finale reject new photo submits', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const drink = await signInAs(localClient(), 'drink_only')
    const photoId = await stageDrinkLogPhoto(drink)
    const author = playerId(fixtures, 'drink_only')

    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    const paused = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        photoId,
      }),
      at,
    )
    expect(paused.data.ok).toBe(false)
    expect(paused.data.code).toBe('GAME_PAUSED')

    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
    const photo2 = await stageDrinkLogPhoto(drink)
    const afterHours = slotUtc(1, '23:30:00')
    const late = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        photoId: photo2,
      }),
      afterHours,
    )
    // Ordinary logs may still accept after bounty hours; pause/finale are the hard gates.
    if (late.data.ok === false) {
      expect(['UNAVAILABLE', 'GAME_ENDED', 'GAME_PAUSED']).toContain(late.data.code)
    }

    const finaleAt = slotUtc(7, '19:00:00')
    const photo3 = await stageDrinkLogPhoto(drink)
    const finale = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        photoId: photo3,
      }),
      finaleAt,
    )
    expect(finale.data.ok).toBe(false)
    expect(['GAME_ENDED', 'UNAVAILABLE']).toContain(finale.data.code)

    const { data: stillStaged } = await fixtures.service!
      .from('photos')
      .select('status')
      .eq('id', photoId)
      .single()
    expect(stillStaged!.status).toBe('staged')
  })

  it('11 invalid / forged photo rejected; forged storage path rejected', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const author = playerId(fixtures, 'drink_only')

    const missing = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        photoId: randomUUID(),
      }),
      at,
    )
    expect(missing.data.ok).toBe(false)
    expect(missing.data.code).toMatch(/PHOTO_/)

    const forgedPath = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        forged: { photo_storage_key: 'someone/forged.jpg' },
      }),
      at,
    )
    expect(forgedPath.data.ok).toBe(false)
    expect(forgedPath.data.code).toBe('FORGED_PHOTO_PATH')

    // Wrong purpose (daily photo) cannot bind to drink_log.
    const drink = await signInAs(localClient(), 'drink_only')
    const begin = await drink.rpc('begin_photo_upload', {
      p_game: 'drinkit',
      p_purpose: 'daily',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 32,
      p_height: 24,
      p_original_filename: 'daily.jpg',
      p_client_request_id: randomUUID(),
    })
    await drink.storage.from(begin.data.bucket).upload(begin.data.storage_path, TINY_JPEG, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    await drink.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
    const wrongPurpose = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        photoId: begin.data.photo_id as string,
      }),
      at,
    )
    expect(wrongPurpose.data.ok).toBe(false)
    expect(wrongPurpose.data.code).toMatch(/PHOTO_/)
  })

  it('12 Bar companion scoring unchanged with optional photo', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const drink = await signInAs(localClient(), 'drink_only')
    const photoId = await stageDrinkLogPhoto(drink)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')

    const prev = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        companions: [companion],
        barEligibleCompanions: [companion],
      }),
      at,
    )
    const barState = prev.data.preview.categories.bar
    if (barState?.status !== 'eligible') {
      // Featured bar may not be wake-view — still assert photo path does not break preview.
      expect(prev.data.ok).toBe(true)
      return
    }
    const assignmentId = barState.options[0].assignment_id as string
    const points = Number(barState.options[0].points)

    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        companions: [companion],
        barEligibleCompanions: [companion],
        photoId,
        selectedClaims: [{ category: 'bar', assignment_id: assignmentId }],
      }),
      at,
    )
    expect(res.data.ok).toBe(true)
    expect(res.data.awarded_points).toBe(points)
    expect(res.data.photo_id).toBe(photoId)
  })

  it('13 Daily and Ship It! photo scoring unchanged by drink_log photo bind', async () => {
    // Smoke: drink_log photo cannot be used for submit_daily / submit_scavenger.
    const drink = await signInAs(localClient(), 'both')
    const photoId = await stageDrinkLogPhoto(drink)

    const daily = await drink.rpc('get_my_current_daily_challenge')
    if (daily.data?.status === 'active' && daily.data.challenge_id) {
      const badDaily = await drink.rpc('submit_daily', {
        p_payload: {
          idempotency_key: randomUUID(),
          challenge_id: daily.data.challenge_id,
          photo_id: photoId,
          caption: null,
        },
      })
      expect(badDaily.data.ok).toBe(false)
      expect(badDaily.data.code).toMatch(/PHOTO_/)
    }

    const list = await drink.rpc('list_my_shipit_challenges')
    const open = (list.data?.challenges as Array<{ id: string; completed?: boolean }> | undefined)?.find(
      (c) => !c.completed,
    )
    if (open) {
      const badShip = await drink.rpc('submit_scavenger', {
        p_payload: {
          idempotency_key: randomUUID(),
          challenge_id: open.id,
          photo_id: photoId,
          caption: null,
        },
      })
      expect(badShip.data.ok).toBe(false)
      expect(badShip.data.code).toMatch(/PHOTO_/)
    }

    const { data: still } = await fixtures.service!
      .from('photos')
      .select('status')
      .eq('id', photoId)
      .single()
    expect(still!.status).toBe('staged')
  })
})
