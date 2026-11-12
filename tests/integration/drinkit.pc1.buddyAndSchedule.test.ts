/**
 * PC1 — Drink It! buddy eligibility coverage + schedule/hour assertions.
 * Daily Challenge attendance contract is intentionally NOT enforced here.
 */
import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
  playerId,
  submitAt,
} from '../helpers/drinkitSubmit'
import { assertDisposableDevEnvironment } from '../helpers/devEnvironmentGuard'
import type { ClockFixtures } from '../helpers/clockFixtures'

let fixtures: ClockFixtures

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
  await assertDisposableDevEnvironment(fixtures, fixtures.service!)
})

beforeEach(async () => {
  const { error } = await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(
    fixtures.service!,
    `pc1-buddy-${randomUUID().slice(0, 8)}`,
  )
})

describe('PC1 Drink It! buddy rule + schedule', () => {
  it('solo ordinary drink log remains accepted', async () => {
    const at = noonDay1Utc()
    const author = playerId(fixtures, 'drink_only')
    const solo = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        mode: 'generic_beer',
        companions: [],
        selectedClaims: [],
      }),
      at,
    )
    expect(solo.data.ok).toBe(true)
    expect(solo.data.awarded_points).toBe(0)
  })

  it('solo Cocktail Bounty claim is denied; Ingredient solo denied', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')

    const cocktail = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    const { data: cOffer } = await fixtures.service!
      .from('bounty_slot_offers')
      .select('id, cocktail_offering_id, display_snapshot')
      .eq('id', cocktail.data.offer_id)
      .single()

    const blockedCocktail = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: cOffer!.display_snapshot.designated_bar_key as string,
        offeringId: cOffer!.cocktail_offering_id as string,
        companions: [],
        selectedClaims: [{ category: 'cocktail', offer_id: cOffer!.id }],
      }),
      at,
    )
    expect(blockedCocktail.data.ok).toBe(false)

    const ingredient = await fixtures.service!.rpc('dev_get_current_ingredient_bounty_at', {
      p_at_utc: at,
    })
    expect(ingredient.data.status).toBe('active')
    const { data: iOffer } = await fixtures.service!
      .from('bounty_slot_offers')
      .select('id, ingredient_id, display_snapshot')
      .eq('id', ingredient.data.offer_id)
      .single()

    const preview = await fixtures.service!.rpc('drinkit_evaluate_eligibility', {
      p_player_id: author,
      p_at_utc: at,
      p_payload: drinkPayload({
        barKey: 'wake-view',
        mode: 'generic_beer',
        companions: [],
      }),
    })
    const ing = preview.data?.categories?.ingredient
    expect(ing?.reason === 'companion_required' || ing?.status !== 'eligible').toBe(true)
    expect(iOffer!.id).toBeTruthy()
  })

  it('companion outside active Drink It! roster does not qualify; active companion does', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const shipOnly = playerId(fixtures, 'ship_only')
    const both = playerId(fixtures, 'both')

    const cocktail = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    const { data: offer } = await fixtures.service!
      .from('bounty_slot_offers')
      .select('id, cocktail_offering_id, display_snapshot')
      .eq('id', cocktail.data.offer_id)
      .single()

    const badBuddy = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: offer!.display_snapshot.designated_bar_key as string,
        offeringId: offer!.cocktail_offering_id as string,
        companions: [shipOnly],
        selectedClaims: [{ category: 'cocktail', offer_id: offer!.id }],
      }),
      at,
    )
    expect(badBuddy.data.ok).toBe(false)
    expect(String(badBuddy.data.code ?? badBuddy.data.message ?? '')).toMatch(
      /COMPANION_NOT_DRINKIT|companion/i,
    )

    const goodBuddy = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: offer!.display_snapshot.designated_bar_key as string,
        offeringId: offer!.cocktail_offering_id as string,
        companions: [both],
        selectedClaims: [{ category: 'cocktail', offer_id: offer!.id }],
      }),
      at,
    )
    expect(goodBuddy.data.ok).toBe(true)
    expect(goodBuddy.data.awarded_points).toBeGreaterThan(0)
  })

  it('Cocktail windows are hourly; Ingredient windows are two-hour (plus intentional 22–23)', async () => {
    const { schedule } = await activateReadyCatalogAndSchedule(fixtures.service!)
    expect(schedule.cocktail_slots).toBe(72)
    expect(schedule.ingredient_slots).toBe(39)

    const { data: slots } = await fixtures.service!
      .from('bounty_slots')
      .select('category, public_start_ship_local, public_end_ship_local, cruise_day')

    const cocktails = (slots ?? []).filter((s) => s.category === 'cocktail' && s.cruise_day === 1)
    const ingredients = (slots ?? []).filter(
      (s) => s.category === 'ingredient' && s.cruise_day === 1,
    )

    expect(cocktails.length).toBe(11) // 12:00–23:00 hourly
    for (const s of cocktails) {
      const startH = Number(String(s.public_start_ship_local).slice(0, 2))
      const endH = Number(String(s.public_end_ship_local).slice(0, 2))
      expect(endH - startH).toBe(1)
    }

    expect(ingredients.length).toBe(6) // five 2h windows + 22–23
    for (const s of ingredients) {
      const startH = Number(String(s.public_start_ship_local).slice(0, 2))
      const endH = Number(String(s.public_end_ship_local).slice(0, 2))
      const span = endH - startH
      if (startH === 22) expect(span).toBe(1)
      else expect(span).toBe(2)
    }
  })

  it('Friday cutoff remains 6 PM ship time for Drink It!', async () => {
    const justBefore = slotUtc(7, '17:59:59')
    const atCutoff = slotUtc(7, '18:00:00')

    const open = await fixtures.service!.rpc('drinkit_lifecycle_at', { p_at_utc: justBefore })
    const closed = await fixtures.service!.rpc('drinkit_lifecycle_at', { p_at_utc: atCutoff })

    expect(open.data.status === 'open' || open.data.accepting_submissions === true).toBe(true)
    expect(
      closed.data.status === 'final' ||
        closed.data.status === 'finale' ||
        closed.data.accepting_submissions === false,
    ).toBe(true)
  })

  it('Daily Challenge meeting announcement remains non-gating display text', async () => {
    const { data: challenge } = await fixtures.service!
      .from('daily_challenges')
      .select('id, participation_mode, meeting_time_ship_local, admin_announcement')
      .eq('day_number', 1)
      .maybeSingle()

    expect(challenge).toBeTruthy()
    expect(challenge!.meeting_time_ship_local).toBeNull()
    expect(typeof (challenge!.admin_announcement ?? '')).toBe('string')
    expect(
      challenge!.participation_mode === 'all_hands' ||
        challenge!.participation_mode === 'bring_a_friend',
    ).toBe(true)
    // Attestation contract covered in drinkit.pc1.dailyAttest.test.ts
  })
})
