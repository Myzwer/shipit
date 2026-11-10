/**
 * Phase B3 client wrappers for B1/B2 Bar Bounty crew + preview RPCs.
 */
import { supabase } from '@/lib/supabase'
import type {
  AdminBarBountyCrewsResult,
  MyBarBountyCrewResult,
} from '@/types/barBountyCrew'
import type { BarBountyPreviewResult } from '@/types/barBountyPreview'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** Untyped RPC helper — crew RPCs are not fully in generated Database types. */
async function rpc(fn: string, args?: Record<string, unknown>) {
  const client = requireClient()
  return client.rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

export async function fetchMyBarBountyCrew(): Promise<MyBarBountyCrewResult> {
  const { data, error } = await rpc('get_my_bar_bounty_crew')
  if (error) throw error
  return (data ?? { ok: false, status: 'unavailable', code: 'EMPTY' }) as MyBarBountyCrewResult
}

export async function previewMyBarBounty(payload: {
  bar_canonical_key: string
  companion_player_ids: string[]
  drink?: Record<string, unknown>
}): Promise<BarBountyPreviewResult> {
  const { data, error } = await rpc('preview_my_bar_bounty', {
    p_payload: {
      bar_canonical_key: payload.bar_canonical_key,
      companion_player_ids: payload.companion_player_ids,
      drink: payload.drink ?? { mode: 'generic_beer' },
    },
  })
  if (error) throw error
  return (data ?? {
    ok: false,
    awards_points: false,
    creates_claim: false,
    code: 'EMPTY',
  }) as BarBountyPreviewResult
}

export async function adminListBarBountyCrews(): Promise<AdminBarBountyCrewsResult> {
  const { data, error } = await rpc('admin_list_bar_bounty_crews')
  if (error) throw error
  return (data ?? {
    ok: false,
    status: 'unavailable',
    code: 'EMPTY',
    message: 'No response',
  }) as AdminBarBountyCrewsResult
}
