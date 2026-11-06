/**
 * Phase 6A Gate — concurrent correction persist vs void invalidation.
 *
 * Reproduces the TOCTOU where invalidate counted valid sources without locking
 * the correction row while persist held FOR UPDATE. After both settle:
 * - Active flag matches surviving valid sources
 * - Admin suppression never disappears
 * - No duplicate/resurrected sources
 * - No deadlock
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
  await fixtures.service!.from('ingredient_correction_sources').delete().neq('submission_id', randomUUID())
  await fixtures.service!.from('ingredient_corrections').delete().neq('id', randomUUID())
  await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(fixtures.service!, `6a-race-${randomUUID().slice(0, 8)}`)
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
  }
}

async function findOfferingWithoutIngredient(ingredientId: string) {
  const { data: pointer } = await fixtures.service!
    .from('active_catalog_pointer')
    .select('catalog_version_id')
    .eq('id', 1)
    .single()
  const catalogId = pointer!.catalog_version_id as string
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
    return {
      offeringId: offering.id as string,
      barKey: bar.canonical_key as string,
      barId: offering.bar_id as string,
    }
  }
  throw new Error('No offering lacking current ingredient')
}

async function assertConsistentCorrection(correctionId: string) {
  const { data: row } = await fixtures.service!
    .from('ingredient_corrections')
    .select('id, active, inactive_cause')
    .eq('id', correctionId)
    .single()
  expect(row).toBeTruthy()

  const { data: sources } = await fixtures.service!
    .from('ingredient_correction_sources')
    .select('submission_id, valid')
    .eq('correction_id', correctionId)

  const validCount = (sources ?? []).filter((s) => s.valid).length
  const keys = (sources ?? []).map((s) => s.submission_id)
  expect(new Set(keys).size).toBe(keys.length)

  if (row!.inactive_cause === 'admin') {
    expect(row!.active).toBe(false)
    return { row: row!, validCount, sources: sources ?? [] }
  }

  if (validCount === 0) {
    expect(row!.active).toBe(false)
    expect(row!.inactive_cause).toBe('no_valid_sources')
  } else {
    expect(row!.active).toBe(true)
    expect(row!.inactive_cause).toBeNull()
  }
  return { row: row!, validCount, sources: sources ?? [] }
}

describe('Phase 6A provenance concurrency gate', () => {
  it('concurrent void + new confirmation settle without lost update or duplicate sources', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const ing = await currentIngredient(at)
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)

    const first = await submitAt(
      fixtures.service!,
      playerId(fixtures, 'drink_only'),
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [playerId(fixtures, 'both')],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    expect(first.data.ok).toBe(true)
    const correctionId = first.data.ingredient_correction_id as string
    const firstSubmissionId = first.data.submission_id as string

    // Second support already present so voiding the first alone should keep overlay,
    // unless a race incorrectly deactivates while the second (or a concurrent third) is valid.
    const second = await submitAt(
      fixtures.service!,
      playerId(fixtures, 'both'),
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [playerId(fixtures, 'drink_only')],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    expect(second.data.ok).toBe(true)
    expect(second.data.ingredient_correction_id).toBe(correctionId)

    const admin = await signInAs(local(), 'admin')

    // Race: void first support while a third confirmation is persisting the same correction.
    // Multiple rounds with full reset so daily ingredient claim limits do not block repeats.
    const rounds = 6
    for (let i = 0; i < rounds; i++) {
      const dayAt = noonDay1Utc()
      let voidTarget = firstSubmissionId
      let cid = correctionId
      let barKey = miss.barKey
      let offeringId = miss.offeringId
      let ingredientKey = ing.ingredientKey
      let offerId = ing.offerId

      if (i > 0) {
        await fixtures.service!.rpc('dev_reset_scavenger_test_data')
        await fixtures.service!.from('ingredient_correction_sources').delete().neq('submission_id', randomUUID())
        await fixtures.service!.from('ingredient_corrections').delete().neq('id', randomUUID())
        await fixtures.service!.rpc('dev_seed_cruise_clock', {
          p_day1_ship_date: '2099-01-03',
          p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
          p_label: 'development-only',
        })
        await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
        await activateReadyCatalogAndSchedule(fixtures.service!, `6a-race-r${i}-${randomUUID().slice(0, 6)}`)
        await exposeCurrentSlots(fixtures.service!, dayAt)
        const roundIng = await currentIngredient(dayAt)
        const roundMiss = await findOfferingWithoutIngredient(roundIng.ingredientId)
        ingredientKey = roundIng.ingredientKey
        offerId = roundIng.offerId
        barKey = roundMiss.barKey
        offeringId = roundMiss.offeringId

        const a = await submitAt(
          fixtures.service!,
          playerId(fixtures, 'drink_only'),
          drinkPayload({
            barKey,
            offeringId,
            companions: [playerId(fixtures, 'both')],
            confirmContainsIngredientKey: ingredientKey,
            selectedClaims: [{ category: 'ingredient', offer_id: offerId }],
          }),
          dayAt,
        )
        expect(a.data.ok).toBe(true)
        voidTarget = a.data.submission_id as string
        cid = a.data.ingredient_correction_id as string

        const b = await submitAt(
          fixtures.service!,
          playerId(fixtures, 'both'),
          drinkPayload({
            barKey,
            offeringId,
            companions: [playerId(fixtures, 'drink_only')],
            confirmContainsIngredientKey: ingredientKey,
            selectedClaims: [{ category: 'ingredient', offer_id: offerId }],
          }),
          dayAt,
        )
        expect(b.data.ok).toBe(true)
      }

      const [voidRes, thirdRes] = await Promise.all([
        admin.rpc('admin_void_submission', {
          p_client_request_id: randomUUID(),
          p_submission_id: voidTarget,
          p_expected_status: 'accepted',
          p_reason: `race-void-${i}`,
        }),
        submitAt(
          fixtures.service!,
          playerId(fixtures, 'admin'),
          drinkPayload({
            barKey,
            offeringId,
            companions: [playerId(fixtures, 'drink_only')],
            confirmContainsIngredientKey: ingredientKey,
            selectedClaims: [{ category: 'ingredient', offer_id: offerId }],
            idempotencyKey: randomUUID(),
          }),
          dayAt,
        ),
      ])
      expect(voidRes.error).toBeNull()
      expect(voidRes.data?.ok).toBe(true)
      expect(thirdRes.error).toBeNull()
      expect(thirdRes.data?.ok).toBe(true)
      const settled = await assertConsistentCorrection(cid)
      expect(settled.validCount).toBeGreaterThanOrEqual(1)
      expect(settled.row.active).toBe(true)
      expect(settled.row.inactive_cause).toBeNull()
    }
  }, 180_000)

  it('concurrent void vs persist does not clear admin suppression', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const ing = await currentIngredient(at)
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)

    const first = await submitAt(
      fixtures.service!,
      playerId(fixtures, 'drink_only'),
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [playerId(fixtures, 'both')],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    expect(first.data.ok).toBe(true)
    const correctionId = first.data.ingredient_correction_id as string

    const admin = await signInAs(local(), 'admin')
    const deact = await admin.rpc('admin_deactivate_ingredient_correction', {
      p_correction_id: correctionId,
      p_note: 'admin race guard',
    })
    expect(deact.data.ok).toBe(true)

    const [voidRes, persistRes] = await Promise.all([
      admin.rpc('admin_void_submission', {
        p_client_request_id: randomUUID(),
        p_submission_id: first.data.submission_id,
        p_expected_status: 'accepted',
        p_reason: 'void under admin suppression',
      }),
      submitAt(
        fixtures.service!,
        playerId(fixtures, 'both'),
        drinkPayload({
          barKey: miss.barKey,
          offeringId: miss.offeringId,
          companions: [playerId(fixtures, 'drink_only')],
          confirmContainsIngredientKey: ing.ingredientKey,
          selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
        }),
        at,
      ),
    ])
    expect(voidRes.error).toBeNull()
    expect(voidRes.data?.ok).toBe(true)
    expect(persistRes.error).toBeNull()

    const settled = await assertConsistentCorrection(correctionId)
    expect(settled.row.active).toBe(false)
    expect(settled.row.inactive_cause).toBe('admin')
  })

  it('direct concurrent invalidate + persist RPCs stay consistent', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const ing = await currentIngredient(at)
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)

    const first = await submitAt(
      fixtures.service!,
      playerId(fixtures, 'drink_only'),
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [playerId(fixtures, 'both')],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    expect(first.data.ok).toBe(true)
    const correctionId = first.data.ingredient_correction_id as string
    const submissionId = first.data.submission_id as string

    // Pre-create a second accepted submission without correction link, then race
    // invalidate(first) against persist(second) on the same correction.
    const secondSub = await submitAt(
      fixtures.service!,
      playerId(fixtures, 'both'),
      drinkPayload({
        barKey: miss.barKey,
        offeringId: miss.offeringId,
        companions: [playerId(fixtures, 'drink_only')],
        selectedClaims: [],
      }),
      at,
    )
    expect(secondSub.data.ok).toBe(true)
    const secondId = secondSub.data.submission_id as string

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        i % 2 === 0
          ? fixtures.service!.rpc('drinkit_invalidate_correction_sources', {
              p_submission_id: submissionId,
            })
          : fixtures.service!.rpc('drinkit_persist_ingredient_correction', {
              p_offering_id: miss.offeringId,
              p_ingredient_id: ing.ingredientId,
              p_player_id: playerId(fixtures, 'both'),
              p_submission_id: secondId,
            }),
      ),
    )
    for (const r of results) {
      expect(r.error).toBeNull()
    }

    await assertConsistentCorrection(correctionId)
  })
})
