-- Ship Clock Admin repair (forward-only)
-- 1) Reaffirm EXECUTE grants for Admin clock RPCs (authenticated only; require_admin inside)
-- 2) Harden admin_get_clock_diagnostics when no active cruise_config
-- 3) Production Admin cruise configure path (no gameplay start, no schedule init)
-- 4) Day 1 shared open + Drink It! bounty open at 14:00 ship-local (subsequent days unchanged)

-- ---------------------------------------------------------------------------
-- Day 1 open helpers
-- ---------------------------------------------------------------------------
create or replace function public.cruise_day1_open_ship_local()
returns time
language sql
immutable
as $$
  select time '14:00';
$$;

comment on function public.cruise_day1_open_ship_local() is
  'Ship-local Day 1 shared gameplay open (Ship It! + Drink It! logging). Days 2+ follow existing all-day / noon rules.';

revoke all on function public.cruise_day1_open_ship_local() from public;
grant execute on function public.cruise_day1_open_ship_local() to authenticated, service_role;

create or replace function public.drinkit_public_open_ship_local(p_cruise_day integer)
returns time
language sql
immutable
as $$
  select case
    when p_cruise_day = 1 then time '14:00'
    else time '12:00'
  end;
$$;

comment on function public.drinkit_public_open_ship_local(integer) is
  'Drink It! public bounty / Daily open wall: Day 1 14:00; Days 2–7 12:00.';

revoke all on function public.drinkit_public_open_ship_local(integer) from public;
grant execute on function public.drinkit_public_open_ship_local(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- ship_clock_state_at: Day 1 14:00 open + pre_cruise until that instant
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
  v_ship_time time;
  v_cruise_day integer;
  v_finale timestamptz;
  v_finalized boolean;
  v_lifecycle text;
  v_accepting boolean;
  v_drink public.game_control%rowtype;
  v_ship public.game_control%rowtype;
  v_cruise_opens timestamptz;
  v_drinkit_bounty_opens timestamptz;
  v_day1_open time := public.cruise_day1_open_ship_local();
begin
  v_config := public.active_cruise_config();
  if v_config.id is null then
    return jsonb_build_object(
      'configured', false,
      'at_utc', p_at_utc,
      'error', 'NO_ACTIVE_CRUISE_CONFIG'
    );
  end if;

  if p_apply_lifecycle_side_effects then
    perform public.ensure_finale_latched(p_at_utc);
  end if;

  v_offset := public.clock_offset_at(v_config.id, v_config.base_ship_offset_minutes, p_at_utc);
  v_ship_local := public.utc_to_ship_local(p_at_utc, v_offset);
  v_ship_date := v_ship_local::date;
  v_ship_time := v_ship_local::time;
  v_cruise_day := public.cruise_day_for_ship_date(v_config.day1_ship_date, v_ship_date, v_config.final_day);
  v_finale := public.finale_at_utc(v_config, p_at_utc);

  -- Day 1 14:00 ship-local: shared cruise / Ship It! / Drink It! logging open.
  v_cruise_opens := public.ship_wall_at_utc(
    v_config,
    (v_config.day1_ship_date + v_day1_open)::timestamp,
    p_at_utc
  );
  -- Day 1 first Drink It! public bounty / Daily window (same wall as shared open).
  v_drinkit_bounty_opens := public.ship_wall_at_utc(
    v_config,
    (v_config.day1_ship_date + public.drinkit_public_open_ship_local(1))::timestamp,
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
  elsif v_ship_date < v_config.day1_ship_date then
    v_lifecycle := 'pre_cruise';
    v_accepting := false;
  elsif v_cruise_day is null then
    v_lifecycle := 'final';
    v_accepting := false;
  elsif v_cruise_day = 1 and v_ship_time < v_day1_open then
    -- Day 1 morning remains pre_cruise until 14:00 ship-local.
    v_lifecycle := 'pre_cruise';
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
    'cruise_opens_at_utc', v_cruise_opens,
    'shipit_opens_at_utc', v_cruise_opens,
    'drinkit_opens_at_utc', v_cruise_opens,
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

-- ---------------------------------------------------------------------------
-- Drink It! public window: Day 1 14:00, else noon
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
  v_open time;
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

  v_open := public.drinkit_public_open_ship_local(v_cruise_day);
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

revoke all on function public.drinkit_lifecycle_at(timestamptz) from public;
revoke all on function public.drinkit_lifecycle_at(timestamptz) from authenticated, anon;
grant execute on function public.drinkit_lifecycle_at(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Ship It!: Day 1 remains pre_cruise until 14:00; Days 2–7 all-day while on cruise
-- ---------------------------------------------------------------------------
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
  v_ship_time time;
  v_cruise_day integer;
  v_finale_utc timestamptz;
  v_status text;
  v_read_only boolean := false;
  v_day1_open time := public.cruise_day1_open_ship_local();
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
  v_ship_time := v_ship::time;
  v_cruise_day := public.cruise_day_for_ship_date(v_config.day1_ship_date, v_ship_date, v_config.final_day);
  v_finale_utc := public.finale_at_utc(v_config, p_at_utc);

  if p_at_utc >= v_finale_utc or v_control.finalized_at_utc is not null then
    v_status := 'finale';
    v_read_only := true;
  elsif v_ship_date < v_config.day1_ship_date then
    v_status := 'pre_cruise';
    v_read_only := true;
  elsif v_cruise_day is null then
    v_status := 'post_cruise';
    v_read_only := true;
  elsif v_cruise_day = 1 and v_ship_time < v_day1_open then
    v_status := 'pre_cruise';
    v_read_only := true;
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

revoke all on function public.shipit_lifecycle_at(timestamptz) from public;
grant execute on function public.shipit_lifecycle_at(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Diagnostics: require_admin + graceful no-config payload
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_clock_diagnostics(
  p_at_utc timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_config public.cruise_config;
  v_at timestamptz;
  v_state jsonb;
  v_plan jsonb;
  v_events jsonb;
begin
  v_actor := public.require_admin();
  v_at := public.admin_effective_at(p_at_utc);
  v_config := public.active_cruise_config();
  v_state := public.ship_clock_state_at(v_at, true);

  if v_config.id is null then
    return jsonb_build_object(
      'actor_id', v_actor,
      'state', v_state,
      'plan', '[]'::jsonb,
      'events', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'day_number', p.day_number,
      'delta_minutes', p.delta_minutes,
      'enabled', p.enabled
    ) order by p.day_number
  ), '[]'::jsonb)
  into v_plan
  from public.ship_clock_plan p
  where p.cruise_config_id = v_config.id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'effective_at_utc', e.effective_at_utc,
      'delta_minutes', e.delta_minutes,
      'offset_minutes', e.offset_minutes,
      'source', e.source,
      'schedule_key', e.schedule_key,
      'actor_id', e.actor_id,
      'note', e.note,
      'client_request_id', e.client_request_id,
      'client_request_fingerprint', e.client_request_fingerprint
    ) order by e.effective_at_utc, e.created_at
  ), '[]'::jsonb)
  into v_events
  from public.ship_clock_events e
  where e.cruise_config_id = v_config.id;

  return jsonb_build_object(
    'actor_id', v_actor,
    'state', v_state,
    'plan', v_plan,
    'events', v_events
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Production Admin cruise configure (create / replace active config)
-- Does not init bounty schedule, publish catalog, or force game_control active.
-- ---------------------------------------------------------------------------
create or replace function public.admin_configure_cruise_clock(
  p_day1_ship_date date,
  p_base_offset_minutes integer,
  p_label text default 'production',
  p_final_hour integer default 18,
  p_final_minute integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_id uuid;
  v_day integer;
  v_label text;
  v_existing public.cruise_config;
begin
  v_actor := public.require_admin();
  v_label := nullif(btrim(coalesce(p_label, '')), '');
  if v_label is null then
    raise exception 'CRUISE_LABEL_REQUIRED' using errcode = '22023';
  end if;
  if v_label = 'development-only' then
    raise exception 'PRODUCTION_CONFIGURE_REJECTS_DEVELOPMENT_ONLY_LABEL' using errcode = '22023';
  end if;
  if p_day1_ship_date is null then
    raise exception 'DAY1_SHIP_DATE_REQUIRED' using errcode = '22023';
  end if;
  -- Saturday embarkation (PostgreSQL DOW: 0=Sunday … 6=Saturday)
  if extract(dow from p_day1_ship_date)::integer <> 6 then
    raise exception 'DAY1_MUST_BE_SATURDAY' using errcode = '22023';
  end if;
  if p_base_offset_minutes is null or p_base_offset_minutes < -14 * 60 or p_base_offset_minutes > 14 * 60 then
    raise exception 'BASE_OFFSET_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if p_final_hour is distinct from 18 or p_final_minute is distinct from 0 then
    raise exception 'FINALE_MUST_REMAIN_FRIDAY_1800' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(872334502);

  select * into v_existing from public.cruise_config where is_active limit 1;

  if v_existing.id is not null then
    -- Replace in place: keep id stable for any FKs; clear plan/events for rebuild.
    update public.cruise_config
    set day1_ship_date = p_day1_ship_date,
        base_ship_offset_minutes = p_base_offset_minutes,
        final_day = 7,
        final_hour = 18,
        final_minute = 0,
        label = v_label,
        is_active = true,
        updated_at = now()
    where id = v_existing.id
    returning id into v_id;

    delete from public.ship_clock_events where cruise_config_id = v_id;
    delete from public.ship_clock_plan where cruise_config_id = v_id;
  else
    insert into public.cruise_config (
      day1_ship_date, base_ship_offset_minutes, final_day, final_hour, final_minute, label, is_active
    ) values (
      p_day1_ship_date, p_base_offset_minutes, 7, 18, 0, v_label, true
    )
    returning id into v_id;
  end if;

  for v_day in 1..7 loop
    insert into public.ship_clock_plan (cruise_config_id, day_number, delta_minutes, enabled)
    values (v_id, v_day, 0, true);
  end loop;

  -- Keep games closed; do not latch finale; do not invent pause state.
  update public.game_control
  set status = 'pre_cruise',
      paused_at_utc = null,
      paused_by = null,
      finalized_at_utc = null,
      updated_at = now()
  where game in ('drinkit', 'shipit');

  perform public.rebuild_scheduled_clock_events(v_id, timestamptz '1970-01-01');

  perform public.write_admin_audit(
    'admin_configure_cruise_clock',
    v_actor,
    'cruise_config',
    v_id::text,
    case when v_existing.id is null then null else to_jsonb(v_existing) end,
    jsonb_build_object(
      'id', v_id,
      'day1_ship_date', p_day1_ship_date,
      'base_ship_offset_minutes', p_base_offset_minutes,
      'label', v_label,
      'final_hour', 18,
      'final_minute', 0
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cruise_config_id', v_id,
    'day1_ship_date', p_day1_ship_date,
    'base_ship_offset_minutes', p_base_offset_minutes,
    'label', v_label,
    'gameplay_started', false,
    'schedule_initialized', false,
    'diagnostics', public.admin_get_clock_diagnostics(null)
  );
end;
$$;

revoke all on function public.admin_configure_cruise_clock(date, integer, text, integer, integer) from public;
revoke all on function public.admin_configure_cruise_clock(date, integer, text, integer, integer) from anon;
grant execute on function public.admin_configure_cruise_clock(date, integer, text, integer, integer) to authenticated;

comment on function public.admin_configure_cruise_clock(date, integer, text, integer, integer) is
  'Admin-only production cruise_config create/replace. Seeds zero plan deltas; leaves games pre_cruise; does not init bounty schedule.';

-- ---------------------------------------------------------------------------
-- Reaffirm Admin clock RPC EXECUTE (authenticated only)
-- ---------------------------------------------------------------------------
revoke all on function public.admin_get_clock_diagnostics(timestamptz) from public;
revoke all on function public.admin_get_clock_diagnostics(timestamptz) from anon;
grant execute on function public.admin_get_clock_diagnostics(timestamptz) to authenticated;

revoke all on function public.admin_preview_manual_clock_correction(integer, timestamptz) from public;
revoke all on function public.admin_preview_manual_clock_correction(integer, timestamptz) from anon;
grant execute on function public.admin_preview_manual_clock_correction(integer, timestamptz) to authenticated;

revoke all on function public.admin_apply_manual_clock_correction(integer, text, timestamptz, uuid) from public;
revoke all on function public.admin_apply_manual_clock_correction(integer, text, timestamptz, uuid) from anon;
grant execute on function public.admin_apply_manual_clock_correction(integer, text, timestamptz, uuid) to authenticated, service_role;

revoke all on function public.admin_apply_manual_clock_set(text, text, timestamptz, uuid) from public;
revoke all on function public.admin_apply_manual_clock_set(text, text, timestamptz, uuid) from anon;
grant execute on function public.admin_apply_manual_clock_set(text, text, timestamptz, uuid) to authenticated, service_role;

revoke all on function public.admin_save_ship_clock_plan(jsonb, timestamptz) from public;
revoke all on function public.admin_save_ship_clock_plan(jsonb, timestamptz) from anon;
grant execute on function public.admin_save_ship_clock_plan(jsonb, timestamptz) to authenticated, service_role;

revoke all on function public.admin_find_clock_event_by_request_id(uuid) from public;
revoke all on function public.admin_find_clock_event_by_request_id(uuid) from anon;
grant execute on function public.admin_find_clock_event_by_request_id(uuid) to authenticated, service_role;
