/**
 * QA-4A Agent 2 — Cruise Wrapped aggregation probe (incl. migration 20261105011100 / WRP-001).
 * Target: star-princess-qa2-backend ONLY (API :56321 / DB :56322). Synthetic data only.
 *
 *   node scripts/qa2a/probe/wrapped-aggregation.mjs
 *
 * Seeds a small deterministic synthetic dataset (4 Drink It! players, 3 Ship It! players on
 * 2 teams, known drink logs / daily claims / scavenger completions), finalizes the dev
 * cruise, calls dev_get_my_wrapped_at (same payload builder as get_my_wrapped) and compares
 * entries against expectations computed HERE in JS from the ledger the script created plus raw
 * table reads — never from the Wrapped functions' own output.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import * as L from './lib.mjs'
import { composeWorkingAchievements } from '../../lib/composeWorkingAchievements.mjs'

const { svc, anon, env } = L.createQa2Clients()
const rec = L.makeRecorder('wrapped')
const ORG_BEFORE = L.organizerCruiseId()
const STARTED_AT = new Date().toISOString()
const cohort = new L.Cohort(svc)
const defects = []
const defect = (id, severity, title, detail) => defects.push({ id, severity, title, ...detail })

/** entry-level comparison results keyed by spec_id */
const entryResults = new Map() // spec_id -> [{viewer, status, expected, actual}]
function noteEntry(specId, viewer, pass, expected, actual) {
  const arr = entryResults.get(specId) ?? []
  arr.push({ viewer, status: pass ? 'PASS' : 'FAIL', expected, actual })
  entryResults.set(specId, arr)
  return pass
}

const sameSet = (a, b) => JSON.stringify([...a].map(String).sort()) === JSON.stringify([...b].map(String).sort())
const sorted = (a) => [...a].map(String).sort()

function entryOf(payload, specId) {
  for (const sec of ['personal', 'global', 'collective']) {
    const e = (payload.sections?.[sec] ?? []).find((x) => x.spec_id === specId)
    if (e) return e
  }
  return undefined
}
const wIds = (e) => (e?.winners ?? []).map((w) => w.id)
const wNames = (e) => (e?.winners ?? []).map((w) => w.name)

function compare(payload, viewer, specId, expected) {
  const e = entryOf(payload, specId)
  const actual = {
    available: e?.available,
    value_numeric: e?.value_numeric ?? null,
    winner_ids: wIds(e),
    winner_names: wNames(e),
    winner_values: (e?.winners ?? []).map((w) => w.value),
    items: e?.items ?? [],
    primary: e?.primary,
  }
  const problems = []
  if ('available' in expected && expected.available !== actual.available) problems.push(`available expected ${expected.available} got ${actual.available}`)
  if (expected.available !== false) {
    if ('value' in expected && Number(expected.value) !== Number(actual.value_numeric)) problems.push(`value_numeric expected ${expected.value} got ${actual.value_numeric}`)
    if ('winnerIds' in expected && !sameSet(expected.winnerIds, actual.winner_ids)) problems.push(`winner ids expected ${JSON.stringify(sorted(expected.winnerIds))} got ${JSON.stringify(sorted(actual.winner_ids))}`)
    if ('winnerNames' in expected && !sameSet(expected.winnerNames, actual.winner_names)) problems.push(`winner names expected ${JSON.stringify(sorted(expected.winnerNames))} got ${JSON.stringify(sorted(actual.winner_names))}`)
    if ('winnerValue' in expected && !actual.winner_values.every((v) => Number(v) === Number(expected.winnerValue))) problems.push(`winner value expected ${expected.winnerValue} got ${JSON.stringify(actual.winner_values)}`)
    if ('winnerCount' in expected && actual.winner_ids.length !== expected.winnerCount) problems.push(`winner count expected ${expected.winnerCount} got ${actual.winner_ids.length}`)
    if ('itemDays' in expected) {
      const days = actual.items.map((i) => i.day)
      if (!sameSet(expected.itemDays, days)) problems.push(`item days expected ${JSON.stringify(expected.itemDays)} got ${JSON.stringify(days)}`)
      if ('itemValue' in expected && !actual.items.every((i) => Number(i.value) === Number(expected.itemValue))) problems.push(`item value expected ${expected.itemValue} got ${JSON.stringify(actual.items)}`)
    }
    if ('primary' in expected && String(expected.primary) !== String(actual.primary)) problems.push(`primary expected ${expected.primary} got ${actual.primary}`)
  }
  return noteEntry(specId, viewer, problems.length === 0, expected, problems.length ? { ...actual, problems } : actual)
}

const competitionRanks = (rows, key) => {
  const out = new Map()
  for (const r of rows) out.set(r.id, 1 + rows.filter((x) => x[key] > r[key]).length)
  return out
}
function maxWinners(map) {
  // map: id -> number; returns {max, ids} for max>0
  let max = 0
  for (const v of map.values()) max = Math.max(max, v)
  if (max <= 0) return { max: 0, ids: [] }
  return { max, ids: [...map.entries()].filter(([, v]) => v === max).map(([k]) => k) }
}
const inc = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n)

function psqlTx(sql) {
  // qa2 container only; always ends in ROLLBACK (caller supplies BEGIN/ROLLBACK).
  return execFileSync('docker', ['exec', '-i', 'supabase_db_star-princess-qa2-backend', 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-v', 'ON_ERROR_STOP=0', '-f', '-'], {
    input: sql,
    encoding: 'utf8',
  })
}

async function main() {
  // ------------------------------------------------------------------ preflight
  await cohort.adopt()
  await cohort.cleanup()
  const clock = await L.ensureActiveClock(svc)
  await L.ensureSchedule(svc, 'qa2a-wrapped')
  const cruise = clock.cruise.id

  const has11100 = L.qa2Sql("select exists(select 1 from supabase_migrations.schema_migrations where version='20261105011100')")
  const fnSrc = L.qa2Sql("select prosrc from pg_proc where proname='wrapped_drinkit_leaderboard'")
  const fnMd5Before = L.qa2Sql("select md5(prosrc) from pg_proc where proname='wrapped_drinkit_leaderboard'")
  let orgHas11100 = 'unknown'
  try {
    orgHas11100 = execFileSync('docker', ['exec', 'supabase_db_star-princess-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', "select exists(select 1 from supabase_migrations.schema_migrations where version='20261105011100')"], { encoding: 'utf8' }).trim()
  } catch {}
  rec.record('WRP-MIGRATION-11100', has11100 === 't' && /achievements/.test(fnSrc) ? 'PASS' : 'FAIL', {
    summary: 'migration 20261105011100 applied on qa2 and wrapped_drinkit_leaderboard emits achievements',
    qa2_has_11100: has11100,
    function_mentions_achievements: /achievements/.test(fnSrc),
    function_has_order_by: /order\s+by/i.test(fnSrc),
    organizer_has_11100_readonly: orgHas11100,
  })

  // ------------------------------------------------------------------ seed
  const offs = L.qa2Json(`
    select bo.id offering_id, b.canonical_key bar_key, cvb.name bar_name, dc.canonical_key concept_key, cvdc.kind,
      exists(select 1 from cocktail_candidates cc where cc.catalog_version_id = cvo.catalog_version_id and cc.offering_id = bo.id and cc.tier = 'adventurous') adventurous,
      (select count(*)::int from catalog_offering_ingredients coi where coi.catalog_version_id = cvo.catalog_version_id and coi.offering_id = bo.id) n_ing
    from catalog_version_offerings cvo
    join active_catalog_pointer p on p.catalog_version_id = cvo.catalog_version_id
    join bar_offerings bo on bo.id = cvo.offering_id
    join bars b on b.id = bo.bar_id
    join catalog_version_bars cvb on cvb.catalog_version_id = cvo.catalog_version_id and cvb.bar_id = b.id
    join drink_concepts dc on dc.id = bo.drink_concept_id
    join catalog_version_drink_concepts cvdc on cvdc.catalog_version_id = cvo.catalog_version_id and cvdc.drink_concept_id = bo.drink_concept_id
    where cvdc.kind not in ('beer','wine') and b.canonical_key in ('lido-bar','promenade-bars','star-bar')
    order by b.canonical_key, dc.canonical_key`)
  const barNames = Object.fromEntries(L.qa2Json(`select b.canonical_key k, cvb.name n from catalog_version_bars cvb join active_catalog_pointer p using (catalog_version_id) join bars b on b.id = cvb.bar_id`).map((r) => [r.k, r.n]))
  const usedConcepts = new Set()
  const pick = (bar, wantAdventurous) => {
    const base = (x) => x.bar_key === bar && !usedConcepts.has(x.concept_key) && x.n_ing > 0
    const o = offs.find((x) => base(x) && x.adventurous === wantAdventurous) ?? offs.find(base)
    if (!o) throw new Error(`no offering for ${bar} adventurous=${wantAdventurous}`)
    usedConcepts.add(o.concept_key)
    return o
  }
  const L1 = pick('lido-bar', true)
  const L2 = pick('lido-bar', false)
  const P1 = pick('promenade-bars', true)
  const P2 = pick('promenade-bars', false)

  const A = await cohort.makePlayer('a')
  const B = await cohort.makePlayer('b')
  const C = await cohort.makePlayer('c')
  const D = await cohort.makePlayer('d') // Mobile-Order-only logger (virtual source must not become a "venue")
  const E = await cohort.makePlayer('e') // zero activity
  const names = {}
  {
    const { data } = await svc.from('players').select('id,display_name').in('id', [A, B, C, D, E])
    for (const p of data) names[p.id] = p.display_name
  }
  const { data: team1 } = await svc.from('teams').insert({ name: 'QA2A Team One', active: true }).select('id').single()
  const { data: team2 } = await svc.from('teams').insert({ name: 'QA2A Team Two', active: true }).select('id').single()
  cohort.teamIds.push(team1.id, team2.id)
  const S1 = await cohort.makePlayer('s1', ['shipit'], team1.id)
  const S2 = await cohort.makePlayer('s2', ['shipit'], team1.id)
  const S3 = await cohort.makePlayer('s3', ['shipit'], team2.id)

  // Ledger of drink logs the script submits (the independent source of truth).
  const ledger = []
  async function dlog(player, day, hhmm, barKey, spec, companions = []) {
    const at = L.slotUtc(day, `${hhmm}:00`)
    const payload = L.drinkPayload({ barKey, offeringId: spec.offering_id, mode: spec.mode, companions })
    const r = await L.submitAt(svc, player, payload, at)
    const ok = r.data?.ok === true
    if (!ok) throw new Error(`log rejected ${barKey} ${hhmm}: ${JSON.stringify(r.data ?? r.error)}`)
    const [h, m] = hhmm.split(':').map(Number)
    ledger.push({
      player,
      day,
      minutesSince5: h * 60 + m - 300,
      bar_key: barKey,
      physical: barKey !== 'mobile-order',
      offering: spec.offering_id ?? null,
      concept: spec.concept_key ?? null,
      named: Boolean(spec.offering_id),
      companions,
      submission_id: r.data.submission_id,
    })
    return r.data
  }
  const generic = (mode) => ({ mode })
  await dlog(A, 1, '12:10', 'lido-bar', L1, [B])
  await dlog(A, 1, '12:30', 'lido-bar', L1, [B])
  await dlog(A, 1, '13:00', 'promenade-bars', P1)
  await dlog(A, 2, '12:20', 'promenade-bars', P2, [C])
  await dlog(A, 2, '12:40', 'lido-bar', L2)
  await dlog(B, 1, '12:15', 'promenade-bars', P1)
  await dlog(B, 1, '12:50', 'lido-bar', L1, [A])
  await dlog(B, 2, '13:00', 'mobile-order', L2) // virtual source: variety counts, venue stats must not
  await dlog(B, 2, '15:00', 'star-bar', generic('generic_wine'))
  await dlog(C, 1, '13:30', 'star-bar', generic('generic_beer'))
  // D: five Mobile Order logs (named). Physical venue visits = 0; Mobile Order must not rank as a bar.
  for (const [i, spec] of [L1, L2, P1, P2, L1].entries()) await dlog(D, 2, `16:${String(i * 10).padStart(2, '0')}`, 'mobile-order', spec)

  // Daily claims (direct ledger rows — Wrapped aggregates ledger rows; points fixed at 50 by constraint).
  const dailyDefs = {}
  for (const day of [1, 2]) {
    const { data: existing } = await svc.from('daily_challenges').select('id,points').eq('cruise_config_id', cruise).eq('day_number', day).maybeSingle()
    if (existing) {
      dailyDefs[day] = existing.id
      continue
    }
    const { data, error } = await svc
      .from('daily_challenges')
      .insert({ cruise_config_id: cruise, day_number: day, title: `QA2A Lorem Daily ${day}`, instructions: 'Lorem ipsum dolor sit amet.', points: 50, is_all_hands: true })
      .select('id')
      .single()
    if (error) throw new Error(`daily insert: ${error.message}`)
    dailyDefs[day] = data.id
    cohort.dailyIds.push(data.id)
  }
  const subOf = (player, day) => ledger.find((l) => l.player === player && l.day === day).submission_id
  const claims = [
    { player: B, day: 1 },
    { player: A, day: 2 },
  ]
  for (const c of claims) {
    const { error } = await svc.from('bounty_claims').insert({
      submission_id: subOf(c.player, c.day),
      player_id: c.player,
      cruise_config_id: cruise,
      game_day: c.day,
      category: 'daily',
      daily_challenge_id: dailyDefs[c.day],
      points: 50,
    })
    if (error) throw new Error(`claim insert: ${error.message}`)
  }

  // Ship It!: completions via the dev fixture helper (returns ok/code).
  const challenges = L.qa2Json('select canonical_key, category, points from scavenger_challenges where enabled order by category, sort_order')
  const byCat = (c) => challenges.filter((x) => x.category === c)
  const classic = byCat('classic_ship_landmarks')
  const food = byCat('food_and_drink_discoveries')
  const creative = byCat('creative_team_and_action_shots')
  const completions = [
    { team: team1.id, player: S1, ch: classic[0], day: 1, t: '12:00:00' },
    { team: team1.id, player: S2, ch: classic[1], day: 1, t: '12:30:00' },
    { team: team1.id, player: S1, ch: food[0], day: 1, t: '13:00:00' },
    { team: team1.id, player: S2, ch: creative[0], day: 2, t: '12:00:00' },
    { team: team2.id, player: S3, ch: classic[0], day: 1, t: '14:00:00' }, // shared with team one
  ]
  for (const c of completions) {
    const r = await svc.rpc('dev_fixture_scavenger_completion', {
      p_team_id: c.team,
      p_challenge_canonical_key: c.ch.canonical_key,
      p_submitting_player_id: c.player,
      p_completed_at_utc: L.slotUtc(c.day, c.t),
    })
    if (r.data?.ok !== true) throw new Error(`fixture completion: ${JSON.stringify(r.data ?? r.error)}`)
  }

  // ------------------------------------------------------------------ finalize + fetch payloads
  const FIN = L.slotUtc(7, '18:05:00')
  await svc.from('game_control').update({ finalized_at_utc: FIN, status: 'final' }).in('game', ['drinkit', 'shipit'])
  const fetch = async (player, game) => {
    const r = await svc.rpc('dev_get_my_wrapped_at', { p_player_id: player, p_game: game, p_at_utc: FIN })
    if (r.error || r.data?.ok !== true) throw new Error(`wrapped payload ${game}: ${JSON.stringify(r.error ?? r.data)}`)
    return r.data
  }
  const payA = await fetch(A, 'drinkit')
  const payB = await fetch(B, 'drinkit')
  const payS1 = await fetch(S1, 'shipit')
  const payS3 = await fetch(S3, 'shipit')
  rec.record('WRP-SEED-AND-PAYLOAD', 'PASS', {
    summary: 'synthetic dataset seeded, cruise finalized (dev), 4 payloads fetched',
    drink_logs: ledger.length,
    daily_claims: claims.length,
    scavenger_completions: completions.length,
    payload_counts: {
      drinkit: ['personal', 'global', 'collective'].map((s) => payA.sections[s].length),
      shipit: ['personal', 'global', 'collective'].map((s) => payS1.sections[s].length),
    },
  })

  // ------------------------------------------------------------------ expectations: Drink It!
  const { data: members } = await svc.from('game_memberships').select('player_id').eq('game', 'drinkit').eq('enabled', true)
  const { data: playerRows } = await svc.from('players').select('id,display_name,active').in('id', members.map((m) => m.player_id))
  const roster = playerRows.filter((p) => p.active)
  const rosterIds = new Set(roster.map((p) => p.id))
  const nameOf = Object.fromEntries(roster.map((p) => [p.id, p.display_name]))

  const { count: rawLogCount } = await svc.from('submissions').select('id', { count: 'exact', head: true }).eq('game', 'drinkit').eq('kind', 'drink_log').eq('status', 'accepted')
  const { data: claimRows } = await svc.from('bounty_claims').select('player_id,game_day,category,points,status').eq('cruise_config_id', cruise).eq('status', 'active')
  const { data: awardRows } = await svc.from('achievement_awards').select('owner_player_id,definition_id,status').eq('status', 'active')
  const { data: defRows } = await svc.from('achievement_definitions').select('id,game,enabled,test_only').range(0, 999)
  const defOk = new Set(defRows.filter((d) => d.game === 'drinkit' && d.enabled).map((d) => d.id)) // dev cruise active => test_only counts

  const ingByOffering = new Map()
  for (const r of L.qa2Json(`select coi.offering_id, coi.ingredient_id from catalog_offering_ingredients coi join active_catalog_pointer p using (catalog_version_id)`)) {
    const s = ingByOffering.get(r.offering_id) ?? new Set()
    s.add(r.ingredient_id)
    ingByOffering.set(r.offering_id, s)
  }
  const famByIng = new Map()
  for (const r of L.qa2Json(`select ingredient_id, tag from catalog_version_ingredient_tags join active_catalog_pointer using (catalog_version_id) where tag like 'spirit-family-%'`)) {
    const s = famByIng.get(r.ingredient_id) ?? new Set()
    s.add(r.tag)
    famByIng.set(r.ingredient_id, s)
  }
  const famLabel = (tag) => tag.replace(/^spirit-family-/, '').replace(/-/g, ' ').toUpperCase()
  const adventurousOff = new Set(offs.filter((o) => o.adventurous).map((o) => o.offering_id))
  const catalogBars = L.qa2Json(`select b.canonical_key k, cvb.name n from catalog_version_bars cvb join active_catalog_pointer p using (catalog_version_id) join bars b on b.id = cvb.bar_id`)

  const rl = ledger.filter((l) => rosterIds.has(l.player))
  const ptsOf = (p) => claimRows.filter((c) => c.player_id === p).reduce((s, c) => s + c.points, 0)
  const claimsOf = (p) => claimRows.filter((c) => c.player_id === p)
  const achOf = (p) => awardRows.filter((a) => a.owner_player_id === p && defOk.has(a.definition_id)).length
  const metrics = Object.fromEntries(
    roster.map((p) => {
      const logs = rl.filter((l) => l.player === p.id)
      return [p.id, {
        id: p.id,
        logs: logs.length,
        points: ptsOf(p.id),
        bounties: claimsOf(p.id).length,
        daily: claimsOf(p.id).filter((c) => c.category === 'daily').length,
        ach: achOf(p.id),
        drinks: new Set(logs.filter((l) => l.named).map((l) => l.concept)).size,
        bars: new Set(logs.filter((l) => l.physical).map((l) => l.bar_key)).size,
        adventurous: logs.filter((l) => l.offering && adventurousOff.has(l.offering)).length,
      }]
    }),
  )
  const mArr = Object.values(metrics)
  const ranks = competitionRanks(mArr, 'points')

  // personal helpers
  function personalMaps(player) {
    const logs = rl.filter((l) => l.player === player)
    const drink = new Map(), liquor = new Map(), ing = new Map(), bar = new Map(), partner = new Map(), dayPts = new Map(), dayLogs = new Map()
    for (const l of logs) {
      if (l.named) inc(drink, l.concept)
      if (l.physical) inc(bar, l.bar_key)
      for (const c of l.companions) if (rosterIds.has(c)) inc(partner, c)
      inc(dayLogs, l.day)
      if (l.offering) {
        const ings = ingByOffering.get(l.offering) ?? new Set()
        const fams = new Set()
        for (const i of ings) {
          inc(ing, i)
          for (const f of famByIng.get(i) ?? []) fams.add(f)
        }
        for (const f of fams) inc(liquor, f)
      }
    }
    for (const c of claimsOf(player)) inc(dayPts, c.game_day, c.points)
    return { drink, liquor, ing, bar, partner, dayPts, dayLogs }
  }

  function checkPersonalDI(payload, viewer, label) {
    const m = metrics[viewer]
    const maps = personalMaps(viewer)
    compare(payload, label, 'DI-P01', { available: true, value: m.logs })
    compare(payload, label, 'DI-P02', { available: true, value: m.points })
    compare(payload, label, 'DI-P03', { available: true, value: ranks.get(viewer) })
    compare(payload, label, 'DI-P04', { available: true, value: m.ach })
    compare(payload, label, 'DI-P05', { available: true, value: m.bounties })
    compare(payload, label, 'DI-P06', { available: true, value: claimsOf(viewer).filter((c) => c.category === 'cocktail').length })
    compare(payload, label, 'DI-P07', { available: true, value: claimsOf(viewer).filter((c) => c.category === 'ingredient').length })
    compare(payload, label, 'DI-P08', { available: true, value: claimsOf(viewer).filter((c) => c.category === 'bar').length })
    compare(payload, label, 'DI-P09', { available: true, value: m.daily })
    compare(payload, label, 'DI-P10', { available: true, value: m.drinks })
    compare(payload, label, 'DI-P11', { available: true, value: m.bars })
    const fd = maxWinners(maps.drink)
    compare(payload, label, 'DI-P12', fd.max ? { available: true, winnerCount: fd.ids.length, winnerValue: fd.max } : { available: false })
    const fl = maxWinners(maps.liquor)
    compare(payload, label, 'DI-P13', fl.max ? { available: true, winnerNames: fl.ids.map(famLabel), winnerValue: fl.max } : { available: false })
    const fi = maxWinners(maps.ing)
    compare(payload, label, 'DI-P14', fi.max ? { available: true, winnerIds: fi.ids, winnerValue: fi.max } : { available: false })
    const fb = maxWinners(maps.bar)
    compare(payload, label, 'DI-P15', fb.max ? { available: true, winnerNames: fb.ids.map((k) => barNames[k]), winnerValue: fb.max } : { available: false })
    const fp = maxWinners(maps.partner)
    compare(payload, label, 'DI-P16', fp.max ? { available: true, winnerNames: fp.ids.map((id) => nameOf[id]), winnerValue: fp.max } : { available: false })
    const bd = maxWinners(maps.dayPts)
    compare(payload, label, 'DI-P17', bd.max ? { available: true, itemDays: bd.ids.map(Number), itemValue: bd.max } : { available: false })
    const ad = maxWinners(maps.dayLogs)
    compare(payload, label, 'DI-P18', ad.max ? { available: true, itemDays: ad.ids.map(Number), itemValue: ad.max } : { available: false })
  }
  checkPersonalDI(payA, A, 'A')
  checkPersonalDI(payB, B, 'B')
  checkPersonalDI(await fetch(D, 'drinkit'), D, 'D(mobile-order-only)')
  checkPersonalDI(await fetch(E, 'drinkit'), E, 'E(zero-activity)')

  // global + collective (viewer-independent; verified from A and B payloads to prove viewer independence)
  function checkGlobalCollectiveDI(payload, label) {
    const winnersOf = (key) => {
      const mp = new Map(mArr.map((m) => [m.id, m[key]]))
      return maxWinners(mp)
    }
    const g1 = winnersOf('points')
    compare(payload, label, 'DI-G01', g1.max ? { available: true, winnerIds: g1.ids, winnerValue: g1.max } : { available: false })
    for (const [spec, key] of [['DI-G02', 'logs'], ['DI-G03', 'bounties'], ['DI-G07', 'daily'], ['DI-G08', 'ach'], ['DI-G09', 'bars'], ['DI-G10', 'drinks'], ['DI-G11', 'adventurous']]) {
      const w = winnersOf(key)
      compare(payload, label, spec, w.max ? { available: true, winnerIds: w.ids, winnerValue: w.max } : { available: false })
    }
    for (const [spec, cat] of [['DI-G04', 'cocktail'], ['DI-G05', 'ingredient'], ['DI-G06', 'bar']]) {
      const mp = new Map(roster.map((p) => [p.id, claimsOf(p.id).filter((c) => c.category === cat).length]))
      const w = maxWinners(mp)
      compare(payload, label, spec, w.max ? { available: true, winnerIds: w.ids, winnerValue: w.max } : { available: false })
    }
    // pair: each (log, companion) counts once for unordered {logger, companion}
    const pairs = new Map()
    for (const l of rl) for (const c of l.companions) if (rosterIds.has(c)) inc(pairs, [l.player, c].sort().join(':'))
    const gp = maxWinners(pairs)
    compare(payload, label, 'DI-G12', gp.max ? { available: true, winnerIds: gp.ids, winnerValue: gp.max } : { available: false })
    // earliest / latest by activity-clock minutes since 05:00
    const minM = Math.min(...rl.map((l) => l.minutesSince5))
    const maxM = Math.max(...rl.map((l) => l.minutesSince5))
    const early = rl.filter((l) => l.minutesSince5 === minM)
    const late = rl.filter((l) => l.minutesSince5 === maxM)
    compare(payload, label, 'DI-G13', { available: true, winnerIds: [...new Set(early.map((l) => l.player))], winnerValue: minM })
    compare(payload, label, 'DI-G14', { available: true, winnerIds: [...new Set(late.map((l) => l.player))], winnerValue: maxM })
    // single-day score / drinks in one day
    const pd = new Map()
    for (const c of claimRows) if (rosterIds.has(c.player_id)) inc(pd, `${c.player_id}:${c.game_day}`, c.points)
    const g15 = maxWinners(pd)
    compare(payload, label, 'DI-G15', g15.max ? { available: true, winnerIds: g15.ids.map((k) => k.split(':')[0]), winnerValue: g15.max } : { available: false })
    const dd = new Map()
    for (const l of rl) inc(dd, `${l.player}:${l.day}`)
    const g16 = maxWinners(dd)
    compare(payload, label, 'DI-G16', g16.max ? { available: true, winnerIds: g16.ids.map((k) => k.split(':')[0]), winnerValue: g16.max } : { available: false })

    // collective
    compare(payload, label, 'DI-C01', { available: true, value: rl.length })
    compare(payload, label, 'DI-C02', { available: true, value: new Set(rl.filter((l) => l.named).map((l) => l.concept)).size })
    compare(payload, label, 'DI-C03', { available: true, value: claimRows.filter((c) => rosterIds.has(c.player_id)).length })
    compare(payload, label, 'DI-C04', { available: true, value: awardRows.filter((a) => rosterIds.has(a.owner_player_id) && defOk.has(a.definition_id)).length })
    const cd = new Map(), cb = new Map(), cl = new Map(), ci = new Map(), cday = new Map()
    const allIng = new Set()
    for (const l of rl) {
      if (l.named) inc(cd, l.concept)
      if (l.physical) inc(cb, l.bar_key)
      inc(cday, l.day)
      if (l.offering) {
        const fams = new Set()
        for (const i of ingByOffering.get(l.offering) ?? []) {
          inc(ci, i)
          allIng.add(i)
          for (const f of famByIng.get(i) ?? []) fams.add(f)
        }
        for (const f of fams) inc(cl, f)
      }
    }
    const c5 = maxWinners(cd)
    compare(payload, label, 'DI-C05', c5.max ? { available: true, winnerCount: c5.ids.length, winnerValue: c5.max } : { available: false })
    const c6 = maxWinners(cl)
    compare(payload, label, 'DI-C06', c6.max ? { available: true, winnerNames: c6.ids.map(famLabel), winnerValue: c6.max } : { available: false })
    const c7 = maxWinners(ci)
    compare(payload, label, 'DI-C07', c7.max ? { available: true, winnerIds: c7.ids, winnerValue: c7.max } : { available: false })
    const c8 = maxWinners(cb)
    compare(payload, label, 'DI-C08', c8.max ? { available: true, winnerNames: c8.ids.map((k) => barNames[k]), winnerValue: c8.max } : { available: false })
    const visits = catalogBars.map((b) => ({ ...b, n: cb.get(b.k) ?? 0 }))
    const minV = Math.min(...visits.map((v) => v.n))
    compare(payload, label, 'DI-C09', { available: true, winnerNames: visits.filter((v) => v.n === minV).map((v) => v.n >= 0 && v.n === minV ? v.n === minV && v.k && barNames[v.k] : ''), winnerValue: minV })
    const c10 = maxWinners(cday)
    compare(payload, label, 'DI-C10', c10.max ? { available: true, itemDays: c10.ids.map(Number), itemValue: c10.max } : { available: false })
    compare(payload, label, 'DI-C11', { available: true, value: allIng.size })
    compare(payload, label, 'DI-C12', { available: true, value: claimRows.filter((c) => rosterIds.has(c.player_id)).reduce((s, c) => s + c.points, 0) })
  }
  checkGlobalCollectiveDI(payA, 'viewerA')
  checkGlobalCollectiveDI(payB, 'viewerB')

  // viewer-independence: global + collective identical across viewers
  {
    const strip = (p) => JSON.stringify([p.sections.global, p.sections.collective])
    rec.record('WRP-VIEWER-INDEPENDENCE-DI', strip(payA) === strip(payB) ? 'PASS' : 'FAIL', {
      summary: 'Drink It! global + collective sections are identical for different viewers',
    })
  }

  // precondition for expected totals: no foreign drink logs among roster
  rec.record('WRP-DI-PRECONDITION', rl.length === rawLogCount ? 'PASS' : 'INFO', {
    summary: 'all accepted drink logs in DB belong to the script ledger (expected totals are comparable)',
    ledger_logs: ledger.length,
    db_accepted_drink_logs: rawLogCount,
  })

  // ------------------------------------------------------------------ expectations: Ship It!
  const { data: tmRows } = await svc.from('team_memberships').select('player_id,team_id,active_to').is('active_to', null)
  const { data: gmShip } = await svc.from('game_memberships').select('player_id').eq('game', 'shipit').eq('enabled', true)
  const shipPlayers = new Set(gmShip.map((g) => g.player_id))
  const { data: teamRows } = await svc.from('teams').select('id,name,active')
  const teamHasShipMember = new Set(tmRows.filter((t) => shipPlayers.has(t.player_id)).map((t) => t.team_id))
  const scoreTeams = teamRows.filter((t) => t.active && teamHasShipMember.has(t.id))
  const { data: compRows } = await svc.from('scavenger_completions').select('team_id,challenge_id,status,completed_at_utc').eq('status', 'active')
  const chById = Object.fromEntries(L.qa2Json('select id, canonical_key, category, points from scavenger_challenges where enabled').map((c) => [c.id, c]))
  const eligible = Object.keys(chById).length
  const tName = Object.fromEntries(teamRows.map((t) => [t.id, t.name]))
  const comps = completions.map((c) => ({ team: c.team, ch: c.ch, day: c.day, t: c.t }))
  const teamPts = new Map(scoreTeams.map((t) => [t.id, 0]))
  for (const c of compRows) if (chById[c.challenge_id] && teamPts.has(c.team_id)) inc(teamPts, c.team_id, chById[c.challenge_id].points)
  // PC1 rule (migration 10700): strict ranks — points desc, score_reached_at (latest active completion) asc, then team id.
  const reachedAt = new Map()
  for (const c of compRows) if (chById[c.challenge_id] && teamPts.has(c.team_id)) reachedAt.set(c.team_id, Math.max(reachedAt.get(c.team_id) ?? 0, new Date(c.completed_at_utc).getTime()))
  const strictOrder = [...teamPts.entries()]
    .map(([id, points]) => ({ id, points, reached: reachedAt.get(id) ?? Infinity }))
    .sort((a, b) => b.points - a.points || a.reached - b.reached || (a.id < b.id ? -1 : 1))
  const teamRanks = new Map(strictOrder.map((t, i) => [t.id, i + 1]))

  function teamMaps(team) {
    const cat = new Map(), dayPts = new Map(), dayCnt = new Map()
    for (const c of comps.filter((x) => x.team === team)) {
      inc(cat, c.ch.category)
      inc(dayPts, c.day, c.ch.points)
      inc(dayCnt, c.day)
    }
    return { cat, dayPts, dayCnt }
  }
  const teamsByChallenge = new Map()
  for (const c of comps) {
    const s = teamsByChallenge.get(c.ch.canonical_key) ?? new Set()
    s.add(c.team)
    teamsByChallenge.set(c.ch.canonical_key, s)
  }

  function checkShip(payload, team, label) {
    const mp = teamMaps(team)
    const mine = comps.filter((c) => c.team === team)
    compare(payload, label, 'SI-P01', { available: true, value: teamRanks.get(team) })
    compare(payload, label, 'SI-P02', { available: true, value: teamPts.get(team) })
    compare(payload, label, 'SI-P03', { available: true, value: mine.length })
    compare(payload, label, 'SI-P04', { available: true, value: Math.round((100 * mine.length) / eligible) })
    const cat = maxWinners(mp.cat)
    const e5 = entryOf(payload, 'SI-P05')
    noteEntry('SI-P05', label, cat.max > 0 && e5?.available === true && sameSet(cat.ids.map((c) => c.replace(/_/g, ' ')), (e5.items ?? e5.winners ?? []).map((x) => String(x.label ?? x.name ?? x.category ?? '').toLowerCase())) || (cat.max > 0 && e5?.available === true && Number(e5.value_numeric) === cat.max), { most_completed: cat }, { primary: e5?.primary, secondary: e5?.secondary, value_numeric: e5?.value_numeric, items: e5?.items })
    const bd = maxWinners(mp.dayPts)
    compare(payload, label, 'SI-P06', bd.max ? { available: true, itemDays: bd.ids.map(Number), itemValue: bd.max } : { available: false })
    const ad = maxWinners(mp.dayCnt)
    compare(payload, label, 'SI-P07', ad.max ? { available: true, itemDays: ad.ids.map(Number), itemValue: ad.max } : { available: false })
    const excl = mine.filter((c) => (teamsByChallenge.get(c.ch.canonical_key)?.size ?? 0) === 1).length
    compare(payload, label, 'SI-P10', { available: true, value: excl })
    const first = mine.slice().sort((a, b) => a.day * 1e6 + a.t.replace(/:/g, '') - (b.day * 1e6 + b.t.replace(/:/g, '')))[0]
    const last = mine.slice().sort((a, b) => b.day * 1e6 + b.t.replace(/:/g, '') - (a.day * 1e6 + a.t.replace(/:/g, '')))[0]
    for (const [spec, c] of [['SI-P08', first], ['SI-P09', last]]) {
      const e = entryOf(payload, spec)
      const txt = JSON.stringify(e)
      const challengeTitle = L.qa2Json(`select title from scavenger_challenges where canonical_key='${c.ch.canonical_key}'`)[0]?.title
      noteEntry(spec, label, Boolean(e?.available) && txt.includes(challengeTitle), { challenge_title: challengeTitle }, { primary: e?.primary, secondary: e?.secondary, winners: e?.winners })
    }
  }
  checkShip(payS1, team1.id, 'T1')
  checkShip(payS3, team2.id, 'T2')

  {
    const label = 'viewerS1'
    const payload = payS1
    const standings = strictOrder
    const g1 = maxWinners(new Map(standings.map((s) => [s.id, s.points])))
    compare(payload, label, 'SI-G01', g1.max ? { available: true, winnerIds: g1.ids, winnerValue: g1.max } : { available: false })
    const cnt = new Map([...teamPts.keys()].map((id) => [id, comps.filter((c) => c.team === id).length]))
    const g2 = maxWinners(cnt)
    compare(payload, label, 'SI-G02', g2.max ? { available: true, winnerIds: g2.ids, winnerValue: g2.max } : { available: false })
    const all = comps.slice().sort((a, b) => a.day * 1e6 + Number(a.t.replace(/:/g, '')) - (b.day * 1e6 + Number(b.t.replace(/:/g, ''))))
    const earliest = all[0]
    const latest = all[all.length - 1]
    compare(payload, label, 'SI-G03', { available: true, winnerIds: [earliest.team] })
    compare(payload, label, 'SI-G04', { available: true, winnerIds: [latest.team] })
    const td = new Map(), tc = new Map()
    for (const c of comps) {
      inc(td, `${c.team}:${c.day}`, c.ch.points)
      inc(tc, `${c.team}:${c.day}`)
    }
    const g5 = maxWinners(td)
    compare(payload, label, 'SI-G05', { available: true, winnerIds: g5.ids.map((k) => k.split(':')[0]), winnerValue: g5.max })
    const g6 = maxWinners(tc)
    compare(payload, label, 'SI-G06', { available: true, winnerIds: g6.ids.map((k) => k.split(':')[0]), winnerValue: g6.max })
    const exclByTeam = new Map([...teamPts.keys()].map((id) => [id, comps.filter((c) => c.team === id && teamsByChallenge.get(c.ch.canonical_key).size === 1).length]))
    const g7 = maxWinners(exclByTeam)
    compare(payload, label, 'SI-G07', g7.max ? { available: true, winnerIds: g7.ids, winnerValue: g7.max } : { available: false })
    const daysByTeam = new Map([...teamPts.keys()].map((id) => [id, new Set(comps.filter((c) => c.team === id).map((c) => c.day)).size]))
    const g8 = maxWinners(daysByTeam)
    compare(payload, label, 'SI-G08', g8.max ? { available: true, winnerIds: g8.ids, winnerValue: g8.max } : { available: false })
    const maxPts = Math.max(...comps.map((c) => c.ch.points))
    compare(payload, label, 'SI-G10', { available: true, winnerIds: [...new Set(comps.filter((c) => c.ch.points === maxPts).map((c) => c.team))] })

    // collective
    compare(payload, label, 'SI-C01', { available: true, value: comps.length })
    const uniq = new Set(comps.map((c) => c.ch.canonical_key))
    compare(payload, label, 'SI-C02', { available: true, value: uniq.size })
    compare(payload, label, 'SI-C03', { available: true, value: Math.round((100 * uniq.size) / eligible) })
    compare(payload, label, 'SI-C04', { available: true, value: comps.reduce((s, c) => s + c.ch.points, 0) })
    const c5 = maxWinners(new Map([...teamsByChallenge.entries()].map(([k, v]) => [k, v.size])))
    compare(payload, label, 'SI-C05', { available: true, winnerCount: c5.ids.length, winnerValue: c5.max })
    const minTeams = Math.min(...[...teamsByChallenge.values()].map((v) => v.size))
    compare(payload, label, 'SI-C06', { available: true, winnerCount: [...teamsByChallenge.values()].filter((v) => v.size === minTeams).length, winnerValue: minTeams })
    compare(payload, label, 'SI-C07', { available: true, value: eligible - uniq.size })
    const catCount = new Map()
    for (const c of comps) inc(catCount, c.ch.category)
    const c9 = maxWinners(catCount)
    const allCats = [...new Set(Object.values(chById).map((c) => c.category))]
    const zeroCats = allCats.filter((c) => !catCount.has(c))
    const minCat = zeroCats.length ? 0 : Math.min(...catCount.values())
    const c9e = entryOf(payload, 'SI-C09')
    const c10e = entryOf(payload, 'SI-C10')
    noteEntry('SI-C09', label, c9e?.available === true && Number(c9e.value_numeric ?? c9e.winners?.[0]?.value) === c9.max && (c9e.winners?.length ?? 1) === c9.ids.length, { most_popular_category: c9 }, { primary: c9e?.primary, value_numeric: c9e?.value_numeric, winners: c9e?.winners })
    noteEntry('SI-C10', label, c10e?.available === true && (c10e.winners?.length ?? 0) === (zeroCats.length || allCats.filter((c) => (catCount.get(c) ?? 0) === minCat).length), { least_popular_categories: zeroCats, min: minCat }, { primary: c10e?.primary, value_numeric: c10e?.value_numeric, winners: c10e?.winners })
    const dayAll = new Map()
    for (const c of comps) inc(dayAll, c.day)
    const c11 = maxWinners(dayAll)
    compare(payload, label, 'SI-C11', { available: true, itemDays: c11.ids.map(Number), itemValue: c11.max })
    const c12 = entryOf(payload, 'SI-C12')
    const standingsActual = (c12?.items ?? []).map((i) => ({ name: i.name, points: i.points, rank: i.rank }))
    const standingsExpected = strictOrder.map((t) => ({ name: tName[t.id], points: t.points, rank: teamRanks.get(t.id) }))
    const stdPass = standingsExpected.every((e) => standingsActual.some((a) => a.name === e.name && Number(a.points) === e.points && Number(a.rank) === e.rank)) && standingsActual.length === standingsExpected.length
    noteEntry('SI-C12', label, stdPass, standingsExpected, standingsActual)
    // closest / largest-lead per migration semantics (adjacent pairs in standings order; lead gap > 0)
    const order = standings.map((s) => s)
    const gaps = []
    for (let i = 0; i + 1 < order.length; i++) gaps.push({ upper: order[i].id, lower: order[i + 1].id, gap: order[i].points - order[i + 1].points })
    const minGap = Math.min(...gaps.map((g) => g.gap))
    const maxGap = Math.max(...gaps.map((g) => g.gap))
    const g11 = entryOf(payload, 'SI-G11')
    noteEntry('SI-G11', label, g11?.available === true && Number(g11.value_numeric) === minGap, { min_gap: minGap }, { value_numeric: g11?.value_numeric, primary: g11?.primary })
    const g12 = entryOf(payload, 'SI-G12')
    const leadIds = gaps.filter((g) => g.gap === maxGap && g.gap > 0).map((g) => g.upper)
    noteEntry('SI-G12', label, g12?.available === true && Number(g12.value_numeric) === maxGap && sameSet(leadIds, wIds(g12)), { max_gap: maxGap, leaders: leadIds }, { value_numeric: g12?.value_numeric, winners: g12?.winners })
  }

  // SI-C08 / SI-G09: structural checks against raw data
  {
    const uncompleted = Object.values(chById).filter((c) => !new Set(comps.map((x) => x.ch.canonical_key)).has(c.canonical_key)).length
    const e = entryOf(payS1, 'SI-C08')
    const listed = (e?.items ?? []).length
    noteEntry('SI-C08', 'viewerS1', e?.available === true && listed === uncompleted, { uncompleted }, { available: e?.available, listed })
    const g9 = entryOf(payS1, 'SI-G09')
    noteEntry('SI-G09', 'viewerS1', g9?.available === true && (g9.items ?? []).length === 5, { categories: 5 }, { available: g9?.available, items: (g9?.items ?? []).length })
  }

  // ------------------------------------------------------------------ roll-up of entry comparisons
  for (const [spec, rows] of entryResults) {
    const fails = rows.filter((r) => r.status === 'FAIL')
    rec.record(`WRP-ENTRY-${spec}`, fails.length ? 'FAIL' : 'PASS', {
      summary: fails.length ? `${fails.length}/${rows.length} viewer checks failed` : `${rows.length} viewer check(s) matched independent expectation`,
      checks: rows,
    })
  }

  {
    const failed = (spec) => (entryResults.get(spec) ?? []).filter((r) => r.status === 'FAIL')
    if (failed('DI-P15').length || failed('DI-C08').length) {
      defect('INT-WRP-003', 'P2', 'Mobile Order counted as a venue in Favorite Bar (DI-P15) / Most Popular Bar (DI-C08)', {
        observed: {
          'DI-P15': failed('DI-P15').map((r) => ({ viewer: r.viewer, actual_winners: r.actual?.winner_names, problems: r.actual?.problems })),
          'DI-C08': failed('DI-C08').map((r) => ({ viewer: r.viewer, actual_winners: r.actual?.winner_names, problems: r.actual?.problems })),
        },
        expected: 'docs/MOBILE_ORDER.md: wrapped_di_log_rows nulls bar_id for virtual logs so DI-P15 / DI-C08 do not treat Mobile Order as a venue',
        cause: 'DI-P15 and DI-C08 group by l.bar_id without excluding the NULL (virtual) group, so Mobile Order logs form a pseudo-bar named "Mobile Order"',
      })
    }
    const other = [...entryResults.entries()].filter(([spec, rows]) => !['DI-P03', 'DI-P15', 'DI-C08'].includes(spec) && rows.some((r) => r.status === 'FAIL'))
    for (const [spec, rows] of other) {
      defect(`INT-WRP-UNEXPECTED-${spec}`, 'P2', `${spec} disagrees with independent expectation`, { observed: rows.filter((r) => r.status === 'FAIL').map((r) => r.actual?.problems ?? r.actual) })
    }
  }

  // ------------------------------------------------------------------ leaderboard / rank integrity + WRP-001
  const lb = payA.leaderboard
  const expectedRank = new Map(mArr.map((m) => [m.id, ranks.get(m.id)]))
  const rankBad = lb.filter((r) => expectedRank.get(r.id) !== r.rank)
  const pointsDescOrder = lb.every((r, i) => i === 0 || lb[i - 1].points >= r.points)
  rec.record('WRP-LEADERBOARD-RANK-INTEGRITY', rankBad.length === 0 ? 'PASS' : 'FAIL', {
    summary: `leaderboard rows ranked by points (competition ranking); ${rankBad.length} row(s) carry a rank that disagrees with points`,
    rows: lb.map((r) => ({ name: r.name, points: r.points, rank: r.rank, expected_rank: expectedRank.get(r.id), achievements: r.achievements })),
    leaderboard_sorted_points_desc: pointsDescOrder,
    champion_final_rank_DI_P03: entryOf(payA, 'DI-P03')?.value_numeric,
  })
  // repeat to show (non)determinism of ordering
  const repeats = []
  for (let i = 0; i < 5; i++) {
    const p = await fetch(A, 'drinkit')
    repeats.push(p.leaderboard.map((r) => `${r.rank}:${r.points}`).join(','))
  }
  rec.record('WRP-LEADERBOARD-REPEATABILITY', new Set(repeats).size === 1 ? 'PASS' : 'FAIL', { summary: 'repeated calls return identical row order/ranks', distinct_orderings: new Set(repeats).size, sample: repeats[0] })

  // Roll-back experiments on the function body (qa2 only; each ends in ROLLBACK; md5 verified after)
  const lbFunction = (bodySelect, orderBy) => `
    create or replace function public.wrapped_drinkit_leaderboard(p_cruise_config_id uuid, p_viewer uuid)
    returns jsonb language plpgsql stable security definer set search_path = public as $f$
    declare v_rows jsonb := '[]'::jsonb; v_row record;
    begin
      for v_row in ${bodySelect} ${orderBy}
      loop
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'id', v_row.player_id, 'name', v_row.display_name, 'points', v_row.points,
          'metric_label', format('Bounties %s/28', least(v_row.bounty_claims, 28)),
          'bounty_claims', v_row.bounty_claims, 'achievements', v_row.achievements, 'is_me', v_row.player_id = p_viewer));
      end loop;
      return public.wrapped_rank_rows(v_rows);
    end; $f$;`
  const joinSelect = `select r.player_id, r.display_name, r.points, r.bounty_claims, coalesce(m.achievements, 0) as achievements
      from public.drinkit_player_score_rows(p_cruise_config_id) r
      left join public.wrapped_di_player_metrics(p_cruise_config_id) m on m.player_id = r.player_id`
  const run = (fnSql) =>
    psqlTx(`begin;\n${fnSql}\nselect 'RESULT:' || public.wrapped_drinkit_leaderboard('${cruise}', '${A}')::text;\nrollback;\n`)
      .split('\n')
      .find((l) => l.startsWith('RESULT:'))
  const parseLb = (line) => (line ? JSON.parse(line.slice(7)) : null)
  const asIs = parseLb(run(lbFunction(joinSelect, '')))
  const fixedOrder = `order by r.points desc, coalesce(r.first_claim_at, 'infinity'::timestamptz) asc, lower(r.display_name) asc, r.player_id asc`
  const joinSelectFixed = joinSelect.replace('r.bounty_claims, coalesce', 'r.bounty_claims, r.first_claim_at, coalesce').replace(/select r\.player_id/, 'select r.player_id')
  const fixed = parseLb(run(lbFunction(joinSelectFixed.replace('r.bounty_claims, r.first_claim_at, coalesce', 'r.bounty_claims, r.first_claim_at, coalesce'), fixedOrder)))
  const phase8Fn = `
    create or replace function public.wrapped_drinkit_leaderboard(p_cruise_config_id uuid, p_viewer uuid)
    returns jsonb language plpgsql stable security definer set search_path = public as $f$
    declare v_rows jsonb := '[]'::jsonb; v_row record;
    begin
      for v_row in select * from public.drinkit_player_score_rows(p_cruise_config_id)
      loop
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'id', v_row.player_id, 'name', v_row.display_name, 'points', v_row.points,
          'metric_label', format('Bounties %s/28', least(v_row.bounty_claims, 28)),
          'bounty_claims', v_row.bounty_claims, 'is_me', v_row.player_id = p_viewer));
      end loop;
      return public.wrapped_rank_rows(v_rows);
    end; $f$;`
  const phase8 = parseLb(run(phase8Fn))
  const rankOk = (rows) => rows && rows.every((r) => expectedRank.get(r.id) === r.rank)
  const md5After = L.qa2Sql("select md5(prosrc) from pg_proc where proname='wrapped_drinkit_leaderboard'")
  rec.record('WRP-LEADERBOARD-ROLLBACK-EXPERIMENTS', md5After === fnMd5Before ? 'INFO' : 'FAIL', {
    summary: 'in-transaction experiments (rolled back): 11100 body as-is vs 11100 body + ORDER BY of drinkit_player_score_rows',
    function_md5_unchanged_after_rollback: md5After === fnMd5Before,
    live_11100_ranks_correct: rankOk(lb),
    reproduced_11100_body_ranks_correct: rankOk(asIs),
    reproduced_11100_body_ranks: asIs?.map((r) => `${r.rank}/${r.points}`),
    with_order_by_ranks_correct: rankOk(fixed),
    with_order_by_ranks: fixed?.map((r) => `${r.rank}/${r.points}`),
    phase8_pre11100_body_ranks_correct: rankOk(phase8),
    phase8_pre11100_body_has_achievements: Boolean(phase8?.some((r) => r.achievements !== undefined)),
    with_order_by_has_achievements: fixed?.every((r) => typeof r.achievements === 'number'),
  })
  if (rankBad.length) {
    defect('INT-WRP-002', 'P1', 'Migration 11100 breaks Wrapped/Home leaderboard ranks: join loop has no ORDER BY, rank assigned by row position', {
      observed: `leaderboard ranks disagree with points for ${rankBad.length}/${lb.length} rows; Final Rank (DI-P03) for the top scorer = ${entryOf(payA, 'DI-P03')?.value_numeric}`,
      cause: 'wrapped_drinkit_leaderboard (11100) loops over drinkit_player_score_rows ⟕ wrapped_di_player_metrics with no ORDER BY; wrapped_rank_rows ranks by array position; planner returns hash/id order',
      pre_11100_body_ranks_correct_in_rolled_back_txn: rankOk(phase8),
      client_impact: 'DrinkItHomeView maps get_my_drinkit_leaderboard rows with the server rank as-is; Wrapped DI-P03 Final Rank reads the same rank; WrappedLeaderboardSection Points mode re-sorts client-side',
      fix_verified_in_rolled_back_txn: rankOk(fixed),
      fix: "order by r.points desc, coalesce(r.first_claim_at,'infinity') asc, lower(r.display_name), r.player_id (same as drinkit_player_score_rows) in the 11100 loop",
    })
  }

  // WRP-001: achievements count exposure
  const achRows = lb.map((r) => ({ id: r.id, name: r.name, achievements: r.achievements }))
  const rawAch = Object.fromEntries(mArr.map((m) => [m.id, m.ach]))
  const allNumeric = lb.every((r) => typeof r.achievements === 'number')
  const matchRaw = lb.every((r) => r.achievements === rawAch[r.id])
  const composed = composeWorkingAchievements()
  const denom = composed.active.filter((d) => d.game === 'drinkit').length
  const hasAchievementCounts = lb.length > 0 && lb.every((r) => r.achievements !== undefined) // mirrors src/lib/wrapped/buildLeaderboardModes.ts
  const labelSample = lb.slice(0, 3).map((r) => `${r.achievements}/${denom} ${r.achievements === 1 ? 'achievement' : 'achievements'}`)
  // Home path (authenticated client RPC) for the same function
  let homeLb = null
  try {
    const admin = await L.signInAdmin(anon, env.LOCAL_TEST_PASSWORD)
    await svc.from('game_control').update({ finalized_at_utc: null, status: 'active' }).in('game', ['drinkit', 'shipit'])
    const ids = JSON.parse(readFileSync('.local/test-identities.json', 'utf8'))
    const drinkRow = ids.identities.find((i) => i.key === 'drink_only')
    const c = anon()
    await c.auth.signInWithPassword({ email: drinkRow.login_alias, password: env.LOCAL_TEST_PASSWORD })
    const r = await c.rpc('get_my_drinkit_leaderboard')
    homeLb = r.data
    void admin
  } catch (e) {
    homeLb = { error: String(e) }
  }
  const src = (rel, re) => {
    const lines = readFileSync(rel, 'utf8').split('\n')
    const hits = []
    lines.forEach((l, i) => re.test(l) && hits.push(`${rel}:${i + 1}: ${l.trim()}`))
    return hits
  }
  const clientEvidence = {
    hasAchievementCounts_def: src('src/lib/wrapped/buildLeaderboardModes.ts', /r\.achievements !== undefined/),
    toggle_hidden_when_missing: src('src/features/wrapped/WrappedLeaderboardSection.vue', /hasAchievementCounts\(props\.rows/),
    wrappedview_passes_rows_only: src('src/features/wrapped/WrappedView.vue', /:rows="leaderboardSource"|leaderboardSource = computed/),
    wrappedview_passes_achievementsById: src('src/features/wrapped/WrappedView.vue', /achievementsById|achievements-by-id/),
    row_type_has_achievements: src('src/types/wrapped.ts', /achievements\?: number/),
    denominator_source: src('src/lib/wrapped/buildLeaderboardModes.ts', /activeAchievementCatalogCount\('drinkit'\)/),
    home_fetch_type_has_achievements: src('src/lib/wrapped/api.ts', /achievements/),
  }
  const noAppChange = hasAchievementCounts && clientEvidence.wrappedview_passes_achievementsById.length === 0 && clientEvidence.row_type_has_achievements.length > 0
  rec.record('WRP-001', allNumeric && matchRaw && hasAchievementCounts && denom === 126 ? 'PASS' : 'FAIL', {
    summary: `with 11100 applied every leaderboard row carries achievements (matches raw award table); hasAchievementCounts=${hasAchievementCounts}; denominator ${denom}`,
    rows: achRows,
    all_rows_numeric_achievements: allNumeric,
    matches_raw_active_awards: matchRaw,
    hasAchievementCounts_on_live_payload: hasAchievementCounts,
    denominator_active_drinkit_catalog: denom,
    sample_metric_labels: labelSample,
    migration_alone_sufficient_for_counts: allNumeric && hasAchievementCounts && noAppChange,
    app_code_change_required_for_counts: !noAppChange,
    home_rpc_get_my_drinkit_leaderboard: Array.isArray(homeLb?.leaderboard)
      ? { rows: homeLb.leaderboard.length, has_achievements: homeLb.leaderboard.every((r) => r.achievements !== undefined), ranks: homeLb.leaderboard.map((r) => `${r.rank}/${r.points}`) }
      : homeLb,
    client_evidence: clientEvidence,
    caveat: rankBad.length ? 'Achievements COUNTS are exposed, but 11100 also regresses ranks (INT-WRP-002); ordering must be fixed before launch' : null,
  })

  // ------------------------------------------------------------------ 80-entry matrix
  const inv = readFileSync('src/lib/wrapped/inventory.ts', 'utf8')
  const specs = [...inv.matchAll(/specId: '((?:DI|SI)-[PGC]\d+)', game: '(\w+)', section: '(\w+)', order: (\d+), label: '([^']+)'/g)].map((m) => ({ spec_id: m[1], game: m[2], section: m[3], order: Number(m[4]), label: m[5] }))
  const shapeOk = (payload, game) => {
    const expectedIds = specs.filter((s) => s.game === game).map((s) => s.spec_id)
    const ids = ['personal', 'global', 'collective'].flatMap((sec) => payload.sections[sec].map((e) => e.spec_id))
    return JSON.stringify(ids) === JSON.stringify(expectedIds)
  }
  const shapeDI = shapeOk(payA, 'drinkit')
  const shapeSI = shapeOk(payS1, 'shipit')
  rec.record('WRP-INVENTORY-SHAPE', specs.length === 80 && shapeDI && shapeSI ? 'PASS' : 'FAIL', {
    summary: '80 inventory entries (46 DI + 34 SI); payload section/spec_id order matches src/lib/wrapped/inventory.ts',
    inventory_entries: specs.length,
    drinkit_order_matches: shapeDI,
    shipit_order_matches: shapeSI,
  })

  const sharedLogic = {
    'DI-G04': 'same wrapped_di_metric_winners/max-winners path as DI-G03; zero-data branch executed (unavailable)',
    'DI-G05': 'same wrapped_di_metric_winners/max-winners path as DI-G03; zero-data branch executed (unavailable)',
    'DI-G06': 'same wrapped_di_metric_winners/max-winners path as DI-G03; zero-data branch executed (unavailable)',
    'DI-P06': 'category counter shares wrapped_di_claim_rows with DI-P09/DI-P05; zero value verified',
    'DI-P07': 'category counter shares wrapped_di_claim_rows with DI-P09/DI-P05; zero value verified',
    'DI-P08': 'category counter shares wrapped_di_claim_rows with DI-P09/DI-P05; zero value verified',
  }
  const blockedWhy = {
    'DI-P06': 'cocktail-category claims cannot be generated: launch-candidate catalog has no schedulable Cocktail slots on qa2 (bounty slot offers = 0); only zero-value + shared-logic proven',
    'DI-P07': 'ingredient-category claims cannot be generated (no bounty slot offers); only zero-value + shared-logic proven',
    'DI-P08': 'bar-category claims cannot be generated (no bar bounty assignments); only zero-value + shared-logic proven',
    'DI-G04': 'unavailable branch only; positive winner path needs real cocktail claims',
    'DI-G05': 'unavailable branch only; positive winner path needs real ingredient claims',
    'DI-G06': 'unavailable branch only; positive winner path needs real bar claims',
  }
  const matrixRows = specs.map((s) => {
    const rows = entryResults.get(s.spec_id)
    let classification
    let basis
    if (rows && rows.every((r) => r.status === 'PASS')) {
      classification = sharedLogic[s.spec_id] ? 'shared_logic_proof' : 'executed_proof'
      basis = sharedLogic[s.spec_id] ?? `matched independent JS/raw-table expectation for ${rows.map((r) => r.viewer).join(', ')}`
    } else if (rows) {
      classification = 'executed_proof'
      basis = 'executed and MISMATCHED independent expectation — see failures'
    } else {
      classification = 'contract_only'
      basis = 'shape/order verified only'
    }
    if (blockedWhy[s.spec_id] && classification !== 'executed_proof') classification = 'shared_logic_proof'
    return {
      ...s,
      classification,
      result: rows ? (rows.every((r) => r.status === 'PASS') ? 'pass' : 'fail') : 'n/a',
      basis,
      positive_path_blocked_reason: blockedWhy[s.spec_id] ?? null,
      checks: rows?.map((r) => ({ viewer: r.viewer, status: r.status })) ?? [],
      failures: rows?.filter((r) => r.status === 'FAIL').map((r) => r.actual?.problems ?? r.actual) ?? [],
    }
  })
  const classCount = (k) => matrixRows.filter((r) => r.classification === k).length
  const matrixSummary = {
    total: matrixRows.length,
    executed_proof: classCount('executed_proof'),
    shared_logic_proof: classCount('shared_logic_proof'),
    contract_only: classCount('contract_only'),
    blocked: classCount('blocked'),
    executed_pass: matrixRows.filter((r) => r.result === 'pass').length,
    executed_fail: matrixRows.filter((r) => r.result === 'fail').length,
    failing_spec_ids: matrixRows.filter((r) => r.result === 'fail').map((r) => r.spec_id),
  }
  L.writeJson(join(L.CAMPAIGN_DIR, 'WRAPPED_INTEGRATION_MATRIX.json'), {
    generated_at: new Date().toISOString(),
    backend: 'star-princess-qa2-backend :56321',
    migration_11100_applied_on_qa2: has11100 === 't',
    dataset: {
      drinkit_players: 5,
      shipit_players: 3,
      teams: 2,
      drink_logs: ledger.length,
      daily_claims: claims.length,
      scavenger_completions: completions.length,
      note: 'Other roster rows (demo/synthetic) have zero activity; expectations computed from script ledger + raw tables',
    },
    summary: matrixSummary,
    wrp_001: {
      migration_alone_exposes_counts: allNumeric && hasAchievementCounts,
      app_code_change_required: !noAppChange,
      denominator: denom,
      new_defect: rankBad.length ? 'INT-WRP-002 (rank regression introduced by 11100)' : null,
    },
    rows: matrixRows,
  })
  rec.record('WRP-MATRIX', 'INFO', { summary: 'wrote WRAPPED_INTEGRATION_MATRIX.json', ...matrixSummary })

  // ------------------------------------------------------------------ cleanup
  await svc.from('game_control').update({ finalized_at_utc: null, status: 'active' }).in('game', ['drinkit', 'shipit'])
  await svc.from('wrapped_reveals').delete().in('player_id', cohort.playerIds)
  const notes = await cohort.cleanup()
  notes.sweep = await L.sweepAwardsSince(svc, STARTED_AT)
  const leftovers = {
    qa2a_players: L.qa2Sql("select count(*) from players where login_alias like 'qa2a-%'"),
    qa2a_teams: L.qa2Sql("select count(*) from teams where name like 'QA2A Team%'"),
    qa2a_daily: L.qa2Sql("select count(*) from daily_challenges where title like 'QA2A%'"),
    function_md5_unchanged: L.qa2Sql("select md5(prosrc) from pg_proc where proname='wrapped_drinkit_leaderboard'") === fnMd5Before,
    game_control: L.qa2Sql("select string_agg(game||':'||status||':'||(finalized_at_utc is not null), ',') from game_control"),
  }
  rec.record('CLEANUP', leftovers.qa2a_players === '0' && leftovers.qa2a_teams === '0' && leftovers.qa2a_daily === '0' && leftovers.function_md5_unchanged ? 'PASS' : 'FAIL', { summary: 'synthetic data removed; clock un-finalized', leftovers, notes })
}

let fatal = null
try {
  await main()
} catch (e) {
  fatal = e
  rec.record('FATAL', 'FAIL', { summary: String(e?.stack ?? e) })
  try {
    await svc.from('game_control').update({ finalized_at_utc: null, status: 'active' }).in('game', ['drinkit', 'shipit'])
    await cohort.cleanup()
  } catch {}
}

const org = L.assertOrg(ORG_BEFORE)
rec.record('ORGANIZER-CRUISE-UNCHANGED', org.unchanged && org.matches_expected ? 'PASS' : 'FAIL', { summary: `organizer cruise id ${org.after}`, ...org })
L.writeJson(join(L.EVIDENCE_DIR, 'probe-wrapped-aggregation-results.json'), {
  generated_at: new Date().toISOString(),
  backend: { url: L.QA2_URL, project: 'star-princess-qa2-backend' },
  organizer: org,
  totals: rec.totals(),
  defects,
  results: rec.results,
})
console.log('TOTALS', rec.totals())
process.exit(fatal ? 1 : 0)
