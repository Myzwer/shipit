-- R6: Repair Wrapped Drink It! leaderboard ranking after 11100, and exclude
-- Mobile Order (null bar_id from wrapped_di_log_rows) from venue popularity
-- metrics DI-P15 / DI-C08. Additive forward-compatible repair for environments
-- that already applied 11100. Safe to re-run (create or replace).
--
-- Ranking contract (unchanged from drinkit_player_score_rows):
--   points DESC, first_claim_at ASC (nulls last via infinity), lower(name), id
-- Achievements remain display metadata on the points-ordered board; the
-- Achievements tab re-ranks client-side from the achievements field.
-- Competition ranks (1,1,3) still come from wrapped_rank_rows on that order.
--
-- Does NOT change Mobile Order bounty eligibility or Ship It! ranking rules.

-- ---------------------------------------------------------------------------
-- 1) Leaderboard: keep achievement counts; restore deterministic ORDER BY
-- ---------------------------------------------------------------------------
create or replace function public.wrapped_drinkit_leaderboard(p_cruise_config_id uuid, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_row record;
begin
  for v_row in
    select
      r.player_id,
      r.display_name,
      r.points,
      r.bounty_claims,
      r.first_claim_at,
      coalesce(m.achievements, 0) as achievements
    from public.drinkit_player_score_rows(p_cruise_config_id) r
    left join public.wrapped_di_player_metrics(p_cruise_config_id) m
      on m.player_id = r.player_id
    order by
      r.points desc,
      coalesce(r.first_claim_at, 'infinity'::timestamptz) asc,
      lower(r.display_name) asc,
      r.player_id asc
  loop
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id', v_row.player_id,
      'name', v_row.display_name,
      'points', v_row.points,
      'metric_label', format('Bounties %s/28', least(v_row.bounty_claims, 28)),
      'bounty_claims', v_row.bounty_claims,
      'achievements', v_row.achievements,
      'is_me', v_row.player_id = p_viewer
    ));
  end loop;
  return public.wrapped_rank_rows(v_rows);
end;
$$;

revoke all on function public.wrapped_drinkit_leaderboard(uuid, uuid) from public;
grant execute on function public.wrapped_drinkit_leaderboard(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2) Venue metrics: ignore virtual Mobile Order logs (bar_id already nulled
--    by wrapped_di_log_rows; GROUP BY still produced a pseudo-bar without
--    an explicit IS NOT NULL filter).
-- ---------------------------------------------------------------------------
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
      and l.bar_id is not null
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

  -- DI-G13 Earliest Drink Logged (min activity-clock position since 05:00; display wall time)
  with t as (
    select * from public.wrapped_di_log_times(p_cruise)
  ),
  m as (
    select min(t.activity_clock_minutes) as v from t
  )
  select
    coalesce(jsonb_agg(
      public.wrapped_winner(
        t.player_id::text, t.player_name,
        t.activity_clock_minutes,
        public.wrapped_day_label(t.activity_day)
      )
      order by lower(t.player_name), t.player_id, t.activity_day
    ), '[]'::jsonb),
    string_agg(
      t.player_name || ' - ' || public.wrapped_day_label(t.activity_day), '; '
      order by lower(t.player_name), t.player_id, t.activity_day
    ),
    (array_agg(t.ship_time order by t.activity_clock_minutes, t.submission_id))[1]
  into v_w, v_text, v_time
  from t
  join m on t.activity_clock_minutes = m.v;
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

  -- DI-G14 Latest Drink Logged (max activity-clock position since 05:00; display wall time)
  with t as (
    select * from public.wrapped_di_log_times(p_cruise)
  ),
  m as (
    select max(t.activity_clock_minutes) as v from t
  )
  select
    coalesce(jsonb_agg(
      public.wrapped_winner(
        t.player_id::text, t.player_name,
        t.activity_clock_minutes,
        public.wrapped_day_label(t.activity_day)
      )
      order by lower(t.player_name), t.player_id, t.activity_day
    ), '[]'::jsonb),
    string_agg(
      t.player_name || ' - ' || public.wrapped_day_label(t.activity_day), '; '
      order by lower(t.player_name), t.player_id, t.activity_day
    ),
    (array_agg(t.ship_time order by t.activity_clock_minutes desc, t.submission_id))[1]
  into v_w, v_text, v_time
  from t
  join m on t.activity_clock_minutes = m.v;
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
    where l.bar_id is not null
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



revoke all on function public.wrapped_drinkit_sections(uuid, uuid) from public;
grant execute on function public.wrapped_drinkit_sections(uuid, uuid) to service_role;
