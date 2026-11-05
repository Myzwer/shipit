/**
 * Phase 2C — catalog schema RLS, read-only preview, cross-game access.
 * Requires local Supabase + provisioned identities (must not silently skip).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createLocalClient,
  loadLocalFixtures,
  signInAs,
  type LocalFixtures,
} from '../helpers/localSupabase'
import { baseCatalogSkeleton, buildScheduleReadyCatalog } from '../fixtures/catalog/builders'
import { previewCatalogImport } from '@/lib/catalog'

let fixtures: LocalFixtures
let service: ReturnType<typeof createLocalClient>

beforeAll(async () => {
  fixtures = await loadLocalFixtures()
  if (!fixtures.available || !fixtures.summary || !fixtures.anonKey || !fixtures.serviceRoleKey) {
    throw new Error(
      'Phase 2C catalog integration requires local Supabase + provisioned identities (LOCAL_TEST_PASSWORD).',
    )
  }
  service = createLocalClient(fixtures.summary.supabase_url, fixtures.serviceRoleKey)
})

describe('Phase 2C catalog foundation', () => {
  it('read-only admin preview makes no catalog_versions mutations', async () => {
    const admin = await signInAs(fixtures, 'admin')

    const { count: before } = await service
      .from('catalog_versions')
      .select('*', { count: 'exact', head: true })

    const payload = baseCatalogSkeleton()
    const { data, error } = await admin.rpc('admin_preview_catalog_import', {
      p_payload: payload,
    })
    expect(error).toBeNull()
    expect(data.read_only).toBe(true)
    expect(data.mutated_database).toBe(false)
    expect(data.safe_to_publish).toBe(false)
    expect(data.catalog_versions_before).toBe(data.catalog_versions_after)

    const { count: after } = await service
      .from('catalog_versions')
      .select('*', { count: 'exact', head: true })
    expect(after).toBe(before)

    expect(previewCatalogImport(payload).mutatedDatabase).toBe(false)
  })

  it('non-admin cannot run catalog preview', async () => {
    const player = await signInAs(fixtures, 'drink_only')
    const preview = await player.rpc('admin_preview_catalog_import', {
      p_payload: baseCatalogSkeleton(),
    })
    expect(preview.error).toBeTruthy()
    expect(preview.error?.message ?? '').toMatch(/ADMIN_REQUIRED/i)
  })

  it('admin publish stub refuses mutation (not implemented)', async () => {
    const admin = await signInAs(fixtures, 'admin')
    const { count: before } = await service
      .from('catalog_versions')
      .select('*', { count: 'exact', head: true })

    const { error } = await admin.rpc('admin_publish_catalog_import', {
      p_payload: buildScheduleReadyCatalog(72, 39),
    })
    expect(error).toBeTruthy()
    expect(error?.message ?? '').toMatch(/CATALOG_PUBLISH_NOT_IMPLEMENTED/)

    const { count: after } = await service
      .from('catalog_versions')
      .select('*', { count: 'exact', head: true })
    expect(after).toBe(before)
  })

  it('non-admin cannot insert catalog rows (RLS)', async () => {
    const player = await signInAs(fixtures, 'both')
    const { error } = await player.from('bars').insert({
      canonical_key: 'hacker-bar',
    })
    expect(error).toBeTruthy()
  })

  it('Ship It!-only player cannot read Drink It! catalog bars', async () => {
    const shipOnly = await signInAs(fixtures, 'ship_only')
    const { data: bars } = await shipOnly.from('bars').select('id')
    expect(bars ?? []).toEqual([])
  })

  it('ingredient_candidates stay hidden from non-admin Drink It! players', async () => {
    const { data: version, error: vErr } = await service
      .from('catalog_versions')
      .insert({
        catalog_id: 'dev-rls-probe-v1',
        schema_version: '1.0',
        mode: 'full_snapshot',
        payload_hash: 'probe',
        manifest_json: { probe: true },
        status: 'draft',
        source_notes: {},
      })
      .select('id')
      .single()
    expect(vErr).toBeNull()

    const { data: ingredient, error: iErr } = await service
      .from('ingredients')
      .insert({ canonical_key: 'rls-probe-ingredient' })
      .select('id')
      .single()
    expect(iErr).toBeNull()

    await service.from('catalog_version_ingredients').insert({
      catalog_version_id: version!.id,
      ingredient_id: ingredient!.id,
      display_name: 'RLS Probe',
    })

    await service.from('ingredient_candidates').insert({
      catalog_version_id: version!.id,
      ingredient_id: ingredient!.id,
      known_bar_count: 5,
      distinct_qualifying_drinks: 3,
      tier: 'hard_to_find',
      points: 75,
      eligible: true,
    })

    const player = await signInAs(fixtures, 'drink_only')
    const { data: hidden } = await player.from('ingredient_candidates').select('*')
    expect(hidden ?? []).toEqual([])

    const admin = await signInAs(fixtures, 'admin')
    const { data: visible, error } = await admin
      .from('ingredient_candidates')
      .select('ingredient_id')
      .eq('catalog_version_id', version!.id)
    expect(error).toBeNull()
    expect(visible?.length).toBe(1)

    await service.from('ingredient_candidates').delete().eq('catalog_version_id', version!.id)
    await service.from('catalog_version_ingredients').delete().eq('catalog_version_id', version!.id)
    await service.from('ingredients').delete().eq('id', ingredient!.id)
    await service.from('catalog_versions').delete().eq('id', version!.id)
  })

  it('stable offering identities differ per bar for the same drink concept', async () => {
    const { data: barA } = await service
      .from('bars')
      .insert({ canonical_key: 'offering-bar-a' })
      .select('id')
      .single()
    const { data: barB } = await service
      .from('bars')
      .insert({ canonical_key: 'offering-bar-b' })
      .select('id')
      .single()
    const { data: drink } = await service
      .from('drink_concepts')
      .insert({ canonical_key: 'shared-mai-tai' })
      .select('id')
      .single()

    const { data: offA } = await service
      .from('bar_offerings')
      .insert({ bar_id: barA!.id, drink_concept_id: drink!.id })
      .select('id')
      .single()
    const { data: offB } = await service
      .from('bar_offerings')
      .insert({ bar_id: barB!.id, drink_concept_id: drink!.id })
      .select('id')
      .single()

    expect(offA!.id).not.toBe(offB!.id)

    const dup = await service.from('bar_offerings').insert({
      bar_id: barA!.id,
      drink_concept_id: drink!.id,
    })
    expect(dup.error).toBeTruthy()

    await service.from('bar_offerings').delete().in('id', [offA!.id, offB!.id])
    await service.from('drink_concepts').delete().eq('id', drink!.id)
    await service.from('bars').delete().in('id', [barA!.id, barB!.id])
  })
})
