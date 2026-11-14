/**
 * Development-only: light polish of Tuesday midgame Gallery captions + reactions.
 *
 * Does NOT reseed, reset, or switch scenarios. Updates existing accepted
 * drink_log / scavenger / daily submission captions and gallery_reactions only.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/demo-polish-tuesday-gallery.mjs
 *
 * Safety: local Supabase + development-only cruise + Tuesday (day 4 active) required.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ws from 'ws'
import {
  assertDevelopmentOnlyCruise,
  assertLocalSupabaseUrl,
  readSupabaseEnv,
} from './lib/demoLocalSafety.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')
const outDir = join(root, '.local/gallery-polish')
mkdirSync(outDir, { recursive: true })

const SCAVENGER_CAPTION_LIMIT = 500 // submit_scavenger / submit_daily left(..., 500)

const SHORT = [
  'Great start',
  'So good',
  'Worth it',
  'Solid pick',
  'Loved this one',
  'Pretty good!',
  'Fun one',
  'New favorite',
  'Strong recommend',
  'Vacation mode',
  'Cheers!',
  'So tropical',
  'Very good',
  'Not bad at all',
  'This one wins',
  'Would order again',
]

const MEDIUM = [
  'Good pick for the afternoon.',
  'This one was better than expected.',
  'Definitely ordering this again.',
  'Really liked this one.',
  'One of my favorites so far.',
  'Glad we tried this.',
  'This was a good call.',
  'Very solid drink choice.',
  'Fun stop and a good drink.',
  'This one lived up to the hype.',
  'Nice one for poolside.',
  'Great flavor on this one.',
  'This might be my favorite bar so far.',
  'Good drink, good company.',
  'Glad somebody talked me into this one.',
]

const GROUP = [
  'Good stop with the crew.',
  'Fun one with everybody.',
  'Great bar, great company.',
  'This was a fun group pick.',
  'Good one to share with the crew.',
  'Crew approved.',
  'Solid stop for the group.',
  'Fun round with everyone.',
  'This one got good reviews all around.',
  'Nice little group stop.',
]

const PLAYFUL = [
  'No notes.',
  '10/10 would cruise again.',
  'This one disappeared fast.',
  'Dangerous in the best way.',
  'A very easy yes.',
  'This felt like vacation.',
  'Big fan of this one.',
  'Might need this one again tomorrow.',
  'Happy with this choice.',
  'This one was a hit.',
]

const LONG_DRINK = {
  moderate: `I wasn't really planning on trying this one, but someone at the table recommended it and I figured why not. Actually turned out pretty good! Not sure I'd order it every time, but I'm glad I gave it a shot. That's half the fun of being on vacation anyway.`,
  conversational: `Okay, so here's the story. We went to the bar intending to grab one quick drink before heading somewhere else. Then somebody noticed something interesting on the menu, which started a whole conversation about what everybody should order. Naturally, nobody could agree on anything.

After about ten minutes of deliberation, we finally ordered, and I have to say it was worth the trouble. I still think my choice was the best, but apparently that's a controversial opinion. We'll probably have to come back and settle this another day.`,
  extreme: `I feel like this deserves a proper review because the entire experience turned into a much bigger production than it needed to be. It started with a very simple question: what should I order? You would think that would be easy, considering we're surrounded by bars, menus, and people who have been ordering drinks for several days now. Apparently not.

First, everybody had an opinion. Somebody recommended something fruity. Somebody else suggested going with a classic. Then we got into a discussion about whether trying something new was actually a good idea when you already know what you like. That conversation somehow turned into a completely unrelated debate about dinner plans, which is impressive considering we hadn't even ordered anything yet.

Eventually, I picked something that wasn't even on my original shortlist. Was it the best drink I've had on the cruise? Maybe not. Was it worth all the discussion? Absolutely, because the discussion was probably funnier than the drink itself.

Anyway, if you've made it this far, congratulations. You have officially spent more time reading my drink review than I spent deciding what to order, which is really saying something. I don't know whether anyone actually needs this much information about a single cocktail, but here we are. Five stars for the company, four stars for the drink, and zero stars for our collective ability to make a decision.`,
}

const LONG_SHIP = {
  moderate: `This challenge looked a lot easier on the list than it actually was. We spent way too long trying to get everybody in the right spot for the picture. At least we got it done, and I think the final photo turned out pretty good!`,
  conversational: `I'm not going to name names, but somebody on this team apparently thinks that taking a picture requires the same level of planning as a professional photo shoot. We had to move over a little, then move back, then take another one because somebody blinked.

After all that, we ended up using one of the first pictures anyway. Honestly, that feels about right for this team. Challenge complete, everybody accounted for, and we only lost a completely unreasonable amount of time getting there.`,
  extreme: `I'd like to formally document the events leading up to the completion of this challenge because I believe future generations deserve to know what happened here.

We started with a perfectly reasonable plan. Find the location, take the picture, submit the challenge, and move on with our day. Simple enough. Unfortunately, our team has apparently never encountered a simple task that couldn't be made significantly more complicated.

First, we couldn't agree on where everybody should stand. Then somebody decided the lighting wasn't right. Then we discovered that the person taking the picture wasn't actually getting the entire group in the frame. By the time we fixed that, somebody else had wandered off to look at something completely unrelated to the challenge.

We eventually got everyone back together and tried again. The first picture was blurry. The second one had someone looking away. The third one was actually pretty good, but naturally we decided to take several more just in case. By that point, we had completely forgotten what the original challenge was supposed to be about.

The important thing is that we finished. I don't know whether this counts as teamwork, persistence, or a complete inability to stay focused, but I'm choosing to call it teamwork. If there's an award for making a five-minute scavenger hunt challenge take twenty minutes, I think we've earned it.

Also, for anyone reading this entire caption, thank you for your dedication. I hope this experience has been as educational for you as it was for us. Please enjoy the photograph, because it took an unreasonable amount of effort to produce.`,
}

const EMOJIS = ['heart', 'laugh', 'hang_loose']

function detInt(seed, mod) {
  const h = createHash('sha256').update(String(seed)).digest()
  return h.readUInt32BE(0) % mod
}

function clipCaption(text, limit) {
  if (!text) return { text: null, truncated: false, originalLen: 0 }
  const originalLen = text.length
  if (originalLen <= limit) return { text, truncated: false, originalLen }
  // Prefer a clean sentence/paragraph break near the limit.
  let cut = text.slice(0, limit)
  const breakAt = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('. '), cut.lastIndexOf('! '))
  if (breakAt > Math.floor(limit * 0.6)) {
    cut = cut.slice(0, breakAt + (cut[breakAt] === '.' || cut[breakAt] === '!' ? 1 : 0)).trimEnd()
  } else {
    cut = cut.trimEnd()
  }
  return { text: cut, truncated: true, originalLen }
}

function summarizeCaptions(rows) {
  const withCap = rows.filter((r) => r.caption && String(r.caption).trim())
  const lens = withCap.map((r) => String(r.caption).length)
  return {
    posts: rows.length,
    withCaption: withCap.length,
    noCaption: rows.length - withCap.length,
    uniqueCaptions: new Set(withCap.map((r) => r.caption)).size,
    len: lens.length
      ? {
          min: Math.min(...lens),
          max: Math.max(...lens),
          avg: Math.round(lens.reduce((a, b) => a + b, 0) / lens.length),
        }
      : null,
  }
}

function summarizeReactions(totals) {
  const buckets = { 0: 0, '1-2': 0, '3-5': 0, '6-8': 0, '9+': 0 }
  for (const n of totals) {
    if (n === 0) buckets[0] += 1
    else if (n <= 2) buckets['1-2'] += 1
    else if (n <= 5) buckets['3-5'] += 1
    else if (n <= 8) buckets['6-8'] += 1
    else buckets['9+'] += 1
  }
  return {
    totalReactionRows: totals.reduce((a, b) => a + b, 0),
    buckets,
    avg: totals.length
      ? Number((totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(2))
      : 0,
  }
}

function pickPoolCaption(pools, used, seed) {
  const flat = pools.flat()
  // Prefer unused; fall back to least-recently-used among pool.
  const unused = flat.filter((c) => !used.has(c))
  const choices = unused.length ? unused : flat
  const pick = choices[detInt(seed, choices.length)]
  used.add(pick)
  return pick
}

function assignCaptions(posts, game) {
  // Newest-first feed order (created_at_utc desc).
  const ordered = [...posts].sort((a, b) => String(b.created_at_utc).localeCompare(String(a.created_at_utc)))
  const used = new Set()
  const longSet = game === 'drinkit' ? LONG_DRINK : LONG_SHIP
  const limit = game === 'shipit' || ordered.some((p) => p.kind === 'daily' || p.kind === 'scavenger')
    ? SCAVENGER_CAPTION_LIMIT
    : Number.POSITIVE_INFINITY

  // Place long captions with spacing: near top, mid, and lower third.
  const longSlots = []
  if (ordered.length >= 3) {
    longSlots.push(
      { index: 1, key: 'moderate' },
      { index: Math.min(Math.floor(ordered.length / 2), ordered.length - 2), key: 'conversational' },
      { index: Math.min(ordered.length - 2, Math.max(2, Math.floor((ordered.length * 2) / 3))), key: 'extreme' },
    )
  } else {
    for (const [i, key] of ['moderate', 'conversational', 'extreme'].entries()) {
      if (i < ordered.length) longSlots.push({ index: i, key })
    }
  }
  // Deduplicate indices if small lists collide.
  const seenIdx = new Set()
  const uniqueLongSlots = []
  for (const slot of longSlots) {
    let idx = slot.index
    while (seenIdx.has(idx) && idx + 1 < ordered.length) idx += 1
    if (seenIdx.has(idx)) continue
    seenIdx.add(idx)
    uniqueLongSlots.push({ ...slot, index: idx })
  }

  const noCaptionTarget =
    game === 'drinkit'
      ? Math.max(2, Math.round(ordered.length * 0.25))
      : Math.max(6, Math.round(ordered.length * 0.22))

  // Spread no-caption indices away from long slots and each other.
  const blocked = new Set(uniqueLongSlots.map((s) => s.index))
  const noCapIdx = []
  for (let i = 0; i < ordered.length && noCapIdx.length < noCaptionTarget; i++) {
    if (blocked.has(i)) continue
    if (noCapIdx.length && i - noCapIdx[noCapIdx.length - 1] < 2) continue
    // Skip every third candidate for natural gaps.
    if (detInt(`${game}:nocap:${i}`, 3) === 0) continue
    noCapIdx.push(i)
    blocked.add(i)
  }
  // Fill remaining no-cap if still short.
  for (let i = 0; i < ordered.length && noCapIdx.length < noCaptionTarget; i++) {
    if (blocked.has(i)) continue
    noCapIdx.push(i)
    blocked.add(i)
  }

  const plan = new Map()
  const limitations = []

  for (const slot of uniqueLongSlots) {
    const post = ordered[slot.index]
    const raw = longSet[slot.key]
    const appliedLimit =
      post.kind === 'scavenger' || post.kind === 'daily' ? SCAVENGER_CAPTION_LIMIT : Number.POSITIVE_INFINITY
    const clipped = clipCaption(raw, appliedLimit === Number.POSITIVE_INFINITY ? raw.length : appliedLimit)
    if (clipped.truncated) {
      limitations.push({
        game,
        kind: post.kind,
        longKey: slot.key,
        event_id: post.event_id,
        submission_id: post.submission_id,
        originalLen: clipped.originalLen,
        storedLen: clipped.text.length,
        limit: appliedLimit,
        note: `${post.kind} submit path truncates captions to ${appliedLimit}; stored longest valid excerpt.`,
      })
    }
    plan.set(post.event_id, {
      caption: clipped.text,
      bucket: `long_${slot.key}`,
      truncated: clipped.truncated,
    })
  }

  for (const i of noCapIdx) {
    const post = ordered[i]
    if (plan.has(post.event_id)) continue
    plan.set(post.event_id, { caption: null, bucket: 'none', truncated: false })
  }

  // Remaining: rotate short / medium / group / playful with adjacency avoidance.
  let prevBucket = null
  let prevCaption = null
  for (let i = 0; i < ordered.length; i++) {
    const post = ordered[i]
    if (plan.has(post.event_id)) {
      prevBucket = plan.get(post.event_id).bucket
      prevCaption = plan.get(post.event_id).caption
      continue
    }
    const preferGroup = post.kind === 'scavenger' || detInt(`${game}:grp:${i}`, 5) === 0
    let pools
    const roll = detInt(`${game}:bucket:${i}`, 10)
    if (preferGroup && roll < 4) {
      pools = [GROUP, PLAYFUL, SHORT]
      prevBucket = 'group'
    } else if (roll < 4) {
      pools = [SHORT, PLAYFUL]
      prevBucket = 'short'
    } else if (roll < 7) {
      pools = [MEDIUM, SHORT]
      prevBucket = 'medium'
    } else if (roll < 9) {
      pools = [PLAYFUL, SHORT]
      prevBucket = 'playful'
    } else {
      pools = [GROUP, MEDIUM]
      prevBucket = 'group'
    }
    // Avoid repeating same caption as previous visible caption.
    let caption = pickPoolCaption(pools, used, `${game}:cap:${post.event_id}`)
    let guard = 0
    while (caption === prevCaption && guard < 8) {
      caption = pickPoolCaption(pools, used, `${game}:cap:${post.event_id}:${guard}`)
      guard += 1
    }
    // Soft avoid same bucket string length class back-to-back when possible.
    if (prevBucket === 'short' && caption.length > 40) {
      // ok
    }
    plan.set(post.event_id, { caption, bucket: prevBucket, truncated: false })
    prevCaption = caption
  }

  void limit
  return { plan, limitations, ordered }
}

function assignReactionTargets(posts, game) {
  const ordered = [...posts].sort((a, b) => String(b.created_at_utc).localeCompare(String(a.created_at_utc)))
  const n = ordered.length
  const targets = new Map()

  const standoutCount = game === 'drinkit' ? Math.min(1, n) : Math.min(2, n)
  const midCount = game === 'drinkit' ? Math.min(2, Math.max(0, n - standoutCount)) : Math.min(5, Math.max(0, n - standoutCount))
  const zeroCount =
    game === 'drinkit'
      ? Math.max(3, Math.round(n * 0.35))
      : Math.max(10, Math.round(n * 0.38))

  const indices = ordered.map((_, i) => i)
  // Deterministic shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = detInt(`${game}:rxn-shuf:${i}`, i + 1)
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  let cursor = 0
  const take = (count, totalMin, totalMax) => {
    for (let k = 0; k < count && cursor < indices.length; k++, cursor++) {
      const idx = indices[cursor]
      const span = totalMax - totalMin + 1
      const total = totalMin + detInt(`${game}:rxn-n:${idx}`, span)
      targets.set(ordered[idx].event_id, total)
    }
  }

  take(standoutCount, 6, 8)
  take(midCount, 3, 5)
  // Remaining: mix of 0 and 1-2, with explicit zero quota.
  const remaining = indices.slice(cursor)
  const zerosNeeded = Math.min(zeroCount, remaining.length)
  for (let k = 0; k < remaining.length; k++) {
    const idx = remaining[k]
    const eventId = ordered[idx].event_id
    if (k < zerosNeeded) targets.set(eventId, 0)
    else targets.set(eventId, 1 + detInt(`${game}:rxn-low:${idx}`, 2)) // 1 or 2
  }

  return targets
}

function buildReactionRows(eventId, total, playerIds, seed) {
  if (total <= 0 || !playerIds.length) return []
  const count = Math.min(total, playerIds.length)
  const chosen = []
  const pool = [...playerIds]
  for (let i = 0; i < count; i++) {
    const j = detInt(`${seed}:player:${i}:${eventId}`, pool.length)
    chosen.push(pool.splice(j, 1)[0])
  }
  // Mix emoji types; not every post needs every type.
  const patternRoll = detInt(`${seed}:emoji-pattern:${eventId}`, 4)
  const palette =
    patternRoll === 0
      ? ['heart']
      : patternRoll === 1
        ? ['heart', 'laugh']
        : patternRoll === 2
          ? ['heart', 'hang_loose']
          : ['heart', 'laugh', 'hang_loose']

  return chosen.map((player_id, i) => ({
    event_id: eventId,
    player_id,
    emoji: palette[detInt(`${seed}:emoji:${eventId}:${i}`, palette.length)],
  }))
}

async function loadEligible(service) {
  const { data: events, error } = await service
    .from('gallery_events')
    .select('id, game, kind, submission_id, created_at_utc, active')
    .eq('active', true)
    .in('kind', ['drink_log', 'daily', 'scavenger'])
    .order('created_at_utc', { ascending: false })
  if (error) throw error

  const subIds = [...new Set((events || []).map((e) => e.submission_id).filter(Boolean))]
  const { data: subs, error: sErr } = await service
    .from('submissions')
    .select('id, caption, status, photo_storage_key')
    .in('id', subIds.length ? subIds : ['00000000-0000-0000-0000-000000000000'])
  if (sErr) throw sErr
  const subById = new Map((subs || []).map((s) => [s.id, s]))

  const { data: reactions, error: rErr } = await service
    .from('gallery_reactions')
    .select('event_id, emoji, player_id')
  if (rErr) throw rErr

  const rxByEvent = new Map()
  for (const r of reactions || []) {
    const cur = rxByEvent.get(r.event_id) || { total: 0, rows: [] }
    cur.total += 1
    cur.rows.push(r)
    rxByEvent.set(r.event_id, cur)
  }

  const rows = (events || []).map((e) => {
    const sub = subById.get(e.submission_id)
    const caption = sub?.caption && String(sub.caption).trim() ? String(sub.caption) : null
    return {
      event_id: e.id,
      submission_id: e.submission_id,
      game: e.game,
      kind: e.kind,
      created_at_utc: e.created_at_utc,
      caption,
      status: sub?.status ?? null,
      hasPhoto: Boolean(sub?.photo_storage_key),
      reactions: rxByEvent.get(e.id)?.total || 0,
    }
  })

  return { rows, reactions: reactions || [] }
}

async function main() {
  const sbEnv = readSupabaseEnv()
  const url = sbEnv.API_URL || sbEnv.SUPABASE_URL
  assertLocalSupabaseUrl(url)
  const service = createClient(url, sbEnv.SERVICE_ROLE_KEY || sbEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  })

  const cruise = await assertDevelopmentOnlyCruise(service)
  if (!cruise) throw new Error('DEMO_SAFETY: no active cruise')

  const { data: clock, error: clockErr } = await service.rpc('get_ship_clock_state')
  if (clockErr) throw clockErr
  if (!(clock?.cruise_day === 4 && clock?.lifecycle === 'active' && !clock?.finalized)) {
    throw new Error(
      `DEMO_SAFETY: refusing polish — expected Tuesday midgame (day 4 active). Got day=${clock?.cruise_day} lifecycle=${clock?.lifecycle} finalized=${clock?.finalized}`,
    )
  }

  const beforeBundle = await loadEligible(service)
  const beforeDrink = beforeBundle.rows.filter((r) => r.game === 'drinkit')
  const beforeShip = beforeBundle.rows.filter((r) => r.game === 'shipit')

  const before = {
    drinkit: {
      captions: summarizeCaptions(beforeDrink),
      reactions: summarizeReactions(beforeDrink.map((r) => r.reactions)),
    },
    shipit: {
      captions: summarizeCaptions(beforeShip),
      reactions: summarizeReactions(beforeShip.map((r) => r.reactions)),
    },
    reactionRows: beforeBundle.reactions.length,
  }

  const drinkPlan = assignCaptions(beforeDrink, 'drinkit')
  const shipPlan = assignCaptions(beforeShip, 'shipit')
  const limitations = [...drinkPlan.limitations, ...shipPlan.limitations]

  const captionUpdates = []
  for (const post of [...beforeDrink, ...beforeShip]) {
    const plan = (post.game === 'drinkit' ? drinkPlan : shipPlan).plan.get(post.event_id)
    if (!plan) continue
    const next = plan.caption
    const prev = post.caption
    if ((prev || null) === (next || null)) continue
    captionUpdates.push({
      submission_id: post.submission_id,
      event_id: post.event_id,
      game: post.game,
      kind: post.kind,
      bucket: plan.bucket,
      beforeLen: prev ? prev.length : 0,
      afterLen: next ? next.length : 0,
      caption: next,
    })
  }

  // Apply caption updates (accepted submissions only; achievements untouched).
  for (const u of captionUpdates) {
    const { error } = await service
      .from('submissions')
      .update({ caption: u.caption })
      .eq('id', u.submission_id)
      .eq('status', 'accepted')
    if (error) throw new Error(`caption update failed ${u.submission_id}: ${error.message}`)
  }

  // Memberships for reaction players
  const { data: memberships, error: mErr } = await service
    .from('game_memberships')
    .select('player_id, game, enabled')
    .eq('enabled', true)
  if (mErr) throw mErr
  const { data: activePlayers } = await service.from('players').select('id').eq('active', true)
  const activeIds = new Set((activePlayers || []).map((p) => p.id))
  const drinkPlayers = (memberships || [])
    .filter((m) => m.game === 'drinkit' && activeIds.has(m.player_id))
    .map((m) => m.player_id)
  const shipPlayers = (memberships || [])
    .filter((m) => m.game === 'shipit' && activeIds.has(m.player_id))
    .map((m) => m.player_id)

  const drinkRxTargets = assignReactionTargets(beforeDrink, 'drinkit')
  const shipRxTargets = assignReactionTargets(beforeShip, 'shipit')

  const eligibleEventIds = [...beforeDrink, ...beforeShip].map((r) => r.event_id)

  // Replace reactions only on eligible demo posts (not achievements).
  if (eligibleEventIds.length) {
    const { error: delErr } = await service
      .from('gallery_reactions')
      .delete()
      .in('event_id', eligibleEventIds)
    if (delErr) throw new Error(`reaction clear failed: ${delErr.message}`)
  }

  const insertRows = []
  for (const post of beforeDrink) {
    insertRows.push(
      ...buildReactionRows(
        post.event_id,
        drinkRxTargets.get(post.event_id) || 0,
        drinkPlayers,
        'drinkit',
      ),
    )
  }
  for (const post of beforeShip) {
    insertRows.push(
      ...buildReactionRows(
        post.event_id,
        shipRxTargets.get(post.event_id) || 0,
        shipPlayers,
        'shipit',
      ),
    )
  }

  // Chunk inserts
  for (let i = 0; i < insertRows.length; i += 100) {
    const chunk = insertRows.slice(i, i + 100)
    const { error } = await service.from('gallery_reactions').insert(chunk)
    if (error) throw new Error(`reaction insert failed: ${error.message}`)
  }

  const afterBundle = await loadEligible(service)
  const afterDrink = afterBundle.rows.filter((r) => r.game === 'drinkit')
  const afterShip = afterBundle.rows.filter((r) => r.game === 'shipit')
  const after = {
    drinkit: {
      captions: summarizeCaptions(afterDrink),
      reactions: summarizeReactions(afterDrink.map((r) => r.reactions)),
      long: afterDrink
        .filter((r) => r.caption && r.caption.length >= 180)
        .map((r) => ({
          event_id: r.event_id,
          kind: r.kind,
          len: r.caption.length,
          preview: r.caption.slice(0, 72),
        })),
    },
    shipit: {
      captions: summarizeCaptions(afterShip),
      reactions: summarizeReactions(afterShip.map((r) => r.reactions)),
      long: afterShip
        .filter((r) => r.caption && r.caption.length >= 180)
        .map((r) => ({
          event_id: r.event_id,
          kind: r.kind,
          len: r.caption.length,
          preview: r.caption.slice(0, 72),
        })),
    },
    reactionRows: afterBundle.reactions.filter((r) => eligibleEventIds.includes(r.event_id)).length,
  }

  const { data: clockAfter } = await service.rpc('get_ship_clock_state')
  const report = {
    polished_at: new Date().toISOString(),
    cruise: { id: cruise.id, label: cruise.label },
    tuesday_before: {
      cruise_day: clock.cruise_day,
      lifecycle: clock.lifecycle,
      finalized: clock.finalized,
      ship_local: clock.ship_local,
    },
    tuesday_after: {
      cruise_day: clockAfter?.cruise_day,
      lifecycle: clockAfter?.lifecycle,
      finalized: clockAfter?.finalized,
      ship_local: clockAfter?.ship_local,
    },
    records: {
      captionsUpdated: captionUpdates.length,
      reactionsDeletedFromEligible: beforeBundle.reactions.filter((r) =>
        eligibleEventIds.includes(r.event_id),
      ).length,
      reactionsInserted: insertRows.length,
      achievementEventsUntouched: true,
    },
    before,
    after,
    limitations,
    captionBuckets: {
      drinkit: Object.fromEntries(
        [...drinkPlan.plan.values()].reduce((m, v) => {
          m.set(v.bucket, (m.get(v.bucket) || 0) + 1)
          return m
        }, new Map()),
      ),
      shipit: Object.fromEntries(
        [...shipPlan.plan.values()].reduce((m, v) => {
          m.set(v.bucket, (m.get(v.bucket) || 0) + 1)
          return m
        }, new Map()),
      ),
    },
    notes: [
      'Read More / Show less is implemented for Drink It! drink_log social cards only.',
      'Ship It! scavenger captions currently render fully without clamp/toggle (Visual QA defect if expected parity).',
      'Scavenger/daily submit path enforces 500-char captions; extreme Ship It! caption may be excerpted.',
    ],
  }

  writeFileSync(join(outDir, 'REPORT.json'), JSON.stringify(report, null, 2))
  writeFileSync(
    join(outDir, 'caption-updates.json'),
    JSON.stringify(
      captionUpdates.map((u) => ({
        ...u,
        captionPreview: u.caption ? u.caption.slice(0, 120) : null,
        caption: undefined,
      })),
      null,
      2,
    ),
  )

  console.log(JSON.stringify(report, null, 2))
  console.log(`\nWrote ${join(outDir, 'REPORT.json')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
