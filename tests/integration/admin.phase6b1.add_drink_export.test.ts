/**
 * Phase 6B1 — Admin Add Drink + Export Current Game Data.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  activateReadyCatalogAndSchedule,
  DEV_BASE_OFFSET_MIN,
  loadBountyFixtures,
} from '../helpers/bountyFixtures'
import { signInAs } from '../helpers/localSupabase'
import type { ClockFixtures } from '../helpers/clockFixtures'

let fixtures: ClockFixtures

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
})

beforeEach(async () => {
  await fixtures.service!.rpc('dev_reset_scavenger_test_data')
  await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(fixtures.service!, `6b1-${randomUUID().slice(0, 8)}`)
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

describe('Phase 6B1 Admin Add Drink + Export', () => {
  it('player denied; admin can add drink at bars; second bar keeps offering identity; not cocktail candidate', async () => {
    const player = await signInAs(local(), 'drink_only')
    const denied = await player.rpc('admin_add_drink', {
      p_client_request_id: randomUUID(),
      p_display_name: 'Denied Drink',
      p_bar_canonical_keys: ['wake-view'],
      p_ingredient_canonical_keys: [],
      p_kind: 'named_cocktail',
    })
    expect(denied.error).toBeTruthy()

    const exportDenied = await player.rpc('admin_export_current_game_data')
    expect(exportDenied.error).toBeTruthy()

    const admin = await signInAs(local(), 'admin')
    const { data: bars } = await fixtures.service!.from('bars').select('canonical_key').limit(5)
    const barKeys = (bars ?? []).map((b) => b.canonical_key as string).slice(0, 2)
    expect(barKeys.length).toBe(2)

    const { data: ings } = await fixtures.service!
      .from('ingredients')
      .select('canonical_key')
      .limit(2)
    const ingKeys = (ings ?? []).map((i) => i.canonical_key as string)

    const requestId = randomUUID()
    const name = `Admin Add ${randomUUID().slice(0, 6)}`
    const added = await admin.rpc('admin_add_drink', {
      p_client_request_id: requestId,
      p_display_name: name,
      p_bar_canonical_keys: [barKeys[0]],
      p_ingredient_canonical_keys: ingKeys,
      p_kind: 'named_cocktail',
    })
    expect(added.error).toBeNull()
    expect(added.data.ok).toBe(true)
    expect(added.data.enters_cocktail_rotation).toBe(false)
    const offeringA = added.data.offerings[0].offering_id as string

    const replay = await admin.rpc('admin_add_drink', {
      p_client_request_id: requestId,
      p_display_name: name,
      p_bar_canonical_keys: [barKeys[0]],
      p_ingredient_canonical_keys: ingKeys,
      p_kind: 'named_cocktail',
    })
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.offerings[0].offering_id).toBe(offeringA)

    const secondBar = await admin.rpc('admin_add_drink', {
      p_client_request_id: randomUUID(),
      p_display_name: name,
      p_bar_canonical_keys: [barKeys[1]],
      p_ingredient_canonical_keys: ingKeys,
      p_kind: 'named_cocktail',
    })
    expect(secondBar.data.ok).toBe(true)
    const offeringB = secondBar.data.offerings[0].offering_id as string
    expect(offeringB).not.toBe(offeringA)
    expect(secondBar.data.drink_concept_id).toBe(added.data.drink_concept_id)

    // Picker visibility
    const drinkPlayer = await signInAs(local(), 'drink_only')
    const picker = await drinkPlayer.rpc('list_drinkit_bar_drinks', {
      p_bar_canonical_key: barKeys[0],
    })
    expect(picker.error).toBeNull()
    expect(picker.data.some((d: { offering_id: string }) => d.offering_id === offeringA)).toBe(true)

    // Not in cocktail candidates
    const { count } = await fixtures.service!
      .from('cocktail_candidates')
      .select('offering_id', { count: 'exact', head: true })
      .eq('offering_id', offeringA)
    expect(count ?? 0).toBe(0)

    // Ingredient eligibility helper sees catalog ingredients on manual offering
    const catalogId = (
      await fixtures.service!.from('active_catalog_pointer').select('catalog_version_id').single()
    ).data!.catalog_version_id
    const { data: ingRow } = await fixtures.service!
      .from('ingredients')
      .select('id')
      .eq('canonical_key', ingKeys[0])
      .single()
    const has = await fixtures.service!.rpc('drinkit_offering_has_ingredient', {
      p_catalog_version_id: catalogId,
      p_offering_id: offeringA,
      p_ingredient_id: ingRow!.id,
      p_confirm_ingredient_id: null,
    })
    expect(has.data).toBe(true)
  })

  it('deactivate removes from future picker only; export has no secrets/roster/photos', async () => {
    const admin = await signInAs(local(), 'admin')
    const { data: bar } = await fixtures.service!.from('bars').select('canonical_key').limit(1).single()
    const name = `Temp Add ${randomUUID().slice(0, 6)}`
    const added = await admin.rpc('admin_add_drink', {
      p_client_request_id: randomUUID(),
      p_display_name: name,
      p_bar_canonical_keys: [bar!.canonical_key],
      p_ingredient_canonical_keys: [],
      p_kind: 'named_cocktail',
    })
    expect(added.data.ok).toBe(true)
    const offeringId = added.data.offerings[0].offering_id as string

    const deact = await admin.rpc('admin_deactivate_manual_offering', {
      p_offering_id: offeringId,
      p_note: 'mistake',
    })
    expect(deact.data.ok).toBe(true)

    const drinkPlayer = await signInAs(local(), 'drink_only')
    const picker = await drinkPlayer.rpc('list_drinkit_bar_drinks', {
      p_bar_canonical_key: bar!.canonical_key,
    })
    expect(picker.data.some((d: { offering_id: string }) => d.offering_id === offeringId)).toBe(
      false,
    )

    // Offering identity row remains
    const { data: bo } = await fixtures.service!
      .from('bar_offerings')
      .select('id')
      .eq('id', offeringId)
      .maybeSingle()
    expect(bo?.id).toBe(offeringId)

    const exported = await admin.rpc('admin_export_current_game_data')
    expect(exported.error).toBeNull()
    expect(exported.data.ok).toBe(true)
    expect(exported.data.export_schema_version).toBe('1.0')
    expect(exported.data.catalog?.catalog_id).toBeTruthy()
    expect(Array.isArray(exported.data.offerings)).toBe(true)
    expect(Array.isArray(exported.data.cocktail_candidates)).toBe(true)
    expect(exported.data.exposure).toBeTruthy()
    expect(exported.data.schedule).toBeTruthy()

    const blob = JSON.stringify(exported.data).toLowerCase()
    expect(blob).not.toMatch(/"password"\s*:/)
    expect(blob).not.toContain('service_role')
    expect(blob).not.toContain('auth_user_id')
    expect(blob).not.toContain('organizer@star-princess.local')
    expect(blob).not.toContain('demo drink only')
    expect(blob).not.toContain('storage/v1/object')
    expect(exported.data).not.toHaveProperty('players')
    expect(exported.data).not.toHaveProperty('roster')
    expect(exported.data).not.toHaveProperty('photos')
    expect(exported.data).not.toHaveProperty('gallery')
  })

  it('concurrent conflicting add-drink request ids fail safely; invalid bars rejected', async () => {
    const admin = await signInAs(local(), 'admin')
    const { data: bar } = await fixtures.service!.from('bars').select('canonical_key').limit(1).single()
    const requestId = randomUUID()
    const [a, b] = await Promise.all([
      admin.rpc('admin_add_drink', {
        p_client_request_id: requestId,
        p_display_name: 'Concurrent A',
        p_bar_canonical_keys: [bar!.canonical_key],
        p_ingredient_canonical_keys: [],
        p_kind: 'named_cocktail',
      }),
      admin.rpc('admin_add_drink', {
        p_client_request_id: requestId,
        p_display_name: 'Concurrent B',
        p_bar_canonical_keys: [bar!.canonical_key],
        p_ingredient_canonical_keys: [],
        p_kind: 'named_cocktail',
      }),
    ])
    const outcomes = [a.data, b.data]
    const mismatch = outcomes.some((o) => o?.code === 'REQUEST_ID_OPERATION_MISMATCH')
    const oks = outcomes.filter((o) => o?.ok === true)
    expect(oks.length + (mismatch ? 1 : 0)).toBeGreaterThanOrEqual(1)
    expect(oks.length).toBeLessThanOrEqual(1)

    const bad = await admin.rpc('admin_add_drink', {
      p_client_request_id: randomUUID(),
      p_display_name: 'Bad Bar Drink',
      p_bar_canonical_keys: ['not-a-real-bar'],
      p_ingredient_canonical_keys: [],
      p_kind: 'named_cocktail',
    })
    expect(bad.data.ok).toBe(false)
    expect(bad.data.code).toBe('BAR_NOT_FOUND')
  })
})
