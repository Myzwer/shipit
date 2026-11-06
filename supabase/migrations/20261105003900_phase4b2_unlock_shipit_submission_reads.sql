-- Phase 4B2: mark Ship It! challenges submission_ready now that submit_scavenger exists.

create or replace function public.get_my_shipit_challenges(p_category text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_team_name text;
  v_life jsonb;
  v_cruise uuid;
  v_filter public.scavenger_category;
  v_items jsonb := '[]'::jsonb;
  v_sections jsonb := '[]'::jsonb;
  v_cat public.scavenger_category;
  v_cat_completed integer;
  v_cat_points integer;
  v_row record;
  v_completed boolean;
  v_accepting boolean;
begin
  v_team := public.require_shipit_team_id();
  select name into v_team_name from public.teams where id = v_team;
  perform public.ensure_finale_latched(now());
  v_life := public.shipit_lifecycle_at(now());
  v_accepting := coalesce((v_life->>'accepting_submissions')::boolean, false);

  if p_category is not null and nullif(trim(p_category), '') is not null and lower(trim(p_category)) <> 'all' then
    begin
      v_filter := trim(p_category)::public.scavenger_category;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'INVALID_CATEGORY', 'message', 'Unknown challenge category.');
    end;
  end if;

  if (v_life->>'status') = 'unconfigured' then
    return jsonb_build_object(
      'ok', true,
      'lifecycle', v_life,
      'team', jsonb_build_object('id', v_team, 'name', v_team_name),
      'filter', coalesce(v_filter::text, 'all'),
      'sections', '[]'::jsonb,
      'submission_available', false,
      'submission_blocked_reason', 'lifecycle'
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
    if v_filter is not null and v_cat is distinct from v_filter then
      continue;
    end if;

    v_items := '[]'::jsonb;
    v_cat_completed := 0;
    v_cat_points := 0;

    for v_row in
      select ch.*
      from public.scavenger_challenges ch
      where ch.enabled is true
        and ch.category = v_cat
      order by ch.sort_order
    loop
      select exists (
        select 1 from public.scavenger_completions sc
        where sc.team_id = v_team
          and sc.challenge_id = v_row.id
          and sc.status = 'active'
          and sc.cruise_config_id = v_cruise
      ) into v_completed;

      if v_completed then
        v_cat_completed := v_cat_completed + 1;
        v_cat_points := v_cat_points + v_row.points;
      end if;

      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'id', v_row.id,
        'canonical_key', v_row.canonical_key,
        'category', v_row.category,
        'title', v_row.title,
        'instructions', v_row.instructions,
        'points', v_row.points,
        'sort_order', v_row.sort_order,
        'photo_required', v_row.photo_required,
        'completed', v_completed,
        'actionable', (not v_completed) and v_accepting,
        'submission_ready', (not v_completed) and v_accepting
      ));
    end loop;

    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'category', v_cat,
      'label', public.scavenger_category_label(v_cat),
      'points_per_challenge', public.scavenger_category_points(v_cat),
      'completed', v_cat_completed,
      'total', 10,
      'points', v_cat_points,
      'challenges', v_items
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'lifecycle', v_life,
    'team', jsonb_build_object('id', v_team, 'name', v_team_name),
    'filter', coalesce(v_filter::text, 'all'),
    'sections', v_sections,
    'submission_available', v_accepting,
    'submission_blocked_reason', case when v_accepting then null else 'lifecycle' end
  );
end;
$$;

revoke all on function public.get_my_shipit_challenges(text) from public;
grant execute on function public.get_my_shipit_challenges(text) to authenticated;
