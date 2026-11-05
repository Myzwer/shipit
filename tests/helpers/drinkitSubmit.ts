import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { identity, type LocalFixtures } from './localSupabase'
import { noonDay1Utc, slotUtc } from './bountyFixtures'

export function drinkPayload(opts: {
  barKey: string
  mode?: 'named_catalog' | 'generic_beer' | 'generic_wine' | 'generic_other' | 'unlisted_named'
  offeringId?: string
  customName?: string
  companions?: string[]
  selectedClaims?: unknown[]
  caption?: string | null
  idempotencyKey?: string
  forged?: Record<string, unknown>
}) {
  const drink =
    opts.mode === 'named_catalog' || (!opts.mode && opts.offeringId)
      ? { mode: 'named_catalog', offering_id: opts.offeringId }
      : opts.mode === 'unlisted_named'
        ? { mode: 'unlisted_named', custom_name: opts.customName ?? 'Mystery Cocktail' }
        : { mode: opts.mode ?? 'generic_beer' }

  return {
    idempotency_key: opts.idempotencyKey ?? randomUUID(),
    bar_canonical_key: opts.barKey,
    drink,
    companion_player_ids: opts.companions ?? [],
    selected_claims: opts.selectedClaims ?? [],
    caption: opts.caption ?? null,
    ...(opts.forged ?? {}),
  }
}

export async function lookupOffering(
  service: SupabaseClient,
  barKey: string,
  drinkKey: string,
): Promise<{ offering_id: string; bar_id: string; drink_concept_id: string }> {
  const { data: bar, error: bErr } = await service
    .from('bars')
    .select('id')
    .eq('canonical_key', barKey)
    .single()
  if (bErr) throw bErr
  const { data: concept, error: cErr } = await service
    .from('drink_concepts')
    .select('id')
    .eq('canonical_key', drinkKey)
    .single()
  if (cErr) throw cErr
  const { data: offering, error: oErr } = await service
    .from('bar_offerings')
    .select('id')
    .eq('bar_id', bar.id)
    .eq('drink_concept_id', concept.id)
    .single()
  if (oErr) throw oErr
  return { offering_id: offering.id, bar_id: bar.id, drink_concept_id: concept.id }
}

export async function exposeCurrentSlots(service: SupabaseClient, atUtc: string) {
  await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: atUtc })
  await service.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: atUtc })
}

export async function submitAt(
  service: SupabaseClient,
  playerId: string,
  payload: Record<string, unknown>,
  atUtc: string,
) {
  return service.rpc('dev_submit_drink_at', {
    p_payload: payload,
    p_at_utc: atUtc,
    p_player_id: playerId,
  })
}

export async function previewAt(
  service: SupabaseClient,
  playerId: string,
  payload: Record<string, unknown>,
  atUtc: string,
) {
  return service.rpc('dev_preview_drink_claims_at', {
    p_payload: payload,
    p_at_utc: atUtc,
    p_player_id: playerId,
  })
}

export function playerId(fixtures: LocalFixtures, key: string) {
  return identity(fixtures.summary!, key).player_id
}

export { noonDay1Utc, slotUtc, randomUUID }
