/**
 * Phase 10A — demo scenario seed safety + optional live seed checks.
 * Heavy seeds run only when PHASE10A_DEMO_SEED=1 and LOCAL_TEST_PASSWORD is set.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadLocalFixtures, createLocalClient } from '../helpers/localSupabase'
import { drinkPayload, lookupOffering, submitAt } from '../helpers/drinkitSubmit'

const password = process.env.LOCAL_TEST_PASSWORD
const runHeavy = Boolean(password && process.env.PHASE10A_DEMO_SEED === '1')

describe('Phase 10A demo safety (always)', () => {
  it('rejects remote Supabase hosts in demoLocalSafety', async () => {
    const mod = await import('../../scripts/lib/demoLocalSafety.mjs')
    expect(() => mod.assertLocalSupabaseUrl('https://xyzcompany.supabase.co')).toThrow(/DEMO_SAFETY/)
    expect(() => mod.assertLocalSupabaseUrl('http://127.0.0.1:54321')).not.toThrow()
  })

  it('preview catalog retains research provenance and Category B honesty without fabricating prices', () => {
    const doc = JSON.parse(
      readFileSync(join(process.cwd(), 'content/catalogs/development-preview-v1.json'), 'utf8'),
    )
    expect(doc.source_notes.verified_bar_keys).toContain('omalleys-irish-pub')
    expect(doc.source_notes.verified_bar_keys).not.toContain('good-spirits-at-sea')
    expect(doc.cocktail_candidates.filter((c: { eligible: boolean }) => c.eligible).length).toBeGreaterThanOrEqual(72)
    expect(doc.ingredient_candidates.filter((c: { eligible: boolean }) => c.eligible).length).toBeGreaterThanOrEqual(39)
    let categoryB = 0
    let goodSpiritsUnverified = 0
    for (const d of doc.drinks) {
      for (const o of d.bar_offerings) {
        expect(o.price_usd).toBeNull()
        expect(['approved_filtered_within_limit', 'unverified', 'verified_within_limit']).toContain(
          o.price_status,
        )
        if (o.price_status === 'approved_filtered_within_limit') {
          categoryB += 1
          expect(o.price_evidence_approval_id).toBeTruthy()
          expect(o.price_evidence_recipe_fingerprint).toBeTruthy()
        }
        if (o.bar_key === 'good-spirits-at-sea') {
          expect(o.price_status).toBe('unverified')
          goodSpiritsUnverified += 1
        }
      }
    }
    expect(categoryB).toBe(191)
    expect(goodSpiritsUnverified).toBeGreaterThan(0)
    expect(doc.source_notes.uncertainty_flags.map((f: { code: string }) => f.code)).toEqual(
      expect.arrayContaining([
        'FILTERED_SOURCE_CATEGORY_B',
        'GOOD_SPIRITS_UNVERIFIED',
        'SHARED_POOL_MENU',
        'RANKINGS_ORGANIZER_APPROVED',
      ]),
    )
  })

  it('gitignore keeps private roster/photos out of Git', () => {
    const gi = readFileSync(join(process.cwd(), '.gitignore'), 'utf8')
    expect(gi.includes('private/roster/')).toBe(true)
    expect(gi.includes('private/photos/')).toBe(true)
    expect(existsSync(join(process.cwd(), 'private/roster/roster.local.json'))).toBe(false)
  })
})

describe.runIf(runHeavy)('Phase 10A demo seed scenarios (PHASE10A_DEMO_SEED=1)', () => {
  let service: ReturnType<typeof createLocalClient>
  let summary: NonNullable<Awaited<ReturnType<typeof loadLocalFixtures>>['summary']>

  beforeAll(async () => {
    const fx = await loadLocalFixtures()
    if (!fx.available || !fx.summary || !fx.serviceRoleKey) {
      throw new Error('Local fixtures required')
    }
    const mod = await import('../../scripts/lib/demoLocalSafety.mjs')
    mod.assertLocalSupabaseUrl(fx.summary.supabase_url)
    summary = fx.summary
    service = createLocalClient(fx.summary.supabase_url, fx.serviceRoleKey)
  }, 60_000)

  it('embarkation seed is repeatable and accepts new gameplay', async () => {
    const env = { ...process.env, LOCAL_TEST_PASSWORD: password! }
    execFileSync('node', ['scripts/demo-seed.mjs', '--scenario', 'embarkation'], {
      cwd: process.cwd(),
      env,
      stdio: 'pipe',
      timeout: 180_000,
    })
    execFileSync('node', ['scripts/demo-seed.mjs', '--scenario', 'embarkation'], {
      cwd: process.cwd(),
      env,
      stdio: 'pipe',
      timeout: 180_000,
    })

    const { data: cruise } = await service
      .from('cruise_config')
      .select('label')
      .eq('is_active', true)
      .single()
    expect(cruise!.label).toBe('development-only')

    const { data: challenges } = await service.from('scavenger_challenges').select('title').eq('active', true)
    expect(challenges!.length).toBe(50)
    expect(challenges!.every((c) => !String(c.title).includes('[DEV]'))).toBe(true)

    const drink = summary.identities.find((i) => i.key === 'drink_only')!
    const offeringId = await lookupOffering(service, 'princess-live', 'cosmopolitan')
    const res = await submitAt(
      service,
      drink.player_id,
      drinkPayload({ barKey: 'princess-live', offeringId, companions: [], idempotencyKey: randomUUID() }),
      new Date().toISOString(),
    )
    expect(res.data?.ok).toBe(true)
  }, 400_000)

  it('tuesday scores are consistent; wrapped latches finale', async () => {
    const env = { ...process.env, LOCAL_TEST_PASSWORD: password! }
    execFileSync('node', ['scripts/demo-seed.mjs', '--scenario', 'tuesday'], {
      cwd: process.cwd(),
      env,
      stdio: 'pipe',
      timeout: 300_000,
    })

    const { data: cruise } = await service.from('cruise_config').select('id, label').eq('is_active', true).single()
    expect(cruise!.label).toBe('development-only')
    const drinkRows = await service.rpc('drinkit_player_score_rows', { p_cruise_config_id: cruise!.id })
    expect(drinkRows.error).toBeNull()
    expect((drinkRows.data as unknown[]).length).toBeGreaterThan(0)

    const both = summary.identities.find((i) => i.key === 'both')!
    const offeringId = await lookupOffering(service, 'omalleys-irish-pub', 'passion-of-the-irish')
    const mid = await submitAt(
      service,
      both.player_id,
      drinkPayload({
        barKey: 'omalleys-irish-pub',
        offeringId,
        companions: [],
        idempotencyKey: randomUUID(),
      }),
      new Date().toISOString(),
    )
    expect(mid.data?.ok).toBe(true)

    execFileSync('node', ['scripts/demo-seed.mjs', '--scenario', 'wrapped'], {
      cwd: process.cwd(),
      env,
      stdio: 'pipe',
      timeout: 300_000,
    })

    const { data: cruise2 } = await service.from('cruise_config').select('id, label').eq('is_active', true).single()
    expect(cruise2!.label).toBe('development-only')
    const shipRows = await service.rpc('shipit_team_score_rows', { p_cruise_config_id: cruise2!.id })
    expect(shipRows.error).toBeNull()
  }, 700_000)
})
