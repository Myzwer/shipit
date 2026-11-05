-- Phase 2C gate: zero-adjustment Set Ship Time must consume client_request_id.
-- A successful no-op set with a request id inserts a durable delta=0 manual_set
-- event so a later retry cannot apply a different correction under the same id.

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
      -- Replay: never recompute a new adjustment from current clock state.
      v_after := public.ship_clock_state_at(v_at, true);
      return jsonb_build_object(
        'event_id', v_existing.id,
        'unchanged', (v_existing.delta_minutes = 0),
        'delta_minutes', v_existing.delta_minutes,
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
    -- Durable no-op receipt when a request id is present (audit + idempotency).
    if p_client_request_id is not null then
      insert into public.ship_clock_events (
        cruise_config_id, effective_at_utc, delta_minutes, offset_minutes,
        source, actor_id, note, client_request_id, client_request_fingerprint
      ) values (
        v_config.id, v_at, 0, v_current_offset,
        'manual_set', v_actor,
        coalesce(p_note, format('Set ship time to %s (unchanged)', p_target_ship_local)),
        p_client_request_id, v_fp
      )
      returning id into v_event_id;

      perform public.write_admin_audit(
        'clock.manual_set_unchanged',
        v_actor,
        'ship_clock_events',
        v_event_id::text,
        v_before,
        v_before
      );

      return jsonb_build_object(
        'event_id', v_event_id,
        'unchanged', true,
        'delta_minutes', 0,
        'before', v_before,
        'after', v_before,
        'client_request_id', p_client_request_id,
        'client_request_fingerprint', v_fp
      );
    end if;

    return jsonb_build_object(
      'unchanged', true,
      'delta_minutes', 0,
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
    'unchanged', false,
    'before', v_before,
    'after', v_after,
    'client_request_id', p_client_request_id,
    'client_request_fingerprint', v_fp
  );
end;
$$;

revoke all on function public.admin_apply_manual_clock_set(text, text, timestamptz, uuid) from public;
grant execute on function public.admin_apply_manual_clock_set(text, text, timestamptz, uuid) to authenticated;
