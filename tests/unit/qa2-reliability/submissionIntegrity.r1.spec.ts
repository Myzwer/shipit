/**
 * R1 / REP-SUB-001 — submission integrity regression (unit).
 * Covers in-flight coalesce, pending-key reuse after resetAll, and contract guards.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  clearPendingDrinkSubmit,
  readPendingDrinkSubmit,
  writePendingDrinkSubmit,
} from '@/lib/pendingDrinkSubmit'
import { useDrinkLogWizardStore } from '@/stores/drinkLogWizard'
import type { SubmitDrinkResult } from '@/types/drinkLog'

const ROOT = resolve(import.meta.dirname, '../../..')
function src(rel: string) {
  return readFileSync(resolve(ROOT, rel), 'utf8')
}

const submitDrink = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}))

vi.mock('@/lib/drinkLog/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/drinkLog/api')>('@/lib/drinkLog/api')
  return {
    ...actual,
    submitDrink: (...args: unknown[]) => submitDrink(...args),
    listDrinkitBars: vi.fn(async () => []),
    listDrinkitBarDrinks: vi.fn(async () => []),
    listDrinkitMobileOrderDrinks: vi.fn(async () => []),
    listDrinkitCompanions: vi.fn(async () => []),
    previewDrinkClaims: vi.fn(),
    fetchBarBountyReminder: vi.fn(async () => null),
  }
})

vi.mock('@/stores/session', () => ({
  useSessionStore: () => ({
    profile: { player_id: 'player-r1' },
  }),
}))

function accepted(id: string): SubmitDrinkResult {
  return {
    ok: true,
    code: 'ACCEPTED',
    submission_id: id,
    idempotent_replay: false,
  } as SubmitDrinkResult
}

describe('R1 contract: Daily/Scavenger in-flight guards', () => {
  it('Ship It scavenger performSubmit returns early if already submitting', () => {
    const body = src('src/features/shipit/ScavengerSubmitView.vue')
    const fn = body.slice(body.indexOf('async function performSubmit'))
    const head = fn.slice(0, 500)
    expect(head).toMatch(/if\s*\(\s*submitting\.value\s*\)\s*return/)
  })

  it('Drink It Daily performSubmit returns early if already submitting', () => {
    const body = src('src/features/drinkit/DailyClaimView.vue')
    const fn = body.slice(body.indexOf('async function performSubmit'))
    const head = fn.slice(0, 600)
    expect(head).toMatch(/if\s*\(\s*submitting\.value\s*\)\s*return/)
  })

  it('Drink It log still rejects / coalesces while submitting (BUSY or in-flight)', () => {
    const body = src('src/stores/drinkLogWizard.ts')
    expect(body).toMatch(/submitStatus\.value === 'submitting'/)
    expect(body).toMatch(/code:\s*'BUSY'/)
    expect(body).toMatch(/drinkSubmitInFlight/)
  })
})

describe('R1 drink submit remint / coalesce', () => {
  beforeEach(() => {
    localStorage.clear()
    clearPendingDrinkSubmit()
    submitDrink.mockReset()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    localStorage.clear()
    clearPendingDrinkSubmit()
  })

  function seedReview(store: ReturnType<typeof useDrinkLogWizardStore>) {
    store.active = true
    store.step = 'review'
    store.selectedBar = {
      bar_id: 'b1',
      canonical_key: 'test-bar',
      name: 'Test Bar',
      deck: 1,
      is_virtual: false,
    }
    store.selectedDrink = { mode: 'generic_beer', displayName: 'Beer' }
    store.caption = 'r1-unit'
    store.preview = { cruise_config_id: 'cruise-1' } as never
    store.previewStatus = 'ready'
    store.selectedClaims = []
  }

  it('1) double invoke during pending request coalesces to one RPC', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    submitDrink.mockImplementation(async (payload: Record<string, unknown>) => {
      await gate
      return {
        kind: 'confirmed',
        result: accepted(`sub-${payload.idempotency_key}`),
      }
    })

    const store = useDrinkLogWizardStore()
    seedReview(store)
    const a = store.performSubmit()
    const b = store.performSubmit()
    release()
    const [oa, ob] = await Promise.all([a, b])
    expect(submitDrink).toHaveBeenCalledTimes(1)
    expect(oa.kind).toBe('confirmed')
    expect(ob.kind).toBe('confirmed')
    expect(
      oa.kind === 'confirmed' && ob.kind === 'confirmed'
        ? oa.result.submission_id === ob.result.submission_id
        : false,
    ).toBe(true)
  })

  it('2+3) resetAll mid-flight then re-submit reuses in-flight (no remint)', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const keys: string[] = []
    submitDrink.mockImplementation(async (payload: Record<string, unknown>) => {
      keys.push(String(payload.idempotency_key))
      await gate
      return { kind: 'confirmed', result: accepted('sub-1') }
    })

    const store = useDrinkLogWizardStore()
    seedReview(store)
    const first = store.performSubmit()
    await Promise.resolve()
    const key1 = store.idempotencyKey
    expect(key1).toBeTruthy()
    expect(readPendingDrinkSubmit()?.clientRequestId).toBe(key1)

    store.resetAll()
    // Memory draft cleared, but in-flight key preserved.
    expect(store.submitStatus).toBe('submitting')
    expect(store.idempotencyKey).toBe(key1)

    seedReview(store)
    const second = store.performSubmit()
    release()
    const [o1, o2] = await Promise.all([first, second])
    expect(submitDrink).toHaveBeenCalledTimes(1)
    expect(keys).toEqual([key1])
    expect(o1.kind).toBe('confirmed')
    expect(o2.kind).toBe('confirmed')
  })

  it('4) lost success response retry reuses durable pending key', async () => {
    const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    writePendingDrinkSubmit({
      clientRequestId: key,
      playerId: 'player-r1',
      cruiseConfigId: 'cruise-1',
      payload: {
        idempotency_key: key,
        bar_canonical_key: 'test-bar',
        drink: { mode: 'generic_beer' },
        companion_player_ids: [],
        bar_eligible_companion_ids: [],
        selected_claims: [],
        caption: 'lost-response',
        photo_storage_key: null,
      },
      summary: { barName: 'Test Bar', drinkName: 'Beer' },
    })

    submitDrink.mockResolvedValue({
      kind: 'confirmed',
      result: { ...accepted('sub-replay'), idempotent_replay: true },
    })

    const store = useDrinkLogWizardStore()
    // No memory draft — recovery path uses durable pending payload.
    store.active = true
    store.step = 'review'
    store.formLockedForUnknown = false
    const outcome = await store.performSubmit()
    expect(submitDrink).toHaveBeenCalledTimes(1)
    expect(submitDrink.mock.calls[0][0].idempotency_key).toBe(key)
    expect(outcome.kind).toBe('confirmed')
  })

  it('7) backend rejection then valid retry mints a new key', async () => {
    submitDrink
      .mockResolvedValueOnce({
        kind: 'rejected',
        result: { ok: false, code: 'GAME_PAUSED', message: 'paused' },
      })
      .mockResolvedValueOnce({ kind: 'confirmed', result: accepted('sub-2') })

    const store = useDrinkLogWizardStore()
    seedReview(store)
    const first = await store.performSubmit()
    expect(first.kind).toBe('rejected')
    expect(store.idempotencyKey).toBeNull()
    expect(readPendingDrinkSubmit()).toBeNull()

    seedReview(store)
    const second = await store.performSubmit()
    expect(second.kind).toBe('confirmed')
    expect(submitDrink).toHaveBeenCalledTimes(2)
    const k1 = submitDrink.mock.calls[0][0].idempotency_key
    const k2 = submitDrink.mock.calls[1][0].idempotency_key
    expect(k1).not.toBe(k2)
  })

  it('success short-circuits further performSubmit until reset', async () => {
    submitDrink.mockResolvedValue({ kind: 'confirmed', result: accepted('sub-ok') })
    const store = useDrinkLogWizardStore()
    seedReview(store)
    await store.performSubmit()
    expect(store.submitStatus).toBe('success')
    await store.performSubmit()
    expect(submitDrink).toHaveBeenCalledTimes(1)
  })
})
