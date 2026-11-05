/**
 * Minimal typed Supabase access layer for Phase 1A+.
 * Login UI / route guards arrive in Phase 1B — do not add them here.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, LoginDirectoryRow, SessionProfile } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url!, anonKey!)
  : null

export async function fetchLoginDirectory(): Promise<LoginDirectoryRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('login_directory').select('display_name, login_alias')
  if (error) throw error
  return data ?? []
}

export async function fetchMySessionProfile(): Promise<SessionProfile | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_my_session_profile')
  if (error) throw error
  return data
}
