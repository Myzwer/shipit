/**
 * Phase 3A.1 — idempotent replay before eligibility revalidation;
 * Bar multiplier uses honor-system bar_eligible_companion_ids.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  activateReadyCatalogAndSchedule,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
  DEV_BASE_OFFSET_MIN,
} from '../helpers/bountyFixtures'
import {
  drinkPayload,
  exposeCurrentSlots,
  lookupOffering,
  playerId,
  previewAt,
  submitAt,
} from '../helpers/drinkitSubmit'
import type { ClockFixtures } from '../helpers/clockFixtures'

let fixtures: ClockFixtures

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
})

beforeEach(async () => {
  const { error } = await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(fixtures.service!, `phase3a1-${randomUUID().slice(0, 8)}`)
})

describe('Phase 3A.1 idempotent replay before eligibility', () => {
  async function acceptedSolo(at: string, key = randomUUID()) {
    const author = playerId(fixtures, 'drink_only')
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const payload = drinkPayload({
      barKey: 'wake-view',
      offeringId: offering.offering_id,
      idempotencyKey: key,
    })
    const first = await submitAt(fixtures.service!, author, payload, at)
    expect(first.data.ok).toBe(true)
    return { author, payload, first, key, offering }
  }

  it('retry after rotating slot expires returns original', async () => {
    const at = noonDay1Utc()
    const { author, payload, first } = await acceptedSolo(at)
    const later = slotUtc(1, '14:30:00')
    const replay = await submitAt(fixtures.service!, author, payload, later)
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.submission_id).toBe(first.data.submission_id)
    expect(replay.data.awarded_points).toBe(first.data.awarded_points)
  })

  it('retry after Admin Pause returns original', async () => {
    const at = noonDay1Utc()
    const { author, payload, first } = await acceptedSolo(at)
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    const replay = await submitAt(fixtures.service!, author, payload, at)
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.submission_id).toBe(first.data.submission_id)
    // New UUID still blocked while paused
    const blocked = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: (await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')).offering_id,
      }),
      at,
    )
    expect(blocked.data.ok).toBe(false)
    expect(blocked.data.code).toBe('GAME_PAUSED')
  })

  it('retry after Friday finale returns original', async () => {
    const at = slotUtc(7, '17:30:00')
    const { author, payload, first } = await acceptedSolo(at)
    const afterFinale = slotUtc(7, '18:30:00')
    const replay = await submitAt(fixtures.service!, author, payload, afterFinale)
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.submission_id).toBe(first.data.submission_id)
  })

  it('retry after catalog change returns original', async () => {
    const at = noonDay1Utc()
    const { author, payload, first } = await acceptedSolo(at)
    // Activate a fresh catalog+schedule (new seed) while keeping cruise
    await activateReadyCatalogAndSchedule(fixtures.service!, `phase3a1-recatalog-${randomUUID().slice(0, 6)}`)
    const replay = await submitAt(fixtures.service!, author, payload, at)
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.submission_id).toBe(first.data.submission_id)
  })

  it('retry after companion membership change returns original', async () => {
    const at = noonDay1Utc()
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const key = randomUUID()
    const payload = drinkPayload({
      barKey: 'wake-view',
      offeringId: offering.offering_id,
      companions: [companion],
      idempotencyKey: key,
    })
    const first = await submitAt(fixtures.service!, author, payload, at)
    expect(first.data.ok).toBe(true)
    // Disable companion's Drink It! membership after accept
    await fixtures.service!
      .from('game_memberships')
      .update({ enabled: false })
      .eq('player_id', companion)
      .eq('game', 'drinkit')
    const replay = await submitAt(fixtures.service!, author, payload, at)
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.submission_id).toBe(first.data.submission_id)
    // restore
    await fixtures.service!
      .from('game_memberships')
      .update({ enabled: true })
      .eq('player_id', companion)
      .eq('game', 'drinkit')
  })

  it('same key with modified payload rejects; concurrent same-key saves once', async () => {
    const at = noonDay1Utc()
    const { author, payload, key, offering } = await acceptedSolo(at)
    const mismatch = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'poolside',
        mode: 'generic_beer',
        idempotencyKey: key,
      }),
      at,
    )
    expect(mismatch.data.ok).toBe(false)
    expect(mismatch.data.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH')

    const key2 = randomUUID()
    const p2 = drinkPayload({
      barKey: 'wake-view',
      offeringId: offering.offering_id,
      idempotencyKey: key2,
    })
    const [a, b] = await Promise.all([
      submitAt(fixtures.service!, author, p2, at),
      submitAt(fixtures.service!, author, p2, at),
    ])
    expect(a.data.ok && b.data.ok).toBe(true)
    expect(a.data.submission_id).toBe(b.data.submission_id)
    void payload
  })

  it('different player cannot retrieve another player saved result', async () => {
    const at = noonDay1Utc()
    const { payload, first } = await acceptedSolo(at)
    const other = playerId(fixtures, 'both')
    const stolen = await submitAt(fixtures.service!, other, payload, at)
    // Other player + same key is a NEW submission for that author, or mismatch — not a cross-player replay.
    // Their own key namespace: same UUID is allowed per author, so this creates a new row for `both`.
    expect(stolen.data.ok === true || stolen.data.code === 'IDEMPOTENCY_PAYLOAD_MISMATCH').toBe(true)
    if (stolen.data.ok) {
      expect(stolen.data.submission_id).not.toBe(first.data.submission_id)
      expect(stolen.data.idempotent_replay).not.toBe(true)
    }
  })
})

describe('Phase 3A.1 Bar eligible companions', () => {
  it('reproduces old bug: presence-only would over-count; eligible subset scores correctly', async () => {
    const at = noonDay1Utc()
    const author = playerId(fixtures, 'drink_only')
    const eligible = playerId(fixtures, 'both')
    const alreadyClaimedCompanion = playerId(fixtures, 'admin')
    const bar = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', { p_at_utc: at })
    const barKey = bar.data.bar_canonical_key as string

    // Companion "admin" already claimed Bar earlier — still present at gathering for Cocktail rules,
    // but NOT listed in bar_eligible_companion_ids.
    await submitAt(
      fixtures.service!,
      alreadyClaimedCompanion,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [author],
        barEligibleCompanions: [author],
        selectedClaims: [
          {
            category: 'bar',
            assignment_id: (
              await previewAt(
                fixtures.service!,
                alreadyClaimedCompanion,
                drinkPayload({
                  barKey,
                  mode: 'generic_beer',
                  companions: [author],
                  barEligibleCompanions: [author],
                }),
                at,
              )
            ).data.preview.categories.bar.options[0].assignment_id,
          },
        ],
      }),
      at,
    )

    const prev = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [eligible, alreadyClaimedCompanion],
        barEligibleCompanions: [eligible], // exclude prior claimant
      }),
      at,
    )
    expect(prev.data.preview.categories.bar.status).toBe('eligible')
    expect(prev.data.preview.categories.bar.options[0].points).toBe(35)
    expect(prev.data.preview.categories.bar.options[0].companion_count).toBe(1)

    const scored = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [eligible, alreadyClaimedCompanion],
        barEligibleCompanions: [eligible],
        selectedClaims: [
          {
            category: 'bar',
            assignment_id: prev.data.preview.categories.bar.options[0].assignment_id,
          },
        ],
      }),
      at,
    )
    expect(scored.data.ok).toBe(true)
    expect(scored.data.awarded_points).toBe(35)
  })

  it('2 / 4 / 8+ eligible → 35 / 55 / 95; preview matches submit', async () => {
    const at = noonDay1Utc()
    // Use formula via evaluator with synthetic counts through real companions we have (2 max drinkit
    // besides author among fixtures). For 4 and 8+, assert drinkit_bar_points + preview path for 1–2.
    expect((await fixtures.service!.rpc('drinkit_bar_points', { p_companion_count: 1 })).data).toBe(35)
    expect((await fixtures.service!.rpc('drinkit_bar_points', { p_companion_count: 3 })).data).toBe(55)
    expect((await fixtures.service!.rpc('drinkit_bar_points', { p_companion_count: 7 })).data).toBe(95)

    const author = playerId(fixtures, 'drink_only')
    const a = playerId(fixtures, 'both')
    const b = playerId(fixtures, 'admin')
    const bar = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', { p_at_utc: at })
    const barKey = bar.data.bar_canonical_key as string

    const two = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [a, b],
        barEligibleCompanions: [a, b],
      }),
      at,
    )
    expect(two.data.preview.categories.bar.options[0].points).toBe(45)

    const scored = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [a, b],
        barEligibleCompanions: [a, b],
        selectedClaims: [
          {
            category: 'bar',
            assignment_id: two.data.preview.categories.bar.options[0].assignment_id,
          },
        ],
      }),
      at,
    )
    expect(scored.data.awarded_points).toBe(45)
  })

  it('same gathering, staggered submits: each keeps honor-system eligible set', async () => {
    const at = noonDay1Utc()
    const p1 = playerId(fixtures, 'drink_only')
    const p2 = playerId(fixtures, 'both')
    const bar = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', { p_at_utc: at })
    const barKey = bar.data.bar_canonical_key as string
    const assignmentId = (
      await previewAt(
        fixtures.service!,
        p1,
        drinkPayload({
          barKey,
          mode: 'generic_beer',
          companions: [p2],
          barEligibleCompanions: [p2],
        }),
        at,
      )
    ).data.preview.categories.bar.options[0].assignment_id

    const first = await submitAt(
      fixtures.service!,
      p1,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [p2],
        barEligibleCompanions: [p2],
        selectedClaims: [{ category: 'bar', assignment_id: assignmentId }],
      }),
      at,
    )
    expect(first.data.awarded_points).toBe(35)

    // p2 submits later; still reports p1 as bar-eligible at gathering (honor system),
    // even though p1 already has an active Bar claim.
    const second = await submitAt(
      fixtures.service!,
      p2,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [p1],
        barEligibleCompanions: [p1],
        selectedClaims: [{ category: 'bar', assignment_id: assignmentId }],
      }),
      slotUtc(1, '12:45:00'),
    )
    expect(second.data.ok).toBe(true)
    expect(second.data.awarded_points).toBe(35)
  })

  it('ineligible Bar companions still count for Cocktail presence', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const present = playerId(fixtures, 'both')
    const cocktail = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    const { data: offer } = await fixtures.service!
      .from('bounty_slot_offers')
      .select('id, cocktail_offering_id, display_snapshot')
      .eq('id', cocktail.data.offer_id)
      .single()
    const prev = await previewAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: offer!.display_snapshot.designated_bar_key as string,
        offeringId: offer!.cocktail_offering_id as string,
        companions: [present],
        barEligibleCompanions: [], // none for Bar
      }),
      at,
    )
    expect(prev.data.preview.categories.cocktail.status).toBe('eligible')
    expect(prev.data.preview.categories.bar.status).toBe('unavailable')
    expect(prev.data.preview.categories.bar.reason).toBe('bar_eligible_companion_required')
  })

  it('malformed bar-eligible (not subset / self) cannot inflate points', async () => {
    const at = noonDay1Utc()
    const author = playerId(fixtures, 'drink_only')
    const a = playerId(fixtures, 'both')
    const stranger = playerId(fixtures, 'ship_only')
    const bar = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', { p_at_utc: at })
    const barKey = bar.data.bar_canonical_key as string

    const notSubset = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [a],
        barEligibleCompanions: [a, stranger],
      }),
      at,
    )
    expect(notSubset.data.ok).toBe(false)

    const self = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [a],
        barEligibleCompanions: [author],
      }),
      at,
    )
    expect(self.data.ok).toBe(false)
  })
})
