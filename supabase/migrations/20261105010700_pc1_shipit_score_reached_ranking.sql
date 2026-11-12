-- PC1: Ship It! final ranking — first team to reach a tied total ranks higher.
-- Owner-approved rule supersedes older 1,1,3 point-only ties for Ship It! placement.
-- Drink It! ranking and unrelated Wrapped statistical ties remain unchanged.

-- ---------------------------------------------------------------------------
-- Authoritative team score rows: score_reached_at = max(active completed_at_utc)
-- Deterministic collision: finishing completion id, then team id.
-- ---------------------------------------------------------------------------
drop function if exists public.shipit_team_score_rows(uuid);

create function public.shipit_team_score_rows(p_cruise_config_id uuid)
returns table (
  team_id uuid,
  team_name text,
  completed_count integer,
  points integer,
  score_reached_at timestamptz,
  score_reached_completion_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id as team_id,
    t.name as team_name,
    coalesce(agg.completed_count, 0)::integer as completed_count,
    coalesce(agg.points, 0)::integer as points,
    agg.score_reached_at,
    agg.score_reached_completion_id
  from public.teams t
  left join lateral (
    select
      count(*)::integer as completed_count,
      coalesce(sum(sc.points), 0)::integer as points,
      max(sc.completed_at_utc) as score_reached_at,
      (
        select sc2.id
        from public.scavenger_completions sc2
        where sc2.team_id = t.id
          and sc2.status = 'active'
          and sc2.cruise_config_id = p_cruise_config_id
        order by sc2.completed_at_utc desc, sc2.id asc
        limit 1
      ) as score_reached_completion_id
    from public.scavenger_completions sc
    where sc.team_id = t.id
      and sc.status = 'active'
      and sc.cruise_config_id = p_cruise_config_id
  ) agg on true
  where exists (
    select 1 from public.team_memberships tm
    where tm.team_id = t.id and tm.active_to is null
  )
  order by coalesce(agg.points, 0) desc,
           coalesce(agg.score_reached_at, 'infinity'::timestamptz) asc,
           coalesce(agg.score_reached_completion_id, '00000000-0000-0000-0000-000000000000'::uuid) asc,
           t.id asc;
$$;

comment on function public.shipit_team_score_rows(uuid) is
  'Ship It! team totals for a cruise. Equal points break by earliest server-accepted '
  'score_reached_at (max active completed_at_utc), then finishing completion id.';

revoke all on function public.shipit_team_score_rows(uuid) from public;
grant execute on function public.shipit_team_score_rows(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Shared strict leaderboard JSON (unique ranks; order from shipit_team_score_rows)
-- ---------------------------------------------------------------------------
create or replace function public.shipit_leaderboard_json(
  p_cruise_config_id uuid,
  p_viewer_team_id uuid default null,
  p_include_total boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_row record;
  v_rank integer := 0;
  v_members text[];
  v_entry jsonb;
begin
  for v_row in
    select * from public.shipit_team_score_rows(p_cruise_config_id)
  loop
    v_rank := v_rank + 1;

    select coalesce(array_agg(p.display_name order by lower(p.display_name), p.id), '{}'::text[])
    into v_members
    from public.team_memberships tm
    join public.players p on p.id = tm.player_id
    where tm.team_id = v_row.team_id
      and tm.active_to is null
      and p.active is true;

    v_entry := jsonb_build_object(
      'team_id', v_row.team_id,
      'team_name', v_row.team_name,
      'members', to_jsonb(v_members),
      'completed', v_row.completed_count,
      'points', v_row.points,
      'rank', v_rank,
      'is_my_team', p_viewer_team_id is not null and v_row.team_id = p_viewer_team_id
    );
    if p_include_total then
      v_entry := v_entry || jsonb_build_object('total', 50);
    end if;

    v_out := v_out || jsonb_build_array(v_entry);
  end loop;

  return v_out;
end;
$$;

revoke all on function public.shipit_leaderboard_json(uuid, uuid, boolean) from public;
grant execute on function public.shipit_leaderboard_json(uuid, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Live home standings: strict ranks via shipit_leaderboard_json
-- ---------------------------------------------------------------------------
create or replace function public.get_my_shipit_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_team uuid;
  v_team_name text;
  v_life jsonb;
  v_cruise uuid;
  v_categories jsonb := '[]'::jsonb;
  v_cat public.scavenger_category;
  v_completed integer;
  v_points integer;
  v_overall_completed integer := 0;
  v_overall_points integer := 0;
  v_leaderboard jsonb := '[]'::jsonb;
  v_my_completed integer := 0;
  v_my_points integer := 0;
begin
  v_player := public.require_shipit_player();
  v_team := public.require_shipit_team_id();
  select name into v_team_name from public.teams where id = v_team;

  perform public.ensure_finale_latched(now());
  v_life := public.shipit_lifecycle_at(now());

  if (v_life->>'status') = 'unconfigured' then
    return jsonb_build_object(
      'ok', true,
      'lifecycle', v_life,
      'team', jsonb_build_object('id', v_team, 'name', v_team_name),
      'overall', jsonb_build_object('completed', 0, 'total', 50, 'points', 0),
      'categories', '[]'::jsonb,
      'leaderboard', '[]'::jsonb
    );
  end if;

  v_cruise := (v_life->>'cruise_config_id')::uuid;

  foreach v_cat in array array[
    'classic_ship_landmarks'::public.scavenger_category,
    'food_and_drink_discoveries'::public.scavenger_category,
    'quirky_details_and_hidden_artifacts'::public.scavenger_category,
    'interactive_crew_and_activity'::public.scavenger_category,
    'creative_team_and_action_shots'::public.scavenger_category
  ]
  loop
    select count(*)::integer, coalesce(sum(sc.points), 0)::integer
    into v_completed, v_points
    from public.scavenger_completions sc
    join public.scavenger_challenges ch on ch.id = sc.challenge_id
    where sc.team_id = v_team
      and sc.status = 'active'
      and sc.cruise_config_id = v_cruise
      and ch.category = v_cat
      and ch.enabled is true;

    v_overall_completed := v_overall_completed + v_completed;
    v_overall_points := v_overall_points + v_points;

    v_categories := v_categories || jsonb_build_array(jsonb_build_object(
      'category', v_cat,
      'label', public.scavenger_category_label(v_cat),
      'points_per_challenge', public.scavenger_category_points(v_cat),
      'completed', v_completed,
      'total', 10,
      'points', v_points,
      'sort_order', public.scavenger_category_sort(v_cat)
    ));
  end loop;

  v_my_completed := v_overall_completed;
  v_my_points := v_overall_points;
  v_leaderboard := public.shipit_leaderboard_json(v_cruise, v_team, true);

  return jsonb_build_object(
    'ok', true,
    'lifecycle', v_life,
    'team', jsonb_build_object(
      'id', v_team,
      'name', v_team_name,
      'completed', v_my_completed,
      'points', v_my_points
    ),
    'overall', jsonb_build_object(
      'completed', v_my_completed,
      'total', 50,
      'points', v_my_points
    ),
    'categories', v_categories,
    'leaderboard', v_leaderboard
  );
end;
$$;

revoke all on function public.get_my_shipit_home() from public;
grant execute on function public.get_my_shipit_home() to authenticated;

create or replace function public.dev_get_shipit_home_at(p_at_utc timestamptz, p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_team_name text;
  v_life jsonb;
  v_cruise uuid;
  v_categories jsonb := '[]'::jsonb;
  v_cat public.scavenger_category;
  v_completed integer;
  v_points integer;
  v_overall_completed integer := 0;
  v_overall_points integer := 0;
  v_leaderboard jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    raise exception 'DEV_ONLY';
  end if;

  select tm.team_id into v_team
  from public.team_memberships tm
  where tm.player_id = p_player_id and tm.active_to is null
  limit 1;
  if v_team is null then
    return jsonb_build_object('ok', false, 'code', 'SHIPIT_TEAM_REQUIRED');
  end if;
  select name into v_team_name from public.teams where id = v_team;

  v_life := public.shipit_lifecycle_at(p_at_utc);
  if (v_life->>'status') = 'unconfigured' then
    return jsonb_build_object(
      'ok', true,
      'lifecycle', v_life,
      'team', jsonb_build_object('id', v_team, 'name', v_team_name)
    );
  end if;
  v_cruise := (v_life->>'cruise_config_id')::uuid;

  foreach v_cat in array array[
    'classic_ship_landmarks'::public.scavenger_category,
    'food_and_drink_discoveries'::public.scavenger_category,
    'quirky_details_and_hidden_artifacts'::public.scavenger_category,
    'interactive_crew_and_activity'::public.scavenger_category,
    'creative_team_and_action_shots'::public.scavenger_category
  ]
  loop
    select count(*)::integer, coalesce(sum(sc.points), 0)::integer
    into v_completed, v_points
    from public.scavenger_completions sc
    join public.scavenger_challenges ch on ch.id = sc.challenge_id
    where sc.team_id = v_team
      and sc.status = 'active'
      and sc.cruise_config_id = v_cruise
      and ch.category = v_cat
      and ch.enabled is true;
    v_overall_completed := v_overall_completed + v_completed;
    v_overall_points := v_overall_points + v_points;
    v_categories := v_categories || jsonb_build_array(jsonb_build_object(
      'category', v_cat,
      'label', public.scavenger_category_label(v_cat),
      'completed', v_completed,
      'total', 10,
      'points', v_points
    ));
  end loop;

  v_leaderboard := public.shipit_leaderboard_json(v_cruise, v_team, false);

  return jsonb_build_object(
    'ok', true,
    'lifecycle', v_life,
    'team', jsonb_build_object(
      'id', v_team,
      'name', v_team_name,
      'completed', v_overall_completed,
      'points', v_overall_points
    ),
    'overall', jsonb_build_object(
      'completed', v_overall_completed,
      'total', 50,
      'points', v_overall_points
    ),
    'categories', v_categories,
    'leaderboard', v_leaderboard
  );
end;
$$;

revoke all on function public.dev_get_shipit_home_at(timestamptz, uuid) from public;
grant execute on function public.dev_get_shipit_home_at(timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Wrapped Ship It! leaderboard: strict ranks (do not use shared 1,1,3 helper)
-- ---------------------------------------------------------------------------
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
  v_rank integer := 0;
begin
  for v_row in
    select * from public.shipit_team_score_rows(p_cruise_config_id)
  loop
    v_rank := v_rank + 1;

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
      'is_my_team', v_row.team_id = p_team,
      'rank', v_rank
    ));
  end loop;

  return v_rows;
end;
$$;

revoke all on function public.wrapped_shipit_leaderboard(uuid, uuid) from public;
grant execute on function public.wrapped_shipit_leaderboard(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- SI-G01 Grand Champions: first to reach the winning point total (not all ties)
-- Other metrics keep shared-maximum winner selection.
-- ---------------------------------------------------------------------------
create or replace function public.wrapped_si_metric_winners(
  p_cruise_config_id uuid,
  p_metric text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_champ record;
  v_rows jsonb;
begin
  if p_metric = 'points' then
    select t.team_id, t.team_name, t.points
    into v_champ
    from public.shipit_team_score_rows(p_cruise_config_id) t
    where t.points > 0
    limit 1;

    if v_champ.team_id is null then
      return '[]'::jsonb;
    end if;

    return jsonb_build_array(
      public.wrapped_winner(
        v_champ.team_id::text,
        v_champ.team_name,
        v_champ.points,
        null
      )
    );
  end if;

  select public.wrapped_max_winners(
    coalesce(
      jsonb_agg(
        public.wrapped_winner(
          m.team_id::text,
          m.team_name,
          (case p_metric
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
  into v_rows
  from public.wrapped_si_team_metrics(p_cruise_config_id) m;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

revoke all on function public.wrapped_si_metric_winners(uuid, text) from public;
grant execute on function public.wrapped_si_metric_winners(uuid, text) to service_role;
