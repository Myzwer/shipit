/**
 * Development-only Plan C Wrapped full-coverage fixture activity.
 *
 * Deterministic accepted gameplay so production carousel selection yields
 * Drink It! 15/15 and Ship It! 12/12 featured slides without changing
 * eligibility thresholds or aggregations.
 *
 * Invoked from demo-seed.mjs when `--scenario wrapped --plan-c-full`.
 */
import { createHash } from 'node:crypto'

/** Offering shorthand → bar + drink concept keys. */
export const PLAN_C_OFFERINGS = {
  O1: { bar: 'omalleys-irish-pub', drink: 'passion-of-the-irish' },
  O2: { bar: 'princess-live', drink: 'cosmopolitan' },
  O3: { bar: 'wake-view-bar', drink: 'sand-meets-the-sea' },
  O4: { bar: 'cascade-bar', drink: 'amazonia' },
  O5: { bar: 'crooners', drink: 'figs-and-honey' },
  O6: { bar: 'bellinis-cocktail-bar', drink: 'almond-italia' },
  O7: { bar: 'sea-view-bar', drink: 'the-original-carajillo' },
  O8: { bar: 'promenade-bars', drink: 'jungle-bird' },
  O9: { bar: 'crooners', drink: 'rum-brulee' },
  O10: { bar: 'lido-bar', drink: 'lychee-vodka-mojito' },
  O11: { bar: 'sea-view-bar', drink: 'strawberries-and-cream' },
}

/**
 * Drink logs across the cruise. photoRole tags featured Gallery winners.
 * Times are ship-local. claimBounties only on Days 1–3 (bar bounty window).
 */
export const PLAN_C_DRINK_LOGS = [
  { id: 'L01', day: 1, time: '12:04:10', player: 'jordan_shirley', offer: 'O4', companions: [], claim: false, photoRole: 'earliest' },
  { id: 'L02', day: 1, time: '13:15:20', player: 'david_forrester', offer: 'O3', companions: [], claim: false, photoRole: null },
  { id: 'L03', day: 1, time: '14:05:30', player: 'mark_rector', offer: 'O3', companions: ['dan_becker'], claim: true, photoRole: null },
  { id: 'L04', day: 1, time: '14:40:40', player: 'dan_becker', offer: 'O3', companions: ['mark_rector'], claim: true, photoRole: 'other' },
  { id: 'L05', day: 1, time: '16:10:50', player: 'josh_forrester', offer: 'O1', companions: [], claim: false, photoRole: null },
  { id: 'L06', day: 1, time: '17:30:05', player: 'katie_forrester', offer: 'O2', companions: [], claim: false, photoRole: null },
  { id: 'L07', day: 2, time: '12:20:15', player: 'aaron_mills', offer: 'O5', companions: ['lindsey_mills'], claim: true, photoRole: null },
  { id: 'L08', day: 2, time: '12:55:25', player: 'lindsey_mills', offer: 'O5', companions: ['aaron_mills'], claim: true, photoRole: 'heart' },
  { id: 'L09', day: 2, time: '14:30:35', player: 'katie_forrester', offer: 'O1', companions: ['david_forrester'], claim: true, photoRole: null },
  { id: 'L10', day: 2, time: '15:45:45', player: 'cindy_becker', offer: 'O7', companions: [], claim: false, photoRole: null },
  { id: 'L11', day: 2, time: '17:05:55', player: 'jonathan_forrester', offer: 'O3', companions: [], claim: false, photoRole: 'other' },
  { id: 'L12', day: 2, time: '19:20:00', player: 'mark_rector', offer: 'BEER', companions: [], claim: false, photoRole: null },
  { id: 'L13', day: 3, time: '12:40:12', player: 'david_forrester', offer: 'O1', companions: ['katie_forrester'], claim: true, photoRole: null },
  { id: 'L14', day: 3, time: '13:20:40', player: 'dan_becker', offer: 'O4', companions: ['cindy_becker'], claim: false, photoRole: null },
  { id: 'L15', day: 3, time: '13:50:50', player: 'cindy_becker', offer: 'O4', companions: ['dan_becker'], claim: false, photoRole: 'laugh2' },
  { id: 'L16', day: 3, time: '15:10:22', player: 'david_forrester', offer: 'O2', companions: ['mark_rector'], claim: true, photoRole: null },
  { id: 'L17', day: 3, time: '17:25:32', player: 'david_forrester', offer: 'O1', companions: ['katie_forrester'], claim: true, photoRole: null },
  { id: 'L18', day: 3, time: '20:15:00', player: 'mark_rector', offer: 'O3', companions: [], claim: false, photoRole: 'laugh1' },
  { id: 'L19', day: 4, time: '06:48:00', player: 'jonathan_forrester', offer: 'BEER', companions: [], claim: false, photoRole: null },
  { id: 'L20', day: 4, time: '12:25:05', player: 'david_bissett', offer: 'O6', companions: [], claim: false, photoRole: 'hang' },
  { id: 'L21', day: 4, time: '13:10:15', player: 'aaron_mills', offer: 'O3', companions: ['jordan_shirley'], claim: false, photoRole: 'total' },
  { id: 'L22', day: 4, time: '13:50:25', player: 'jordan_shirley', offer: 'O11', companions: ['aaron_mills'], claim: false, photoRole: null },
  { id: 'L23', day: 4, time: '16:30:35', player: 'josh_forrester', offer: 'O8', companions: [], claim: false, photoRole: null },
  { id: 'L24', day: 4, time: '18:40:45', player: 'katie_forrester', offer: 'O7', companions: [], claim: false, photoRole: null },
  { id: 'L25', day: 5, time: '12:05:30', player: 'david_forrester', offer: 'O4', companions: [], claim: false, photoRole: null },
  { id: 'L26', day: 5, time: '14:20:40', player: 'david_forrester', offer: 'O1', companions: [], claim: false, photoRole: null },
  { id: 'L27', day: 5, time: '16:45:50', player: 'david_forrester', offer: 'O6', companions: [], claim: false, photoRole: null },
  { id: 'L28', day: 5, time: '19:30:00', player: 'david_forrester', offer: 'BEER', companions: [], claim: false, photoRole: null },
  { id: 'L29', day: 5, time: '13:05:11', player: 'cindy_becker', offer: 'O9', companions: ['lindsey_mills'], claim: false, photoRole: null },
  { id: 'L30', day: 5, time: '13:45:21', player: 'lindsey_mills', offer: 'O9', companions: ['cindy_becker'], claim: false, photoRole: 'other' },
  { id: 'L31', day: 5, time: '15:30:31', player: 'mark_rector', offer: 'O10', companions: [], claim: false, photoRole: null },
  { id: 'L32', day: 5, time: '17:50:41', player: 'dan_becker', offer: 'O5', companions: [], claim: false, photoRole: null },
  { id: 'L33', day: 5, time: '23:41:00', player: 'cindy_becker', offer: 'O11', companions: [], claim: false, photoRole: null },
  { id: 'L34', day: 6, time: '12:30:00', player: 'josh_forrester', offer: 'O2', companions: [], claim: false, photoRole: null },
  { id: 'L35', day: 6, time: '13:50:21', player: 'david_forrester', offer: 'O5', companions: [], claim: false, photoRole: null },
  { id: 'L36', day: 6, time: '14:10:00', player: 'jonathan_forrester', offer: 'O10', companions: [], claim: false, photoRole: 'other' },
  { id: 'L37', day: 6, time: '15:00:11', player: 'katie_forrester', offer: 'O8', companions: ['david_forrester'], claim: false, photoRole: 'other' },
  { id: 'L38', day: 6, time: '16:45:00', player: 'david_bissett', offer: 'O11', companions: [], claim: false, photoRole: null },
  { id: 'L39', day: 6, time: '20:30:00', player: 'aaron_mills', offer: 'O7', companions: [], claim: false, photoRole: null },
  { id: 'L40', day: 7, time: '12:15:00', player: 'josh_forrester', offer: 'O9', companions: [], claim: false, photoRole: null },
  { id: 'L41', day: 7, time: '13:40:00', player: 'mark_rector', offer: 'BEER', companions: [], claim: false, photoRole: null },
  { id: 'L42', day: 7, time: '14:30:00', player: 'katie_forrester', offer: 'O10', companions: [], claim: false, photoRole: null },
  { id: 'L43', day: 7, time: '16:20:00', player: 'lindsey_mills', offer: 'O6', companions: [], claim: false, photoRole: null },
]

export const PLAN_C_DAILIES = [
  { day: 1, time: '18:30:00', player: 'josh_forrester' },
  { day: 2, time: '20:10:00', player: 'katie_forrester' },
  { day: 3, time: '19:00:00', player: 'david_forrester' },
  { day: 4, time: '19:40:00', player: 'mark_rector' },
  { day: 5, time: '20:20:00', player: 'lindsey_mills' },
  { day: 6, time: '19:15:00', player: 'jordan_shirley' },
  { day: 7, time: '15:50:00', player: 'jonathan_forrester' },
]

/** Featured photo reaction distributions (one reaction per player per event). */
export const PLAN_C_FEATURED_REACTIONS = {
  laugh1: [
    { player: 'david_forrester', emoji: 'laugh' },
    { player: 'katie_forrester', emoji: 'laugh' },
    { player: 'dan_becker', emoji: 'laugh' },
    { player: 'cindy_becker', emoji: 'laugh' },
    { player: 'lindsey_mills', emoji: 'laugh' },
  ],
  laugh2: [
    { player: 'david_forrester', emoji: 'laugh' },
    { player: 'katie_forrester', emoji: 'laugh' },
    { player: 'jordan_shirley', emoji: 'laugh' },
    { player: 'jonathan_forrester', emoji: 'laugh' },
  ],
  heart: [
    { player: 'david_forrester', emoji: 'heart' },
    { player: 'katie_forrester', emoji: 'heart' },
    { player: 'mark_rector', emoji: 'heart' },
    { player: 'dan_becker', emoji: 'heart' },
  ],
  total: [
    { player: 'david_forrester', emoji: 'laugh' },
    { player: 'mark_rector', emoji: 'laugh' },
    { player: 'josh_forrester', emoji: 'laugh' },
    { player: 'katie_forrester', emoji: 'heart' },
    { player: 'dan_becker', emoji: 'heart' },
    { player: 'cindy_becker', emoji: 'heart' },
    { player: 'jordan_shirley', emoji: 'hang_loose' },
    { player: 'lindsey_mills', emoji: 'hang_loose' },
  ],
  hang: [
    { player: 'david_forrester', emoji: 'hang_loose' },
    { player: 'katie_forrester', emoji: 'hang_loose' },
    { player: 'josh_forrester', emoji: 'hang_loose' },
  ],
}

export const PLAN_C_FILLER_REACTIONS = [
  { logId: 'L04', reactions: [{ player: 'josh_forrester', emoji: 'laugh' }, { player: 'katie_forrester', emoji: 'heart' }] },
  { logId: 'L11', reactions: [{ player: 'mark_rector', emoji: 'heart' }] },
  { logId: 'L30', reactions: [{ player: 'jonathan_forrester', emoji: 'laugh' }] },
  { logId: 'L36', reactions: [{ player: 'aaron_mills', emoji: 'hang_loose' }] },
  { logId: 'L37', reactions: [{ player: 'david_forrester', emoji: 'heart' }] },
]

/**
 * Ship It! scavenger plan for Plan C full coverage.
 * team_3 (Katie) is the primary QA team: Day 4 = 1400 pts / 3 challenges.
 */
export const PLAN_C_SCAVENGER = [
  { teamKey: 'team_3', challengeKey: 'the-piazza-grandeur', day: 1, hour: '11:00:00' },
  { teamKey: 'team_3', challengeKey: 'international-cafe', day: 1, hour: '13:30:00' },
  { teamKey: 'team_3', challengeKey: 'soft-serve-swirl', day: 2, hour: '10:15:00' },
  { teamKey: 'team_3', challengeKey: 'poolside-slice', day: 2, hour: '12:40:00' },
  { teamKey: 'team_3', challengeKey: 'tropical-paradise', day: 2, hour: '15:05:00' },
  { teamKey: 'team_3', challengeKey: 'carpet-compass', day: 2, hour: '17:20:00' },
  { teamKey: 'team_3', challengeKey: 'sweet-treat', day: 3, hour: '13:00:00' },
  { teamKey: 'team_3', challengeKey: 'wind-tunnel', day: 4, hour: '10:30:00' },
  { teamKey: 'team_3', challengeKey: 'chair-squeeze', day: 4, hour: '12:10:00' },
  { teamKey: 'team_3', challengeKey: 'crew-high-five', day: 4, hour: '16:50:00' },
  { teamKey: 'team_3', challengeKey: 'main-dining-elegance', day: 5, hour: '12:25:00' },
  { teamKey: 'team_3', challengeKey: 'lounge-spotlight', day: 6, hour: '19:10:00' },

  { teamKey: 'team_5', challengeKey: 'miniature-masterpiece', day: 1, hour: '12:00:00' },
  { teamKey: 'team_5', challengeKey: 'omalleys-irish-pub', day: 2, hour: '11:15:00' },
  { teamKey: 'team_5', challengeKey: 'high-wind-warning', day: 3, hour: '12:30:00' },
  { teamKey: 'team_5', challengeKey: 'sunset-silhouette', day: 3, hour: '16:00:00' },
  { teamKey: 'team_5', challengeKey: 'ocean-lookout', day: 4, hour: '10:45:00' },
  { teamKey: 'team_5', challengeKey: 'soft-serve-swirl', day: 5, hour: '14:05:00' },
  { teamKey: 'team_5', challengeKey: 'king-of-the-world', day: 6, hour: '13:20:00' },
  { teamKey: 'team_5', challengeKey: 'towel-zoo', day: 6, hour: '15:30:00' },
  { teamKey: 'team_5', challengeKey: 'bridge-wing-peek', day: 7, hour: '11:40:00' },

  { teamKey: 'team_1', challengeKey: 'casino-neon', day: 1, hour: '14:00:00' },
  { teamKey: 'team_1', challengeKey: 'buffet-multi-tasker', day: 2, hour: '12:30:00' },
  { teamKey: 'team_1', challengeKey: 'art-critic', day: 2, hour: '15:30:00' },
  { teamKey: 'team_1', challengeKey: 'trivia-masters', day: 3, hour: '11:30:00' },
  { teamKey: 'team_1', challengeKey: 'soft-serve-swirl', day: 4, hour: '14:15:00' },
  { teamKey: 'team_1', challengeKey: 'safety-first', day: 5, hour: '10:50:00' },
  { teamKey: 'team_1', challengeKey: 'the-cruise-guide', day: 5, hour: '13:40:00' },
  { teamKey: 'team_1', challengeKey: 'victory-dance', day: 5, hour: '17:10:00' },

  { teamKey: 'team_6', challengeKey: 'gym-buffs', day: 1, hour: '15:00:00' },
  { teamKey: 'team_6', challengeKey: 'good-spirits-mixology', day: 2, hour: '14:20:00' },
  { teamKey: 'team_6', challengeKey: 'room-service-delivery', day: 3, hour: '10:10:00' },
  { teamKey: 'team_6', challengeKey: 'deck-13-mystery', day: 3, hour: '13:00:00' },
  { teamKey: 'team_6', challengeKey: 'live-music-backdrop', day: 4, hour: '11:35:00' },
  { teamKey: 'team_6', challengeKey: 'mid-air-jump', day: 6, hour: '12:00:00' },

  { teamKey: 'team_2', challengeKey: 'high-wind-warning', day: 1, hour: '18:00:00' },
  { teamKey: 'team_2', challengeKey: 'bingo-champion', day: 3, hour: '11:00:00' },
  { teamKey: 'team_2', challengeKey: 'front-row-center', day: 4, hour: '09:40:00' },
  { teamKey: 'team_2', challengeKey: 'comically-lost', day: 6, hour: '11:05:00' },

  { teamKey: 'team_4', challengeKey: 'lotus-spa-zen', day: 2, hour: '14:30:00' },
  { teamKey: 'team_4', challengeKey: 'deck-dance-move', day: 4, hour: '10:00:00' },
  { teamKey: 'team_4', challengeKey: 'under-the-dome', day: 6, hour: '16:20:00' },
]

/** Challenges intentionally left unfinished for SI-12. */
export const PLAN_C_UNFINISHED_CHALLENGES = [
  'movies-under-the-stars',
  'guest-services',
  'stateroom-door-flair',
  'elevator-map',
  'nautical-rose',
  'ocean-wake',
  'captains-portrait',
  'souvenir-selection',
  'the-youth-club-entry',
  'triple-match',
  'shadow-art',
]

export const PLAN_C_QA = {
  drinkItPlayerKey: 'david_forrester',
  shipItPlayerKey: 'katie_forrester',
  shipItTeamKey: 'team_3',
}

function longCaption(seed) {
  return (
    `Lorem ipsum dolor sit amet, consectetur adipiscing elit. ` +
    `Sed do eiusmod tempor incididunt ut labore (${seed}). ` +
    `Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.`
  )
}

function detUuid(seed) {
  const h = createHash('sha256').update(seed).digest()
  const bytes = Buffer.from(h.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * @param {object} ctx helpers from demo-seed
 */
export async function seedWrappedPlanCFull(ctx) {
  const {
    service,
    identities,
    aligned,
    dayDate,
    shipLocalToUtcIso,
    clearFinaleLatchForHistoricalSeed,
    signIn,
    claimAt,
    ordinaryBeer,
    scavengerComplete,
    stagePhoto,
    lookupOffering,
    pickTeamSubmitter,
    loadPrivateShipItTeamConfig,
    assertOrganizerShipItTeams,
    root,
    photoStats,
  } = ctx

  const byKey = Object.fromEntries((identities.identities || []).map((i) => [i.key, i]))
  const requirePlayer = (key) => {
    const p = byKey[key]
    if (!p) throw new Error(`PLAN_C: missing identity ${key}`)
    return p
  }

  const offeringIds = {}
  for (const [code, meta] of Object.entries(PLAN_C_OFFERINGS)) {
    offeringIds[code] = await lookupOffering(meta.bar, meta.drink)
  }

  // Chronological merge of drinks, dailies, scavenger for latch-safe historical seed.
  const timeline = []

  for (const log of PLAN_C_DRINK_LOGS) {
    timeline.push({
      kind: 'drink',
      sort: `${log.day}-${log.time}-${log.id}`,
      day: log.day,
      time: log.time,
      log,
    })
  }
  for (const d of PLAN_C_DAILIES) {
    timeline.push({
      kind: 'daily',
      sort: `${d.day}-${d.time}-daily-${d.player}`,
      day: d.day,
      time: d.time,
      daily: d,
    })
  }

  const teamCfg = loadPrivateShipItTeamConfig(root)
  assertOrganizerShipItTeams(teamCfg, { requireConfirmed: true })
  const membersByTeamKey = new Map()
  for (const team of teamCfg.teams) {
    const memberKeys = Object.entries(teamCfg.assignments)
      .filter(([, k]) => k === team.key)
      .map(([playerKey]) => playerKey)
    const members = memberKeys.map((k) => byKey[k]).filter(Boolean)
    if (!members.length) throw new Error(`PLAN_C: no members for ${team.key}`)
    membersByTeamKey.set(team.key, members)
  }

  const perTeamIndex = new Map()
  for (const [i, step] of PLAN_C_SCAVENGER.entries()) {
    const idx = perTeamIndex.get(step.teamKey) || 0
    perTeamIndex.set(step.teamKey, idx + 1)
    timeline.push({
      kind: 'scavenger',
      sort: `${step.day}-${step.hour}-scav-${step.teamKey}-${step.challengeKey}`,
      day: step.day,
      time: step.hour,
      scav: step,
      scavIndex: i,
      submitIdx: idx,
    })
  }

  timeline.sort((a, b) => a.sort.localeCompare(b.sort))

  /** @type {Map<string, { submissionId: string, photoId: string | null, eventId: string | null }>} */
  const logMeta = new Map()
  const activity = []
  const roleSubmission = new Map()

  // Ensure bar bounty crews for days that claim bar bounties.
  for (const day of [1, 2, 3]) {
    await clearFinaleLatchForHistoricalSeed()
    const at = shipLocalToUtcIso(dayDate(aligned.day1, day), '14:00:00', aligned.offsetMinutes)
    const { data: crewEnsure, error: crewErr } = await service.rpc('dev_ensure_bar_bounty_crews_at', {
      p_at_utc: at,
      p_seed: `plan-c-full-day-${day}`,
    })
    if (crewErr) console.warn(`  plan-c crew day ${day}:`, crewErr.message)
    else if (crewEnsure?.ok) {
      console.log(`  Plan C bar bounty crews day ${day}: ${crewEnsure.crews?.length ?? 0} crews`)
    }
  }

  for (const item of timeline) {
    await clearFinaleLatchForHistoricalSeed()
    const at = shipLocalToUtcIso(dayDate(aligned.day1, item.day), item.time, aligned.offsetMinutes)

    if (item.kind === 'drink') {
      const log = item.log
      const player = requirePlayer(log.player)
      const companions = (log.companions || []).map((k) => requirePlayer(k).player_id)
      const caption = log.photoRole
        ? longCaption(`${log.id}-${log.photoRole}`)
        : `Lorem ipsum ${log.id}`

      let data
      if (log.offer === 'BEER') {
        data = await ordinaryBeer(player, 'promenade-bars', at, `plan-c-${log.id}`, {
          withPhoto: Boolean(log.photoRole),
        })
      } else {
        const offer = PLAN_C_OFFERINGS[log.offer]
        // claimAt uses fixed "Demo" captions — submit via local path for captions when photo.
        data = await claimAtPlanC(ctx, {
          player,
          barKey: offer.bar,
          offeringId: offeringIds[log.offer],
          atUtc: at,
          seed: `plan-c-${log.id}`,
          companions,
          selectBounties: log.claim,
          withPhoto: Boolean(log.photoRole),
          caption,
        })
      }

      const submissionId = data?.submission_id || null
      if (log.photoRole && submissionId) roleSubmission.set(log.photoRole, submissionId)
      if (submissionId) logMeta.set(log.id, { submissionId, photoId: data?.photo_id ?? null, eventId: null })
      activity.push({
        type: 'drink',
        id: log.id,
        player: log.player,
        ok: data?.ok,
        points: data?.awarded_points,
        photoRole: log.photoRole,
      })
      if (!data?.ok) console.warn(`  plan-c drink ${log.id}: ${data?.code || 'failed'}`)
      continue
    }

    if (item.kind === 'daily') {
      const d = item.daily
      const player = requirePlayer(d.player)
      const client = await signIn(player.login_alias)
      const { data: challenge, error: chErr } = await service
        .from('daily_challenges')
        .select('id, title, day_number')
        .eq('day_number', d.day)
        .single()
      if (chErr || !challenge) {
        console.warn(`  plan-c daily day ${d.day}: ${chErr?.message || 'missing'}`)
        continue
      }
      const staged = await stagePhoto(client, 'drinkit', 'daily', `plan-c-daily-${d.day}`, {
        preferPrivate: true,
      })
      const res = await service.rpc('dev_submit_daily_at', {
        p_player_id: player.player_id,
        p_at_utc: at,
        p_payload: {
          idempotency_key: detUuid(`plan-c-daily:${d.day}:${d.player}`),
          challenge_id: challenge.id,
          photo_id: staged.photoId,
          caption: longCaption(`daily-d${d.day}`),
          attest_participation: true,
        },
      })
      activity.push({
        type: 'daily',
        day: d.day,
        player: d.player,
        ok: res.data?.ok,
        points: res.data?.awarded_points,
      })
      if (!res.data?.ok) console.warn(`  plan-c daily d${d.day}: ${res.data?.code || res.error?.message}`)
      continue
    }

    if (item.kind === 'scavenger') {
      const step = item.scav
      const members = membersByTeamKey.get(step.teamKey)
      const player = pickTeamSubmitter(members, item.submitIdx)
      const client = await signIn(player.login_alias)
      // Override caption via direct scavenger path
      const { data: ch } = await service
        .from('scavenger_challenges')
        .select('id, title, points')
        .eq('canonical_key', step.challengeKey)
        .single()
      const staged = await stagePhoto(
        client,
        'shipit',
        'scavenger',
        `plan-c-scav-${step.teamKey}-${step.challengeKey}`,
        { preferPrivate: true },
      )
      if (photoStats) photoStats.scavenger_with_photo += 1
      const res = await service.rpc('dev_submit_scavenger_at', {
        p_player_id: player.player_id,
        p_at_utc: at,
        p_payload: {
          idempotency_key: detUuid(`plan-c-scav:${step.teamKey}:${step.challengeKey}`),
          challenge_id: ch.id,
          photo_id: staged.photoId,
          caption: longCaption(`${step.teamKey}-${step.challengeKey}`),
        },
      })
      activity.push({
        type: 'scavenger',
        team_key: step.teamKey,
        key: step.challengeKey,
        player: player.key,
        ok: res.data?.ok,
        points: res.data?.awarded_points,
      })
      if (!res.data?.ok) {
        console.warn(`  plan-c scav ${step.teamKey}/${step.challengeKey}: ${res.data?.code}`)
      }
    }
  }

  // Load drink submissions once and resolve gallery events in JS.
  // Avoid PostgREST filters that include raw ')' (breaks ilike patterns).
  const { data: drinkSubs, error: drinkSubsErr } = await service
    .from('submissions')
    .select('id, gallery_event_id, caption')
    .eq('game', 'drinkit')
    .eq('status', 'accepted')
    .not('gallery_event_id', 'is', null)
    .limit(200)
  if (drinkSubsErr) console.warn(`  plan-c submission load: ${drinkSubsErr.message}`)
  const drinkSubRows = drinkSubs || []

  function resolveEventIdForRole(role) {
    const log = PLAN_C_DRINK_LOGS.find((l) => l.photoRole === role)
    if (!log) return null
    const needle = `(${log.id}-${role})`
    const row = drinkSubRows.find((r) => String(r.caption || '').includes(needle))
    return row?.gallery_event_id || null
  }

  function resolveEventIdForLogId(logId) {
    const fromMeta = logMeta.get(logId)
    if (fromMeta?.submissionId) {
      const hit = drinkSubRows.find((r) => r.id === fromMeta.submissionId)
      if (hit?.gallery_event_id) return hit.gallery_event_id
    }
    const row =
      drinkSubRows.find((r) => String(r.caption || '').includes(`(${logId}-`)) ||
      drinkSubRows.find((r) => String(r.caption || '') === `Lorem ipsum ${logId}`)
    return row?.gallery_event_id || null
  }

  const roleEvents = new Map()
  for (const role of Object.keys(PLAN_C_FEATURED_REACTIONS)) {
    const eventId = resolveEventIdForRole(role)
    if (eventId) roleEvents.set(role, eventId)
    else console.warn(`  plan-c: no gallery event for photoRole ${role}`)
  }

  for (const [role, reactions] of Object.entries(PLAN_C_FEATURED_REACTIONS)) {
    const eventId = roleEvents.get(role)
    if (!eventId) {
      console.warn(`  plan-c reactions skip ${role}: no event`)
      continue
    }
    for (const r of reactions) {
      const reactor = requirePlayer(r.player)
      const client = await signIn(reactor.login_alias)
      const res = await client.rpc('set_gallery_reaction', {
        p_event_id: eventId,
        p_emoji: r.emoji,
      })
      if (res.error || !res.data?.ok) {
        console.warn(`  plan-c reaction ${role}/${r.player}: ${res.error?.message || res.data?.code}`)
      }
    }
  }

  for (const filler of PLAN_C_FILLER_REACTIONS) {
    const eventId = await resolveEventIdForLogId(filler.logId)
    if (!eventId) continue
    for (const r of filler.reactions) {
      const reactor = requirePlayer(r.player)
      const client = await signIn(reactor.login_alias)
      await client.rpc('set_gallery_reaction', { p_event_id: eventId, p_emoji: r.emoji })
    }
  }

  // Light Ship It! reactions for visual density (optional; not required for SI slides).
  const { data: shipEvents } = await service
    .from('gallery_events')
    .select('id')
    .eq('game', 'shipit')
    .eq('kind', 'scavenger')
    .eq('active', true)
    .order('created_at_utc', { ascending: true })
    .limit(12)
  const shipReactors = ['katie_forrester', 'josh_forrester', 'mark_rector', 'debbie_forrester', 'triss_forrester']
    .map((k) => byKey[k])
    .filter(Boolean)
  const emojis = ['heart', 'laugh', 'hang_loose']
  let shipReactionOk = 0
  for (const [i, ev] of (shipEvents || []).entries()) {
    const reactor = shipReactors[i % shipReactors.length]
    if (!reactor) continue
    const client = await signIn(reactor.login_alias)
    const res = await client.rpc('set_gallery_reaction', {
      p_event_id: ev.id,
      p_emoji: emojis[i % emojis.length],
    })
    if (res.data?.ok) shipReactionOk += 1
  }

  console.log(
    `Plan C full seed: ${activity.filter((a) => a.type === 'drink').length} drinks, ` +
      `${activity.filter((a) => a.type === 'daily').length} dailies, ` +
      `${activity.filter((a) => a.type === 'scavenger').length} scavenger, ` +
      `${shipReactionOk} ship reactions`,
  )
  console.log(
    `Plan C QA accounts: Drink It! ${PLAN_C_QA.drinkItPlayerKey}, Ship It! ${PLAN_C_QA.shipItPlayerKey} (${PLAN_C_QA.shipItTeamKey})`,
  )
  console.log(`Plan C unfinished challenges (expected): ${PLAN_C_UNFINISHED_CHALLENGES.length}`)

  return { activity, qa: PLAN_C_QA, unfinished: PLAN_C_UNFINISHED_CHALLENGES }
}

/**
 * Local claim helper with custom caption (demo-seed claimAt uses fixed Demo captions).
 */
async function claimAtPlanC(ctx, opts) {
  const {
    service,
    signIn,
    stagePhoto,
    detUuid: detUuidFn,
  } = ctx
  const uuid = detUuidFn || detUuid
  const {
    player,
    barKey,
    offeringId,
    atUtc,
    seed,
    companions = [],
    selectBounties = true,
    withPhoto = false,
    caption,
  } = opts

  await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: atUtc })
  await service.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: atUtc })
  const preview = await service.rpc('dev_preview_drink_claims_at', {
    p_player_id: player.player_id,
    p_at_utc: atUtc,
    p_payload: {
      idempotency_key: uuid(`prev:${seed}`),
      bar_canonical_key: barKey,
      drink: { mode: 'named_catalog', offering_id: offeringId },
      companion_player_ids: companions,
      bar_eligible_companion_ids: companions,
      selected_claims: [],
      caption: null,
      photo_storage_key: null,
    },
  })
  const selected = []
  if (selectBounties && preview.data?.preview?.categories) {
    const cats = preview.data.preview.categories
    if (cats.cocktail?.status === 'eligible' && cats.cocktail.options?.[0]) {
      selected.push({ category: 'cocktail', offer_id: cats.cocktail.options[0].offer_id })
    }
    if (cats.ingredient?.status === 'eligible' && cats.ingredient.options?.[0]) {
      selected.push({ category: 'ingredient', offer_id: cats.ingredient.options[0].offer_id })
    }
    if (cats.bar?.status === 'eligible' && cats.bar.options?.[0]) {
      selected.push({ category: 'bar', assignment_id: cats.bar.options[0].assignment_id })
    }
  }

  let photoId = null
  if (withPhoto) {
    const client = await signIn(player.login_alias)
    const staged = await stagePhoto(client, 'drinkit', 'drink_log', `drink-${seed}`, {
      preferPrivate: true,
    })
    photoId = staged.photoId
    if (ctx.photoStats) ctx.photoStats.drink_with_photo += 1
  }

  const payload = {
    idempotency_key: uuid(`drink:${seed}`),
    bar_canonical_key: barKey,
    drink: { mode: 'named_catalog', offering_id: offeringId },
    companion_player_ids: companions,
    bar_eligible_companion_ids: companions,
    selected_claims: selected,
    caption: caption || `Lorem ipsum ${seed}`,
    photo_storage_key: null,
  }
  if (photoId) payload.photo_id = photoId

  const res = await service.rpc('dev_submit_drink_at', {
    p_player_id: player.player_id,
    p_at_utc: atUtc,
    p_payload: payload,
  })
  if (res.error) throw res.error
  return res.data
}
