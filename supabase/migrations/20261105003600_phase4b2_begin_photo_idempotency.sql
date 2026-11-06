-- Phase 4B2 Gate B: idempotent begin_photo_upload via client request id.
-- Lost begin responses reuse the same reservation instead of minting duplicates.

alter table public.photos
  add column if not exists client_request_id uuid;

create unique index if not exists photos_owner_client_request_uidx
  on public.photos (owner_player_id, client_request_id)
  where client_request_id is not null;

-- Drop prior overloads so we can redefine a single signature with defaults.
drop function if exists public.begin_photo_upload(public.game_id, public.photo_purpose, text, integer, integer, integer, text);
drop function if exists public.begin_photo_upload(public.game_id, public.photo_purpose, text, integer, integer, integer, text, uuid);

create function public.begin_photo_upload(
  p_game public.game_id,
  p_purpose public.photo_purpose,
  p_mime_type text,
  p_byte_size integer,
  p_width integer,
  p_height integer,
  p_original_filename text default null,
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_id uuid;
  v_ext text;
  v_path text;
  v_existing public.photos%rowtype;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_game is null or not public.has_game(p_game) then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;

  if p_purpose = 'drink_log' and p_game is distinct from 'drinkit' then
    return jsonb_build_object('ok', false, 'code', 'PURPOSE_GAME_MISMATCH');
  end if;
  if p_purpose = 'daily' and p_game is distinct from 'drinkit' then
    return jsonb_build_object('ok', false, 'code', 'PURPOSE_GAME_MISMATCH');
  end if;
  if p_purpose = 'scavenger' and p_game is distinct from 'shipit' then
    return jsonb_build_object('ok', false, 'code', 'PURPOSE_GAME_MISMATCH');
  end if;

  if p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_MEDIA_TYPE');
  end if;
  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 5242880 then
    return jsonb_build_object('ok', false, 'code', 'FILE_TOO_LARGE');
  end if;
  if p_width is null or p_height is null or p_width < 1 or p_height < 1 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DIMENSIONS');
  end if;

  if p_client_request_id is not null then
    select * into v_existing
    from public.photos
    where owner_player_id = v_player
      and client_request_id = p_client_request_id
    for update;

    if found then
      if v_existing.status in ('pending_upload', 'staged')
         and v_existing.game = p_game
         and v_existing.purpose = p_purpose then
        return jsonb_build_object(
          'ok', true,
          'photo_id', v_existing.id,
          'bucket', v_existing.bucket_id,
          'storage_path', v_existing.storage_path,
          'status', v_existing.status,
          'idempotent_replay', true
        );
      end if;
      return jsonb_build_object(
        'ok', false,
        'code', 'BEGIN_REQUEST_CONSUMED',
        'message', 'Start a new photo selection for a fresh upload reservation.',
        'photo_id', v_existing.id,
        'status', v_existing.status
      );
    end if;
  end if;

  v_id := gen_random_uuid();
  v_ext := case p_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    else 'webp'
  end;
  v_path := v_player::text || '/' || p_game::text || '/' || v_id::text || '.' || v_ext;

  insert into public.photos (
    id, owner_player_id, game, purpose, status, storage_path,
    mime_type, byte_size, width, height, original_filename, client_request_id
  ) values (
    v_id, v_player, p_game, p_purpose, 'pending_upload', v_path,
    p_mime_type, p_byte_size, p_width, p_height,
    left(nullif(trim(coalesce(p_original_filename, '')), ''), 200),
    p_client_request_id
  );

  return jsonb_build_object(
    'ok', true,
    'photo_id', v_id,
    'bucket', 'game-photos',
    'storage_path', v_path,
    'status', 'pending_upload',
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.begin_photo_upload(public.game_id, public.photo_purpose, text, integer, integer, integer, text, uuid) from public;
grant execute on function public.begin_photo_upload(public.game_id, public.photo_purpose, text, integer, integer, integer, text, uuid) to authenticated;

create or replace function public.get_my_photo(p_photo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_photo public.photos%rowtype;
  v_obj_exists boolean;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_photo from public.photos where id = p_photo_id;
  if not found or v_photo.owner_player_id is distinct from v_player then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;

  select exists (
    select 1 from storage.objects o
    where o.bucket_id = v_photo.bucket_id and o.name = v_photo.storage_path
  ) into v_obj_exists;

  return jsonb_build_object(
    'ok', true,
    'photo_id', v_photo.id,
    'game', v_photo.game,
    'purpose', v_photo.purpose,
    'status', v_photo.status,
    'bucket', v_photo.bucket_id,
    'storage_path', v_photo.storage_path,
    'mime_type', v_photo.mime_type,
    'byte_size', v_photo.byte_size,
    'width', v_photo.width,
    'height', v_photo.height,
    'staged_at_utc', v_photo.staged_at_utc,
    'storage_object_present', v_obj_exists,
    'client_request_id', v_photo.client_request_id,
    'cleanup_status', v_photo.storage_cleanup_status
  );
end;
$$;

revoke all on function public.get_my_photo(uuid) from public;
grant execute on function public.get_my_photo(uuid) to authenticated;
