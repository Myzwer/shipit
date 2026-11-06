/**
 * Phase 7B1 — tag log counts, drink-day filtering, recipe primitives, Princess Plus.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  activateReadyCatalogAndSchedule,
  DEV_BASE_OFFSET_MIN,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
} from '../helpers/bountyFixtures'
import { clearTestAchievements } from '../helpers/achievementFixtures'
import {
  drinkPayload,
  exposeCurrentSlots,
  lookupOffering,
  playerId,
  submitAt,
} from '../helpers/drinkitSubmit'
import { buildVariantCatalog, uniqueCatalogId } from '../helpers/catalogPublish'
import { buildStageValidation, isReadyToStage, previewCatalogImport } from '@/lib/catalog'
import { hashPayload } from '@/lib/adminCatalogImport'
import type { ClockFixtures } from '../helpers/clockFixtures'
import { dayDate, shipLocalToUtcIso } from '../helpers/clockFixtures'

let fixtures: ClockFixtures
let admin: SupabaseClient

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
  admin = fixtures.admin!
})

beforeEach(async () => {
  await clearTestAchievements(fixtures.service!)
  const { error } = await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(fixtures.service!, `phase7b1-${randomUUID().slice(0, 8)}`)
})

async function activeVersionId(): Promise<string> {
  const { data } = await fixtures
    .service!.from('active_catalog_pointer')
    .select('catalog_version_id')
    .eq('id', 1)
    .single()
  return data!.catalog_version_id as string
}

async function insertDef(row: Record<string, unknown>) {
  const { error } = await fixtures.service!.from('achievement_definitions').insert({
    secret: false,
    exclusive: false,
    enabled: true,
    test_only: true,
    group_key: 'other',
    ...row,
  })
  expect(error).toBeNull()
}

async function activeKeys(player: string): Promise<string[]> {
  const { data } = await fixtures
    .service!.from('achievement_awards')
    .select('definition:achievement_definitions!inner(stable_key)')
    .eq('owner_player_id', player)
    .eq('status', 'active')
  return (data ?? []).map((a: { definition: { stable_key: string } }) => a.definition.stable_key)
}

async function tagIngredientOnActiveOffering(tag: string) {
  const versionId = await activeVersionId()
  const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
  const { data: coi } = await fixtures
    .service!.from('catalog_offering_ingredients')
    .select('ingredient_id')
    .eq('catalog_version_id', versionId)
    .eq('offering_id', offering.offering_id)
    .limit(1)
    .single()
  await fixtures.service!.from('catalog_version_ingredient_tags').delete()
    .eq('catalog_version_id', versionId)
    .eq('ingredient_id', coi!.ingredient_id)
    .eq('tag', tag)
  await fixtures.service!.from('catalog_version_ingredient_tags').insert({
    catalog_version_id: versionId,
    ingredient_id: coi!.ingredient_id,
    tag,
  })
  return offering
}

describe('Gate 1 — count_logs for spirit tags', () => {
  it('unlocks after N qualifying logs; multi-tag ingredients count once per log', async () => {
    await insertDef({
      stable_key: 'test-three-gin-logs',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Gin Logs',
      display_description: 'Three gin cocktails.',
      condition_type: 'tag_match',
      condition_config: {
        type: 'tag_match',
        scope: 'ingredient',
        tags: ['spirit-family-gin'],
        count_logs: true,
        threshold: 3,
      },
    })
    const offering = await tagIngredientOnActiveOffering('spirit-family-gin')
    // Also attach a second matching tag on same ingredient — still one count per log.
    const versionId = await activeVersionId()
    const { data: coi } = await fixtures
      .service!.from('catalog_offering_ingredients')
      .select('ingredient_id')
      .eq('catalog_version_id', versionId)
      .eq('offering_id', offering.offering_id)
      .limit(1)
      .single()
    await fixtures.service!.from('catalog_version_ingredient_tags').insert({
      catalog_version_id: versionId,
      ingredient_id: coi!.ingredient_id,
      tag: 'spirit-clear',
    })

    const author = playerId(fixtures, 'drink_only')
    for (let i = 0; i < 2; i++) {
      const at = slotUtc(1, `${12 + i}:00:00`)
      await exposeCurrentSlots(fixtures.service!, at)
      const res = await submitAt(
        fixtures.service!,
        author,
        drinkPayload({
          barKey: 'wake-view',
          offeringId: offering.offering_id,
          companions: [],
          selectedClaims: [],
        }),
        at,
      )
      expect(res.data.ok).toBe(true)
    }
    expect(await activeKeys(author)).not.toContain('test-three-gin-logs')

    const at3 = slotUtc(1, '14:00:00')
    await exposeCurrentSlots(fixtures.service!, at3)
    const third = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        companions: [],
        selectedClaims: [],
      }),
      at3,
    )
    expect(third.data.ok).toBe(true)
    expect(await activeKeys(author)).toContain('test-three-gin-logs')
  })

  it('whiskey or bourbon tags share one category count', async () => {
    await insertDef({
      stable_key: 'test-three-whiskey-bourbon',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Whiskey/Bourbon',
      display_description: 'Three whiskey or bourbon cocktails.',
      condition_type: 'tag_match',
      condition_config: {
        type: 'tag_match',
        scope: 'ingredient',
        tags: ['spirit-family-whiskey', 'spirit-family-bourbon'],
        count_logs: true,
        threshold: 3,
      },
    })
    const offering = await tagIngredientOnActiveOffering('spirit-family-bourbon')
    const author = playerId(fixtures, 'drink_only')
    for (let i = 0; i < 3; i++) {
      const at = slotUtc(1, `${12 + i}:10:00`)
      await exposeCurrentSlots(fixtures.service!, at)
      await submitAt(
        fixtures.service!,
        author,
        drinkPayload({
          barKey: 'wake-view',
          offeringId: offering.offering_id,
          companions: [],
          selectedClaims: [],
        }),
        at,
      )
    }
    expect(await activeKeys(author)).toContain('test-three-whiskey-bourbon')
  })
})

describe('Gate 2 — drink-log day counts', () => {
  it('three daily-only days do not unlock drink-day achievement; drink logs do', async () => {
    await insertDef({
      stable_key: 'test-drinks-three-days',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Three Drink Days',
      display_description: 'Drink logs on three days.',
      condition_type: 'distinct_count',
      condition_config: {
        type: 'distinct_count',
        subject: 'cruise_days',
        threshold: 3,
        event: 'drink_log',
      },
    })
    const author = playerId(fixtures, 'drink_only')

    for (const day of [1, 2, 3]) {
      const at = shipLocalToUtcIso(dayDate(day), '10:00:00', DEV_BASE_OFFSET_MIN)
      await fixtures.service!.rpc('dev_submit_daily_at', {
        p_payload: { idempotency_key: randomUUID(), caption: null, photo_id: null },
        p_at_utc: at,
        p_player_id: author,
      })
    }
    expect(await activeKeys(author)).not.toContain('test-drinks-three-days')

    for (const day of [1, 2, 3]) {
      const at = shipLocalToUtcIso(dayDate(day), '15:00:00', DEV_BASE_OFFSET_MIN)
      await exposeCurrentSlots(fixtures.service!, at)
      const res = await submitAt(
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
      expect(res.data.ok).toBe(true)
    }
    expect(await activeKeys(author)).toContain('test-drinks-three-days')
  })
})

describe('Gate 3 — recipe conditions', () => {
  it('expresses D-043 / D-062 / D-063 / D-064 / D-066 with curated tags', async () => {
    const versionId = await activeVersionId()
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const { data: ings } = await fixtures
      .service!.from('catalog_offering_ingredients')
      .select('ingredient_id')
      .eq('catalog_version_id', versionId)
      .eq('offering_id', offering.offering_id)
    expect((ings ?? []).length).toBeGreaterThanOrEqual(2)

    // Tag first two ingredients as two spirit families + two rum styles + fruits.
    const tagsByIndex: string[][] = [
      ['spirit-family-rum', 'rum-style-dark', 'fruit-citrus'],
      ['spirit-family-gin', 'rum-style-white', 'fruit-berry'],
    ]
    for (let i = 0; i < Math.min(2, ings!.length); i++) {
      for (const tag of tagsByIndex[i]!) {
        await fixtures.service!.from('catalog_version_ingredient_tags').insert({
          catalog_version_id: versionId,
          ingredient_id: ings![i]!.ingredient_id,
          tag,
        })
      }
    }

    // Pad recipe to ≥7 ingredients for D-062 by inserting synthetic associations if needed.
    let { count: ingCount } = await fixtures
      .service!.from('catalog_offering_ingredients')
      .select('*', { count: 'exact', head: true })
      .eq('catalog_version_id', versionId)
      .eq('offering_id', offering.offering_id)
    let pad = 0
    while ((ingCount ?? 0) < 7) {
      pad += 1
      const key = `pad-ing-${pad}-${randomUUID().slice(0, 6)}`
      const { data: ingRow } = await fixtures
        .service!.from('ingredients')
        .insert({ canonical_key: key })
        .select('id')
        .single()
      await fixtures.service!.from('catalog_version_ingredients').insert({
        catalog_version_id: versionId,
        ingredient_id: ingRow!.id,
        display_name: key,
        family: null,
      })
      await fixtures.service!.from('catalog_offering_ingredients').insert({
        catalog_version_id: versionId,
        offering_id: offering.offering_id,
        ingredient_id: ingRow!.id,
        display_label: null,
      })
      ;({ count: ingCount } = await fixtures
        .service!.from('catalog_offering_ingredients')
        .select('*', { count: 'exact', head: true })
        .eq('catalog_version_id', versionId)
        .eq('offering_id', offering.offering_id))
    }

    await insertDef({
      stable_key: 'test-seven-ingredients',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Seven',
      display_description: 'Seven recipe ingredients.',
      condition_type: 'recipe_ingredient_count',
      condition_config: { type: 'recipe_ingredient_count', threshold: 7 },
    })
    await insertDef({
      stable_key: 'test-two-spirit-families-one-log',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Two Spirits',
      display_description: 'Two spirit families one cocktail.',
      condition_type: 'tag_match',
      condition_config: {
        type: 'tag_match',
        scope: 'ingredient',
        tags: ['spirit-family-gin', 'spirit-family-rum', 'spirit-family-vodka', 'spirit-family-tequila'],
        min_distinct_on_log: true,
        threshold: 2,
      },
    })
    await insertDef({
      stable_key: 'test-two-rum-styles-one-log',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Two Rum Styles',
      display_description: 'Two rum styles one cocktail.',
      condition_type: 'tag_match',
      condition_config: {
        type: 'tag_match',
        scope: 'ingredient',
        tags: ['rum-style-white', 'rum-style-dark', 'rum-style-gold'],
        min_distinct_on_log: true,
        threshold: 2,
      },
    })
    await insertDef({
      stable_key: 'test-four-spirit-families',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Four Families',
      display_description: 'Four spirit families across cruise.',
      condition_type: 'distinct_count',
      condition_config: {
        type: 'distinct_count',
        subject: 'ingredient_tags',
        tags: [
          'spirit-family-gin',
          'spirit-family-vodka',
          'spirit-family-rum',
          'spirit-family-tequila',
        ],
        threshold: 4,
      },
    })
    await insertDef({
      stable_key: 'test-three-fruits',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Fruits',
      display_description: 'Three fruits.',
      condition_type: 'tag_match',
      condition_config: {
        type: 'tag_match',
        scope: 'ingredient',
        tags: ['fruit-citrus', 'fruit-berry', 'fruit-tropical'],
        distinct_across_cruise: true,
        threshold: 3,
      },
    })

    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        companions: [],
        selectedClaims: [],
      }),
      at,
    )
    expect(res.data.ok).toBe(true)
    const keys = await activeKeys(author)
    expect(keys).toContain('test-seven-ingredients')
    expect(keys).toContain('test-two-spirit-families-one-log')
    expect(keys).toContain('test-two-rum-styles-one-log')
    // Four families / three fruits need more logs — not from one cocktail with only 2 families.
    expect(keys).not.toContain('test-four-spirit-families')
    expect(keys).not.toContain('test-three-fruits')

    // Second log with vodka + tequila + tropical on poolside if we can tag another offering.
    const pool = await lookupOffering(fixtures.service!, 'poolside', 'mai-tai')
    const { data: poolIngs } = await fixtures
      .service!.from('catalog_offering_ingredients')
      .select('ingredient_id')
      .eq('catalog_version_id', versionId)
      .eq('offering_id', pool.offering_id)
      .limit(2)
    if ((poolIngs ?? []).length >= 2) {
      await fixtures.service!.from('catalog_version_ingredient_tags').insert([
        {
          catalog_version_id: versionId,
          ingredient_id: poolIngs![0]!.ingredient_id,
          tag: 'spirit-family-vodka',
        },
        {
          catalog_version_id: versionId,
          ingredient_id: poolIngs![1]!.ingredient_id,
          tag: 'spirit-family-tequila',
        },
        {
          catalog_version_id: versionId,
          ingredient_id: poolIngs![0]!.ingredient_id,
          tag: 'fruit-tropical',
        },
      ])
      const later = slotUtc(1, '16:00:00')
      await exposeCurrentSlots(fixtures.service!, later)
      await submitAt(
        fixtures.service!,
        author,
        drinkPayload({
          barKey: 'poolside',
          offeringId: pool.offering_id,
          companions: [],
          selectedClaims: [],
        }),
        later,
      )
      const keys2 = await activeKeys(author)
      expect(keys2).toContain('test-four-spirit-families')
      expect(keys2).toContain('test-three-fruits')
    }
  })
})

describe('Gate 4 — Princess Plus ingredient evidence + forged readiness', () => {
  it('rejects forged ready when ingredient coverage relies on over-limit offerings', async () => {
    const doc = buildVariantCatalog({ catalogId: uniqueCatalogId('7b1-pp') })
    // Add an ingredient that only appears on over-limit + one within-limit bar → not eligible (≥2 within-limit).
    doc.ingredients.push({ key: 'pricey-bitters', name: 'Pricey Bitters' })
    // Ensure an over-limit offering lists it at one bar and within-limit at another only once...
    const over = doc.drinks.find((d) =>
      d.bar_offerings.some((o) => o.price_status === 'verified_over_limit'),
    )
    if (over) {
      const off = over.bar_offerings.find((o) => o.price_status === 'verified_over_limit')!
      off.ingredient_keys = [...off.ingredient_keys, 'pricey-bitters']
    }
    // Fabricate candidate claiming 2 bars / 2 drinks based on including over-limit.
    doc.ingredient_candidates.push({
      ingredient_key: 'pricey-bitters',
      known_bar_count: 2,
      distinct_qualifying_drinks: 2,
      tier: 'elusive',
      points: 100,
    })
    // Also add a second over-limit-style offering by cloning price status on another drink.
    const mai = doc.drinks.find((d) => d.key === 'mai-tai')!
    mai.bar_offerings[0]!.ingredient_keys = [
      ...mai.bar_offerings[0]!.ingredient_keys,
      'pricey-bitters',
    ]
    // Keep wake-view within limit — only 1 within-limit bar → corroboration fails.
    const preview = previewCatalogImport(doc)
    expect(preview.readiness).not.toBe('ready_for_scheduling')
    expect(
      preview.businessRuleErrors.some(
        (e) =>
          e.code === 'INGREDIENT_COVERAGE_UNCORROBORATED' ||
          e.code === 'INGREDIENT_CANDIDATE_ONE_BAR' ||
          e.code === 'INGREDIENT_CANDIDATE_NO_MENU_EVIDENCE' ||
          e.code === 'INGREDIENT_DRINKS_UNCORROBORATED',
      ),
    ).toBe(true)

    const forged = {
      ...buildStageValidation(
        previewCatalogImport(buildVariantCatalog()),
        await hashPayload(doc),
      ),
      readiness: 'ready_for_scheduling',
      error_count: 0,
    }
    const { data } = await admin.rpc('admin_stage_catalog_import', {
      p_client_request_id: randomUUID(),
      p_payload: doc,
      p_validation: forged,
    })
    expect(data.ok).toBe(false)
    expect(data.code).toBe('INGREDIENT_EVIDENCE_INVALID')
  })

  it('does not count over-limit offerings toward ingredient corroboration', async () => {
    const { corroborateIngredientEvidence } = await import('@/lib/catalog')
    const { baseCatalogSkeleton } = await import('../fixtures/catalog/builders')
    const { cloneCatalog } = await import('../fixtures/catalog/builders')
    const doc = cloneCatalog(baseCatalogSkeleton())
    // lime-juice is on premium-martini (over limit) and several within-limit offerings.
    const evidence = corroborateIngredientEvidence(doc, 'lime-juice')
    // Must not treat over-limit good-spirits premium as a corroborating bar beyond within-limit set.
    expect(evidence.corroboratedBarCount).toBeGreaterThanOrEqual(1)
    // Premium martini alone must not make an unverifiable ingredient suddenly eligible.
    doc.ingredient_candidates.push({
      ingredient_key: 'lime-juice',
      known_bar_count: evidence.corroboratedBarCount + 1,
      distinct_qualifying_drinks: evidence.corroboratedDrinkCount + 1,
      tier: 'elusive',
      points: 100,
    })
    const preview = previewCatalogImport(doc)
    expect(preview.businessRuleErrors.some((e) => e.code.includes('UNCORROBORATED') || e.code.includes('ONE_BAR'))).toBe(
      true,
    )
    expect(isReadyToStage(preview)).toBe(false)
  })
})
