/**
 * QA-4A Agent 2 — Achievements backend integration probe.
 * Target: star-princess-qa2-backend ONLY (API :56321 / DB :56322). Synthetic data only.
 *
 *   set -a; source .local/qa2-backend.env; set +a   # (script also reads the env file itself)
 *   node scripts/qa2a/probe/achievements.mjs
 *
 * Covers: clock/definitions sanity, INT-ACH-01..04 + 06 (real working definitions where
 * possible), ACH-001 (frozen collections), ACH-002 (physical bar vs Mobile Order gauntlet),
 * ACH-003 (production release map vs 174 final definitions).
 *
 * Expected values below are derived independently from definition configs / the log
 * sequence the script itself issues, never from the awards the engine returns.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as L from './lib.mjs'
import { composeWorkingAchievements } from '../../lib/composeWorkingAchievements.mjs'

const { svc, anon, env } = L.createQa2Clients()
const rec = L.makeRecorder('achievements')
const ORG_BEFORE = L.organizerCruiseId()
const STARTED_AT = new Date().toISOString()
const cohort = new L.Cohort(svc)

const defsByKey = new Map()
const defsById = new Map()
const awardedKeysExecuted = new Set() // stable_keys proven awarded in this run (executed proof)
const defects = []

function defect(id, severity, title, detail) {
  defects.push({ id, severity, title, ...detail })
}

async function loadDefs() {
  const { data, error } = await svc
    .from('achievement_definitions')
    .select('id,stable_key,title,game,enabled,test_only,condition_type,condition_config,group_key')
    .range(0, 999)
  if (error) throw error
  defsByKey.clear()
  defsById.clear()
  for (const d of data) {
    defsByKey.set(d.stable_key, d)
    defsById.set(d.id, d)
  }
  return data
}

async function playerAwardKeys(playerId) {
  const { data, error } = await svc
    .from('achievement_awards')
    .select('id,definition_id,status,source_submission_id,gallery_event_id,revoke_reason')
    .eq('owner_player_id', playerId)
  if (error) throw error
  const active = new Set()
  const revoked = new Set()
  for (const a of data) {
    const key = defsById.get(a.definition_id)?.stable_key ?? a.definition_id
    ;(a.status === 'active' ? active : revoked).add(key)
  }
  return { rows: data, active, revoked }
}

function setDiff(a, b) {
  return [...a].filter((x) => !b.has(x))
}

async function barOfferings(barKey) {
  return L.qa2Json(`
    select bo.id as offering_id, dc.canonical_key as concept_key, cvdc.kind
    from catalog_version_offerings cvo
    join active_catalog_pointer p on p.catalog_version_id = cvo.catalog_version_id
    join bar_offerings bo on bo.id = cvo.offering_id
    join bars b on b.id = bo.bar_id
    join drink_concepts dc on dc.id = bo.drink_concept_id
    join catalog_version_drink_concepts cvdc
      on cvdc.catalog_version_id = cvo.catalog_version_id and cvdc.drink_concept_id = bo.drink_concept_id
    where b.canonical_key = '${barKey}'
    order by dc.canonical_key`)
}

let tick = 0
const nextAt = () => {
  tick += 1
  const m = 10 + tick * 4 // 12:14, 12:18, ...
  const hh = 12 + Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  return L.slotUtc(1, `${String(hh).padStart(2, '0')}:${mm}:00`)
}

async function log(playerId, payloadOpts, at = nextAt()) {
  const payload = L.drinkPayload(payloadOpts)
  const res = await L.submitAt(svc, playerId, payload, at)
  return { payload, at, res: res.data, rpcError: res.error?.message ?? res.data?.error?.message ?? null }
}

async function galleryAchievementCount(awardId) {
  const { count } = await svc
    .from('gallery_events')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'achievement')
    .eq('achievement_award_id', awardId)
    .eq('active', true)
  return count ?? 0
}

async function main() {
  // ---------------------------------------------------------------- setup
  const adopted = await cohort.adopt()
  const leftoverClean = await cohort.cleanup()
  rec.record('SETUP-LEFTOVERS', 'INFO', { summary: 'removed prior qa2a-* leftovers', adopted, leftoverClean })

  // Stray non-catalog defs (e.g. a1-* from interrupted vitest) distort the "174 enabled" count.
  const composed = composeWorkingAchievements()
  const composedKeys = new Set(composed.definitions.map((d) => d.stableKey))
  let all = await loadDefs()
  const strays = all.filter((d) => !composedKeys.has(d.stable_key) && !d.stable_key.startsWith('qa2a-'))
  if (strays.length) {
    const ids = strays.map((s) => s.id)
    await svc.from('achievement_awards').delete().in('definition_id', ids)
    await svc.from('achievement_definitions').delete().in('id', ids)
    all = await loadDefs()
  }
  rec.record('SETUP-STRAY-DEFS', strays.length ? 'INFO' : 'PASS', {
    summary: strays.length
      ? `removed ${strays.length} stray non-catalog definition(s) left by an interrupted run`
      : 'no stray definitions',
    removed: strays.map((s) => s.stable_key),
  })

  const clock = await L.ensureActiveClock(svc)
  const sched = await L.ensureSchedule(svc)
  rec.record('CLOCK-ACTIVE', clock.cruise?.label === 'development-only' && clock.cruise?.day1_ship_date === L.DEV_DAY1 ? 'PASS' : 'FAIL', {
    summary: 'dev_seed_cruise_clock 2099-01-03 / -240, finalized_at cleared, drinkit unpaused',
    clock,
    schedule: sched,
    drinkit_finalized: clock.game_control.find((g) => g.game === 'drinkit')?.finalized_at_utc ?? null,
  })

  // ---------------------------------------------------------------- definitions loaded
  const enabled = all.filter((d) => d.enabled)
  const enabledByGame = { drinkit: enabled.filter((d) => d.game === 'drinkit').length, shipit: enabled.filter((d) => d.game === 'shipit').length }
  const dbEnabledKeys = new Set(enabled.map((d) => d.stable_key))
  const composedActiveKeys = new Set(composed.active.map((d) => d.stableKey))
  const missingInDb = setDiff(composedActiveKeys, dbEnabledKeys)
  const extraInDb = setDiff(dbEnabledKeys, composedActiveKeys)
  rec.record(
    'ACH-DEFS-174',
    enabled.length === 174 && enabledByGame.drinkit === 126 && enabledByGame.shipit === 48 && !missingInDb.length && !extraInDb.length ? 'PASS' : 'FAIL',
    {
      summary: `enabled=${enabled.length} (drinkit ${enabledByGame.drinkit}, shipit ${enabledByGame.shipit}); composed active=${composed.active.length}`,
      enabled_total: enabled.length,
      enabled_by_game: enabledByGame,
      missing_in_db: missingInDb,
      extra_in_db: extraInDb,
      disabled: all.filter((d) => !d.enabled).map((d) => d.stable_key),
      all_test_only: all.every((d) => d.test_only),
    },
  )

  // ---------------------------------------------------------------- INT-ACH-01..04 + 06
  const alpha = await cohort.makePlayer('alpha')
  const beta = await cohort.makePlayer('beta')

  const lido = await barOfferings('lido-bar')
  const prom = await barOfferings('promenade-bars')
  const named = (rows) => rows.filter((r) => !['beer', 'wine'].includes(r.kind))
  const lidoNamed = named(lido)
  const promNamed = named(prom)
  // three distinct concepts, none shared
  const concepts = []
  const seen = new Set()
  for (const r of [...promNamed, ...lidoNamed]) {
    if (!seen.has(r.concept_key)) {
      seen.add(r.concept_key)
      concepts.push(r)
    }
  }
  const nameA = promNamed.find((r) => true)
  const nameB = promNamed.find((r) => r.concept_key !== nameA.concept_key)
  const nameC = promNamed.find((r) => ![nameA.concept_key, nameB.concept_key].includes(r.concept_key))

  const steps = [
    { n: 1, label: 'generic beer @ lido-bar', opts: { barKey: 'lido-bar', mode: 'generic_beer' }, expectNew: ['working-drinkit-d001', 'working-drinkit-d080'] },
    { n: 2, label: 'generic wine @ lido-bar', opts: { barKey: 'lido-bar', mode: 'generic_wine' }, expectNew: ['working-drinkit-d034'] },
    { n: 3, label: 'named drink A @ promenade-bars (2nd bar, 3rd log)', opts: { barKey: 'promenade-bars', offeringId: nameA.offering_id }, expectNew: ['working-drinkit-d002', 'working-drinkit-d019'] },
    { n: 4, label: 'generic other @ lido-bar', opts: { barKey: 'lido-bar', mode: 'generic_other' }, expectNew: ['working-drinkit-d084'] },
    { n: 5, label: 'named drink B @ promenade-bars (2nd distinct concept)', opts: { barKey: 'promenade-bars', offeringId: nameB.offering_id }, expectNew: [] },
    { n: 6, label: 'named drink C @ promenade-bars (3rd distinct concept)', opts: { barKey: 'promenade-bars', offeringId: nameC.offering_id }, expectNew: ['working-drinkit-d028'] },
    { n: 7, label: 'generic beer @ lido-bar (7th log)', opts: { barKey: 'lido-bar', mode: 'generic_beer' }, expectNew: ['working-drinkit-d003'] },
  ]
  // Keys that must NOT be present before their log index (threshold/early-award guard).
  const notBefore = {
    'working-drinkit-d002': 3,
    'working-drinkit-d003': 7,
    'working-drinkit-d019': 3,
    'working-drinkit-d028': 6,
    'working-drinkit-d034': 2,
    'working-drinkit-d084': 4,
  }

  const stepResults = []
  let prevActive = new Set()
  const logsBySeq = {}
  for (const step of steps) {
    const r = await log(alpha, step.opts)
    logsBySeq[step.n] = r
    const ok = r.res?.ok === true
    const { active } = await playerAwardKeys(alpha)
    const delta = setDiff(active, prevActive)
    const missing = setDiff(new Set(step.expectNew), new Set(delta))
    const early = Object.entries(notBefore)
      .filter(([key, at]) => step.n < at && active.has(key))
      .map(([key]) => key)
    const newIds = (r.res?.new_achievement_ids ?? []).length
    stepResults.push({
      log: step.n,
      label: step.label,
      accepted: ok,
      code: r.res?.code ?? r.rpcError,
      submission_id: r.res?.submission_id ?? null,
      expected_new: step.expectNew,
      actual_new: delta.map((k) => defsByKey.get(k)?.title + ' [' + k + ']'),
      missing_expected: missing,
      awarded_too_early: early,
      new_achievement_ids_returned: newIds,
      unexpected_extra: setDiff(new Set(delta), new Set(step.expectNew)),
    })
    delta.forEach((k) => awardedKeysExecuted.add(k))
    prevActive = active
  }
  rec.record('INT-ACH-00-SEQUENCE-ACCEPTED', stepResults.every((s) => s.accepted) ? 'PASS' : 'FAIL', {
    summary: `${steps.length} synthetic drink logs accepted`,
    steps: stepResults,
  })

  // INT-ACH-01: first log awards real "first drink" + beer definitions, with ownership, gallery event, source link.
  {
    const s1 = stepResults[0]
    const { rows } = await playerAwardKeys(alpha)
    const d001Row = rows.find((r) => defsById.get(r.definition_id)?.stable_key === 'working-drinkit-d001')
    const gallery = d001Row ? await galleryAchievementCount(d001Row.id) : 0
    const betaAwards = await playerAwardKeys(beta)
    const pass =
      s1.accepted &&
      s1.missing_expected.length === 0 &&
      d001Row?.source_submission_id === s1.submission_id &&
      gallery === 1 &&
      betaAwards.rows.length === 0
    rec.record('INT-ACH-01', pass ? 'PASS' : 'FAIL', {
      summary: 'first drink log unlocks threshold-1 + generic-beer definitions; award linked to submission; one gallery event; other player unaffected',
      step: s1,
      gallery_events_for_d001: gallery,
      source_submission_matches: d001Row?.source_submission_id === s1.submission_id,
      other_player_awards: betaAwards.rows.length,
      extra_awards_observed: s1.unexpected_extra,
    })
  }

  // INT-ACH-02: thresholds fire exactly at N (3rd, 7th) and not before.
  {
    const early = stepResults.flatMap((s) => s.awarded_too_early.map((k) => ({ log: s.log, key: k })))
    const t3 = stepResults[2].actual_new.some((x) => x.includes('d002'))
    const t7 = stepResults[6].actual_new.some((x) => x.includes('d003'))
    const d028 = stepResults[5].actual_new.some((x) => x.includes('d028'))
    const pass = early.length === 0 && t3 && t7 && d028
    rec.record('INT-ACH-02', pass ? 'PASS' : 'FAIL', {
      summary: 'thresholds: drink_log 3 (d002) at log 3, 7 (d003) at log 7, 3 distinct concepts (d028) at log 6, bars>=2 (d019) at log 3; none early',
      early_awards: early,
      threshold_3_at_log_3: t3,
      threshold_7_at_log_7: t7,
      distinct_concepts_3_at_log_6: d028,
    })
  }

  // INT-ACH-03: multi-unlock in one submission.
  {
    const s3 = stepResults[2]
    const multi = s3.actual_new.length >= 2
    const returned = s3.new_achievement_ids_returned
    rec.record('INT-ACH-03', multi && returned >= 2 && s3.missing_expected.length === 0 ? 'PASS' : 'FAIL', {
      summary: 'one log (3rd, second bar) unlocks multiple definitions and RPC returns every new award id',
      unlocked: s3.actual_new,
      new_achievement_ids_returned: returned,
    })
  }

  // INT-ACH-04: idempotent UUID replay.
  {
    const target = logsBySeq[3]
    const before = await playerAwardKeys(alpha)
    const { count: subBefore } = await svc.from('submissions').select('id', { count: 'exact', head: true }).eq('author_player_id', alpha)
    const { count: galBefore } = await svc.from('gallery_events').select('id', { count: 'exact', head: true }).eq('owner_player_id', alpha)
    const replay = await L.submitAt(svc, alpha, target.payload, target.at)
    const after = await playerAwardKeys(alpha)
    const { count: subAfter } = await svc.from('submissions').select('id', { count: 'exact', head: true }).eq('author_player_id', alpha)
    const { count: galAfter } = await svc.from('gallery_events').select('id', { count: 'exact', head: true }).eq('owner_player_id', alpha)
    const sameSubmission = replay.data?.submission_id === target.res.submission_id
    const pass =
      replay.data?.idempotent_replay === true &&
      sameSubmission &&
      before.rows.length === after.rows.length &&
      subBefore === subAfter &&
      galBefore === galAfter
    // same key, different payload
    const mutated = { ...target.payload, bar_canonical_key: 'lido-bar', drink: { mode: 'generic_beer' } }
    const conflict = await L.submitAt(svc, alpha, mutated, target.at)
    rec.record('INT-ACH-04', pass ? 'PASS' : 'FAIL', {
      summary: 'replay of the multi-unlock log key returns idempotent_replay, no new submission/award/gallery rows',
      idempotent_replay: replay.data?.idempotent_replay,
      same_submission_id: sameSubmission,
      awards_before_after: [before.rows.length, after.rows.length],
      submissions_before_after: [subBefore, subAfter],
      gallery_before_after: [galBefore, galAfter],
      replay_new_achievement_ids: replay.data?.new_achievement_ids ?? null,
      same_key_different_payload: { ok: conflict.data?.ok, code: conflict.data?.code, error: conflict.error?.message ?? null },
    })
    rec.record('INT-ACH-04b-KEY-REUSE-GUARD', conflict.data?.ok === false ? 'PASS' : 'FAIL', {
      summary: 'same idempotency key with a different payload is rejected (not silently replayed or double-awarded)',
      response: conflict.data,
    })
  }

  // Per-award gallery uniqueness (exactly one active achievement gallery event per active award).
  {
    const { rows } = await playerAwardKeys(alpha)
    const bad = []
    for (const r of rows.filter((x) => x.status === 'active')) {
      const g = await galleryAchievementCount(r.id)
      if (g !== 1) bad.push({ award: r.id, key: defsById.get(r.definition_id)?.stable_key, gallery: g })
    }
    rec.record('INT-ACH-05-GALLERY-1TO1', bad.length === 0 ? 'PASS' : 'FAIL', {
      summary: 'each active award has exactly one active achievement gallery event',
      checked: rows.filter((x) => x.status === 'active').length,
      violations: bad,
    })
  }

  // INT-ACH-06: void 7th log -> d003 revoked, earlier awards intact.
  {
    const { client: admin } = await L.signInAdmin(anon, env.LOCAL_TEST_PASSWORD)
    const voidTarget = logsBySeq[7]
    const before = await playerAwardKeys(alpha)
    const v = await admin.rpc('admin_void_submission', {
      p_client_request_id: randomUUID(),
      p_submission_id: voidTarget.res.submission_id,
      p_expected_status: 'accepted',
      p_reason: 'lorem ipsum qa2a void probe',
    })
    const after = await playerAwardKeys(alpha)
    const d003 = after.rows.find((r) => defsById.get(r.definition_id)?.stable_key === 'working-drinkit-d003')
    const gal = d003 ? await galleryAchievementCount(d003.id) : null
    const stable = ['working-drinkit-d001', 'working-drinkit-d002', 'working-drinkit-d080', 'working-drinkit-d034']
    const stillActive = stable.every((k) => after.active.has(k))
    const pass = v.data?.ok === true && d003?.status === 'revoked' && stillActive && gal === 0
    rec.record('INT-ACH-06', pass ? 'PASS' : 'FAIL', {
      summary: 'voiding the 7th log revokes the threshold-7 award (d003), keeps earlier awards, deactivates its gallery event',
      void_result: v.data ?? v.error?.message,
      d003_status: d003?.status ?? null,
      d003_revoke_reason: d003?.revoke_reason ?? null,
      d003_gallery_active_events: gal,
      untouched_awards_still_active: stillActive,
      active_before: before.active.size,
      active_after: after.active.size,
      revoked_after: [...after.revoked],
    })

    // Re-log: back to 7 accepted logs -> award restored exactly once.
    const relog = await log(alpha, { barKey: 'lido-bar', mode: 'generic_beer' })
    const rest = await playerAwardKeys(alpha)
    const d003Rows = rest.rows.filter((r) => defsById.get(r.definition_id)?.stable_key === 'working-drinkit-d003')
    const activeD003 = d003Rows.filter((r) => r.status === 'active').length
    rec.record('INT-ACH-06b-RESTORE-AFTER-RELOG', relog.res?.ok && activeD003 === 1 ? 'PASS' : 'FAIL', {
      summary: 'after void + new log (7 accepted again) d003 re-awarded once (single active award row)',
      relog_ok: relog.res?.ok,
      d003_rows: d003Rows.map((r) => r.status),
    })

    // Admin void cannot be replayed to double-revoke: second void of same submission is idempotent-ish/rejected.
    const again = await admin.rpc('admin_void_submission', {
      p_client_request_id: randomUUID(),
      p_submission_id: voidTarget.res.submission_id,
      p_expected_status: 'accepted',
      p_reason: 'lorem ipsum qa2a second void',
    })
    rec.record('INT-ACH-06c-DOUBLE-VOID', again.data?.ok === false ? 'PASS' : 'FAIL', {
      summary: 'second void of an already voided submission is rejected',
      response: again.data ?? again.error?.message,
    })
  }

  // Real award titles proven (executed proof) — for the matrix.
  rec.record('INT-ACH-EXEC-PROOF-KEYS', 'INFO', { summary: 'real definitions awarded during sequence', keys: [...awardedKeysExecuted] })

  // ---------------------------------------------------------------- ACH-001 frozen collections
  {
    const lic = defsByKey.get('working-drinkit-license-to-chill')
    const frz = defsByKey.get('working-drinkit-frozen-concoctions')
    const probe = await cohort.makePlayer('frozen')
    const licStatus = await L.collectionStatus(svc, lic.id, probe)
    const frzStatus = await L.collectionStatus(svc, frz.id, probe)
    const tagCounts = L.qa2Json(`
      select 'drink_concept' scope, tag, count(*)::int n from catalog_version_drink_concept_tags t join active_catalog_pointer p using (catalog_version_id) group by tag
      union all select 'offering', tag, count(*)::int from catalog_version_offering_tags t join active_catalog_pointer p using (catalog_version_id) group by tag
      union all select 'ingredient', tag, count(*)::int from catalog_version_ingredient_tags t join active_catalog_pointer p using (catalog_version_id) group by tag
      order by 1, 3 desc`)
    const frozenTagRows = tagCounts.filter((t) => t.tag === 'frozen')
    const tropicalIng = tagCounts.filter((t) => t.scope === 'ingredient' && /tropical/.test(t.tag))
    const nameFrozen = L.qa2Json(`
      select b.canonical_key bar, dc.canonical_key concept
      from catalog_version_offerings cvo join active_catalog_pointer p using (catalog_version_id)
      join bar_offerings bo on bo.id = cvo.offering_id join bars b on b.id = bo.bar_id
      join drink_concepts dc on dc.id = bo.drink_concept_id
      where dc.canonical_key ilike '%frozen%' or dc.canonical_key ilike '%slush%' or dc.canonical_key ilike '%colada%' or dc.canonical_key ilike '%daiquiri%'`)
    const frozenDefs = [...defsByKey.values()].filter((d) => d.enabled && JSON.stringify(d.condition_config).includes('"frozen"')).map((d) => d.stable_key)

    const stuck = licStatus.live_target === 0 && frzStatus.live_target === 0
    rec.record('ACH-001-ACTIVE-CATALOG', stuck && frozenTagRows.length === 0 ? 'FAIL' : 'PASS', {
      summary: 'frozen collections on the ACTIVE launch-candidate catalog: eligible universe is empty -> cannot be earned (FAIL = defect confirmed)',
      license_to_chill: { live_target: licStatus.live_target, earned: licStatus.earned, items: licStatus.items?.length ?? null },
      frozen_concoctions: { live_target: frzStatus.live_target, earned: frzStatus.earned, items: frzStatus.items?.length ?? null },
      frozen_tag_rows_in_active_catalog: frozenTagRows,
      tropical_ingredient_tag_rows: tropicalIng,
      definitions_depending_on_frozen_tag: frozenDefs,
      name_based_frozen_like_offerings: nameFrozen,
      all_tag_counts: tagCounts,
    })
    if (stuck && frozenTagRows.length === 0) {
      defect('INT-ACH-001', 'P1', 'Frozen Concoctions / License to Chill cannot unlock: active catalog has zero `frozen` tags', {
        ach_ref: 'ACH-001',
        observed: 'achievement_collection_status live_target=0 for both; no frozen tag rows on concepts/offerings',
        impact: `${frozenDefs.length} enabled definitions depend on the frozen tag`,
      })
    }

    // What-if (proves root cause is catalog data, not engine): tag 3 tropical named offerings, then log them.
    const candidates = L.qa2Json(`
      select cvo.offering_id, dc.canonical_key as concept_key, b.canonical_key as bar_key
      from catalog_version_offerings cvo
      join active_catalog_pointer p on p.catalog_version_id = cvo.catalog_version_id
      join bar_offerings bo on bo.id = cvo.offering_id
      join bars b on b.id = bo.bar_id
      join drink_concepts dc on dc.id = bo.drink_concept_id
      join catalog_version_drink_concepts cvdc on cvdc.catalog_version_id = cvo.catalog_version_id and cvdc.drink_concept_id = bo.drink_concept_id
      where cvdc.kind not in ('beer','wine')
        and public.achievement_offering_collection_price_ok(cvo.price_status)
        and not exists (select 1 from catalog_version_offering_tags t where t.catalog_version_id = cvo.catalog_version_id and t.offering_id = cvo.offering_id and t.tag = 'collection-excluded')
        and not exists (select 1 from admin_manual_offerings amo where amo.catalog_version_id = cvo.catalog_version_id and amo.offering_id = cvo.offering_id and amo.active)
        and exists (
          select 1 from catalog_offering_ingredients coi
          join catalog_version_ingredient_tags it on it.ingredient_id = coi.ingredient_id and it.catalog_version_id = coi.catalog_version_id
          where coi.offering_id = cvo.offering_id and coi.catalog_version_id = cvo.catalog_version_id
            and it.tag in ('fruit-tropical','fruit-pineapple','fruit-mango','fruit-passion-fruit','fruit-guava','fruit-dragon-fruit','fruit-lychee','fruit-coconut'))
      order by dc.canonical_key, b.canonical_key`)
    const pick = []
    const usedConcepts = new Set()
    for (const c of candidates) {
      if (usedConcepts.has(c.concept_key)) continue
      usedConcepts.add(c.concept_key)
      pick.push(c)
      if (pick.length === 3) break
    }
    let whatIf = { skipped: 'fewer than 3 tropical candidates' }
    if (pick.length === 3) {
      const { data: ptr } = await svc.from('active_catalog_pointer').select('catalog_version_id').eq('id', 1).single()
      const rows = pick.map((c) => ({ catalog_version_id: ptr.catalog_version_id, offering_id: c.offering_id, tag: 'frozen' }))
      cohort.catalogTagRows.offering.push(...rows) // cleanup registry first
      const ins = await svc.from('catalog_version_offering_tags').insert(rows)
      const whoLic = await L.collectionStatus(svc, lic.id, probe)
      const whoFrz = await L.collectionStatus(svc, frz.id, probe)
      const progress = []
      for (const c of pick) {
        const r = await log(probe, { barKey: c.bar_key, offeringId: c.offering_id })
        const sl = await L.collectionStatus(svc, lic.id, probe)
        const sf = await L.collectionStatus(svc, frz.id, probe)
        progress.push({ concept: c.concept_key, bar: c.bar_key, ok: r.res?.ok, license_current: sl.live_current, license_target: sl.live_target, frozen_current: sf.live_current })
      }
      const keys = (await playerAwardKeys(probe)).active
      whatIf = {
        insert_error: ins.error?.message ?? null,
        tagged_offerings: pick,
        targets_after_tagging: { license: whoLic.live_target, frozen_concoctions: whoFrz.live_target },
        progress,
        license_awarded: keys.has('working-drinkit-license-to-chill'),
        frozen_awarded: keys.has('working-drinkit-frozen-concoctions'),
      }
      if (whatIf.license_awarded) awardedKeysExecuted.add('working-drinkit-license-to-chill')
      if (whatIf.frozen_awarded) awardedKeysExecuted.add('working-drinkit-frozen-concoctions')
    }
    rec.record(
      'ACH-001-WHATIF-ENGINE-WITH-TAGS',
      whatIf.license_awarded && whatIf.frozen_awarded ? 'PASS' : whatIf.skipped ? 'BLOCKED' : 'FAIL',
      {
        summary: 'with 3 synthetic `frozen` offering tags on tropical drinks, both collections become reachable and award (temporary tags removed after run)',
        ...whatIf,
        candidate_pool_size: candidates.length,
      },
    )
    // remove tags now so later steps see the real catalog
    const notesAfterTags = await cohort.cleanup()
    const leftTags = L.qa2Sql("select count(*) from catalog_version_offering_tags where tag='frozen'")
    rec.record('ACH-001-WHATIF-CLEANUP', leftTags === '0' ? 'PASS' : 'FAIL', { summary: 'temporary frozen tags removed', remaining_frozen_offering_tags: leftTags, notes: notesAfterTags })
    // cleanup() removed the probe cohort players (alpha/beta too) – recreate not needed beyond here except ACH-002
  }

  // ---------------------------------------------------------------- ACH-002 physical bar vs Mobile Order
  {
    await cohort.adopt()
    const personalKey = 'working-drinkit-gauntlet-personal-omalleys-irish-pub'
    const def = defsByKey.get(personalKey)
    const barKey = def.condition_config.bar_key
    const phys = await cohort.makePlayer('gauntlet-phys')
    const mob = await cohort.makePlayer('gauntlet-mobile')
    const wrong = await cohort.makePlayer('gauntlet-wrongbar')
    const threshold1 = await cohort.insertDef('gauntlet-threshold1', 'offering_collection', { bar_key: barKey, scope: 'personal', mode: 'threshold', threshold: 1 })

    const st0 = await L.collectionStatus(svc, def.id, phys)
    const items = st0.items
    const target = st0.live_target
    // Physical path: log every eligible offering at the real bar.
    const physProgress = []
    for (const it of items) {
      const r = await log(phys, { barKey, offeringId: it.offering_id })
      const s = await L.collectionStatus(svc, def.id, phys)
      physProgress.push({ concept: it.concept_key, ok: r.res?.ok, current: s.live_current })
    }
    const physFinal = await L.collectionStatus(svc, def.id, phys)
    const physAwards = await playerAwardKeys(phys)
    const physT1 = (await L.activeAwards(svc, threshold1, phys)).length

    // Mobile Order path: same offering ids, virtual bar.
    const moProgress = []
    for (const it of items) {
      const r = await log(mob, { barKey: 'mobile-order', offeringId: it.offering_id })
      const s = await L.collectionStatus(svc, def.id, mob)
      moProgress.push({ concept: it.concept_key, ok: r.res?.ok, code: r.res?.code, current: s.live_current })
    }
    const moFinal = await L.collectionStatus(svc, def.id, mob)
    const moAwards = await playerAwardKeys(mob)
    const moT1 = (await L.activeAwards(svc, threshold1, mob)).length

    // Wrong physical bar path (same offering ids through a different physical bar).
    const wrongProgress = []
    for (const it of items.slice(0, 2)) {
      const r = await log(wrong, { barKey: 'lido-bar', offeringId: it.offering_id })
      const s = await L.collectionStatus(svc, def.id, wrong)
      wrongProgress.push({ concept: it.concept_key, ok: r.res?.ok, code: r.res?.code, current: s.live_current })
    }
    const wrongFinal = await L.collectionStatus(svc, def.id, wrong)
    const wrongT1 = (await L.activeAwards(svc, threshold1, wrong)).length

    const physOk = physFinal.live_current === target && physFinal.earned === true && physAwards.active.has(personalKey)
    rec.record('ACH-002-PHYSICAL-BAR', physOk && physT1 === 1 ? 'PASS' : 'FAIL', {
      summary: `physical-bar logging of all ${target} eligible ${barKey} offerings completes the personal gauntlet`,
      bar: barKey,
      target,
      final: { current: physFinal.live_current, earned: physFinal.earned },
      award: physAwards.active.has(personalKey),
      threshold1_def_awarded: physT1,
      progress: physProgress,
    })
    if (physOk) awardedKeysExecuted.add(personalKey)

    const moCredited = moFinal.live_current > 0 || moAwards.active.has(personalKey) || moT1 > 0
    rec.record('ACH-002-MOBILE-ORDER', moCredited ? 'FAIL' : 'PASS', {
      summary: 'Mobile Order logs of the SAME offerings must NOT progress/award a physical bar gauntlet (docs/MOBILE_ORDER.md, FINAL §3.4)',
      mobile_logs_accepted: moProgress.every((p) => p.ok),
      final: { current: moFinal.live_current, earned: moFinal.earned },
      gauntlet_award: moAwards.active.has(personalKey),
      threshold1_def_awarded: moT1,
      progress: moProgress,
    })
    if (moCredited) {
      defect('INT-ACH-002', 'P1', 'Mobile Order logs progress/award physical-bar Bar Gauntlets', {
        ach_ref: 'ACH-002',
        observed: `Mobile Order logs of all ${target} ${barKey} offerings -> live_current=${moFinal.live_current}, gauntlet award=${moAwards.active.has(personalKey)}, threshold-1 gauntlet award=${moT1}`,
        expected: 'no coverage credit when the log bar is virtual (bar_id must equal the offering bar)',
      })
    }

    const wrongCredited = wrongFinal.live_current > 0 || wrongT1 > 0
    rec.record('ACH-002-WRONG-PHYSICAL-BAR', wrongProgress.some((p) => p.ok === false) || !wrongCredited ? 'PASS' : 'FAIL', {
      summary: 'same offering ids logged through a different physical bar: either rejected or not credited to the gauntlet bar',
      progress: wrongProgress,
      final: { current: wrongFinal.live_current },
      threshold1_def_awarded: wrongT1,
    })
    if (wrongProgress.every((p) => p.ok) && wrongCredited) {
      defect('INT-ACH-002b', 'P2', 'Gauntlet coverage keyed by offering_id only: logging bar-X offering through bar Y credits bar-X gauntlet', {
        ach_ref: 'ACH-002',
        observed: `current=${wrongFinal.live_current}`,
      })
    }

    // Virtual bars must not count as distinct bars (d019 bars>=2, d020 >=5): Mobile Order player has 12 logs at ONE virtual bar.
    rec.record('ACH-002-VIRTUAL-NOT-A-BAR', !moAwards.active.has('working-drinkit-d019') ? 'PASS' : 'FAIL', {
      summary: 'Mobile Order logs do not count toward distinct-bar definitions (d019 bars>=2 not awarded to mobile-only player)',
      mobile_player_awards: [...moAwards.active],
    })
    if (moAwards.active.has('working-drinkit-d019')) {
      defect('INT-ACH-002c', 'P2', 'Virtual bar counted as a distinct bar', { observed: 'd019 awarded to mobile-only player' })
    }
    // physical-vs-mobile award diff
    rec.record('ACH-002-AWARD-DIFF', 'INFO', {
      summary: 'award sets: physical-bar player vs Mobile Order player (same 12 offerings)',
      physical_awards: [...physAwards.active],
      mobile_awards: [...moAwards.active],
      only_physical: setDiff(physAwards.active, moAwards.active),
      only_mobile: setDiff(moAwards.active, physAwards.active),
    })
    ;[...physAwards.active, ...moAwards.active].forEach((k) => {
      if (!k.startsWith('qa2a-')) awardedKeysExecuted.add(k)
    })
  }

  // ---------------------------------------------------------------- ACH-003 production release map
  {
    const mapping = JSON.parse(readFileSync('content/achievements/productionReleaseMapping.json', 'utf8'))
    const authority = JSON.parse(readFileSync('content/achievements/finalAuthority.json', 'utf8'))
    const mapByKey = new Map(mapping.rows.map((r) => [r.stableKey, r]))
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const authByName = new Map(authority.rows.map((r) => [norm(r.name), r]))

    // catalog datasets
    const bars = new Set(L.qa2Json(`select b.canonical_key k from catalog_version_bars cvb join active_catalog_pointer p using (catalog_version_id) join bars b on b.id=cvb.bar_id where cvb.active`).map((r) => r.k))
    const concepts = new Set(L.qa2Json(`select dc.canonical_key k from catalog_version_drink_concepts cvdc join active_catalog_pointer p using (catalog_version_id) join drink_concepts dc on dc.id=cvdc.drink_concept_id`).map((r) => r.k))
    const ingredients = new Set(L.qa2Json(`select distinct i.canonical_key k from catalog_offering_ingredients coi join active_catalog_pointer p using (catalog_version_id) join ingredients i on i.id=coi.ingredient_id`).map((r) => r.k))
    const tagSets = { ingredient: new Set(), drink_concept: new Set(), offering: new Set() }
    for (const r of L.qa2Json(`select 'ingredient' s, tag from catalog_version_ingredient_tags join active_catalog_pointer using (catalog_version_id) union select 'drink_concept', tag from catalog_version_drink_concept_tags join active_catalog_pointer using (catalog_version_id) union select 'offering', tag from catalog_version_offering_tags join active_catalog_pointer using (catalog_version_id)`)) tagSets[r.s].add(r.tag)
    const challenges = new Set(L.qa2Json(`select canonical_key k from scavenger_challenges where enabled`).map((r) => r.k))
    const playerIds = new Set(L.qa2Json(`select id from players`).map((r) => r.id))
    const authoritySpotCheck = { bars: bars.size, concepts: concepts.size, ingredients: ingredients.size, challenges: challenges.size }

    const stem = (k) => String(k).split('-')[0]
    const allIngredientKeys = [...ingredients]
    /** Independent reachability analysis of a materialized condition_config against the active catalog. */
    function analyze(cfg, topType) {
      const missing = []
      const near = {}
      const leaf = (kind, value, present) => {
        if (!present) {
          missing.push(`${kind}:${value}`)
          if (kind === 'ingredient_key') near[value] = allIngredientKeys.filter((k) => k.includes(stem(value))).slice(0, 6)
        }
        return present
      }
      function walk(node, typeHint) {
        if (Array.isArray(node)) return node.every((n) => walk(n))
        if (!node || typeof node !== 'object') return true
        let ok = true
        if (node.bar_key) ok = leaf('bar_key', node.bar_key, bars.has(node.bar_key)) && ok
        if (node.drink_concept_key) ok = leaf('drink_concept_key', node.drink_concept_key, concepts.has(node.drink_concept_key)) && ok
        if (node.ingredient_key) ok = leaf('ingredient_key', node.ingredient_key, ingredients.has(node.ingredient_key)) && ok
        if (node.challenge_key) ok = leaf('challenge_key', node.challenge_key, challenges.has(node.challenge_key)) && ok
        if (node.drink_tag) ok = leaf('drink_tag', node.drink_tag, tagSets.drink_concept.has(node.drink_tag) || tagSets.offering.has(node.drink_tag)) && ok
        if (Array.isArray(node.tags) && node.tags.length) {
          const sets = node.scope && tagSets[node.scope] ? [tagSets[node.scope]] : Object.values(tagSets)
          const present = node.tags.filter((t) => sets.some((st) => st.has(t)))
          const need = node.match === 'all' ? node.tags.length : node.min_distinct_on_log ? Math.max(1, Number(node.threshold) || 1) : 1
          const tagOk = present.length >= need
          if (!tagOk) missing.push(`tags(${node.scope ?? 'any'}): need ${need} of [${node.tags.join(',')}], present [${present.join(',')}]`)
          ok = tagOk && ok
        }
        if (Array.isArray(node.player_ids)) {
          const absent = node.player_ids.filter((id) => !playerIds.has(id))
          if (absent.length) missing.push(`player_ids: ${absent.length}/${node.player_ids.length} unresolved`)
          ok = absent.length === 0 && ok
        }
        if (Array.isArray(node.conditions)) {
          const t = node.type ?? typeHint
          const kids = node.conditions.map((c) => walk(c))
          const childOk = t === 'any' ? kids.some(Boolean) : kids.every(Boolean)
          // For `any`, a missing alternative alone is not a blocker; only report when no alternative works.
          if (t === 'any' && childOk) {
            // drop the missing entries contributed by absent alternatives
            const keep = missing.filter((m) => !m.startsWith('ingredient_key:') && !m.startsWith('bar_key:') && !m.startsWith('drink_concept_key:'))
            missing.length = 0
            missing.push(...keep)
          }
          ok = childOk && ok
        }
        return ok
      }
      const reachable = walk(cfg, topType)
      return { reachable, missing, near }
    }

    const rows = []
    const dummy = await cohort.makePlayer('matrix-probe')
    for (const d of composed.active.sort((a, b) => a.stableKey.localeCompare(b.stableKey))) {
      const db = defsByKey.get(d.stableKey)
      const map = mapByKey.get(d.stableKey) ?? null
      const auth = authByName.get(norm(d.title)) ?? null
      const analysis = db ? analyze(db.condition_config, db.condition_type) : { reachable: false, missing: ['not_loaded'], near: {} }
      const missingDeps = analysis.reachable ? [] : analysis.missing
      let live = null
      if (db?.condition_type === 'offering_collection') {
        const s = await L.collectionStatus(svc, db.id, dummy)
        live = { live_target: s.live_target }
      }
      const productionClass = !map
        ? 'missing_from_production_map'
        : map.enabledInProductionRelease
          ? 'reachable_via_production_map'
          : 'blocked_in_production_map'
      let engineClass = 'reachable_in_active_catalog'
      if (!db || !db.enabled) engineClass = 'not_loaded_in_db'
      else if (live && live.live_target === 0) engineClass = 'unreachable_empty_collection'
      else if (!analysis.reachable) engineClass = 'unreachable_missing_catalog_dependency'
      rows.push({
        stableKey: d.stableKey,
        snapshotRef: d.snapshotRef ?? null,
        game: d.game,
        title: d.title,
        groupKey: d.groupKey,
        conditionType: d.conditionType,
        in_db_enabled: Boolean(db?.enabled),
        final_authority_match: auth ? { category: auth.category, name: auth.name } : null,
        production_map: map
          ? { present: true, readiness: map.readiness, enabledInProductionRelease: map.enabledInProductionRelease, blockedReason: map.blockedReason }
          : { present: false },
        production_class: productionClass,
        engine_class: engineClass,
        engine_live: live,
        missing_dependencies: missingDeps,
        near_matches_in_catalog: analysis.reachable ? undefined : analysis.near,
        executed_award_proof: awardedKeysExecuted.has(d.stableKey),
      })
    }
    const count = (f) => rows.filter(f).length
    const mapKeysNotActive = [...mapByKey.keys()].filter((k) => !composedActiveKeys.has(k))
    const authorityNoDef = authority.rows.filter((a) => !rows.some((r) => norm(r.title) === norm(a.name))).map((a) => `${a.game}:${a.name}`)
    const defNoAuthority = rows.filter((r) => !r.final_authority_match).map((r) => r.stableKey)
    const summary = {
      active_definitions: rows.length,
      by_game: { drinkit: count((r) => r.game === 'drinkit'), shipit: count((r) => r.game === 'shipit') },
      production_class: {
        reachable_via_production_map: count((r) => r.production_class === 'reachable_via_production_map'),
        blocked_in_production_map: count((r) => r.production_class === 'blocked_in_production_map'),
        missing_from_production_map: count((r) => r.production_class === 'missing_from_production_map'),
      },
      production_map_declared_summary: mapping.summary,
      production_map_rows: mapping.rows.length,
      production_map_rows_not_in_174_active: mapKeysNotActive,
      engine_class: Object.fromEntries(
        ['reachable_in_active_catalog', 'unreachable_empty_collection', 'unreachable_missing_catalog_dependency', 'not_loaded_in_db'].map((k) => [k, count((r) => r.engine_class === k)]),
      ),
      executed_award_proof_in_this_run: count((r) => r.executed_award_proof),
      authority_rows_without_definition: authorityNoDef,
      definitions_without_authority_row: defNoAuthority,
      reachable_in_production_AND_engine: count((r) => r.production_class === 'reachable_via_production_map' && r.engine_class === 'reachable_in_active_catalog'),
    }
    L.writeJson(join(L.CAMPAIGN_DIR, 'ACHIEVEMENT_INTEGRATION_MATRIX.json'), {
      generated_at: new Date().toISOString(),
      backend: 'star-princess-qa2-backend :56321',
      catalog: 'star-princess-launch-candidate-v1 (active on qa2)',
      authority_source_counts: authority.counts,
      summary,
      catalog_dataset_sizes: authoritySpotCheck,
      rows,
    })
    const missingMap = summary.production_class.missing_from_production_map
    rec.record('ACH-003-PRODUCTION-MAP', missingMap === 0 ? 'PASS' : 'FAIL', {
      summary: `${summary.production_class.reachable_via_production_map}/174 reachable via release map, ${summary.production_class.blocked_in_production_map} blocked, ${missingMap} missing from map`,
      ...summary,
    })
    if (missingMap) {
      defect('INT-ACH-003', 'P1', 'productionReleaseMapping.json does not cover all 174 FINAL definitions', {
        ach_ref: 'ACH-003',
        observed: `${missingMap} active definitions have no release-map row; ${mapKeysNotActive.length} map rows point at non-active keys`,
        missing_sample: rows.filter((r) => r.production_class === 'missing_from_production_map').slice(0, 8).map((r) => r.stableKey),
      })
    }
    const unreachable = rows.filter((r) => r.engine_class.startsWith('unreachable'))
    rec.record('ACH-003-ENGINE-REACHABILITY', unreachable.length === 0 ? 'PASS' : 'FAIL', {
      summary: `${unreachable.length} active definitions cannot be earned on the active launch-candidate catalog (empty collection or missing catalog dependency)`,
      unreachable: unreachable.map((r) => ({ key: r.stableKey, title: r.title, class: r.engine_class, missing: r.missing_dependencies, live: r.engine_live })),
    })
    if (unreachable.length) {
      defect('INT-ACH-004', 'P2', 'Definitions with no reachable eligible set on the active catalog', {
        observed: unreachable.map((r) => `${r.stableKey}(${r.engine_class}${r.missing_dependencies.length ? ': ' + r.missing_dependencies.join(',') : ''})`),
      })
    }
  }

  // ---------------------------------------------------------------- finish
  const cleanupNotes = await cohort.cleanup()
  cleanupNotes.sweep = await L.sweepAwardsSince(svc, STARTED_AT)
  const leftovers = {
    qa2a_players: L.qa2Sql("select count(*) from players where login_alias like 'qa2a-%'"),
    qa2a_defs: L.qa2Sql("select count(*) from achievement_definitions where stable_key like 'qa2a-%'"),
    frozen_offering_tags: L.qa2Sql("select count(*) from catalog_version_offering_tags where tag='frozen'"),
    enabled_defs: L.qa2Sql('select count(*) from achievement_definitions where enabled'),
  }
  rec.record('CLEANUP', leftovers.qa2a_players === '0' && leftovers.qa2a_defs === '0' && leftovers.frozen_offering_tags === '0' ? 'PASS' : 'FAIL', {
    summary: 'synthetic players/defs/tags removed',
    leftovers,
    notes: cleanupNotes,
  })
}

let fatal = null
try {
  await main()
} catch (e) {
  fatal = e
  rec.record('FATAL', 'FAIL', { summary: String(e?.stack ?? e) })
  try {
    await cohort.cleanup()
  } catch {}
}

const org = L.assertOrg(ORG_BEFORE)
rec.record('ORGANIZER-CRUISE-UNCHANGED', org.unchanged && org.matches_expected ? 'PASS' : 'FAIL', { summary: `organizer cruise id ${org.after}`, ...org })

L.writeJson(join(L.EVIDENCE_DIR, 'probe-achievements-integration-results.json'), {
  generated_at: new Date().toISOString(),
  backend: { url: L.QA2_URL, project: 'star-princess-qa2-backend' },
  organizer: org,
  totals: rec.totals(),
  defects,
  results: rec.results,
})
console.log('TOTALS', rec.totals())
process.exit(fatal ? 1 : 0)
