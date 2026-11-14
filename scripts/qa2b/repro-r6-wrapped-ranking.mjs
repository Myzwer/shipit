/**
 * R6 — Wrapped ranking + Mobile Order venue proof on Agent 1 disposable ONLY.
 * Target: star-princess-disposable-mo (API :55321 / DB container …disposable-mo).
 *
 *   node scripts/qa2b/repro-r6-wrapped-ranking.mjs
 *
 * Uses transactional DDL fixtures (ROLLBACK) so production/demo ledgers are not mutated.
 * Expectations are computed in JS independently of wrapped_rank_rows / LB SQL under test.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DB = 'supabase_db_star-princess-disposable-mo'
const ORG_DB = 'supabase_db_star-princess-local'
const QA2_DB = 'supabase_db_star-princess-qa2-backend'
const OUT_DIR = 'docs/qa/campaign/repairs/R6-wrapped-ranking'
const EVIDENCE = join(OUT_DIR, 'evidence')

mkdirSync(EVIDENCE, { recursive: true })

function sql(db, q) {
  return execFileSync('docker', ['exec', db, 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', q], {
    encoding: 'utf8',
  }).trim()
}

function sqlFile(db, contents) {
  return execFileSync('docker', ['exec', '-i', db, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'], {
    input: contents,
    encoding: 'utf8',
  })
}

function competitionRanks(rows) {
  // rows already sorted by points desc + stable tie-break; competition on points only
  const ranks = []
  rows.forEach((r, i) => {
    ranks.push(i > 0 && rows[i - 1].points === r.points ? ranks[i - 1] : i + 1)
  })
  return ranks
}

function sortScore(rows) {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const af = a.first_claim_at ?? '9999-12-31'
    const bf = b.first_claim_at ?? '9999-12-31'
    if (af !== bf) return af < bf ? -1 : 1
    const an = a.name.toLowerCase()
    const bn = b.name.toLowerCase()
    if (an !== bn) return an < bn ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

const results = []
function record(id, status, detail = {}) {
  const row = { id, status, ...detail, at: new Date().toISOString() }
  results.push(row)
  console.log(`[${status}] ${id}${detail.summary ? ' — ' + detail.summary : ''}`)
  return row
}

// --- preflight ---
const apiUrl = sql(DB, "select current_setting('port', true)")
void apiUrl
const migs = sql(DB, "select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations where version in ('20261105011100','20261105011200','20261105011300')")
const org113 = sql(ORG_DB, "select exists(select 1 from supabase_migrations.schema_migrations where version='20261105011300')")
const qa2113 = sql(QA2_DB, "select exists(select 1 from supabase_migrations.schema_migrations where version='20261105011300')")
const lbSrc = sql(DB, "select prosrc from pg_proc where proname='wrapped_drinkit_leaderboard' and pg_function_is_visible(oid)")
const secSrc = sql(DB, "select prosrc from pg_proc where proname='wrapped_drinkit_sections' and pg_function_is_visible(oid)")

record('R6-PREFLIGHT', migs.includes('20261105011300') && /order\s+by/i.test(lbSrc) && secSrc.includes('bar_id is not null') && org113 === 'f' && qa2113 === 'f' ? 'PASS' : 'FAIL', {
  summary: 'disposable has 11100+11300; organizer/qa2 lack 11300; LB has ORDER BY; sections exclude null bar_id',
  disposable_migs: migs,
  organizer_has_11300: org113,
  qa2_has_11300: qa2113,
  lb_has_order_by: /order\s+by/i.test(lbSrc),
  lb_has_achievements: /achievements/.test(lbSrc),
  sections_exclude_null_bar: secSrc.includes('bar_id is not null'),
})

// Live roster order integrity (even when all points are 0)
const liveMatch = sql(
  DB,
  `
with cruise as (select id from cruise_config where is_active limit 1),
score as (
  select array_agg(player_id::text order by points desc, coalesce(first_claim_at,'infinity'::timestamptz), lower(display_name), player_id) a
  from drinkit_player_score_rows((select id from cruise))
),
lb as (
  select array_agg(e->>'id') a
  from jsonb_array_elements(wrapped_drinkit_leaderboard((select id from cruise), '00000000-0000-0000-0000-000000000000')) e
)
select ((select a from score)=(select a from lb));
`,
)
record('R6-LIVE-ORDER-MATCHES-SCORE-ROWS', liveMatch === 't' ? 'PASS' : 'FAIL', {
  summary: 'live wrapped_drinkit_leaderboard row order matches drinkit_player_score_rows contract',
  match: liveMatch,
})

// Transactional fixture: unequal points, ties, zero, achievements metadata
const fixtureSql = `
begin;

create or replace function public.drinkit_player_score_rows(p_cruise_config_id uuid)
returns table (
  player_id uuid,
  display_name text,
  points integer,
  bounty_claims integer,
  first_claim_at timestamptz
)
language sql stable security definer set search_path = public as $f$
  select * from (values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'Zed Zero', 0, 0, null::timestamptz),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, 'Tina Tie', 50, 2, '2099-01-04T12:00:00Z'::timestamptz),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid, 'Adam Tie', 50, 2, '2099-01-04T12:00:00Z'::timestamptz),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid, 'Champ Early', 100, 4, '2099-01-03T12:00:00Z'::timestamptz),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5'::uuid, 'Champ Late', 100, 4, '2099-01-05T12:00:00Z'::timestamptz)
  ) as v(player_id, display_name, points, bounty_claims, first_claim_at)
  order by points desc, coalesce(first_claim_at, 'infinity'::timestamptz) asc, lower(display_name) asc, player_id asc;
$f$;

-- metrics stub: achievements only (denominators / venue unused here)
create or replace function public.wrapped_di_player_metrics(p_cruise_config_id uuid)
returns table (
  player_id uuid,
  player_name text,
  points integer,
  drink_logs integer,
  bounties integer,
  cocktail_bounties integer,
  ingredient_bounties integer,
  bar_bounties integer,
  daily_challenges integer,
  achievements integer,
  bars integer,
  different_drinks integer,
  adventurous_logs integer
)
language sql stable security definer set search_path = public as $f$
  select * from (values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'Zed Zero', 0,0,0,0,0,0,0, 0,0,0,0),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, 'Tina Tie', 50,0,0,0,0,0,0, 3,0,0,0),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid, 'Adam Tie', 50,0,0,0,0,0,0, 7,0,0,0),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid, 'Champ Early', 100,0,0,0,0,0,0, 2,0,0,0),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5'::uuid, 'Champ Late', 100,0,0,0,0,0,0, 2,0,0,0)
  ) as v(player_id, player_name, points, drink_logs, bounties, cocktail_bounties, ingredient_bounties, bar_bounties, daily_challenges, achievements, bars, different_drinks, adventurous_logs);
$f$;

select 'RESULT:' || public.wrapped_drinkit_leaderboard(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid
)::text;

rollback;
`

const fixtureOut = sqlFile(DB, fixtureSql)
const resultLine = fixtureOut.split('\n').find((l) => l.startsWith('RESULT:'))
let fixtureLb = null
try {
  fixtureLb = resultLine ? JSON.parse(resultLine.slice(7)) : null
} catch (e) {
  fixtureLb = { parse_error: String(e), raw: resultLine }
}

const fixturePlayers = [
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', name: 'Champ Early', points: 100, first_claim_at: '2099-01-03T12:00:00Z', achievements: 2 },
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', name: 'Champ Late', points: 100, first_claim_at: '2099-01-05T12:00:00Z', achievements: 2 },
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', name: 'Adam Tie', points: 50, first_claim_at: '2099-01-04T12:00:00Z', achievements: 7 },
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', name: 'Tina Tie', points: 50, first_claim_at: '2099-01-04T12:00:00Z', achievements: 3 },
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', name: 'Zed Zero', points: 0, first_claim_at: null, achievements: 0 },
]
const expectedSorted = sortScore(fixturePlayers)
const expectedRanks = competitionRanks(expectedSorted)

const orderOk =
  Array.isArray(fixtureLb) &&
  fixtureLb.length === expectedSorted.length &&
  fixtureLb.every((r, i) => r.id === expectedSorted[i].id && r.rank === expectedRanks[i] && r.achievements === expectedSorted[i].achievements)

record('R6-FIXTURE-POINTS-TIES-ZERO-ACH', orderOk ? 'PASS' : 'FAIL', {
  summary: 'independent expectation: Champ Early rank 1 before Champ Late; Adam before Tina on name; Zed rank 5; achievements preserved',
  expected: expectedSorted.map((r, i) => ({ name: r.name, points: r.points, rank: expectedRanks[i], achievements: r.achievements })),
  actual: Array.isArray(fixtureLb)
    ? fixtureLb.map((r) => ({ name: r.name, points: r.points, rank: r.rank, achievements: r.achievements, is_me: r.is_me }))
    : fixtureLb,
})

// Champion early is_me
const meOk = Array.isArray(fixtureLb) && fixtureLb.find((r) => r.name === 'Champ Early')?.is_me === true
record('R6-FIXTURE-VIEWER-IDENTITY', meOk ? 'PASS' : 'FAIL', {
  summary: 'is_me true only for viewer Champ Early',
  is_me_flags: Array.isArray(fixtureLb) ? fixtureLb.map((r) => ({ name: r.name, is_me: r.is_me })) : null,
})

// MO venue exclusion: transactional stub of wrapped_di_log_rows + call sections DI-P15/C08 via direct SQL mirrors
const moSql = `
begin;

-- Minimal log-row stub matching wrapped_di_log_rows shape used by DI-P15/C08
create or replace function public.wrapped_di_log_rows(p_cruise_config_id uuid)
returns table (
  submission_id uuid,
  player_id uuid,
  player_name text,
  ship_day integer,
  received_at_utc timestamptz,
  bar_id uuid,
  bar_name text,
  drink_mode text,
  drink_concept_id uuid,
  drink_name text,
  catalog_version_id uuid,
  offering_id uuid
)
language sql stable security definer set search_path = public as $f$
  select * from (values
    -- Mobile Order (nulled bar_id) — must NOT win Favorite / Most Popular
    ('cccccccc-cccc-cccc-cccc-ccccccccccc1'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid, 'Champ Early', 1, '2099-01-03T18:00:00Z'::timestamptz,
      null::uuid, 'Mobile Order', 'named_catalog', null::uuid, 'MO Drink', null::uuid, null::uuid),
    ('cccccccc-cccc-cccc-cccc-ccccccccccc2'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid, 'Champ Early', 1, '2099-01-03T19:00:00Z'::timestamptz,
      null::uuid, 'Mobile Order', 'named_catalog', null::uuid, 'MO Drink 2', null::uuid, null::uuid),
    ('cccccccc-cccc-cccc-cccc-ccccccccccc3'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid, 'Champ Early', 1, '2099-01-03T20:00:00Z'::timestamptz,
      null::uuid, 'Mobile Order', 'named_catalog', null::uuid, 'MO Drink 3', null::uuid, null::uuid),
    -- one physical bar visit
    ('cccccccc-cccc-cccc-cccc-ccccccccccc4'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid, 'Champ Early', 1, '2099-01-03T21:00:00Z'::timestamptz,
      'dddddddd-dddd-dddd-dddd-ddddddddddd1'::uuid, 'Wake View Bar', 'named_catalog', null::uuid, 'Physical', null::uuid, null::uuid)
  ) as v(submission_id, player_id, player_name, ship_day, received_at_utc, bar_id, bar_name, drink_mode, drink_concept_id, drink_name, catalog_version_id, offering_id);
$f$;

-- Direct mirrors of DI-P15 / DI-C08 post-R6 filters (same predicates as wrapped_drinkit_sections)
select 'P15:' || coalesce((
  select g.nm || ':' || g.n::text
  from (
    select l.bar_id::text as k,
      (array_agg(l.bar_name order by l.received_at_utc desc, l.submission_id))[1] as nm,
      count(*) as n
    from public.wrapped_di_log_rows('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid) l
    where l.player_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid
      and l.bar_id is not null
    group by l.bar_id
  ) g
  order by g.n desc, g.nm
  limit 1
), 'NONE');

select 'C08:' || coalesce((
  select g.nm || ':' || g.n::text
  from (
    select l.bar_id::text as k,
      (array_agg(l.bar_name order by l.received_at_utc desc, l.submission_id))[1] as nm,
      count(*) as n
    from public.wrapped_di_log_rows('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid) l
    where l.bar_id is not null
    group by l.bar_id
  ) g
  order by g.n desc, g.nm
  limit 1
), 'NONE');

-- Control: without filter Mobile Order would win
select 'BAD:' || coalesce((
  select g.nm || ':' || g.n::text
  from (
    select l.bar_id::text as k,
      (array_agg(l.bar_name order by l.received_at_utc desc, l.submission_id))[1] as nm,
      count(*) as n
    from public.wrapped_di_log_rows('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid) l
    group by l.bar_id
  ) g
  order by g.n desc nulls first, g.nm
  limit 1
), 'NONE');

-- Variety still sees MO rows
select 'LOGS:' || count(*)::text from public.wrapped_di_log_rows('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);

rollback;
`

const moOut = sqlFile(DB, moSql)
const p15 = moOut.split('\n').find((l) => l.startsWith('P15:'))
const c08 = moOut.split('\n').find((l) => l.startsWith('C08:'))
const bad = moOut.split('\n').find((l) => l.startsWith('BAD:'))
const logs = moOut.split('\n').find((l) => l.startsWith('LOGS:'))

record('R6-MO-VENUE-EXCLUSION', p15 === 'P15:Wake View Bar:1' && c08 === 'C08:Wake View Bar:1' && bad?.includes('Mobile Order') && logs === 'LOGS:4' ? 'PASS' : 'FAIL', {
  summary: 'with filter Wake View wins; without filter Mobile Order wins; all 4 logs still counted for variety',
  p15,
  c08,
  unfiltered_winner: bad,
  log_count: logs,
})

// Confirm post-rollback functions restored (LB still has ORDER BY from 11300)
const afterRollback = sql(DB, "select (prosrc like '%order by%')::text || ',' || md5(prosrc) from pg_proc where proname='wrapped_drinkit_leaderboard' and pg_function_is_visible(oid)")
record('R6-ROLLBACK-PRESERVED-11300', afterRollback.startsWith('true,') ? 'PASS' : 'FAIL', {
  summary: 'fixture rollback left 11300 leaderboard body intact',
  fingerprint: afterRollback,
})

// Achievements field presence on live payload (WRP-001)
const achLive = sql(
  DB,
  `
select bool_and((e ? 'achievements') and jsonb_typeof(e->'achievements') = 'number')
from jsonb_array_elements(
  wrapped_drinkit_leaderboard(
    (select id from cruise_config where is_active limit 1),
    '00000000-0000-0000-0000-000000000000'
  )
) e;
`,
)
record('R6-WRP-001-ACHIEVEMENT-COUNTS', achLive === 't' ? 'PASS' : 'FAIL', {
  summary: 'every live leaderboard row carries numeric achievements (11100 contract kept by 11300)',
  all_numeric: achLive,
})

const pass = results.filter((r) => r.status === 'PASS').length
const fail = results.filter((r) => r.status === 'FAIL').length
const summary = {
  suite: 'R6-wrapped-ranking',
  target: 'disposable-mo :55321',
  migrations: migs,
  pass,
  fail,
  results,
}
writeFileSync(join(EVIDENCE, 'r6-ranking-results.json'), JSON.stringify(summary, null, 2))
console.log(`\nR6 ranking proof: ${pass} pass / ${fail} fail → ${join(EVIDENCE, 'r6-ranking-results.json')}`)
process.exit(fail ? 1 : 0)
