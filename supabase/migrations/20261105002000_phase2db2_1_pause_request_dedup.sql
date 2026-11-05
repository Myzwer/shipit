-- Phase 2D-B2.1: durable Pause/Resume request-id deduplication + finale latch on mutation.
-- Replay of the same client_request_id cannot create a second state change or audit row.
-- Same id + different desired state is rejected (REQUEST_ID_OPERATION_MISMATCH).

-- ---------------------------------------------------------------------------
-- Durable request ledger
-- ---------------------------------------------------------------------------
create table public.admin_drinkit_pause_requests (
  client_request_id uuid primary key,
  fingerprint text not null,
  desired_paused boolean not null,
  actor_id uuid references public.players (id) on delete set null,
  result_paused boolean not null,
  result_status text not null,
  changed boolean not null,
  paused_at_utc timestamptz,
  finalized_at_utc timestamptz,
  cruise_config_id uuid references public.cruise_config (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint admin_drinkit_pause_requests_fp_nonempty check (char_length(trim(fingerprint)) > 0)
);

comment on table public.admin_drinkit_pause_requests is
  'Idempotent Pause/Resume ledger keyed by client_request_id + fingerprint. Source of truth for lost-response reconcile.';

create index admin_drinkit_pause_requests_created_idx
  on public.admin_drinkit_pause_requests (created_at desc);

alter table public.admin_drinkit_pause_requests enable row level security;
alter table public.admin_drinkit_pause_requests force row level security;

revoke all on table public.admin_drinkit_pause_requests from anon, authenticated;
grant select on table public.admin_drinkit_pause_requests to authenticated;

create policy admin_drinkit_pause_requests_select_admin
  on public.admin_drinkit_pause_requests for select to authenticated
  using (public.is_admin());

create or replace function public.drinkit_pause_fingerprint(p_paused boolean)
returns text
language sql
immutable
as $$
  select 'drinkit_paused:' || p_paused::text;
$$;

revoke all on function public.drinkit_pause_fingerprint(boolean) from public;
grant execute on function public.drinkit_pause_fingerprint(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Lookup for client reconcile
-- ---------------------------------------------------------------------------
create or replace function public.admin_find_drinkit_pause_request_by_id(
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_drinkit_pause_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    return null;
  end if;

  select * into v_row
  from public.admin_drinkit_pause_requests
  where client_request_id = p_client_request_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'client_request_id', v_row.client_request_id,
    'fingerprint', v_row.fingerprint,
    'desired_paused', v_row.desired_paused,
    'paused', v_row.result_paused,
    'status', v_row.result_status,
    'changed', v_row.changed,
    'paused_at_utc', v_row.paused_at_utc,
    'finalized_at_utc', v_row.finalized_at_utc,
    'cruise_config_id', v_row.cruise_config_id,
    'created_at', v_row.created_at,
    'idempotent_replay', true
  );
end;
$$;

revoke all on function public.admin_find_drinkit_pause_request_by_id(uuid) from public;
grant execute on function public.admin_find_drinkit_pause_request_by_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Status read: latch finale so Admin UI sees cutoff without a prior player read
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_drinkit_pause_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.game_control%rowtype;
  v_ship public.game_control%rowtype;
  v_config public.cruise_config;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  perform public.ensure_finale_latched(now());

  select * into v_row from public.game_control where game = 'drinkit';
  select * into v_ship from public.game_control where game = 'shipit';
  v_config := public.active_cruise_config();

  return jsonb_build_object(
    'cruise_config_id', v_config.id,
    'drinkit', jsonb_build_object(
      'status', v_row.status,
      'paused', v_row.status = 'paused',
      'paused_at_utc', v_row.paused_at_utc,
      'finalized_at_utc', v_row.finalized_at_utc
    ),
    'shipit', jsonb_build_object(
      'status', v_ship.status,
      'paused', false,
      'finalized_at_utc', v_ship.finalized_at_utc
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Mutation: serialize on game_control, latch finale, durable request-id dedup
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_drinkit_paused(
  p_paused boolean,
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_before public.game_control%rowtype;
  v_after public.game_control%rowtype;
  v_changed boolean := false;
  v_fp text;
  v_existing public.admin_drinkit_pause_requests%rowtype;
  v_config public.cruise_config;
  v_result jsonb;
  v_finale timestamptz;
  v_past_finale boolean := false;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  v_actor := public.current_player_id();
  v_fp := public.drinkit_pause_fingerprint(p_paused);

  -- Serialize all Drink It! pause mutations.
  select * into v_before from public.game_control where game = 'drinkit' for update;

  v_config := public.active_cruise_config();
  if v_config.id is not null then
    v_finale := public.finale_at_utc(v_config, now());
    v_past_finale := now() >= v_finale;
  end if;

  -- Attempt durable latch. If we RAISE below, the latch update rolls back with this
  -- transaction — so rejection also keys off ship-time cutoff, not only the latch row.
  if v_past_finale
     or v_before.finalized_at_utc is not null
     or v_before.status = 'final' then
    perform public.ensure_finale_latched(now());
    raise exception 'FINALE_LOCKED' using errcode = 'P0001';
  end if;

  if p_client_request_id is not null then
    select * into v_existing
    from public.admin_drinkit_pause_requests
    where client_request_id = p_client_request_id;
    if found then
      if v_existing.fingerprint is distinct from v_fp then
        raise exception 'REQUEST_ID_OPERATION_MISMATCH' using errcode = '22023';
      end if;
      -- Original outcome only — never mutate again or write another audit row.
      return jsonb_build_object(
        'paused', v_existing.result_paused,
        'status', v_existing.result_status,
        'changed', false,
        'paused_at_utc', v_existing.paused_at_utc,
        'finalized_at_utc', v_existing.finalized_at_utc,
        'client_request_id', p_client_request_id,
        'client_request_fingerprint', v_fp,
        'idempotent_replay', true,
        'cruise_config_id', v_existing.cruise_config_id
      );
    end if;
  end if;

  if p_paused then
    if v_before.status is distinct from 'paused' then
      update public.game_control
      set status = 'paused',
          paused_at_utc = now(),
          paused_by = v_actor,
          updated_at = now()
      where game = 'drinkit';
      v_changed := true;
    end if;
  else
    if v_before.status = 'paused' then
      update public.game_control
      set status = 'active',
          paused_at_utc = null,
          paused_by = null,
          updated_at = now()
      where game = 'drinkit';
      v_changed := true;
    end if;
  end if;

  select * into v_after from public.game_control where game = 'drinkit';

  if v_changed then
    insert into public.admin_audit_log (action, actor_id, target_type, target_id, before_json, after_json)
    values (
      case when p_paused then 'drinkit_pause' else 'drinkit_resume' end,
      v_actor,
      'game_control',
      'drinkit',
      jsonb_build_object(
        'status', v_before.status,
        'paused_at_utc', v_before.paused_at_utc,
        'client_request_id', p_client_request_id,
        'client_request_fingerprint', v_fp
      ),
      jsonb_build_object(
        'status', v_after.status,
        'paused_at_utc', v_after.paused_at_utc,
        'client_request_id', p_client_request_id,
        'client_request_fingerprint', v_fp
      )
    );
  end if;

  if p_client_request_id is not null then
    begin
      insert into public.admin_drinkit_pause_requests (
        client_request_id,
        fingerprint,
        desired_paused,
        actor_id,
        result_paused,
        result_status,
        changed,
        paused_at_utc,
        finalized_at_utc,
        cruise_config_id
      ) values (
        p_client_request_id,
        v_fp,
        p_paused,
        v_actor,
        v_after.status = 'paused',
        v_after.status,
        v_changed,
        v_after.paused_at_utc,
        v_after.finalized_at_utc,
        v_config.id
      );
    exception
      when unique_violation then
        -- Concurrent twin under the same lock should be rare; return the winner's record.
        select * into v_existing
        from public.admin_drinkit_pause_requests
        where client_request_id = p_client_request_id;
        if v_existing.fingerprint is distinct from v_fp then
          raise exception 'REQUEST_ID_OPERATION_MISMATCH' using errcode = '22023';
        end if;
        return jsonb_build_object(
          'paused', v_existing.result_paused,
          'status', v_existing.result_status,
          'changed', false,
          'paused_at_utc', v_existing.paused_at_utc,
          'finalized_at_utc', v_existing.finalized_at_utc,
          'client_request_id', p_client_request_id,
          'client_request_fingerprint', v_fp,
          'idempotent_replay', true,
          'cruise_config_id', v_existing.cruise_config_id
        );
    end;
  end if;

  v_result := jsonb_build_object(
    'paused', v_after.status = 'paused',
    'status', v_after.status,
    'changed', v_changed,
    'paused_at_utc', v_after.paused_at_utc,
    'finalized_at_utc', v_after.finalized_at_utc,
    'client_request_id', p_client_request_id,
    'client_request_fingerprint', v_fp,
    'idempotent_replay', false,
    'cruise_config_id', v_config.id
  );
  return v_result;
end;
$$;

comment on function public.admin_set_drinkit_paused(boolean, uuid) is
  'Organizer-only Pause/Resume. Durable per-request-id fingerprint. Latches Friday finale before mutate. Drink It! only.';
