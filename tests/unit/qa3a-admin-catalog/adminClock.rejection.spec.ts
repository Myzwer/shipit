/**
 * QA3A — Ship Clock rejection classification + UI recovery contract.
 *
 * `isConfirmedRejection` is NOT exported from adminClock.ts, so:
 *  - the regex is asserted via source text (contract), and
 *  - behavior is exercised through applyManualCorrection with a MOCKED supabase.rpc.
 * No backend integration is claimed.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-access-token' } },
        error: null,
      }),
    },
  },
}))

import { applyManualCorrection, intentFingerprint } from '@/lib/adminClock'
import type { ManualCorrectionIntent } from '@/types/shipClock'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

describe('adminClock isConfirmedRejection (source contract)', () => {
  const src = read('src/lib/adminClock.ts')

  it('A) is not exported and is message-regex based with a fixed allowlist', () => {
    expect(src).not.toMatch(/export\s+function\s+isConfirmedRejection/)
    expect(src).toContain(
      'ADMIN_REQUIRED|INVALID_|MANUAL_DELTA|NO_ACTIVE|PLAN_MUST|DUPLICATE_PLAN|REQUEST_ID_OPERATION_MISMATCH|42501|permission|JWT',
    )
  })
})

describe('[MOCKED RPC] adminClock.applyManualCorrection unlisted server error (characterization)', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('unlisted deterministic error "malformed timestamp" is NOT treated as confirmed rejection -> unknown via reconcile', async () => {
    const diag = { actor_id: null, state: { configured: true }, plan: [], events: [] }
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'admin_get_clock_diagnostics') return { data: diag, error: null }
      if (fn === 'admin_apply_manual_clock_set') {
        return { data: null, error: { message: 'malformed timestamp' } }
      }
      if (fn === 'admin_find_clock_event_by_request_id') return { data: null, error: null }
      return { data: null, error: null }
    })
    const out = await applyManualCorrection({
      kind: 'set_time',
      targetShipLocal: 'not-a-timestamp',
    } as ManualCorrectionIntent)
    // Documents current behavior: pending lock persists for a deterministic server error.
    expect(out.status).toBe('unknown')
  })
})

describe('ShipClockSection.confirmManual recovery (source contract)', () => {
  const vue = read('src/features/admin/ShipClockSection.vue')

  function fnBody(name: string, nextName: string): string {
    const start = vue.indexOf(`async function ${name}(`)
    const end = vue.indexOf(`async function ${nextName}(`, start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    return vue.slice(start, end)
  }

  // ADM-005 (intentional defect probe)
  it('B) confirmManual body has a catch clause (UI must recover if applyManualCorrection throws)', () => {
    const body = fnBody('confirmManual', 'confirmPlan')
    // Current code: try { ... } finally { busy = false } with no catch -> unhandled rejection,
    // persisted pending stays with no feedback. Defect.
    expect(body).toMatch(/\bcatch\b/)
  })
})

describe('adminClock.intentFingerprint', () => {
  it('C) ±60 delta fingerprints', () => {
    expect(intentFingerprint({ kind: 'plus_1h', deltaMinutes: 60 } as ManualCorrectionIntent)).toBe(
      'manual_delta:60',
    )
    expect(
      intentFingerprint({ kind: 'minus_1h', deltaMinutes: -60 } as ManualCorrectionIntent),
    ).toBe('manual_delta:-60')
  })

  it('C) invalid delta returns null', () => {
    expect(intentFingerprint({ kind: 'plus_1h', deltaMinutes: 30 } as ManualCorrectionIntent)).toBeNull()
  })

  it('C) set_time fingerprint normalizes space to T', () => {
    expect(
      intentFingerprint({
        kind: 'set_time',
        targetShipLocal: '2026-01-05 10:30:00',
      } as ManualCorrectionIntent),
    ).toBe('manual_set:2026-01-05T10:30:00')
  })

  it('C) set_time without target returns null', () => {
    expect(intentFingerprint({ kind: 'set_time' } as ManualCorrectionIntent)).toBeNull()
  })
})
