-- Phase 4B2 Gate A: abandon via ledger + Storage API (no direct SQL storage.objects delete).
-- Authority: Supabase Storage API; Tech Spec §7.3.

create type public.photo_storage_cleanup as enum (
  'not_needed',
  'pending',
  'completed',
  'failed'
);

alter table public.photos
  add column if not exists storage_cleanup_status public.photo_storage_cleanup
    not null default 'not_needed';

comment on column public.photos.storage_cleanup_status is
  'Physical Storage deletion is client/API-driven. pending = abandoned ledger, object may still exist.';

-- Staged objects must not be deletable while bind can race; only abandoned+pending cleanup.
drop policy if exists game_photos_delete_own_unbound on storage.objects;

create policy game_photos_delete_own_abandoned_cleanup
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'game-photos'
    and public.storage_current_player_id() is not null
    and (storage.foldername(name))[1] = public.storage_current_player_id()::text
    and exists (
      select 1 from public.photos p
      where p.storage_path = name
        and p.owner_player_id = public.storage_current_player_id()
        and p.status = 'abandoned'
        and p.storage_cleanup_status = 'pending'
        and p.status is distinct from 'bound'
    )
  );

create or replace function public.abandon_photo_upload(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_photo public.photos%rowtype;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found or v_photo.owner_player_id is distinct from v_player then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;

  if v_photo.status = 'bound' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_ALREADY_BOUND');
  end if;

  if v_photo.status = 'abandoned' then
    return jsonb_build_object(
      'ok', true,
      'photo_id', v_photo.id,
      'status', 'abandoned',
      'bucket', v_photo.bucket_id,
      'storage_path', v_photo.storage_path,
      'cleanup_status', v_photo.storage_cleanup_status,
      'idempotent_replay', true
    );
  end if;

  -- Ledger abandon first; physical delete is Storage API (client or later sweeper).
  update public.photos
  set status = 'abandoned',
      abandoned_at_utc = clock_timestamp(),
      storage_cleanup_status = 'pending'
  where id = v_photo.id;

  return jsonb_build_object(
    'ok', true,
    'photo_id', v_photo.id,
    'status', 'abandoned',
    'bucket', v_photo.bucket_id,
    'storage_path', v_photo.storage_path,
    'cleanup_status', 'pending',
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.abandon_photo_upload(uuid) from public;
grant execute on function public.abandon_photo_upload(uuid) to authenticated;

-- After Storage API remove succeeds (or object already gone).
create or replace function public.mark_photo_storage_cleaned(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_photo public.photos%rowtype;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found or v_photo.owner_player_id is distinct from v_player then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;
  if v_photo.status is distinct from 'abandoned' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_ABANDONED');
  end if;
  if v_photo.storage_cleanup_status = 'completed' then
    return jsonb_build_object('ok', true, 'cleanup_status', 'completed', 'idempotent_replay', true);
  end if;

  update public.photos
  set storage_cleanup_status = 'completed'
  where id = v_photo.id;

  return jsonb_build_object('ok', true, 'photo_id', v_photo.id, 'cleanup_status', 'completed');
end;
$$;

revoke all on function public.mark_photo_storage_cleaned(uuid) from public;
grant execute on function public.mark_photo_storage_cleaned(uuid) to authenticated;

-- Record cleanup failure without lying that the file is gone.
create or replace function public.mark_photo_storage_cleanup_failed(p_photo_id uuid, p_detail text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_photo public.photos%rowtype;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found or v_photo.owner_player_id is distinct from v_player then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;
  if v_photo.status is distinct from 'abandoned' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_ABANDONED');
  end if;
  if v_photo.storage_cleanup_status = 'completed' then
    return jsonb_build_object('ok', true, 'cleanup_status', 'completed', 'idempotent_replay', true);
  end if;

  update public.photos
  set storage_cleanup_status = 'failed'
  where id = v_photo.id;

  return jsonb_build_object(
    'ok', true,
    'photo_id', v_photo.id,
    'cleanup_status', 'failed',
    'detail', left(coalesce(p_detail, ''), 200)
  );
end;
$$;

revoke all on function public.mark_photo_storage_cleanup_failed(uuid, text) from public;
grant execute on function public.mark_photo_storage_cleanup_failed(uuid, text) to authenticated;

comment on function public.abandon_photo_upload(uuid) is
  'Marks photo abandoned under row lock. Physical deletion uses Storage API + mark_photo_storage_cleaned.';
