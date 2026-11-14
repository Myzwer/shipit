/**
 * QA3A — applyVoidSubmission RPC error classification.
 *
 * MOCKED supabase.rpc only. No backend integration is claimed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}))

import { applyVoidSubmission } from '@/lib/adminVoid'

const INPUT = {
  clientRequestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  submissionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  expectedStatus: 'active',
  reason: 'Lorem ipsum',
}

describe('[MOCKED RPC] adminVoid.applyVoidSubmission error classification', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  // ADM-004 (intentional defect probe)
  it.each([
    { message: 'FINALE_LOCKED', code: 'P0001' },
    { message: 'SUBMISSION_NOT_FOUND', code: 'P0002' },
  ])(
    'A) deterministic server rejection "$message" should be failed (confirmed), not unknown',
    async (error) => {
      rpc.mockResolvedValue({ data: null, error })
      const out = await applyVoidSubmission(INPUT)
      // Current code: only /ADMIN_REQUIRED/ is failed; everything else -> 'unknown'. Defect.
      expect(out.status).toBe('failed')
    },
  )

  it('B) ADMIN_REQUIRED -> failed / forbidden', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'ADMIN_REQUIRED' } })
    const out = await applyVoidSubmission(INPUT)
    expect(out.status).toBe('failed')
    if (out.status === 'failed') expect(out.code).toBe('forbidden')
  })

  it('C) data ok:true -> ok', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, voided: true, submission_id: INPUT.submissionId },
      error: null,
    })
    const out = await applyVoidSubmission(INPUT)
    expect(out.status).toBe('ok')
  })
})
