-- Phase Final Wrapped: FINAL 80-entry Cruise Wrapped read model.
--
-- Replaces Phase 8's provisional Wrapped payload with the approved inventory
-- (src/lib/wrapped/inventory.ts):
--   Drink It!  46 entries = 18 personal + 16 global + 12 collective
--   Ship It!   34 entries = 10 personal + 12 global + 12 collective
--
-- Payload contract (wrapped_payload_for):
--   ok, game, awards_mode, finale_at_utc, at_utc, revealed, revealed_at_utc, owner,
--   sections{personal[], global[], collective[]}   <- NEW (final read model)
--   leaderboard[]                                  <- kept (Home / UI reuse)
--   personal_stats{}                               <- kept (Phase 8 test compat)
--   group_awards[]                                 <- kept (Phase 8/9A test compat)
--
-- Entry shape (wrapped_entry): spec_id, label, available, kind, primary, secondary,
-- value_numeric, unit, winners[{id,name,value,detail}], items[], photo, explanation,
-- empty_reason.
--
-- Counting rules (summary; see per-function comments for details):
--   * All aggregates are scoped to drinkit_player_score_rows(cruise) /
--     shipit_team_score_rows(cruise) so dropouts never inflate global totals
--     inconsistently with the leaderboard.
--   * Drink It!: drink log = accepted submissions.kind='drink_log' (once even when
--     multi-bounty). Bounty = active bounty_claims (cocktail/ingredient/bar/daily).
--     Daily Challenge is a bounty, NOT a drink log. Different drinks = distinct
--     drink_concept_id (named_catalog only). Day stats use submissions.ship_day /
--     bounty_claims.game_day.
--   * Ship It!: completion = active scavenger_completions; eligible challenge =
--     scavenger_challenges.enabled.
--   * Tie ordering everywhere: lower(name), id. "Most" awards with an all-zero
--     qualifying value have no winner (available=false).
--
-- Helper functions follow the Phase 8 convention: security definer,
-- search_path = public, revoke from public, grant execute to service_role.
-- get_my_wrapped / reveal_my_wrapped / dev_* signatures are unchanged and are NOT
-- redefined here. wrapped_award_definitions is intentionally untouched.

-- ===========================================================================
-- 1) Entry / formatting primitives
-- ===========================================================================

-- Canonical entry builder. Unavailable entries are normalized so clients never see
-- stale winners/items/values: primary defaults to 'No qualifying data'.
create or replace function public.wrapped_entry(
  p_spec_id text,
  p_label text,
  p_available boolean,
  p_kind text,
  p_primary text default null,
  p_secondary text default null,
  p_value_numeric numeric default null,
  p_unit text default null,
  p_winners jsonb default '[]'::jsonb,
  p_items jsonb default '[]'::jsonb,
  p_photo jsonb default null,
  p_explanation text default null,
  p_empty_reason text default null
)
returns jsonb
language sql
immutable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'spec_id', p_spec_id,
    'label', p_label,
    'available', coalesce(p_available, false),
    'kind', p_kind,
    'primary', case
      when coalesce(p_available, false) then p_primary
      else coalesce(p_primary, 'No qualifying data')
    end,
    'secondary', p_secondary,
    'value_numeric', case when coalesce(p_available, false) then p_value_numeric else null end,
    'unit', p_unit,
    'winners', case
      when coalesce(p_available, false) then coalesce(p_winners, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'items', case
      when coalesce(p_available, false) then coalesce(p_items, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'photo', case when coalesce(p_available, false) then p_photo else null end,
    'explanation', p_explanation,
    'empty_reason', case
      when coalesce(p_available, false) then null
      else coalesce(p_empty_reason, 'no_qualifying_data')
    end
  );
$$;

-- Convenience: unavailable entry (primary defaults to 'No qualifying data').
create or replace function public.wrapped_entry_unavailable(
  p_spec_id text,
  p_label text,
  p_kind text,
  p_empty_reason text default null,
  p_primary text default null,
  p_unit text default null
)
returns jsonb
language sql
immutable
security definer
set search_path = public
as $$
  select public.wrapped_entry(
    p_spec_id, p_label, false, p_kind,
    p_primary => p_primary,
    p_unit => p_unit,
    p_empty_reason => p_empty_reason
  );
$$;

-- Convenience: plain count entry where 0 is a legitimate value.
create or replace function public.wrapped_count_entry(
  p_spec_id text,
  p_label text,
  p_count numeric,
  p_unit text,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = public
as $$
  select public.wrapped_entry(
    p_spec_id, p_label, true, 'count',
    p_primary => coalesce(p_count, 0)::text,
    p_value_numeric => coalesce(p_count, 0),
    p_unit => p_unit,
    p_items => p_items
  );
$$;

-- One winner object: {id, name, value, detail}.
create or replace function public.wrapped_winner(
  p_id text,
  p_name text,
  p_value numeric,
  p_detail text default null
)
returns jsonb
language sql
immutable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_id,
    'name', p_name,
    'value', p_value,
    'detail', p_detail
  );
$$;

-- 'points' + 1 -> 'point' (only strips a trailing s when n = 1).
create or replace function public.wrapped_unit_label(p_n numeric, p_unit text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when p_unit is null then ''
    when p_n = 1 and right(p_unit, 1) = 's' then left(p_unit, length(p_unit) - 1)
    else p_unit
  end;
$$;

-- 46.0 -> '46%', 46.5 -> '46.5%'
create or replace function public.wrapped_format_percent(p_value numeric)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  -- Spec: sensible integer-rounded percentage.
  select case
    when p_value is null then null
    else round(p_value)::integer::text || '%'
  end;
$$;

-- 'spirit-family-gin' -> 'GIN'; 'spirit-family-liqueur' -> 'LIQUEUR'.
create or replace function public.wrapped_spirit_family_label(p_tag text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select upper(replace(regexp_replace(coalesce(p_tag, ''), '^spirit-family-', ''), '-', ' '));
$$;

-- 12-hour Ship Time without leading zero: 09:18 -> '9:18 AM', 00:05 -> '12:05 AM'.
create or replace function public.wrapped_format_ship_time(p_time time)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when p_time is null then null
    else format(
      '%s:%s %s',
      case
        when (extract(hour from p_time))::integer % 12 = 0 then 12
        else (extract(hour from p_time))::integer % 12
      end,
      lpad((extract(minute from p_time))::integer::text, 2, '0'),
      case when (extract(hour from p_time))::integer < 12 then 'AM' else 'PM' end
    )
  end;
$$;

-- 3 -> 'Day 3'
create or replace function public.wrapped_day_label(p_day integer)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select case when p_day is null then null else 'Day ' || p_day::text end;
$$;

-- ---------------------------------------------------------------------------
-- Winner selection helpers. Input rows: [{id,name,value,detail}].
-- Output: all rows tied at the extreme, ordered lower(name), id, detail.
-- ---------------------------------------------------------------------------
create or replace function public.wrapped_max_winners(p_rows jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = public
as $$
  with r as (
    select t.e as e
    from jsonb_array_elements(
      case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end
    ) as t(e)
  ),
  m as (
    select max((r.e->>'value')::numeric) as v from r
  )
  select coalesce(
    jsonb_agg(
      r.e
      order by lower(r.e->>'name'), r.e->>'id', coalesce(r.e->>'detail', '')
    ),
    '[]'::jsonb
  )
  from r
  join m on (r.e->>'value')::numeric = m.v
  where m.v is not null
    and m.v > 0;
$$;

create or replace function public.wrapped_min_winners(
  p_rows jsonb,
  p_allow_zero boolean default false
)
returns jsonb
language sql
immutable
security definer
set search_path = public
as $$
  with r as (
    select t.e as e
    from jsonb_array_elements(
      case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end
    ) as t(e)
  ),
  m as (
    select min((r.e->>'value')::numeric) as v from r
  )
  select coalesce(
    jsonb_agg(
      r.e
      order by lower(r.e->>'name'), r.e->>'id', coalesce(r.e->>'detail', '')
    ),
    '[]'::jsonb
  )
  from r
  join m on (r.e->>'value')::numeric = m.v
  where m.v is not null
    and (p_allow_zero or m.v > 0);
$$;

-- Winners -> entry. Empty winners => unavailable. primary = names joined ', ';
-- secondary defaults to winner details joined '; ' (e.g. 'Day 3; Day 5').
create or replace function public.wrapped_winners_entry(
  p_spec_id text,
  p_label text,
  p_kind text,
  p_unit text,
  p_winners jsonb,
  p_secondary text default null,
  p_items jsonb default '[]'::jsonb,
  p_photo jsonb default null,
  p_value numeric default null,
  p_empty_reason text default null
)
returns jsonb
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when p_winners is null
      or jsonb_typeof(p_winners) <> 'array'
      or jsonb_array_length(p_winners) = 0
    then public.wrapped_entry(
      p_spec_id, p_label, false, p_kind,
      p_unit => p_unit,
      p_empty_reason => p_empty_reason
    )
    else public.wrapped_entry(
      p_spec_id, p_label, true, p_kind,
      p_primary => (
        select string_agg(w.value->>'name', ', ' order by w.ord)
        from jsonb_array_elements(p_winners) with ordinality as w(value, ord)
      ),
      p_secondary => coalesce(
        p_secondary,
        (
          select string_agg(w.value->>'detail', '; ' order by w.ord)
          from jsonb_array_elements(p_winners) with ordinality as w(value, ord)
          where w.value->>'detail' is not null
        ),
        (
          -- Favorites / popularity entries: show the shared winning count.
          select case
            when (p_winners->0->>'value') is null then null
            else format(
              '%s %s',
              (p_winners->0->>'value'),
              public.wrapped_unit_label((p_winners->0->>'value')::numeric, p_unit)
            )
          end
        )
      ),
      p_value_numeric => coalesce(p_value, (p_winners->0->>'value')::numeric),
      p_unit => p_unit,
      p_winners => p_winners,
      p_items => coalesce(p_items, '[]'::jsonb),
      p_photo => p_photo
    )
  end;
$$;

-- Rows [{day,value}] -> items [{day,label,value}] for the top day(s), value > 0.
create or replace function public.wrapped_top_day_items(p_rows jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = public
as $$
  with r as (
    select (t.e->>'day')::integer as d, (t.e->>'value')::numeric as v
    from jsonb_array_elements(
      case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end
    ) as t(e)
  ),
  m as (
    select max(r.v) as mx from r
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', r.d,
        'label', public.wrapped_day_label(r.d),
        'value', r.v
      )
      order by r.d
    ),
    '[]'::jsonb
  )
  from r
  join m on r.v = m.mx
  where m.mx is not null
    and m.mx > 0;
$$;

-- Day items -> entry (kind day_points | day_count). Ties list every top day.
create or replace function public.wrapped_day_entry(
  p_spec_id text,
  p_label text,
  p_kind text,
  p_unit text,
  p_items jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when p_items is null
      or jsonb_typeof(p_items) <> 'array'
      or jsonb_array_length(p_items) = 0
    then public.wrapped_entry(p_spec_id, p_label, false, p_kind, p_unit => p_unit)
    else public.wrapped_entry(
      p_spec_id, p_label, true, p_kind,
      p_primary => (
        select string_agg(i.value->>'label', ', ' order by i.ord)
        from jsonb_array_elements(p_items) with ordinality as i(value, ord)
      ),
      p_secondary => format(
        '%s %s',
        p_items->0->>'value',
        public.wrapped_unit_label((p_items->0->>'value')::numeric, p_unit)
      ),
      p_value_numeric => (p_items->0->>'value')::numeric,
      p_unit => p_unit,
      p_items => p_items
    )
  end;
$$;

-- ===========================================================================
-- 2) Drink It! base read sets (roster-scoped)
-- ===========================================================================

-- Accepted drink logs (one row per log) for roster players.
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
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    r.player_id,
    r.display_name,
    s.ship_day,
    s.received_at_utc,
    dl.bar_id,
    dl.bar_display_name,
    dl.drink_mode::text,
    dl.drink_concept_id,
    dl.drink_display_name,
    dl.catalog_version_id,
    dl.offering_id
  from public.drinkit_player_score_rows(p_cruise_config_id) r
  join public.submissions s
    on s.author_player_id = r.player_id
   and s.cruise_config_id = p_cruise_config_id
   and s.game = 'drinkit'
   and s.kind = 'drink_log'
   and s.status = 'accepted'
  join public.drink_logs dl on dl.submission_id = s.id;
$$;

-- Active bounty claims (cocktail / ingredient / bar / daily) for roster players.
create or replace function public.wrapped_di_claim_rows(p_cruise_config_id uuid)
returns table (
  claim_id uuid,
  player_id uuid,
  player_name text,
  game_day integer,
  category text,
  points integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    bc.id,
    r.player_id,
    r.display_name,
    bc.game_day,
    bc.category::text,
    bc.points
  from public.drinkit_player_score_rows(p_cruise_config_id) r
  join public.bounty_claims bc
    on bc.player_id = r.player_id
   and bc.cruise_config_id = p_cruise_config_id
   and bc.status = 'active';
$$;

-- Distinct ingredient per log (once per log per ingredient) from the snapshot
-- frozen on the drink log. Display name comes from the snapshot.
create or replace function public.wrapped_di_log_ingredients(p_cruise_config_id uuid)
returns table (
  submission_id uuid,
  player_id uuid,
  catalog_version_id uuid,
  ingredient_id uuid,
  ingredient_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (l.submission_id, x.ingredient_id)
    l.submission_id,
    l.player_id,
    l.catalog_version_id,
    x.ingredient_id,
    x.ingredient_name
  from public.wrapped_di_log_rows(p_cruise_config_id) l
  join public.drink_logs dl on dl.submission_id = l.submission_id
  cross join lateral (
    select
      case
        when e->>'ingredient_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (e->>'ingredient_id')::uuid
        else null
      end as ingredient_id,
      coalesce(
        nullif(trim(e->>'display_name'), ''),
        nullif(trim(e->>'canonical_key'), ''),
        'Unknown ingredient'
      ) as ingredient_name
    from jsonb_array_elements(
      case
        when jsonb_typeof(dl.ingredient_snapshot_json) = 'array' then dl.ingredient_snapshot_json
        else '[]'::jsonb
      end
    ) as e
  ) x
  where x.ingredient_id is not null
  order by l.submission_id, x.ingredient_id, x.ingredient_name;
$$;

-- Spirit family per log: spirit-family-* tags (versioned, via the log's catalog
-- version) joined to snapshot ingredients. At most one row per (log, family).
-- spirit-clear / spirit-dark / rum-style-* are NOT spirit-family-* and never count.
create or replace function public.wrapped_di_log_liquors(p_cruise_config_id uuid)
returns table (
  submission_id uuid,
  player_id uuid,
  family_tag text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    i.submission_id,
    i.player_id,
    t.tag
  from public.wrapped_di_log_ingredients(p_cruise_config_id) i
  join public.catalog_version_ingredient_tags t
    on t.catalog_version_id = i.catalog_version_id
   and t.ingredient_id = i.ingredient_id
   and starts_with(t.tag, 'spirit-family-');
$$;

-- Outbound companion rows: one row per (log, companion). Both logger and companion
-- must be on the Drink It! roster.
create or replace function public.wrapped_di_companion_rows(p_cruise_config_id uuid)
returns table (
  submission_id uuid,
  logger_id uuid,
  logger_name text,
  companion_id uuid,
  companion_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.submission_id,
    l.player_id,
    l.player_name,
    cr.player_id,
    cr.display_name
  from public.wrapped_di_log_rows(p_cruise_config_id) l
  join public.drink_log_companions c on c.submission_id = l.submission_id
  join public.drinkit_player_score_rows(p_cruise_config_id) cr
    on cr.player_id = c.companion_player_id
  where c.companion_player_id <> l.player_id;
$$;

-- Ship-local time of day of each accepted log (Ship Clock, historical offsets).
create or replace function public.wrapped_di_log_times(p_cruise_config_id uuid)
returns table (
  submission_id uuid,
  player_id uuid,
  player_name text,
  ship_day integer,
  ship_time time
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.submission_id,
    l.player_id,
    l.player_name,
    l.ship_day,
    public.achievement_ship_local_time_for_submission(s)
  from public.wrapped_di_log_rows(p_cruise_config_id) l
  join public.submissions s on s.id = l.submission_id;
$$;

-- One row per roster player with every per-player aggregate used by Global awards.
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
language sql
stable
security definer
set search_path = public
as $$
  select
    r.player_id,
    r.display_name,
    r.points,
    coalesce(lg.logs, 0),
    coalesce(cl.bounties, 0),
    coalesce(cl.cocktail, 0),
    coalesce(cl.ingredient, 0),
    coalesce(cl.bar, 0),
    coalesce(cl.daily, 0),
    coalesce(ach.n, 0),
    coalesce(lg.bars, 0),
    coalesce(lg.drinks, 0),
    coalesce(adv.n, 0)
  from public.drinkit_player_score_rows(p_cruise_config_id) r
  left join (
    select
      l.player_id,
      count(*)::integer as logs,
      count(distinct l.bar_id)::integer as bars,
      (count(distinct l.drink_concept_id) filter (
        where l.drink_mode = 'named_catalog' and l.drink_concept_id is not null
      ))::integer as drinks
    from public.wrapped_di_log_rows(p_cruise_config_id) l
    group by l.player_id
  ) lg on lg.player_id = r.player_id
  left join (
    select
      c.player_id,
      count(*)::integer as bounties,
      (count(*) filter (where c.category = 'cocktail'))::integer as cocktail,
      (count(*) filter (where c.category = 'ingredient'))::integer as ingredient,
      (count(*) filter (where c.category = 'bar'))::integer as bar,
      (count(*) filter (where c.category = 'daily'))::integer as daily
    from public.wrapped_di_claim_rows(p_cruise_config_id) c
    group by c.player_id
  ) cl on cl.player_id = r.player_id
  left join (
    -- Most Adventurous Drinker: logs whose (catalog_version_id, offering_id) is an
    -- 'adventurous' cocktail candidate. Tiers are imported content, never invented.
    select l.player_id, count(*)::integer as n
    from public.wrapped_di_log_rows(p_cruise_config_id) l
    join public.cocktail_candidates cc
      on cc.catalog_version_id = l.catalog_version_id
     and cc.offering_id = l.offering_id
     and cc.tier = 'adventurous'
    group by l.player_id
  ) adv on adv.player_id = r.player_id
  left join (
    select aa.owner_player_id as player_id, count(*)::integer as n
    from public.achievement_awards aa
    join public.achievement_definitions ad on ad.id = aa.definition_id
    where aa.status = 'active'
      and aa.owner_player_id is not null
      and ad.game = 'drinkit'
      and ad.enabled is true
      and (ad.test_only is false or (select public.achievement_dev_cruise_active()))
    group by aa.owner_player_id
  ) ach on ach.player_id = r.player_id
  order by lower(r.display_name), r.player_id;
$$;

-- Per player x cruise day: ledger points (bounty_claims.game_day) and drink logs
-- (submissions.ship_day).
create or replace function public.wrapped_di_player_days(p_cruise_config_id uuid)
returns table (
  player_id uuid,
  player_name text,
  cruise_day integer,
  points integer,
  logs integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.player_id,
    r.display_name,
    u.cruise_day,
    sum(u.points)::integer,
    sum(u.logs)::integer
  from (
    select
      l.player_id,
      l.ship_day as cruise_day,
      0 as points,
      count(*)::integer as logs
    from public.wrapped_di_log_rows(p_cruise_config_id) l
    group by l.player_id, l.ship_day
    union all
    select
      c.player_id,
      c.game_day as cruise_day,
      sum(c.points)::integer as points,
      0 as logs
    from public.wrapped_di_claim_rows(p_cruise_config_id) c
    group by c.player_id, c.game_day
  ) u
  join public.drinkit_player_score_rows(p_cruise_config_id) r on r.player_id = u.player_id
  group by u.player_id, r.display_name, u.cruise_day
  order by lower(r.display_name), u.player_id, u.cruise_day;
$$;

-- Winners (max, > 0) for one per-player metric.
create or replace function public.wrapped_di_metric_winners(
  p_cruise_config_id uuid,
  p_metric text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.wrapped_max_winners(
    coalesce(
      jsonb_agg(
        public.wrapped_winner(
          m.player_id::text,
          m.player_name,
          (case p_metric
            when 'points' then m.points
            when 'drink_logs' then m.drink_logs
            when 'bounties' then m.bounties
            when 'cocktail_bounties' then m.cocktail_bounties
            when 'ingredient_bounties' then m.ingredient_bounties
            when 'bar_bounties' then m.bar_bounties
            when 'daily_challenges' then m.daily_challenges
            when 'achievements' then m.achievements
            when 'bars' then m.bars
            when 'different_drinks' then m.different_drinks
            when 'adventurous_logs' then m.adventurous_logs
            else 0
          end)::numeric,
          null
        )
      ),
      '[]'::jsonb
    )
  )
  from public.wrapped_di_player_metrics(p_cruise_config_id) m;
$$;

-- ===========================================================================
-- 3) Ship It! base read sets (roster-scoped)
-- ===========================================================================

-- Active completions for participating teams. cruise_day prefers
-- submissions.ship_day via submission_id; when submission_id is null the day is
-- derived from completed_at_utc via clock_offset_at + cruise_day_for_ship_date.
create or replace function public.wrapped_si_completion_rows(p_cruise_config_id uuid)
returns table (
  completion_id uuid,
  team_id uuid,
  team_name text,
  challenge_id uuid,
  category public.scavenger_category,
  title text,
  eligible boolean,
  sort_order integer,
  points integer,
  completed_at_utc timestamptz,
  submission_id uuid,
  cruise_day integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sc.id,
    t.team_id,
    t.team_name,
    sc.challenge_id,
    sc.category,
    coalesce(ch.title, sc.title_snapshot),
    coalesce(ch.enabled, false),
    ch.sort_order,
    sc.points,
    sc.completed_at_utc,
    sc.submission_id,
    coalesce(
      s.ship_day,
      public.cruise_day_for_ship_date(
        cfg.day1_ship_date,
        public.utc_to_ship_local(
          sc.completed_at_utc,
          public.clock_offset_at(cfg.id, cfg.base_ship_offset_minutes, sc.completed_at_utc)
        )::date,
        cfg.final_day
      )
    )
  from public.shipit_team_score_rows(p_cruise_config_id) t
  join public.scavenger_completions sc
    on sc.team_id = t.team_id
   and sc.cruise_config_id = p_cruise_config_id
   and sc.status = 'active'
  join public.cruise_config cfg on cfg.id = p_cruise_config_id
  left join public.scavenger_challenges ch on ch.id = sc.challenge_id
  left join public.submissions s on s.id = sc.submission_id;
$$;

-- Bound photo for a scavenger submission (metadata only; never a signed URL).
create or replace function public.wrapped_si_photo(p_submission_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'photo_id', p.id,
    'width', p.width,
    'height', p.height,
    'crop_zoom', p.crop_zoom,
    'crop_center_x', p.crop_center_x,
    'crop_center_y', p.crop_center_y
  )
  from public.photos p
  where p.bound_submission_id = p_submission_id
    and p.status = 'bound'
  order by p.bound_at_utc, p.id
  limit 1;
$$;

-- One row per participating team with aggregates used by Global awards.
-- exclusive = challenges (active completions) completed by exactly one team.
create or replace function public.wrapped_si_team_metrics(p_cruise_config_id uuid)
returns table (
  team_id uuid,
  team_name text,
  points integer,
  completed integer,
  categories integer,
  exclusive_count integer,
  active_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.team_id,
    t.team_name,
    t.points,
    t.completed_count,
    coalesce(cc.categories, 0),
    coalesce(ex.n, 0),
    coalesce(cc.days, 0)
  from public.shipit_team_score_rows(p_cruise_config_id) t
  left join (
    select
      c.team_id,
      count(distinct c.category)::integer as categories,
      count(distinct c.cruise_day)::integer as days
    from public.wrapped_si_completion_rows(p_cruise_config_id) c
    group by c.team_id
  ) cc on cc.team_id = t.team_id
  left join (
    select c.team_id, count(*)::integer as n
    from public.wrapped_si_completion_rows(p_cruise_config_id) c
    join (
      select o.challenge_id
      from public.wrapped_si_completion_rows(p_cruise_config_id) o
      group by o.challenge_id
      having count(distinct o.team_id) = 1
    ) only_one on only_one.challenge_id = c.challenge_id
    group by c.team_id
  ) ex on ex.team_id = t.team_id
  order by lower(t.team_name), t.team_id;
$$;

-- Per team x cruise day (days with a derivable cruise day only).
create or replace function public.wrapped_si_team_days(p_cruise_config_id uuid)
returns table (
  team_id uuid,
  team_name text,
  cruise_day integer,
  points integer,
  completions integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.team_id,
    c.team_name,
    c.cruise_day,
    sum(c.points)::integer,
    count(*)::integer
  from public.wrapped_si_completion_rows(p_cruise_config_id) c
  where c.cruise_day is not null
  group by c.team_id, c.team_name, c.cruise_day
  order by lower(c.team_name), c.team_id, c.cruise_day;
$$;

create or replace function public.wrapped_si_metric_winners(
  p_cruise_config_id uuid,
  p_metric text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.wrapped_max_winners(
    coalesce(
      jsonb_agg(
        public.wrapped_winner(
          m.team_id::text,
          m.team_name,
          (case p_metric
            when 'points' then m.points
            when 'completed' then m.completed
            when 'categories' then m.categories
            when 'exclusive' then m.exclusive_count
            when 'active_days' then m.active_days
            else 0
          end)::numeric,
          null
        )
      ),
      '[]'::jsonb
    )
  )
  from public.wrapped_si_team_metrics(p_cruise_config_id) m;
$$;

-- First / Last challenge completed (SI-P08, SI-P09 for one team; SI-G03, SI-G04 for
-- all teams when p_team_id is null). Includes bound-photo metadata.
create or replace function public.wrapped_si_edge_entry(
  p_spec_id text,
  p_label text,
  p_cruise_config_id uuid,
  p_team_id uuid,
  p_last boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row record;
  v_time time;
  v_when text;
  v_global boolean := p_team_id is null;
  v_items jsonb;
  v_winner jsonb;
begin
  select
    c.completion_id,
    c.team_id,
    c.team_name,
    c.challenge_id,
    c.title,
    c.points,
    c.completed_at_utc,
    c.cruise_day,
    c.submission_id
  into v_row
  from public.wrapped_si_completion_rows(p_cruise_config_id) c
  where p_team_id is null or c.team_id = p_team_id
  order by
    case when p_last then c.completed_at_utc end desc nulls last,
    case when not p_last then c.completed_at_utc end asc nulls last,
    lower(c.team_name),
    c.completion_id
  limit 1;

  if not found then
    return public.wrapped_entry_unavailable(p_spec_id, p_label, 'challenge_memory');
  end if;

  v_time := public.achievement_ship_local_time(v_row.completed_at_utc);
  v_when := concat_ws(
    ', ',
    public.wrapped_day_label(v_row.cruise_day),
    public.wrapped_format_ship_time(v_time)
  );

  v_items := jsonb_build_array(jsonb_build_object(
    'challenge_id', v_row.challenge_id,
    'title', v_row.title,
    'team_id', v_row.team_id,
    'team_name', v_row.team_name,
    'points', v_row.points,
    'cruise_day', v_row.cruise_day,
    'ship_time', public.wrapped_format_ship_time(v_time),
    'completed_at_utc', v_row.completed_at_utc
  ));

  if v_global then
    v_winner := public.wrapped_winner(
      v_row.team_id::text, v_row.team_name, v_row.points, v_row.title
    );
    return public.wrapped_entry(
      p_spec_id, p_label, true, 'challenge_memory',
      p_primary => v_row.team_name,
      p_secondary => concat_ws(' - ', v_row.title, nullif(v_when, '')),
      p_value_numeric => v_row.points,
      p_unit => 'points',
      p_winners => jsonb_build_array(v_winner),
      p_items => v_items,
      p_photo => public.wrapped_si_photo(v_row.submission_id)
    );
  end if;

  v_winner := public.wrapped_winner(
    v_row.challenge_id::text, v_row.title, v_row.points, nullif(v_when, '')
  );
  return public.wrapped_entry(
    p_spec_id, p_label, true, 'challenge_memory',
    p_primary => v_row.title,
    p_secondary => nullif(v_when, ''),
    p_value_numeric => v_row.points,
    p_unit => 'points',
    p_winners => jsonb_build_array(v_winner),
    p_items => v_items,
    p_photo => public.wrapped_si_photo(v_row.submission_id)
  );
end;
$$;

-- ===========================================================================
-- 4) Drink It! sections (46 entries)
-- ===========================================================================
create or replace function public.wrapped_drinkit_sections(
  p_player_id uuid,
  p_cruise_config_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p_cruise uuid := p_cruise_config_id;
  v_personal jsonb := '[]'::jsonb;
  v_global jsonb := '[]'::jsonb;
  v_collective jsonb := '[]'::jsonb;
  v_lb jsonb;
  v_rank integer;
  v_roster integer;
  v_points integer;
  v_logs integer;
  v_bounties integer;
  v_cocktail integer;
  v_ingredient integer;
  v_bar integer;
  v_daily integer;
  v_ach integer;
  v_drinks integer;
  v_bars integer;
  v_rows jsonb;
  v_w jsonb;
  v_items jsonb;
  v_text text;
  v_time time;
  v_n integer;
  v_num numeric;
begin
  select
    m.points, m.drink_logs, m.bounties, m.cocktail_bounties, m.ingredient_bounties,
    m.bar_bounties, m.daily_challenges, m.achievements, m.different_drinks, m.bars
  into
    v_points, v_logs, v_bounties, v_cocktail, v_ingredient,
    v_bar, v_daily, v_ach, v_drinks, v_bars
  from public.wrapped_di_player_metrics(p_cruise) m
  where m.player_id = p_player_id;

  v_points := coalesce(v_points, 0);
  v_logs := coalesce(v_logs, 0);
  v_bounties := coalesce(v_bounties, 0);
  v_cocktail := coalesce(v_cocktail, 0);
  v_ingredient := coalesce(v_ingredient, 0);
  v_bar := coalesce(v_bar, 0);
  v_daily := coalesce(v_daily, 0);
  v_ach := coalesce(v_ach, 0);
  v_drinks := coalesce(v_drinks, 0);
  v_bars := coalesce(v_bars, 0);

  -- =========================================================================
  -- PERSONAL (DI-P01 .. DI-P18)
  -- =========================================================================
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('DI-P01', 'Drinks Logged', v_logs, 'drinks'));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('DI-P02', 'Total Points', v_points, 'points'));

  -- DI-P03 Final Rank (competition ranking shared with the leaderboard: 1,1,3)
  v_lb := public.wrapped_drinkit_leaderboard(p_cruise, p_player_id);
  v_roster := jsonb_array_length(v_lb);
  select (e->>'rank')::integer
  into v_rank
  from jsonb_array_elements(v_lb) e
  where e->>'id' = p_player_id::text
  limit 1;
  if v_rank is null then
    v_personal := v_personal || jsonb_build_array(
      public.wrapped_entry_unavailable('DI-P03', 'Final Rank', 'rank'));
  else
    v_personal := v_personal || jsonb_build_array(public.wrapped_entry(
      'DI-P03', 'Final Rank', true, 'rank',
      p_primary => v_rank::text,
      p_secondary => format('of %s', v_roster),
      p_value_numeric => v_rank,
      p_unit => 'rank'
    ));
  end if;

  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('DI-P04', 'Achievements Unlocked', v_ach, 'achievements'));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('DI-P05', 'Bounties Completed', v_bounties, 'bounties'));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('DI-P06', 'Cocktail Bounties Completed', v_cocktail, 'bounties'));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('DI-P07', 'Ingredient Bounties Completed', v_ingredient, 'bounties'));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('DI-P08', 'Bar Bounties Completed', v_bar, 'bounties'));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('DI-P09', 'Daily Challenges Completed', v_daily, 'challenges'));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('DI-P10', 'Different Drinks Tried', v_drinks, 'drinks'));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('DI-P11', 'Bars Visited', v_bars, 'bars'));

  -- DI-P12 Favorite Drink: mode of drink_concept_id (named_catalog), ties kept
  select public.wrapped_max_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      l.drink_concept_id::text as k,
      (array_agg(l.drink_name order by l.received_at_utc desc, l.submission_id))[1] as nm,
      count(*) as n
    from public.wrapped_di_log_rows(p_cruise) l
    where l.player_id = p_player_id
      and l.drink_mode = 'named_catalog'
      and l.drink_concept_id is not null
    group by l.drink_concept_id
  ) g;
  v_personal := v_personal || jsonb_build_array(public.wrapped_winners_entry(
    'DI-P12', 'Favorite Drink', 'named_count', 'drinks', v_w));

  -- DI-P13 Favorite Liquor (spirit family; once per log per family)
  select public.wrapped_max_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      t.family_tag as k,
      public.wrapped_spirit_family_label(t.family_tag) as nm,
      count(*) as n
    from public.wrapped_di_log_liquors(p_cruise) t
    where t.player_id = p_player_id
    group by t.family_tag
  ) g;
  v_personal := v_personal || jsonb_build_array(public.wrapped_winners_entry(
    'DI-P13', 'Favorite Liquor', 'named_count', 'drinks', v_w));

  -- DI-P14 Favorite Ingredient (once per log per ingredient)
  select public.wrapped_max_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      i.ingredient_id::text as k,
      max(i.ingredient_name) as nm,
      count(*) as n
    from public.wrapped_di_log_ingredients(p_cruise) i
    where i.player_id = p_player_id
    group by i.ingredient_id
  ) g;
  v_personal := v_personal || jsonb_build_array(public.wrapped_winners_entry(
    'DI-P14', 'Favorite Ingredient', 'named_count', 'drinks', v_w));

  -- DI-P15 Favorite Bar (distinct bar_id; one visit per log)
  select public.wrapped_max_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      l.bar_id::text as k,
      (array_agg(l.bar_name order by l.received_at_utc desc, l.submission_id))[1] as nm,
      count(*) as n
    from public.wrapped_di_log_rows(p_cruise) l
    where l.player_id = p_player_id
    group by l.bar_id
  ) g;
  v_personal := v_personal || jsonb_build_array(public.wrapped_winners_entry(
    'DI-P15', 'Favorite Bar', 'named_count', 'visits', v_w));

  -- DI-P16 Partner in Crime: outbound companions on MY logs only
  select public.wrapped_max_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      c.companion_id::text as k,
      max(c.companion_name) as nm,
      count(*) as n
    from public.wrapped_di_companion_rows(p_cruise) c
    where c.logger_id = p_player_id
    group by c.companion_id
  ) g;
  v_personal := v_personal || jsonb_build_array(public.wrapped_winners_entry(
    'DI-P16', 'Partner in Crime', 'named_count', 'drinks', v_w));

  -- DI-P17 Biggest Day (ledger points by bounty_claims.game_day; ties list all days)
  select jsonb_agg(jsonb_build_object('day', d.cruise_day, 'value', d.points))
  into v_rows
  from public.wrapped_di_player_days(p_cruise) d
  where d.player_id = p_player_id;
  v_items := public.wrapped_top_day_items(coalesce(v_rows, '[]'::jsonb));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_day_entry('DI-P17', 'Biggest Day', 'day_points', 'points', v_items));

  -- DI-P18 Most Active Day (most drink logs by submissions.ship_day)
  select jsonb_agg(jsonb_build_object('day', d.cruise_day, 'value', d.logs))
  into v_rows
  from public.wrapped_di_player_days(p_cruise) d
  where d.player_id = p_player_id;
  v_items := public.wrapped_top_day_items(coalesce(v_rows, '[]'::jsonb));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_day_entry('DI-P18', 'Most Active Day', 'day_count', 'drinks', v_items));

  -- =========================================================================
  -- GLOBAL (DI-G01 .. DI-G16)
  -- =========================================================================
  v_w := public.wrapped_di_metric_winners(p_cruise, 'points');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G01', 'Grand Champion', 'winners', 'points', v_w));

  v_w := public.wrapped_di_metric_winners(p_cruise, 'drink_logs');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G02', 'Most Drinks Logged', 'winners', 'drinks', v_w));

  v_w := public.wrapped_di_metric_winners(p_cruise, 'bounties');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G03', 'Most Bounties Completed', 'winners', 'bounties', v_w));

  v_w := public.wrapped_di_metric_winners(p_cruise, 'cocktail_bounties');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G04', 'Most Cocktail Bounties Completed', 'winners', 'bounties', v_w));

  v_w := public.wrapped_di_metric_winners(p_cruise, 'ingredient_bounties');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G05', 'Most Ingredient Bounties Completed', 'winners', 'bounties', v_w));

  v_w := public.wrapped_di_metric_winners(p_cruise, 'bar_bounties');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G06', 'Most Bar Bounties Completed', 'winners', 'bounties', v_w));

  v_w := public.wrapped_di_metric_winners(p_cruise, 'daily_challenges');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G07', 'Most Daily Challenges Completed', 'winners', 'challenges', v_w));

  v_w := public.wrapped_di_metric_winners(p_cruise, 'achievements');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G08', 'Most Achievements Unlocked', 'winners', 'achievements', v_w));

  v_w := public.wrapped_di_metric_winners(p_cruise, 'bars');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G09', 'Most Bars Visited', 'winners', 'bars', v_w));

  v_w := public.wrapped_di_metric_winners(p_cruise, 'different_drinks');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G10', 'Most Different Drinks Tried', 'winners', 'drinks', v_w));

  v_w := public.wrapped_di_metric_winners(p_cruise, 'adventurous_logs');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G11', 'Most Adventurous Drinker', 'winners', 'drinks', v_w));

  -- DI-G12 Most Frequent Drinking Pair: unordered {logger, companion}; each
  -- (log, companion) row counts once; A->B and B->A logs accumulate on one pair.
  with pairs as (
    select
      least(c.logger_id, c.companion_id) as a_id,
      greatest(c.logger_id, c.companion_id) as b_id,
      count(*)::integer as n
    from public.wrapped_di_companion_rows(p_cruise) c
    group by least(c.logger_id, c.companion_id), greatest(c.logger_id, c.companion_id)
  ),
  top as (
    select max(pairs.n) as mx from pairs
  ),
  roster as (
    select r.player_id, r.display_name from public.drinkit_player_score_rows(p_cruise) r
  ),
  named as (
    select
      p.a_id,
      p.b_id,
      p.n,
      case when (lower(ra.display_name), p.a_id::text) <= (lower(rb.display_name), p.b_id::text)
        then p.a_id else p.b_id end as first_id,
      case when (lower(ra.display_name), p.a_id::text) <= (lower(rb.display_name), p.b_id::text)
        then ra.display_name else rb.display_name end as first_name,
      case when (lower(ra.display_name), p.a_id::text) <= (lower(rb.display_name), p.b_id::text)
        then p.b_id else p.a_id end as second_id,
      case when (lower(ra.display_name), p.a_id::text) <= (lower(rb.display_name), p.b_id::text)
        then rb.display_name else ra.display_name end as second_name
    from pairs p
    join top on p.n = top.mx
    join roster ra on ra.player_id = p.a_id
    join roster rb on rb.player_id = p.b_id
    where top.mx > 0
  )
  select
    coalesce(jsonb_agg(
      public.wrapped_winner(
        named.a_id::text || ':' || named.b_id::text,
        named.first_name || ' & ' || named.second_name,
        named.n,
        null
      )
      order by lower(named.first_name || ' & ' || named.second_name), named.a_id, named.b_id
    ), '[]'::jsonb),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'players', jsonb_build_array(
          jsonb_build_object('id', named.first_id, 'name', named.first_name),
          jsonb_build_object('id', named.second_id, 'name', named.second_name)
        ),
        'count', named.n
      )
      order by lower(named.first_name || ' & ' || named.second_name), named.a_id, named.b_id
    ), '[]'::jsonb)
  into v_w, v_items
  from named;
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G12', 'Most Frequent Drinking Pair', 'pair', 'drinks', v_w,
    p_secondary => null, p_items => v_items));

  -- DI-G13 Earliest Drink Logged (min Ship Time of day; player + Day N + 12h time)
  with t as (
    select * from public.wrapped_di_log_times(p_cruise)
  ),
  m as (
    select min(t.ship_time) as v from t
  )
  select
    coalesce(jsonb_agg(
      public.wrapped_winner(
        t.player_id::text, t.player_name,
        extract(epoch from t.ship_time)::numeric,
        public.wrapped_day_label(t.ship_day)
      )
      order by lower(t.player_name), t.player_id, t.ship_day
    ), '[]'::jsonb),
    string_agg(
      t.player_name || ' - ' || public.wrapped_day_label(t.ship_day), '; '
      order by lower(t.player_name), t.player_id, t.ship_day
    ),
    min(t.ship_time)
  into v_w, v_text, v_time
  from t
  join m on t.ship_time = m.v;
  if v_time is null then
    v_global := v_global || jsonb_build_array(public.wrapped_entry_unavailable(
      'DI-G13', 'Earliest Drink Logged', 'time_of_day'));
  else
    v_global := v_global || jsonb_build_array(public.wrapped_entry(
      'DI-G13', 'Earliest Drink Logged', true, 'time_of_day',
      p_primary => public.wrapped_format_ship_time(v_time),
      p_secondary => v_text,
      p_value_numeric => extract(epoch from v_time)::numeric,
      p_unit => 'time',
      p_winners => v_w
    ));
  end if;

  -- DI-G14 Latest Drink Logged (max Ship Time of day)
  with t as (
    select * from public.wrapped_di_log_times(p_cruise)
  ),
  m as (
    select max(t.ship_time) as v from t
  )
  select
    coalesce(jsonb_agg(
      public.wrapped_winner(
        t.player_id::text, t.player_name,
        extract(epoch from t.ship_time)::numeric,
        public.wrapped_day_label(t.ship_day)
      )
      order by lower(t.player_name), t.player_id, t.ship_day
    ), '[]'::jsonb),
    string_agg(
      t.player_name || ' - ' || public.wrapped_day_label(t.ship_day), '; '
      order by lower(t.player_name), t.player_id, t.ship_day
    ),
    max(t.ship_time)
  into v_w, v_text, v_time
  from t
  join m on t.ship_time = m.v;
  if v_time is null then
    v_global := v_global || jsonb_build_array(public.wrapped_entry_unavailable(
      'DI-G14', 'Latest Drink Logged', 'time_of_day'));
  else
    v_global := v_global || jsonb_build_array(public.wrapped_entry(
      'DI-G14', 'Latest Drink Logged', true, 'time_of_day',
      p_primary => public.wrapped_format_ship_time(v_time),
      p_secondary => v_text,
      p_value_numeric => extract(epoch from v_time)::numeric,
      p_unit => 'time',
      p_winners => v_w
    ));
  end if;

  -- DI-G15 Highest Single-Day Score (player-days; ties list every player-day)
  select public.wrapped_max_winners(coalesce(jsonb_agg(
    public.wrapped_winner(
      d.player_id::text, d.player_name, d.points, public.wrapped_day_label(d.cruise_day)
    )
  ), '[]'::jsonb))
  into v_w
  from public.wrapped_di_player_days(p_cruise) d;
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G15', 'Highest Single-Day Score', 'day_points', 'points', v_w));

  -- DI-G16 Most Drinks in One Day
  select public.wrapped_max_winners(coalesce(jsonb_agg(
    public.wrapped_winner(
      d.player_id::text, d.player_name, d.logs, public.wrapped_day_label(d.cruise_day)
    )
  ), '[]'::jsonb))
  into v_w
  from public.wrapped_di_player_days(p_cruise) d;
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'DI-G16', 'Most Drinks in One Day', 'day_count', 'drinks', v_w));

  -- =========================================================================
  -- COLLECTIVE (DI-C01 .. DI-C12)
  -- =========================================================================
  select count(*)::integer into v_n from public.wrapped_di_log_rows(p_cruise);
  v_collective := v_collective || jsonb_build_array(
    public.wrapped_count_entry('DI-C01', 'Total Drinks Logged', v_n, 'drinks'));

  select count(distinct l.drink_concept_id)::integer
  into v_n
  from public.wrapped_di_log_rows(p_cruise) l
  where l.drink_mode = 'named_catalog'
    and l.drink_concept_id is not null;
  v_collective := v_collective || jsonb_build_array(
    public.wrapped_count_entry('DI-C02', 'Total Different Drinks Tried', v_n, 'drinks'));

  select count(*)::integer into v_n from public.wrapped_di_claim_rows(p_cruise);
  v_collective := v_collective || jsonb_build_array(
    public.wrapped_count_entry('DI-C03', 'Total Bounties Completed', v_n, 'bounties'));

  select coalesce(sum(m.achievements), 0)::integer
  into v_n
  from public.wrapped_di_player_metrics(p_cruise) m;
  v_collective := v_collective || jsonb_build_array(
    public.wrapped_count_entry('DI-C04', 'Total Achievements Unlocked', v_n, 'achievements'));

  -- DI-C05 Most Popular Drink (logs per drink_concept_id, named_catalog)
  select public.wrapped_max_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      l.drink_concept_id::text as k,
      (array_agg(l.drink_name order by l.received_at_utc desc, l.submission_id))[1] as nm,
      count(*) as n
    from public.wrapped_di_log_rows(p_cruise) l
    where l.drink_mode = 'named_catalog'
      and l.drink_concept_id is not null
    group by l.drink_concept_id
  ) g;
  v_collective := v_collective || jsonb_build_array(public.wrapped_winners_entry(
    'DI-C05', 'Most Popular Drink', 'named_count', 'drinks', v_w));

  -- DI-C06 Most Popular Liquor
  select public.wrapped_max_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      t.family_tag as k,
      public.wrapped_spirit_family_label(t.family_tag) as nm,
      count(*) as n
    from public.wrapped_di_log_liquors(p_cruise) t
    group by t.family_tag
  ) g;
  v_collective := v_collective || jsonb_build_array(public.wrapped_winners_entry(
    'DI-C06', 'Most Popular Liquor', 'named_count', 'drinks', v_w));

  -- DI-C07 Most Popular Ingredient
  select public.wrapped_max_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      i.ingredient_id::text as k,
      max(i.ingredient_name) as nm,
      count(*) as n
    from public.wrapped_di_log_ingredients(p_cruise) i
    group by i.ingredient_id
  ) g;
  v_collective := v_collective || jsonb_build_array(public.wrapped_winners_entry(
    'DI-C07', 'Most Popular Ingredient', 'named_count', 'drinks', v_w));

  -- DI-C08 Most Popular Bar
  select public.wrapped_max_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      l.bar_id::text as k,
      (array_agg(l.bar_name order by l.received_at_utc desc, l.submission_id))[1] as nm,
      count(*) as n
    from public.wrapped_di_log_rows(p_cruise) l
    group by l.bar_id
  ) g;
  v_collective := v_collective || jsonb_build_array(public.wrapped_winners_entry(
    'DI-C08', 'Most Popular Bar', 'named_count', 'visits', v_w));

  -- DI-C09 Least Visited Bar: every active bar in the active catalog version,
  -- zeros included. No bars at all => unavailable; bars but no logs => all-zero tie
  -- is a valid result.
  with ptr as (
    select p.catalog_version_id from public.active_catalog_pointer p where p.id = 1
  ),
  cat_bars as (
    select cvb.bar_id, cvb.name
    from public.catalog_version_bars cvb
    join ptr on cvb.catalog_version_id = ptr.catalog_version_id
    where cvb.active is true
  ),
  lc as (
    select l.bar_id, count(*)::integer as n
    from public.wrapped_di_log_rows(p_cruise) l
    group by l.bar_id
  )
  select
    count(*)::integer,
    public.wrapped_min_winners(
      coalesce(jsonb_agg(
        public.wrapped_winner(b.bar_id::text, b.name, coalesce(lc.n, 0), null)
      ), '[]'::jsonb),
      true
    )
  into v_n, v_w
  from cat_bars b
  left join lc on lc.bar_id = b.bar_id;
  if coalesce(v_n, 0) = 0 then
    v_collective := v_collective || jsonb_build_array(public.wrapped_entry_unavailable(
      'DI-C09', 'Least Visited Bar', 'named_count', 'no_bars', null, 'visits'));
  else
    v_collective := v_collective || jsonb_build_array(public.wrapped_winners_entry(
      'DI-C09', 'Least Visited Bar', 'named_count', 'visits', v_w));
  end if;

  -- DI-C10 Most Popular Drinking Day (most logs across the roster by ship_day)
  select jsonb_agg(jsonb_build_object('day', x.cruise_day, 'value', x.logs))
  into v_rows
  from (
    select d.cruise_day, sum(d.logs)::integer as logs
    from public.wrapped_di_player_days(p_cruise) d
    group by d.cruise_day
  ) x;
  v_items := public.wrapped_top_day_items(coalesce(v_rows, '[]'::jsonb));
  v_collective := v_collective || jsonb_build_array(
    public.wrapped_day_entry('DI-C10', 'Most Popular Drinking Day', 'day_count', 'drinks', v_items));

  select count(distinct i.ingredient_id)::integer
  into v_n
  from public.wrapped_di_log_ingredients(p_cruise) i;
  v_collective := v_collective || jsonb_build_array(
    public.wrapped_count_entry('DI-C11', 'Total Unique Ingredients Tried', v_n, 'ingredients'));

  select coalesce(sum(r.points), 0)
  into v_num
  from public.drinkit_player_score_rows(p_cruise) r;
  v_collective := v_collective || jsonb_build_array(
    public.wrapped_count_entry('DI-C12', 'Total Points Earned', v_num, 'points'));

  return jsonb_build_object(
    'personal', v_personal,
    'global', v_global,
    'collective', v_collective
  );
end;
$$;

-- ===========================================================================
-- 5) Ship It! sections (34 entries)
-- ===========================================================================
-- p_player_id is the viewing account; every Ship It! value is team/cruise scoped,
-- so it is accepted for signature symmetry and future per-viewer needs only.
create or replace function public.wrapped_shipit_sections(
  p_player_id uuid,
  p_team_id uuid,
  p_cruise_config_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p_cruise uuid := p_cruise_config_id;
  v_personal jsonb := '[]'::jsonb;
  v_global jsonb := '[]'::jsonb;
  v_collective jsonb := '[]'::jsonb;
  v_lb jsonb;
  v_rank integer;
  v_teams integer;
  v_points integer;
  v_completed integer;
  v_exclusive integer;
  v_eligible integer;
  v_done_eligible integer;
  v_w jsonb;
  v_items jsonb;
  v_rows jsonb;
  v_n integer;
  v_m integer;
  v_num numeric;
  v_gap integer;
begin
  select m.points, m.completed, m.exclusive_count
  into v_points, v_completed, v_exclusive
  from public.wrapped_si_team_metrics(p_cruise) m
  where m.team_id = p_team_id;
  v_points := coalesce(v_points, 0);
  v_completed := coalesce(v_completed, 0);
  v_exclusive := coalesce(v_exclusive, 0);

  select count(*)::integer into v_eligible
  from public.scavenger_challenges ch
  where ch.enabled is true;

  v_lb := public.wrapped_shipit_leaderboard(p_cruise, p_team_id);
  v_teams := jsonb_array_length(v_lb);

  -- =========================================================================
  -- PERSONAL (SI-P01 .. SI-P10) — owner is the viewer's team
  -- =========================================================================
  select (e->>'rank')::integer
  into v_rank
  from jsonb_array_elements(v_lb) e
  where e->>'id' = p_team_id::text
  limit 1;
  if v_rank is null then
    v_personal := v_personal || jsonb_build_array(
      public.wrapped_entry_unavailable('SI-P01', 'Final Rank', 'rank'));
  else
    v_personal := v_personal || jsonb_build_array(public.wrapped_entry(
      'SI-P01', 'Final Rank', true, 'rank',
      p_primary => v_rank::text,
      p_secondary => format('of %s', v_teams),
      p_value_numeric => v_rank,
      p_unit => 'rank'
    ));
  end if;

  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('SI-P02', 'Total Points', v_points, 'points'));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('SI-P03', 'Challenges Completed', v_completed, 'challenges'));

  -- SI-P04 Completion Percentage: completions on enabled challenges / enabled
  -- challenges. Zero eligible challenges => N/A.
  select count(*)::integer
  into v_done_eligible
  from public.wrapped_si_completion_rows(p_cruise) c
  where c.team_id = p_team_id
    and c.eligible is true;
  if v_eligible = 0 then
    v_personal := v_personal || jsonb_build_array(public.wrapped_entry(
      'SI-P04', 'Completion Percentage', false, 'percent',
      p_primary => 'N/A', p_unit => 'percent', p_empty_reason => 'no_eligible_challenges'));
  else
    v_num := round(100.0 * v_done_eligible / v_eligible);
    v_personal := v_personal || jsonb_build_array(public.wrapped_entry(
      'SI-P04', 'Completion Percentage', true, 'percent',
      p_primary => public.wrapped_format_percent(v_num),
      p_secondary => format('%s of %s challenges', v_done_eligible, v_eligible),
      p_value_numeric => v_num,
      p_unit => 'percent'
    ));
  end if;

  -- SI-P05 Most Completed Category (ties keep every category)
  select public.wrapped_max_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      c.category::text as k,
      public.scavenger_category_label(c.category) as nm,
      count(*) as n
    from public.wrapped_si_completion_rows(p_cruise) c
    where c.team_id = p_team_id
    group by c.category
  ) g;
  v_personal := v_personal || jsonb_build_array(public.wrapped_winners_entry(
    'SI-P05', 'Most Completed Category', 'named_count', 'challenges', v_w));

  -- SI-P06 Biggest Day (points)
  select jsonb_agg(jsonb_build_object('day', d.cruise_day, 'value', d.points))
  into v_rows
  from public.wrapped_si_team_days(p_cruise) d
  where d.team_id = p_team_id;
  v_items := public.wrapped_top_day_items(coalesce(v_rows, '[]'::jsonb));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_day_entry('SI-P06', 'Biggest Day', 'day_points', 'points', v_items));

  -- SI-P07 Most Active Day (completions)
  select jsonb_agg(jsonb_build_object('day', d.cruise_day, 'value', d.completions))
  into v_rows
  from public.wrapped_si_team_days(p_cruise) d
  where d.team_id = p_team_id;
  v_items := public.wrapped_top_day_items(coalesce(v_rows, '[]'::jsonb));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_day_entry('SI-P07', 'Most Active Day', 'day_count', 'challenges', v_items));

  v_personal := v_personal || jsonb_build_array(
    public.wrapped_si_edge_entry('SI-P08', 'First Challenge Completed', p_cruise, p_team_id, false));
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_si_edge_entry('SI-P09', 'Last Challenge Completed', p_cruise, p_team_id, true));

  -- SI-P10 Exclusive Challenges (completed by exactly one participating team)
  select
    count(*)::integer,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'challenge_id', c.challenge_id,
        'title', c.title,
        'category', c.category::text
      )
      order by c.sort_order nulls last, lower(c.title), c.challenge_id
    ), '[]'::jsonb)
  into v_n, v_items
  from public.wrapped_si_completion_rows(p_cruise) c
  where c.team_id = p_team_id
    and c.challenge_id in (
      select o.challenge_id
      from public.wrapped_si_completion_rows(p_cruise) o
      group by o.challenge_id
      having count(distinct o.team_id) = 1
    );
  v_personal := v_personal || jsonb_build_array(
    public.wrapped_count_entry('SI-P10', 'Exclusive Challenges', v_n, 'challenges', v_items));

  -- =========================================================================
  -- GLOBAL (SI-G01 .. SI-G12)
  -- =========================================================================
  v_w := public.wrapped_si_metric_winners(p_cruise, 'points');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'SI-G01', 'Grand Champions', 'winners', 'points', v_w));

  v_w := public.wrapped_si_metric_winners(p_cruise, 'completed');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'SI-G02', 'Most Challenges Completed', 'winners', 'challenges', v_w));

  v_global := v_global || jsonb_build_array(
    public.wrapped_si_edge_entry('SI-G03', 'First Challenge Completed', p_cruise, null, false));
  v_global := v_global || jsonb_build_array(
    public.wrapped_si_edge_entry('SI-G04', 'Last Challenge Completed', p_cruise, null, true));

  -- SI-G05 Highest Single-Day Score (team-days)
  select public.wrapped_max_winners(coalesce(jsonb_agg(
    public.wrapped_winner(
      d.team_id::text, d.team_name, d.points, public.wrapped_day_label(d.cruise_day)
    )
  ), '[]'::jsonb))
  into v_w
  from public.wrapped_si_team_days(p_cruise) d;
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'SI-G05', 'Highest Single-Day Score', 'day_points', 'points', v_w));

  -- SI-G06 Most Challenges in One Day
  select public.wrapped_max_winners(coalesce(jsonb_agg(
    public.wrapped_winner(
      d.team_id::text, d.team_name, d.completions, public.wrapped_day_label(d.cruise_day)
    )
  ), '[]'::jsonb))
  into v_w
  from public.wrapped_si_team_days(p_cruise) d;
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'SI-G06', 'Most Challenges in One Day', 'day_count', 'challenges', v_w));

  v_w := public.wrapped_si_metric_winners(p_cruise, 'exclusive');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'SI-G07', 'Most Exclusive Challenges', 'winners', 'challenges', v_w));

  v_w := public.wrapped_si_metric_winners(p_cruise, 'active_days');
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'SI-G08', 'Most Active Days', 'winners', 'days', v_w));

  -- SI-G09 Category Leaders: ONE entry; items = one object per category (all five,
  -- in category order) with every tied leader. Categories with no completions have
  -- empty winners and count 0.
  with roster as (
    select t.team_id, t.team_name from public.shipit_team_score_rows(p_cruise) t
  ),
  cr as (
    select c.team_id, c.category from public.wrapped_si_completion_rows(p_cruise) c
  ),
  tc as (
    select
      r.team_id,
      r.team_name,
      k.category,
      count(cr.team_id)::integer as n
    from roster r
    cross join unnest(enum_range(null::public.scavenger_category)) as k(category)
    left join cr on cr.team_id = r.team_id and cr.category = k.category
    group by r.team_id, r.team_name, k.category
  ),
  mx as (
    select tc.category, max(tc.n) as m from tc group by tc.category
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'category', k.category::text,
      'label', public.scavenger_category_label(k.category),
      'winners', case
        when coalesce(mx.m, 0) > 0 then (
          select coalesce(jsonb_agg(
            public.wrapped_winner(tc.team_id::text, tc.team_name, tc.n, null)
            order by lower(tc.team_name), tc.team_id
          ), '[]'::jsonb)
          from tc
          where tc.category = k.category
            and tc.n = mx.m
        )
        else '[]'::jsonb
      end,
      'count', coalesce(mx.m, 0)
    )
    order by public.scavenger_category_sort(k.category)
  ), '[]'::jsonb)
  into v_items
  from unnest(enum_range(null::public.scavenger_category)) as k(category)
  left join mx on mx.category = k.category;

  select count(*)::integer
  into v_n
  from jsonb_array_elements(v_items) e
  where jsonb_array_length(e->'winners') > 0;
  if v_n = 0 then
    v_global := v_global || jsonb_build_array(public.wrapped_entry_unavailable(
      'SI-G09', 'Category Leaders', 'category_leaders'));
  else
    v_global := v_global || jsonb_build_array(public.wrapped_entry(
      'SI-G09', 'Category Leaders', true, 'category_leaders',
      p_primary => format('%s of %s categories', v_n, jsonb_array_length(v_items)),
      p_value_numeric => v_n,
      p_unit => 'categories',
      p_items => v_items
    ));
  end if;

  -- SI-G10 Highest-Value Challenge Completed: teams holding an active completion
  -- at the global max awarded points.
  with c as (
    select * from public.wrapped_si_completion_rows(p_cruise)
  ),
  m as (
    select max(c.points) as mx from c
  )
  select public.wrapped_max_winners(coalesce(jsonb_agg(
    public.wrapped_winner(g.team_id::text, g.team_name, g.mx, g.titles)
  ), '[]'::jsonb))
  into v_w
  from (
    select
      c.team_id,
      c.team_name,
      m.mx,
      string_agg(distinct c.title, '; ' order by c.title) as titles
    from c
    join m on c.points = m.mx
    group by c.team_id, c.team_name, m.mx
  ) g;
  v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
    'SI-G10', 'Highest-Value Challenge Completed', 'winners', 'points', v_w));

  -- SI-G11 Closest Teams: adjacent pairs in final standings order (same order as
  -- wrapped_shipit_leaderboard / shipit_team_score_rows). Needs >= 2 teams.
  -- A gap of 0 (tied teams) is a valid result.
  with lb as (
    select
      (e.value->>'id')::uuid as id,
      e.value->>'name' as name,
      (e.value->>'points')::integer as points,
      (e.value->>'rank')::integer as team_rank,
      e.ord
    from jsonb_array_elements(v_lb) with ordinality as e(value, ord)
  ),
  pr as (
    select
      a.id as aid, a.name as aname, a.points as apoints, a.team_rank as arank, a.ord as aord,
      b.id as bid, b.name as bname, b.points as bpoints, b.team_rank as brank,
      (a.points - b.points) as gap
    from lb a
    join lb b on b.ord = a.ord + 1
  ),
  m as (
    select min(pr.gap) as mn from pr
  )
  select
    coalesce(jsonb_agg(
      public.wrapped_winner(
        pr.aid::text || ':' || pr.bid::text,
        pr.aname || ' & ' || pr.bname,
        pr.gap,
        null
      )
      order by pr.aord
    ), '[]'::jsonb),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'upper', jsonb_build_object(
          'id', pr.aid, 'name', pr.aname, 'rank', pr.arank, 'points', pr.apoints),
        'lower', jsonb_build_object(
          'id', pr.bid, 'name', pr.bname, 'rank', pr.brank, 'points', pr.bpoints),
        'gap', pr.gap
      )
      order by pr.aord
    ), '[]'::jsonb),
    min(pr.gap)
  into v_w, v_items, v_gap
  from pr
  join m on pr.gap = m.mn;
  if jsonb_array_length(v_w) = 0 then
    v_global := v_global || jsonb_build_array(public.wrapped_entry_unavailable(
      'SI-G11', 'Closest Teams', 'adjacent_gap', 'need_two_teams', null, 'points'));
  else
    v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
      'SI-G11', 'Closest Teams', 'adjacent_gap', 'points', v_w,
      p_secondary => format('%s %s apart', v_gap, public.wrapped_unit_label(v_gap, 'points')),
      p_items => v_items,
      p_value => v_gap));
  end if;

  -- SI-G12 Largest Lead: biggest adjacent gap (> 0). Winner = the leading team.
  with lb as (
    select
      (e.value->>'id')::uuid as id,
      e.value->>'name' as name,
      (e.value->>'points')::integer as points,
      (e.value->>'rank')::integer as team_rank,
      e.ord
    from jsonb_array_elements(v_lb) with ordinality as e(value, ord)
  ),
  pr as (
    select
      a.id as aid, a.name as aname, a.points as apoints, a.team_rank as arank, a.ord as aord,
      b.id as bid, b.name as bname, b.points as bpoints, b.team_rank as brank,
      (a.points - b.points) as gap
    from lb a
    join lb b on b.ord = a.ord + 1
  ),
  m as (
    select max(pr.gap) as mx from pr
  )
  select
    coalesce(jsonb_agg(
      public.wrapped_winner(pr.aid::text, pr.aname, pr.gap, 'ahead of ' || pr.bname)
      order by pr.aord
    ), '[]'::jsonb),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'upper', jsonb_build_object(
          'id', pr.aid, 'name', pr.aname, 'rank', pr.arank, 'points', pr.apoints),
        'lower', jsonb_build_object(
          'id', pr.bid, 'name', pr.bname, 'rank', pr.brank, 'points', pr.bpoints),
        'gap', pr.gap
      )
      order by pr.aord
    ), '[]'::jsonb),
    max(pr.gap)
  into v_w, v_items, v_gap
  from pr
  join m on pr.gap = m.mx
  where m.mx > 0;
  if jsonb_array_length(v_w) = 0 then
    v_global := v_global || jsonb_build_array(public.wrapped_entry_unavailable(
      'SI-G12', 'Largest Lead', 'adjacent_gap',
      case when v_teams < 2 then 'need_two_teams' else 'no_qualifying_data' end,
      null, 'points'));
  else
    v_global := v_global || jsonb_build_array(public.wrapped_winners_entry(
      'SI-G12', 'Largest Lead', 'adjacent_gap', 'points', v_w,
      p_secondary => format('%s %s ahead', v_gap, public.wrapped_unit_label(v_gap, 'points')),
      p_items => v_items,
      p_value => v_gap));
  end if;

  -- =========================================================================
  -- COLLECTIVE (SI-C01 .. SI-C12)
  -- =========================================================================
  select count(*)::integer into v_n from public.wrapped_si_completion_rows(p_cruise);
  v_collective := v_collective || jsonb_build_array(
    public.wrapped_count_entry('SI-C01', 'Total Challenges Completed', v_n, 'challenges'));

  select count(distinct c.challenge_id)::integer
  into v_m
  from public.wrapped_si_completion_rows(p_cruise) c;
  v_collective := v_collective || jsonb_build_array(
    public.wrapped_count_entry('SI-C02', 'Unique Challenges Completed', v_m, 'challenges'));

  -- SI-C03 Overall Completion Percentage:
  -- distinct eligible challenges completed by at least one team
  -- ÷ total eligible published challenges × 100. Zero eligible => N/A.
  if v_eligible = 0 then
    v_collective := v_collective || jsonb_build_array(public.wrapped_entry(
      'SI-C03', 'Overall Completion Percentage', false, 'percent',
      p_primary => 'N/A', p_unit => 'percent', p_empty_reason => 'no_eligible_challenges'));
  else
    v_num := round(100.0 * v_m / v_eligible);
    v_collective := v_collective || jsonb_build_array(public.wrapped_entry(
      'SI-C03', 'Overall Completion Percentage', true, 'percent',
      p_primary => public.wrapped_format_percent(v_num),
      p_secondary => format('%s of %s challenges completed by at least one team', v_m, v_eligible),
      p_value_numeric => v_num,
      p_unit => 'percent'
    ));
  end if;

  select coalesce(sum(r.points), 0)
  into v_num
  from public.shipit_team_score_rows(p_cruise) r;
  v_collective := v_collective || jsonb_build_array(
    public.wrapped_count_entry('SI-C04', 'Total Points Earned', v_num, 'points'));

  -- SI-C05 Most Popular Challenge (most distinct teams; ties keep all)
  select public.wrapped_max_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      c.challenge_id::text as k,
      (array_agg(c.title order by c.completed_at_utc desc, c.completion_id))[1] as nm,
      count(distinct c.team_id) as n
    from public.wrapped_si_completion_rows(p_cruise) c
    group by c.challenge_id
  ) g;
  v_collective := v_collective || jsonb_build_array(public.wrapped_winners_entry(
    'SI-C05', 'Most Popular Challenge', 'named_count', 'teams', v_w));

  -- SI-C06 Least Popular Completed Challenge: among challenges with >= 1
  -- completion only (an uncompleted challenge can never win this).
  select public.wrapped_min_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      c.challenge_id::text as k,
      (array_agg(c.title order by c.completed_at_utc desc, c.completion_id))[1] as nm,
      count(distinct c.team_id) as n
    from public.wrapped_si_completion_rows(p_cruise) c
    group by c.challenge_id
  ) g;
  v_collective := v_collective || jsonb_build_array(public.wrapped_winners_entry(
    'SI-C06', 'Least Popular Completed Challenge', 'named_count', 'teams', v_w));

  -- SI-C07 / SI-C08: enabled challenges with no active completion by any team
  select
    count(*)::integer,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'challenge_id', ch.id,
        'title', ch.title,
        'category', ch.category::text,
        'sort_order', ch.sort_order
      )
      order by ch.sort_order, lower(ch.title), ch.id
    ), '[]'::jsonb)
  into v_n, v_items
  from public.scavenger_challenges ch
  left join (
    select distinct c.challenge_id
    from public.wrapped_si_completion_rows(p_cruise) c
  ) done on done.challenge_id = ch.id
  where ch.enabled is true
    and done.challenge_id is null;
  v_collective := v_collective || jsonb_build_array(
    public.wrapped_count_entry('SI-C07', 'Uncompleted Challenges', v_n, 'challenges'));

  if v_eligible = 0 then
    v_collective := v_collective || jsonb_build_array(public.wrapped_entry_unavailable(
      'SI-C08', 'Uncompleted Challenge List', 'list', 'no_eligible_challenges'));
  elsif v_n = 0 then
    v_collective := v_collective || jsonb_build_array(public.wrapped_entry(
      'SI-C08', 'Uncompleted Challenge List', true, 'list',
      p_primary => 'Every challenge was completed!',
      p_value_numeric => 0,
      p_unit => 'challenges',
      p_items => '[]'::jsonb
    ));
  else
    v_collective := v_collective || jsonb_build_array(public.wrapped_entry(
      'SI-C08', 'Uncompleted Challenge List', true, 'list',
      p_primary => v_n::text,
      p_value_numeric => v_n,
      p_unit => 'challenges',
      p_items => v_items
    ));
  end if;

  -- SI-C09 Most Popular Category (most completions across teams; ties keep all)
  select public.wrapped_max_winners(
    coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb)
  )
  into v_w
  from (
    select
      c.category::text as k,
      public.scavenger_category_label(c.category) as nm,
      count(*) as n
    from public.wrapped_si_completion_rows(p_cruise) c
    group by c.category
  ) g;
  v_collective := v_collective || jsonb_build_array(public.wrapped_winners_entry(
    'SI-C09', 'Most Popular Category', 'named_count', 'completions', v_w));

  -- SI-C10 Least Popular Category: all five categories compete (zero completions
  -- is a legitimate minimum), but only once at least one completion exists.
  select count(*)::integer into v_n from public.wrapped_si_completion_rows(p_cruise);
  if v_n = 0 then
    v_collective := v_collective || jsonb_build_array(public.wrapped_entry_unavailable(
      'SI-C10', 'Least Popular Category', 'named_count', null, null, 'completions'));
  else
    select public.wrapped_min_winners(
      coalesce(jsonb_agg(public.wrapped_winner(g.k, g.nm, g.n, null)), '[]'::jsonb),
      true
    )
    into v_w
    from (
      select
        k.category::text as k,
        public.scavenger_category_label(k.category) as nm,
        count(c.completion_id) as n
      from unnest(enum_range(null::public.scavenger_category)) as k(category)
      left join public.wrapped_si_completion_rows(p_cruise) c on c.category = k.category
      group by k.category
    ) g;
    v_collective := v_collective || jsonb_build_array(public.wrapped_winners_entry(
      'SI-C10', 'Least Popular Category', 'named_count', 'completions', v_w));
  end if;

  -- SI-C11 Most Active Day (most completions across all teams)
  select jsonb_agg(jsonb_build_object('day', x.cruise_day, 'value', x.n))
  into v_rows
  from (
    select d.cruise_day, sum(d.completions)::integer as n
    from public.wrapped_si_team_days(p_cruise) d
    group by d.cruise_day
  ) x;
  v_items := public.wrapped_top_day_items(coalesce(v_rows, '[]'::jsonb));
  v_collective := v_collective || jsonb_build_array(
    public.wrapped_day_entry('SI-C11', 'Most Active Day', 'day_count', 'challenges', v_items));

  -- SI-C12 Final Team Standings (full list: rank, name, points)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'rank', e.value->'rank',
      'id', e.value->'id',
      'name', e.value->'name',
      'points', e.value->'points',
      'completed', e.value->'completed',
      'is_my_team', e.value->'is_my_team'
    )
    order by e.ord
  ), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(v_lb) with ordinality as e(value, ord);
  if jsonb_array_length(v_items) = 0 then
    v_collective := v_collective || jsonb_build_array(public.wrapped_entry_unavailable(
      'SI-C12', 'Final Team Standings', 'standings', null, null, 'teams'));
  else
    v_collective := v_collective || jsonb_build_array(public.wrapped_entry(
      'SI-C12', 'Final Team Standings', true, 'standings',
      p_primary => jsonb_array_length(v_items)::text,
      p_value_numeric => jsonb_array_length(v_items),
      p_unit => 'teams',
      p_items => v_items
    ));
  end if;

  return jsonb_build_object(
    'personal', v_personal,
    'global', v_global,
    'collective', v_collective
  );
end;
$$;

-- ===========================================================================
-- 6) Core Wrapped payload (replaces Phase 8 body; signature unchanged)
--    Keeps personal_stats / group_awards / leaderboard for Phase 8 test compat.
-- ===========================================================================
create or replace function public.wrapped_payload_for(
  p_player_id uuid,
  p_game public.game_id,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate jsonb;
  v_cruise uuid;
  v_revealed_at timestamptz;
  v_team uuid;
  v_team_name text;
  v_personal jsonb;
  v_leaderboard jsonb;
  v_awards jsonb;
  v_sections jsonb;
begin
  if p_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not exists (
    select 1 from public.game_memberships gm
    where gm.player_id = p_player_id and gm.game = p_game and gm.enabled is true
  ) then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;

  v_gate := public.wrapped_require_finale(p_at);
  if not coalesce((v_gate->>'ok')::boolean, false) then
    return v_gate;
  end if;
  v_cruise := (v_gate->>'cruise_config_id')::uuid;

  select wr.revealed_at_utc into v_revealed_at
  from public.wrapped_reveals wr
  where wr.player_id = p_player_id and wr.game = p_game;

  if p_game = 'drinkit' then
    v_personal := public.wrapped_drinkit_personal_stats(p_player_id, v_cruise);
    v_leaderboard := public.wrapped_drinkit_leaderboard(v_cruise, p_player_id);
    v_awards := public.wrapped_compute_group_awards('drinkit', v_cruise);
    v_sections := public.wrapped_drinkit_sections(p_player_id, v_cruise);

    return jsonb_build_object(
      'ok', true,
      'game', 'drinkit',
      'awards_mode', true,
      'finale_at_utc', v_gate->>'finale_at_utc',
      'at_utc', p_at,
      'revealed', v_revealed_at is not null,
      'revealed_at_utc', v_revealed_at,
      'owner', jsonb_build_object(
        'type', 'player',
        'id', p_player_id,
        'display_name', (select display_name from public.players where id = p_player_id)
      ),
      'sections', v_sections,
      'personal_stats', v_personal,
      'group_awards', v_awards,
      'leaderboard', v_leaderboard
    );
  end if;

  select tm.team_id into v_team
  from public.team_memberships tm
  where tm.player_id = p_player_id and tm.active_to is null
  limit 1;
  if v_team is null then
    return jsonb_build_object('ok', false, 'code', 'SHIPIT_TEAM_REQUIRED');
  end if;
  select name into v_team_name from public.teams where id = v_team;

  v_personal := public.wrapped_shipit_team_stats(v_team, v_cruise);
  v_leaderboard := public.wrapped_shipit_leaderboard(v_cruise, v_team);
  v_awards := public.wrapped_compute_group_awards('shipit', v_cruise);
  v_sections := public.wrapped_shipit_sections(p_player_id, v_team, v_cruise);

  return jsonb_build_object(
    'ok', true,
    'game', 'shipit',
    'awards_mode', true,
    'finale_at_utc', v_gate->>'finale_at_utc',
    'at_utc', p_at,
    'revealed', v_revealed_at is not null,
    'revealed_at_utc', v_revealed_at,
    'owner', jsonb_build_object(
      'type', 'team',
      'id', v_team,
      'display_name', v_team_name
    ),
    'sections', v_sections,
    'personal_stats', v_personal,
    'group_awards', v_awards,
    'leaderboard', v_leaderboard
  );
end;
$$;

-- ===========================================================================
-- 7) Grants: helpers are service_role only; get_my_wrapped stays authenticated
--    (its definition and grants from Phase 8 are untouched).
-- ===========================================================================
revoke all on function public.wrapped_entry(text, text, boolean, text, text, text, numeric, text, jsonb, jsonb, jsonb, text, text) from public;
revoke all on function public.wrapped_entry_unavailable(text, text, text, text, text, text) from public;
revoke all on function public.wrapped_count_entry(text, text, numeric, text, jsonb) from public;
revoke all on function public.wrapped_winner(text, text, numeric, text) from public;
revoke all on function public.wrapped_unit_label(numeric, text) from public;
revoke all on function public.wrapped_format_percent(numeric) from public;
revoke all on function public.wrapped_spirit_family_label(text) from public;
revoke all on function public.wrapped_format_ship_time(time) from public;
revoke all on function public.wrapped_day_label(integer) from public;
revoke all on function public.wrapped_max_winners(jsonb) from public;
revoke all on function public.wrapped_min_winners(jsonb, boolean) from public;
revoke all on function public.wrapped_winners_entry(text, text, text, text, jsonb, text, jsonb, jsonb, numeric, text) from public;
revoke all on function public.wrapped_top_day_items(jsonb) from public;
revoke all on function public.wrapped_day_entry(text, text, text, text, jsonb) from public;
revoke all on function public.wrapped_di_log_rows(uuid) from public;
revoke all on function public.wrapped_di_claim_rows(uuid) from public;
revoke all on function public.wrapped_di_log_ingredients(uuid) from public;
revoke all on function public.wrapped_di_log_liquors(uuid) from public;
revoke all on function public.wrapped_di_companion_rows(uuid) from public;
revoke all on function public.wrapped_di_log_times(uuid) from public;
revoke all on function public.wrapped_di_player_metrics(uuid) from public;
revoke all on function public.wrapped_di_player_days(uuid) from public;
revoke all on function public.wrapped_di_metric_winners(uuid, text) from public;
revoke all on function public.wrapped_si_completion_rows(uuid) from public;
revoke all on function public.wrapped_si_photo(uuid) from public;
revoke all on function public.wrapped_si_team_metrics(uuid) from public;
revoke all on function public.wrapped_si_team_days(uuid) from public;
revoke all on function public.wrapped_si_metric_winners(uuid, text) from public;
revoke all on function public.wrapped_si_edge_entry(text, text, uuid, uuid, boolean) from public;
revoke all on function public.wrapped_drinkit_sections(uuid, uuid) from public;
revoke all on function public.wrapped_shipit_sections(uuid, uuid, uuid) from public;
revoke all on function public.wrapped_payload_for(uuid, public.game_id, timestamptz) from public;

grant execute on function public.wrapped_entry(text, text, boolean, text, text, text, numeric, text, jsonb, jsonb, jsonb, text, text) to service_role;
grant execute on function public.wrapped_entry_unavailable(text, text, text, text, text, text) to service_role;
grant execute on function public.wrapped_count_entry(text, text, numeric, text, jsonb) to service_role;
grant execute on function public.wrapped_winner(text, text, numeric, text) to service_role;
grant execute on function public.wrapped_unit_label(numeric, text) to service_role;
grant execute on function public.wrapped_format_percent(numeric) to service_role;
grant execute on function public.wrapped_spirit_family_label(text) to service_role;
grant execute on function public.wrapped_format_ship_time(time) to service_role;
grant execute on function public.wrapped_day_label(integer) to service_role;
grant execute on function public.wrapped_max_winners(jsonb) to service_role;
grant execute on function public.wrapped_min_winners(jsonb, boolean) to service_role;
grant execute on function public.wrapped_winners_entry(text, text, text, text, jsonb, text, jsonb, jsonb, numeric, text) to service_role;
grant execute on function public.wrapped_top_day_items(jsonb) to service_role;
grant execute on function public.wrapped_day_entry(text, text, text, text, jsonb) to service_role;
grant execute on function public.wrapped_di_log_rows(uuid) to service_role;
grant execute on function public.wrapped_di_claim_rows(uuid) to service_role;
grant execute on function public.wrapped_di_log_ingredients(uuid) to service_role;
grant execute on function public.wrapped_di_log_liquors(uuid) to service_role;
grant execute on function public.wrapped_di_companion_rows(uuid) to service_role;
grant execute on function public.wrapped_di_log_times(uuid) to service_role;
grant execute on function public.wrapped_di_player_metrics(uuid) to service_role;
grant execute on function public.wrapped_di_player_days(uuid) to service_role;
grant execute on function public.wrapped_di_metric_winners(uuid, text) to service_role;
grant execute on function public.wrapped_si_completion_rows(uuid) to service_role;
grant execute on function public.wrapped_si_photo(uuid) to service_role;
grant execute on function public.wrapped_si_team_metrics(uuid) to service_role;
grant execute on function public.wrapped_si_team_days(uuid) to service_role;
grant execute on function public.wrapped_si_metric_winners(uuid, text) to service_role;
grant execute on function public.wrapped_si_edge_entry(text, text, uuid, uuid, boolean) to service_role;
grant execute on function public.wrapped_drinkit_sections(uuid, uuid) to service_role;
grant execute on function public.wrapped_shipit_sections(uuid, uuid, uuid) to service_role;
grant execute on function public.wrapped_payload_for(uuid, public.game_id, timestamptz) to service_role;

comment on function public.wrapped_payload_for(uuid, public.game_id, timestamptz) is
  'Phase Final Wrapped: payload with sections{personal,global,collective} (46 Drink It! / 34 Ship It! entries) plus Phase 8 leaderboard, personal_stats and group_awards for compatibility.';
comment on function public.wrapped_drinkit_sections(uuid, uuid) is
  'Phase Final Wrapped: 18 personal + 16 global + 12 collective Drink It! entries (roster-scoped).';
comment on function public.wrapped_shipit_sections(uuid, uuid, uuid) is
  'Phase Final Wrapped: 10 personal + 12 global + 12 collective Ship It! entries (roster-scoped).';
comment on function public.wrapped_entry(text, text, boolean, text, text, text, numeric, text, jsonb, jsonb, jsonb, text, text) is
  'Phase Final Wrapped: canonical Wrapped entry object. Unavailable entries default primary to No qualifying data.';
