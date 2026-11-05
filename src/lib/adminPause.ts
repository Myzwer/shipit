/**
 * Organizer Pause/Resume for Drink It! — never touches Ship Clock.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export class AdminPauseError extends Error {
  code: 'unavailable' | 'error' | 'forbidden'

  constructor(message: string, code: 'unavailable' | 'error' | 'forbidden' = 'error') {
    super(message)
    this.name = 'AdminPauseError'
    this.code = code
  }
}

export interface DrinkItPauseStatus {
  drinkit: {
    status: string
    paused: boolean
    paused_at_utc: string | null
    finalized_at_utc: string | null
  }
  shipit: {
    status: string
    paused: boolean
    finalized_at_utc: string | null
  }
}

export interface SetPauseResult {
  paused: boolean
  status: string
  changed: boolean
  paused_at_utc: string | null
  finalized_at_utc: string | null
  client_request_id: string | null
}

export function newPauseRequestId(): string {
  return crypto.randomUUID()
}

export async function fetchDrinkItPauseStatus(): Promise<DrinkItPauseStatus> {
  if (!isSupabaseConfigured || !supabase) {
    throw new AdminPauseError('Supabase is not configured.', 'unavailable')
  }
  const { data, error } = await supabase.rpc('admin_get_drinkit_pause_status')
  if (error) {
    const msg = error.message ?? ''
    if (/ADMIN_REQUIRED/i.test(msg)) throw new AdminPauseError(msg, 'forbidden')
    throw new AdminPauseError(msg, 'error')
  }
  return data as DrinkItPauseStatus
}

export async function setDrinkItPaused(
  paused: boolean,
  clientRequestId: string,
): Promise<SetPauseResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new AdminPauseError('Supabase is not configured.', 'unavailable')
  }
  // Cast matches adminClock adminRpc — supabase-js Args generics are brittle for multi-arg RPCs.
  const { data, error } = await supabase.rpc('admin_set_drinkit_paused' as 'get_ship_clock_state', {
    p_paused: paused,
    p_client_request_id: clientRequestId,
  } as never)
  if (error) {
    const msg = error.message ?? ''
    if (/ADMIN_REQUIRED/i.test(msg)) throw new AdminPauseError(msg, 'forbidden')
    if (/FINALE_LOCKED/i.test(msg)) throw new AdminPauseError(msg, 'error')
    throw new AdminPauseError(msg, 'error')
  }
  return data as SetPauseResult
}
