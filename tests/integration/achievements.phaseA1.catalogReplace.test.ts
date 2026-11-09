/**
 * Stage A1 follow-up — full catalog replacement must keep historical collection progress.
 * Uses admin stage/publish (not pointer tricks) and proves bar_offerings.id stability.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cloneCatalog, buildScheduleReadyCatalog } from '../fixtures/catalog/builders'
import {
  clearTestAchievementsInDisposableEnv,
  loadAchievementFixtures,
} from '../helpers/achievementFixtures'
import { assertDisposableDevEnvironment } from '../helpers/devEnvironmentGuard'
import { uniqueCatalogId } from '../helpers/catalogPublish'
import { slotUtc } from '../helpers/bountyFixtures'
import { drinkPayload, exposeCurrentSlots, lookupOffering, submitAt } from '../helpers/drinkitSubmit'
import type { ClockFixtures } from '../helpers/clockFixtures'
import { buildStageValidation, isReadyToStage, previewCatalogImport } from '@/lib/catalog'
import { hashPayload } from '@/lib/adminCatalogImport'
import type { CatalogImportDocument } from '@/lib/catalog/types'

type CollectionStatus = {
  ok: boolean
  live_target: number
  live_current: number
  earned: boolean
  award_id: string | null
  pin_covered: boolean | null
  items: Array<{ offering_id: string; concept_key: string; covered: boolean }>
}

const BAR = 'wake-view'
const KEEP = 11
const ADD = 2

let fixtures: ClockFixtures
let service: SupabaseClient
let admin: SupabaseClient
let author = ''
let partner = ''
let createdPlayers: string[] = []

beforeAll(async () => {
  fixtures = await loadAchievementFixtures()
  service = fixtures.service!
  admin = fixtures.admin!
  await assertDisposableDevEnvironment(fixtures, service)
}, 180000)

beforeEach(async () => {
  await assertDisposableDevEnvironment(fixtures, service)
  await clearTestAchievementsInDisposableEnv(service, fixtures)
  await service.from('game_control').update({ status: 'active', finalized_at_utc: null }).eq('game', 'drinkit')
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await deleteEphemeralPlayers()
  author = await makePlayer('replace-a')
  partner = await makePlayer('replace-b')
}, 180000)

afterAll(async () => {
  await clearTestAchievementsInDisposableEnv(service, fixtures)
  await deleteEphemeralPlayers()
}, 180000)

describe('full catalog replacement collections', () => {
  it('keeps 8/11 progress as 8/13 after publishing two new offerings with stable ids', async () => {
    const v1Id = uniqueCatalogId('a1-replace-v1')
    const v1Doc = buildGauntletCatalog(v1Id, { eligibleCount: KEEP })
    const v1Keys = eligibleWakeKeys(v1Doc)
    expect(v1Keys).toHaveLength(KEEP)

    const publishedV1 = await stageAndPublish(v1Doc)
    const versionA = publishedV1.catalog_version_id as string
    const personal = await insertCollection({ bar_key: BAR })
    const collective = await insertCollection({ bar_key: BAR, scope: 'collective' })

    const idsV1 = await offeringIdsForKeys(v1Keys)
    expect(Object.keys(idsV1)).toHaveLength(KEEP)

    const loggedKeys = v1Keys.slice(0, 8)
    for (let i = 0; i < loggedKeys.length; i += 1) {
      const offering = await lookupOffering(service, BAR, loggedKeys[i])
      expect(offering.offering_id).toBe(idsV1[loggedKeys[i]])
      expectOk(await logNamed(author, offering.offering_id, slotUtc(1, `12:${String(i).padStart(2, '0')}:00`)))
    }

    const mid = await status(personal, author)
    expect(mid.live_target).toBe(11)
    expect(mid.live_current).toBe(8)
    expect(mid.earned).toBe(false)

    const v2Id = uniqueCatalogId('a1-replace-v2')
    const v2Doc = buildGauntletCatalog(v2Id, {
      eligibleCount: KEEP + ADD,
      baseCatalogId: v1Id,
      renameDisplay: { key: loggedKeys[0], name: 'Lorem Renamed Cocktail' },
    })
    const v2Keys = eligibleWakeKeys(v2Doc)
    expect(v2Keys).toHaveLength(13)
    for (const key of v1Keys) expect(v2Keys).toContain(key)

    const publishedV2 = await stageAndPublish(v2Doc, versionA)
    const versionB = publishedV2.catalog_version_id as string
    expect(versionB).not.toBe(versionA)

    const idsV2 = await offeringIdsForKeys(v1Keys)
    for (const key of v1Keys) {
      expect(idsV2[key], `stable offering id for ${key}`).toBe(idsV1[key])
    }

    const after = await status(personal, author)
    expect(after.live_target).toBe(13)
    expect(after.live_current).toBe(8)
    expect(after.earned).toBe(false)
    expect(after.items.filter((item) => item.covered)).toHaveLength(8)
    expect(after.items.find((item) => item.concept_key === loggedKeys[0])?.covered).toBe(true)

    const collectiveAfter = await status(collective, author)
    expect(collectiveAfter.live_target).toBe(13)
    expect(collectiveAfter.live_current).toBe(8)

    // Explicit key change creates a new identity; old progress does not fuzzy-merge onto it.
    const v3Id = uniqueCatalogId('a1-replace-v3')
    const v3Doc = cloneCatalog(v2Doc)
    v3Doc.catalog_id = v3Id
    v3Doc.base_catalog_id = v2Id
    const renamed = v3Doc.drinks.find((drink) => drink.key === loggedKeys[1])!
    renamed.key = `renamed-${loggedKeys[1]}`
    for (const candidate of v3Doc.cocktail_candidates) {
      if (candidate.drink_key === loggedKeys[1]) candidate.drink_key = renamed.key
    }
    await stageAndPublish(v3Doc, versionB)
    const afterKeyChange = await status(personal, author)
    expect(afterKeyChange.live_target).toBe(13)
    expect(afterKeyChange.live_current).toBe(7)
    expect(afterKeyChange.items.some((item) => item.concept_key === loggedKeys[1])).toBe(false)
    expect(afterKeyChange.items.some((item) => item.concept_key === renamed.key)).toBe(true)
  })

  it('retains a completed 11/11 award after the published menu expands to 13', async () => {
    const v1Id = uniqueCatalogId('a1-complete-v1')
    const v1Doc = buildGauntletCatalog(v1Id, { eligibleCount: KEEP })
    const v1Keys = eligibleWakeKeys(v1Doc)
    const publishedV1 = await stageAndPublish(v1Doc)
    const versionA = publishedV1.catalog_version_id as string

    const personal = await insertCollection({ bar_key: BAR })
    const collective = await insertCollection({ bar_key: BAR, scope: 'collective' })
    const idsV1 = await offeringIdsForKeys(v1Keys)

    for (let i = 0; i < v1Keys.length; i += 1) {
      expectOk(
        await logNamed(author, idsV1[v1Keys[i]], slotUtc(1, `13:${String(i).padStart(2, '0')}:00`)),
      )
    }
    // One partner log proves collective fan-out without changing the personal pin set.
    expectOk(await logNamed(partner, idsV1[v1Keys[0]], slotUtc(1, '14:00:00')))

    const earnedPersonal = await status(personal, author)
    expect(earnedPersonal.earned).toBe(true)
    expect(earnedPersonal.live_current).toBe(11)
    const personalAward = earnedPersonal.award_id

    const earnedCollective = await status(collective, author)
    expect(earnedCollective.earned).toBe(true)
    expect(earnedCollective.live_target).toBe(11)
    const collectiveAward = earnedCollective.award_id
    expect(await activeAward(collective, partner)).toBeTruthy()

    const v2Id = uniqueCatalogId('a1-complete-v2')
    const v2Doc = buildGauntletCatalog(v2Id, { eligibleCount: KEEP + ADD, baseCatalogId: v1Id })
    await stageAndPublish(v2Doc, versionA)

    const personalAfter = await status(personal, author)
    expect(personalAfter.live_target).toBe(13)
    expect(personalAfter.award_id).toBe(personalAward)
    expect(personalAfter.pin_covered).toBe(true)
    expect(personalAfter.earned).toBe(true)

    const collectiveAfter = await status(collective, author)
    expect(collectiveAfter.live_target).toBe(13)
    expect(collectiveAfter.award_id).toBe(collectiveAward)
    expect(collectiveAfter.pin_covered).toBe(true)
    expect((await activeAward(collective, partner))?.id).toBeTruthy()

    // Drop one of the original offerings from the live menu; earned pin still holds.
    const dropKey = v1Keys[v1Keys.length - 1]
    const v3Id = uniqueCatalogId('a1-complete-v3')
    const v3Doc = cloneCatalog(v2Doc)
    v3Doc.catalog_id = v3Id
    v3Doc.base_catalog_id = v2Id
    for (const drink of v3Doc.drinks) {
      if (drink.key !== dropKey) continue
      for (const offering of drink.bar_offerings) {
        if (offering.bar_key !== BAR) continue
        offering.classification_tags = [
          ...new Set([...(offering.classification_tags ?? []), 'collection-excluded']),
        ]
      }
    }
    await stageAndPublish(v3Doc)
    const afterDrop = await status(personal, author)
    expect(afterDrop.live_target).toBe(12)
    expect(afterDrop.award_id).toBe(personalAward)
    expect(afterDrop.pin_covered).toBe(true)
  })

  it('records stable bar_offerings.id across admin publish full snapshots', async () => {
    const v1Id = uniqueCatalogId('a1-id-v1')
    const v1Doc = buildGauntletCatalog(v1Id, { eligibleCount: KEEP })
    const keys = eligibleWakeKeys(v1Doc)
    const first = await stageAndPublish(v1Doc)
    const before = await offeringIdsForKeys(keys)

    const v2Id = uniqueCatalogId('a1-id-v2')
    const v2Doc = buildGauntletCatalog(v2Id, { eligibleCount: KEEP + ADD, baseCatalogId: v1Id })
    const second = await stageAndPublish(v2Doc, first.catalog_version_id as string)
    expect(second.catalog_version_id).not.toBe(first.catalog_version_id)
    const after = await offeringIdsForKeys(keys)
    expect(after).toEqual(before)
  })
})

function buildGauntletCatalog(
  catalogId: string,
  opts: { eligibleCount: number; baseCatalogId?: string; renameDisplay?: { key: string; name: string } },
): CatalogImportDocument {
  const doc = cloneCatalog(buildScheduleReadyCatalog(80, 45))
  doc.catalog_id = catalogId
  doc.base_catalog_id = opts.baseCatalogId ?? null
  doc.schema_version = '1.1'

  const cocktails = doc.drinks.filter((drink) => drink.kind === 'named_cocktail')
  // Guarantee enough wake-view offerings by attaching them to the first N cocktails.
  for (let i = 0; i < opts.eligibleCount; i += 1) {
    const drink = cocktails[i]
    if (!drink) throw new Error(`fixture needs at least ${opts.eligibleCount} named cocktails`)
    if (!drink.bar_offerings.some((offering) => offering.bar_key === BAR)) {
      drink.bar_offerings.push({
        bar_key: BAR,
        ingredient_keys: ['lime-juice'],
        display_ingredients: ['Lime Juice'],
        price_usd: 12,
        price_status: 'verified_within_limit',
        evidence_reference: `a1-gauntlet-${drink.key}`,
      })
    }
  }

  const keep = new Set(cocktails.slice(0, opts.eligibleCount).map((drink) => drink.key))
  for (const drink of cocktails) {
    for (const offering of drink.bar_offerings) {
      if (offering.bar_key !== BAR) continue
      if (keep.has(drink.key)) {
        offering.classification_tags = (offering.classification_tags ?? []).filter(
          (tag) => tag !== 'collection-excluded',
        )
      } else {
        offering.classification_tags = [
          ...new Set([...(offering.classification_tags ?? []), 'collection-excluded']),
        ]
      }
    }
  }

  if (opts.renameDisplay) {
    const drink = doc.drinks.find((row) => row.key === opts.renameDisplay!.key)
    if (drink) drink.name = opts.renameDisplay.name
  }

  return doc
}

function eligibleWakeKeys(doc: CatalogImportDocument) {
  return doc.drinks
    .filter(
      (drink) =>
        drink.kind === 'named_cocktail' &&
        drink.bar_offerings.some(
          (offering) =>
            offering.bar_key === BAR &&
            offering.price_status !== 'verified_over_limit' &&
            !(offering.classification_tags ?? []).includes('collection-excluded'),
        ),
    )
    .map((drink) => drink.key)
}

async function stageAndPublish(doc: CatalogImportDocument, expectedActive?: string) {
  const preview = previewCatalogImport(doc)
  expect(preview.errors ?? [], JSON.stringify(preview.errors ?? preview, null, 2)).toEqual([])
  expect(isReadyToStage(preview), JSON.stringify(preview, null, 2)).toBe(true)
  const hash = await hashPayload(doc)
  const staged = await admin.rpc('admin_stage_catalog_import', {
    p_client_request_id: randomUUID(),
    p_payload: doc,
    p_validation: buildStageValidation(preview, hash),
  })
  expect(staged.error).toBeNull()
  expect(staged.data.ok, JSON.stringify(staged.data)).toBe(true)

  const active =
    expectedActive ??
    (
      await service.from('active_catalog_pointer').select('catalog_version_id').eq('id', 1).single()
    ).data!.catalog_version_id

  const published = await admin.rpc('admin_publish_catalog_import', {
    p_client_request_id: randomUUID(),
    p_candidate_id: staged.data.candidate_id,
    p_expected_active_catalog_version_id: active,
    p_expected_payload_hash: hash,
  })
  expect(published.error).toBeNull()
  expect(published.data.ok, JSON.stringify(published.data)).toBe(true)

  const { error: scheduleError } = await service.rpc('dev_generate_bounty_schedule', {
    p_seed: doc.catalog_id,
  })
  if (scheduleError) throw scheduleError
  const { error: dailyError } = await service.rpc('dev_seed_daily_assignments')
  if (dailyError) throw dailyError

  return published.data as { catalog_version_id: string; catalog_id: string }
}

async function offeringIdsForKeys(keys: string[]) {
  const out: Record<string, string> = {}
  for (const key of keys) {
    const offering = await lookupOffering(service, BAR, key)
    out[key] = offering.offering_id
  }
  return out
}

async function insertCollection(config: Record<string, unknown>) {
  const { data, error } = await service
    .from('achievement_definitions')
    .insert({
      stable_key: `a1-replace-${randomUUID()}`,
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'Lorem ipsum',
      display_description: 'Lorem ipsum dolor sit amet.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'offering_collection',
      condition_config: config,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

async function status(definitionId: string, owner: string) {
  const { data, error } = await service.rpc('achievement_collection_status', {
    p_definition_id: definitionId,
    p_owner_player: owner,
  })
  if (error) throw error
  return data as CollectionStatus
}

async function activeAward(definitionId: string, owner: string) {
  const { data, error } = await service
    .from('achievement_awards')
    .select('id')
    .eq('definition_id', definitionId)
    .eq('owner_player_id', owner)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return data
}

async function makePlayer(label: string) {
  const token = randomUUID().slice(0, 8)
  const { data, error } = await service
    .from('players')
    .insert({
      display_name: `Synthetic ${label} ${token}`,
      login_alias: `synthetic-${label}-${token}`,
      is_admin: false,
      active: true,
    })
    .select('id')
    .single()
  if (error) throw error
  const id = data.id as string
  createdPlayers.push(id)
  const { error: membershipError } = await service.from('game_memberships').insert({
    player_id: id,
    game: 'drinkit',
    enabled: true,
  })
  if (membershipError) throw membershipError
  return id
}

async function deleteEphemeralPlayers() {
  const { data, error } = await service
    .from('players')
    .select('id')
    .like('login_alias', 'synthetic-replace-%')
  if (error) throw error
  const ids = [...createdPlayers, ...((data ?? []).map((row) => row.id as string))]
  createdPlayers = []
  if (ids.length === 0) return
  await service.from('submissions').delete().in('author_player_id', ids)
  await service.from('gallery_events').delete().in('owner_player_id', ids)
  await service.from('players').delete().in('id', ids)
}

async function logNamed(player: string, offeringId: string, at: string) {
  await exposeCurrentSlots(service, at)
  return submitAt(
    service,
    player,
    drinkPayload({ barKey: BAR, offeringId }),
    at,
  )
}

function expectOk(result: { data: { ok?: boolean; code?: string } | null; error: { message: string } | null }) {
  expect(result.error).toBeNull()
  expect(result.data?.ok, result.data?.code ?? 'submit failed').toBe(true)
}
