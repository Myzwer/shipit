-- Phase 9A Gate 1: test_only Wrapped awards only on development-only cruises.
-- Server-authoritative; production/real cruises never surface [TEST] award defs.

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
  v_dev_cruise boolean := false;
begin
  select exists (
    select 1
    from public.cruise_config c
    where c.id = p_cruise_config_id
      and c.label = 'development-only'
  )
  into v_dev_cruise;

  select count(*)::integer into v_total_challenges
  from public.scavenger_challenges where enabled is true;

  for v_def in
    select *
    from public.wrapped_award_definitions d
    where d.game = p_game
      and d.enabled is true
      and (
        d.test_only is false
        or v_dev_cruise is true
      )
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

comment on function public.wrapped_compute_group_awards(public.game_id, uuid) is
  'Phase 8/9A: group Wrapped awards. test_only definitions appear only when cruise_config.label = development-only.';
