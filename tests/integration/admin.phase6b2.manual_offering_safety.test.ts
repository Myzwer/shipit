/**
 * Phase 6B2 Gate 1 — base offering preservation for Admin Add Drink.
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
  await activateReadyCatalogAndSchedule(fixtures.service!, `6b2-gate-${randomUUID().slice(0, 8)}`)
})

async function activeCatalogId(): Promise<string> {
  const { data } = await fixtures.service!
    .from('active_catalog_pointer')
    .select('catalog_version_id')
    .eq('id', 1)
    .single()
  return data!.catalog_version_id as string
}

function local() {
  return {
    available: true as const,
    password: fixtures.password!,
    summary: fixtures.summary!,
    anonKey: fixtures.anonKey!,
    serviceRoleKey: fixtures.serviceRoleKey!,
  }
}

async function loadBaseCandidate() {
  const catalogId = await activeCatalogId()
  const { data: candidate } = await fixtures.service!
    .from('cocktail_candidates')
    .select('offering_id')
    .eq('catalog_version_id', catalogId)
    .eq('eligible', true)
    .limit(1)
    .single()
  const offeringId = candidate!.offering_id as string
  const { data: offering } = await fixtures.service!
    .from('bar_offerings')
    .select('id, bar_id, drink_concept_id')
    .eq('id', offeringId)
    .single()
  const { data: bar } = await fixtures.service!
    .from('bars')
    .select('canonical_key')
    .eq('id', offering!.bar_id)
    .single()
  const { data: concept } = await fixtures.service!
    .from('drink_concepts')
    .select('canonical_key')
    .eq('id', offering!.drink_concept_id)
    .single()
  const { data: cvd } = await fixtures.service!
    .from('catalog_version_drink_concepts')
    .select('display_name, kind')
    .eq('catalog_version_id', catalogId)
    .eq('drink_concept_id', offering!.drink_concept_id)
    .single()
  return {
    catalogId,
    offeringId,
    barId: offering!.bar_id as string,
    conceptId: offering!.drink_concept_id as string,
    barKey: bar!.canonical_key as string,
    drinkKey: concept!.canonical_key as string,
    displayName: cvd!.display_name as string,
    kind: cvd!.kind as string,
  }
}

describe('Phase 6B2 Gate — manual offering safety', () => {
  it('same-bar add against a base offering rejects without registering a removable manual', async () => {
    const admin = await signInAs(local(), 'admin')
    const base = await loadBaseCandidate()

    const attempt = await admin.rpc('admin_add_drink', {
      p_client_request_id: randomUUID(),
      p_display_name: base.drinkKey,
      p_bar_canonical_keys: [base.barKey],
      p_ingredient_canonical_keys: [],
      p_kind: 'named_cocktail',
    })
    expect(attempt.error).toBeNull()
    expect(attempt.data.ok).toBe(false)
    expect(attempt.data.code).toBe('BASE_OFFERING_EXISTS')

    const { count: manualCount } = await fixtures.service!
      .from('admin_manual_offerings')
      .select('id', { count: 'exact', head: true })
      .eq('offering_id', base.offeringId)
    expect(manualCount ?? 0).toBe(0)

    const renameAttempt = await admin.rpc('admin_add_drink', {
      p_client_request_id: randomUUID(),
      p_display_name: `${base.displayName} Renamed`,
      p_bar_canonical_keys: [base.barKey],
      p_ingredient_canonical_keys: [],
      p_kind: 'named_cocktail',
    })
    expect(renameAttempt.error).toBeNull()

    const { data: cvdAfter } = await fixtures.service!
      .from('catalog_version_drink_concepts')
      .select('display_name, kind')
      .eq('catalog_version_id', base.catalogId)
      .eq('drink_concept_id', base.conceptId)
      .single()
    expect(cvdAfter!.display_name).toBe(base.displayName)
    expect(cvdAfter!.kind).toBe(base.kind)

    const { data: cvo } = await fixtures.service!
      .from('catalog_version_offerings')
      .select('offering_id')
      .eq('catalog_version_id', base.catalogId)
      .eq('offering_id', base.offeringId)
      .maybeSingle()
    expect(cvo?.offering_id).toBe(base.offeringId)

    const { count: candidates } = await fixtures.service!
      .from('cocktail_candidates')
      .select('offering_id', { count: 'exact', head: true })
      .eq('catalog_version_id', base.catalogId)
      .eq('offering_id', base.offeringId)
    expect(candidates ?? 0).toBeGreaterThan(0)
  })

  it('new-bar add reuses concept without mutating base name/kind; deactivate removes only introduced version row', async () => {
    const admin = await signInAs(local(), 'admin')
    const base = await loadBaseCandidate()

    const { data: otherBar } = await fixtures.service!
      .from('catalog_version_bars')
      .select('bar_id')
      .eq('catalog_version_id', base.catalogId)
      .eq('active', true)
      .neq('bar_id', base.barId)
      .limit(1)
      .single()
    const { data: otherBarRow } = await fixtures.service!
      .from('bars')
      .select('canonical_key')
      .eq('id', otherBar!.bar_id)
      .single()
    const otherBarKey = otherBarRow!.canonical_key as string

    const { data: existingOther } = await fixtures.service!
      .from('bar_offerings')
      .select('id')
      .eq('bar_id', otherBar!.bar_id)
      .eq('drink_concept_id', base.conceptId)
      .maybeSingle()
    if (existingOther?.id) {
      await fixtures.service!
        .from('catalog_version_offerings')
        .delete()
        .eq('catalog_version_id', base.catalogId)
        .eq('offering_id', existingOther.id)
      await fixtures.service!.from('admin_manual_offerings').delete().eq('offering_id', existingOther.id)
      await fixtures.service!.from('bar_offerings').delete().eq('id', existingOther.id)
    }

    const added = await admin.rpc('admin_add_drink', {
      p_client_request_id: randomUUID(),
      // Use the canonical key as the name so normalization reuses the base concept.
      p_display_name: base.drinkKey,
      p_bar_canonical_keys: [otherBarKey],
      p_ingredient_canonical_keys: [],
      p_kind: 'named_cocktail',
    })
    expect(added.error).toBeNull()
    expect(added.data.ok).toBe(true)
    expect(added.data.drink_concept_id).toBe(base.conceptId)
    const newOfferingId = added.data.offerings[0].offering_id as string
    expect(newOfferingId).not.toBe(base.offeringId)
    expect(added.data.offerings[0].introduced_version_offering).toBe(true)

    const { data: cvdAfter } = await fixtures.service!
      .from('catalog_version_drink_concepts')
      .select('display_name, kind')
      .eq('catalog_version_id', base.catalogId)
      .eq('drink_concept_id', base.conceptId)
      .single()
    expect(cvdAfter!.display_name).toBe(base.displayName)
    expect(cvdAfter!.kind).toBe(base.kind)

    const deact = await admin.rpc('admin_deactivate_manual_offering', {
      p_offering_id: newOfferingId,
      p_note: 'gate test',
    })
    expect(deact.data.ok).toBe(true)
    expect(deact.data.removed_version_offering).toBe(true)

    const { data: newCvo } = await fixtures.service!
      .from('catalog_version_offerings')
      .select('offering_id')
      .eq('catalog_version_id', base.catalogId)
      .eq('offering_id', newOfferingId)
      .maybeSingle()
    expect(newCvo).toBeNull()

    const { data: baseCvo } = await fixtures.service!
      .from('catalog_version_offerings')
      .select('offering_id')
      .eq('catalog_version_id', base.catalogId)
      .eq('offering_id', base.offeringId)
      .maybeSingle()
    expect(baseCvo?.offering_id).toBe(base.offeringId)

    const { count: candidates } = await fixtures.service!
      .from('cocktail_candidates')
      .select('offering_id', { count: 'exact', head: true })
      .eq('catalog_version_id', base.catalogId)
      .eq('offering_id', base.offeringId)
    expect(candidates ?? 0).toBeGreaterThan(0)

    const reactivate = await admin.rpc('admin_add_drink', {
      p_client_request_id: randomUUID(),
      p_display_name: base.drinkKey,
      p_bar_canonical_keys: [otherBarKey],
      p_ingredient_canonical_keys: [],
      p_kind: 'named_cocktail',
    })
    expect(reactivate.data.ok).toBe(false)
    expect(reactivate.data.code).toBe('MANUAL_OFFERING_INACTIVE')
  })

  it('conflicting kind against existing catalog drink is rejected', async () => {
    const admin = await signInAs(local(), 'admin')
    const base = await loadBaseCandidate()
    const { data: bar } = await fixtures.service!.from('bars').select('canonical_key').limit(1).single()

    const bad = await admin.rpc('admin_add_drink', {
      p_client_request_id: randomUUID(),
      p_display_name: base.drinkKey,
      p_bar_canonical_keys: [bar!.canonical_key],
      p_ingredient_canonical_keys: [],
      p_kind: 'beer',
    })
    expect(bad.data.ok).toBe(false)
    expect(bad.data.code).toBe('DRINK_KIND_CONFLICT')
  })
})
