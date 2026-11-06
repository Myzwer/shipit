/**
 * Phase 5C Gate 2 — ingredient correction provenance + void behavior.
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
  await activateReadyCatalogAndSchedule(fixtures.service!, `5c-prov-${randomUUID().slice(0, 8)}`)
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

async function awardCorrection(authorKey: string, companionKey: string, at: string) {
  await exposeCurrentSlots(fixtures.service!, at)
  const ing = await currentIngredient(at)
  const miss = await findOfferingWithoutIngredient(ing.ingredientId)
  const author = playerId(fixtures, authorKey)
  const companion = playerId(fixtures, companionKey)
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
  expect(res.data.ok).toBe(true)
  expect(res.data.ingredient_correction_id).toBeTruthy()
  return {
    submissionId: res.data.submission_id as string,
    correctionId: res.data.ingredient_correction_id as string,
    offeringId: miss.offeringId,
    ingredientId: ing.ingredientId,
    barId: miss.barId,
    awarded: res.data.awarded_points as number,
  }
}

describe('Phase 5C correction provenance', () => {
  it('one source voided → correction inactive; two sources → void first keeps active', async () => {
    const at = noonDay1Utc()
    const first = await awardCorrection('drink_only', 'both', at)

    const { data: src1 } = await fixtures.service!
      .from('ingredient_correction_sources')
      .select('*')
      .eq('correction_id', first.correctionId)
    expect(src1).toHaveLength(1)
    expect(src1![0]!.valid).toBe(true)

    // Second independent support (different player) same offering+ingredient
    await exposeCurrentSlots(fixtures.service!, at)
    const ing = await currentIngredient(at)
    // Need another day/slot or same ingredient still claimable by companion who didn't claim yet
    // Companion already used as presence companion — use admin as author for second log
    const miss = {
      offeringId: first.offeringId,
      barKey: (
        await fixtures.service!.from('bars').select('canonical_key').eq('id', first.barId).single()
      ).data!.canonical_key as string,
    }
    // admin may not have drinkit — use 'both' as author, drink_only as companion (roles swapped)
    // both may have already claimed ingredient today via being companion-only (companions don't get claims)
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
    expect(second.data.ingredient_correction_id).toBe(first.correctionId)

    const { data: src2 } = await fixtures.service!
      .from('ingredient_correction_sources')
      .select('*')
      .eq('correction_id', first.correctionId)
      .eq('valid', true)
    expect(src2!.length).toBeGreaterThanOrEqual(2)

    const admin = await signInAs(local(), 'admin')
    const voidFirst = await admin.rpc('admin_void_submission', {
      p_client_request_id: randomUUID(),
      p_submission_id: first.submissionId,
      p_expected_status: 'accepted',
      p_reason: 'void first support',
    })
    expect(voidFirst.data.ok).toBe(true)

    const { data: afterFirst } = await fixtures.service!
      .from('ingredient_corrections')
      .select('active, inactive_cause')
      .eq('id', first.correctionId)
      .single()
    expect(afterFirst!.active).toBe(true)

    const voidSecond = await admin.rpc('admin_void_submission', {
      p_client_request_id: randomUUID(),
      p_submission_id: second.data.submission_id,
      p_expected_status: 'accepted',
      p_reason: 'void last support',
    })
    expect(voidSecond.data.ok).toBe(true)

    const { data: afterLast } = await fixtures.service!
      .from('ingredient_corrections')
      .select('active, inactive_cause')
      .eq('id', first.correctionId)
      .single()
    expect(afterLast!.active).toBe(false)
    expect(afterLast!.inactive_cause).toBe('no_valid_sources')
  })

  it('admin deactivate stays suppressed despite new confirmations; other bar unaffected', async () => {
    const at = noonDay1Utc()
    const first = await awardCorrection('drink_only', 'both', at)
    const admin = await signInAs(local(), 'admin')
    const deact = await admin.rpc('admin_deactivate_ingredient_correction', {
      p_correction_id: first.correctionId,
      p_note: 'bad overlay',
    })
    expect(deact.data.ok).toBe(true)
    expect(deact.data.inactive_cause).toBe('admin')

    await exposeCurrentSlots(fixtures.service!, at)
    const ing = await currentIngredient(at)
    const { data: bar } = await fixtures.service!
      .from('bars')
      .select('canonical_key')
      .eq('id', first.barId)
      .single()
    const retry = await submitAt(
      fixtures.service!,
      playerId(fixtures, 'both'),
      drinkPayload({
        barKey: bar!.canonical_key,
        offeringId: first.offeringId,
        companions: [playerId(fixtures, 'drink_only')],
        confirmContainsIngredientKey: ing.ingredientKey,
        selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      }),
      at,
    )
    // May succeed scoring via in-request honor, but must not reactivate admin row
    const { data: row } = await fixtures.service!
      .from('ingredient_corrections')
      .select('active, inactive_cause')
      .eq('id', first.correctionId)
      .single()
    expect(row!.active).toBe(false)
    expect(row!.inactive_cause).toBe('admin')
    expect(retry.data).toBeTruthy()

    // Same ingredient at a different offering/bar is a separate correction scope
    const other = await findOfferingWithoutIngredient(first.ingredientId)
    if (other.offeringId !== first.offeringId) {
      const { count } = await fixtures.service!
        .from('ingredient_corrections')
        .select('id', { count: 'exact', head: true })
        .eq('offering_id', other.offeringId)
        .eq('ingredient_id', first.ingredientId)
        .eq('active', true)
      expect(count ?? 0).toBe(0)
    }
  })

  it('idempotent replay does not duplicate sources; player cannot write sources', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const ing = await currentIngredient(at)
    const miss = await findOfferingWithoutIngredient(ing.ingredientId)
    const key = randomUUID()
    const payload = drinkPayload({
      barKey: miss.barKey,
      offeringId: miss.offeringId,
      companions: [playerId(fixtures, 'both')],
      confirmContainsIngredientKey: ing.ingredientKey,
      selectedClaims: [{ category: 'ingredient', offer_id: ing.offerId }],
      idempotencyKey: key,
    })
    const first = await submitAt(fixtures.service!, playerId(fixtures, 'drink_only'), payload, at)
    expect(first.data.ok).toBe(true)
    const replay = await submitAt(fixtures.service!, playerId(fixtures, 'drink_only'), payload, at)
    expect(replay.data.idempotent_replay).toBe(true)

    const { data: sources } = await fixtures.service!
      .from('ingredient_correction_sources')
      .select('submission_id')
      .eq('correction_id', first.data.ingredient_correction_id)
    expect(sources).toHaveLength(1)

    const player = await signInAs(local(), 'drink_only')
    const denied = await player.from('ingredient_correction_sources').insert({
      correction_id: first.data.ingredient_correction_id,
      submission_id: randomUUID(),
      valid: true,
    })
    expect(denied.error).toBeTruthy()
  })
})
