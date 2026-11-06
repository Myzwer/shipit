import { supabase } from '@/lib/supabase'
import type {
  DrinkitBarDrinkRow,
  DrinkitBarRow,
  DrinkitCompanionRow,
  PreviewPayload,
  SubmitDrinkResult,
  WizardDrinkSelection,
} from '@/types/drinkLog'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** Untyped RPC helper — Phase 3B functions are not fully in generated Database types. */
async function rpc(fn: string, args?: Record<string, unknown>) {
  const client = requireClient()
  return client.rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

export async function listDrinkitBars(): Promise<DrinkitBarRow[]> {
  const { data, error } = await rpc('list_drinkit_bars')
  if (error) throw error
  if (!Array.isArray(data)) return []
  return (data as Array<Record<string, unknown>>)
    .map((r) => ({
      bar_id: String(r.bar_id ?? ''),
      canonical_key: String(r.canonical_key ?? ''),
      name: String(r.name ?? ''),
      deck: Number.parseInt(String(r.deck ?? '0'), 10) || 0,
    }))
    .filter((b) => b.canonical_key && b.name)
}

export async function listDrinkitBarDrinks(barKey: string): Promise<DrinkitBarDrinkRow[]> {
  const { data, error } = await rpc('list_drinkit_bar_drinks', {
    p_bar_canonical_key: barKey,
  })
  if (error) throw error
  if (!Array.isArray(data)) return []
  return (data as Array<Record<string, unknown>>)
    .map((r) => ({
      offering_id: String(r.offering_id ?? ''),
      drink_concept_id: String(r.drink_concept_id ?? ''),
      canonical_key: String(r.canonical_key ?? ''),
      display_name: String(r.display_name ?? ''),
      kind: String(r.kind ?? ''),
    }))
    .filter((d) => d.offering_id && d.display_name)
}

export async function listDrinkitCompanions(): Promise<DrinkitCompanionRow[]> {
  const { data, error } = await rpc('list_drinkit_companions')
  if (error) throw error
  if (!Array.isArray(data)) return []
  return (data as Array<Record<string, unknown>>)
    .map((r) => ({
      player_id: String(r.player_id ?? ''),
      display_name: String(r.display_name ?? ''),
    }))
    .filter((c) => c.player_id && c.display_name)
}

export function buildDrinkPayloadDrink(drink: WizardDrinkSelection) {
  if (drink.mode === 'named_catalog') {
    return {
      mode: 'named_catalog',
      offering_id: drink.offeringId,
      ...(drink.confirmContainsIngredientKey
        ? { confirm_contains_ingredient_key: drink.confirmContainsIngredientKey }
        : {}),
    }
  }
  if (drink.mode === 'unlisted_named') {
    return {
      mode: 'unlisted_named',
      custom_name: drink.customName ?? drink.displayName,
      unlisted_drink_kind: drink.unlistedDrinkKind ?? 'named_cocktail',
      ...(drink.unlistedContainsIngredientKey
        ? { unlisted_contains_ingredient_key: drink.unlistedContainsIngredientKey }
        : {}),
      ...(drink.confirmFeaturedCocktail ? { confirm_featured_cocktail: true } : {}),
    }
  }
  return { mode: drink.mode }
}

export function buildSubmitPayload(input: {
  idempotencyKey: string
  barCanonicalKey: string
  drink: WizardDrinkSelection
  companionIds: string[]
  selectedClaims: Array<{
    category: string
    offer_id?: string
    assignment_id?: string
  }>
  caption: string | null
  /** Optional staged drink_log photo id — never a raw Storage path. */
  photoId?: string | null
}) {
  // Product override: single Friends selector auto-fills bar-eligible subset.
  const companions = [...input.companionIds]
  const payload: Record<string, unknown> = {
    idempotency_key: input.idempotencyKey,
    bar_canonical_key: input.barCanonicalKey,
    drink: buildDrinkPayloadDrink(input.drink),
    companion_player_ids: companions,
    bar_eligible_companion_ids: companions,
    selected_claims: input.selectedClaims,
    caption: input.caption,
    // Legacy field: always null so fingerprints stay compatible; server rejects non-null.
    photo_storage_key: null,
  }
  if (input.photoId) {
    payload.photo_id = input.photoId
  }
  return payload
}

export async function previewDrinkClaims(payload: Record<string, unknown>): Promise<{
  ok: boolean
  code?: string
  preview: PreviewPayload
}> {
  const { data, error } = await rpc('preview_drink_claims', { p_payload: payload })
  if (error) throw error
  const row = (data ?? {}) as Record<string, unknown>
  return {
    ok: row.ok === true,
    code: typeof row.code === 'string' ? row.code : undefined,
    preview: (row.preview ?? {}) as PreviewPayload,
  }
}

export type SubmitCallOutcome =
  | { kind: 'confirmed'; result: SubmitDrinkResult }
  | { kind: 'unknown'; error: unknown }
  | { kind: 'rejected'; result: SubmitDrinkResult }

export async function submitDrink(payload: Record<string, unknown>): Promise<SubmitCallOutcome> {
  try {
    const { data, error } = await rpc('submit_drink', { p_payload: payload })
    if (error) {
      const msg = error.message?.toLowerCase() ?? ''
      if (
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('timeout') ||
        error.code === '' ||
        error.code == null
      ) {
        return { kind: 'unknown', error }
      }
      return {
        kind: 'rejected',
        result: {
          ok: false,
          code: error.code || 'SUBMIT_ERROR',
          message: error.message,
        },
      }
    }
    const result = (data ?? {}) as SubmitDrinkResult
    if (result.ok === true) return { kind: 'confirmed', result }
    return { kind: 'rejected', result }
  } catch (error) {
    return { kind: 'unknown', error }
  }
}

export async function fetchMyDrinkSubmission(submissionId: string) {
  const { data, error } = await rpc('get_my_drink_submission', {
    p_submission_id: submissionId,
  })
  if (error) throw error
  return data as Record<string, unknown>
}

export async function fetchCurrentBarBounty() {
  const { data, error } = await rpc('get_my_current_bar_bounty')
  if (error) throw error
  return data as Record<string, unknown> | null
}

export async function fetchBarBountyReminder(barCanonicalKey: string) {
  const { data, error } = await rpc('drinkit_bar_bounty_reminder', {
    p_bar_canonical_key: barCanonicalKey,
  })
  if (error) throw error
  return data as { show_reminder?: boolean } | null
}
