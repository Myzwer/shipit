import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { GameId } from '@/types/game'
import type { RevealWrappedResult, WrappedPayload } from '@/types/wrapped'

export class WrappedApiError extends Error {
  code: string
  constructor(message: string, code = 'WRAPPED_ERROR') {
    super(message)
    this.name = 'WrappedApiError'
    this.code = code
  }
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new WrappedApiError('Supabase is not configured.', 'UNAVAILABLE')
  }
  return supabase
}

export async function fetchMyWrapped(game: GameId): Promise<WrappedPayload> {
  const client = requireClient()
  const { data, error } = await client.rpc('get_my_wrapped' as 'get_ship_clock_state', {
    p_game: game,
  } as never)
  if (error) throw new WrappedApiError(error.message, 'RPC_ERROR')
  return data as WrappedPayload
}

export async function revealMyWrapped(game: GameId): Promise<RevealWrappedResult> {
  const client = requireClient()
  const { data, error } = await client.rpc('reveal_my_wrapped' as 'get_ship_clock_state', {
    p_game: game,
  } as never)
  if (error) throw new WrappedApiError(error.message, 'RPC_ERROR')
  return data as RevealWrappedResult
}

export async function fetchDrinkItLeaderboard(): Promise<{
  ok: boolean
  leaderboard?: Array<{
    id: string
    name: string
    points: number
    metric_label: string
    rank: number
    is_me?: boolean
  }>
  code?: string
}> {
  const client = requireClient()
  const { data, error } = await client.rpc(
    'get_my_drinkit_leaderboard' as 'get_ship_clock_state',
  )
  if (error) throw new WrappedApiError(error.message, 'RPC_ERROR')
  return data as {
    ok: boolean
    leaderboard?: Array<{
      id: string
      name: string
      points: number
      metric_label: string
      rank: number
      is_me?: boolean
    }>
    code?: string
  }
}
