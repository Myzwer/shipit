import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHomeBountySync } from '@/lib/bounty/homeBountySync'
import type { HomeBountySnapshot } from '@/types/bountyHome'
import type { ShipClockState } from '@/types/shipClock'

function activeSnap(overrides: Partial<HomeBountySnapshot> = {}): HomeBountySnapshot {
  const clock: ShipClockState = {
    configured: true,
    at_utc: '2026-11-05T17:00:00.000Z',
    offset_minutes: -240,
    ship_local: '2099-01-03T13:00:00',
    ship_date: '2099-01-03',
    cruise_day: 1,
    lifecycle: 'active',
    games: {
      drinkit: { status: 'active', paused: false, finalized_at_utc: null },
      shipit: { status: 'active', paused: false, finalized_at_utc: null },
    },
  }
  return {
    cocktail: {
      status: 'active',
      offer_id: 'c-old',
      slot_key: 'cocktail:day:1:h13',
      drink_name: 'Old Drink',
      designated_bar_key: 'bar-a',
      designated_bar_name: 'Bar A',
      tier: 'familiar',
      points: 25,
      listed_ingredients: [],
      public_end_utc: '2026-11-05T18:00:00.000Z',
    },
    ingredient: {
      status: 'active',
      offer_id: 'i1',
      slot_key: 'ingredient:day:1:h12',
      ingredient_key: 'x',
      display_name: 'Ingredient X',
      tier: 'easy_to_find',
      points: 25,
      known_bar_count: 3,
      public_end_utc: '2026-11-05T19:00:00.000Z',
    },
    clock,
    fetchedAtMs: 1_000,
    serverAtUtc: clock.at_utc,
    ...overrides,
  }
}

describe('homeBountySync', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('K network failure clears active offers (no definite stale claim)', async () => {
    let calls = 0
    const fetchSnapshot = vi.fn(async () => {
      calls += 1
      if (calls === 1) return activeSnap()
      throw new Error('network down')
    })

    const sync = createHomeBountySync({
      fetchSnapshot,
      tickMs: 0,
      refreshMs: 0,
    })
    const snaps: string[] = []
    sync.subscribe((s) => {
      snaps.push(`${s.status}:${s.cocktail?.status ?? 'null'}`)
    })
    sync.start()
    await vi.waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(1))
    expect(sync.getSnapshot().cocktail?.status).toBe('active')

    await sync.refresh()
    expect(sync.getSnapshot().status).toBe('error')
    expect(sync.getSnapshot().cocktail).toBeNull()
    expect(sync.getSnapshot().cards.every((c) => c.presentation !== 'active')).toBe(true)
    sync.stop()
  })

  it('L rapid requests cannot apply older responses over newer offers', async () => {
    let resolveSlow: (v: HomeBountySnapshot) => void = () => {}
    const slow = new Promise<HomeBountySnapshot>((r) => {
      resolveSlow = r
    })

    const fetchSnapshot = vi
      .fn()
      .mockImplementationOnce(() => slow)
      .mockImplementationOnce(async () =>
        activeSnap({
          cocktail: {
            status: 'active',
            offer_id: 'c-new',
            slot_key: 'cocktail:day:1:h14',
            drink_name: 'New Drink',
            designated_bar_key: 'bar-b',
            designated_bar_name: 'Bar B',
            tier: 'interesting',
            points: 50,
            listed_ingredients: [],
            public_end_utc: '2026-11-05T19:00:00.000Z',
          },
        }),
      )

    const sync = createHomeBountySync({ fetchSnapshot, tickMs: 0, refreshMs: 0 })
    sync.start()
    // First refresh is in-flight (slow). Second refresh completes first.
    await sync.refresh()
    await vi.waitFor(() => expect(sync.getSnapshot().cocktail?.offer_id).toBe('c-new'))

    resolveSlow(
      activeSnap({
        cocktail: {
          status: 'active',
          offer_id: 'c-old',
          slot_key: 'cocktail:day:1:h13',
          drink_name: 'Old Drink',
          designated_bar_key: 'bar-a',
          designated_bar_name: 'Bar A',
          tier: 'familiar',
          points: 25,
          listed_ingredients: [],
          public_end_utc: '2026-11-05T18:00:00.000Z',
        },
      }),
    )
    await Promise.resolve()
    expect(sync.getSnapshot().cocktail?.offer_id).toBe('c-new')
    expect(sync.getSnapshot().cocktail?.drink_name).toBe('New Drink')
    sync.stop()
  })

  it('J visibility refresh requests authoritative state', async () => {
    const fetchSnapshot = vi.fn(async () => activeSnap())
    const sync = createHomeBountySync({ fetchSnapshot, tickMs: 0, refreshMs: 0 })
    sync.start()
    await vi.waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(1))

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2))
    sync.stop()
  })
})
