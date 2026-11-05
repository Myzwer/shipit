import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))

import {
  applyDrinkItPaused,
  reconcileDrinkItPause,
} from '@/lib/adminPause'

describe('adminPause reconcile (mocked)', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('12 failed reconciliation never claims ok', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    const outcome = await reconcileDrinkItPause(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      true,
    )
    expect(outcome.status).toBe('unknown')
  })

  it('11 successful ledger + status clears path to ok', async () => {
    rpc
      .mockResolvedValueOnce({
        data: {
          client_request_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          fingerprint: 'drinkit_paused:true',
          desired_paused: true,
          paused: true,
          status: 'paused',
          changed: true,
          paused_at_utc: '2099-01-01T00:00:00Z',
          finalized_at_utc: null,
          cruise_config_id: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          cruise_config_id: null,
          drinkit: {
            status: 'paused',
            paused: true,
            paused_at_utc: '2099-01-01T00:00:00Z',
            finalized_at_utc: null,
          },
          shipit: { status: 'active', paused: false, finalized_at_utc: null },
        },
        error: null,
      })

    const outcome = await reconcileDrinkItPause(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      true,
    )
    expect(outcome.status).toBe('ok')
    if (outcome.status === 'ok') {
      expect(outcome.result.paused).toBe(true)
    }
  })

  it('matching live status alone is not success without ledger row', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          drinkit: {
            status: 'paused',
            paused: true,
            paused_at_utc: '2099-01-01T00:00:00Z',
            finalized_at_utc: null,
          },
          shipit: { status: 'active', paused: false, finalized_at_utc: null },
        },
        error: null,
      })
    const outcome = await reconcileDrinkItPause(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      true,
    )
    expect(outcome.status).toBe('unknown')
  })

  it('1/2 apply transport loss then status failure stays unknown', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
    const outcome = await applyDrinkItPaused(true, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(outcome.status).toBe('unknown')
  })

  it('confirmed finale is failed (not unknown Change Not Saved ambiguity)', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'FINALE_LOCKED' } })
      .mockResolvedValueOnce({
        data: {
          drinkit: {
            status: 'final',
            paused: false,
            paused_at_utc: null,
            finalized_at_utc: '2099-01-09T22:00:00Z',
          },
          shipit: {
            status: 'final',
            paused: false,
            finalized_at_utc: '2099-01-09T22:00:00Z',
          },
        },
        error: null,
      })
    const outcome = await applyDrinkItPaused(false, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') expect(outcome.code).toBe('finale')
  })
})
