/**
 * R5 / REP-SCHED-001 — production Admin bounty schedule initialization.
 * Requires disposable :55321. Never mutates organizer. Never uses QA_ALLOW_ORGANIZER_MUTATION=1.
 * Proves schedule generation without calling dev_generate_bounty_schedule.
 */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { buildScheduleReadyCatalog } from '../fixtures/catalog/builders'

const API_URL = process.env.VITE_SUPABASE_URL || ''
const ANON = process.env.VITE_SUPABASE_ANON_KEY || ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const PASSWORD = process.env.LOCAL_TEST_PASSWORD || ''

const isDisposable = API_URL.includes(':55321') && !API_URL.includes(':54321') && !API_URL.includes(':56321')
const canRun = Boolean(isDisposable && ANON && SERVICE && PASSWORD)

function requireDisposable() {
  if (process.env.QA_ALLOW_ORGANIZER_MUTATION === '1') {
    throw new Error('REFUSE: QA_ALLOW_ORGANIZER_MUTATION must not be set')
  }
  if (!canRun) {
    throw new Error('R5 integration requires disposable :55321 env + LOCAL_TEST_PASSWORD')
  }
}

async function clearScheduleLedger(service: SupabaseClient) {
  // Ensure development-only so the disposable clear helper is allowed.
  await service
    .from('cruise_config')
    .update({ label: 'development-only' })
    .eq('is_active', true)
  const { error } = await service.rpc('dev_clear_bounty_schedule_ledger')
  if (error) throw error
}

describe.skipIf(!canRun)('R5 production schedule initialization (disposable)', () => {
  let service: SupabaseClient
  let admin: SupabaseClient
  let drinkPlayer: SupabaseClient
  let cruiseId: string
  let adminEmail = ''
  let drinkEmail = ''

  beforeAll(async () => {
    requireDisposable()
    service = createClient(API_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: cruise, error } = await service
      .from('cruise_config')
      .select('id, label')
      .eq('is_active', true)
      .maybeSingle()
    if (error) throw error
    if (!cruise || cruise.label !== 'development-only') {
      throw new Error(`REFUSE: expected development-only cruise, got ${cruise?.label}`)
    }
    if (cruise.id === '48fa40c6-e7cd-4f8f-8b81-e3e48d10eb13') {
      throw new Error('REFUSE: organizer cruise id')
    }
    cruiseId = cruise.id

    // Seed synthetic clock window (does not create bounty schedule).
    const { error: seedErr } = await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: -240,
      p_label: 'development-only',
    })
    if (seedErr) throw seedErr

    const { data: afterSeed } = await service
      .from('cruise_config')
      .select('id')
      .eq('is_active', true)
      .maybeSingle()
    cruiseId = afterSeed!.id

    const summary = JSON.parse(
      await readFile(join(process.cwd(), '.local/qa2a-identities.json'), 'utf8'),
    )
    const identities = summary.identities || summary.players || []
    const adminRow = identities.find(
      (p: { key?: string; role?: string; is_admin?: boolean; display_name?: string }) =>
        p.key === 'admin' || p.role === 'admin' || p.is_admin === true || p.display_name === 'Demo Admin',
    )
    const drinkRow = identities.find(
      (p: { key?: string; role?: string; display_name?: string }) =>
        p.key === 'drink_only' || p.role === 'drink_only' || p.display_name === 'Demo Drink Only',
    )
    const adminLogin = adminRow?.login_alias || adminRow?.email
    const drinkLogin = drinkRow?.login_alias || drinkRow?.email
    if (!adminLogin || !drinkLogin) {
      throw new Error('Missing qa2a admin/drink identities')
    }
    adminEmail = adminLogin
    drinkEmail = drinkLogin

    admin = createClient(API_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: adminAuthErr } = await admin.auth.signInWithPassword({
      email: adminEmail,
      password: PASSWORD,
    })
    if (adminAuthErr) throw adminAuthErr

    drinkPlayer = createClient(API_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: drinkAuthErr } = await drinkPlayer.auth.signInWithPassword({
      email: drinkEmail,
      password: PASSWORD,
    })
    if (drinkAuthErr) throw drinkAuthErr
  })

  afterAll(async () => {
    // Restore development-only label if a prod-label probe flipped it.
    await service
      .from('cruise_config')
      .update({ label: 'development-only' })
      .eq('id', cruiseId)
  })

  it('repro: no production Admin schedule RPC before repair would mean only dev_* exists — after repair Admin RPC works', async () => {
    requireDisposable()
    // Migration applied: Admin RPC must exist.
    const { error } = await admin.rpc('admin_get_bounty_schedule_status')
    expect(error).toBeNull()
  })

  it('initializes full seven-day schedule via Admin path without dev_generate_bounty_schedule', async () => {
    await clearScheduleLedger(service)

    const catalog = buildScheduleReadyCatalog(72, 39)
    catalog.catalog_id = `r5-prod-init-${randomUUID().slice(0, 8)}`
    const { error: actErr } = await service.rpc('dev_activate_catalog_fixture', {
      p_payload: catalog,
    })
    expect(actErr).toBeNull()

    // Production-like label: Admin init must not require development-only.
    await service.from('cruise_config').update({ label: 'production-voyage-r5' }).eq('id', cruiseId)

    const statusBefore = await admin.rpc('admin_get_bounty_schedule_status')
    expect(statusBefore.error).toBeNull()
    expect(statusBefore.data.initialized).toBe(false)
    expect(statusBefore.data.can_initialize).toBe(true)

    const requestId = randomUUID()
    const { data, error } = await admin.rpc('admin_initialize_bounty_schedule', {
      p_client_request_id: requestId,
      p_seed: 'r5-seed-a',
    })
    expect(error).toBeNull()
    expect(data.ok).toBe(true)
    expect(data.code).toBe('INITIALIZED')
    expect(data.cocktail_slots).toBe(72)
    expect(data.ingredient_slots).toBe(39)
    expect(data.bar_assignments).toBe(7)
    expect(data.daily_challenges).toBe(7)
    expect(data.gameplay_started).toBe(false)

    const { data: slots } = await service
      .from('bounty_slots')
      .select('category, cruise_day, slot_key, state')
      .eq('cruise_config_id', cruiseId)
    expect(slots!.filter((s) => s.category === 'cocktail')).toHaveLength(72)
    expect(slots!.filter((s) => s.category === 'ingredient')).toHaveLength(39)
    expect(slots!.every((s) => s.state === 'scheduled')).toBe(true)

    const day7c = slots!.filter((s) => s.category === 'cocktail' && s.cruise_day === 7)
    expect(day7c).toHaveLength(6)

    const { data: bars } = await service
      .from('bar_bounties')
      .select('day_number, bar_canonical_key')
      .eq('cruise_config_id', cruiseId)
      .order('day_number')
    expect(bars!.map((b) => b.bar_canonical_key)).toEqual([
      'wake-view-bar',
      'good-spirits-at-sea',
      'sea-view-bar',
      'crooners',
      'omalleys-irish-pub',
      'lido-bar',
      'promenade-bars',
    ])

    // Gameplay not started: drinkit still whatever it was; schedule init did not unpause/finalize.
    const { data: control } = await service
      .from('game_control')
      .select('status, finalized_at_utc')
      .eq('game', 'drinkit')
      .single()
    expect(control!.finalized_at_utc).toBeNull()

    // Same request id replays.
    const replay = await admin.rpc('admin_initialize_bounty_schedule', {
      p_client_request_id: requestId,
      p_seed: 'r5-seed-a',
    })
    expect(replay.error).toBeNull()
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)

    // Repeat after success with new id acknowledges without reshuffle.
    const { data: offersBefore } = await service
      .from('bounty_slot_offers')
      .select('canonical_key, slot_id')
      .eq('is_active', true)
      .order('slot_id')

    const again = await admin.rpc('admin_initialize_bounty_schedule', {
      p_client_request_id: randomUUID(),
      p_seed: 'r5-seed-b',
    })
    expect(again.error).toBeNull()
    expect(again.data.ok).toBe(true)
    expect(again.data.code).toBe('SCHEDULE_ALREADY_INITIALIZED')

    const { data: offersAfter } = await service
      .from('bounty_slot_offers')
      .select('canonical_key, slot_id')
      .eq('is_active', true)
      .order('slot_id')
    expect(offersAfter).toEqual(offersBefore)

    // Concurrent second inits stay consistent.
    const [c1, c2] = await Promise.all([
      admin.rpc('admin_initialize_bounty_schedule', {
        p_client_request_id: randomUUID(),
        p_seed: 'concurrent-1',
      }),
      admin.rpc('admin_initialize_bounty_schedule', {
        p_client_request_id: randomUUID(),
        p_seed: 'concurrent-2',
      }),
    ])
    expect(c1.data.ok).toBe(true)
    expect(c2.data.ok).toBe(true)
    expect(c1.data.code).toBe('SCHEDULE_ALREADY_INITIALIZED')
    expect(c2.data.code).toBe('SCHEDULE_ALREADY_INITIALIZED')

    // Player bounty RPC resolves against generated slots at Day 1 noon (dev timed helper).
    const noon = new Date(Date.UTC(2099, 0, 3, 16, 0, 0)).toISOString() // 12:00 ship = UTC-4
    const cocktail = await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: noon })
    // Label is production-voyage-r5 — timed helpers require development-only.
    // Flip back for timed proof, then restore.
    await service.from('cruise_config').update({ label: 'development-only' }).eq('id', cruiseId)
    const cocktail2 = await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: noon })
    expect(cocktail2.error).toBeNull()
    expect(cocktail2.data.status).toBe('active')
    expect(cocktail2.data.drink_name).toBeTruthy()
    expect(cocktail2.data.designated_bar_key).toBeTruthy()
    expect(cocktail2.data.designated_bar_key).not.toBe('mobile-order')

    const ingredient = await service.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: noon })
    expect(ingredient.error).toBeNull()
    expect(ingredient.data.status).toBe('active')

    void cocktail // production-label timed read may fail; Admin path already proved
  })

  it('rejects shortage, missing catalog, finalized, and non-admin callers', async () => {
    await clearScheduleLedger(service)

    const short = buildScheduleReadyCatalog(10, 5)
    short.catalog_id = `r5-short-${randomUUID().slice(0, 8)}`
    await service.rpc('dev_activate_catalog_fixture', { p_payload: short })

    const shortage = await admin.rpc('admin_initialize_bounty_schedule', {
      p_client_request_id: randomUUID(),
      p_seed: 'shortage',
    })
    expect(shortage.error).toBeNull()
    expect(shortage.data.ok).toBe(false)
    expect(String(shortage.data.code)).toMatch(/COCKTAIL_POOL_SHORTAGE|INGREDIENT_POOL_SHORTAGE/)
    const { count } = await service
      .from('bounty_slots')
      .select('*', { count: 'exact', head: true })
      .eq('cruise_config_id', cruiseId)
    expect(count ?? 0).toBe(0)

    // Non-admin cannot initialize.
    const denied = await drinkPlayer.rpc('admin_initialize_bounty_schedule', {
      p_client_request_id: randomUUID(),
    })
    expect(denied.error).toBeTruthy()
    expect(denied.error?.message ?? '').toMatch(/ADMIN_REQUIRED/i)

    // Finalized reject.
    const ready = buildScheduleReadyCatalog(72, 39)
    ready.catalog_id = `r5-finale-${randomUUID().slice(0, 8)}`
    await service.rpc('dev_activate_catalog_fixture', { p_payload: ready })
    await service
      .from('game_control')
      .update({ status: 'final', finalized_at_utc: new Date().toISOString() })
      .eq('game', 'drinkit')

    const finalized = await admin.rpc('admin_initialize_bounty_schedule', {
      p_client_request_id: randomUUID(),
    })
    expect(finalized.error).toBeNull()
    expect(finalized.data.ok).toBe(false)
    expect(finalized.data.code).toBe('CRUISE_FINALIZED')

    await service
      .from('game_control')
      .update({ status: 'active', finalized_at_utc: null })
      .eq('game', 'drinkit')
  })

  it('paused lifecycle still allows initialization; does not resume/unpause', async () => {
    await clearScheduleLedger(service)
    const catalog = buildScheduleReadyCatalog(72, 39)
    catalog.catalog_id = `r5-paused-${randomUUID().slice(0, 8)}`
    await service.rpc('dev_activate_catalog_fixture', { p_payload: catalog })
    await service.rpc('dev_set_drinkit_paused', { p_paused: true })

    const { data, error } = await admin.rpc('admin_initialize_bounty_schedule', {
      p_client_request_id: randomUUID(),
      p_seed: 'paused-ok',
    })
    expect(error).toBeNull()
    expect(data.ok).toBe(true)
    expect(data.code).toBe('INITIALIZED')

    const { data: control } = await service
      .from('game_control')
      .select('status')
      .eq('game', 'drinkit')
      .single()
    expect(control!.status).toBe('paused')

    await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  })
})
