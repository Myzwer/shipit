/**
 * QA3A — applyBountySkip RPC error classification.
 *
 * MOCKED supabase.rpc only. No backend integration is claimed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}))

import { applyBountySkip } from '@/lib/adminBountySkip'

const REQ = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('[MOCKED RPC] adminBountySkip.applyBountySkip error classification', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  // ADM-003 (intentional defect probe)
  it.each(['Bad Gateway', 'HTTP 502'])(
    'A) gateway-style error "%s" must be unknown so pending is not cleared',
    async (message) => {
      rpc.mockResolvedValue({ data: null, error: { message } })
      const out = await applyBountySkip('cocktail', 'offer-1', REQ)
      // Current code only treats fetch/network/timeout/abort keywords as unknown -> 'failed'. Defect.
      expect(out.status).toBe('unknown')
    },
  )

  it('B) "Failed to fetch" returns unknown', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    const out = await applyBountySkip('cocktail', 'offer-1', REQ)
    expect(out.status).toBe('unknown')
  })

  it('C) result ok:false with NO_RESERVES returns failed / no_reserves', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'admin_skip_current_bounty') {
        return { data: { ok: false, code: 'NO_RESERVES' }, error: null }
      }
      // fetchBountySkipStatus refresh (optional)
      return { data: { ok: true, categories: {} }, error: null }
    })
    const out = await applyBountySkip('ingredient', 'offer-2', REQ)
    expect(out.status).toBe('failed')
    if (out.status === 'failed') expect(out.code).toBe('no_reserves')
  })
})
