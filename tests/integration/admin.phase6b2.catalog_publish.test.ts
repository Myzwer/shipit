/**
 * Phase 6B2 — catalog stage / preview / publish / rollback.
 * Requires local Supabase + provisioned identities (must not silently skip).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  activateCatalogWithSkipReserves,
  DEV_BASE_OFFSET_MIN,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
} from '../helpers/bountyFixtures'
import { buildVariantCatalog, uniqueCatalogId } from '../helpers/catalogPublish'
import { exposeCurrentSlots, playerId } from '../helpers/drinkitSubmit'
import { signInAs } from '../helpers/localSupabase'
import type { ClockFixtures } from '../helpers/clockFixtures'
import { buildStageValidation, isReadyToStage, previewCatalogImport } from '@/lib/catalog'
import type { CatalogImportDocument } from '@/lib/catalog/types'
import { canonicalJsonbText, hashPayload } from '@/lib/adminCatalogImport'

let fixtures: ClockFixtures
let admin: SupabaseClient
const cleanupCorrections: string[] = []

/** Reset to the dev fixture catalog + schedule, then drop versions this suite published. */
async function resetToFixtureCatalog() {
  const s = fixtures.service!
  await s.rpc('dev_reset_scavenger_test_data')
  await s.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  await s.rpc('dev_set_drinkit_paused', { p_paused: false })
  // The dev fixture reuses one catalog version row, so manual overlays from earlier runs
  // would otherwise be carried into every publish. Start each test clean.
  await s.from('admin_manual_offering_ingredients').delete().not('offering_id', 'is', null)
  await s.from('admin_manual_offerings').delete().not('id', 'is', null)
  await s.from('admin_add_drink_requests').delete().not('client_request_id', 'is', null)
  // 80 / 45 leaves unused reserves so mid-cruise rebinding has headroom.
  await activateCatalogWithSkipReserves(s, `6b2-pub-${randomUUID().slice(0, 8)}`)

  // Re-activation clears slots/offers/exposures, so published versions are unreferenced now.
  const { data: notes } = await s
    .from('catalog_source_notes')
    .select('catalog_version_id')
    .in('note_type', ['publish', 'rollback'])
  const ids = [...new Set((notes ?? []).map((n) => n.catalog_version_id as string))]
  await s.from('catalog_import_candidates').delete().not('id', 'is', null)
  await s.from('admin_catalog_publish_requests').delete().not('client_request_id', 'is', null)
  if (ids.length) {
    const { error } = await s.from('catalog_versions').delete().in('id', ids)
    if (error) throw error
  }
}

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
  admin = fixtures.admin!
})

beforeEach(resetToFixtureCatalog)

afterAll(async () => {
  // Leave the DB on the fixture catalog so later suites see a single-version world.
  await resetToFixtureCatalog()
})

afterEach(async () => {
  const svc = fixtures.service!
  await svc.from('game_control').update({ finalized_at_utc: null }).eq('game', 'drinkit')
  if (cleanupCorrections.length) {
    await svc.from('ingredient_corrections').delete().in('id', cleanupCorrections)
    cleanupCorrections.length = 0
  }
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

const svc = () => fixtures.service!

async function activeVersionId(): Promise<string> {
  const { data } = await svc().from('active_catalog_pointer').select('catalog_version_id').eq('id', 1).single()
  return data!.catalog_version_id as string
}

async function versionCount(): Promise<number> {
  const { count } = await svc().from('catalog_versions').select('*', { count: 'exact', head: true })
  return count ?? 0
}

async function candidateCount(): Promise<number> {
  const { count } = await svc().from('catalog_import_candidates').select('*', { count: 'exact', head: true })
  return count ?? 0
}

async function stage(doc: CatalogImportDocument, requestId: string = randomUUID()) {
  const preview = previewCatalogImport(doc)
  expect(isReadyToStage(preview)).toBe(true)
  const hash = await hashPayload(doc)
  const { data, error } = await admin.rpc('admin_stage_catalog_import', {
    p_client_request_id: requestId,
    p_payload: doc,
    p_validation: buildStageValidation(preview, hash),
  })
  expect(error).toBeNull()
  expect(data.ok, JSON.stringify(data)).toBe(true)
  // Client and server hash agree (server rejects PAYLOAD_HASH_MISMATCH otherwise).
  expect(data.payload_hash).toBe(hash)
  return { doc, hash, candidateId: data.candidate_id as string, result: data }
}

async function publish(
  candidateId: string,
  hash: string,
  opts: { requestId?: string; expectedActive?: string | null } = {},
) {
  const expectedActive = opts.expectedActive === undefined ? await activeVersionId() : opts.expectedActive
  return admin.rpc('admin_publish_catalog_import', {
    p_client_request_id: opts.requestId ?? randomUUID(),
    p_candidate_id: candidateId,
    p_expected_active_catalog_version_id: expectedActive,
    p_expected_payload_hash: hash,
  })
}

/** Slots (+ active offer) for a category, ordered by day/index. */
async function slotsWithOffers(category: 'cocktail' | 'ingredient') {
  const { data: slots } = await svc()
    .from('bounty_slots')
    .select('id, state, catalog_version_id, current_offer_id, cruise_day, slot_index, category')
    .eq('category', category)
    .order('cruise_day')
    .order('slot_index')
  const ids = (slots ?? []).map((s) => s.current_offer_id as string)
  const { data: offers } = await svc()
    .from('bounty_slot_offers')
    .select('id, catalog_version_id, canonical_key, is_active, exposed_at_utc')
    .in('id', ids)
  const byId = new Map((offers ?? []).map((o) => [o.id as string, o]))
  return (slots ?? []).map((s) => ({ slot: s, offer: byId.get(s.current_offer_id as string)! }))
}

async function exposureKeys(category: 'cocktail' | 'ingredient'): Promise<string[]> {
  const { data } = await svc()
    .from('bounty_objective_exposures')
    .select('canonical_key')
    .eq('category', category)
  return (data ?? []).map((r) => r.canonical_key as string)
}

async function activeOfferCount(): Promise<number> {
  const { count } = await svc()
    .from('bounty_slot_offers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  return count ?? 0
}

function barKeyFor(doc: CatalogImportDocument, drinkKey: string): string {
  return doc.cocktail_candidates.find((c) => c.drink_key === drinkKey)!.designated_bar_key
}

describe('Phase 6B2 catalog publish — staging', () => {
  it('rejects invalid schema / mode / catalog_id / references / readiness / hash', async () => {
    const doc = buildVariantCatalog()
    const preview = previewCatalogImport(doc)
    const hash = await hashPayload(doc)
    const validation = buildStageValidation(preview, hash)
    const before = await candidateCount()

    const attempt = async (payload: unknown, v: Record<string, unknown> = validation as never) => {
      const { data, error } = await admin.rpc('admin_stage_catalog_import', {
        p_client_request_id: randomUUID(),
        p_payload: payload,
        p_validation: v,
      })
      expect(error).toBeNull()
      return data
    }

    expect((await attempt({ ...doc, schema_version: '2.0' })).code).toBe('SCHEMA_VERSION')
    expect((await attempt({ ...doc, mode: 'delta' })).code).toBe('MODE')
    expect((await attempt({ ...doc, catalog_id: 'Bad ID!' })).code).toBe('CATALOG_ID_INVALID')
    expect((await attempt({ ...doc, base_catalog_id: doc.catalog_id })).code).toBe('BASE_CATALOG_SELF')

    const dangling = {
      ...doc,
      cocktail_candidates: [
        ...doc.cocktail_candidates,
        { drink_key: 'no-such-drink', designated_bar_key: 'wake-view', tier: 'familiar', points: 25 },
      ],
    }
    const refs = await attempt(dangling)
    expect(refs.code).toBe('PAYLOAD_REFERENCE_ERROR')
    expect(JSON.stringify(refs.errors)).toContain('COCKTAIL_CANDIDATE_NO_OFFERING')

    expect((await attempt(doc, { ...validation, readiness: 'valid_not_ready' })).code).toBe(
      'VALIDATION_NOT_READY',
    )
    expect((await attempt(doc, { ...validation, error_count: 2 })).code).toBe('VALIDATION_ERRORS')
    const badHash = await attempt(doc, { ...validation, payload_hash: 'deadbeef' })
    expect(badHash.code).toBe('PAYLOAD_HASH_MISMATCH')
    expect(badHash.server_payload_hash).toBe(hash)

    expect(await candidateCount()).toBe(before)
  })

  it('rejects an under-sized pool server-side even when the client claims ready', async () => {
    const short = buildVariantCatalog({ cocktailCount: 70, ingredientCount: 45 })
    const tsPreview = previewCatalogImport(short)
    expect(isReadyToStage(tsPreview)).toBe(false)
    expect(tsPreview.shortages.cocktailShortage).toBe(2)

    const forged = {
      ...buildStageValidation(tsPreview, await hashPayload(short)),
      readiness: 'ready_for_scheduling',
      error_count: 0,
    }
    const { data, error } = await admin.rpc('admin_stage_catalog_import', {
      p_client_request_id: randomUUID(),
      p_payload: short,
      p_validation: forged,
    })
    expect(error).toBeNull()
    expect(data.ok).toBe(false)
    expect(data.code).toBe('POOL_SHORTAGE')
    expect(data.cocktail_eligible).toBe(70)

    const shortIng = buildVariantCatalog({ cocktailCount: 80, ingredientCount: 38 })
    const r2 = await admin.rpc('admin_stage_catalog_import', {
      p_client_request_id: randomUUID(),
      p_payload: shortIng,
      p_validation: {
        ...buildStageValidation(previewCatalogImport(shortIng)),
        readiness: 'ready_for_scheduling',
        error_count: 0,
      },
    })
    expect(r2.data.code).toBe('POOL_SHORTAGE')
    expect(r2.data.ingredient_eligible).toBe(38)
  })

  it('stage is idempotent per request id and rejects a different payload on the same id', async () => {
    const doc = buildVariantCatalog()
    const requestId = randomUUID()
    const first = await stage(doc, requestId)
    const hash = first.hash
    const again = await admin.rpc('admin_stage_catalog_import', {
      p_client_request_id: requestId,
      p_payload: doc,
      p_validation: buildStageValidation(previewCatalogImport(doc), hash),
    })
    expect(again.data.ok).toBe(true)
    expect(again.data.idempotent_replay).toBe(true)
    expect(again.data.candidate_id).toBe(first.candidateId)

    const other = buildVariantCatalog()
    const mismatch = await admin.rpc('admin_stage_catalog_import', {
      p_client_request_id: requestId,
      p_payload: other,
      p_validation: buildStageValidation(previewCatalogImport(other), await hashPayload(other)),
    })
    expect(mismatch.data.ok).toBe(false)
    expect(mismatch.data.code).toBe('REQUEST_ID_OPERATION_MISMATCH')
  })

  it('re-staging the same catalog_id abandons the earlier staged candidate', async () => {
    const catalogId = uniqueCatalogId()
    const a = await stage(buildVariantCatalog({ catalogId }))
    const dropKey = 'fixture-cocktail-080'
    const b = await stage(
      buildVariantCatalog({
        catalogId,
        dropOffering: { drinkKey: dropKey, barKey: barKeyFor(buildVariantCatalog(), dropKey) },
      }),
    )
    const { data: rows } = await svc()
      .from('catalog_import_candidates')
      .select('id, status')
      .in('id', [a.candidateId, b.candidateId])
    const status = Object.fromEntries((rows ?? []).map((r) => [r.id, r.status]))
    expect(status[a.candidateId]).toBe('abandoned')
    expect(status[b.candidateId]).toBe('staged')
  })

  it('canonicalJsonbText matches server jsonb::text for the staged payload hash', async () => {
    const doc = buildVariantCatalog()
    const { hash } = await stage(doc)
    const { data } = await svc().from('catalog_import_candidates').select('payload_hash').eq('payload_hash', hash).limit(1)
    expect(data?.length).toBe(1)
    // Key ordering is (length, bytes): a 1-char key precedes a longer one.
    expect(canonicalJsonbText({ bb: 1, a: [1, 2], ccc: { z: null, y: 'q' } })).toBe(
      '{"a": [1, 2], "bb": 1, "ccc": {"y": "q", "z": null}}',
    )
  })
})

describe('Phase 6B2 catalog publish — preview', () => {
  it('preview is read-only: no versions, offers, pointer, or candidates change', async () => {
    const { candidateId } = await stage(buildVariantCatalog())
    const versionsBefore = await versionCount()
    const activeBefore = await activeVersionId()
    const offersBefore = await activeOfferCount()
    const candidatesBefore = await candidateCount()

    const { data, error } = await admin.rpc('admin_preview_catalog_publish', { p_candidate_id: candidateId })
    expect(error).toBeNull()
    expect(data.ok).toBe(true)
    expect(data.read_only).toBe(true)
    expect(data.mutated_database).toBe(false)
    expect(data.safe_to_publish).toBe(true)
    expect(data.blockers).toEqual([])
    expect(data.active_catalog_version_id).toBe(activeBefore)
    expect(data.schedule.scheduled_slots).toEqual({ cocktail: 72, ingredient: 39 })
    expect(data.schedule.available_pool.cocktail).toBe(80)
    expect(data.diff.offerings).toHaveProperty('added_count')
    expect(data.diff.cocktail_candidates.unchanged_count).toBe(80)

    expect(await versionCount()).toBe(versionsBefore)
    expect(await activeVersionId()).toBe(activeBefore)
    expect(await activeOfferCount()).toBe(offersBefore)
    expect(await candidateCount()).toBe(candidatesBefore)
    const { data: cand } = await svc().from('catalog_import_candidates').select('status').eq('id', candidateId).single()
    expect(cand!.status).toBe('staged')
  })

  it('preview of an unknown candidate fails without mutating', async () => {
    const { data } = await admin.rpc('admin_preview_catalog_publish', { p_candidate_id: randomUUID() })
    expect(data.ok).toBe(false)
    expect(data.code).toBe('CANDIDATE_NOT_FOUND')
    expect(data.safe_to_publish).toBe(false)
  })

  it('blocks publish after the finale latch', async () => {
    const { candidateId } = await stage(buildVariantCatalog())
    await svc().from('game_control').update({ finalized_at_utc: new Date().toISOString() }).eq('game', 'drinkit')
    const { data } = await admin.rpc('admin_preview_catalog_publish', { p_candidate_id: candidateId })
    expect(data.safe_to_publish).toBe(false)
    expect(data.blockers.map((b: { code: string }) => b.code)).toContain('CATALOG_FINALE_PASSED')
  })
})

describe('Phase 6B2 catalog publish — publish', () => {
  it('clean publish moves the pointer and rebinds every scheduled slot', async () => {
    const oldVersion = await activeVersionId()
    const doc = buildVariantCatalog({ baseCatalogId: 'dev-fixture-schedule-ready-v1' })
    const { candidateId, hash } = await stage(doc)
    const versionsBefore = await versionCount()
    const offersBefore = await activeOfferCount()

    const { data, error } = await publish(candidateId, hash)
    expect(error).toBeNull()
    expect(data.ok, JSON.stringify(data)).toBe(true)
    expect(data.previous_catalog_version_id).toBe(oldVersion)
    expect(data.reassigned_slots).toEqual({ cocktail: 72, ingredient: 39 })

    const newVersion = data.catalog_version_id as string
    expect(newVersion).not.toBe(oldVersion)
    expect(await activeVersionId()).toBe(newVersion)
    expect(await versionCount()).toBe(versionsBefore + 1)

    const { data: versions } = await svc()
      .from('catalog_versions')
      .select('id, status, payload_hash, catalog_id')
      .in('id', [oldVersion, newVersion])
    const byId = Object.fromEntries((versions ?? []).map((v) => [v.id, v]))
    expect(byId[oldVersion].status).toBe('retired')
    expect(byId[newVersion].status).toBe('active')
    expect(byId[newVersion].payload_hash).toBe(hash)
    expect(byId[newVersion].catalog_id).toBe(doc.catalog_id)

    for (const category of ['cocktail', 'ingredient'] as const) {
      const rows = await slotsWithOffers(category)
      expect(rows.length).toBe(category === 'cocktail' ? 72 : 39)
      for (const { slot, offer } of rows) {
        expect(slot.state).toBe('scheduled')
        expect(slot.catalog_version_id).toBe(newVersion)
        expect(offer.catalog_version_id).toBe(newVersion)
        expect(offer.is_active).toBe(true)
      }
      const keys = rows.map((r) => r.offer.canonical_key)
      expect(new Set(keys).size).toBe(keys.length)
    }

    // History retained: old offers deactivated, one active offer per slot.
    expect(await activeOfferCount()).toBe(offersBefore)
    const { count: inactive } = await svc()
      .from('bounty_slot_offers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', false)
      .eq('catalog_version_id', oldVersion)
    expect(inactive).toBe(111)

    const { data: runs } = await svc().from('bounty_schedule_runs').select('catalog_version_id')
    expect((runs ?? []).map((r) => r.catalog_version_id)).toContain(newVersion)

    const { data: cand } = await svc()
      .from('catalog_import_candidates')
      .select('status, published_catalog_version_id')
      .eq('id', candidateId)
      .single()
    expect(cand!.status).toBe('published')
    expect(cand!.published_catalog_version_id).toBe(newVersion)

    // Cannot publish the same candidate twice under a new request id.
    const again = await publish(candidateId, hash)
    expect(again.data.ok).toBe(false)
    expect(again.data.code).toBe('CANDIDATE_ALREADY_PUBLISHED')
  })

  it('mid-cruise: current offer is preserved on its prior catalog version', async () => {
    const oldVersion = await activeVersionId()
    const at = noonDay1Utc()
    await exposeCurrentSlots(svc(), at)

    const cocktails = await slotsWithOffers('cocktail')
    const current = cocktails.find((r) => r.slot.state === 'current')!
    const currentIngredient = (await slotsWithOffers('ingredient')).find((r) => r.slot.state === 'current')!
    expect(current).toBeTruthy()
    expect(currentIngredient).toBeTruthy()

    const dropKey = ['fixture-cocktail-080', 'fixture-cocktail-079'].find(
      (k) => k !== current.offer.canonical_key,
    )!
    const doc = buildVariantCatalog({
      dropOffering: { drinkKey: dropKey, barKey: barKeyFor(buildVariantCatalog(), dropKey) },
    })
    const { candidateId, hash } = await stage(doc)

    const { data: pv } = await admin.rpc('admin_preview_catalog_publish', { p_candidate_id: candidateId })
    expect(pv.safe_to_publish).toBe(true)
    expect(pv.schedule.scheduled_slots).toEqual({ cocktail: 71, ingredient: 38 })
    expect(pv.schedule.protected_offers.length).toBe(2)

    const { data, error } = await publish(candidateId, hash)
    expect(error).toBeNull()
    expect(data.ok, JSON.stringify(data)).toBe(true)
    expect(data.reassigned_slots).toEqual({ cocktail: 71, ingredient: 38 })
    expect(data.preserved_slots_by_state.current).toBe(2)
    const newVersion = data.catalog_version_id as string

    const after = await slotsWithOffers('cocktail')
    const afterCurrent = after.find((r) => r.slot.id === current.slot.id)!
    expect(afterCurrent.slot.state).toBe('current')
    expect(afterCurrent.slot.current_offer_id).toBe(current.slot.current_offer_id)
    // The offer keeps its prior catalog version; the slot pointer follows the live catalog
    // so Admin Skip draws reserves from it.
    expect(afterCurrent.offer.catalog_version_id).toBe(oldVersion)
    expect(afterCurrent.offer.is_active).toBe(true)
    expect(afterCurrent.slot.catalog_version_id).toBe(newVersion)

    const afterIng = (await slotsWithOffers('ingredient')).find((r) => r.slot.id === currentIngredient.slot.id)!
    expect(afterIng.slot.current_offer_id).toBe(currentIngredient.slot.current_offer_id)
    expect(afterIng.offer.catalog_version_id).toBe(oldVersion)

    for (const { slot, offer } of after.filter((r) => r.slot.state === 'scheduled')) {
      expect(slot.catalog_version_id).toBe(newVersion)
      expect(offer.catalog_version_id).toBe(newVersion)
      expect(offer.canonical_key).not.toBe(dropKey)
    }

    // Player-facing read still serves the same live offer.
    const live = await svc().rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: at })
    expect(live.data.status).toBe('active')
    expect(live.data.offer_id).toBe(current.slot.current_offer_id)

    // Exposure ledger untouched.
    expect(await exposureKeys('cocktail')).toContain(current.offer.canonical_key)
  })

  it('never re-offers exposed objectives in rebound scheduled slots', async () => {
    for (const t of ['12:30:00', '13:30:00', '14:30:00']) {
      await exposeCurrentSlots(svc(), slotUtc(1, t))
    }
    const exposedC = await exposureKeys('cocktail')
    const exposedI = await exposureKeys('ingredient')
    expect(exposedC.length).toBe(3)
    expect(exposedI.length).toBeGreaterThanOrEqual(1)

    const { candidateId, hash } = await stage(buildVariantCatalog())
    const { data } = await publish(candidateId, hash)
    expect(data.ok, JSON.stringify(data)).toBe(true)

    const cocktails = await slotsWithOffers('cocktail')
    const scheduled = cocktails.filter((r) => r.slot.state === 'scheduled')
    expect(scheduled.length).toBe(72 - 3)
    for (const { offer } of scheduled) {
      expect(exposedC).not.toContain(offer.canonical_key)
    }
    const ingredients = (await slotsWithOffers('ingredient')).filter((r) => r.slot.state === 'scheduled')
    for (const { offer } of ingredients) {
      expect(exposedI).not.toContain(offer.canonical_key)
    }
    // Exposure history is append-only.
    expect(await exposureKeys('cocktail')).toEqual(expect.arrayContaining(exposedC))
  })

  it('blocks when a live objective is missing from the proposed catalog', async () => {
    await exposeCurrentSlots(svc(), noonDay1Utc())
    const current = (await slotsWithOffers('cocktail')).find((r) => r.slot.state === 'current')!
    const key = current.offer.canonical_key
    const barKey = barKeyFor(buildVariantCatalog(), key)
    const { candidateId, hash } = await stage(
      buildVariantCatalog({ dropOffering: { drinkKey: key, barKey } }),
    )
    const versionsBefore = await versionCount()

    const { data: pv } = await admin.rpc('admin_preview_catalog_publish', { p_candidate_id: candidateId })
    expect(pv.safe_to_publish).toBe(false)
    const blocker = pv.blockers.find((b: { code: string }) => b.code === 'CURRENT_OFFER_MISSING')
    expect(blocker.canonical_key).toBe(key)

    const { data } = await publish(candidateId, hash)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('PUBLISH_BLOCKED')
    expect(await versionCount()).toBe(versionsBefore)
    const afterSlots = await slotsWithOffers('cocktail')
    expect(afterSlots.find((r) => r.slot.id === current.slot.id)!.slot.current_offer_id).toBe(
      current.slot.current_offer_id,
    )
  })

  it('blocks when remaining scheduled slots cannot be filled from the unused pool', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(svc(), at)
    const before = (await slotsWithOffers('cocktail')).find((r) => r.slot.state === 'current')!
    const skip = await svc().rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: before.slot.current_offer_id,
      p_client_request_id: randomUUID(),
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(skip.data.ok, JSON.stringify(skip.data)).toBe(true)
    const retiredKey = before.offer.canonical_key
    const after = (await slotsWithOffers('cocktail')).find((r) => r.slot.id === before.slot.id)!
    const replacementKey = after.offer.canonical_key

    // A skip burns two keys for one slot. Offer exactly 72 candidates (both included):
    // 72 - 2 = 70 unused vs 71 scheduled slots.
    const all = Array.from({ length: 80 }, (_, i) => `fixture-cocktail-${String(i + 1).padStart(3, '0')}`)
    const keep = [retiredKey, replacementKey, ...all.filter((k) => k !== retiredKey && k !== replacementKey)].slice(0, 72)
    const { candidateId, hash } = await stage(buildVariantCatalog({ restrictCocktailCandidates: keep }))

    const { data: pv } = await admin.rpc('admin_preview_catalog_publish', { p_candidate_id: candidateId })
    expect(pv.safe_to_publish).toBe(false)
    const shortage = pv.blockers.find((b: { code: string }) => b.code === 'REMAINING_POOL_SHORTAGE')
    expect(shortage.category).toBe('cocktail')
    expect(shortage.shortage).toBe(1)

    const versionsBefore = await versionCount()
    const { data } = await publish(candidateId, hash)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('PUBLISH_BLOCKED')
    expect(await versionCount()).toBe(versionsBefore)
  })

  it('rejects publish when the active catalog changed since preview (stale expected active)', async () => {
    const { candidateId, hash } = await stage(buildVariantCatalog())
    const versionsBefore = await versionCount()
    const activeBefore = await activeVersionId()

    const stale = await publish(candidateId, hash, { expectedActive: randomUUID() })
    expect(stale.error).toBeNull()
    expect(stale.data.ok).toBe(false)
    expect(stale.data.code).toBe('STALE_ACTIVE_VERSION')
    expect(stale.data.active_catalog_version_id).toBe(activeBefore)

    const wrongHash = await publish(candidateId, 'f'.repeat(64))
    expect(wrongHash.data.code).toBe('PAYLOAD_HASH_MISMATCH')

    expect(await versionCount()).toBe(versionsBefore)
    expect(await activeVersionId()).toBe(activeBefore)
    const { data: cand } = await svc().from('catalog_import_candidates').select('status').eq('id', candidateId).single()
    expect(cand!.status).toBe('staged')
  })

  it('replays the same client_request_id without publishing twice', async () => {
    const { candidateId, hash } = await stage(buildVariantCatalog())
    const requestId = randomUUID()
    const active = await activeVersionId()
    const first = await publish(candidateId, hash, { requestId, expectedActive: active })
    expect(first.data.ok).toBe(true)
    expect(first.data.idempotent_replay).toBe(false)
    const versionsAfterFirst = await versionCount()

    const replay = await publish(candidateId, hash, { requestId, expectedActive: active })
    expect(replay.error).toBeNull()
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.catalog_version_id).toBe(first.data.catalog_version_id)
    expect(await versionCount()).toBe(versionsAfterFirst)

    // Same id, different operation -> mismatch.
    const other = await stage(buildVariantCatalog())
    const mismatch = await publish(other.candidateId, other.hash, { requestId, expectedActive: active })
    expect(mismatch.data.ok).toBe(false)
    expect(mismatch.data.code).toBe('REQUEST_ID_OPERATION_MISMATCH')

    const found = await admin.rpc('admin_find_catalog_publish_request_by_id', {
      p_client_request_id: requestId,
    })
    expect(found.data.ok).toBe(true)
    expect(found.data.request_status).toBe('completed')
    expect(found.data.action).toBe('publish')
    expect(found.data.catalog_version_id).toBe(first.data.catalog_version_id)

    const missing = await admin.rpc('admin_find_catalog_publish_request_by_id', {
      p_client_request_id: randomUUID(),
    })
    expect(missing.data).toBeNull()
  })

  it('concurrent publishes with one request id publish exactly once', async () => {
    const { candidateId, hash } = await stage(buildVariantCatalog())
    const requestId = randomUUID()
    const active = await activeVersionId()
    const versionsBefore = await versionCount()
    const [a, b] = await Promise.all([
      publish(candidateId, hash, { requestId, expectedActive: active }),
      publish(candidateId, hash, { requestId, expectedActive: active }),
    ])
    expect(a.data.ok).toBe(true)
    expect(b.data.ok).toBe(true)
    expect(a.data.catalog_version_id).toBe(b.data.catalog_version_id)
    expect([a.data.idempotent_replay, b.data.idempotent_replay].sort()).toEqual([false, true])
    expect(await versionCount()).toBe(versionsBefore + 1)
  })

  it('carries manual offerings forward and de-duplicates ones the snapshot now includes', async () => {
    const oldVersion = await activeVersionId()
    const add = async (name: string) => {
      const res = await admin.rpc('admin_add_drink', {
        p_client_request_id: randomUUID(),
        p_display_name: name,
        p_bar_canonical_keys: ['wake-view'],
        p_ingredient_canonical_keys: ['lime-juice'],
        p_kind: 'named_cocktail',
      })
      expect(res.data.ok, JSON.stringify(res.data)).toBe(true)
      return res.data.offerings[0].offering_id as string
    }
    const carryOffering = await add('Phase6 Carry Drink')
    const dedupeOffering = await add('Phase6 Dedupe Drink')

    const doc = buildVariantCatalog({
      addDrink: { key: 'phase6-dedupe-drink', name: 'Phase6 Dedupe Drink', barKey: 'wake-view' },
    })
    const { candidateId, hash } = await stage(doc)

    const { data: pv } = await admin.rpc('admin_preview_catalog_publish', { p_candidate_id: candidateId })
    const manual = pv.overlays.manual_offerings
    expect(manual.carry_forward.map((m: { drink_key: string }) => m.drink_key)).toEqual(['phase6-carry-drink'])
    expect(manual.redundant.map((m: { drink_key: string }) => m.drink_key)).toEqual(['phase6-dedupe-drink'])
    expect(manual.dropped).toEqual([])

    const { data } = await publish(candidateId, hash)
    expect(data.ok, JSON.stringify(data)).toBe(true)
    expect(data.manual_offerings).toEqual({ carried_forward: 1, redundant: 1, dropped: 0 })
    const newVersion = data.catalog_version_id as string

    const { data: newManuals } = await svc()
      .from('admin_manual_offerings')
      .select('offering_id, active, introduced_version_offering, drink_canonical_key')
      .eq('catalog_version_id', newVersion)
    expect(newManuals).toHaveLength(1)
    expect(newManuals![0]!.offering_id).toBe(carryOffering)
    expect(newManuals![0]!.active).toBe(true)
    expect(newManuals![0]!.introduced_version_offering).toBe(true)

    const { data: oldDedupe } = await svc()
      .from('admin_manual_offerings')
      .select('active, deactivation_note')
      .eq('catalog_version_id', oldVersion)
      .eq('offering_id', dedupeOffering)
      .single()
    expect(oldDedupe!.active).toBe(false)
    expect(oldDedupe!.deactivation_note).toMatch(/^catalog_superseded/)

    const { data: cvo } = await svc()
      .from('catalog_version_offerings')
      .select('offering_id')
      .eq('catalog_version_id', newVersion)
      .in('offering_id', [carryOffering, dedupeOffering])
    expect((cvo ?? []).map((r) => r.offering_id).sort()).toEqual([carryOffering, dedupeOffering].sort())

    const { data: coi } = await svc()
      .from('catalog_offering_ingredients')
      .select('ingredient_id')
      .eq('catalog_version_id', newVersion)
      .eq('offering_id', carryOffering)
    expect(coi?.length).toBe(1)

    // Manual overlays never enter the Cocktail rotation.
    const { count: candidateRows } = await svc()
      .from('cocktail_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('catalog_version_id', newVersion)
      .in('offering_id', [carryOffering, dedupeOffering])
    expect(candidateRows).toBe(0)

    // Picker (active catalog) lists both drinks; the carried one stays flagged admin_added.
    const picker = await admin.rpc('list_drinkit_bar_drinks', { p_bar_canonical_key: 'wake-view' })
    const byKey = new Map((picker.data as Array<{ canonical_key: string; admin_added: boolean }>).map((d) => [d.canonical_key, d]))
    expect(byKey.get('phase6-carry-drink')?.admin_added).toBe(true)
    expect(byKey.get('phase6-dedupe-drink')?.admin_added).toBe(false)
  })

  it('supersedes redundant corrections but never clears admin suppression', async () => {
    const drinkKey = 'fixture-cocktail-001'
    const base = buildVariantCatalog()
    const barKey = barKeyFor(base, drinkKey)
    const { data: concept } = await svc().from('drink_concepts').select('id').eq('canonical_key', drinkKey).single()
    const { data: bar } = await svc().from('bars').select('id').eq('canonical_key', barKey).single()
    const { data: offering } = await svc()
      .from('bar_offerings')
      .select('id')
      .eq('bar_id', bar!.id)
      .eq('drink_concept_id', concept!.id)
      .single()
    const { data: ings } = await svc().from('ingredients').select('id, canonical_key').in('canonical_key', ['chartreuse', 'falernum'])
    const ingId = Object.fromEntries((ings ?? []).map((i) => [i.canonical_key, i.id]))
    const player = playerId(fixtures, 'drink_only')

    const { data: active, error: e1 } = await svc()
      .from('ingredient_corrections')
      .insert({
        offering_id: offering!.id,
        ingredient_id: ingId['chartreuse'],
        confirmed_by_player_id: player,
        active: true,
      })
      .select('id')
      .single()
    expect(e1).toBeNull()
    const { data: suppressed, error: e2 } = await svc()
      .from('ingredient_corrections')
      .insert({
        offering_id: offering!.id,
        ingredient_id: ingId['falernum'],
        confirmed_by_player_id: player,
        active: false,
        inactive_cause: 'admin',
        deactivated_by_player_id: playerId(fixtures, 'admin'),
        deactivation_note: 'admin suppress',
      })
      .select('id')
      .single()
    expect(e2).toBeNull()
    cleanupCorrections.push(active!.id as string, suppressed!.id as string)

    const doc = buildVariantCatalog({
      addIngredientToOffering: [
        { drinkKey, barKey, ingredientKey: 'chartreuse' },
        { drinkKey, barKey, ingredientKey: 'falernum' },
      ],
    })
    const { candidateId, hash } = await stage(doc)
    const { data: pv } = await admin.rpc('admin_preview_catalog_publish', { p_candidate_id: candidateId })
    expect(pv.overlays.corrections.redundant_count).toBe(1)
    expect(pv.overlays.corrections.admin_suppressed_in_catalog).toHaveLength(1)

    const { data } = await publish(candidateId, hash)
    expect(data.ok, JSON.stringify(data)).toBe(true)
    expect(data.corrections_deactivated_redundant).toBe(1)

    const { data: rows } = await svc()
      .from('ingredient_corrections')
      .select('id, active, inactive_cause, deactivation_note')
      .in('id', [active!.id, suppressed!.id])
    const byId = Object.fromEntries((rows ?? []).map((r) => [r.id, r]))
    expect(byId[active!.id as string].active).toBe(false)
    expect(byId[active!.id as string].inactive_cause).toBe('no_valid_sources')
    expect(byId[active!.id as string].deactivation_note).toBe('catalog_superseded')
    expect(byId[suppressed!.id as string].active).toBe(false)
    expect(byId[suppressed!.id as string].inactive_cause).toBe('admin')
    expect(byId[suppressed!.id as string].deactivation_note).toBe('admin suppress')
  })
})

describe('Phase 6B2 catalog publish — rollback', () => {
  it('rolls back as a NEW audited revision, not a pointer flip', async () => {
    const v1 = await activeVersionId()
    const v1Doc = (await svc().from('catalog_versions').select('catalog_id').eq('id', v1).single()).data!
    const { candidateId, hash } = await stage(buildVariantCatalog())
    const pub = await publish(candidateId, hash)
    expect(pub.data.ok).toBe(true)
    const v2 = pub.data.catalog_version_id as string
    const versionsBefore = await versionCount()

    const requestId = randomUUID()
    const rb = await admin.rpc('admin_rollback_catalog', {
      p_client_request_id: requestId,
      p_target_catalog_version_id: v1,
      p_expected_active_catalog_version_id: v2,
    })
    expect(rb.error).toBeNull()
    expect(rb.data.ok, JSON.stringify(rb.data)).toBe(true)
    expect(rb.data.action).toBe('rollback')
    const v3 = rb.data.catalog_version_id as string
    expect([v1, v2]).not.toContain(v3)
    expect(rb.data.catalog_id).toMatch(new RegExp(`^${v1Doc.catalog_id}-rollback-[0-9a-f]{8}$`))
    expect(await versionCount()).toBe(versionsBefore + 1)
    expect(await activeVersionId()).toBe(v3)

    const { data: versions } = await svc().from('catalog_versions').select('id, status, base_catalog_id').in('id', [v1, v2, v3])
    const byId = Object.fromEntries((versions ?? []).map((v) => [v.id, v]))
    expect(byId[v1].status).toBe('retired') // target is never silently reactivated
    expect(byId[v2].status).toBe('retired')
    expect(byId[v3].status).toBe('active')
    expect(byId[v3].base_catalog_id).toBe(v1Doc.catalog_id)

    for (const category of ['cocktail', 'ingredient'] as const) {
      const rows = await slotsWithOffers(category)
      for (const { slot, offer } of rows) {
        expect(slot.catalog_version_id).toBe(v3)
        expect(offer.catalog_version_id).toBe(v3)
      }
    }

    const { data: audit } = await svc()
      .from('admin_audit_log')
      .select('action, target_id')
      .eq('action', 'catalog.rollback')
      .eq('target_id', v3)
    expect(audit?.length).toBe(1)

    // Replay returns the stored result.
    const replay = await admin.rpc('admin_rollback_catalog', {
      p_client_request_id: requestId,
      p_target_catalog_version_id: v1,
      p_expected_active_catalog_version_id: v2,
    })
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.catalog_version_id).toBe(v3)
    expect(await versionCount()).toBe(versionsBefore + 1)

    const { data: list } = await admin.rpc('admin_list_catalog_versions')
    const row = (list as Array<{ id: string; origin: string; is_active: boolean }>).find((r) => r.id === v3)!
    expect(row.origin).toBe('rollback')
    expect(row.is_active).toBe(true)
    expect((list as Array<{ id: string }>).find((r) => r.id === v1)).toBeTruthy()
  })

  it('rejects incompatible rollback when a live objective is absent from the target', async () => {
    const v1 = await activeVersionId()
    // v2 pool is entirely new drinks; v1 drinks stay as offerings so publish is safe.
    const { candidateId, hash } = await stage(buildVariantCatalog({ replaceCocktailPool: 80 }))
    const pub = await publish(candidateId, hash)
    expect(pub.data.ok, JSON.stringify(pub.data)).toBe(true)
    const v2 = pub.data.catalog_version_id as string

    await exposeCurrentSlots(svc(), noonDay1Utc())
    const live = (await slotsWithOffers('cocktail')).find((r) => r.slot.state === 'current')!
    expect(live.offer.canonical_key).toMatch(/^variant-cocktail-/)
    const versionsBefore = await versionCount()

    const rb = await admin.rpc('admin_rollback_catalog', {
      p_client_request_id: randomUUID(),
      p_target_catalog_version_id: v1,
      p_expected_active_catalog_version_id: v2,
    })
    expect(rb.error).toBeNull()
    expect(rb.data.ok).toBe(false)
    expect(rb.data.code).toBe('ROLLBACK_BLOCKED')
    expect(rb.data.blockers.map((b: { code: string }) => b.code)).toContain('CURRENT_OFFER_MISSING')
    expect(await versionCount()).toBe(versionsBefore)
    expect(await activeVersionId()).toBe(v2)
    const { data: v1row } = await svc().from('catalog_versions').select('status').eq('id', v1).single()
    expect(v1row!.status).toBe('retired')
  })

  it('rejects rollback to the active / a missing / a stale-expected target', async () => {
    const active = await activeVersionId()
    const toActive = await admin.rpc('admin_rollback_catalog', {
      p_client_request_id: randomUUID(),
      p_target_catalog_version_id: active,
      p_expected_active_catalog_version_id: active,
    })
    expect(toActive.data.code).toBe('ROLLBACK_TARGET_ACTIVE')

    const missing = await admin.rpc('admin_rollback_catalog', {
      p_client_request_id: randomUUID(),
      p_target_catalog_version_id: randomUUID(),
      p_expected_active_catalog_version_id: active,
    })
    expect(missing.data.code).toBe('ROLLBACK_TARGET_NOT_FOUND')

    const stale = await admin.rpc('admin_rollback_catalog', {
      p_client_request_id: randomUUID(),
      p_target_catalog_version_id: active,
      p_expected_active_catalog_version_id: randomUUID(),
    })
    expect(stale.data.code).toBe('STALE_ACTIVE_VERSION')
  })
})

describe('Phase 6B2 catalog publish — authorization', () => {
  it('denies non-admin players on every catalog publish RPC', async () => {
    const player = await signInAs(local(), 'drink_only')
    const doc = buildVariantCatalog()
    const preview = previewCatalogImport(doc)
    const calls: Array<Promise<{ error: { message: string } | null }>> = [
      player.rpc('admin_stage_catalog_import', {
        p_client_request_id: randomUUID(),
        p_payload: doc,
        p_validation: buildStageValidation(preview),
      }),
      player.rpc('admin_preview_catalog_publish', { p_candidate_id: randomUUID() }),
      player.rpc('admin_publish_catalog_import', {
        p_client_request_id: randomUUID(),
        p_candidate_id: randomUUID(),
        p_expected_active_catalog_version_id: null,
        p_expected_payload_hash: 'x',
      }),
      player.rpc('admin_rollback_catalog', {
        p_client_request_id: randomUUID(),
        p_target_catalog_version_id: randomUUID(),
        p_expected_active_catalog_version_id: null,
      }),
      player.rpc('admin_find_catalog_publish_request_by_id', { p_client_request_id: randomUUID() }),
      player.rpc('admin_list_catalog_versions'),
    ]
    const before = await candidateCount()
    for (const res of await Promise.all(calls)) {
      expect(res.error?.message ?? '').toMatch(/ADMIN_REQUIRED/)
    }
    expect(await candidateCount()).toBe(before)

    // Internal helpers are not callable by players.
    const internal = await player.rpc('catalog_publish_evaluate', { p_payload: doc, p_active_version_id: null })
    expect(internal.error).toBeTruthy()
  })

  it('lists catalog versions for admins without payloads', async () => {
    const { data, error } = await admin.rpc('admin_list_catalog_versions')
    expect(error).toBeNull()
    const rows = data as Array<Record<string, unknown>>
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]).not.toHaveProperty('manifest_json')
    expect(rows.filter((r) => r.is_active)).toHaveLength(1)
  })
})
