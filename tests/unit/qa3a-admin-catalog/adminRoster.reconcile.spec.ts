/**
 * QA3A — Admin roster reconcile / createPlayer diagnostics.
 *
 * MOCKED supabase client only (rpc + functions.invoke). No backend integration is claimed.
 * Intentional failures document defects; do not "fix" them here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const invoke = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}))

import { createPlayer, reconcileAuthRequest } from '@/lib/adminRoster'

const REQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const CREATE_INPUT = {
  clientRequestId: REQ,
  displayName: 'John LastName',
  password: 'lorem-ipsum-placeholder-pw',
  drinkitEnabled: true,
  shipitEnabled: true,
  teamId: null,
}

describe('[MOCKED RPC] adminRoster.reconcileAuthRequest', () => {
  beforeEach(() => {
    rpc.mockReset()
    invoke.mockReset()
  })

  // ADM-001 (intentional defect probe)
  it('A) in_progress ledger row without ok:true stays unknown so Check Status can retry', async () => {
    rpc.mockResolvedValue({ data: { status: 'in_progress' }, error: null })
    const out = await reconcileAuthRequest(REQ)
    expect(rpc).toHaveBeenCalledWith('admin_find_roster_auth_request_by_id', {
      p_client_request_id: REQ,
    })
    // Current code: missing `ok` is mapped via asFailed -> 'failed' (clears pending). Defect.
    expect(out.status).toBe('unknown')
  })

  it('C) ok:true ledger row reconciles to ok', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, player_id: 'p1', display_name: 'John LastName' },
      error: null,
    })
    const out = await reconcileAuthRequest(REQ)
    expect(out.status).toBe('ok')
    expect(out.clientRequestId).toBe(REQ)
  })

  it('D) missing ledger row (null data) stays unknown', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const out = await reconcileAuthRequest(REQ)
    expect(out.status).toBe('unknown')
  })
})

describe('[MOCKED functions.invoke] adminRoster.createPlayer', () => {
  beforeEach(() => {
    rpc.mockReset()
    invoke.mockReset()
  })

  // ADM-002 (intentional defect probe)
  it('B) HTTP 409 OPERATION_IN_PROGRESS must be unknown (request may still complete), not failed', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 409,
          json: async () => ({ ok: false, code: 'OPERATION_IN_PROGRESS' }),
        },
      },
    })
    const out = await createPlayer(CREATE_INPUT)
    // Current code: 4xx + body -> asFailed -> 'failed' (pending cleared, retry id lost). Defect.
    expect(out.status).toBe('unknown')
  })
})
