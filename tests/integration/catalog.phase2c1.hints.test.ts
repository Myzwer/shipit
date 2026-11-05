/**
 * Phase 2C.1 — player-safe Ingredient hint contract.
 * Must not silently skip: requires local Supabase + identities.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import {
  createLocalClient,
  loadLocalFixtures,
  signInAs,
  type LocalFixtures,
} from '../helpers/localSupabase'

let fixtures: LocalFixtures
let service: ReturnType<typeof createLocalClient>
let versionId: string
let ingredientId: string
let currentCardId: string
let scheduledCardId: string

beforeAll(async () => {
  fixtures = await loadLocalFixtures()
  if (!fixtures.available || !fixtures.summary || !fixtures.anonKey || !fixtures.serviceRoleKey) {
    throw new Error(
      'Phase 2C.1 hint tests require local Supabase + provisioned identities (LOCAL_TEST_PASSWORD).',
    )
  }
  service = createLocalClient(fixtures.summary.supabase_url, fixtures.serviceRoleKey)

  await service.from('ingredient_bounty_public_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await service.from('catalog_versions').update({ status: 'retired' }).eq('status', 'active')

  const { data: version, error: vErr } = await service
    .from('catalog_versions')
    .insert({
      catalog_id: 'dev-hint-contract-v1',
      schema_version: '1.0',
      mode: 'full_snapshot',
      payload_hash: 'hint',
      manifest_json: { phase: '2c.1' },
      status: 'active',
      source_notes: {},
    })
    .select('id')
    .single()
  expect(vErr).toBeNull()
  versionId = version!.id

  const { data: ingredient, error: iErr } = await service
    .from('ingredients')
    .insert({ canonical_key: 'hint-orgeat' })
    .select('id')
    .single()
  expect(iErr).toBeNull()
  ingredientId = ingredient!.id

  await service.from('catalog_version_ingredients').insert({
    catalog_version_id: versionId,
    ingredient_id: ingredientId,
    display_name: 'Orgeat',
  })

  // Private candidate row (admin-only table) — must not leak via player reads.
  await service.from('ingredient_candidates').insert({
    catalog_version_id: versionId,
    ingredient_id: ingredientId,
    known_bar_count: 5,
    distinct_qualifying_drinks: 8,
    tier: 'hard_to_find',
    points: 75,
    eligible: true,
    notes: 'PRIVATE qualifying bars: wake-view, secret-bar — never expose',
  })

  const { data: scheduled } = await service
    .from('ingredient_bounty_public_cards')
    .insert({
      catalog_version_id: versionId,
      ingredient_id: ingredientId,
      ingredient_canonical_key: 'hint-future-syrup',
      display_name: 'Future Syrup',
      tier: 'elusive',
      points: 100,
      known_bar_count: 2,
      exposure_status: 'scheduled',
      slot_key: 'future:day1:12',
    })
    .select('id')
    .single()
  scheduledCardId = scheduled!.id

  const { data: current } = await service
    .from('ingredient_bounty_public_cards')
    .insert({
      catalog_version_id: versionId,
      ingredient_id: ingredientId,
      ingredient_canonical_key: 'hint-orgeat',
      display_name: 'Orgeat',
      tier: 'hard_to_find',
      points: 75,
      known_bar_count: 5,
      exposure_status: 'current',
      slot_key: 'day1:12',
      exposed_at_utc: new Date().toISOString(),
    })
    .select('id')
    .single()
  currentCardId = current!.id
})

afterAll(async () => {
  if (!service) return
  await service.from('ingredient_bounty_public_cards').delete().eq('catalog_version_id', versionId)
  await service.from('ingredient_candidates').delete().eq('catalog_version_id', versionId)
  await service.from('catalog_version_ingredients').delete().eq('catalog_version_id', versionId)
  await service.from('ingredients').delete().eq('id', ingredientId)
  await service.from('catalog_versions').delete().eq('id', versionId)
})

describe('Phase 2C.1 player Ingredient hint contract', () => {
  it('authorized Drink It! player receives safe current hint via RPC', async () => {
    const player = await signInAs(fixtures, 'drink_only')
    const { data, error } = await player.rpc('get_my_ingredient_bounty_hint')
    expect(error).toBeNull()
    expect(data).toMatchObject({
      ingredient_key: 'hint-orgeat',
      display_name: 'Orgeat',
      points: 75,
      known_bar_count: 5,
    })
    expect(JSON.stringify(data)).not.toMatch(/wake-view|secret-bar|qualifying/i)
    expect(data).not.toHaveProperty('ingredient_id')
  })

  it('authorized player can select only current public card, not scheduled futures', async () => {
    const player = await signInAs(fixtures, 'drink_only')
    const { data, error } = await player
      .from('ingredient_bounty_public_cards')
      .select('ingredient_canonical_key, exposure_status, known_bar_count')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({
      ingredient_canonical_key: 'hint-orgeat',
      exposure_status: 'current',
    })
    expect(data!.some((r) => r.exposure_status === 'scheduled')).toBe(false)
    expect(data!.some((r) => r.ingredient_canonical_key === 'hint-future-syrup')).toBe(false)
  })

  it('does not expose private qualifying metadata via ingredient_candidates', async () => {
    const player = await signInAs(fixtures, 'drink_only')
    const { data } = await player.from('ingredient_candidates').select('*')
    expect(data ?? []).toEqual([])
  })

  it('Ship It!-only player is denied the hint RPC and public cards', async () => {
    const ship = await signInAs(fixtures, 'ship_only')
    const rpc = await ship.rpc('get_my_ingredient_bounty_hint')
    expect(rpc.error).toBeTruthy()
    expect(rpc.error?.message ?? '').toMatch(/DRINKIT_REQUIRED|42501|permission/i)

    const { data: cards } = await ship.from('ingredient_bounty_public_cards').select('*')
    expect(cards ?? []).toEqual([])
  })

  it('unauthenticated client cannot read hint RPC', async () => {
    const anon = createLocalClient(fixtures.summary!.supabase_url, fixtures.anonKey!)
    const { error } = await anon.rpc('get_my_ingredient_bounty_hint')
    expect(error).toBeTruthy()
  })

  it('admin still sees candidates; player never sees scheduled card ids', async () => {
    const admin = await signInAs(fixtures, 'admin')
    const { data: candidates } = await admin
      .from('ingredient_candidates')
      .select('notes')
      .eq('catalog_version_id', versionId)
    expect(candidates?.length).toBe(1)
    expect(candidates![0]!.notes).toMatch(/PRIVATE/)

    const player = await signInAs(fixtures, 'both')
    const { data: cards } = await player.from('ingredient_bounty_public_cards').select('id')
    expect(cards?.map((c) => c.id)).toEqual([currentCardId])
    expect(cards?.map((c) => c.id)).not.toContain(scheduledCardId)
  })
})
