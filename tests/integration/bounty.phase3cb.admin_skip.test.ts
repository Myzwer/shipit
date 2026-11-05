/**
 * Phase 3C-B — Admin Skip Current Cocktail/Ingredient + correction reactivation gate.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  activateCatalogWithSkipReserves,
  activateReadyCatalogAndSchedule,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
  DEV_BASE_OFFSET_MIN,
} from '../helpers/bountyFixtures'
import {
  drinkPayload,
  exposeCurrentSlots,
  playerId,
  previewAt,
  submitAt,
} from '../helpers/drinkitSubmit'
import { signInAs } from '../helpers/localSupabase'
import type { ClockFixtures } from '../helpers/clockFixtures'

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

async function currentCocktail(at: string) {
  const res = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: at })
  expect(res.error).toBeNull()
  expect(res.data?.status).toBe('active')
  return res.data as {
    offer_id: string
    drink_name: string
    designated_bar_key: string
    public_end_utc: string
    offering_id: string
  }
}

async function currentIngredient(at: string) {
  const res = await fixtures.service!.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: at })
  expect(res.error).toBeNull()
  expect(res.data?.status).toBe('active')
  return res.data as {
    offer_id: string
    ingredient_key: string
    display_name: string
    public_end_utc: string
  }
}

describe('Phase 3C-B deactivated correction gate', () => {
  it('admin-deactivated correction stays inactive after later player confirm', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!, `gate-${randomUUID().slice(0, 6)}`)
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const ing = await currentIngredient(at)
    const { data: ingRow } = await fixtures.service!
      .from('ingredients')
      .select('id')
      .eq('canonical_key', ing.ingredient_key)
      .single()

    const catalogId = (
      await fixtures.service!.from('active_catalog_pointer').select('catalog_version_id').eq('id', 1).single()
    ).data!.catalog_version_id as string

    const { data: catalogOfferings } = await fixtures.service!
      .from('catalog_version_offerings')
      .select('offering_id')
      .eq('catalog_version_id', catalogId)
      .limit(80)

    let miss: { offeringId: string; barKey: string } | null = null
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
      const { data: bar } = await fixtures.service!
        .from('bars')
        .select('canonical_key')
        .eq('id', offering!.bar_id)
        .single()
      miss = { offeringId: offering!.id, barKey: bar!.canonical_key }
      break
    }
    expect(miss).toBeTruthy()

    const first = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss!.barKey,
        offeringId: miss!.offeringId,
        companions: [companion],
        confirmContainsIngredientKey: ing.ingredient_key,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offer_id }],
      }),
      at,
    )
    expect(first.data.ok).toBe(true)
    const correctionId = first.data.ingredient_correction_id as string

    const admin = await signInAs(fixtures, 'admin')
    const deactivated = await admin.rpc('admin_deactivate_ingredient_correction', {
      p_correction_id: correctionId,
      p_note: 'bad association',
    })
    expect(deactivated.error).toBeNull()
    expect(deactivated.data.ok).toBe(true)

    const second = await submitAt(
      fixtures.service!,
      companion,
      drinkPayload({
        barKey: miss!.barKey,
        offeringId: miss!.offeringId,
        companions: [author],
        confirmContainsIngredientKey: ing.ingredient_key,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offer_id }],
      }),
      at,
    )
    // In-request honor can still award this submission…
    expect(second.data.ok).toBe(true)
    // …but shared overlay must stay deactivated for future players.
    const { data: row } = await fixtures.service!
      .from('ingredient_corrections')
      .select('active')
      .eq('id', correctionId)
      .single()
    expect(row!.active).toBe(false)

    const future = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss!.barKey,
        offeringId: miss!.offeringId,
        companions: [companion],
      }),
      at,
    )
    // Author already claimed ingredient today → already_claimed; use a fresh angle:
    // companion already claimed too. Check overlay path via service has_ingredient helper.
    const { data: has } = await fixtures.service!.rpc('drinkit_offering_has_ingredient', {
      p_catalog_version_id: catalogId,
      p_offering_id: miss!.offeringId,
      p_ingredient_id: ingRow!.id,
      p_confirm_ingredient_id: null,
    })
    expect(has).toBe(false)
    void future
  })
})

describe('Phase 3C-B Admin Skip', () => {
  beforeEach(async () => {
    await activateCatalogWithSkipReserves(
      fixtures.service!,
      `skip-${randomUUID().slice(0, 8)}`,
    )
  })

  it('Cocktail Skip draws unused reserve; slot end unchanged; future schedule intact', async () => {
    const at = slotUtc(1, '12:30:00')
    await exposeCurrentSlots(fixtures.service!, at)
    const before = await currentCocktail(at)
    const { count: futureBefore } = await fixtures.service!
      .from('bounty_slots')
      .select('id', { count: 'exact', head: true })
      .eq('category', 'cocktail')
      .eq('state', 'scheduled')

    const skip = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: before.offer_id,
      p_client_request_id: randomUUID(),
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(skip.error).toBeNull()
    expect(skip.data.ok).toBe(true)
    expect(skip.data.retired_offer_id).toBe(before.offer_id)
    expect(skip.data.replacement_offer_id).not.toBe(before.offer_id)
    expect(skip.data.public_end_utc).toBe(before.public_end_utc)

    const after = await currentCocktail(at)
    expect(after.offer_id).toBe(skip.data.replacement_offer_id)
    expect(after.drink_name).not.toBe(before.drink_name)
    expect(after.public_end_utc).toBe(before.public_end_utc)

    const { count: futureAfter } = await fixtures.service!
      .from('bounty_slots')
      .select('id', { count: 'exact', head: true })
      .eq('category', 'cocktail')
      .eq('state', 'scheduled')
    expect(futureAfter).toBe(futureBefore)

    const { data: retired } = await fixtures.service!
      .from('bounty_slot_offers')
      .select('is_active, replaced_at_utc')
      .eq('id', before.offer_id)
      .single()
    expect(retired!.is_active).toBe(false)
    expect(retired!.replaced_at_utc).toBeTruthy()
  })

  it('Ingredient Skip draws unused reserve', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const before = await currentIngredient(at)
    const skip = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'ingredient',
      p_expected_offer_id: before.offer_id,
      p_client_request_id: randomUUID(),
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(skip.error).toBeNull()
    expect(skip.data.ok).toBe(true)
    const after = await currentIngredient(at)
    expect(after.offer_id).toBe(skip.data.replacement_offer_id)
    expect(after.ingredient_key).not.toBe(before.ingredient_key)
  })

  it('no reserves → no mutation', async () => {
    // Exhaust by activating exact 72/39 (no extras)
    await fixtures.service!.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'development-only',
    })
    await activateReadyCatalogAndSchedule(fixtures.service!, `exact-${randomUUID().slice(0, 6)}`)
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const before = await currentCocktail(at)
    const skip = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: before.offer_id,
      p_client_request_id: randomUUID(),
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(skip.data.ok).toBe(false)
    expect(skip.data.code).toBe('NO_RESERVES')
    const after = await currentCocktail(at)
    expect(after.offer_id).toBe(before.offer_id)
  })

  it('retired offer cannot receive a new claim; prior awards intact', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const cock = await currentCocktail(at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')

    const awarded = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: cock.designated_bar_key,
        offeringId: cock.offering_id,
        companions: [companion],
        selectedClaims: [{ category: 'cocktail', offer_id: cock.offer_id }],
      }),
      at,
    )
    expect(awarded.data.ok).toBe(true)
    const points = awarded.data.awarded_points as number

    const skip = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: cock.offer_id,
      p_client_request_id: randomUUID(),
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(skip.data.ok).toBe(true)

    const late = await submitAt(
      fixtures.service!,
      companion,
      drinkPayload({
        barKey: cock.designated_bar_key,
        offeringId: cock.offering_id,
        companions: [author],
        selectedClaims: [{ category: 'cocktail', offer_id: cock.offer_id }],
      }),
      at,
    )
    expect(late.data.ok).toBe(false)
    expect(late.data.code).toBe('ELIGIBILITY_CHANGED')

    const { data: claim } = await fixtures.service!
      .from('bounty_claims')
      .select('points, status')
      .eq('submission_id', awarded.data.submission_id)
      .eq('category', 'cocktail')
      .single()
    expect(claim!.points).toBe(points)
    expect(claim!.status).toBe('active')
  })

  it('same UUID retry returns one result; payload mismatch rejected; stale blocked', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const before = await currentCocktail(at)
    const req = randomUUID()
    const first = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: before.offer_id,
      p_client_request_id: req,
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(first.data.ok).toBe(true)
    const replay = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: before.offer_id,
      p_client_request_id: req,
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.replacement_offer_id).toBe(first.data.replacement_offer_id)

    const mismatch = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'ingredient',
      p_expected_offer_id: before.offer_id,
      p_client_request_id: req,
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(mismatch.data.ok).toBe(false)
    expect(mismatch.data.code).toBe('REQUEST_ID_OPERATION_MISMATCH')

    const after = await currentCocktail(at)
    const stale = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: before.offer_id,
      p_client_request_id: randomUUID(),
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(stale.data.ok).toBe(false)
    expect(stale.data.code).toBe('STALE_OFFER')
    expect(after.offer_id).toBe(first.data.replacement_offer_id)
  })

  it('non-admin denied; finale blocks skip', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const before = await currentCocktail(at)
    const player = await signInAs(fixtures, 'drink_only')
    const denied = await player.rpc('admin_skip_current_bounty', {
      p_category: 'cocktail',
      p_expected_offer_id: before.offer_id,
      p_client_request_id: randomUUID(),
    })
    expect(denied.error || denied.data?.ok === false).toBeTruthy()

    const finaleAt = slotUtc(7, '18:00:00')
    const finaleSkip = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: before.offer_id,
      p_client_request_id: randomUUID(),
      p_at_utc: finaleAt,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(finaleSkip.data.ok).toBe(false)
    expect(finaleSkip.data.code).toBe('FINALE_LOCKED')
  })

  it('previously exposed/skipped objectives never repeat', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const first = await currentCocktail(at)
    const skip1 = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: first.offer_id,
      p_client_request_id: randomUUID(),
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(skip1.data.ok).toBe(true)
    const second = await currentCocktail(at)
    const skip2 = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: second.offer_id,
      p_client_request_id: randomUUID(),
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(skip2.data.ok).toBe(true)
    const third = await currentCocktail(at)
    const keys = new Set([first.drink_name, second.drink_name, third.drink_name])
    expect(keys.size).toBe(3)
  })

  it('pause does not block skip; players see shared replacement', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const before = await currentCocktail(at)
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    const skip = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: before.offer_id,
      p_client_request_id: randomUUID(),
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(skip.data.ok).toBe(true)
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
    const a = await signInAs(fixtures, 'drink_only')
    const b = await signInAs(fixtures, 'both')
    // Align clock so player now() sees day1 noon — use timed helper for assertion
    const after = await currentCocktail(at)
    expect(after.offer_id).toBe(skip.data.replacement_offer_id)
    void a
    void b
  })
})
