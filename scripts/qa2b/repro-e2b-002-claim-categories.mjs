/**
 * R8 / REP-CLAIM-001 — triage E2B-002 empty claimed_categories.
 * Disposable :55321 only. Never sets QA_ALLOW_ORGANIZER_MUTATION.
 *
 * Proves:
 * 1) Authoritative submit with cocktail selected → claimed_categories includes cocktail
 * 2) Authoritative submit with empty selected_claims → cats=[] is expected ordinary log
 * 3) Harness false-fail: clicking data-state=selected deselects before submit
 *
 * Usage: node scripts/qa2b/repro-e2b-002-claim-categories.mjs
 */
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadQa2aEnv, identity } from '../qa2a/lib/env.mjs'

const OUT_DIR = join(
  process.cwd(),
  'docs/qa/campaign/repairs/R8-final-functional/evidence',
)

function requireDisposable(url) {
  if (!url?.includes(':55321') || url.includes(':54321')) {
    throw new Error(`REFUSE: expected disposable :55321, got ${url}`)
  }
}

function drinkPayload({ barKey, offeringId, selectedClaims, caption, companions = [] }) {
  return {
    idempotency_key: randomUUID(),
    bar_canonical_key: barKey,
    drink: { mode: 'named_catalog', offering_id: offeringId },
    companion_player_ids: companions,
    bar_eligible_companion_ids: companions,
    selected_claims: selectedClaims,
    caption: caption ?? 'R8 E2B-002 triage',
    photo_storage_key: null,
  }
}

async function main() {
  if (process.env.QA_ALLOW_ORGANIZER_MUTATION === '1') {
    throw new Error('REFUSE: QA_ALLOW_ORGANIZER_MUTATION must not be set')
  }
  const env = await loadQa2aEnv()
  requireDisposable(env.url)
  const drinkOnly = identity(env.summary, 'drink_only')
  const companion = identity(env.summary, 'both')
  const service = env.service
  const playerId = drinkOnly.player_id
  const companions = [companion.player_id]

  // Bring disposable into an active Day-1 noon window (same pattern as R3 repros).
  const today = new Date().toISOString().slice(0, 10)
  const seed = await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: today,
    p_base_offset_minutes: -240,
    p_label: 'development-only',
  })
  if (seed.error) throw new Error(`dev_seed_cruise_clock: ${seed.error.message}`)
  await service
    .from('game_control')
    .update({ finalized_at_utc: null, status: 'active' })
    .in('game', ['drinkit', 'shipit'])
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  // Ensure a bounty schedule exists for the development cruise.
  const sched = await service.rpc('dev_generate_bounty_schedule', {
    p_seed: `r8-e2b002-${randomUUID().slice(0, 8)}`,
  })
  if (sched.error) {
    // Schedule may already exist — continue and let bounty expose report.
    console.warn('dev_generate_bounty_schedule:', sched.error.message)
  }
  {
    const daily = await service.rpc('dev_seed_daily_assignments')
    if (daily.error) console.warn('dev_seed_daily_assignments:', daily.error.message)
  }

  // Day-1 noon ship-local ≈ 16:00 UTC with offset -240.
  const at = `${today}T16:00:00.000Z`
  await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: at })
  const cocktail = await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: at })
  if (!cocktail.data?.offer_id) {
    throw new Error(`No current cocktail bounty: ${JSON.stringify(cocktail)}`)
  }

  const { data: offer, error: offerErr } = await service
    .from('bounty_slot_offers')
    .select('id, cocktail_offering_id, display_snapshot')
    .eq('id', cocktail.data.offer_id)
    .single()
  if (offerErr) throw offerErr

  const barKey = offer.display_snapshot?.designated_bar_key
  const offeringId = offer.cocktail_offering_id

  const preview = await service.rpc('dev_preview_drink_claims_at', {
    p_payload: drinkPayload({ barKey, offeringId, selectedClaims: [], companions }),
    p_at_utc: at,
    p_player_id: playerId,
  })

  const cocktailCat = preview.data?.preview?.categories?.cocktail
  const evidence = {
    at,
    player: drinkOnly.display_name,
    player_id: playerId,
    barKey,
    offeringId,
    cocktailStatus: cocktailCat?.status,
    cocktailReason: cocktailCat?.reason ?? null,
    option: cocktailCat?.options?.[0] ?? null,
  }

  if (cocktailCat?.status === 'already_claimed') {
    evidence.classification = 'fixture_exhausted_already_claimed'
    evidence.product_defect = false
    evidence.harness_note =
      'Stress suite may still reach gallery via ordinary log; empty cats is then expected.'
  } else if (cocktailCat?.status !== 'eligible') {
    evidence.classification = 'not_eligible_now'
    evidence.product_defect = false
    evidence.preview = preview.data
  } else {
    const option = cocktailCat.options[0]
    const selectedClaim = {
      category: 'cocktail',
      offer_id: option.offer_id || offer.id,
      ...(option.assignment_id ? { assignment_id: option.assignment_id } : {}),
    }

    const withClaim = await service.rpc('dev_submit_drink_at', {
      p_payload: drinkPayload({
        barKey,
        offeringId,
        selectedClaims: [selectedClaim],
        companions,
        caption: 'R8 E2B-002 with cocktail selected',
      }),
      p_at_utc: at,
      p_player_id: playerId,
    })

    evidence.with_claim = {
      ok: withClaim.data?.ok,
      awarded_points: withClaim.data?.awarded_points,
      claimed_categories: withClaim.data?.claimed_categories,
      code: withClaim.data?.code ?? null,
      error: withClaim.error?.message ?? null,
    }

    // Second submit without selected claims (simulates harness deselect).
    const withoutClaim = await service.rpc('dev_submit_drink_at', {
      p_payload: drinkPayload({
        barKey,
        offeringId,
        selectedClaims: [],
        companions,
        caption: 'R8 E2B-002 empty selected_claims (deselect sim)',
      }),
      p_at_utc: at,
      p_player_id: playerId,
    })

    evidence.without_claim = {
      ok: withoutClaim.data?.ok,
      awarded_points: withoutClaim.data?.awarded_points,
      claimed_categories: withoutClaim.data?.claimed_categories,
      code: withoutClaim.data?.code ?? null,
      error: withoutClaim.error?.message ?? null,
    }

    const cats = withClaim.data?.claimed_categories || []
    const hasCocktail = Array.isArray(cats) && cats.some((c) => c === 'cocktail' || c?.category === 'cocktail')
    const emptyCatsOk =
      withoutClaim.data?.ok === true &&
      Array.isArray(withoutClaim.data?.claimed_categories) &&
      withoutClaim.data.claimed_categories.length === 0
    evidence.classification =
      withClaim.data?.ok && hasCocktail && emptyCatsOk
        ? 'product_ok_harness_assertion_false_fail'
        : withClaim.data?.ok && hasCocktail
          ? 'product_ok_partial'
          : 'needs_deeper_product_look'
    evidence.product_defect = evidence.classification === 'needs_deeper_product_look'
    evidence.harness_note =
      'E2B-S14 used cats.includes("cocktail") against object-shaped claimed_categories ([{category:"cocktail",...}]), which always fails. Secondary risk: clicking data-state=selected deselects before submit.'
  }

  await mkdir(OUT_DIR, { recursive: true })
  const outPath = join(OUT_DIR, 'e2b-002-triage.json')
  await writeFile(outPath, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
  console.log('wrote', outPath)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
