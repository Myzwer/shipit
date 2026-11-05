/**
 * Hand-written Phase 1A database types.
 * Replace/augment with `supabase gen types` once local Supabase is running.
 */
export type GameId = 'drinkit' | 'shipit'

export interface LoginDirectoryRow {
  display_name: string
  login_alias: string
}

export interface PlayerRow {
  id: string
  auth_user_id: string | null
  display_name: string
  login_alias: string
  is_admin: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export interface GameMembershipRow {
  player_id: string
  game: GameId
  enabled: boolean
  created_at: string
}

export interface TeamRow {
  id: string
  name: string
  color: string | null
  active: boolean
  created_at: string
}

export interface TeamMembershipRow {
  id: string
  player_id: string
  team_id: string
  active_from: string
  active_to: string | null
  created_at: string
}

export interface SessionProfile {
  player_id: string
  display_name: string
  login_alias: string
  is_admin: boolean
  games: Array<{ game: GameId; enabled: boolean }>
  team: { team_id: string; name: string; color: string | null } | null
}

export interface Database {
  public: {
    Tables: {
      players: {
        Row: PlayerRow
        Insert: Partial<PlayerRow> &
          Pick<PlayerRow, 'display_name' | 'login_alias'>
        Update: Partial<PlayerRow>
      }
      game_memberships: {
        Row: GameMembershipRow
        Insert: Pick<GameMembershipRow, 'player_id' | 'game'> & {
          enabled?: boolean
        }
        Update: Partial<GameMembershipRow>
      }
      teams: {
        Row: TeamRow
        Insert: Pick<TeamRow, 'name'> & { color?: string | null; active?: boolean }
        Update: Partial<TeamRow>
      }
      team_memberships: {
        Row: TeamMembershipRow
        Insert: Pick<TeamMembershipRow, 'player_id' | 'team_id'> & {
          active_from?: string
          active_to?: string | null
        }
        Update: Partial<TeamMembershipRow>
      }
    }
    Views: {
      login_directory: {
        Row: LoginDirectoryRow
      }
      player_roster: {
        Row: {
          id: string
          display_name: string
          active: boolean
        }
      }
    }
    Functions: {
      get_my_session_profile: {
        Args: Record<string, never>
        Returns: SessionProfile | null
      }
      current_player_id: {
        Args: Record<string, never>
        Returns: string | null
      }
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      has_game: {
        Args: { p_game: GameId }
        Returns: boolean
      }
      current_team_id: {
        Args: Record<string, never>
        Returns: string | null
      }
      get_ship_clock_state: {
        Args: Record<string, never>
        Returns: Record<string, unknown>
      }
      admin_get_clock_diagnostics: {
        Args: Record<string, never>
        Returns: Record<string, unknown>
      }
      admin_preview_manual_clock_correction: {
        Args: { p_delta_minutes: number }
        Returns: Record<string, unknown>
      }
      admin_apply_manual_clock_correction: {
        Args: { p_delta_minutes: number; p_note?: string }
        Returns: Record<string, unknown>
      }
      admin_apply_manual_clock_set: {
        Args: { p_target_ship_local: string; p_note?: string }
        Returns: Record<string, unknown>
      }
      admin_upsert_ship_clock_plan_day: {
        Args: { p_day_number: number; p_delta_minutes: number; p_enabled?: boolean }
        Returns: Record<string, unknown>
      }
    }
    Enums: {
      game_id: GameId
    }
  }
}
