/**
 * Organizer Skip Current Cocktail / Ingredient — unused reserve replacement.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export class AdminBountySkipError extends Error {
  code: 'unavailable' | 'error' | 'forbidden' | 'finale' | 'mismatch' | 'stale' | 'no_reserves'

  constructor(
    message: string,
    code:
      | 'unavailable'
      | 'error'
      | 'forbidden'
      | 'finale'
      | 'mismatch'
      | 'stale'
      | 'no_reserves' = 'error',
  ) {
    super(message)
    this.name = 'AdminBountySkipError'
    this.code = code
  }
}

export type BountySkipCategory = 'cocktail' | 'ingredient'

export interface BountySkipCategoryStatus {
  category: BountySkipCategory
  ok: boolean
  display_name: string | null
  offer_id: string | null
  slot_key: string | null
  public_end_utc: string | null
  replacements_remaining: number
  can_skip: boolean
  skip_blocked_reason: string | null
  paused?: boolean
}

export interface BountySkipStatus {
  ok: boolean
  cruise_config_id?: string | null
  categories: {
    cocktail?: BountySkipCategoryStatus
    ingredient?: BountySkipCategoryStatus
  }
}

export interface BountySkipResult {
  ok: boolean
  code?: string
  message?: string
  category?: string
  slot_id?: string
  slot_key?: string
  retired_offer_id?: string
  replacement_offer_id?: string
  public_end_utc?: string
  display?: Record<string, unknown>
  replacements_remaining?: number
  client_request_id?: string
  idempotent_replay?: boolean
  [key: string]: unknown
}

export type BountySkipApplyResult =
  | {
      status: 'ok'
      result: BountySkipResult
      skipStatus?: BountySkipStatus
      clientRequestId: string
      category: BountySkipCategory
    }
  | {
      status: 'failed'
      message: string
      code: AdminBountySkipError['code']
      clientRequestId: string
      category: BountySkipCategory
      skipStatus?: BountySkipStatus
      result?: BountySkipResult
    }
  | {
      status: 'unknown'
      message: string
      clientRequestId: string
      category: BountySkipCategory
      skipStatus?: BountySkipStatus
    }

export function newBountySkipRequestId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`.slice(0, 36)
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new AdminBountySkipError('Supabase is not configured.', 'unavailable')
  }
  return supabase
}

function mapCode(code: string | undefined, message: string): AdminBountySkipError['code'] {
  if (/ADMIN_REQUIRED|NOT_AUTHENTICATED/i.test(message) || code === 'ADMIN_REQUIRED') {
    return 'forbidden'
  }
  if (code === 'FINALE_LOCKED' || /FINALE/i.test(message)) return 'finale'
  if (code === 'REQUEST_ID_OPERATION_MISMATCH') return 'mismatch'
  if (code === 'STALE_OFFER') return 'stale'
  if (code === 'NO_RESERVES') return 'no_reserves'
  return 'error'
}

function isTransportOrUnknown(message: string): boolean {
  return /failed to fetch|network|timeout|abort|load failed|fetch/i.test(message)
}

async function rpc(fn: string, args?: Record<string, unknown>) {
  return client().rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

export async function fetchBountySkipStatus(): Promise<BountySkipStatus> {
  const { data, error } = await rpc('admin_get_bounty_skip_status')
  if (error) throw new AdminBountySkipError(error.message ?? '', 'error')
  return data as BountySkipStatus
}

export async function findBountySkipRequest(clientRequestId: string): Promise<BountySkipResult | null> {
  const { data, error } = await rpc('admin_find_bounty_skip_request_by_id', {
    p_client_request_id: clientRequestId,
  })
  if (error) throw new AdminBountySkipError(error.message ?? '', mapCode(undefined, error.message ?? ''))
  if (!data) return null
  return data as BountySkipResult
}

export async function applyBountySkip(
  category: BountySkipCategory,
  expectedOfferId: string,
  clientRequestId: string,
): Promise<BountySkipApplyResult> {
  try {
    const { data, error } = await rpc('admin_skip_current_bounty', {
      p_category: category,
      p_expected_offer_id: expectedOfferId,
      p_client_request_id: clientRequestId,
    })
    if (error) {
      if (isTransportOrUnknown(error.message ?? '')) {
        return {
          status: 'unknown',
          message: error.message ?? 'Network error',
          clientRequestId,
          category,
        }
      }
      return {
        status: 'failed',
        message: error.message ?? 'Skip failed',
        code: mapCode(undefined, error.message ?? ''),
        clientRequestId,
        category,
      }
    }
    const result = (data ?? {}) as BountySkipResult
    let skipStatus: BountySkipStatus | undefined
    try {
      skipStatus = await fetchBountySkipStatus()
    } catch {
      /* status refresh optional after mutate */
    }
    if (result.ok === true) {
      return { status: 'ok', result, skipStatus, clientRequestId, category }
    }
    return {
      status: 'failed',
      message: result.message ?? result.code ?? 'Skip failed',
      code: mapCode(result.code, result.message ?? ''),
      clientRequestId,
      category,
      skipStatus,
      result,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isTransportOrUnknown(message)) {
      return { status: 'unknown', message, clientRequestId, category }
    }
    return {
      status: 'failed',
      message,
      code: mapCode(undefined, message),
      clientRequestId,
      category,
    }
  }
}

/** Reconcile after unknown: prefer durable request ledger, then retry same id. */
export async function reconcileBountySkip(
  clientRequestId: string,
  category: BountySkipCategory,
  expectedOfferId: string,
): Promise<BountySkipApplyResult> {
  try {
    const found = await findBountySkipRequest(clientRequestId)
    if (found) {
      let skipStatus: BountySkipStatus | undefined
      try {
        skipStatus = await fetchBountySkipStatus()
      } catch {
        /* ignore */
      }
      if (found.ok === true) {
        return {
          status: 'ok',
          result: found,
          skipStatus,
          clientRequestId,
          category,
        }
      }
      return {
        status: 'failed',
        message: found.message ?? found.code ?? 'Skip failed',
        code: mapCode(found.code, found.message ?? ''),
        clientRequestId,
        category,
        skipStatus,
        result: found,
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isTransportOrUnknown(message)) {
      return { status: 'unknown', message, clientRequestId, category }
    }
  }
  return applyBountySkip(category, expectedOfferId, clientRequestId)
}
