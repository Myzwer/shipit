/**
 * Stage A1 — same-log predicates and version-aware drink collections.
 * Players created here are synthetic. Condition configs embed those generated ids only.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildScheduleReadyCatalog } from '../fixtures/catalog/builders'
import { clearTestAchievements } from '../helpers/achievementFixtures'
import {
  DEV_BASE_OFFSET_MIN,
  DEV_DAY1,
  noonDay1Utc,
  slotUtc,
} from '../helpers/bountyFixtures'
import { drinkPayload, exposeCurrentSlots, lookupOffering, submitAt } from '../helpers/drinkitSubmit'
import {
  createLocalClient,
  loadLocalFixtures,
  signInAs,
  type LocalFixtures,
} from '../helpers/localSupabase'

type CollectionItem = {
  offering_id: string
  concept_key: string
  display_name: string
  mine: boolean
  covered: boolean
}

type CollectionStatus = {
  ok: boolean
  code?: string
  live_target: number
  live_current: number
  earned: boolean
  award_id: string | null
  pin_covered: boolean | null
  pin: { catalog_version_id?: string; target?: number; offering_ids?: string[] } | null
  items: CollectionItem[]
}

const BASE_CATALOG_ID = 'a1-base'

let fixtures: LocalFixtures
let service: SupabaseClient
let admin: SupabaseClient
let member: SupabaseClient
let alpha = ''
let beta = ''
let gamma = ''
let shipOnly = ''
let syntheticTeam = ''
const createdPlayers: string[] = []

beforeAll(async () => {
  fixtures = await loadLocalFixtures()
  if (!fixtures.available || !fixtures.summary || !fixtures.serviceRoleKey) {
    throw new Error('A1 engine tests require local Supabase, identities, and LOCAL_TEST_PASSWORD')
  }
  service = createLocalClient(fixtures.summary.supabase_url, fixtures.serviceRoleKey)
  const adminIdentity = fixtures.summary.identities.find((row) => row.is_admin)
  const memberIdentity = fixtures.summary.identities.find((row) => !row.is_admin)
  if (!adminIdentity || !memberIdentity) {
    throw new Error('A1 engine tests require one admin identity and one non-admin identity')
  }
  admin = await signInAs(fixtures, adminIdentity.key)
  member = await signInAs(fixtures, memberIdentity.key)

  const { error: seedError } = await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: DEV_DAY1,
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  if (seedError) throw seedError
  await clearTestAchievements(service)
  await deleteSyntheticPlayers()
  await publishFixture(BASE_CATALOG_ID)
}, 180000)

beforeEach(async () => {
  await service.from('game_control').update({ status: 'active', finalized_at_utc: null }).eq('game', 'drinkit')
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  const active = await activeCatalog()
  if (active.catalog_id !== BASE_CATALOG_ID) await publishFixture(BASE_CATALOG_ID)
  await service
    .from('catalog_version_offering_tags')
    .delete()
    .eq('catalog_version_id', (await activeCatalog()).version_id)
    .eq('tag', 'collection-excluded')
  await service
    .from('admin_manual_offerings')
    .delete()
    .eq('catalog_version_id', (await activeCatalog()).version_id)
  await clearTestAchievements(service)
  alpha = await makePlayer('alpha', ['drinkit'])
  beta = await makePlayer('beta', ['drinkit'])
  gamma = await makePlayer('gamma', ['drinkit'])
  shipOnly = await makePlayer('ship', ['shipit'])
}, 180000)

afterEach(async () => {
  await clearTestAchievements(service)
  if (createdPlayers.length === 0) return
  await service.from('admin_manual_offerings').delete().in('created_by_player_id', createdPlayers)
  await service.from('submissions').delete().in('author_player_id', createdPlayers)
  await service.from('gallery_events').delete().in('owner_player_id', createdPlayers)
  await service.from('players').delete().in('id', createdPlayers)
  createdPlayers.length = 0
}, 180000)

describe('same-log predicates', () => {
  it('requires every constraint on one log and does not award the companion', async () => {
    const versionId = (await activeCatalog()).version_id
    const wake = await lookupOffering(service, 'wake-view', 'mai-tai')
    const pool = await lookupOffering(service, 'poolside', 'mai-tai')
    const { error: tagError } = await service.from('catalog_version_offering_tags').insert({
      catalog_version_id: versionId,
      offering_id: wake.offering_id,
      tag: 'margarita',
    })
    expect(tagError).toBeNull()

    const split = await insertDef('same_log', {
      player_ids: [beta],
      drink_concept_key: 'mai-tai',
    })
    const at = noonDay1Utc()
    const conceptOnly = await logNamed(alpha, 'wake-view', wake.offering_id, at)
    expectOk(conceptOnly)
    expect(await activeAward(split, alpha)).toBeNull()

    const companionOnly = await logGeneric(alpha, slotUtc(1, '12:10:00'), [beta])
    expectOk(companionOnly)
    expect(await activeAward(split, alpha)).toBeNull()

    const together = await logNamed(alpha, 'wake-view', wake.offering_id, slotUtc(1, '12:20:00'), [beta])
    expectOk(together)
    const earned = await activeAward(split, alpha)
    expect(earned).not.toBeNull()
    expect(await activeAward(split, beta)).toBeNull()

    const specific = await insertDef('same_log', {
      player_ids: [beta],
      drink_concept_key: 'mai-tai',
      bar_key: 'wake-view',
      drink_tag: 'margarita',
    })
    const otherBar = await logNamed(gamma, 'poolside', pool.offering_id, slotUtc(1, '12:30:00'), [beta])
    expectOk(otherBar)
    expect(await activeAward(specific, gamma)).toBeNull()
    const tagged = await logNamed(gamma, 'wake-view', wake.offering_id, slotUtc(1, '12:40:00'), [beta])
    expectOk(tagged)
    expect(await activeAward(specific, gamma)).not.toBeNull()
    expect(await activeAward(specific, beta)).toBeNull()
  })

  it('lets the author match player_ids and ignores a different companion', async () => {
    const self = await insertDef('same_log', { player_ids: [alpha] })
    const wrong = await insertDef('same_log', { player_ids: [beta] })
    const at = noonDay1Utc()
    const alone = await logGeneric(alpha, at)
    expectOk(alone)
    expect(await activeAward(self, alpha)).not.toBeNull()
    expect(await activeAward(wrong, alpha)).toBeNull()

    const withGamma = await logGeneric(alpha, slotUtc(1, '12:15:00'), [gamma])
    expectOk(withGamma)
    expect(await activeAward(wrong, alpha)).toBeNull()
    const withBeta = await logGeneric(alpha, slotUtc(1, '12:25:00'), [beta])
    expectOk(withBeta)
    expect(await activeAward(wrong, alpha)).not.toBeNull()
    expect(await activeAward(wrong, beta)).toBeNull()
  })

  it('matches 5:00pm through 6:59pm ship time and still applies the Friday cutoff', async () => {
    const after = await insertDef('same_log', { hour_start: 17, hour_end: 19 })
    expectOk(await logGeneric(gamma, slotUtc(1, '19:00:00')))
    expect(await activeAward(after, gamma)).toBeNull()

    const early = await insertDef('same_log', { hour_start: 17, hour_end: 19 })
    expectOk(await logGeneric(gamma, slotUtc(1, '16:00:00')))
    expect(await activeAward(early, gamma)).toBeNull()

    const window = await insertDef('same_log', { hour_start: 17, hour_end: 19 })
    expectOk(await logGeneric(gamma, slotUtc(1, '17:00:00')))
    expect(await activeAward(window, gamma)).not.toBeNull()

    const lateWindow = await insertDef('same_log', { hour_start: 17, hour_end: 19 })
    expectOk(await logGeneric(gamma, slotUtc(1, '18:59:00')))
    expect(await activeAward(lateWindow, gamma)).not.toBeNull()

    const friday = await insertDef('same_log', { hour_start: 17, hour_end: 19 })
    expectOk(await logGeneric(beta, slotUtc(7, '17:30:00')))
    expect(await activeAward(friday, beta)).not.toBeNull()
    const ended = await logGeneric(beta, slotUtc(7, '18:30:00'))
    expect(ended.error).toBeNull()
    expect(ended.data.ok).toBe(false)
    expect(ended.data.code).toMatch(/GAME_ENDED/)
  })

  it('keeps cross-log all working across separate logs', async () => {
    const cross = await insertDef('all', {
      conditions: [
        { type: 'exact_match', drink_mode: 'generic_beer' },
        { type: 'exact_match', drink_concept_key: 'mai-tai' },
      ],
    })
    const wake = await lookupOffering(service, 'wake-view', 'mai-tai')
    expectOk(await logGeneric(alpha, noonDay1Utc()))
    expect(await activeAward(cross, alpha)).toBeNull()
    expectOk(await logNamed(alpha, 'wake-view', wake.offering_id, slotUtc(1, '13:00:00')))
    expect(await activeAward(cross, alpha)).not.toBeNull()
  })

  it('does not abort a submit when a collection config is invalid', async () => {
    const broken = await insertDef('offering_collection', {
      bar_key: 'wake-view',
      threshold: 'not-a-number',
    })
    expectOk(await logGeneric(alpha, noonDay1Utc()))
    expect(await activeAward(broken, alpha)).toBeNull()
  })
})

describe('personal collections follow the published menu', () => {
  it('counts distinct eligible offerings at one bar and moves the denominator before an award', async () => {
    const defId = await insertDef('offering_collection', { bar_key: 'wake-view' })
    const poolside = await insertDef('offering_collection', { bar_key: 'poolside' })
    const spirits = await insertDef('offering_collection', { bar_key: 'good-spirits' })
    const before = await status(defId, alpha)
    expect(before.live_target).toBeGreaterThan(2)
    expect(before.items.some((item) => item.concept_key === 'mai-tai')).toBe(true)
    expect((await status(poolside, alpha)).items.some((item) => item.concept_key === 'house-lager')).toBe(
      false,
    )
    expect(
      (await status(spirits, alpha)).items.some((item) => item.concept_key === 'premium-martini'),
    ).toBe(false)

    const keep = pickKeep(before.items)
    await excludeOfferings(
      before.items.map((item) => item.offering_id).filter((id) => !keep.some((item) => item.offering_id === id)),
    )
    const shrunk = await status(defId, alpha)
    expect(shrunk.live_target).toBe(2)
    expect(shrunk.live_current).toBe(0)
    expect(shrunk.earned).toBe(false)
    expect(shrunk.items).toHaveLength(2)

    const wakeMai = keep.find((item) => item.concept_key === 'mai-tai') ?? keep[0]
    const other = keep.find((item) => item.offering_id !== wakeMai.offering_id)!
    const poolMai = await lookupOffering(service, 'poolside', 'mai-tai')
    expectOk(await logNamed(alpha, 'poolside', poolMai.offering_id, noonDay1Utc()))
    expect((await status(defId, alpha)).live_current).toBe(0)

    expectOk(await logNamed(alpha, 'wake-view', wakeMai.offering_id, slotUtc(1, '12:10:00')))
    expectOk(await logNamed(alpha, 'wake-view', wakeMai.offering_id, slotUtc(1, '12:20:00')))
    const once = await status(defId, alpha)
    expect(once.live_current).toBe(1)
    expect(once.live_target).toBe(2)
    expect(once.earned).toBe(false)
    expect(once.items.find((item) => item.offering_id === other.offering_id)?.covered).toBe(false)

    const versionId = (await activeCatalog()).version_id
    const { data: excluded } = await service
      .from('catalog_version_offering_tags')
      .select('offering_id')
      .eq('catalog_version_id', versionId)
      .eq('tag', 'collection-excluded')
      .limit(1)
    expect(excluded?.length).toBe(1)
    await service
      .from('catalog_version_offering_tags')
      .delete()
      .eq('catalog_version_id', versionId)
      .eq('offering_id', excluded![0].offering_id)
      .eq('tag', 'collection-excluded')
    const grown = await status(defId, alpha)
    expect(grown.live_target).toBe(3)
    expect(grown.live_current).toBe(1)
    expect(grown.earned).toBe(false)
    expect(grown.items.filter((item) => !item.covered)).toHaveLength(2)

    const manualTarget = grown.items.find((item) => !item.covered)!
    const { data: offering } = await service
      .from('bar_offerings')
      .select('id, drink_concept_id, drink_concepts!inner(canonical_key)')
      .eq('id', manualTarget.offering_id)
      .single()
    const concept = offering!.drink_concepts as { canonical_key: string } | { canonical_key: string }[]
    const conceptKey = Array.isArray(concept) ? concept[0].canonical_key : concept.canonical_key
    const { error: manualError } = await service.from('admin_manual_offerings').insert({
      catalog_version_id: versionId,
      offering_id: manualTarget.offering_id,
      drink_concept_id: offering!.drink_concept_id,
      bar_id: (await barId('wake-view')),
      display_name: 'Lorem manual',
      drink_canonical_key: conceptKey,
      kind: 'named_cocktail',
      active: true,
      created_by_player_id: alpha,
    })
    expect(manualError).toBeNull()
    expect((await status(defId, alpha)).live_target).toBe(2)
    await service
      .from('admin_manual_offerings')
      .update({ active: false })
      .eq('catalog_version_id', versionId)
      .eq('offering_id', manualTarget.offering_id)
    expect((await status(defId, alpha)).live_target).toBe(3)

    const missing = (await status(defId, alpha)).items.filter((item) => !item.covered)
    for (let index = 0; index < missing.length; index += 1) {
      const minute = String(40 + index).padStart(2, '0')
      expectOk(await logNamed(alpha, 'wake-view', missing[index].offering_id, slotUtc(1, `12:${minute}:00`)))
    }
    const earned = await status(defId, alpha)
    expect(earned.earned).toBe(true)
    expect(earned.live_target).toBe(3)
    expect(earned.live_current).toBe(3)
    expect(earned.pin_covered).toBe(true)
    expect(earned.pin?.target).toBe(3)
  })

  it('uses a fixed threshold of the live eligible set instead of a hardcoded menu count', async () => {
    const defId = await insertDef('offering_collection', {
      bar_key: 'wake-view',
      mode: 'threshold',
      threshold: 1,
    })
    const open = await status(defId, alpha)
    expect(open.live_target).toBe(1)
    expect(open.items.length).toBeGreaterThan(1)
    const drink = open.items[0]
    expectOk(await logNamed(alpha, 'wake-view', drink.offering_id, noonDay1Utc()))
    const earned = await status(defId, alpha)
    expect(earned.earned).toBe(true)
    expect(earned.live_target).toBe(1)
    expect(earned.pin?.target).toBe(1)
    expect(earned.pin?.offering_ids).toEqual([drink.offering_id])
  })
})

describe('collective collections', () => {
  it('grants every current Drink It member once, including someone who logged nothing', async () => {
    const defId = await insertDef('offering_collection', {
      bar_key: 'wake-view',
      scope: 'collective',
    })
    const open = await status(defId, alpha)
    const keep = pickKeep(open.items)
    await excludeOfferings(
      open.items.map((item) => item.offering_id).filter((id) => !keep.some((item) => item.offering_id === id)),
    )
    expect((await status(defId, alpha)).live_target).toBe(2)

    const first = await logNamed(alpha, 'wake-view', keep[0].offering_id, noonDay1Utc())
    expectOk(first)
    expect((await status(defId, alpha)).live_current).toBe(1)
    expect((await status(defId, alpha)).earned).toBe(false)

    const second = await logNamed(beta, 'wake-view', keep[1].offering_id, slotUtc(1, '12:20:00'))
    expectOk(second)
    const awards = await activeAwards(defId)
    const members = await enabledDrinkitIds()
    expect(awards.map((row) => row.owner_player_id).sort()).toEqual(members.sort())
    expect(awards.some((row) => row.owner_player_id === shipOnly)).toBe(false)
    const { count: gammaLogs } = await service
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('author_player_id', gamma)
    expect(gammaLogs).toBe(0)
    const gammaAward = awards.find((row) => row.owner_player_id === gamma)!
    expect(await galleryCount(gammaAward.id)).toBe(1)
    const betaAward = awards.find((row) => row.owner_player_id === beta)!
    expect(second.data.new_achievement_ids as string[]).toContain(betaAward.id)
    for (const row of awards) {
      if (row.owner_player_id !== beta) {
        expect(second.data.new_achievement_ids as string[]).not.toContain(row.id)
      }
    }

    const repeat = await logNamed(alpha, 'wake-view', keep[0].offering_id, slotUtc(1, '12:30:00'))
    expectOk(repeat)
    expect((await status(defId, alpha)).live_current).toBe(2)

    const beforeIds = new Map((await activeAwards(defId)).map((row) => [row.owner_player_id, row.id]))
    await service.from('game_memberships').update({ enabled: false }).eq('player_id', gamma).eq('game', 'drinkit')
    const voided = await admin.rpc('admin_void_submission', {
      p_client_request_id: randomUUID(),
      p_submission_id: repeat.data.submission_id,
      p_expected_status: 'accepted',
      p_reason: 'lorem redundant void',
    })
    expect(voided.data.ok).toBe(true)
    const after = await activeAwards(defId)
    expect(after.find((row) => row.owner_player_id === gamma)?.id).toBe(beforeIds.get(gamma))
    expect(after.map((row) => row.id).sort()).toEqual([...beforeIds.values()].sort())

    await service.from('game_memberships').update({ enabled: true }).eq('player_id', gamma).eq('game', 'drinkit')
    const reenabled = await activeAwards(defId)
    expect(reenabled.filter((row) => row.owner_player_id === gamma)).toHaveLength(1)
  })

  it('revokes a collective award when the last necessary log is voided and keeps an unrelated award', async () => {
    const collection = await insertDef('offering_collection', {
      bar_key: 'wake-view',
      scope: 'collective',
    })
    const counter = await insertDef('event_count', { event: 'drink_log', threshold: 1 })
    const open = await status(collection, alpha)
    const keep = pickKeep(open.items)
    await excludeOfferings(
      open.items.map((item) => item.offering_id).filter((id) => !keep.some((item) => item.offering_id === id)),
    )
    expectOk(await logGeneric(alpha, noonDay1Utc()))
    const beerAward = await activeAward(counter, alpha)
    expect(beerAward).not.toBeNull()

    expectOk(await logNamed(alpha, 'wake-view', keep[0].offering_id, slotUtc(1, '12:10:00')))
    const completing = await logNamed(beta, 'wake-view', keep[1].offering_id, slotUtc(1, '12:20:00'))
    expectOk(completing)
    expect((await activeAwards(collection)).length).toBeGreaterThan(0)

    const voided = await admin.rpc('admin_void_submission', {
      p_client_request_id: randomUUID(),
      p_submission_id: completing.data.submission_id,
      p_expected_status: 'accepted',
      p_reason: 'lorem last drink void',
    })
    expect(voided.data.ok).toBe(true)
    expect(await activeAwards(collection)).toEqual([])
    expect((await activeAward(counter, alpha))?.id).toBe(beerAward!.id)
  })

  it('does not duplicate awards or gallery events on replay', async () => {
    const defId = await insertDef('offering_collection', {
      bar_key: 'wake-view',
      scope: 'collective',
      threshold: 1,
    })
    const drink = (await status(defId, alpha)).items[0]
    const key = randomUUID()
    const at = noonDay1Utc()
    await exposeCurrentSlots(service, at)
    const payload = drinkPayload({
      barKey: 'wake-view',
      offeringId: drink.offering_id,
      idempotencyKey: key,
    })
    const first = await submitAt(service, alpha, payload, at)
    expectOk(first)
    const awards = await activeAwards(defId)
    const replay = await submitAt(service, alpha, payload, at)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(await activeAwards(defId)).toEqual(awards)
    for (const row of awards) expect(await galleryCount(row.id)).toBe(1)
  })

  it('ends a parallel completion with one active award per member', async () => {
    const defId = await insertDef('offering_collection', {
      bar_key: 'wake-view',
      scope: 'collective',
      threshold: 1,
    })
    const items = (await status(defId, alpha)).items
    const [left, right] = await Promise.all([
      logNamed(alpha, 'wake-view', items[0].offering_id, slotUtc(1, '14:00:00')),
      logNamed(beta, 'wake-view', items[1].offering_id, slotUtc(1, '14:05:00')),
    ])
    expectOk(left)
    expectOk(right)
    const awards = await activeAwards(defId)
    const owners = awards.map((row) => row.owner_player_id)
    expect(new Set(owners).size).toBe(owners.length)
    expect(owners).toContain(alpha)
    expect(owners).toContain(beta)
    expect(owners).toContain(gamma)
    expect(owners).not.toContain(shipOnly)
  })
})

describe('published catalog changes', () => {
  it('keeps earned awards when the live menu grows and does not give that award to a later member', async () => {
    const keepKeys: string[] = []
    const publishedA = await publishFixture(`a1-gauntlet-${randomUUID().slice(0, 8)}`, (catalog) => {
      const wake = catalog.drinks.filter(
        (drink) =>
          drink.kind === 'named_cocktail' &&
          drink.bar_offerings.some(
            (offering) => offering.bar_key === 'wake-view' && offering.price_status !== 'verified_over_limit',
          ),
      )
      const preferred = wake.find((drink) => drink.key === 'mai-tai') ?? wake[0]
      const second = wake.find((drink) => drink.key !== preferred.key)
      if (!preferred || !second) throw new Error('wake-view fixture needs two eligible offerings')
      keepKeys.push(preferred.key, second.key)
      const keep = new Set(keepKeys)
      for (const drink of catalog.drinks) {
        for (const offering of drink.bar_offerings) {
          if (offering.bar_key !== 'wake-view' || keep.has(drink.key)) continue
          offering.classification_tags = [...(offering.classification_tags ?? []), 'collection-excluded']
        }
      }
    })
    const versionA = publishedA.catalog_version_id
    const fullMenu = await insertDef('offering_collection', {
      bar_key: 'wake-view',
      scope: 'collective',
    })
    const threshold = await insertDef('offering_collection', {
      bar_key: 'wake-view',
      threshold: 1,
    })
    expect((await status(fullMenu, alpha)).live_target).toBe(2)
    const first = await lookupOffering(service, 'wake-view', keepKeys[0])
    const secondOffering = await lookupOffering(service, 'wake-view', keepKeys[1])
    expectOk(await logNamed(alpha, 'wake-view', first.offering_id, noonDay1Utc()))
    const personal = await status(threshold, alpha)
    expect(personal.earned).toBe(true)
    const personalAward = personal.award_id
    expectOk(await logNamed(beta, 'wake-view', secondOffering.offering_id, slotUtc(1, '12:15:00')))
    const earned = await status(fullMenu, alpha)
    expect(earned.earned).toBe(true)
    expect(earned.live_target).toBe(2)
    const collectiveAward = earned.award_id

    const joiner = await makePlayer('delta', ['drinkit'])
    expect((await activeAward(fullMenu, joiner))?.id).toBeTruthy()
    expect(await activeAward(threshold, joiner)).toBeNull()

    const published = await publishFixture(`a1-grown-${randomUUID().slice(0, 8)}`)
    const versionB = published.catalog_version_id as string
    const grown = await status(fullMenu, alpha)
    expect(grown.live_target).toBeGreaterThan(2)
    expect(grown.award_id).toBe(collectiveAward)
    expect(grown.pin_covered).toBe(true)
    expect(grown.pin?.catalog_version_id).toBe(versionA)
    expect(grown.items.filter((item) => !item.covered).length).toBeGreaterThan(0)
    const personalAfter = await status(threshold, alpha)
    expect(personalAfter.award_id).toBe(personalAward)
    expect(personalAfter.pin_covered).toBe(true)

    const { error: tagError } = await service.from('catalog_version_offering_tags').insert({
      catalog_version_id: versionB,
      offering_id: first.offering_id,
      tag: 'collection-excluded',
    })
    expect(tagError).toBeNull()
    expect((await status(fullMenu, alpha)).pin_covered).toBe(true)
    expect((await status(fullMenu, alpha)).award_id).toBe(collectiveAward)

    const late = await makePlayer('epsilon', ['drinkit'])
    expect(await activeAward(fullMenu, late)).toBeNull()
    expect((await activeAward(fullMenu, alpha))?.id).toBe(collectiveAward)

    const retired = await service.from('catalog_versions').update({ status: 'retired' }).eq('id', versionB).select('id')
    expect(retired.error).toBeNull()
    const reactivated = await service
      .from('catalog_versions')
      .update({ status: 'active' })
      .eq('id', versionA)
      .select('id')
    expect(reactivated.error).toBeNull()
    expect(reactivated.data).toHaveLength(1)
    const pointed = await service
      .from('active_catalog_pointer')
      .update({ catalog_version_id: versionA })
      .eq('id', 1)
      .select('catalog_version_id')
    expect(pointed.error).toBeNull()
    const restored = await status(fullMenu, alpha)
    expect(restored.live_target).toBe(2)
    expect(restored.award_id).toBe(collectiveAward)
    expect(restored.pin_covered).toBe(true)
  })
})

describe('finale and privileges', () => {
  it('does not revoke an earned collection after the finale latch', async () => {
    const defId = await insertDef('offering_collection', {
      bar_key: 'wake-view',
      threshold: 1,
    })
    const drink = (await status(defId, alpha)).items[0]
    const logged = await logNamed(alpha, 'wake-view', drink.offering_id, noonDay1Utc())
    expectOk(logged)
    const awardId = (await activeAward(defId, alpha))!.id

    const { error: latchError } = await service
      .from('game_control')
      .update({ status: 'final', finalized_at_utc: new Date().toISOString() })
      .eq('game', 'drinkit')
    expect(latchError).toBeNull()

    const locked = await admin.rpc('admin_void_submission', {
      p_client_request_id: randomUUID(),
      p_submission_id: logged.data.submission_id,
      p_expected_status: 'accepted',
      p_reason: 'lorem finale void',
    })
    expect(locked.data.ok).toBe(false)
    expect(locked.data.code).toBe('FINALE_LOCKED')

    await service.from('submissions').update({ status: 'voided' }).eq('id', logged.data.submission_id)
    const { error: hookError } = await service.rpc('achievement_on_void_submission', {
      p_submission_id: logged.data.submission_id,
    })
    expect(hookError).toBeNull()
    expect((await activeAward(defId, alpha))?.id).toBe(awardId)
  })

  it('rejects client calls that grant or recompute awards', async () => {
    const deniedEval = await member.rpc('achievement_evaluate_for_owner', {
      p_game: 'drinkit',
      p_owner_player: alpha,
      p_owner_team: null,
      p_trigger_submission: null,
      p_actor_player: alpha,
      p_at: new Date().toISOString(),
    })
    expect(deniedEval.error?.message ?? '').toMatch(/permission|42501/i)

    const deniedBackfill = await member.rpc('achievement_backfill_collective_for_player', {
      p_player_id: alpha,
    })
    expect(deniedBackfill.error?.message ?? '').toMatch(/permission|42501/i)

    const deniedStatus = await member.rpc('achievement_collection_status', {
      p_definition_id: randomUUID(),
      p_owner_player: alpha,
    })
    expect(deniedStatus.error?.message ?? '').toMatch(/permission|42501/i)

    const deniedInsert = await member.from('achievement_awards').insert({
      definition_id: randomUUID(),
      owner_player_id: alpha,
      status: 'active',
    })
    expect(deniedInsert.error).not.toBeNull()
  })
})

async function publishFixture(
  catalogId: string,
  mutate?: (catalog: ReturnType<typeof buildScheduleReadyCatalog>) => void,
) {
  const catalog = buildScheduleReadyCatalog(72, 39)
  catalog.catalog_id = catalogId
  mutate?.(catalog)
  const { data, error } = await service.rpc('dev_activate_catalog_fixture', { p_payload: catalog })
  if (error) throw error
  const { error: scheduleError } = await service.rpc('dev_generate_bounty_schedule', { p_seed: catalogId })
  if (scheduleError) throw scheduleError
  const { error: dailyError } = await service.rpc('dev_seed_daily_assignments')
  if (dailyError) throw dailyError
  return data as { catalog_version_id: string; catalog_id: string }
}

async function activeCatalog() {
  const { data: pointer, error } = await service
    .from('active_catalog_pointer')
    .select('catalog_version_id')
    .eq('id', 1)
    .single()
  if (error) throw error
  const { data: version, error: versionError } = await service
    .from('catalog_versions')
    .select('catalog_id')
    .eq('id', pointer.catalog_version_id)
    .single()
  if (versionError) throw versionError
  return { version_id: pointer.catalog_version_id as string, catalog_id: version.catalog_id as string }
}

async function makePlayer(label: string, games: Array<'drinkit' | 'shipit'>) {
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
  if (games.includes('shipit')) {
    const teamId = await ensureSyntheticTeam()
    const { error: teamError } = await service.from('team_memberships').insert({
      player_id: id,
      team_id: teamId,
    })
    if (teamError) throw teamError
  }
  const { error: membershipError } = await service.from('game_memberships').insert(
    games.map((game) => ({ player_id: id, game, enabled: true })),
  )
  if (membershipError) throw membershipError
  return id
}

async function ensureSyntheticTeam() {
  if (syntheticTeam) return syntheticTeam
  const token = randomUUID().slice(0, 8)
  const { data, error } = await service
    .from('teams')
    .insert({ name: `Synthetic Team ${token}`, active: true })
    .select('id')
    .single()
  if (error) throw error
  syntheticTeam = data.id as string
  return syntheticTeam
}

async function deleteSyntheticPlayers() {
  const { data, error } = await service.from('players').select('id').like('login_alias', 'synthetic-%')
  if (error) throw error
  const ids = (data ?? []).map((row) => row.id as string)
  if (ids.length === 0) return
  await service.from('admin_manual_offerings').delete().in('created_by_player_id', ids)
  await service.from('submissions').delete().in('author_player_id', ids)
  await service.from('gallery_events').delete().in('owner_player_id', ids)
  await service.from('players').delete().in('id', ids)
}

async function insertDef(type: string, config: Record<string, unknown>) {
  const { data, error } = await service
    .from('achievement_definitions')
    .insert({
      stable_key: `a1-${randomUUID()}`,
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'Lorem ipsum',
      display_description: 'Lorem ipsum dolor sit amet.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: type,
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

async function activeAwards(definitionId: string) {
  const { data, error } = await service
    .from('achievement_awards')
    .select('id, owner_player_id')
    .eq('definition_id', definitionId)
    .eq('status', 'active')
    .order('owner_player_id')
  if (error) throw error
  return data ?? []
}

async function galleryCount(awardId: string) {
  const { count, error } = await service
    .from('gallery_events')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'achievement')
    .eq('achievement_award_id', awardId)
    .eq('active', true)
  if (error) throw error
  return count ?? 0
}

async function enabledDrinkitIds() {
  const { data: memberships, error } = await service
    .from('game_memberships')
    .select('player_id')
    .eq('game', 'drinkit')
    .eq('enabled', true)
  if (error) throw error
  const ids = (memberships ?? []).map((row) => row.player_id as string)
  if (ids.length === 0) return []
  const { data: players, error: playerError } = await service
    .from('players')
    .select('id')
    .in('id', ids)
    .eq('active', true)
  if (playerError) throw playerError
  return (players ?? []).map((row) => row.id as string)
}

async function barId(barKey: string) {
  const { data, error } = await service.from('bars').select('id').eq('canonical_key', barKey).single()
  if (error) throw error
  return data.id as string
}

async function excludeOfferings(offeringIds: string[]) {
  if (offeringIds.length === 0) return
  const versionId = (await activeCatalog()).version_id
  const { error } = await service.from('catalog_version_offering_tags').insert(
    offeringIds.map((offeringId) => ({
      catalog_version_id: versionId,
      offering_id: offeringId,
      tag: 'collection-excluded',
    })),
  )
  if (error) throw error
}

function pickKeep(items: CollectionItem[]) {
  const mai = items.find((item) => item.concept_key === 'mai-tai')
  const rest = items.filter((item) => item !== mai)
  const keep = [mai, rest[0]].filter((item): item is CollectionItem => Boolean(item))
  if (keep.length < 2) throw new Error('wake-view fixture needs two eligible offerings')
  return keep
}

async function logNamed(
  player: string,
  barKey: string,
  offeringId: string,
  at: string,
  companions: string[] = [],
) {
  await exposeCurrentSlots(service, at)
  return submitAt(
    service,
    player,
    drinkPayload({ barKey, offeringId, companions }),
    at,
  )
}

async function logGeneric(player: string, at: string, companions: string[] = []) {
  await exposeCurrentSlots(service, at)
  return submitAt(
    service,
    player,
    drinkPayload({ barKey: 'wake-view', mode: 'generic_beer', companions }),
    at,
  )
}

function expectOk(result: { data: { ok?: boolean; code?: string } | null; error: { message: string } | null }) {
  expect(result.error).toBeNull()
  expect(result.data?.ok, result.data?.code ?? 'submit failed').toBe(true)
}
