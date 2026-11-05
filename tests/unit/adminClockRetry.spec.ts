import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc },
}))

describe('applyManualCorrection unknown outcomes', () => {
  beforeEach(() => {
    rpc.mockReset()
    vi.resetModules()
  })

  const beforeState = {
    configured: true,
    at_utc: '2026-01-01T00:00:00Z',
    offset_minutes: -240,
    ship_local: '2099-01-03T12:00:00',
    lifecycle: 'pre_cruise' as const,
  }

  it('mutation ok + diagnostics fail still returns confirmed ok', async () => {
    const { applyManualCorrection } = await import('@/lib/adminClock')

    rpc
      .mockResolvedValueOnce({
        data: { actor_id: null, state: beforeState, plan: [], events: [] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { event_id: 'evt-1', after: { ...beforeState, offset_minutes: -180 }, before: beforeState },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })

    const result = await applyManualCorrection(
      { kind: 'plus_1h', deltaMinutes: 60 },
      { clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    )
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.after.offset_minutes).toBe(-180)
      expect(result.clientRequestId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    }
  })

  it('lost mutation response yields UNKNOWN, not Change Not Saved', async () => {
    const { applyManualCorrection } = await import('@/lib/adminClock')
    const req = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

    rpc
      .mockResolvedValueOnce({
        data: { actor_id: null, state: beforeState, plan: [], events: [] },
        error: null,
      })
      // apply transport failure
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
      // find by request id — not found
      .mockResolvedValueOnce({ data: null, error: null })
      // diagnostics refresh
      .mockResolvedValueOnce({
        data: { actor_id: null, state: beforeState, plan: [], events: [] },
        error: null,
      })

    const result = await applyManualCorrection(
      { kind: 'minus_1h', deltaMinutes: -60 },
      { clientRequestId: req },
    )
    expect(result.status).toBe('unknown')
    if (result.status === 'unknown') {
      expect(result.message).not.toMatch(/didn't save/i)
      expect(result.clientRequestId).toBe(req)
    }
  })

  it('reconcile finds request id and confirms success without re-applying', async () => {
    const { reconcileManualCorrection } = await import('@/lib/adminClock')
    const req = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const afterState = { ...beforeState, offset_minutes: -180 }

    rpc
      .mockResolvedValueOnce({
        data: { id: 'evt', client_request_id: req, delta_minutes: 60, offset_minutes: -180, source: 'manual_delta' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          actor_id: null,
          state: afterState,
          plan: [],
          events: [{ id: 'evt', client_request_id: req }],
        },
        error: null,
      })

    const result = await reconcileManualCorrection(
      req,
      { kind: 'plus_1h', deltaMinutes: 60 },
      beforeState,
    )
    expect(result.status).toBe('ok')
    // Only find + diagnostics — no apply RPC.
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      'admin_find_clock_event_by_request_id',
      'admin_get_clock_diagnostics',
    ])
  })

  it('confirmed server rejection returns failed', async () => {
    const { applyManualCorrection } = await import('@/lib/adminClock')

    rpc
      .mockResolvedValueOnce({
        data: { actor_id: null, state: beforeState, plan: [], events: [] },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: 'ADMIN_REQUIRED' } })

    const result = await applyManualCorrection(
      { kind: 'plus_1h', deltaMinutes: 60 },
      { clientRequestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
    )
    expect(result.status).toBe('failed')
  })
})
