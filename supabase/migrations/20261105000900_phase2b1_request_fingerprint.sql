-- Phase 2B.1 closeout: bind client_request_id to a specific operation fingerprint
-- so idempotent replay cannot silently succeed for a different ±1h / set-time payload.

alter table public.ship_clock_events
  add column if not exists client_request_fingerprint text;

comment on column public.ship_clock_events.client_request_fingerprint is
  'Canonical operation key for client_request_id (e.g. manual_delta:+60, manual_set:…).';

create or replace function public.clock_correction_fingerprint_delta(p_delta_minutes integer)
returns text
language sql
immutable
as $$
  select 'manual_delta:' || p_delta_minutes::text;
$$;

create or replace function public.clock_correction_fingerprint_set(p_target_ship_local text)
returns text
language sql
immutable
as $$
  select 'manual_set:' || replace(coalesce(p_target_ship_local, ''), ' ', 'T');
$$;

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
  v_fp text;
  v_existing public.ship_clock_events%rowtype;
begin
  v_actor := public.require_admin();
  if p_delta_minutes not in (-60, 60) then
    raise exception 'MANUAL_DELTA_MUST_BE_PLUS_OR_MINUS_60' using errcode = '22023';
  end if;

  v_config := public.lock_active_cruise_config();
  v_at := public.admin_effective_at(p_at_utc);
  v_fp := public.clock_correction_fingerprint_delta(p_delta_minutes);

  if p_client_request_id is not null then
    select * into v_existing
    from public.ship_clock_events
    where client_request_id = p_client_request_id;
    if found then
      if v_existing.client_request_fingerprint is distinct from v_fp then
        raise exception 'REQUEST_ID_OPERATION_MISMATCH' using errcode = '22023';
      end if;
      v_after := public.ship_clock_state_at(v_at, true);
      return jsonb_build_object(
        'event_id', v_existing.id,
        'before', v_after,
        'after', v_after,
        'idempotent_replay', true,
        'client_request_id', p_client_request_id,
        'client_request_fingerprint', v_fp
      );
    end if;
  end if;

  v_before := public.ship_clock_state_at(v_at, true);
  v_offset := (v_before->>'offset_minutes')::integer + p_delta_minutes;

  insert into public.ship_clock_events (
    cruise_config_id, effective_at_utc, delta_minutes, offset_minutes,
    source, actor_id, note, client_request_id, client_request_fingerprint
  ) values (
    v_config.id, v_at, p_delta_minutes, v_offset,
    'manual_delta', v_actor,
    coalesce(p_note, 'Manual ' || p_delta_minutes::text || ' minutes'),
    p_client_request_id, v_fp
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
    'client_request_id', p_client_request_id,
    'client_request_fingerprint', v_fp
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
  v_fp text;
  v_existing public.ship_clock_events%rowtype;
begin
  v_actor := public.require_admin();
  v_config := public.lock_active_cruise_config();
  v_at := public.admin_effective_at(p_at_utc);
  v_fp := public.clock_correction_fingerprint_set(p_target_ship_local);

  if p_client_request_id is not null then
    select * into v_existing
    from public.ship_clock_events
    where client_request_id = p_client_request_id;
    if found then
      if v_existing.client_request_fingerprint is distinct from v_fp then
        raise exception 'REQUEST_ID_OPERATION_MISMATCH' using errcode = '22023';
      end if;
      v_after := public.ship_clock_state_at(v_at, true);
      return jsonb_build_object(
        'event_id', v_existing.id,
        'unchanged', false,
        'before', v_after,
        'after', v_after,
        'idempotent_replay', true,
        'client_request_id', p_client_request_id,
        'client_request_fingerprint', v_fp
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
      'client_request_id', p_client_request_id,
      'client_request_fingerprint', v_fp
    );
  end if;

  insert into public.ship_clock_events (
    cruise_config_id, effective_at_utc, delta_minutes, offset_minutes,
    source, actor_id, note, client_request_id, client_request_fingerprint
  ) values (
    v_config.id, v_at, v_delta, v_needed_offset,
    'manual_set', v_actor,
    coalesce(p_note, format('Set ship time to %s', p_target_ship_local)),
    p_client_request_id, v_fp
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
    'client_request_id', p_client_request_id,
    'client_request_fingerprint', v_fp
  );
end;
$$;

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
    'client_request_fingerprint', v_row.client_request_fingerprint,
    'actor_id', v_actor
  );
end;
$$;

-- Include fingerprint in diagnostics events for client-side checks.
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
