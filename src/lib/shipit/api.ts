import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type {
  ShipItChallengesPayload,
  ShipItFilter,
  ShipItHomePayload,
} from '@/types/shipit'

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

/** Untyped RPC helper — Ship It! functions are declared in Database but args overloads are brittle. */
async function rpc(fn: string, args?: Record<string, unknown>) {
  const client = requireClient()
  return client.rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

export async function fetchShipItHome(): Promise<ShipItHomePayload> {
  const { data, error } = await rpc('get_my_shipit_home')
  if (error) throw error
  return data as unknown as ShipItHomePayload
}

export async function fetchShipItChallenges(
  filter: ShipItFilter = 'all',
): Promise<ShipItChallengesPayload> {
  const { data, error } = await rpc('get_my_shipit_challenges', {
    p_category: filter === 'all' ? null : filter,
  })
  if (error) throw error
  return data as unknown as ShipItChallengesPayload
}

export const SHIPIT_CATEGORY_OPTIONS: { value: ShipItFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'classic_ship_landmarks', label: 'Classic Ship Landmarks' },
  { value: 'food_and_drink_discoveries', label: 'Food & Drink Discoveries' },
  {
    value: 'quirky_details_and_hidden_artifacts',
    label: 'Quirky Details & Hidden Artifacts',
  },
  {
    value: 'interactive_crew_and_activity',
    label: 'Interactive Crew & Activity Challenges',
  },
  {
    value: 'creative_team_and_action_shots',
    label: 'Creative Team & Action Shots',
  },
]
