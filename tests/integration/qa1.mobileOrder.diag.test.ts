/**
 * QA-1 diagnostic — capture MO solo reject payloads (lido offering vs MO list offering).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertDisposableDevEnvironment } from '../helpers/devEnvironmentGuard'
import { DEV_BASE_OFFSET_MIN, DEV_DAY1, noonDay1Utc } from '../helpers/bountyFixtures'
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
import { ensureSyntheticRoleIdentities } from '../helpers/syntheticRoles'
import { MOBILE_ORDER_BAR_KEY } from '@/types/drinkLog'

let fixtures: LocalFixtures
let service: SupabaseClient
let drinkClient: SupabaseClient

beforeAll(async () => {
  const base = await loadLocalFixtures()
  fixtures = await ensureSyntheticRoleIdentities(base)
  service = createLocalClient(fixtures.summary!.supabase_url, fixtures.serviceRoleKey!)
  await assertDisposableDevEnvironment(fixtures, service)
  const { error } = await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: DEV_DAY1,
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
  drinkClient = await signInAs(fixtures, 'drink_only')
}, 120_000)

describe('QA-1 Mobile Order submit diagnostics', () => {
  it('compares lido offering vs MO-list offering for solo log', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(service, at)
    const author = playerId(fixtures, 'drink_only')
    const listed = await drinkClient.rpc('list_drinkit_mobile_order_drinks')
    const moOffering = (listed.data as Array<{ offering_id: string }>)[0]?.offering_id
    let lidoOffering: string | null
    try {
      lidoOffering = (await lookupOffering(service, 'lido-bar', 'tropical-alibi')).offering_id
    } catch {
      lidoOffering = null
    }

    const resLido = lidoOffering
      ? await submitAt(
          service,
          author,
          drinkPayload({
            barKey: MOBILE_ORDER_BAR_KEY,
            offeringId: lidoOffering,
            companions: [],
            caption: 'qa1-mo-lido',
          }),
          at,
        )
      : { error: null, data: { skipped: true } }

    const resMo = await submitAt(
      service,
      author,
      drinkPayload({
        barKey: MOBILE_ORDER_BAR_KEY,
        offeringId: moOffering,
        companions: [],
        caption: 'qa1-mo-list',
      }),
      at,
    )

    console.log(
      'QA1_MO_DIAG',
      JSON.stringify({
        lidoOffering,
        moOffering,
        lido: resLido.data,
        moList: resMo.data,
        lidoErr: resLido.error,
        moErr: resMo.error,
      }),
    )
    expect(moOffering).toBeTruthy()
  })
})
