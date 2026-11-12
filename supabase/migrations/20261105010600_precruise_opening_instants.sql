-- Pre-Cruise countdown support: expose authoritative opening UTC instants
-- on the existing get_ship_clock_state / ship_clock_state_at contract.
-- Does not change lifecycle, acceptance, or scoring rules.

-- ---------------------------------------------------------------------------
-- Convert a ship-local wall instant → UTC with iterative offset refine
-- (same pattern as finale_at_utc).
-- ---------------------------------------------------------------------------
create or replace function public.ship_wall_at_utc(
  p_config public.cruise_config,
  p_ship_wall timestamp,
  p_as_of_utc timestamptz default now()
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offset integer;
  v_guess_utc timestamptz;
  v_utc timestamptz;
begin
  v_offset := public.clock_offset_at(p_config.id, p_config.base_ship_offset_minutes, p_as_of_utc);
  v_guess_utc := public.ship_local_to_utc(p_ship_wall, v_offset);
  v_offset := public.clock_offset_at(p_config.id, p_config.base_ship_offset_minutes, v_guess_utc);
  v_utc := public.ship_local_to_utc(p_ship_wall, v_offset);
  v_offset := public.clock_offset_at(p_config.id, p_config.base_ship_offset_minutes, v_utc);
  return public.ship_local_to_utc(p_ship_wall, v_offset);
end;
$$;

revoke all on function public.ship_wall_at_utc(public.cruise_config, timestamp, timestamptz) from public;
grant execute on function public.ship_wall_at_utc(public.cruise_config, timestamp, timestamptz) to service_role;

comment on function public.ship_wall_at_utc(public.cruise_config, timestamp, timestamptz) is
  'Ship-local wall → UTC with iterative offset refine (opening / finale helpers).';

-- ---------------------------------------------------------------------------
-- Extend ordinary clock reads with unambiguous opening instants
-- ---------------------------------------------------------------------------
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
  v_cruise_opens timestamptz;
  v_drinkit_bounty_opens timestamptz;
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

  -- Day 1 ship-local midnight: pre_cruise → active; Ship It! submissions open;
  -- Drink It! ordinary logging becomes eligible (bounties still wait for noon).
  v_cruise_opens := public.ship_wall_at_utc(
    v_config,
    (v_config.day1_ship_date + time '00:00')::timestamp,
    p_at_utc
  );
  -- Day 1 ship-local noon: first Drink It! public bounty / Daily window.
  v_drinkit_bounty_opens := public.ship_wall_at_utc(
    v_config,
    (v_config.day1_ship_date + time '12:00')::timestamp,
    p_at_utc
  );

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
    -- Shared cruise gameplay open (Ship Clock pre_cruise → active).
    'cruise_opens_at_utc', v_cruise_opens,
    -- Ship It! first scavenger submission (same instant as cruise_opens_at_utc).
    'shipit_opens_at_utc', v_cruise_opens,
    -- Drink It! gameplay / ordinary logging gate (same as cruise open).
    'drinkit_opens_at_utc', v_cruise_opens,
    -- Drink It! first noon bounty window (later than gameplay open).
    'drinkit_bounty_opens_at_utc', v_drinkit_bounty_opens,
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
