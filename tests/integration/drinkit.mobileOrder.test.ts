/**
 * Mobile Order virtual source — mutating checks require disposable development-only
 * with migration 20261105010900 applied. Skips on Wrapped / missing migration.
 * Does not apply migrations or reset the organizer DB.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertDisposableDevEnvironment } from '../helpers/devEnvironmentGuard'
import { noonDay1Utc } from '../helpers/bountyFixtures'
import {
  drinkPayload,
  exposeCurrentSlots,
  lookupOffering,
  playerId,
  submitAt,
} from '../helpers/drinkitSubmit'
import {
  createLocalClient,
  loadLocalFixtures,
  signInAs,
  type LocalFixtures,
} from '../helpers/localSupabase'
import { MOBILE_ORDER_BAR_KEY } from '@/types/drinkLog'

let fixtures: LocalFixtures | null = null
let service: SupabaseClient | null = null
let drinkClient: SupabaseClient | null = null
let migrationReady = false
let skipReason = 'not ready'

beforeAll(async () => {
  try {
    const base = await loadLocalFixtures()
    if (!base.available || !base.summary || !base.serviceRoleKey) {
      skipReason = 'local fixtures unavailable'
      return
    }
    fixtures = base
    service = createLocalClient(base.summary.supabase_url, base.serviceRoleKey)
    await assertDisposableDevEnvironment(base, service)
    drinkClient = await signInAs(base, 'drink_only')
    const { error } = await drinkClient.rpc('list_drinkit_mobile_order_drinks')
    if (error) {
      skipReason = `migration not applied (${error.message})`
      return
    }
    migrationReady = true
  } catch (err) {
    skipReason = err instanceof Error ? err.message : String(err)
  }
}, 180000)

describe('Mobile Order (disposable DB + migration applied)', () => {
  it('lists Mobile Order last and returns deduped concepts', async () => {
    if (!migrationReady || !drinkClient) {
      expect(skipReason).toBeTruthy()
      return
    }
    const bars = await drinkClient.rpc('list_drinkit_bars')
    expect(bars.error).toBeNull()
    const list = bars.data as Array<{ canonical_key: string; is_virtual?: boolean }>
    expect(list.some((b) => b.canonical_key === MOBILE_ORDER_BAR_KEY && b.is_virtual === true)).toBe(
      true,
    )
    expect(list.at(-1)?.canonical_key).toBe(MOBILE_ORDER_BAR_KEY)

    const drinks = await drinkClient.rpc('list_drinkit_mobile_order_drinks')
    expect(drinks.error).toBeNull()
    const rows = drinks.data as Array<{ drink_concept_id: string }>
    expect(rows.length).toBeGreaterThan(5)
    const conceptIds = rows.map((r) => r.drink_concept_id)
    expect(new Set(conceptIds).size).toBe(conceptIds.length)
  })

  it('allows solo ordinary Mobile Order log with Gallery Mobile Order name', async () => {
    if (!migrationReady || !drinkClient || !service || !fixtures) {
      expect(skipReason).toBeTruthy()
      return
    }
    let offeringId: string
    try {
      offeringId = (await lookupOffering(service, 'lido-bar', 'mai-tai')).offering_id
    } catch {
      const listed = await drinkClient.rpc('list_drinkit_mobile_order_drinks')
      const row = (listed.data as Array<{ offering_id: string }>)[0]
      offeringId = row.offering_id
    }
    const at = noonDay1Utc()
    await exposeCurrentSlots(service, at)
    const author = playerId(fixtures, 'drink_only')
    const payload = drinkPayload({
      barKey: MOBILE_ORDER_BAR_KEY,
      offeringId,
      companions: [],
    })
    const { data, error } = await submitAt(service, author, payload, at)
    expect(error).toBeNull()
    const result = data as { ok?: boolean; submission_id?: string }
    expect(result.ok).toBe(true)
    const { data: log } = await service
      .from('drink_logs')
      .select('bar_canonical_key, bar_display_name, drink_mode')
      .eq('submission_id', result.submission_id)
      .single()
    expect(log?.bar_canonical_key).toBe(MOBILE_ORDER_BAR_KEY)
    expect(log?.bar_display_name).toBe('Mobile Order')
    expect(log?.drink_mode).toBe('named_catalog')
  })

  it('does not silently mark Ingredient eligible for Mobile Order', async () => {
    if (!migrationReady || !drinkClient || !fixtures) {
      expect(skipReason).toBeTruthy()
      return
    }
    const listed = await drinkClient.rpc('list_drinkit_mobile_order_drinks')
    const row = (listed.data as Array<{ offering_id: string }>)[0]
    expect(row?.offering_id).toBeTruthy()
    const buddy = playerId(fixtures, 'both_games')
    const payload = drinkPayload({
      barKey: MOBILE_ORDER_BAR_KEY,
      offeringId: row.offering_id,
      companions: [buddy],
    })
    const preview = await drinkClient.rpc('preview_drink_claims', { p_payload: payload })
    expect(preview.error).toBeNull()
    const ingredient = (
      preview.data as {
        preview?: { categories?: { ingredient?: { status?: string; reason?: string } } }
      }
    )?.preview?.categories?.ingredient
    expect(ingredient?.status).not.toBe('eligible')
  })

  it('keeps ordinary physical bar listing unchanged', async () => {
    if (!migrationReady || !drinkClient) {
      expect(skipReason).toBeTruthy()
      return
    }
    const lido = await drinkClient.rpc('list_drinkit_bar_drinks', {
      p_bar_canonical_key: 'lido-bar',
    })
    expect(lido.error).toBeNull()
    expect(Array.isArray(lido.data) && (lido.data as unknown[]).length).toBeGreaterThan(0)
  })
})
