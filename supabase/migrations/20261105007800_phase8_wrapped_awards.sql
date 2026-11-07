-- Phase 8: Awards Mode + Cruise Wrapped
-- Align lifecycle finale with finale_at_utc; per-viewer reveal storage;
-- canonical final stats / group awards / Drink It! leaderboard reads.

-- ---------------------------------------------------------------------------
-- Lifecycle: use authoritative finale_at_utc (iterative offset refine)
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_lifecycle_at(p_at_utc timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_control public.game_control%rowtype;
  v_offset integer;
  v_ship timestamp;
  v_ship_date date;
  v_cruise_day integer;
  v_ship_time time;
  v_finale_utc timestamptz;
  v_open time := time '12:00';
  v_close time;
begin
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found then
    return jsonb_build_object('status', 'unavailable', 'reason', 'no_cruise_config');
  end if;

  select * into v_control from public.game_control where game = 'drinkit';
  v_offset := public.clock_offset_at(v_config.id, v_config.base_ship_offset_minutes, p_at_utc);
  v_ship := public.utc_to_ship_local(p_at_utc, v_offset);
  v_ship_date := v_ship::date;
  v_ship_time := v_ship::time;
  v_cruise_day := public.cruise_day_for_ship_date(v_config.day1_ship_date, v_ship_date, v_config.final_day);
  v_finale_utc := public.finale_at_utc(v_config, p_at_utc);

  if p_at_utc >= v_finale_utc or v_control.finalized_at_utc is not null then
    return jsonb_build_object(
      'status', 'finale',
      'reason', 'friday_6pm_cutoff',
      'cruise_day', v_cruise_day,
      'ship_date', v_ship_date,
      'finale_at_utc', v_finale_utc,
      'at_utc', p_at_utc
    );
  end if;

  if v_control.status = 'paused' then
    return jsonb_build_object(
      'status', 'paused',
      'reason', 'drinkit_paused',
      'cruise_day', v_cruise_day,
      'ship_date', v_ship_date,
      'at_utc', p_at_utc
    );
  end if;

  if v_cruise_day is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'outside_cruise',
      'at_utc', p_at_utc
    );
  end if;

  v_close := public.daily_public_end_ship_local(v_cruise_day);

  if v_ship_time < v_open then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'pre_open',
      'cruise_day', v_cruise_day,
      'ship_date', v_ship_date,
      'at_utc', p_at_utc
    );
  end if;

  if v_ship_time >= v_close then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'overnight',
      'cruise_day', v_cruise_day,
      'ship_date', v_ship_date,
      'at_utc', p_at_utc
    );
  end if;

  return jsonb_build_object(
    'status', 'open',
    'cruise_day', v_cruise_day,
    'ship_date', v_ship_date,
    'at_utc', p_at_utc,
    'public_end_utc', public.ship_local_to_utc((v_ship_date + v_close)::timestamp, v_offset),
    'offset_minutes', v_offset
  );
end;
$$;

create or replace function public.shipit_lifecycle_at(p_at_utc timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_control public.game_control%rowtype;
  v_offset integer;
  v_ship timestamp;
  v_ship_date date;
  v_cruise_day integer;
  v_finale_utc timestamptz;
  v_status text;
  v_read_only boolean := false;
begin
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found then
    return jsonb_build_object(
      'ok', true,
      'status', 'unconfigured',
      'read_only', true,
      'accepting_submissions', false,
      'reason', 'no_cruise_config'
    );
  end if;

  select * into v_control from public.game_control where game = 'shipit';
  v_offset := public.clock_offset_at(v_config.id, v_config.base_ship_offset_minutes, p_at_utc);
  v_ship := public.utc_to_ship_local(p_at_utc, v_offset);
  v_ship_date := v_ship::date;
  v_cruise_day := public.cruise_day_for_ship_date(v_config.day1_ship_date, v_ship_date, v_config.final_day);
  v_finale_utc := public.finale_at_utc(v_config, p_at_utc);

  if p_at_utc >= v_finale_utc or v_control.finalized_at_utc is not null then
    v_status := 'finale';
    v_read_only := true;
  elsif v_cruise_day is null then
    if v_ship_date < v_config.day1_ship_date then
      v_status := 'pre_cruise';
      v_read_only := true;
    else
      v_status := 'post_cruise';
      v_read_only := true;
    end if;
  else
    v_status := 'active';
    v_read_only := false;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'read_only', v_read_only,
    'accepting_submissions', (not v_read_only),
    'cruise_config_id', v_config.id,
    'cruise_day', v_cruise_day,
    'ship_date', v_ship_date,
    'ship_local', to_char(v_ship, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'finale_at_utc', v_finale_utc,
    'at_utc', p_at_utc
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-viewer Wrapped reveal (player × game) — never team-wide
-- ---------------------------------------------------------------------------
create table public.wrapped_reveals (
  player_id uuid not null references public.players (id) on delete cascade,
  game public.game_id not null,
  revealed_at_utc timestamptz not null default clock_timestamp(),
  primary key (player_id, game)
);

create index wrapped_reveals_game_idx on public.wrapped_reveals (game, revealed_at_utc);

comment on table public.wrapped_reveals is
  'Phase 8: one-time Wrapped Start per viewer account per game. Ship It! results are team-scoped but reveal is per player.';

alter table public.wrapped_reveals enable row level security;
alter table public.wrapped_reveals force row level security;

revoke all on table public.wrapped_reveals from anon, authenticated;
grant select on table public.wrapped_reveals to authenticated;

create policy wrapped_reveals_select_own
  on public.wrapped_reveals
  for select
  to authenticated
  using (player_id = public.current_player_id());

-- No direct inserts/updates from clients — RPCs only.

-- ---------------------------------------------------------------------------
-- TEST/PROVISIONAL group award definitions (content editable later)
-- ---------------------------------------------------------------------------
create table public.wrapped_award_definitions (
  id uuid primary key default gen_random_uuid(),
  game public.game_id not null,
  stable_key text not null,
  title text not null,
  quip text not null default '',
  metric_key text not null,
  selection_rule text not null,
  icon_key text not null default 'score.medal',
  sort_order integer not null default 0,
  enabled boolean not null default true,
  test_only boolean not null default true,
  allow_zero_win boolean not null default false,
  created_at timestamptz not null default now(),
  constraint wrapped_award_definitions_key_unique unique (stable_key),
  constraint wrapped_award_definitions_rule_check check (
    selection_rule in ('max', 'min', 'complete_all')
  ),
  constraint wrapped_award_definitions_metric_check check (
    metric_key in (
      'total_points',
      'distinct_bars',
      'drink_logs',
      'daily_completions',
      'challenges_completed',
      'distinct_categories',
      'achievements_earned'
    )
  )
);

comment on table public.wrapped_award_definitions is
  'Phase 8 TEST/PROVISIONAL Wrapped group awards. Final humorous catalog is later creative content.';

alter table public.wrapped_award_definitions enable row level security;
alter table public.wrapped_award_definitions force row level security;
revoke all on table public.wrapped_award_definitions from anon, authenticated;

-- Seed a small development-only set (titles clearly provisional).
insert into public.wrapped_award_definitions (
  game, stable_key, title, quip, metric_key, selection_rule, icon_key, sort_order, test_only, allow_zero_win
) values
  (
    'drinkit',
    'test-drinkit-top-points',
    '[TEST] Top Points',
    '[PROVISIONAL] Highest active bounty points.',
    'total_points',
    'max',
    'score.leaderboard',
    10,
    true,
    false
  ),
  (
    'drinkit',
    'test-drinkit-bar-explorer',
    '[TEST] Bar Explorer',
    '[PROVISIONAL] Most distinct game bars visited.',
    'distinct_bars',
    'max',
    'score.bar',
    20,
    true,
    false
  ),
  (
    'shipit',
    'test-shipit-top-points',
    '[TEST] Top Team Points',
    '[PROVISIONAL] Highest team scavenger points.',
    'total_points',
    'max',
    'score.leaderboard',
    10,
    true,
    false
  ),
  (
    'shipit',
    'test-shipit-category-spread',
    '[TEST] Category Spread',
    '[PROVISIONAL] Most distinct challenge categories completed.',
    'distinct_categories',
    'max',
    'score.team',
    20,
    true,
    false
  );

-- ---------------------------------------------------------------------------
-- Drink It! score rows (ledger sum of active bounty_claims)
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_player_score_rows(p_cruise_config_id uuid)
returns table (
  player_id uuid,
  display_name text,
  points integer,
  bounty_claims integer,
  first_claim_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as player_id,
    p.display_name,
    coalesce(agg.points, 0)::integer as points,
    coalesce(agg.bounty_claims, 0)::integer as bounty_claims,
    agg.first_claim_at
  from public.players p
  join public.game_memberships gm
    on gm.player_id = p.id
   and gm.game = 'drinkit'
   and gm.enabled is true
  left join lateral (
    select
      coalesce(sum(bc.points), 0)::integer as points,
      count(*)::integer as bounty_claims,
      min(bc.created_at) as first_claim_at
    from public.bounty_claims bc
    where bc.player_id = p.id
      and bc.cruise_config_id = p_cruise_config_id
      and bc.status = 'active'
  ) agg on true
  where p.active is true
  order by coalesce(agg.points, 0) desc,
           coalesce(agg.first_claim_at, 'infinity'::timestamptz) asc,
           lower(p.display_name) asc,
           p.id asc;
$$;

revoke all on function public.drinkit_player_score_rows(uuid) from public;
grant execute on function public.drinkit_player_score_rows(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Ranked leaderboard JSON helper (competition ties share 1,1,3)
-- ---------------------------------------------------------------------------
create or replace function public.wrapped_rank_rows(p_rows jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_rank integer := 0;
  v_prev_points integer;
  v_display_rank integer := 0;
  v_points integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return '[]'::jsonb;
  end if;

  for v_elem in
    select value
    from jsonb_array_elements(p_rows) with ordinality as t(value, ord)
    order by ord
  loop
    v_rank := v_rank + 1;
    v_points := coalesce((v_elem->>'points')::integer, 0);
    if v_prev_points is null or v_points is distinct from v_prev_points then
      v_display_rank := v_rank;
    end if;
    v_prev_points := v_points;
    v_out := v_out || jsonb_build_array(v_elem || jsonb_build_object('rank', v_display_rank));
  end loop;

  return v_out;
end;
$$;

revoke all on function public.wrapped_rank_rows(jsonb) from public;
grant execute on function public.wrapped_rank_rows(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Finale gate helper
-- ---------------------------------------------------------------------------
create or replace function public.wrapped_require_finale(p_at timestamptz default clock_timestamp())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latched boolean;
  v_config public.cruise_config;
  v_finale timestamptz;
begin
  v_latched := public.ensure_finale_latched(p_at);
  v_config := public.active_cruise_config();
  if v_config.id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_CRUISE_CONFIG');
  end if;
  v_finale := public.finale_at_utc(v_config, p_at);
  if not v_latched and p_at < v_finale then
    return jsonb_build_object(
      'ok', false,
      'code', 'WRAPPED_NOT_AVAILABLE',
      'message', 'Wrapped opens after Friday 6:00 PM Ship Time.',
      'finale_at_utc', v_finale,
      'at_utc', p_at
    );
  end if;
  return jsonb_build_object(
    'ok', true,
    'cruise_config_id', v_config.id,
    'finale_at_utc', v_finale,
    'at_utc', p_at
  );
end;
$$;

revoke all on function public.wrapped_require_finale(timestamptz) from public;
grant execute on function public.wrapped_require_finale(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Drink It! personal stats
-- ---------------------------------------------------------------------------
create or replace function public.wrapped_drinkit_personal_stats(
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
  v_points integer := 0;
  v_drink_logs integer := 0;
  v_bars integer := 0;
  v_named_cocktails integer := 0;
  v_daily integer := 0;
  v_achievements integer := 0;
  v_companions integer := 0;
  v_claims_cocktail integer := 0;
  v_claims_ingredient integer := 0;
  v_claims_bar integer := 0;
  v_claims_daily integer := 0;
  v_bounty_claims integer := 0;
begin
  select coalesce(sum(bc.points), 0)::integer, count(*)::integer
  into v_points, v_bounty_claims
  from public.bounty_claims bc
  where bc.player_id = p_player_id
    and bc.cruise_config_id = p_cruise_config_id
    and bc.status = 'active';

  select
    count(*) filter (where bc.category = 'cocktail')::integer,
    count(*) filter (where bc.category = 'ingredient')::integer,
    count(*) filter (where bc.category = 'bar')::integer,
    count(*) filter (where bc.category = 'daily')::integer
  into v_claims_cocktail, v_claims_ingredient, v_claims_bar, v_claims_daily
  from public.bounty_claims bc
  where bc.player_id = p_player_id
    and bc.cruise_config_id = p_cruise_config_id
    and bc.status = 'active';

  select count(*)::integer
  into v_drink_logs
  from public.submissions s
  where s.author_player_id = p_player_id
    and s.cruise_config_id = p_cruise_config_id
    and s.game = 'drinkit'
    and s.kind = 'drink_log'
    and s.status = 'accepted';

  select count(distinct dl.bar_id)::integer
  into v_bars
  from public.submissions s
  join public.drink_logs dl on dl.submission_id = s.id
  where s.author_player_id = p_player_id
    and s.cruise_config_id = p_cruise_config_id
    and s.kind = 'drink_log'
    and s.status = 'accepted';

  select count(distinct dl.drink_concept_id)::integer
  into v_named_cocktails
  from public.submissions s
  join public.drink_logs dl on dl.submission_id = s.id
  where s.author_player_id = p_player_id
    and s.cruise_config_id = p_cruise_config_id
    and s.kind = 'drink_log'
    and s.status = 'accepted'
    and dl.drink_mode = 'named_catalog'
    and dl.drink_concept_id is not null;

  select count(*)::integer
  into v_daily
  from public.submissions s
  where s.author_player_id = p_player_id
    and s.cruise_config_id = p_cruise_config_id
    and s.kind = 'daily_completion'
    and s.status = 'accepted';

  select count(*)::integer
  into v_achievements
  from public.achievement_awards aa
  join public.achievement_definitions ad on ad.id = aa.definition_id
  where aa.owner_player_id = p_player_id
    and aa.status = 'active'
    and ad.game = 'drinkit';

  select count(distinct dlc.companion_player_id)::integer
  into v_companions
  from public.submissions s
  join public.drink_log_companions dlc on dlc.submission_id = s.id
  where s.author_player_id = p_player_id
    and s.cruise_config_id = p_cruise_config_id
    and s.kind = 'drink_log'
    and s.status = 'accepted';

  return jsonb_build_object(
    'final_points', v_points,
    'drink_logs', v_drink_logs,
    'distinct_bars', v_bars,
    'distinct_named_cocktails', v_named_cocktails,
    'daily_completions', v_daily,
    'achievements_earned', v_achievements,
    'distinct_companions', v_companions,
    'bounty_claims_total', v_bounty_claims,
    'bounty_claims_by_category', jsonb_build_object(
      'cocktail', v_claims_cocktail,
      'ingredient', v_claims_ingredient,
      'bar', v_claims_bar,
      'daily', v_claims_daily
    )
  );
end;
$$;

revoke all on function public.wrapped_drinkit_personal_stats(uuid, uuid) from public;
grant execute on function public.wrapped_drinkit_personal_stats(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Ship It! team stats
-- ---------------------------------------------------------------------------
create or replace function public.wrapped_shipit_team_stats(
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
  v_points integer := 0;
  v_completed integer := 0;
  v_total integer := 50;
  v_categories integer := 0;
  v_achievements integer := 0;
  v_by_cat jsonb := '[]'::jsonb;
  v_cat public.scavenger_category;
  v_cat_completed integer;
  v_cat_points integer;
begin
  select coalesce(sum(sc.points), 0)::integer, count(*)::integer
  into v_points, v_completed
  from public.scavenger_completions sc
  where sc.team_id = p_team_id
    and sc.cruise_config_id = p_cruise_config_id
    and sc.status = 'active';

  select count(distinct sc.category)::integer
  into v_categories
  from public.scavenger_completions sc
  where sc.team_id = p_team_id
    and sc.cruise_config_id = p_cruise_config_id
    and sc.status = 'active';

  select count(*)::integer into v_total
  from public.scavenger_challenges ch
  where ch.enabled is true;

  foreach v_cat in array array[
    'classic_ship_landmarks'::public.scavenger_category,
    'food_and_drink_discoveries'::public.scavenger_category,
    'quirky_details_and_hidden_artifacts'::public.scavenger_category,
    'interactive_crew_and_activity'::public.scavenger_category,
    'creative_team_and_action_shots'::public.scavenger_category
  ]
  loop
    select count(*)::integer, coalesce(sum(sc.points), 0)::integer
    into v_cat_completed, v_cat_points
    from public.scavenger_completions sc
    where sc.team_id = p_team_id
      and sc.cruise_config_id = p_cruise_config_id
      and sc.status = 'active'
      and sc.category = v_cat;

    v_by_cat := v_by_cat || jsonb_build_array(jsonb_build_object(
      'category', v_cat,
      'label', public.scavenger_category_label(v_cat),
      'completed', v_cat_completed,
      'total', 10,
      'points', v_cat_points
    ));
  end loop;

  select count(*)::integer
  into v_achievements
  from public.achievement_awards aa
  join public.achievement_definitions ad on ad.id = aa.definition_id
  where aa.owner_team_id = p_team_id
    and aa.status = 'active'
    and ad.game = 'shipit';

  return jsonb_build_object(
    'final_points', v_points,
    'challenges_completed', v_completed,
    'challenges_total', v_total,
    'distinct_categories', v_categories,
    'category_completions', v_by_cat,
    'achievements_earned', v_achievements,
    'team_submissions', v_completed
  );
end;
$$;

revoke all on function public.wrapped_shipit_team_stats(uuid, uuid) from public;
grant execute on function public.wrapped_shipit_team_stats(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Group award computation (deterministic; all ties returned)
-- ---------------------------------------------------------------------------
create or replace function public.wrapped_compute_group_awards(
  p_game public.game_id,
  p_cruise_config_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_def record;
  v_metric_rows jsonb := '[]'::jsonb;
  v_row record;
  v_best integer;
  v_winners jsonb;
  v_has_positive boolean;
  v_total_challenges integer := 50;
begin
  select count(*)::integer into v_total_challenges
  from public.scavenger_challenges where enabled is true;

  for v_def in
    select *
    from public.wrapped_award_definitions d
    where d.game = p_game
      and d.enabled is true
    order by d.sort_order, d.stable_key
  loop
    v_metric_rows := '[]'::jsonb;

    if p_game = 'drinkit' then
      for v_row in
        select
          r.player_id as owner_id,
          r.display_name as owner_name,
          case v_def.metric_key
            when 'total_points' then r.points
            when 'drink_logs' then (
              select count(*)::integer
              from public.submissions s
              where s.author_player_id = r.player_id
                and s.cruise_config_id = p_cruise_config_id
                and s.kind = 'drink_log'
                and s.status = 'accepted'
            )
            when 'distinct_bars' then (
              select count(distinct dl.bar_id)::integer
              from public.submissions s
              join public.drink_logs dl on dl.submission_id = s.id
              where s.author_player_id = r.player_id
                and s.cruise_config_id = p_cruise_config_id
                and s.kind = 'drink_log'
                and s.status = 'accepted'
            )
            when 'daily_completions' then (
              select count(*)::integer
              from public.submissions s
              where s.author_player_id = r.player_id
                and s.cruise_config_id = p_cruise_config_id
                and s.kind = 'daily_completion'
                and s.status = 'accepted'
            )
            when 'achievements_earned' then (
              select count(*)::integer
              from public.achievement_awards aa
              join public.achievement_definitions ad on ad.id = aa.definition_id
              where aa.owner_player_id = r.player_id
                and aa.status = 'active'
                and ad.game = 'drinkit'
            )
            else r.points
          end as metric_value
        from public.drinkit_player_score_rows(p_cruise_config_id) r
      loop
        v_metric_rows := v_metric_rows || jsonb_build_array(jsonb_build_object(
          'owner_id', v_row.owner_id,
          'owner_name', v_row.owner_name,
          'value', v_row.metric_value
        ));
      end loop;
    else
      for v_row in
        select
          r.team_id as owner_id,
          r.team_name as owner_name,
          case v_def.metric_key
            when 'total_points' then r.points
            when 'challenges_completed' then r.completed_count
            when 'distinct_categories' then (
              select count(distinct sc.category)::integer
              from public.scavenger_completions sc
              where sc.team_id = r.team_id
                and sc.cruise_config_id = p_cruise_config_id
                and sc.status = 'active'
            )
            when 'achievements_earned' then (
              select count(*)::integer
              from public.achievement_awards aa
              join public.achievement_definitions ad on ad.id = aa.definition_id
              where aa.owner_team_id = r.team_id
                and aa.status = 'active'
                and ad.game = 'shipit'
            )
            else r.points
          end as metric_value
        from public.shipit_team_score_rows(p_cruise_config_id) r
      loop
        v_metric_rows := v_metric_rows || jsonb_build_array(jsonb_build_object(
          'owner_id', v_row.owner_id,
          'owner_name', v_row.owner_name,
          'value', v_row.metric_value
        ));
      end loop;
    end if;

    if jsonb_array_length(v_metric_rows) = 0 then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'stable_key', v_def.stable_key,
        'title', v_def.title,
        'quip', v_def.quip,
        'icon_key', v_def.icon_key,
        'metric_key', v_def.metric_key,
        'test_only', v_def.test_only,
        'winners', '[]'::jsonb,
        'qualifying_value', null,
        'qualifying_label', null,
        'status', 'no_winner'
      ));
      continue;
    end if;

    if v_def.selection_rule = 'complete_all' then
      select coalesce(bool_or((e->>'value')::integer >= v_total_challenges), false)
      into v_has_positive
      from jsonb_array_elements(v_metric_rows) e;

      if not v_has_positive then
        v_out := v_out || jsonb_build_array(jsonb_build_object(
          'stable_key', v_def.stable_key,
          'title', v_def.title,
          'quip', v_def.quip,
          'icon_key', v_def.icon_key,
          'metric_key', v_def.metric_key,
          'test_only', v_def.test_only,
          'winners', '[]'::jsonb,
          'qualifying_value', null,
          'qualifying_label', null,
          'status', 'no_winner'
        ));
        continue;
      end if;
      v_best := v_total_challenges;
    elsif v_def.selection_rule = 'min' then
      select min((e->>'value')::integer) into v_best
      from jsonb_array_elements(v_metric_rows) e;
    else
      select max((e->>'value')::integer) into v_best
      from jsonb_array_elements(v_metric_rows) e;
    end if;

    -- Do not treat an all-zero max as a meaningful shared win unless allowed.
    if v_def.selection_rule = 'max'
       and coalesce(v_best, 0) = 0
       and not v_def.allow_zero_win then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'stable_key', v_def.stable_key,
        'title', v_def.title,
        'quip', v_def.quip,
        'icon_key', v_def.icon_key,
        'metric_key', v_def.metric_key,
        'test_only', v_def.test_only,
        'winners', '[]'::jsonb,
        'qualifying_value', 0,
        'qualifying_label', '0',
        'status', 'no_winner'
      ));
      continue;
    end if;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'owner_id', e->>'owner_id',
        'owner_name', e->>'owner_name',
        'value', (e->>'value')::integer
      )
      order by lower(e->>'owner_name'), e->>'owner_id'
    ), '[]'::jsonb)
    into v_winners
    from jsonb_array_elements(v_metric_rows) e
    where (e->>'value')::integer = v_best;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'stable_key', v_def.stable_key,
      'title', v_def.title,
      'quip', v_def.quip,
      'icon_key', v_def.icon_key,
      'metric_key', v_def.metric_key,
      'test_only', v_def.test_only,
      'winners', v_winners,
      'qualifying_value', v_best,
      'qualifying_label', v_best::text,
      'status', case
        when jsonb_array_length(v_winners) = 0 then 'no_winner'
        else 'awarded'
      end
    ));
  end loop;

  return v_out;
end;
$$;

revoke all on function public.wrapped_compute_group_awards(public.game_id, uuid) from public;
grant execute on function public.wrapped_compute_group_awards(public.game_id, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Leaderboard builders
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
    select * from public.drinkit_player_score_rows(p_cruise_config_id)
  loop
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id', v_row.player_id,
      'name', v_row.display_name,
      'points', v_row.points,
      'metric_label', format('Bounties %s/28', least(v_row.bounty_claims, 28)),
      'bounty_claims', v_row.bounty_claims,
      'is_me', v_row.player_id = p_viewer
    ));
  end loop;
  return public.wrapped_rank_rows(v_rows);
end;
$$;

revoke all on function public.wrapped_drinkit_leaderboard(uuid, uuid) from public;
grant execute on function public.wrapped_drinkit_leaderboard(uuid, uuid) to service_role;

create or replace function public.wrapped_shipit_leaderboard(p_cruise_config_id uuid, p_team uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_row record;
  v_members text[];
begin
  for v_row in
    select * from public.shipit_team_score_rows(p_cruise_config_id)
  loop
    select coalesce(array_agg(p.display_name order by lower(p.display_name), p.id), '{}'::text[])
    into v_members
    from public.team_memberships tm
    join public.players p on p.id = tm.player_id
    where tm.team_id = v_row.team_id
      and tm.active_to is null
      and p.active is true;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id', v_row.team_id,
      'name', v_row.team_name,
      'members', to_jsonb(v_members),
      'points', v_row.points,
      'metric_label', format('Challenges: %s/50', v_row.completed_count),
      'completed', v_row.completed_count,
      'is_my_team', v_row.team_id = p_team
    ));
  end loop;
  return public.wrapped_rank_rows(v_rows);
end;
$$;

revoke all on function public.wrapped_shipit_leaderboard(uuid, uuid) from public;
grant execute on function public.wrapped_shipit_leaderboard(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Core Wrapped payload (authenticated + timed)
-- ---------------------------------------------------------------------------
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
    'personal_stats', v_personal,
    'group_awards', v_awards,
    'leaderboard', v_leaderboard
  );
end;
$$;

revoke all on function public.wrapped_payload_for(uuid, public.game_id, timestamptz) from public;
grant execute on function public.wrapped_payload_for(uuid, public.game_id, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Player RPCs
-- ---------------------------------------------------------------------------
create or replace function public.get_my_wrapped(p_game public.game_id)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
begin
  v_player := public.current_player_id();
  if v_player is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  return public.wrapped_payload_for(v_player, p_game, clock_timestamp());
end;
$$;

revoke all on function public.get_my_wrapped(public.game_id) from public;
grant execute on function public.get_my_wrapped(public.game_id) to authenticated;

create or replace function public.reveal_my_wrapped(p_game public.game_id)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_gate jsonb;
  v_existing timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  v_player := public.current_player_id();
  if v_player is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not public.has_game(p_game) then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;

  v_gate := public.wrapped_require_finale(v_now);
  if not coalesce((v_gate->>'ok')::boolean, false) then
    return v_gate;
  end if;

  select revealed_at_utc into v_existing
  from public.wrapped_reveals
  where player_id = v_player and game = p_game;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'revealed', true,
      'idempotent_replay', true,
      'revealed_at_utc', v_existing,
      'game', p_game
    );
  end if;

  insert into public.wrapped_reveals (player_id, game, revealed_at_utc)
  values (v_player, p_game, v_now)
  on conflict (player_id, game) do nothing;

  select revealed_at_utc into v_existing
  from public.wrapped_reveals
  where player_id = v_player and game = p_game;

  return jsonb_build_object(
    'ok', true,
    'revealed', true,
    'idempotent_replay', false,
    'revealed_at_utc', v_existing,
    'game', p_game
  );
end;
$$;

revoke all on function public.reveal_my_wrapped(public.game_id) from public;
grant execute on function public.reveal_my_wrapped(public.game_id) to authenticated;

-- Drink It! standings for Home + Wrapped reuse
create or replace function public.get_my_drinkit_leaderboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_config public.cruise_config;
  v_at timestamptz := clock_timestamp();
begin
  v_player := public.current_player_id();
  if v_player is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.has_game('drinkit') then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;

  perform public.ensure_finale_latched(v_at);
  v_config := public.active_cruise_config();
  if v_config.id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_CRUISE_CONFIG');
  end if;

  return jsonb_build_object(
    'ok', true,
    'leaderboard', public.wrapped_drinkit_leaderboard(v_config.id, v_player),
    'at_utc', v_at
  );
end;
$$;

revoke all on function public.get_my_drinkit_leaderboard() from public;
grant execute on function public.get_my_drinkit_leaderboard() to authenticated;

-- ---------------------------------------------------------------------------
-- Dev/timed helpers (service_role + development-only)
-- ---------------------------------------------------------------------------
create or replace function public.dev_get_my_wrapped_at(
  p_player_id uuid,
  p_game public.game_id,
  p_at_utc timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;
  return public.wrapped_payload_for(p_player_id, p_game, p_at_utc);
end;
$$;

revoke all on function public.dev_get_my_wrapped_at(uuid, public.game_id, timestamptz) from public;
grant execute on function public.dev_get_my_wrapped_at(uuid, public.game_id, timestamptz) to service_role;

create or replace function public.dev_reveal_wrapped_at(
  p_player_id uuid,
  p_game public.game_id,
  p_at_utc timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate jsonb;
  v_existing timestamptz;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.game_memberships gm
    where gm.player_id = p_player_id and gm.game = p_game and gm.enabled is true
  ) then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;

  v_gate := public.wrapped_require_finale(p_at_utc);
  if not coalesce((v_gate->>'ok')::boolean, false) then
    return v_gate;
  end if;

  select revealed_at_utc into v_existing
  from public.wrapped_reveals
  where player_id = p_player_id and game = p_game;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'revealed', true,
      'idempotent_replay', true,
      'revealed_at_utc', v_existing,
      'game', p_game
    );
  end if;

  insert into public.wrapped_reveals (player_id, game, revealed_at_utc)
  values (p_player_id, p_game, p_at_utc)
  on conflict (player_id, game) do nothing;

  select revealed_at_utc into v_existing
  from public.wrapped_reveals
  where player_id = p_player_id and game = p_game;

  return jsonb_build_object(
    'ok', true,
    'revealed', true,
    'idempotent_replay', false,
    'revealed_at_utc', v_existing,
    'game', p_game
  );
end;
$$;

revoke all on function public.dev_reveal_wrapped_at(uuid, public.game_id, timestamptz) from public;
grant execute on function public.dev_reveal_wrapped_at(uuid, public.game_id, timestamptz) to service_role;

comment on function public.get_my_wrapped(public.game_id) is
  'Phase 8: final Wrapped payload after Friday 6 PM. Membership-scoped; no early leak.';
comment on function public.reveal_my_wrapped(public.game_id) is
  'Phase 8: idempotent per-viewer Wrapped Start. Does not alter scores or awards.';
