-- Activity-day reporting boundary (05:00 ship-local → 04:59:59 next morning).
-- Reporting / analytics / time-window achievements / Wrapped only.
-- Does NOT change gameplay-day, bounty windows, Ship Clock, or finale.
-- Also hardens Mobile Order exclusions for gauntlets + Cocktail bounty.

-- ---------------------------------------------------------------------------
-- Pure helpers (wall-clock ship-local → activity date / activity clock)
-- ---------------------------------------------------------------------------
create or replace function public.activity_day_boundary_time()
returns time
language sql
immutable
parallel safe
as $$
  select time '05:00:00';
$$;

comment on function public.activity_day_boundary_time() is
  'Reporting activity-day boundary (05:00 ship-local). Not a gameplay open/close.';

create or replace function public.activity_date_from_ship_local(p_ship_local timestamp)
returns date
language sql
immutable
parallel safe
as $$
  select case
    when p_ship_local is null then null
    when (p_ship_local::time) < public.activity_day_boundary_time()
      then (p_ship_local::date - 1)
    else p_ship_local::date
  end;
$$;

comment on function public.activity_date_from_ship_local(timestamp) is
  'Activity calendar date: times before 05:00 belong to the previous civil date.';

create or replace function public.activity_clock_minutes_from_ship_local_time(p_t time)
returns numeric
language sql
immutable
parallel safe
as $$
  -- Do not use time+interval (Postgres time wraps mod 24h and can go negative).
  select case
    when p_t is null then null
    when p_t >= public.activity_day_boundary_time()
      then (
        extract(hour from p_t) * 60
        + extract(minute from p_t)
        + extract(second from p_t) / 60.0
      ) - 300
    else (
      extract(hour from p_t) * 60
      + extract(minute from p_t)
      + extract(second from p_t) / 60.0
    ) + 1140
  end;
$$;

comment on function public.activity_clock_minutes_from_ship_local_time(time) is
  'Minutes since 05:00 within the activity day (0 at 05:00; 1:34 AM ≈ 1234).';

create or replace function public.achievement_ship_local_timestamp_for_submission(
  p_sub public.submissions
)
returns timestamp
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base int;
  v_offset int;
  v_cfg_id uuid;
begin
  v_cfg_id := p_sub.cruise_config_id;
  select base_ship_offset_minutes into v_base from public.cruise_config where id = v_cfg_id;
  if v_base is null then
    select id, base_ship_offset_minutes into v_cfg_id, v_base
    from public.cruise_config where is_active limit 1;
  end if;
  if v_base is null then
    return (p_sub.received_at_utc at time zone 'UTC');
  end if;
  v_offset := public.clock_offset_at(v_cfg_id, v_base, p_sub.received_at_utc);
  return public.utc_to_ship_local(p_sub.received_at_utc, v_offset);
end;
$$;

comment on function public.achievement_ship_local_timestamp_for_submission(public.submissions) is
  'Historical ship-local timestamp for a submission (offset at received_at_utc).';

create or replace function public.achievement_activity_date_for_submission(
  p_sub public.submissions
)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select public.activity_date_from_ship_local(
    public.achievement_ship_local_timestamp_for_submission(p_sub)
  );
$$;

create or replace function public.achievement_activity_day_for_submission(
  p_sub public.submissions
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg public.cruise_config%rowtype;
  v_activity_date date;
begin
  select * into v_cfg from public.cruise_config where id = p_sub.cruise_config_id;
  if not found then
    select * into v_cfg from public.cruise_config where is_active limit 1;
  end if;
  if not found then
    return p_sub.ship_day;
  end if;
  v_activity_date := public.achievement_activity_date_for_submission(p_sub);
  return public.cruise_day_for_ship_date(
    v_cfg.day1_ship_date,
    v_activity_date,
    v_cfg.final_day
  );
end;
$$;

comment on function public.achievement_activity_day_for_submission(public.submissions) is
  'Cruise day number for the 05:00 activity date. Null when outside Day 1–final. Does not rewrite submissions.ship_day.';

create or replace function public.achievement_activity_clock_minutes_for_submission(
  p_sub public.submissions
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select public.activity_clock_minutes_from_ship_local_time(
    public.achievement_ship_local_time_for_submission(p_sub)
  );
$$;

create or replace function public.activity_day_for_utc(
  p_cruise_config_id uuid,
  p_at_utc timestamptz
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg public.cruise_config%rowtype;
  v_offset int;
  v_local timestamp;
begin
  select * into v_cfg from public.cruise_config where id = p_cruise_config_id;
  if not found then
    return null;
  end if;
  v_offset := public.clock_offset_at(
    v_cfg.id, v_cfg.base_ship_offset_minutes, p_at_utc
  );
  v_local := public.utc_to_ship_local(p_at_utc, v_offset);
  return public.cruise_day_for_ship_date(
    v_cfg.day1_ship_date,
    public.activity_date_from_ship_local(v_local),
    v_cfg.final_day
  );
end;
$$;

revoke all on function public.activity_day_boundary_time() from public;
revoke all on function public.activity_date_from_ship_local(timestamp) from public;
revoke all on function public.activity_clock_minutes_from_ship_local_time(time) from public;
revoke all on function public.achievement_ship_local_timestamp_for_submission(public.submissions) from public;
revoke all on function public.achievement_activity_date_for_submission(public.submissions) from public;
revoke all on function public.achievement_activity_day_for_submission(public.submissions) from public;
revoke all on function public.achievement_activity_clock_minutes_for_submission(public.submissions) from public;
revoke all on function public.activity_day_for_utc(uuid, timestamptz) from public;

grant execute on function public.activity_day_boundary_time() to authenticated, service_role;
grant execute on function public.activity_date_from_ship_local(timestamp) to authenticated, service_role;
grant execute on function public.activity_clock_minutes_from_ship_local_time(time) to authenticated, service_role;
grant execute on function public.achievement_ship_local_timestamp_for_submission(public.submissions) to service_role;
grant execute on function public.achievement_activity_date_for_submission(public.submissions) to service_role;
grant execute on function public.achievement_activity_day_for_submission(public.submissions) to service_role;
grant execute on function public.achievement_activity_clock_minutes_for_submission(public.submissions) to service_role;
grant execute on function public.activity_day_for_utc(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Mobile Order hardening: gauntlets require log bar = offering bar (physical)
-- ---------------------------------------------------------------------------
create or replace function public.achievement_log_counts_for_collection(
  p_offering_id uuid,
  p_owner uuid,
  p_as_of_utc timestamptz,
  p_as_of_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.submissions s
    join public.drink_logs d on d.submission_id = s.id
    join public.bar_offerings bo on bo.id = d.offering_id
    join public.bars b on b.id = d.bar_id and b.is_virtual is false
    join public.catalog_version_offerings cvo
      on cvo.catalog_version_id = d.catalog_version_id
     and cvo.offering_id = d.offering_id
    join public.catalog_version_drink_concepts dc
      on dc.catalog_version_id = d.catalog_version_id
     and dc.drink_concept_id = bo.drink_concept_id
    where s.status = 'accepted'
      and s.kind = 'drink_log'
      and d.drink_mode = 'named_catalog'
      and d.offering_id = p_offering_id
      and d.bar_id = bo.bar_id
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
      and (p_owner is null or s.author_player_id = p_owner)
      and dc.kind not in ('beer', 'wine')
      and public.achievement_offering_collection_price_ok(cvo.price_status)
      and not exists (
        select 1
        from public.admin_manual_offerings amo
        where amo.catalog_version_id = d.catalog_version_id
          and amo.offering_id = d.offering_id
          and amo.active
      )
      and not exists (
        select 1
        from public.catalog_version_offering_tags t
        where t.catalog_version_id = d.catalog_version_id
          and t.offering_id = d.offering_id
          and t.tag = 'collection-excluded'
      )
  );
$$;

comment on function public.achievement_log_counts_for_collection(uuid, uuid, timestamptz, uuid) is
  'Gauntlet credit only when the log is at the offering physical bar (excludes Mobile Order).';

-- Cocktail bounty: Mobile Order is location-restricted → unavailable
create or replace function public.drinkit_evaluate_eligibility(
  p_player_id uuid,
  p_payload jsonb,
  p_at_utc timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_drink jsonb;
  v_ing jsonb;
  v_cocktail jsonb;
begin
  v_result := public.drinkit_evaluate_eligibility_pre_mobile_order(p_player_id, p_payload, p_at_utc);
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    return v_result;
  end if;

  v_drink := v_result->'drink';
  if coalesce((v_drink->>'bar_is_virtual')::boolean, false) is not true
     and not exists (
       select 1 from public.bars b
       where b.id = nullif(v_drink->>'bar_id', '')::uuid and b.is_virtual is true
     ) then
    return v_result;
  end if;

  v_ing := v_result->'categories'->'ingredient';
  if v_ing is not null and (
       coalesce(v_ing->>'status', '') = 'eligible'
       or v_ing ? 'confirmable'
     ) then
    v_result := jsonb_set(
      v_result,
      '{categories,ingredient}',
      jsonb_build_object(
        'status', 'unavailable',
        'reason', 'virtual_order_source',
        'options', '[]'::jsonb
      ),
      true
    );
  end if;

  v_cocktail := v_result->'categories'->'cocktail';
  if v_cocktail is not null and (
       coalesce(v_cocktail->>'status', '') = 'eligible'
       or coalesce(v_cocktail->>'status', '') = 'confirmable'
       or v_cocktail ? 'confirmable'
     ) then
    v_result := jsonb_set(
      v_result,
      '{categories,cocktail}',
      jsonb_build_object(
        'status', 'unavailable',
        'reason', 'virtual_order_source',
        'options', '[]'::jsonb
      ),
      true
    );
  end if;

  return v_result;
end;
$$;

comment on function public.drinkit_evaluate_eligibility(uuid, jsonb, timestamptz) is
  'Eligibility: Mobile Order blocks Ingredient and Cocktail (location-restricted) until separate product rules.';

-- ---------------------------------------------------------------------------
-- Achievements: activity-day ship_time_window + day grouping (logs/completions)
-- ---------------------------------------------------------------------------
do $rename$
begin
  if to_regprocedure(
    'public.achievement_eval_condition_as_of_pre_activity_day(jsonb,public.game_id,uuid,uuid,uuid,timestamptz,uuid,integer)'
  ) is null then
    alter function public.achievement_eval_condition_as_of(
      jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer
    ) rename to achievement_eval_condition_as_of_pre_activity_day;
  end if;
end
$rename$;

create or replace function public.achievement_eval_condition_as_of(
  p_cfg jsonb,
  p_game public.game_id,
  p_owner_player uuid,
  p_owner_team uuid,
  p_trigger_submission uuid,
  p_as_of_utc timestamptz,
  p_as_of_id uuid,
  p_depth int default 0
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text;
  v_thresh int;
  v_count int;
  v_ok boolean;
  v_cruise public.cruise_config%rowtype;
begin
  if p_depth > 4 then
    raise exception 'CONDITION_NESTING_TOO_DEEP' using errcode = 'P0001';
  end if;
  if p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then
    return false;
  end if;
  v_type := p_cfg->>'type';

  -- Early Bird / Night Owl: before_hour is [05:00, H); after_hour is [H,24) U [00:00,05:00).
  if v_type = 'ship_time_window' then
    select * into v_cruise from public.cruise_config where is_active limit 1;
    select exists (
      select 1
      from public.submissions s
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and (
          (p_game = 'drinkit' and s.author_player_id = p_owner_player
            and s.kind = coalesce(nullif(p_cfg->>'event', ''), 'drink_log'))
          or (p_game = 'shipit' and s.team_id = p_owner_team
            and s.kind = 'scavenger_completion')
        )
        and (
          p_cfg->>'before_hour' is null
          or (
            public.achievement_ship_local_time_for_submission(s)
              >= public.activity_day_boundary_time()
            and public.achievement_ship_local_time_for_submission(s)
              < make_time((p_cfg->>'before_hour')::int, 0, 0)
          )
        )
        and (
          p_cfg->>'after_hour' is null
          or (
            public.achievement_ship_local_time_for_submission(s)
              >= make_time((p_cfg->>'after_hour')::int, 0, 0)
            or public.achievement_ship_local_time_for_submission(s)
              < public.activity_day_boundary_time()
          )
        )
        and (
          p_cfg->>'hour_start' is null
          or (
            public.achievement_ship_local_time_for_submission(s)
              >= make_time((p_cfg->>'hour_start')::int, 0, 0)
            and public.achievement_ship_local_time_for_submission(s)
              < make_time((p_cfg->>'hour_end')::int, 0, 0)
          )
        )
        and (
          coalesce((p_cfg->>'port_day_only')::boolean, false) is false
          or s.ship_day = any (coalesce(v_cruise.port_days, '{}'::int[]))
        )
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  -- Logging day-count achievements use activity day (not gameplay ship_day).
  if v_type = 'distinct_count' and p_cfg->>'subject' = 'cruise_days' then
    v_thresh := greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    if p_game = 'drinkit' then
      select count(distinct public.achievement_activity_day_for_submission(s))::int into v_count
      from public.submissions s
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.author_player_id = p_owner_player
        and s.kind = coalesce(nullif(p_cfg->>'event', ''), 'drink_log')
        and public.achievement_activity_day_for_submission(s) is not null;
    else
      select count(distinct public.achievement_activity_day_for_submission(s))::int into v_count
      from public.submissions s
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.team_id = p_owner_team
        and s.kind = coalesce(nullif(p_cfg->>'event', ''), 'scavenger_completion')
        and public.achievement_activity_day_for_submission(s) is not null;
    end if;
    return v_count >= v_thresh;
  end if;

  if v_type = 'grouped_count' and p_cfg->>'mode' = 'events_same_day' then
    v_thresh := greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    select coalesce(max(c), 0)::int into v_count
    from (
      select count(*) as c
      from public.submissions s
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and (
          (p_game = 'shipit' and s.team_id = p_owner_team and s.kind = 'scavenger_completion')
          or (p_game = 'drinkit' and s.author_player_id = p_owner_player and s.kind = 'drink_log')
        )
        and public.achievement_activity_day_for_submission(s) is not null
      group by public.achievement_activity_day_for_submission(s)
    ) t;
    return v_count >= v_thresh;
  end if;

  if v_type = 'grouped_count' and p_cfg->>'mode' = 'same_bar_distinct_days' then
    v_thresh := greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    select coalesce(max(c), 0)::int into v_count
    from (
      select count(distinct public.achievement_activity_day_for_submission(s)) as c
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      join public.bars b on b.id = d.bar_id and b.is_virtual is false
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.author_player_id = p_owner_player
        and public.achievement_activity_day_for_submission(s) is not null
      group by d.bar_id
    ) t;
    return v_count >= v_thresh;
  end if;

  if v_type = 'grouped_count' and p_cfg->>'mode' = 'bars_same_day' then
    v_thresh := greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    select coalesce(max(c), 0)::int into v_count
    from (
      select count(distinct d.bar_id) as c
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      join public.bars b on b.id = d.bar_id and b.is_virtual is false
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.author_player_id = p_owner_player
        and public.achievement_activity_day_for_submission(s) is not null
      group by public.achievement_activity_day_for_submission(s)
    ) t;
    return v_count >= v_thresh;
  end if;

  return public.achievement_eval_condition_as_of_pre_activity_day(
    p_cfg, p_game, p_owner_player, p_owner_team, p_trigger_submission,
    p_as_of_utc, p_as_of_id, p_depth
  );
end;
$$;

comment on function public.achievement_eval_condition_as_of(
  jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer
) is
  'Achievement eval with 05:00 activity-day windows/grouping for reporting-style conditions. Gameplay day_bounty_score / cruise_day first|final|thanksgiving unchanged (delegated).';

revoke all on function public.achievement_eval_condition_as_of(
  jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer
) from public;
grant execute on function public.achievement_eval_condition_as_of(
  jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer
) to service_role;

-- ---------------------------------------------------------------------------
-- Wrapped read models: activity day for log/completion day buckets + earliest/latest
-- ---------------------------------------------------------------------------
drop function if exists public.wrapped_di_log_times(uuid);

create or replace function public.wrapped_di_log_times(p_cruise_config_id uuid)
returns table (
  submission_id uuid,
  player_id uuid,
  player_name text,
  ship_day integer,
  activity_day integer,
  ship_time time,
  activity_clock_minutes numeric
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
    public.achievement_activity_day_for_submission(s),
    public.achievement_ship_local_time_for_submission(s),
    public.achievement_activity_clock_minutes_for_submission(s)
  from public.wrapped_di_log_rows(p_cruise_config_id) l
  join public.submissions s on s.id = l.submission_id;
$$;

comment on function public.wrapped_di_log_times(uuid) is
  'Drink log times: ship_time is wall-clock display; activity_* use the 05:00 reporting boundary.';

revoke all on function public.wrapped_di_log_times(uuid) from public;
grant execute on function public.wrapped_di_log_times(uuid) to service_role;

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
      public.achievement_activity_day_for_submission(s) as cruise_day,
      0 as points,
      count(*)::integer as logs
    from public.wrapped_di_log_rows(p_cruise_config_id) l
    join public.submissions s on s.id = l.submission_id
    where public.achievement_activity_day_for_submission(s) is not null
    group by l.player_id, public.achievement_activity_day_for_submission(s)
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

comment on function public.wrapped_di_player_days(uuid) is
  'Per-player day buckets: drink logs use 05:00 activity day; bounty points remain gameplay game_day.';

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
      case when s.id is not null
        then public.achievement_activity_day_for_submission(s)
        else null
      end,
      public.activity_day_for_utc(cfg.id, sc.completed_at_utc)
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

comment on function public.wrapped_si_completion_rows(uuid) is
  'Ship It! completion rows with 05:00 activity-day cruise_day for reporting buckets.';


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

revoke all on function public.wrapped_di_player_days(uuid) from public;
grant execute on function public.wrapped_di_player_days(uuid) to service_role;

revoke all on function public.wrapped_si_completion_rows(uuid) from public;
grant execute on function public.wrapped_si_completion_rows(uuid) to service_role;
