-- Phase 2B.1: Atomic seven-day plan save + client_request_id for correction reconcile
-- - admin_save_ship_clock_plan: one transactional validated write for all 7 days
-- - client_request_id on ship_clock_events for unknown-outcome reconciliation
-- - cruise_config row lock serializes privileged clock mutations

-- ---------------------------------------------------------------------------
-- Request correlation on applied events (manual corrections)
-- ---------------------------------------------------------------------------
alter table public.ship_clock_events
  add column if not exists client_request_id uuid;

create unique index if not exists ship_clock_events_client_request_id_unique
  on public.ship_clock_events (client_request_id)
  where client_request_id is not null;

comment on column public.ship_clock_events.client_request_id is
  'Optional client-supplied idempotency / reconcile token for manual corrections.';

-- ---------------------------------------------------------------------------
-- Shared lock helper for privileged clock mutations
-- ---------------------------------------------------------------------------
create or replace function public.lock_active_cruise_config()
returns public.cruise_config
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config;
begin
  select c.*
  into v_config
  from public.cruise_config c
  where c.is_active
  for update;

  if not found then
    raise exception 'NO_ACTIVE_CRUISE_CONFIG';
  end if;
  return v_config;
end;
$$;

revoke all on function public.lock_active_cruise_config() from public;

-- ---------------------------------------------------------------------------
-- Atomic seven-day plan save
-- p_days: jsonb array of { day_number, delta_minutes, enabled }
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_ship_clock_plan(
  p_days jsonb,
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
  v_before jsonb;
  v_after jsonb;
  v_item jsonb;
  v_day integer;
  v_delta integer;
  v_enabled boolean;
  v_seen integer[] := array[]::integer[];
  v_count integer;
  v_changed boolean := false;
  v_existing public.ship_clock_plan%rowtype;
  v_future_ids uuid[];
  v_future_ids_after uuid[];
begin
  v_actor := public.require_admin();
  v_config := public.lock_active_cruise_config();
  v_at := public.admin_effective_at(p_at_utc);

  if p_days is null or jsonb_typeof(p_days) is distinct from 'array' then
    raise exception 'INVALID_PLAN_PAYLOAD' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_days);
  if v_count is distinct from 7 then
    raise exception 'PLAN_MUST_HAVE_SEVEN_DAYS' using errcode = '22023';
  end if;

  -- Validate entire payload before any writes.
  for v_item in select * from jsonb_array_elements(p_days)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'INVALID_PLAN_DAY' using errcode = '22023';
    end if;

    begin
      v_day := (v_item->>'day_number')::integer;
      v_delta := (v_item->>'delta_minutes')::integer;
      v_enabled := (v_item->>'enabled')::boolean;
    exception
      when others then
        raise exception 'INVALID_PLAN_DAY' using errcode = '22023';
    end;

    if v_day is null or v_day < 1 or v_day > 7 then
      raise exception 'INVALID_DAY_NUMBER' using errcode = '22023';
    end if;
    if v_delta is null or v_delta not in (-120, -60, 0, 60, 120) then
      raise exception 'INVALID_PLAN_DELTA' using errcode = '22023';
    end if;
    if v_enabled is null then
      raise exception 'INVALID_PLAN_ENABLED' using errcode = '22023';
    end if;
    if v_day = any (v_seen) then
      raise exception 'DUPLICATE_PLAN_DAY' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_day);
  end loop;

  if array_length(v_seen, 1) is distinct from 7 then
    raise exception 'PLAN_MUST_HAVE_SEVEN_DAYS' using errcode = '22023';
  end if;
  -- Require the complete set 1..7 (no gaps).
  if not (v_seen @> array[1,2,3,4,5,6,7]) then
    raise exception 'PLAN_MUST_HAVE_SEVEN_DAYS' using errcode = '22023';
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

  select coalesce(array_agg(e.id order by e.schedule_key), array[]::uuid[])
  into v_future_ids
  from public.ship_clock_events e
  where e.cruise_config_id = v_config.id
    and e.source = 'scheduled'
    and e.effective_at_utc > v_at;

  -- Apply all days (still one transaction).
  for v_item in select * from jsonb_array_elements(p_days)
  loop
    v_day := (v_item->>'day_number')::integer;
    v_delta := (v_item->>'delta_minutes')::integer;
    v_enabled := (v_item->>'enabled')::boolean;

    select * into v_existing
    from public.ship_clock_plan
    where cruise_config_id = v_config.id
      and day_number = v_day;

    if found
       and v_existing.delta_minutes = v_delta
       and v_existing.enabled = v_enabled then
      continue;
    end if;

    v_changed := true;

    insert into public.ship_clock_plan (cruise_config_id, day_number, delta_minutes, enabled, updated_at)
    values (v_config.id, v_day, v_delta, v_enabled, now())
    on conflict (cruise_config_id, day_number) do update
      set delta_minutes = excluded.delta_minutes,
          enabled = excluded.enabled,
          updated_at = now();
  end loop;

  if v_changed then
    perform public.rebuild_scheduled_clock_events(v_config.id, v_at);
  end if;

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

  select coalesce(array_agg(e.id order by e.schedule_key), array[]::uuid[])
  into v_future_ids_after
  from public.ship_clock_events e
  where e.cruise_config_id = v_config.id
    and e.source = 'scheduled'
    and e.effective_at_utc > v_at;

  perform public.write_admin_audit(
    'clock.plan_save',
    v_actor,
    'ship_clock_plan',
    v_config.id::text,
    v_before,
    v_after
  );

  return jsonb_build_object(
    'actor_id', v_actor,
    'changed', v_changed,
    'rebuilt', v_changed,
    'plan', v_after,
    'state', public.ship_clock_state_at(v_at, true),
    'future_event_ids_before', to_jsonb(v_future_ids),
    'future_event_ids_after', to_jsonb(v_future_ids_after)
  );
end;
$$;

revoke all on function public.admin_save_ship_clock_plan(jsonb, timestamptz) from public;
grant execute on function public.admin_save_ship_clock_plan(jsonb, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Manual corrections: lock + optional client_request_id
-- Drop prior 3-arg overloads so PostgREST exposes a single signature.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_apply_manual_clock_correction(integer, text, timestamptz);
drop function if exists public.admin_apply_manual_clock_set(text, text, timestamptz);

create or replace function public.admin_apply_manual_clock_correction(
  p_delta_minutes integer,
  p_note text default null,
  p_at_utc timestamptz default null,
  p_client_request_id uuid default null
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

  v_config := public.lock_active_cruise_config();
  v_at := public.admin_effective_at(p_at_utc);

  if p_client_request_id is not null then
    select id into v_event_id
    from public.ship_clock_events
    where client_request_id = p_client_request_id;
    if found then
      -- Idempotent replay of the same client request.
      v_after := public.ship_clock_state_at(v_at, true);
      return jsonb_build_object(
        'event_id', v_event_id,
        'before', v_after,
        'after', v_after,
        'idempotent_replay', true,
        'client_request_id', p_client_request_id
      );
    end if;
  end if;

  v_before := public.ship_clock_state_at(v_at, true);
  v_offset := (v_before->>'offset_minutes')::integer + p_delta_minutes;

  insert into public.ship_clock_events (
    cruise_config_id, effective_at_utc, delta_minutes, offset_minutes,
    source, actor_id, note, client_request_id
  ) values (
    v_config.id, v_at, p_delta_minutes, v_offset,
    'manual_delta', v_actor,
    coalesce(p_note, 'Manual ' || p_delta_minutes::text || ' minutes'),
    p_client_request_id
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
    'after', v_after,
    'client_request_id', p_client_request_id
  );
end;
$$;

create or replace function public.admin_apply_manual_clock_set(
  p_target_ship_local text,
  p_note text default null,
  p_at_utc timestamptz default null,
  p_client_request_id uuid default null
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
  v_config := public.lock_active_cruise_config();
  v_at := public.admin_effective_at(p_at_utc);

  if p_client_request_id is not null then
    select id into v_event_id
    from public.ship_clock_events
    where client_request_id = p_client_request_id;
    if found then
      v_after := public.ship_clock_state_at(v_at, true);
      return jsonb_build_object(
        'event_id', v_event_id,
        'unchanged', false,
        'before', v_after,
        'after', v_after,
        'idempotent_replay', true,
        'client_request_id', p_client_request_id
      );
    end if;
  end if;

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
      'after', v_before,
      'client_request_id', p_client_request_id
    );
  end if;

  insert into public.ship_clock_events (
    cruise_config_id, effective_at_utc, delta_minutes, offset_minutes,
    source, actor_id, note, client_request_id
  ) values (
    v_config.id, v_at, v_delta, v_needed_offset,
    'manual_set', v_actor,
    coalesce(p_note, format('Set ship time to %s', p_target_ship_local)),
    p_client_request_id
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
    'after', v_after,
    'client_request_id', p_client_request_id
  );
end;
$$;

-- Diagnostics include client_request_id for reconcile.
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
      'note', e.note,
      'client_request_id', e.client_request_id
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

-- Explicit reconcile helper (service_role + admin).
create or replace function public.admin_find_clock_event_by_request_id(
  p_client_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_row public.ship_clock_events%rowtype;
begin
  v_actor := public.require_admin();
  if p_client_request_id is null then
    return null;
  end if;

  select * into v_row
  from public.ship_clock_events
  where client_request_id = p_client_request_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'effective_at_utc', v_row.effective_at_utc,
    'delta_minutes', v_row.delta_minutes,
    'offset_minutes', v_row.offset_minutes,
    'source', v_row.source,
    'note', v_row.note,
    'client_request_id', v_row.client_request_id,
    'actor_id', v_actor
  );
end;
$$;

revoke all on function public.admin_find_clock_event_by_request_id(uuid) from public;
grant execute on function public.admin_find_clock_event_by_request_id(uuid) to authenticated, service_role;

revoke all on function public.admin_apply_manual_clock_correction(integer, text, timestamptz, uuid) from public;
revoke all on function public.admin_apply_manual_clock_set(text, text, timestamptz, uuid) from public;
grant execute on function public.admin_apply_manual_clock_correction(integer, text, timestamptz, uuid)
  to authenticated, service_role;
grant execute on function public.admin_apply_manual_clock_set(text, text, timestamptz, uuid)
  to authenticated, service_role;
