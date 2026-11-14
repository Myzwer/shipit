/**
 * QA-2 Agent 2 — submitDrink unknown vs confirmed classification (mocked RPC).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))

import { submitDrink } from '@/lib/drinkLog/api'

describe('QA2 submitDrink outcome classification', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('returns confirmed only when result.ok === true', async () => {
    rpc.mockResolvedValue({ data: { ok: true, submission_id: 's1' }, error: null })
    const outcome = await submitDrink({ idempotency_key: 'k' })
    expect(outcome).toEqual({
      kind: 'confirmed',
      result: { ok: true, submission_id: 's1' },
    })
  })

  it('returns rejected for deterministic server denial (not success)', async () => {
    rpc.mockResolvedValue({
      data: { ok: false, code: 'GAME_PAUSED', message: 'Paused' },
      error: null,
    })
    const outcome = await submitDrink({ idempotency_key: 'k' })
    expect(outcome.kind).toBe('rejected')
    if (outcome.kind === 'rejected') {
      expect(outcome.result.code).toBe('GAME_PAUSED')
    }
  })

  it('returns unknown for network-ish Postgrest errors', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Failed to fetch', code: '' },
    })
    const outcome = await submitDrink({ idempotency_key: 'k' })
    expect(outcome.kind).toBe('unknown')
  })

  it('returns unknown for thrown errors (lost response / offline)', async () => {
    rpc.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'))
    const outcome = await submitDrink({ idempotency_key: 'k' })
    expect(outcome.kind).toBe('unknown')
  })

  it('does not treat ok:false with HTTP 200 as confirmed success', async () => {
    rpc.mockResolvedValue({
      data: { ok: false, code: 'ELIGIBILITY_CHANGED' },
      error: null,
    })
    const outcome = await submitDrink({ idempotency_key: 'k' })
    expect(outcome.kind).not.toBe('confirmed')
  })
})
