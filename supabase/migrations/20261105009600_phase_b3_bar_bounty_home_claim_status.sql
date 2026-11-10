-- Phase B3: Home board Bar Bounty reports claim status + B2 point-band metadata.
-- Does not recalculate historical bounty_claims.points.
-- Scoring remains drinkit_bar_crew_points / drinkit_bar_bounty_crew_eval (B2).

create or replace function public.get_my_current_bar_bounty()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_life jsonb;
  v_config public.cruise_config%rowtype;
  v_row public.bar_bounties%rowtype;
  v_day integer;
  v_claimed boolean := false;
  v_claimed_points integer := null;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  v_life := public.drinkit_lifecycle_at(now());
  if v_life->>'status' is distinct from 'open' then
    return jsonb_build_object(
      'status', coalesce(v_life->>'status', 'unavailable'),
      'reason', v_life->>'reason',
      'cruise_day', (v_life->>'cruise_day')::int
    );
  end if;

  v_day := (v_life->>'cruise_day')::int;
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'no_active_cruise',
      'cruise_day', v_day
    );
  end if;

  select * into v_row from public.bar_bounties
  where cruise_config_id = v_config.id and day_number = v_day;

  if not found then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'no_bar_assignment',
      'cruise_day', v_day
    );
  end if;

  select true, bc.points
    into v_claimed, v_claimed_points
  from public.bounty_claims bc
  where bc.player_id = v_me
    and bc.category = 'bar'
    and bc.status = 'active'
    and bc.game_day = v_day
  limit 1;

  if coalesce(v_claimed, false) then
    return jsonb_build_object(
      'status', 'already_claimed',
      'reason', 'category_used_today',
      'cruise_day', v_day,
      'assignment_id', v_row.id,
      'bar_id', v_row.bar_id,
      'bar_canonical_key', v_row.bar_canonical_key,
      'bar_display_name', v_row.bar_display_name,
      'points', coalesce(v_claimed_points, 0),
      'points_min', 20,
      'points_max', 40,
      'scoring', 'b2-crew-v1',
      'public_end_utc', v_life->>'public_end_utc'
    );
  end if;

  return jsonb_build_object(
    'status', 'active',
    'assignment_id', v_row.id,
    'cruise_day', v_day,
    'bar_id', v_row.bar_id,
    'bar_canonical_key', v_row.bar_canonical_key,
    'bar_display_name', v_row.bar_display_name,
    -- Legacy fields retained for older parsers; UI uses points_min/max (B2 bands).
    'points_base', 20,
    'points_per_companion', 0,
    'points_cap', 40,
    'points_min', 20,
    'points_max', 40,
    'scoring', 'b2-crew-v1',
    'public_end_utc', v_life->>'public_end_utc'
  );
end;
$$;

revoke all on function public.get_my_current_bar_bounty() from public;
grant execute on function public.get_my_current_bar_bounty() to authenticated;
grant execute on function public.get_my_current_bar_bounty() to service_role;

comment on function public.get_my_current_bar_bounty() is
  'Player Bar Bounty home card. B3: already_claimed + B2 20–40 band metadata; no formula scoring.';
