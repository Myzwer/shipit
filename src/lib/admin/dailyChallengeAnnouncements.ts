/**
 * Phase C2 — Admin Daily Challenge announcement client helpers.
 */
import { supabase } from '@/lib/supabase'
import type {
  AdminListDailyChallengesResult,
  AdminSetDailyAnnouncementResult,
} from '@/types/dailyChallengeAdmin'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

async function rpc(fn: string, args?: Record<string, unknown>) {
  const client = requireClient()
  return client.rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

export function newDailyAnnounceRequestId(): string {
  return crypto.randomUUID()
}

export async function adminListDailyChallenges(): Promise<AdminListDailyChallengesResult> {
  const { data, error } = await rpc('admin_list_daily_challenges')
  if (error) throw error
  return (data ?? { ok: false, code: 'EMPTY' }) as AdminListDailyChallengesResult
}

export async function adminSetDailyChallengeAnnouncement(input: {
  dayNumber: number
  announcement: string | null
  clientRequestId: string
}): Promise<AdminSetDailyAnnouncementResult> {
  const { data, error } = await rpc('admin_set_daily_challenge_announcement', {
    p_day_number: input.dayNumber,
    p_announcement: input.announcement,
    p_client_request_id: input.clientRequestId,
  })
  if (error) throw error
  return (data ?? { ok: false, code: 'EMPTY' }) as AdminSetDailyAnnouncementResult
}
