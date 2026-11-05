/** Server-authoritative Ship Clock snapshot (get_ship_clock_state / diagnostics). */

export type ShipClockLifecycle = 'pre_cruise' | 'active' | 'final'

export interface ShipClockGameStatus {
  status: string
  paused: boolean
  finalized_at_utc: string | null
}

export interface ShipClockState {
  configured: boolean
  config_id?: string
  config_label?: string
  day1_ship_date?: string
  at_utc: string
  offset_minutes?: number
  ship_local?: string
  ship_date?: string | null
  cruise_day?: number | null
  lifecycle?: ShipClockLifecycle
  accepting_submissions?: boolean
  finale_at_utc?: string
  finalized?: boolean
  games?: {
    drinkit: ShipClockGameStatus
    shipit: ShipClockGameStatus
  }
  error?: string
}

export type PlanDeltaChoice = -120 | -60 | 0 | 60 | 120

/** UI select token: `off` = enabled false; numeric = enabled true with that delta. */
export type PlanDaySelectValue = 'off' | '-120' | '-60' | '0' | '60' | '120'

export interface ShipClockPlanDay {
  day_number: number
  delta_minutes: number
  enabled: boolean
}

export interface ShipClockEventRow {
  id: string
  effective_at_utc: string
  delta_minutes: number
  offset_minutes: number
  source: string
  schedule_key: string | null
  actor_id: string | null
  note: string | null
  client_request_id?: string | null
}

/** Draft / save row for the seven-day plan (preserves enabled vs zero-delta). */
export interface ShipClockPlanDraftDay {
  day_number: number
  delta_minutes: PlanDeltaChoice
  enabled: boolean
}

export interface AdminClockDiagnostics {
  actor_id: string | null
  state: ShipClockState
  plan: ShipClockPlanDay[]
  events: ShipClockEventRow[]
}

export type ClockFetchStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'

export type ManualCorrectionKind = 'minus_1h' | 'plus_1h' | 'set_time'

export interface ManualCorrectionIntent {
  kind: ManualCorrectionKind
  deltaMinutes?: 60 | -60
  targetShipLocal?: string
  clientRequestId?: string
}
