-- Phase 2A.1: Ship Clock security & timeline hardening
-- - Players cannot supply evaluation timestamps (finale latch / eligibility bypass)
-- - rebuild_scheduled_clock_events no longer double-counts historical deltas
-- - Production acceptance path uses clock_timestamp() receipt time only

-- ---------------------------------------------------------------------------
-- Fix rebuild: start from offset-at-as_of (includes history once); do not
-- re-add historical plan deltas while walking days.
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

  delete from public.ship_clock_events e
  where e.cruise_config_id = p_config_id
    and e.source = 'scheduled'
    and e.effective_at_utc > p_as_of_utc;

  -- Includes all historical scheduled + manual deltas exactly once.
  v_running_offset := public.clock_offset_at(
    p_config_id,
    v_config.base_ship_offset_minutes,
    p_as_of_utc
  );

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
    v_ship_3am := v_ship_date::timestamp + time '03:00';

    select * into v_existing
    from public.ship_clock_events
    where cruise_config_id = p_config_id
      and schedule_key = v_key;

    if found and v_existing.effective_at_utc <= p_as_of_utc then
      -- Historical / already-applied: already in v_running_offset. Do not add again.
      continue;
    end if;

    if found then
      -- Defensive: future row should already be gone from the bulk delete above.
      delete from public.ship_clock_events where id = v_existing.id;
    end if;

    -- Offset immediately preceding this scheduled change (no duplicated history).
    v_effective_utc := public.ship_local_to_utc(v_ship_3am, v_running_offset);

    insert into public.ship_clock_events (
      cruise_config_id, effective_at_utc, delta_minutes, offset_minutes,
      source, schedule_key, note
    ) values (
      p_config_id, v_effective_utc, v_plan.delta_minutes,
      v_running_offset + v_plan.delta_minutes,
      'scheduled', v_key,
      'Scheduled ' || v_plan.delta_minutes::text || ' min at Day ' || v_day::text || ' 03:00 ship-local'
    );

    v_running_offset := v_running_offset + v_plan.delta_minutes;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal evaluator (not granted to authenticated)
-- p_apply_lifecycle_side_effects: when true, may latch finale / rebuild schedule
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
    perform public.rebuild_scheduled_clock_events(v_config.id, p_at_utc);
    perform public.ensure_finale_latched(p_at_utc);
  else
    -- Read path still needs scheduled rows for correct offsets, but must not
    -- latch finale from a simulated/client timestamp.
    perform public.rebuild_scheduled_clock_events(v_config.id, p_at_utc);
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

  -- For pure simulation (no side effects), report whether the instant is at/after
  -- finale without writing the latch.
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

-- ---------------------------------------------------------------------------
-- Receipt-time helper for future scoring RPCs (call once at entry)
-- ---------------------------------------------------------------------------
create or replace function public.capture_submission_receipt_time()
returns timestamptz
language sql
volatile
security definer
set search_path = public
as $$
  select clock_timestamp();
$$;

revoke all on function public.capture_submission_receipt_time() from public;
-- Not granted to authenticated — scoring RPCs (future) will be SECURITY DEFINER
-- and call this internally. Service role may use for contract tests.
grant execute on function public.capture_submission_receipt_time() to service_role;

-- ---------------------------------------------------------------------------
-- Replace player-facing get_ship_clock_state: server time only
-- ---------------------------------------------------------------------------
drop function if exists public.get_ship_clock_state(timestamptz);

create or replace function public.get_ship_clock_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  -- Authoritative player/admin diagnostic read: server now, may latch finale.
  return public.ship_clock_state_at(v_now, true);
end;
$$;

revoke all on function public.get_ship_clock_state() from public;
grant execute on function public.get_ship_clock_state() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Service-role / local-test evaluator (deterministic; optional latch)
-- ---------------------------------------------------------------------------
create or replace function public.dev_get_ship_clock_state_at(
  p_at_utc timestamptz,
  p_apply_lifecycle_side_effects boolean default false
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
  return public.ship_clock_state_at(p_at_utc, p_apply_lifecycle_side_effects);
end;
$$;

revoke all on function public.dev_get_ship_clock_state_at(timestamptz, boolean) from public;
grant execute on function public.dev_get_ship_clock_state_at(timestamptz, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Replace evaluate_submission_acceptance: no client time; real receipt
-- ---------------------------------------------------------------------------
drop function if exists public.evaluate_submission_acceptance(public.game_id, timestamptz);

create or replace function public.evaluate_submission_acceptance(
  p_game public.game_id
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_received timestamptz := public.capture_submission_receipt_time();
  v_clock jsonb;
  v_control public.game_control%rowtype;
  v_allowed boolean := false;
  v_code text;
begin
  v_clock := public.ship_clock_state_at(v_received, true);
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
    'received_at_utc', v_received,
    'evaluated_at_utc', v_received,
    'game', p_game,
    'clock', v_clock
  );
end;
$$;

revoke all on function public.evaluate_submission_acceptance(public.game_id) from public;
grant execute on function public.evaluate_submission_acceptance(public.game_id) to authenticated, service_role;

-- Test-only acceptance at a simulated instant (service_role).
create or replace function public.dev_evaluate_submission_acceptance_at(
  p_game public.game_id,
  p_at_utc timestamptz,
  p_apply_lifecycle_side_effects boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clock jsonb;
  v_control public.game_control%rowtype;
  v_allowed boolean := false;
  v_code text;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  v_clock := public.ship_clock_state_at(p_at_utc, p_apply_lifecycle_side_effects);
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
    -- Simulated path: receipt equals evaluation instant for boundary tests only.
    'received_at_utc', p_at_utc,
    'evaluated_at_utc', p_at_utc,
    'game', p_game,
    'clock', v_clock,
    'simulated', true
  );
end;
$$;

revoke all on function public.dev_evaluate_submission_acceptance_at(public.game_id, timestamptz, boolean) from public;
grant execute on function public.dev_evaluate_submission_acceptance_at(public.game_id, timestamptz, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Admin helpers: ignore client timestamps unless service_role (local tests)
-- ---------------------------------------------------------------------------
create or replace function public.admin_effective_at(
  p_at_utc timestamptz
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return coalesce(p_at_utc, clock_timestamp());
  end if;
  return clock_timestamp();
end;
$$;

revoke all on function public.admin_effective_at(timestamptz) from public;

-- Allow service_role to exercise admin clock RPCs in local tests (actor_id null).
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
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return null;
  end if;
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

create or replace function public.admin_preview_manual_clock_correction(
  p_delta_minutes integer,
  p_at_utc timestamptz default null
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
  v_at timestamptz;
begin
  v_actor := public.require_admin();
  if p_delta_minutes not in (-60, 60) then
    raise exception 'MANUAL_DELTA_MUST_BE_PLUS_OR_MINUS_60' using errcode = '22023';
  end if;

  v_at := public.admin_effective_at(p_at_utc);
  v_before := public.ship_clock_state_at(v_at, true);
  v_after_offset := (v_before->>'offset_minutes')::integer + p_delta_minutes;

  return jsonb_build_object(
    'actor_id', v_actor,
    'delta_minutes', p_delta_minutes,
    'before', v_before,
    'after_offset_minutes', v_after_offset,
    'after_ship_local', to_char(
      public.utc_to_ship_local(v_at, v_after_offset),
      'YYYY-MM-DD"T"HH24:MI:SS'
    )
  );
end;
$$;

create or replace function public.admin_apply_manual_clock_correction(
  p_delta_minutes integer,
  p_note text default null,
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
  v_before jsonb;
  v_after jsonb;
  v_offset integer;
  v_event_id uuid;
  v_at timestamptz;
begin
  v_actor := public.require_admin();
  if p_delta_minutes not in (-60, 60) then
    raise exception 'MANUAL_DELTA_MUST_BE_PLUS_OR_MINUS_60' using errcode = '22023';
  end if;

  v_config := public.active_cruise_config();
  if v_config.id is null then
    raise exception 'NO_ACTIVE_CRUISE_CONFIG';
  end if;

  v_at := public.admin_effective_at(p_at_utc);
  v_before := public.ship_clock_state_at(v_at, true);
  v_offset := (v_before->>'offset_minutes')::integer + p_delta_minutes;

  insert into public.ship_clock_events (
    cruise_config_id, effective_at_utc, delta_minutes, offset_minutes,
    source, actor_id, note
  ) values (
    v_config.id, v_at, p_delta_minutes, v_offset,
    'manual_delta', v_actor,
    coalesce(p_note, 'Manual ' || p_delta_minutes::text || ' minutes')
  )
  returning id into v_event_id;

  perform public.rebuild_scheduled_clock_events(v_config.id, v_at);
  v_after := public.ship_clock_state_at(v_at, true);

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

create or replace function public.admin_apply_manual_clock_set(
  p_target_ship_local text,
  p_note text default null,
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
  v_before jsonb;
  v_after jsonb;
  v_current_offset integer;
  v_target timestamp;
  v_needed_offset integer;
  v_delta integer;
  v_event_id uuid;
  v_at timestamptz;
begin
  v_actor := public.require_admin();
  v_config := public.active_cruise_config();
  if v_config.id is null then
    raise exception 'NO_ACTIVE_CRUISE_CONFIG';
  end if;

  v_at := public.admin_effective_at(p_at_utc);
  v_before := public.ship_clock_state_at(v_at, true);
  v_current_offset := (v_before->>'offset_minutes')::integer;
  v_target := replace(p_target_ship_local, 'T', ' ')::timestamp;

  v_needed_offset := (
    extract(epoch from (v_target - (v_at at time zone 'utc'))) / 60
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
    v_config.id, v_at, v_delta, v_needed_offset,
    'manual_set', v_actor,
    coalesce(p_note, format('Set ship time to %s', p_target_ship_local))
  )
  returning id into v_event_id;

  perform public.rebuild_scheduled_clock_events(v_config.id, v_at);
  v_after := public.ship_clock_state_at(v_at, true);

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

create or replace function public.admin_upsert_ship_clock_plan_day(
  p_day_number integer,
  p_delta_minutes integer,
  p_enabled boolean default true,
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
  v_before jsonb;
  v_after jsonb;
  v_at timestamptz;
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

  v_at := public.admin_effective_at(p_at_utc);

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

  perform public.rebuild_scheduled_clock_events(v_config.id, v_at);

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

  return jsonb_build_object('plan', v_after, 'state', public.ship_clock_state_at(v_at, true));
end;
$$;

-- ---------------------------------------------------------------------------
-- Harden dev seed: exclusive lock + delete prior development-only configs
-- (prevents parallel integration suites from racing on cruise_config_one_active)
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
  v_id uuid;
  v_day integer;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_label is distinct from 'development-only' then
    raise exception 'DEV_SEED_REQUIRES_DEVELOPMENT_ONLY_LABEL';
  end if;

  -- Serialize concurrent local test suites that reseed the same development config.
  perform pg_advisory_xact_lock(872334501);

  if exists (
    select 1 from public.cruise_config
    where is_active and label is distinct from 'development-only'
  ) then
    raise exception 'ACTIVE_NON_DEV_CONFIG_BLOCKS_DEV_SEED';
  end if;

  delete from public.cruise_config where label = 'development-only';

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

revoke all on function public.dev_seed_cruise_clock(date, integer, text) from public;
grant execute on function public.dev_seed_cruise_clock(date, integer, text) to service_role;
