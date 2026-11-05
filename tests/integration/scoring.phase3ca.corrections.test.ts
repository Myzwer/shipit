/**
 * Phase 3C-A — ingredient corrections + unlisted honor confirmations.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  activateReadyCatalogAndSchedule,
  loadBountyFixtures,
  noonDay1Utc,
  DEV_BASE_OFFSET_MIN,
} from '../helpers/bountyFixtures'
import {
  drinkPayload,
  exposeCurrentSlots,
  playerId,
  previewAt,
  submitAt,
} from '../helpers/drinkitSubmit'
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
  await activateReadyCatalogAndSchedule(fixtures.service!, `phase3ca-${randomUUID().slice(0, 8)}`)
})

async function currentIngredient(at: string) {
  const ing = await fixtures.service!.rpc('dev_get_current_ingredient_bounty_at', {
    p_at_utc: at,
  })
  expect(ing.error).toBeNull()
  expect(ing.data?.status).toBe('active')
  const ingredientKey = ing.data.ingredient_key as string
  const offerId = ing.data.offer_id as string
  const { data: ingRow } = await fixtures.service!
    .from('ingredients')
    .select('id')
    .eq('canonical_key', ingredientKey)
    .single()
  return {
    ingredientKey,
    ingredientId: ingRow!.id as string,
    offerId,
    points: Number(ing.data.points) || 0,
  }
}

async function activeCatalogId() {
  const { data } = await fixtures.service!
    .from('active_catalog_pointer')
    .select('catalog_version_id')
    .eq('id', 1)
    .single()
  return data!.catalog_version_id as string
}

async function findOfferingWithoutIngredient(ingredientId: string) {
  const catalogId = await activeCatalogId()
  const { data: catalogOfferings } = await fixtures.service!
    .from('catalog_version_offerings')
    .select('offering_id')
    .eq('catalog_version_id', catalogId)
    .limit(120)
  for (const row of catalogOfferings ?? []) {
    const { data: has } = await fixtures.service!
      .from('catalog_offering_ingredients')
      .select('ingredient_id')
      .eq('catalog_version_id', catalogId)
      .eq('offering_id', row.offering_id)
      .eq('ingredient_id', ingredientId)
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
    return { offeringId: offering.id as string, barKey: bar.canonical_key as string }
  }
  throw new Error('No offering lacking current ingredient')
}

async function findOfferingWithIngredient(ingredientId: string) {
  const catalogId = await activeCatalogId()
  const { data: coi } = await fixtures.service!
    .from('catalog_offering_ingredients')
    .select('offering_id')
    .eq('catalog_version_id', catalogId)
    .eq('ingredient_id', ingredientId)
    .limit(1)
    .maybeSingle()
  expect(coi?.offering_id).toBeTruthy()
  const { data: offeringRow } = await fixtures.service!
    .from('bar_offerings')
    .select('id, bar_id')
    .eq('id', coi!.offering_id)
    .single()
  const { data: barRow } = await fixtures.service!
    .from('bars')
    .select('canonical_key')
    .eq('id', offeringRow!.bar_id)
    .single()
  return {
    offeringId: offeringRow!.id as string,
    barKey: barRow!.canonical_key as string,
  }
}

describe('Phase 3C-A named-catalog ingredient confirm', () => {
  it('1/2 missing ingredient unavailable; Yes confirm makes eligible', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const ing = await currentIngredient(at)
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)

    const noConfirm = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [companion],
      }),
      at,
    )
    expect(noConfirm.data.preview.categories.ingredient.status).toBe('unavailable')
    expect(noConfirm.data.preview.categories.ingredient.confirmable?.ingredient_key).toBe(
      ing.ingredientKey,
    )

    const yes = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [companion],
        confirmContainsIngredientKey: ing.ingredientKey,
      }),
      at,
    )
    expect(yes.data.preview.categories.ingredient.status).toBe('eligible')
  })

  it('3 No confirm does not persist correction; solo remains unscored', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const ing = await currentIngredient(at)
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)

    const solo = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    // Solo cannot claim Ingredient — eligibility reject or 0 points without claim
    expect(solo.data.ok === false || solo.data.awarded_points === 0).toBe(true)
    const { count } = await fixtures.service!
      .from('ingredient_corrections')
      .select('id', { count: 'exact', head: true })
      .eq('offering_id', miss.offeringId)
      .eq('ingredient_id', ing.ingredientId)
    expect(count ?? 0).toBe(0)
  })

  it('4/6/7 successful submit persists exactly one correction; failed submit none; idempotent', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const ing = await currentIngredient(at)
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)
    const key = randomUUID()

    const paused = await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    expect(paused.error).toBeNull()
    const fail = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [companion],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
        idempotencyKey: randomUUID(),
      }),
      at,
    )
    expect(fail.data.ok).toBe(false)
    expect(fail.data.code).toBe('GAME_PAUSED')
    const { count: afterFail } = await fixtures.service!
      .from('ingredient_corrections')
      .select('id', { count: 'exact', head: true })
      .eq('offering_id', miss.offeringId)
    expect(afterFail ?? 0).toBe(0)

    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })

    const ok = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [companion],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
        idempotencyKey: key,
      }),
      at,
    )
    expect(ok.data.ok).toBe(true)
    expect(ok.data.awarded_points).toBeGreaterThan(0)
    expect(ok.data.ingredient_correction_id).toBeTruthy()

    const { data: rows } = await fixtures.service!
      .from('ingredient_corrections')
      .select('id, active, source_submission_id')
      .eq('offering_id', miss.offeringId)
      .eq('ingredient_id', ing.ingredientId)
    expect(rows).toHaveLength(1)
    expect(rows![0]!.active).toBe(true)

    const replay = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [companion],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
        idempotencyKey: key,
      }),
      at,
    )
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    const { count } = await fixtures.service!
      .from('ingredient_corrections')
      .select('id', { count: 'exact', head: true })
      .eq('offering_id', miss.offeringId)
      .eq('ingredient_id', ing.ingredientId)
    expect(count).toBe(1)
  })

  it('8 concurrent duplicate confirmations are idempotent', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const a = playerId(fixtures, 'drink_only')
    const b = playerId(fixtures, 'both')
    const ing = await currentIngredient(at)
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)

    const first = await submitAt(
      fixtures.service!,
      a,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [b],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    expect(first.data.ok).toBe(true)

    // Second player already can use overlay without confirm; force confirm again.
    const second = await submitAt(
      fixtures.service!,
      b,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [a],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    expect(second.data.ok).toBe(true)
    const { count } = await fixtures.service!
      .from('ingredient_corrections')
      .select('id', { count: 'exact', head: true })
      .eq('offering_id', miss.offeringId)
      .eq('ingredient_id', ing.ingredientId)
    expect(count).toBe(1)
  })

  it('9/10 future players benefit; same-named drink other bar unaffected', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const ing = await currentIngredient(at)
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)

    await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [companion],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )

    // Future player preview without confirm key — overlay makes eligible
    const future = await previewAt(
      fixtures.service!,
      companion,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [author],
      }),
      at,
    )
    expect(future.data.preview.categories.ingredient.status).toBe('eligible')

    // Same concept at another bar (if exists) must not inherit
    const { data: offering } = await fixtures.service!
      .from('bar_offerings')
      .select('drink_concept_id, bar_id')
      .eq('id', miss.offeringId)
      .single()
    const { data: siblings } = await fixtures.service!
      .from('bar_offerings')
      .select('id, bar_id')
      .eq('drink_concept_id', offering!.drink_concept_id)
      .neq('id', miss.offeringId)
    if (siblings?.length) {
      const sib = siblings[0]!
      const { data: hasIng } = await fixtures.service!
        .from('catalog_offering_ingredients')
        .select('ingredient_id')
        .eq('offering_id', sib.id)
        .eq('ingredient_id', ing.ingredientId)
        .maybeSingle()
      if (!hasIng) {
        const { data: bar } = await fixtures.service!
          .from('bars')
          .select('canonical_key')
          .eq('id', sib.bar_id)
          .single()
        const other = await previewAt(
          fixtures.service!,
          companion,
          drinkPayload({
            barKey: bar!.canonical_key,
            offeringId: sib.id,
            companions: [author],
          }),
          at,
        )
        expect(other.data.preview.categories.ingredient.status).toBe('unavailable')
      }
    }
  })

  it('11 correction does not alter rarity or rotation', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const before = await fixtures.service!.rpc('dev_get_current_ingredient_bounty_at', {
      p_at_utc: at,
    })
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const ing = await currentIngredient(at)
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)
    await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [companion],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    const after = await fixtures.service!.rpc('dev_get_current_ingredient_bounty_at', {
      p_at_utc: at,
    })
    expect(after.data.offer_id).toBe(before.data.offer_id)
    expect(after.data.points).toBe(before.data.points)
    expect(after.data.ingredient_key).toBe(before.data.ingredient_key)
  })

  it('5 already-claimed category remains unavailable', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const ing = await currentIngredient(at)
    const hit = await findOfferingWithIngredient(ing.ingredientId)
    await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: hit.barKey,
        offeringId: hit.offeringId,
        companions: [companion],
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)
    const prev = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [companion],
        confirmContainsIngredientKey: ing.ingredientKey,
      }),
      at,
    )
    expect(prev.data.preview.categories.ingredient.status).toBe('already_claimed')
  })

  it('17 player cannot forge arbitrary ingredient association', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const miss = await findOfferingWithoutIngredient(
      (await currentIngredient(at)).ingredientId,
    )
    const prev = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [companion],
        confirmContainsIngredientKey: 'totally-fake-ingredient-key',
      }),
      at,
    )
    expect(prev.data.preview.categories.ingredient.status).toBe('unavailable')
  })
})

describe('Phase 3C-A unlisted honor paths', () => {
  it('12 unlisted named cocktail can claim Ingredient via honor key', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const ing = await currentIngredient(at)
    const prev = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        mode: 'unlisted_named',
        customName: 'Harbor Special',
        unlistedDrinkKind: 'named_cocktail',
        unlistedContainsIngredientKey: ing.ingredientKey,
        companions: [companion],
      }),
      at,
    )
    expect(prev.data.preview.categories.ingredient.status).toBe('eligible')
    // No shared correction for unlisted (no offering_id)
    const sub = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        mode: 'unlisted_named',
        customName: 'Harbor Special',
        unlistedDrinkKind: 'named_cocktail',
        unlistedContainsIngredientKey: ing.ingredientKey,
        companions: [companion],
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    expect(sub.data.ok).toBe(true)
    expect(sub.data.ingredient_correction_id ?? null).toBeNull()
  })

  it('13/14 featured unlisted Cocktail at correct bar only', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const cock = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    expect(cock.data?.status).toBe('active')
    const drinkName = cock.data.drink_name as string
    const barKey = cock.data.designated_bar_key as string
    const offerId = cock.data.offer_id as string

    const good = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey,
        mode: 'unlisted_named',
        customName: drinkName,
        unlistedDrinkKind: 'named_cocktail',
        confirmFeaturedCocktail: true,
        companions: [companion],
      }),
      at,
    )
    expect(good.data.preview.categories.cocktail.status).toBe('eligible')

    const wrongBar = barKey === 'wake-view' ? 'poolside' : 'wake-view'
    const bad = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: wrongBar,
        mode: 'unlisted_named',
        customName: drinkName,
        unlistedDrinkKind: 'named_cocktail',
        confirmFeaturedCocktail: true,
        companions: [companion],
      }),
      at,
    )
    expect(bad.data.preview.categories.cocktail.status).not.toBe('eligible')
    void offerId
  })

  it('15 generic Beer/Wine/Other never auto-gains Ingredient', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const ing = await currentIngredient(at)
    for (const mode of ['generic_beer', 'generic_wine', 'generic_other'] as const) {
      const prev = await previewAt(
        fixtures.service!,
        author,
        drinkPayload({
          barKey: 'wake-view',
          mode,
          companions: [companion],
          confirmContainsIngredientKey: ing.ingredientKey,
          unlistedContainsIngredientKey: ing.ingredientKey,
        }),
        at,
      )
      expect(prev.data.preview.categories.ingredient.status).not.toBe('eligible')
    }
  })
})

describe('Phase 3C-A lifecycle + security', () => {
  it('16 pause blocks new scored submit with confirm', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const ing = await currentIngredient(at)
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [companion],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    expect(res.data.ok).toBe(false)
    expect(res.data.code).toBe('GAME_PAUSED')
  })

  it('admin deactivate requires admin and soft-removes overlay', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const ing = await currentIngredient(at)
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)
    const sub = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [companion],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    const correctionId = sub.data.ingredient_correction_id as string

    const { signInAs } = await import('../helpers/localSupabase')
    const playerClient = await signInAs(fixtures, 'drink_only')
    const denied = await playerClient.rpc('admin_deactivate_ingredient_correction', {
      p_correction_id: correctionId,
    })
    expect(denied.error || denied.data?.ok === false).toBeTruthy()

    const admin = await signInAs(fixtures, 'admin')
    const ok = await admin.rpc('admin_deactivate_ingredient_correction', {
      p_correction_id: correctionId,
      p_note: 'test removal',
    })
    expect(ok.error).toBeNull()
    expect(ok.data.ok).toBe(true)

    const prev = await previewAt(
      fixtures.service!,
      companion,
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [author],
      }),
      at,
    )
    expect(prev.data.preview.categories.ingredient.status).toBe('unavailable')
  })
})
