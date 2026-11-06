/**
 * Phase 7B0 — ordered_after fix, drink cruise_day semantics, versioned classification.
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
import { signInAs } from '../helpers/localSupabase'
import type { ClockFixtures } from '../helpers/clockFixtures'

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
  await activateReadyCatalogAndSchedule(fixtures.service!, `phase7b0-${randomUUID().slice(0, 8)}`)
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

describe('Gate 1 — ordered_after (D-031 style)', () => {
  it('unlocks only when the same cocktail is logged after a cocktail bounty claim', async () => {
    await insertDef({
      stable_key: 'test-ordered-after-cocktail',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Ordered After',
      display_description: 'Repeat claimed cocktail later.',
      condition_type: 'ordered_after',
      condition_config: { type: 'ordered_after' },
    })

    const at = slotUtc(1, '12:30:00')
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')

    const cocktail = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    expect(cocktail.data?.offer_id).toBeTruthy()
    const { data: offer } = await fixtures
      .service!.from('bounty_slot_offers')
      .select('id, cocktail_offering_id, display_snapshot')
      .eq('id', cocktail.data.offer_id)
      .single()
    const barKey = offer!.display_snapshot.designated_bar_key as string
    const offeringId = offer!.cocktail_offering_id as string

    const prev = await fixtures.service!.rpc('dev_preview_drink_claims_at', {
      p_payload: drinkPayload({
        barKey,
        offeringId,
        companions: [companion],
        barEligibleCompanions: [companion],
      }),
      p_at_utc: at,
      p_player_id: author,
    })
    expect(prev.data?.ok ?? prev.data?.preview).toBeTruthy()
    const cocktailOpt = prev.data.preview.categories.cocktail
    expect(cocktailOpt.status).toBe('eligible')
    const claim = { category: 'cocktail', offer_id: cocktailOpt.options[0].offer_id }

    const first = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey,
        offeringId,
        companions: [companion],
        barEligibleCompanions: [companion],
        selectedClaims: [claim],
      }),
      at,
    )
    expect(first.data.ok).toBe(true)
    expect(await activeKeys(author)).not.toContain('test-ordered-after-cocktail')

    // Wrong sequence control: different cocktail before repeat does not unlock by itself
    const laterWrong = new Date(new Date(at).getTime() + 20 * 60 * 1000).toISOString()
    await exposeCurrentSlots(fixtures.service!, laterWrong)
    const other = await lookupOffering(fixtures.service!, 'good-spirits', 'chartreuse-swizzle')
    const wrong = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'good-spirits',
        offeringId: other.offering_id,
        companions: [],
        selectedClaims: [],
      }),
      laterWrong,
    )
    expect(wrong.data.ok).toBe(true)
    expect(await activeKeys(author)).not.toContain('test-ordered-after-cocktail')

    const laterSame = new Date(new Date(at).getTime() + 40 * 60 * 1000).toISOString()
    await exposeCurrentSlots(fixtures.service!, laterSame)
    const same = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey,
        offeringId,
        companions: [],
        selectedClaims: [],
      }),
      laterSame,
    )
    expect(same.data.ok).toBe(true)
    expect(await activeKeys(author)).toContain('test-ordered-after-cocktail')

    const idem = randomUUID()
    const once = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        mode: 'generic_beer',
        companions: [],
        selectedClaims: [],
        idempotencyKey: idem,
      }),
      new Date(new Date(laterSame).getTime() + 5 * 60 * 1000).toISOString(),
    )
    expect(once.data.ok).toBe(true)
    const replay = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        mode: 'generic_beer',
        companions: [],
        selectedClaims: [],
        idempotencyKey: idem,
      }),
      new Date(new Date(laterSame).getTime() + 5 * 60 * 1000).toISOString(),
    )
    expect(replay.data.ok).toBe(true)
    expect(replay.data.submission_id).toBe(once.data.submission_id)
    const { data: def } = await fixtures
      .service!.from('achievement_definitions')
      .select('id')
      .eq('stable_key', 'test-ordered-after-cocktail')
      .single()
    const { count } = await fixtures
      .service!.from('achievement_awards')
      .select('*', { count: 'exact', head: true })
      .eq('owner_player_id', author)
      .eq('status', 'active')
      .eq('definition_id', def!.id)
    expect(count).toBe(1)
  })

  it('voiding the qualifying later log revokes ordered_after', async () => {
    await insertDef({
      stable_key: 'test-ordered-after-void',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Ordered Void',
      display_description: 'Void path.',
      condition_type: 'ordered_after',
      condition_config: { type: 'ordered_after' },
    })
    const at = slotUtc(1, '13:00:00')
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const cocktail = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: at })
    const { data: offer } = await fixtures
      .service!.from('bounty_slot_offers')
      .select('cocktail_offering_id, display_snapshot')
      .eq('id', cocktail.data.offer_id)
      .single()
    const barKey = offer!.display_snapshot.designated_bar_key as string
    const offeringId = offer!.cocktail_offering_id as string
    const prev = await fixtures.service!.rpc('dev_preview_drink_claims_at', {
      p_payload: drinkPayload({
        barKey,
        offeringId,
        companions: [companion],
        barEligibleCompanions: [companion],
      }),
      p_at_utc: at,
      p_player_id: author,
    })
    const claim = {
      category: 'cocktail',
      offer_id: prev.data.preview.categories.cocktail.options[0].offer_id,
    }
    await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey,
        offeringId,
        companions: [companion],
        barEligibleCompanions: [companion],
        selectedClaims: [claim],
      }),
      at,
    )
    const later = new Date(new Date(at).getTime() + 30 * 60 * 1000).toISOString()
    await exposeCurrentSlots(fixtures.service!, later)
    const second = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({ barKey, offeringId, companions: [], selectedClaims: [] }),
      later,
    )
    expect(second.data.ok).toBe(true)
    expect(await activeKeys(author)).toContain('test-ordered-after-void')

    const adminClient = await signInAs(
      {
        available: true,
        password: fixtures.password!,
        summary: fixtures.summary!,
        anonKey: fixtures.anonKey!,
        serviceRoleKey: fixtures.serviceRoleKey!,
      },
      'admin',
    )
    const voidRes = await adminClient.rpc('admin_void_submission', {
      p_client_request_id: randomUUID(),
      p_submission_id: second.data.submission_id,
      p_expected_status: 'accepted',
      p_reason: 'phase7b0-test',
    })
    expect(voidRes.error).toBeNull()
    expect(voidRes.data.ok).toBe(true)
    expect(await activeKeys(author)).not.toContain('test-ordered-after-void')
  })
})

describe('Gate 1 — Drink It! cruise_day requires drink_log', () => {
  it('daily challenge alone does not unlock first-day drink achievement', async () => {
    await insertDef({
      stable_key: 'test-first-day-drink-only',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test First Day Drink',
      display_description: 'Requires drink_log.',
      condition_type: 'cruise_day',
      condition_config: { type: 'cruise_day', which: 'first' },
    })
    const at = noonDay1Utc()
    const author = playerId(fixtures, 'drink_only')

    // Daily submit if available — must not unlock drink cruise_day
    const daily = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_payload: {
        idempotency_key: randomUUID(),
        caption: null,
        photo_id: null,
      },
      p_at_utc: at,
      p_player_id: author,
    })
    // Daily may be unavailable in fixture; either way, award must stay locked until drink_log.
    void daily
    expect(await activeKeys(author)).not.toContain('test-first-day-drink-only')

    await exposeCurrentSlots(fixtures.service!, at)
    const beer = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({ barKey: 'wake-view', mode: 'generic_beer', companions: [], selectedClaims: [] }),
      at,
    )
    expect(beer.data.ok).toBe(true)
    expect(await activeKeys(author)).toContain('test-first-day-drink-only')
  })
})

describe('Gates 2–4 — versioned classification metadata', () => {
  it('publishes curated tags; unknown brand without tags does not unlock; aliases never unlock', async () => {
    await insertDef({
      stable_key: 'test-tequila-family',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Tequila',
      display_description: 'Curated tequila tag.',
      condition_type: 'tag_match',
      condition_config: {
        type: 'tag_match',
        scope: 'ingredient',
        tags: ['spirit-family-tequila'],
        match: 'any',
      },
    })
    await insertDef({
      stable_key: 'test-frozen-offering',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Frozen',
      display_description: 'Frozen offering tag.',
      condition_type: 'tag_match',
      condition_config: {
        type: 'tag_match',
        scope: 'drink_concept',
        tags: ['frozen'],
      },
    })

    const doc = buildVariantCatalog({ catalogId: uniqueCatalogId('7b0-class') })
    doc.schema_version = '1.1'
    const tequila = {
      key: 'espolon-reposado',
      name: 'Espolon Reposado Tequila',
      aliases: ['Espolòn (display only)'],
      classification_tags: ['spirit-family-tequila', 'spirit-clear'] as (
        | 'spirit-family-tequila'
        | 'spirit-clear'
      )[],
    }
    const mystery = {
      key: 'mystery-agave',
      name: 'Espolon',
      aliases: ['looks like tequila but unknown'],
      // intentionally no classification_tags
    }
    doc.ingredients.push(tequila, mystery)
    const drink = doc.drinks.find((d) => d.key === 'mai-tai')!
    drink.bar_offerings[0].ingredient_keys = [
      ...drink.bar_offerings[0].ingredient_keys,
      'espolon-reposado',
    ]
    drink.bar_offerings[0].display_ingredients = [
      ...drink.bar_offerings[0].display_ingredients,
      'Espolon Reposado Tequila',
    ]
    drink.bar_offerings[0].classification_tags = ['frozen']
    // Second bar different recipe — not frozen
    if (drink.bar_offerings[1]) {
      drink.bar_offerings[1].ingredient_keys = [
        ...drink.bar_offerings[1].ingredient_keys,
        'mystery-agave',
      ]
      drink.bar_offerings[1].classification_tags = []
    }

    // Keep ingredient candidate pool valid if we added ingredients without candidates
    const preview = previewCatalogImport(doc)
    expect(preview.businessRuleErrors.filter((e) => e.code.includes('CLASSIFICATION'))).toEqual([])
    expect(isReadyToStage(preview)).toBe(true)
    expect(preview.metadata.classificationTagAssignments).toBeGreaterThan(0)

    const hash = await hashPayload(doc)
    const staged = await admin.rpc('admin_stage_catalog_import', {
      p_client_request_id: randomUUID(),
      p_payload: doc,
      p_validation: buildStageValidation(preview, hash),
    })
    expect(staged.data.ok, JSON.stringify(staged.data)).toBe(true)

    const published = await admin.rpc('admin_publish_catalog_import', {
      p_client_request_id: randomUUID(),
      p_candidate_id: staged.data.candidate_id,
      p_expected_active_catalog_version_id: await activeVersionId(),
      p_expected_payload_hash: hash,
    })
    expect(published.data.ok, JSON.stringify(published.data)).toBe(true)
    const newVersion = published.data.catalog_version_id as string

    const { data: ingTags } = await fixtures
      .service!.from('catalog_version_ingredient_tags')
      .select('tag, ingredient:ingredients!inner(canonical_key)')
      .eq('catalog_version_id', newVersion)
    const tequilaTags = (ingTags ?? [])
      .filter((r: { ingredient: { canonical_key: string } }) => r.ingredient.canonical_key === 'espolon-reposado')
      .map((r: { tag: string }) => r.tag)
    expect(tequilaTags).toEqual(expect.arrayContaining(['spirit-family-tequila', 'spirit-clear']))
    expect(
      (ingTags ?? []).some(
        (r: { ingredient: { canonical_key: string } }) => r.ingredient.canonical_key === 'mystery-agave',
      ),
    ).toBe(false)

    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
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
    expect(keys).toContain('test-tequila-family')
    expect(keys).toContain('test-frozen-offering')

    // Poolside mai-tai (mystery ingredient, not frozen) must not unlock tequila/frozen from aliases
    const author2 = playerId(fixtures, 'both')
    const pool = await lookupOffering(fixtures.service!, 'poolside', 'mai-tai')
    await submitAt(
      fixtures.service!,
      author2,
      drinkPayload({
        barKey: 'poolside',
        offeringId: pool.offering_id,
        companions: [],
        selectedClaims: [],
      }),
      at,
    )
    const keys2 = await activeKeys(author2)
    expect(keys2).not.toContain('test-tequila-family')
    expect(keys2).not.toContain('test-frozen-offering')
  })

  it('rejects unknown classification tags and forged ready with invalid tags', async () => {
    const doc = buildVariantCatalog({ catalogId: uniqueCatalogId('7b0-bad-tag') })
    doc.schema_version = '1.1'
    doc.ingredients[0] = {
      ...doc.ingredients[0],
      classification_tags: ['not-a-real-tag' as never],
    }
    const preview = previewCatalogImport(doc)
    expect(preview.readiness).not.toBe('ready_for_scheduling')
    expect(
      preview.schemaErrors.length > 0 ||
        preview.businessRuleErrors.some((e) => e.code.includes('CLASSIFICATION') || e.code.includes('TAG')),
    ).toBe(true)

    const forged = {
      ...buildStageValidation(previewCatalogImport(buildVariantCatalog()), await hashPayload(doc)),
      readiness: 'ready_for_scheduling',
      error_count: 0,
    }
    const { data } = await admin.rpc('admin_stage_catalog_import', {
      p_client_request_id: randomUUID(),
      p_payload: doc,
      p_validation: forged,
    })
    expect(data.ok).toBe(false)
    expect(data.code).toBe('CLASSIFICATION_TAG_INVALID')
  })

  it('existing log retains historical tags after a later catalog changes recipe metadata', async () => {
    await insertDef({
      stable_key: 'test-hist-rum',
      game: 'drinkit',
      owner_type: 'player',
      title: 'Test Hist Rum',
      display_description: 'Historical rum tag.',
      condition_type: 'tag_match',
      condition_config: {
        type: 'tag_match',
        scope: 'ingredient',
        tags: ['spirit-family-rum'],
        match: 'any',
      },
    })

    const v1 = await activeVersionId()
    const { data: coi } = await fixtures
      .service!.from('catalog_offering_ingredients')
      .select('ingredient_id, offering_id')
      .eq('catalog_version_id', v1)
      .limit(1)
      .single()
    await fixtures.service!.from('catalog_version_ingredient_tags').insert({
      catalog_version_id: v1,
      ingredient_id: coi!.ingredient_id,
      tag: 'spirit-family-rum',
    })

    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const { data: offeringRow } = await fixtures
      .service!.from('bar_offerings')
      .select('id, bar_id')
      .eq('id', coi!.offering_id)
      .single()
    const { data: bar } = await fixtures
      .service!.from('bars')
      .select('canonical_key')
      .eq('id', offeringRow!.bar_id)
      .single()
    const logged = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: bar!.canonical_key,
        offeringId: offeringRow!.id,
        companions: [],
        selectedClaims: [],
      }),
      at,
    )
    expect(logged.data.ok).toBe(true)
    expect(await activeKeys(author)).toContain('test-hist-rum')

    // Publish a new catalog version that does NOT carry the rum tag on that ingredient.
    const doc = buildVariantCatalog({
      catalogId: uniqueCatalogId('7b0-hist'),
      baseCatalogId: null,
    })
    doc.schema_version = '1.1'
    // Ensure dark-rum (if present) has no rum family tag in the new snapshot.
    for (const ing of doc.ingredients) {
      if (ing.key === 'dark-rum') ing.classification_tags = []
    }
    const preview = previewCatalogImport(doc)
    expect(isReadyToStage(preview)).toBe(true)
    const hash = await hashPayload(doc)
    const staged = await admin.rpc('admin_stage_catalog_import', {
      p_client_request_id: randomUUID(),
      p_payload: doc,
      p_validation: buildStageValidation(preview, hash),
    })
    expect(staged.data.ok).toBe(true)
    const published = await admin.rpc('admin_publish_catalog_import', {
      p_client_request_id: randomUUID(),
      p_candidate_id: staged.data.candidate_id,
      p_expected_active_catalog_version_id: await activeVersionId(),
      p_expected_payload_hash: hash,
    })
    expect(published.data.ok, JSON.stringify(published.data)).toBe(true)

    // Prior award remains; void+recompute should still see historical version tags on the log.
    expect(await activeKeys(author)).toContain('test-hist-rum')
    const { data: log } = await fixtures
      .service!.from('drink_logs')
      .select('catalog_version_id')
      .eq('submission_id', logged.data.submission_id)
      .single()
    expect(log!.catalog_version_id).toBe(v1)
    expect(log!.catalog_version_id).not.toBe(published.data.catalog_version_id)
  })
})
