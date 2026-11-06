-- Phase 6B1 Gate: durable Auth request reservation before Auth side effects.
-- Fixes TOCTOU where admin_roster_auth_begin held only a transaction advisory
-- lock and committed before Auth API calls, allowing concurrent same-UUID
-- workers to both proceed. Completion must not overwrite mismatched fingerprints.

alter table public.admin_roster_auth_requests
  add column if not exists status text;

alter table public.admin_roster_auth_requests
  add column if not exists lease_expires_at_utc timestamptz;

update public.admin_roster_auth_requests
set status = 'completed'
where status is null;

alter table public.admin_roster_auth_requests
  alter column status set default 'completed';

alter table public.admin_roster_auth_requests
  alter column status set not null;

alter table public.admin_roster_auth_requests
  drop constraint if exists admin_roster_auth_requests_status_check;

alter table public.admin_roster_auth_requests
  add constraint admin_roster_auth_requests_status_check check (
    status in ('in_progress', 'completed', 'failed')
  );

comment on column public.admin_roster_auth_requests.status is
  'in_progress = reserved before Auth side effects; completed/failed = terminal. Phase 6A rows backfilled as completed.';

-- ---------------------------------------------------------------------------
-- Begin: insert durable in_progress reservation under request-id lock
-- ---------------------------------------------------------------------------
create or replace function public.admin_roster_auth_begin(
  p_client_request_id uuid,
  p_action text,
  p_fingerprint text,
  p_actor_id uuid,
  p_player_id uuid,
  p_login_alias text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.admin_roster_auth_requests%rowtype;
  v_now timestamptz := clock_timestamp();
  v_lease timestamptz := clock_timestamp() + interval '120 seconds';
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_client_request_id is null or p_action is null or p_fingerprint is null or p_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT');
  end if;
  if position('password=' in lower(p_fingerprint)) > 0
     or position('"password"' in lower(p_fingerprint)) > 0 then
    return jsonb_build_object('ok', false, 'code', 'FINGERPRINT_REJECTED');
  end if;

  perform pg_advisory_xact_lock(
    hashtext('admin_roster_auth_request'),
    hashtext(p_client_request_id::text)
  );

  select * into v_existing
  from public.admin_roster_auth_requests
  where client_request_id = p_client_request_id
  for update;

  if found then
    if v_existing.fingerprint is distinct from p_fingerprint
       or v_existing.action is distinct from p_action then
      return jsonb_build_object(
        'ok', false,
        'code', 'REQUEST_ID_OPERATION_MISMATCH'
      );
    end if;

    if v_existing.status in ('completed', 'failed') then
      -- Phase 6A/6B1 completed replay (v1-compatible).
      return jsonb_build_object(
        'ok', true,
        'replay', true,
        'reserved', false,
        'status', v_existing.status,
        'result', v_existing.result_json,
        'orphan_auth_user_id', v_existing.orphan_auth_user_id
      );
    end if;

    -- in_progress: same fingerprint. Reclaim only after lease expiry.
    if v_existing.lease_expires_at_utc is not null
       and v_existing.lease_expires_at_utc < v_now then
      update public.admin_roster_auth_requests
      set actor_id = p_actor_id,
          player_id = coalesce(p_player_id, player_id),
          login_alias = coalesce(p_login_alias, login_alias),
          lease_expires_at_utc = v_lease,
          received_at_utc = v_now
      where client_request_id = p_client_request_id;

      return jsonb_build_object(
        'ok', true,
        'replay', false,
        'reserved', true,
        'reclaimed', true,
        'status', 'in_progress'
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'replay', false,
      'reserved', false,
      'in_progress', true,
      'status', 'in_progress',
      'result', v_existing.result_json,
      'orphan_auth_user_id', v_existing.orphan_auth_user_id,
      'lease_expires_at_utc', v_existing.lease_expires_at_utc
    );
  end if;

  -- Durable reservation BEFORE Auth side effects.
  insert into public.admin_roster_auth_requests (
    client_request_id, action, fingerprint, actor_id, player_id, login_alias,
    result_json, orphan_auth_user_id, status, lease_expires_at_utc,
    received_at_utc, completed_at_utc
  ) values (
    p_client_request_id, p_action, p_fingerprint, p_actor_id, p_player_id, p_login_alias,
    jsonb_build_object('status', 'in_progress'),
    null, 'in_progress', v_lease,
    v_now, v_now
  );

  return jsonb_build_object(
    'ok', true,
    'replay', false,
    'reserved', true,
    'status', 'in_progress'
  );
end;
$$;

revoke all on function public.admin_roster_auth_begin(uuid, text, text, uuid, uuid, text) from public;
grant execute on function public.admin_roster_auth_begin(uuid, text, text, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Complete: terminal write only for matching in_progress reservation
-- ---------------------------------------------------------------------------
create or replace function public.admin_roster_auth_complete(
  p_client_request_id uuid,
  p_action text,
  p_fingerprint text,
  p_actor_id uuid,
  p_player_id uuid,
  p_login_alias text,
  p_result jsonb,
  p_orphan_auth_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.admin_roster_auth_requests%rowtype;
  v_status text;
  v_ok boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_client_request_id is null or p_action is null or p_fingerprint is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT');
  end if;

  perform pg_advisory_xact_lock(
    hashtext('admin_roster_auth_request'),
    hashtext(p_client_request_id::text)
  );

  select * into v_existing
  from public.admin_roster_auth_requests
  where client_request_id = p_client_request_id
  for update;

  if not found then
    -- Should not happen after begin; refuse silent insert of conflicting completion.
    return jsonb_build_object('ok', false, 'code', 'RESERVATION_MISSING');
  end if;

  if v_existing.fingerprint is distinct from p_fingerprint
     or v_existing.action is distinct from p_action then
    return jsonb_build_object(
      'ok', false,
      'code', 'REQUEST_ID_OPERATION_MISMATCH',
      'message', 'Completion fingerprint does not match the reserved request'
    );
  end if;

  if v_existing.status in ('completed', 'failed') then
    return coalesce(v_existing.result_json, '{}'::jsonb) || jsonb_build_object(
      'idempotent_replay', true,
      'status', v_existing.status,
      'client_request_id', p_client_request_id
    );
  end if;

  v_ok := coalesce((p_result->>'ok')::boolean, false);
  v_status := case when v_ok then 'completed' else 'failed' end;

  update public.admin_roster_auth_requests
  set result_json = p_result,
      orphan_auth_user_id = coalesce(p_orphan_auth_user_id, orphan_auth_user_id),
      player_id = coalesce(p_player_id, player_id),
      login_alias = coalesce(p_login_alias, login_alias),
      status = v_status,
      lease_expires_at_utc = null,
      completed_at_utc = clock_timestamp()
  where client_request_id = p_client_request_id;

  return p_result;
end;
$$;

revoke all on function public.admin_roster_auth_complete(uuid, text, text, uuid, uuid, text, jsonb, uuid) from public;
grant execute on function public.admin_roster_auth_complete(uuid, text, text, uuid, uuid, text, jsonb, uuid) to service_role;

create or replace function public.admin_find_roster_auth_request_by_id(
  p_client_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.admin_roster_auth_requests%rowtype;
begin
  perform public.require_admin();
  if p_client_request_id is null then
    return null;
  end if;
  select * into v_row
  from public.admin_roster_auth_requests
  where client_request_id = p_client_request_id;
  if not found then
    return null;
  end if;
  return coalesce(v_row.result_json, '{}'::jsonb) || jsonb_build_object(
    'client_request_id', v_row.client_request_id,
    'action', v_row.action,
    'status', v_row.status,
    'received_at_utc', v_row.received_at_utc,
    'completed_at_utc', v_row.completed_at_utc,
    'lease_expires_at_utc', v_row.lease_expires_at_utc,
    'has_orphan_auth', v_row.orphan_auth_user_id is not null
  );
end;
$$;

revoke all on function public.admin_find_roster_auth_request_by_id(uuid) from public;
grant execute on function public.admin_find_roster_auth_request_by_id(uuid) to authenticated;

comment on function public.admin_roster_auth_begin(uuid, text, text, uuid, uuid, text) is
  'Phase 6B1: durable in_progress reservation before Auth side effects; only reserved=true may call Auth Admin APIs.';

comment on function public.admin_roster_auth_complete(uuid, text, text, uuid, uuid, text, jsonb, uuid) is
  'Phase 6B1: terminal complete/fail for matching reservation only; never overwrites mismatched fingerprints.';
