/**
 * R1 / REP-SUB-001 — disposable backend integrity.
 * Requires LOCAL_TEST_PASSWORD + disposable :55321 (Agent 1). Never mutates organizer.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const API_URL = process.env.VITE_SUPABASE_URL || ''
const ANON = process.env.VITE_SUPABASE_ANON_KEY || ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const PASSWORD = process.env.LOCAL_TEST_PASSWORD || ''

const isDisposable = API_URL.includes(':55321') && !API_URL.includes(':54321')
const canRun = Boolean(isDisposable && ANON && SERVICE && PASSWORD)

function requireDisposable() {
  if (process.env.QA_ALLOW_ORGANIZER_MUTATION === '1') {
    throw new Error('REFUSE: QA_ALLOW_ORGANIZER_MUTATION must not be set')
  }
  if (!canRun) {
    throw new Error('R1 integration requires disposable :55321 env + LOCAL_TEST_PASSWORD')
  }
}

describe.skipIf(!canRun)('R1 submission integrity (disposable)', () => {
  let service: SupabaseClient
  let playerId: string
  let email: string

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

    // Prefer existing synthetic drink_only identity from qa2a summary when present.
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    try {
      const summary = JSON.parse(
        await readFile(join(process.cwd(), '.local/qa2a-identities.json'), 'utf8'),
      )
      const row = (summary.identities || summary.players || []).find(
        (p: { role?: string; display_name?: string }) =>
          p.role === 'drink_only' || p.display_name === 'Demo Drink Only',
      )
      if (row?.player_id) playerId = row.player_id
      if (row?.email) email = row.email
    } catch {
      /* fall through */
    }

    if (!email || !playerId) {
      const { data: players } = await service
        .from('players')
        .select('id, display_name, auth_user_id')
        .ilike('display_name', '%Drink%')
        .limit(5)
      const p = players?.[0]
      if (!p) throw new Error('No drink player for R1 integration')
      playerId = p.id
      const { data: user } = await service.auth.admin.getUserById(p.auth_user_id)
      email = user.user?.email || ''
      if (!email) throw new Error('Missing auth email for R1 player')
    }
  })

  afterAll(async () => {
    /* no global teardown — disposable is shared */
  })

  async function authedClient() {
    const client = createClient(API_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
    if (error) throw error
    return client
  }

  async function submitOnce(
    client: SupabaseClient,
    key: string,
    caption: string,
  ): Promise<Record<string, unknown>> {
    const { data: bars } = await client.rpc('list_drinkit_bars')
    const bar = (bars as Array<{ canonical_key: string }>)?.[0]
    if (!bar) throw new Error('no bars')
    const { data: drinks } = await client.rpc('list_drinkit_bar_drinks', {
      p_bar_canonical_key: bar.canonical_key,
    })
    const drink = (drinks as Array<{ offering_id: string }>)?.[0]
    const payload = {
      idempotency_key: key,
      bar_canonical_key: bar.canonical_key,
      drink: drink
        ? { mode: 'named_catalog', offering_id: drink.offering_id }
        : { mode: 'generic_beer' },
      companion_player_ids: [],
      bar_eligible_companion_ids: [],
      selected_claims: [],
      caption,
      photo_storage_key: null,
    }
    const { data, error } = await client.rpc('submit_drink', { p_payload: payload })
    if (error) throw error
    return (data ?? {}) as Record<string, unknown>
  }

  it('6) legitimate separate ordinary logs both accept with different keys', async () => {
    const client = await authedClient()
    const a = await submitOnce(client, randomUUID(), `r1-legit-a-${Date.now()}`)
    const b = await submitOnce(client, randomUUID(), `r1-legit-b-${Date.now()}`)
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(a.submission_id).not.toBe(b.submission_id)
    expect(a.idempotent_replay).not.toBe(true)
    expect(b.idempotent_replay).not.toBe(true)
  })

  it('8) accepted claim/drink replay is idempotent (same key → one row)', async () => {
    const client = await authedClient()
    const key = randomUUID()
    const caption = `r1-replay-${Date.now()}`
    const first = await submitOnce(client, key, caption)
    const second = await submitOnce(client, key, caption)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(second.idempotent_replay).toBe(true)
    expect(second.submission_id).toBe(first.submission_id)

    const { data: rows } = await service
      .from('submissions')
      .select('id')
      .eq('author_player_id', playerId)
      .eq('idempotency_key', key)
    expect(rows?.length).toBe(1)
  })

  it('5) concurrent same-key submits from two clients yield one accepted row', async () => {
    const c1 = await authedClient()
    const c2 = await authedClient()
    const key = randomUUID()
    const caption = `r1-concurrent-${Date.now()}`
    const [r1, r2] = await Promise.all([
      submitOnce(c1, key, caption),
      submitOnce(c2, key, caption),
    ])
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    expect(r1.submission_id).toBe(r2.submission_id)
    const { count } = await service
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('author_player_id', playerId)
      .eq('idempotency_key', key)
    expect(count).toBe(1)
  })
})
