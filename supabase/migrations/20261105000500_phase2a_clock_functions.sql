-- Phase 2A: Ship Clock evaluation engine + admin RPCs + acceptance contract
-- Authority: handoff/03-Technical-Spec.md §5.1–5.4

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.active_cruise_config()
returns public.cruise_config
language sql
stable
security definer
set search_path = public
as $$
  select c.*
  from public.cruise_config c
  where c.is_active
  limit 1;
$$;

create or replace function public.clock_offset_at(
  p_config_id uuid,
  p_base_offset integer,
  p_at_utc timestamptz
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select p_base_offset + coalesce((
    select sum(e.delta_minutes)::integer
    from public.ship_clock_events e
    where e.cruise_config_id = p_config_id
      and e.effective_at_utc <= p_at_utc
  ), 0);
$$;

-- Convert UTC → ship-local wall timestamp (timezone-less presentation stored as timestamp)
create or replace function public.utc_to_ship_local(
  p_at_utc timestamptz,
  p_offset_minutes integer
)
returns timestamp
language sql
immutable
as $$
  select (p_at_utc at time zone 'utc') + make_interval(mins => p_offset_minutes);
$$;

-- Convert ship-local wall → UTC using a known offset
create or replace function public.ship_local_to_utc(
  p_ship_local timestamp,
  p_offset_minutes integer
)
returns timestamptz
language sql
immutable
as $$
  select (p_ship_local - make_interval(mins => p_offset_minutes)) at time zone 'utc';
$$;

-- Cruise day from ship-local calendar date (stable mapping; null if outside 1–7)
create or replace function public.cruise_day_for_ship_date(
  p_day1 date,
  p_ship_date date,
  p_final_day integer default 7
)
returns integer
language sql
immutable
as $$
  select case
    when p_ship_date < p_day1 then null
    when p_ship_date > p_day1 + (p_final_day - 1) then null
    else (p_ship_date - p_day1) + 1
  end;
$$;

create or replace function public.write_admin_audit(
  p_action text,
  p_actor_id uuid,
  p_target_type text,
  p_target_id text,
  p_before jsonb,
  p_after jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.admin_audit_log (action, actor_id, target_type, target_id, before_json, after_json)
  values (p_action, p_actor_id, p_target_type, p_target_id, p_before, p_after)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rebuild future scheduled events from plan (past applied segments stay)
-- ---------------------------------------------------------------------------
create or replace function public.rebuild_scheduled_clock_events(
  p_config_id uuid,
  p_as_of_utc timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config;
  v_day integer;
  v_plan public.ship_clock_plan%rowtype;
  v_running_offset integer;
  v_ship_date date;
  v_ship_3am timestamp;
  v_effective_utc timestamptz;
  v_key text;
  v_existing public.ship_clock_events%rowtype;
begin
  select * into v_config from public.cruise_config where id = p_config_id;
  if not found then
    raise exception 'cruise_config not found';
  end if;

  -- Delete only FUTURE scheduled events (not yet effective)
  delete from public.ship_clock_events e
  where e.cruise_config_id = p_config_id
    and e.source = 'scheduled'
    and e.effective_at_utc > p_as_of_utc;

  v_running_offset := public.clock_offset_at(p_config_id, v_config.base_ship_offset_minutes, p_as_of_utc);

  for v_day in 1..7 loop
    select * into v_plan
    from public.ship_clock_plan
    where cruise_config_id = p_config_id
      and day_number = v_day;

    if not found then
      continue;
    end if;

    if not v_plan.enabled or v_plan.delta_minutes = 0 then
      continue;
    end if;

    v_key := 'plan:day:' || v_day::text;
    v_ship_date := v_config.day1_ship_date + (v_day - 1);
    -- 3:00 AM ship-local on that cruise day, using offset in force immediately before the change.
    -- Walk: offset before this day's 3 AM = running offset from prior events.
    v_ship_3am := v_ship_date::timestamp + time '03:00';
    v_effective_utc := public.ship_local_to_utc(v_ship_3am, v_running_offset);

    select * into v_existing
    from public.ship_clock_events
    where cruise_config_id = p_config_id
      and schedule_key = v_key;

    if found then
      -- Already applied (effective in the past or at as_of): immutable
      if v_existing.effective_at_utc <= p_as_of_utc then
        v_running_offset := v_running_offset + v_existing.delta_minutes;
        continue;
      end if;
      -- Should have been deleted above; defensive
      delete from public.ship_clock_events where id = v_existing.id;
    end if;

    begin
      insert into public.ship_clock_events (
        cruise_config_id, effective_at_utc, delta_minutes, offset_minutes,
        source, schedule_key, note
      ) values (
        p_config_id, v_effective_utc, v_plan.delta_minutes,
        v_running_offset + v_plan.delta_minutes,
        'scheduled', v_key,
        'Scheduled ' || v_plan.delta_minutes::text || ' min at Day ' || v_day::text || ' 03:00 ship-local'
      );
    exception
      when unique_violation then
        null; -- schedule_key already present (idempotent)
    end;

    select offset_minutes into v_running_offset
    from public.ship_clock_events
    where cruise_config_id = p_config_id
      and schedule_key = v_key;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finale UTC instant for active config (ship Day 7 at final_hour:final_minute)
-- ---------------------------------------------------------------------------
create or replace function public.finale_at_utc(
  p_config public.cruise_config,
  p_as_of_utc timestamptz default now()
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day7 date;
  v_target timestamp;
  v_guess_utc timestamptz;
  v_offset integer;
  v_utc timestamptz;
begin
  v_day7 := p_config.day1_ship_date + (p_config.final_day - 1);
  v_target := v_day7::timestamp
    + make_interval(hours => p_config.final_hour, mins => p_config.final_minute);

  -- Iterate once: estimate UTC with current offset, then refine with offset at that UTC
  v_offset := public.clock_offset_at(p_config.id, p_config.base_ship_offset_minutes, p_as_of_utc);
  v_guess_utc := public.ship_local_to_utc(v_target, v_offset);
  v_offset := public.clock_offset_at(p_config.id, p_config.base_ship_offset_minutes, v_guess_utc);
  v_utc := public.ship_local_to_utc(v_target, v_offset);

  -- One more refine if a scheduled event sits between guess and result
  v_offset := public.clock_offset_at(p_config.id, p_config.base_ship_offset_minutes, v_utc);
  return public.ship_local_to_utc(v_target, v_offset);
end;
$$;

-- ---------------------------------------------------------------------------
-- Latch finale on game_control when crossing boundary (monotonic)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_finale_latched(
  p_at_utc timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config;
  v_finale timestamptz;
  v_latched boolean := false;
begin
  v_config := public.active_cruise_config();
  if v_config.id is null then
    return false;
  end if;

  v_finale := public.finale_at_utc(v_config, p_at_utc);

  if p_at_utc >= v_finale then
    update public.game_control
    set
      status = 'final',
      finalized_at_utc = coalesce(finalized_at_utc, p_at_utc),
      updated_at = now()
    where finalized_at_utc is null;

    v_latched := true;
  end if;

  return exists (
    select 1 from public.game_control where finalized_at_utc is not null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Public clock state (authenticated). p_at_utc enables deterministic tests.
-- ---------------------------------------------------------------------------
create or replace function public.get_ship_clock_state(
  p_at_utc timestamptz default now()
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

  -- Ensure scheduled events exist for evaluation
  perform public.rebuild_scheduled_clock_events(v_config.id, p_at_utc);
  perform public.ensure_finale_latched(p_at_utc);

  v_offset := public.clock_offset_at(v_config.id, v_config.base_ship_offset_minutes, p_at_utc);
  v_ship_local := public.utc_to_ship_local(p_at_utc, v_offset);
  v_ship_date := v_ship_local::date;
  v_cruise_day := public.cruise_day_for_ship_date(v_config.day1_ship_date, v_ship_date, v_config.final_day);
  v_finale := public.finale_at_utc(v_config, p_at_utc);

  select * into v_drink from public.game_control where game = 'drinkit';
  select * into v_ship from public.game_control where game = 'shipit';

  v_finalized := (v_drink.finalized_at_utc is not null) or (p_at_utc >= v_finale);

  if v_finalized then
    v_lifecycle := 'final';
    v_accepting := false;
  elsif v_cruise_day is null and v_ship_date < v_config.day1_ship_date then
    v_lifecycle := 'pre_cruise';
    v_accepting := false;
  elsif v_cruise_day is null then
    -- After day 7 calendar but before latch edge cases
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

-- ---------------------------------------------------------------------------
-- Canonical acceptance contract for future scoring RPCs
-- Captures received_at_utc at call start (server clock).
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_submission_acceptance(
  p_game public.game_id,
  p_at_utc timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_received timestamptz := clock_timestamp(); -- real server receipt; tests pass p_at_utc for boundary checks
  v_eval_at timestamptz;
  v_clock jsonb;
  v_control public.game_control%rowtype;
  v_allowed boolean := false;
  v_code text;
begin
  -- Production scoring must use server receipt time. When caller passes p_at_utc
  -- explicitly (tests), evaluate against that instant but still report received_at_utc.
  v_eval_at := coalesce(p_at_utc, v_received);
  if p_at_utc is null then
    v_eval_at := v_received;
  end if;

  v_clock := public.get_ship_clock_state(v_eval_at);
  select * into v_control from public.game_control where game = p_game;

  if not coalesce((v_clock->>'configured')::boolean, false) then
    v_code := 'NO_CONFIG';
  elsif coalesce((v_clock->>'finalized')::boolean, false)
     or v_control.finalized_at_utc is not null then
    v_code := 'FINAL';
  elsif (v_clock->>'lifecycle') = 'pre_cruise' then
    v_code := 'PRE_CRUISE';
  elsif p_game = 'drinkit' and v_control.status = 'paused' then
    v_code := 'PAUSED';
  elsif coalesce((v_clock->>'accepting_submissions')::boolean, false) then
    v_allowed := true;
    v_code := 'OK';
  else
    v_code := 'CLOSED';
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'code', v_code,
    'received_at_utc', case when p_at_utc is null then v_received else v_eval_at end,
    'evaluated_at_utc', v_eval_at,
    'game', p_game,
    'clock', v_clock
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: require organizer
-- ---------------------------------------------------------------------------
create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  v_id := public.current_player_id();
  if v_id is null then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin diagnostics (same payload as get_ship_clock_state + plan/events)
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_clock_diagnostics(
  p_at_utc timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_config public.cruise_config;
  v_state jsonb;
  v_plan jsonb;
  v_events jsonb;
begin
  v_actor := public.require_admin();
  v_config := public.active_cruise_config();
  v_state := public.get_ship_clock_state(p_at_utc);

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
      'note', e.note
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
-- Admin: preview manual ± minutes correction
-- ---------------------------------------------------------------------------
create or replace function public.admin_preview_manual_clock_correction(
  p_delta_minutes integer,
  p_at_utc timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_before jsonb;
  v_after_offset integer;
  v_config public.cruise_config;
begin
  v_actor := public.require_admin();
  if p_delta_minutes not in (-60, 60) then
    raise exception 'MANUAL_DELTA_MUST_BE_PLUS_OR_MINUS_60' using errcode = '22023';
  end if;

  v_before := public.get_ship_clock_state(p_at_utc);
  v_config := public.active_cruise_config();
  v_after_offset := (v_before->>'offset_minutes')::integer + p_delta_minutes;

  return jsonb_build_object(
    'actor_id', v_actor,
    'delta_minutes', p_delta_minutes,
    'before', v_before,
    'after_offset_minutes', v_after_offset,
    'after_ship_local', to_char(
      public.utc_to_ship_local(p_at_utc, v_after_offset),
      'YYYY-MM-DD"T"HH24:MI:SS'
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: apply manual ±1 hour
-- ---------------------------------------------------------------------------
create or replace function public.admin_apply_manual_clock_correction(
  p_delta_minutes integer,
  p_note text default null,
  p_at_utc timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_config public.cruise_config;
  v_before jsonb;
  v_after jsonb;
  v_offset integer;
  v_event_id uuid;
begin
  v_actor := public.require_admin();
  if p_delta_minutes not in (-60, 60) then
    raise exception 'MANUAL_DELTA_MUST_BE_PLUS_OR_MINUS_60' using errcode = '22023';
  end if;

  v_config := public.active_cruise_config();
  if v_config.id is null then
    raise exception 'NO_ACTIVE_CRUISE_CONFIG';
  end if;

  v_before := public.get_ship_clock_state(p_at_utc);
  v_offset := (v_before->>'offset_minutes')::integer + p_delta_minutes;

  insert into public.ship_clock_events (
    cruise_config_id, effective_at_utc, delta_minutes, offset_minutes,
    source, actor_id, note
  ) values (
    v_config.id, p_at_utc, p_delta_minutes, v_offset,
    'manual_delta', v_actor,
    coalesce(p_note, 'Manual ' || p_delta_minutes::text || ' minutes')
  )
  returning id into v_event_id;

  -- Future scheduled transitions recalculate from new baseline
  perform public.rebuild_scheduled_clock_events(v_config.id, p_at_utc);

  v_after := public.get_ship_clock_state(p_at_utc);

  perform public.write_admin_audit(
    'clock.manual_delta',
    v_actor,
    'ship_clock_events',
    v_event_id::text,
    v_before,
    v_after
  );

  return jsonb_build_object(
    'event_id', v_event_id,
    'before', v_before,
    'after', v_after
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: emergency set to a displayed ship-local wall time
-- p_target_ship_local: 'YYYY-MM-DDTHH:MI:SS' interpreted as ship wall clock at p_at_utc
-- ---------------------------------------------------------------------------
create or replace function public.admin_apply_manual_clock_set(
  p_target_ship_local text,
  p_note text default null,
  p_at_utc timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_config public.cruise_config;
  v_before jsonb;
  v_after jsonb;
  v_current_offset integer;
  v_target timestamp;
  v_needed_offset integer;
  v_delta integer;
  v_event_id uuid;
begin
  v_actor := public.require_admin();
  v_config := public.active_cruise_config();
  if v_config.id is null then
    raise exception 'NO_ACTIVE_CRUISE_CONFIG';
  end if;

  v_before := public.get_ship_clock_state(p_at_utc);
  v_current_offset := (v_before->>'offset_minutes')::integer;
  v_target := replace(p_target_ship_local, 'T', ' ')::timestamp;

  -- ship_local = utc_wall + offset  =>  offset = ship_local - utc_wall
  v_needed_offset := (
    extract(epoch from (v_target - (p_at_utc at time zone 'utc'))) / 60
  )::integer;
  v_delta := v_needed_offset - v_current_offset;

  if v_delta = 0 then
    return jsonb_build_object(
      'unchanged', true,
      'before', v_before,
      'after', v_before
    );
  end if;

  insert into public.ship_clock_events (
    cruise_config_id, effective_at_utc, delta_minutes, offset_minutes,
    source, actor_id, note
  ) values (
    v_config.id, p_at_utc, v_delta, v_needed_offset,
    'manual_set', v_actor,
    coalesce(p_note, format('Set ship time to %s', p_target_ship_local))
  )
  returning id into v_event_id;

  perform public.rebuild_scheduled_clock_events(v_config.id, p_at_utc);
  v_after := public.get_ship_clock_state(p_at_utc);

  perform public.write_admin_audit(
    'clock.manual_set',
    v_actor,
    'ship_clock_events',
    v_event_id::text,
    v_before,
    v_after
  );

  return jsonb_build_object(
    'event_id', v_event_id,
    'delta_minutes', v_delta,
    'before', v_before,
    'after', v_after
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: upsert one plan day and rebuild future schedule
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_ship_clock_plan_day(
  p_day_number integer,
  p_delta_minutes integer,
  p_enabled boolean default true,
  p_at_utc timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_config public.cruise_config;
  v_before jsonb;
  v_after jsonb;
begin
  v_actor := public.require_admin();
  if p_day_number not between 1 and 7 then
    raise exception 'INVALID_DAY_NUMBER';
  end if;
  if p_delta_minutes not in (-120, -60, 0, 60, 120) then
    raise exception 'INVALID_PLAN_DELTA';
  end if;

  v_config := public.active_cruise_config();
  if v_config.id is null then
    raise exception 'NO_ACTIVE_CRUISE_CONFIG';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'day_number', p.day_number,
      'delta_minutes', p.delta_minutes,
      'enabled', p.enabled
    ) order by p.day_number
  ), '[]'::jsonb)
  into v_before
  from public.ship_clock_plan p
  where p.cruise_config_id = v_config.id;

  insert into public.ship_clock_plan (cruise_config_id, day_number, delta_minutes, enabled, updated_at)
  values (v_config.id, p_day_number, p_delta_minutes, p_enabled, now())
  on conflict (cruise_config_id, day_number) do update
    set delta_minutes = excluded.delta_minutes,
        enabled = excluded.enabled,
        updated_at = now();

  perform public.rebuild_scheduled_clock_events(v_config.id, p_at_utc);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'day_number', p.day_number,
      'delta_minutes', p.delta_minutes,
      'enabled', p.enabled
    ) order by p.day_number
  ), '[]'::jsonb)
  into v_after
  from public.ship_clock_plan p
  where p.cruise_config_id = v_config.id;

  perform public.write_admin_audit(
    'clock.plan_upsert',
    v_actor,
    'ship_clock_plan',
    p_day_number::text,
    v_before,
    v_after
  );

  return jsonb_build_object('plan', v_after, 'state', public.get_ship_clock_state(p_at_utc));
end;
$$;

-- ---------------------------------------------------------------------------
-- Dev/test helper: seed or replace development-only cruise config
-- Gated: only when no active config OR active label is development-only.
-- Not a player clock-bypass — does not change evaluation of production configs.
-- ---------------------------------------------------------------------------
create or replace function public.dev_seed_cruise_clock(
  p_day1_ship_date date,
  p_base_offset_minutes integer,
  p_label text default 'development-only'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.cruise_config;
  v_id uuid;
  v_day integer;
begin
  -- PostgREST may expose EXECUTE oddly; enforce JWT role explicitly.
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_label is distinct from 'development-only' then
    raise exception 'DEV_SEED_REQUIRES_DEVELOPMENT_ONLY_LABEL';
  end if;

  select * into v_existing from public.cruise_config where is_active limit 1;
  if found and v_existing.label is distinct from 'development-only' then
    raise exception 'ACTIVE_NON_DEV_CONFIG_BLOCKS_DEV_SEED';
  end if;

  if found then
    update public.cruise_config set is_active = false, updated_at = now() where id = v_existing.id;
    delete from public.ship_clock_events where cruise_config_id = v_existing.id;
    delete from public.ship_clock_plan where cruise_config_id = v_existing.id;
  end if;

  insert into public.cruise_config (
    day1_ship_date, base_ship_offset_minutes, label, is_active
  ) values (
    p_day1_ship_date, p_base_offset_minutes, p_label, true
  )
  returning id into v_id;

  for v_day in 1..7 loop
    insert into public.ship_clock_plan (cruise_config_id, day_number, delta_minutes, enabled)
    values (v_id, v_day, 0, true);
  end loop;

  -- Reset lifecycle for clean rehearsal (dev only).
  -- WHERE required: Supabase supautils blocks unqualified UPDATEs over PostgREST.
  update public.game_control
  set status = 'pre_cruise',
      paused_at_utc = null,
      paused_by = null,
      finalized_at_utc = null,
      updated_at = now()
  where game in ('drinkit', 'shipit');

  delete from public.admin_audit_log where true;

  perform public.rebuild_scheduled_clock_events(v_id, timestamptz '1970-01-01');

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.active_cruise_config() from public;
revoke all on function public.clock_offset_at(uuid, integer, timestamptz) from public;
revoke all on function public.utc_to_ship_local(timestamptz, integer) from public;
revoke all on function public.ship_local_to_utc(timestamp, integer) from public;
revoke all on function public.cruise_day_for_ship_date(date, date, integer) from public;
revoke all on function public.write_admin_audit(text, uuid, text, text, jsonb, jsonb) from public;
revoke all on function public.rebuild_scheduled_clock_events(uuid, timestamptz) from public;
revoke all on function public.finale_at_utc(public.cruise_config, timestamptz) from public;
revoke all on function public.ensure_finale_latched(timestamptz) from public;
revoke all on function public.get_ship_clock_state(timestamptz) from public;
revoke all on function public.evaluate_submission_acceptance(public.game_id, timestamptz) from public;
revoke all on function public.require_admin() from public;
revoke all on function public.admin_get_clock_diagnostics(timestamptz) from public;
revoke all on function public.admin_preview_manual_clock_correction(integer, timestamptz) from public;
revoke all on function public.admin_apply_manual_clock_correction(integer, text, timestamptz) from public;
revoke all on function public.admin_apply_manual_clock_set(text, text, timestamptz) from public;
revoke all on function public.admin_upsert_ship_clock_plan_day(integer, integer, boolean, timestamptz) from public;
revoke all on function public.dev_seed_cruise_clock(date, integer, text) from public;

grant execute on function public.get_ship_clock_state(timestamptz) to authenticated, service_role;
grant execute on function public.evaluate_submission_acceptance(public.game_id, timestamptz) to authenticated, service_role;

grant execute on function public.admin_get_clock_diagnostics(timestamptz) to authenticated;
grant execute on function public.admin_preview_manual_clock_correction(integer, timestamptz) to authenticated;
grant execute on function public.admin_apply_manual_clock_correction(integer, text, timestamptz) to authenticated;
grant execute on function public.admin_apply_manual_clock_set(text, text, timestamptz) to authenticated;
grant execute on function public.admin_upsert_ship_clock_plan_day(integer, integer, boolean, timestamptz) to authenticated;

-- Dev seed: service_role only (not granted to authenticated/anon)
grant execute on function public.dev_seed_cruise_clock(date, integer, text) to service_role;
