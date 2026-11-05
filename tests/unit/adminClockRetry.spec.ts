import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc },
}))

describe('applyManualCorrection retry ambiguity', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('returns ambiguous when offset changed after a failed apply', async () => {
    const { applyManualCorrection } = await import('@/lib/adminClock')

    const beforeState = {
      configured: true,
      at_utc: '2026-01-01T00:00:00Z',
      offset_minutes: -240,
      ship_local: '2099-01-03T12:00:00',
      lifecycle: 'pre_cruise',
    }
    const afterState = { ...beforeState, offset_minutes: -180, ship_local: '2099-01-03T13:00:00' }

    rpc
      // fetchAdminClockDiagnostics (before)
      .mockResolvedValueOnce({ data: { actor_id: null, state: beforeState, plan: [], events: [] }, error: null })
      // apply fails (network / rpc)
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
      // fetchAdminClockDiagnostics (reconcile) — offset moved
      .mockResolvedValueOnce({ data: { actor_id: null, state: afterState, plan: [], events: [] }, error: null })

    const result = await applyManualCorrection({ kind: 'plus_1h', deltaMinutes: 60 })
    expect(result.status).toBe('ambiguous')
    if (result.status === 'ambiguous') {
      expect(result.diagnostics.state.offset_minutes).toBe(-180)
    }
  })

  it('returns failed when offset unchanged after error (safe to retry intent)', async () => {
    const { applyManualCorrection } = await import('@/lib/adminClock')

    const beforeState = {
      configured: true,
      at_utc: '2026-01-01T00:00:00Z',
      offset_minutes: -240,
      ship_local: '2099-01-03T12:00:00',
      lifecycle: 'pre_cruise',
    }

    rpc
      .mockResolvedValueOnce({ data: { actor_id: null, state: beforeState, plan: [], events: [] }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
      .mockResolvedValueOnce({ data: { actor_id: null, state: beforeState, plan: [], events: [] }, error: null })

    const result = await applyManualCorrection({ kind: 'minus_1h', deltaMinutes: -60 })
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.intent.deltaMinutes).toBe(-60)
    }
  })
})
