/**
 * Lightweight Admin overview counts (cruise-scoped).
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export type AdminOverviewSummary = {
  ok: boolean
  players: number
  drinkit_enabled: number
  shipit_enabled: number
  teams: number
  shipit_unassigned: number
}

export class AdminOverviewError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminOverviewError'
  }
}

export async function fetchAdminOverviewSummary(): Promise<AdminOverviewSummary> {
  if (!isSupabaseConfigured || !supabase) {
    throw new AdminOverviewError('Supabase is not configured.')
  }
  const { data, error } = await supabase.rpc('admin_overview_summary' as 'get_ship_clock_state')
  if (error) throw new AdminOverviewError(error.message)
  return data as unknown as AdminOverviewSummary
}
