-- Phase 5C Gate 3: service-role photo cleanup claim/reconcile RPCs.
-- Physical deletion uses Storage API only (never SQL DELETE on storage.objects).
-- Default safe TTL: 72 hours. Candidates: pending_upload or abandoned, unbound only.
-- Bound / voided-bound / staged are never candidates.
-- Claim state = cleanup_claim_token set while storage_cleanup_status remains pending/failed.

alter table public.photos
  add column if not exists cleanup_claimed_at_utc timestamptz,
  add column if not exists cleanup_claim_token uuid;

comment on column public.photos.cleanup_claim_token is
  'Service-role cleanup runner claim; cleared when completed/failed.';

create or replace function public.claim_photo_cleanup_batch(
  p_ttl_hours integer default 72,
  p_limit integer default 25,
  p_claim_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ttl integer := greatest(1, least(coalesce(p_ttl_hours, 72), 24 * 30));
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_token uuid := coalesce(p_claim_token, gen_random_uuid());
  v_cutoff timestamptz := clock_timestamp() - make_interval(hours => v_ttl);
  v_now timestamptz := clock_timestamp();
  v_rows jsonb := '[]'::jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  -- Promote expired pending_upload → abandoned + pending cleanup.
  update public.photos p
  set status = 'abandoned',
      abandoned_at_utc = coalesce(p.abandoned_at_utc, v_now),
      storage_cleanup_status = 'pending'
  where p.status = 'pending_upload'
    and p.bound_submission_id is null
    and p.created_at < v_cutoff
    and p.storage_cleanup_status in ('not_needed', 'pending', 'failed');

  with candidates as (
    select p.id
    from public.photos p
    where p.status = 'abandoned'
      and p.bound_submission_id is null
      and p.storage_cleanup_status in ('pending', 'failed')
      and p.created_at < v_cutoff
      and (
        p.cleanup_claim_token is null
        or p.cleanup_claimed_at_utc is null
        or p.cleanup_claimed_at_utc < v_now - interval '15 minutes'
      )
    order by p.created_at asc
    for update skip locked
    limit v_limit
  ),
  claimed as (
    update public.photos p
    set cleanup_claim_token = v_token,
        cleanup_claimed_at_utc = v_now,
        storage_cleanup_status = 'pending'
    from candidates c
    where p.id = c.id
      and p.status = 'abandoned'
      and p.bound_submission_id is null
    returning p.id, p.bucket_id, p.storage_path, p.owner_player_id, p.game, p.purpose, p.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'photo_id', id,
    'bucket', bucket_id,
    'storage_path', storage_path,
    'owner_player_id', owner_player_id,
    'game', game,
    'purpose', purpose,
    'created_at', created_at
  ) order by created_at), '[]'::jsonb)
  into v_rows
  from claimed;

  return jsonb_build_object(
    'ok', true,
    'claim_token', v_token,
    'ttl_hours', v_ttl,
    'cutoff_utc', v_cutoff,
    'photos', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.claim_photo_cleanup_batch(integer, integer, uuid) from public;
grant execute on function public.claim_photo_cleanup_batch(integer, integer, uuid) to service_role;

create or replace function public.complete_photo_cleanup(
  p_photo_id uuid,
  p_claim_token uuid,
  p_object_missing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo public.photos%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_photo_id is null or p_claim_token is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ARGS');
  end if;

  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;

  if v_photo.status = 'bound' or v_photo.bound_submission_id is not null then
    update public.photos
    set storage_cleanup_status = 'not_needed',
        cleanup_claim_token = null,
        cleanup_claimed_at_utc = null
    where id = p_photo_id;
    return jsonb_build_object('ok', false, 'code', 'PHOTO_BOUND_PRESERVED');
  end if;

  if v_photo.storage_cleanup_status = 'completed' then
    return jsonb_build_object(
      'ok', true,
      'cleanup_status', 'completed',
      'idempotent_replay', true,
      'object_missing', p_object_missing
    );
  end if;

  if v_photo.cleanup_claim_token is distinct from p_claim_token then
    return jsonb_build_object('ok', false, 'code', 'CLAIM_MISMATCH');
  end if;

  update public.photos
  set storage_cleanup_status = 'completed',
      cleanup_claim_token = null,
      cleanup_claimed_at_utc = null
  where id = p_photo_id;

  return jsonb_build_object(
    'ok', true,
    'photo_id', p_photo_id,
    'cleanup_status', 'completed',
    'object_missing', coalesce(p_object_missing, false)
  );
end;
$$;

revoke all on function public.complete_photo_cleanup(uuid, uuid, boolean) from public;
grant execute on function public.complete_photo_cleanup(uuid, uuid, boolean) to service_role;

create or replace function public.fail_photo_cleanup(
  p_photo_id uuid,
  p_claim_token uuid,
  p_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo public.photos%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_photo_id is null or p_claim_token is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ARGS');
  end if;

  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;
  if v_photo.status = 'bound' or v_photo.bound_submission_id is not null then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_BOUND_PRESERVED');
  end if;
  if v_photo.storage_cleanup_status = 'completed' then
    return jsonb_build_object('ok', true, 'cleanup_status', 'completed', 'idempotent_replay', true);
  end if;
  if v_photo.cleanup_claim_token is distinct from p_claim_token then
    return jsonb_build_object('ok', false, 'code', 'CLAIM_MISMATCH');
  end if;

  update public.photos
  set storage_cleanup_status = 'failed',
      cleanup_claim_token = null,
      cleanup_claimed_at_utc = null
  where id = p_photo_id;

  return jsonb_build_object(
    'ok', true,
    'photo_id', p_photo_id,
    'cleanup_status', 'failed',
    'detail', left(coalesce(p_detail, ''), 200)
  );
end;
$$;

revoke all on function public.fail_photo_cleanup(uuid, uuid, text) from public;
grant execute on function public.fail_photo_cleanup(uuid, uuid, text) to service_role;

comment on function public.claim_photo_cleanup_batch(integer, integer, uuid) is
  'Phase 5C: service-role claim of expired unbound pending/abandoned photos for Storage API cleanup. TTL default 72h.';

comment on function public.complete_photo_cleanup(uuid, uuid, boolean) is
  'Phase 5C: mark claimed cleanup completed after Storage API remove (or missing-object reconcile).';
