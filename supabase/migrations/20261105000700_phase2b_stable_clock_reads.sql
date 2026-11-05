-- Phase 2B: Stable ordinary clock reads
-- ship_clock_state_at no longer deletes/recreates future scheduled rows.
-- Materialization of the schedule remains on admin plan/manual mutations + seed
-- via rebuild_scheduled_clock_events. Reads only evaluate persisted events and
-- may latch finale when side effects are requested.

create or replace function public.ship_clock_state_at(
  p_at_utc timestamptz,
  p_apply_lifecycle_side_effects boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config;
  v_offset integer;
  v_ship_local timestamp;
  v_ship_date date;
  v_cruise_day integer;
  v_finale timestamptz;
  v_finalized boolean;
  v_lifecycle text;
  v_accepting boolean;
  v_drink public.game_control%rowtype;
  v_ship public.game_control%rowtype;
begin
  v_config := public.active_cruise_config();
  if v_config.id is null then
    return jsonb_build_object(
      'configured', false,
      'at_utc', p_at_utc,
      'error', 'NO_ACTIVE_CRUISE_CONFIG'
    );
  end if;

  -- Ordinary reads must not rewrite scheduled rows. Finale latch remains the only
  -- intentional write on the side-effect path (monotonic; safe under concurrency).
  if p_apply_lifecycle_side_effects then
    perform public.ensure_finale_latched(p_at_utc);
  end if;

  v_offset := public.clock_offset_at(v_config.id, v_config.base_ship_offset_minutes, p_at_utc);
  v_ship_local := public.utc_to_ship_local(p_at_utc, v_offset);
  v_ship_date := v_ship_local::date;
  v_cruise_day := public.cruise_day_for_ship_date(v_config.day1_ship_date, v_ship_date, v_config.final_day);
  v_finale := public.finale_at_utc(v_config, p_at_utc);

  select * into v_drink from public.game_control where game = 'drinkit';
  select * into v_ship from public.game_control where game = 'shipit';

  v_finalized := (v_drink.finalized_at_utc is not null)
    or (p_apply_lifecycle_side_effects and p_at_utc >= v_finale);

  if not p_apply_lifecycle_side_effects then
    v_finalized := (v_drink.finalized_at_utc is not null) or (p_at_utc >= v_finale);
  end if;

  if v_finalized then
    v_lifecycle := 'final';
    v_accepting := false;
  elsif v_cruise_day is null and v_ship_date < v_config.day1_ship_date then
    v_lifecycle := 'pre_cruise';
    v_accepting := false;
  elsif v_cruise_day is null then
    v_lifecycle := 'final';
    v_accepting := false;
  else
    v_lifecycle := 'active';
    v_accepting := true;
  end if;

  return jsonb_build_object(
    'configured', true,
    'config_id', v_config.id,
    'config_label', v_config.label,
    'day1_ship_date', v_config.day1_ship_date,
    'at_utc', p_at_utc,
    'offset_minutes', v_offset,
    'ship_local', to_char(v_ship_local, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'ship_date', v_ship_date,
    'cruise_day', v_cruise_day,
    'lifecycle', v_lifecycle,
    'accepting_submissions', v_accepting,
    'finale_at_utc', v_finale,
    'finalized', v_finalized,
    'games', jsonb_build_object(
      'drinkit', jsonb_build_object(
        'status', v_drink.status,
        'paused', v_drink.status = 'paused',
        'finalized_at_utc', v_drink.finalized_at_utc
      ),
      'shipit', jsonb_build_object(
        'status', v_ship.status,
        'paused', false,
        'finalized_at_utc', v_ship.finalized_at_utc
      )
    )
  );
end;
$$;

revoke all on function public.ship_clock_state_at(timestamptz, boolean) from public;
