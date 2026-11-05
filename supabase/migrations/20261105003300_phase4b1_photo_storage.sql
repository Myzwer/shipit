-- Phase 4B1: private photo staging foundation (no scoring attach yet).
-- Authority: Tech Spec §7.3, §9.

create type public.photo_purpose as enum ('drink_log', 'daily', 'scavenger');
create type public.photo_status as enum (
  'pending_upload', -- row reserved; object may not exist yet
  'staged',         -- storage object verified; eligible for future submit
  'bound',          -- referenced by an accepted submission (immutable)
  'abandoned'       -- cancelled / replaced before bind
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  owner_player_id uuid not null references public.players (id),
  game public.game_id not null,
  purpose public.photo_purpose not null,
  status public.photo_status not null default 'pending_upload',
  bucket_id text not null default 'game-photos',
  storage_path text not null,
  mime_type text not null,
  byte_size integer not null,
  width integer not null,
  height integer not null,
  original_filename text,
  bound_submission_id uuid references public.submissions (id) on delete set null,
  created_at timestamptz not null default now(),
  staged_at_utc timestamptz,
  bound_at_utc timestamptz,
  abandoned_at_utc timestamptz,
  constraint photos_storage_path_unique unique (storage_path),
  constraint photos_byte_size_positive check (byte_size > 0 and byte_size <= 5242880),
  constraint photos_dims_positive check (width > 0 and height > 0 and width <= 8000 and height <= 8000),
  constraint photos_mime_allowed check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint photos_path_owned check (
    storage_path like (owner_player_id::text || '/' || game::text || '/' || id::text || '.%')
  ),
  constraint photos_bound_consistency check (
    (status = 'bound' and bound_submission_id is not null and bound_at_utc is not null)
    or (status is distinct from 'bound' and bound_submission_id is null)
  ),
  constraint photos_staged_consistency check (
    (status in ('staged', 'bound') and staged_at_utc is not null)
    or (status in ('pending_upload', 'abandoned'))
  ),
  constraint photos_no_fixture_path check (
    storage_path not like 'development-only/%'
  )
);

create index photos_owner_status_idx on public.photos (owner_player_id, status, created_at desc);
create index photos_game_status_idx on public.photos (game, status);

comment on table public.photos is
  'Player photo ledger. Staging path alone is not proof; status=staged requires verified Storage object. Bound photos are immutable.';

alter table public.photos enable row level security;
alter table public.photos force row level security;

revoke all on table public.photos from anon, authenticated;
grant select on table public.photos to authenticated;
grant select, insert, update, delete on table public.photos to service_role;

create policy photos_select_own
  on public.photos for select to authenticated
  using (owner_player_id = public.current_player_id());

-- No direct client writes — only via security-definer RPCs.
revoke insert, update, delete on table public.photos from authenticated;

-- ---------------------------------------------------------------------------
-- Private Storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'game-photos',
  'game-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Helper: map auth.uid → player id for storage policies
create or replace function public.storage_current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.current_player_id();
$$;

revoke all on function public.storage_current_player_id() from public;
grant execute on function public.storage_current_player_id() to authenticated, service_role;

-- Drop prior policies if re-applied in local reset edge cases
drop policy if exists game_photos_insert_own on storage.objects;
drop policy if exists game_photos_select_own on storage.objects;
drop policy if exists game_photos_update_own_unbound on storage.objects;
drop policy if exists game_photos_delete_own_unbound on storage.objects;

create policy game_photos_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'game-photos'
    and public.storage_current_player_id() is not null
    and (storage.foldername(name))[1] = public.storage_current_player_id()::text
    and name not like 'development-only/%'
    and exists (
      select 1 from public.photos p
      where p.owner_player_id = public.storage_current_player_id()
        and p.storage_path = name
        and p.status = 'pending_upload'
    )
  );

create policy game_photos_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'game-photos'
    and public.storage_current_player_id() is not null
    and (storage.foldername(name))[1] = public.storage_current_player_id()::text
  );

-- Allow replace only while pending (retry before confirm). Bound/staged objects stay.
create policy game_photos_update_own_unbound
  on storage.objects for update to authenticated
  using (
    bucket_id = 'game-photos'
    and public.storage_current_player_id() is not null
    and (storage.foldername(name))[1] = public.storage_current_player_id()::text
    and exists (
      select 1 from public.photos p
      where p.storage_path = name
        and p.owner_player_id = public.storage_current_player_id()
        and p.status = 'pending_upload'
    )
  )
  with check (
    bucket_id = 'game-photos'
    and (storage.foldername(name))[1] = public.storage_current_player_id()::text
  );

create policy game_photos_delete_own_unbound
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'game-photos'
    and public.storage_current_player_id() is not null
    and (storage.foldername(name))[1] = public.storage_current_player_id()::text
    and exists (
      select 1 from public.photos p
      where p.storage_path = name
        and p.owner_player_id = public.storage_current_player_id()
        and p.status in ('pending_upload', 'staged', 'abandoned')
        and p.status is distinct from 'bound'
    )
  );

-- ---------------------------------------------------------------------------
-- Player RPCs
-- ---------------------------------------------------------------------------
create or replace function public.begin_photo_upload(
  p_game public.game_id,
  p_purpose public.photo_purpose,
  p_mime_type text,
  p_byte_size integer,
  p_width integer,
  p_height integer,
  p_original_filename text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_id uuid := gen_random_uuid();
  v_ext text;
  v_path text;
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

  v_ext := case p_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    else 'webp'
  end;
  v_path := v_player::text || '/' || p_game::text || '/' || v_id::text || '.' || v_ext;

  insert into public.photos (
    id, owner_player_id, game, purpose, status, storage_path,
    mime_type, byte_size, width, height, original_filename
  ) values (
    v_id, v_player, p_game, p_purpose, 'pending_upload', v_path,
    p_mime_type, p_byte_size, p_width, p_height,
    left(nullif(trim(coalesce(p_original_filename, '')), ''), 200)
  );

  return jsonb_build_object(
    'ok', true,
    'photo_id', v_id,
    'bucket', 'game-photos',
    'storage_path', v_path,
    'status', 'pending_upload'
  );
end;
$$;

revoke all on function public.begin_photo_upload(public.game_id, public.photo_purpose, text, integer, integer, integer, text) from public;
grant execute on function public.begin_photo_upload(public.game_id, public.photo_purpose, text, integer, integer, integer, text) to authenticated;

create or replace function public.confirm_photo_upload(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_photo public.photos%rowtype;
  v_obj storage.objects%rowtype;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_photo_id is null then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_ID_REQUIRED');
  end if;

  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found or v_photo.owner_player_id is distinct from v_player then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;

  if v_photo.status = 'staged' then
    return jsonb_build_object(
      'ok', true,
      'photo_id', v_photo.id,
      'storage_path', v_photo.storage_path,
      'status', 'staged',
      'idempotent_replay', true
    );
  end if;

  if v_photo.status = 'bound' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_ALREADY_BOUND');
  end if;
  if v_photo.status = 'abandoned' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_ABANDONED');
  end if;

  select * into v_obj
  from storage.objects
  where bucket_id = v_photo.bucket_id
    and name = v_photo.storage_path;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'STORAGE_OBJECT_MISSING',
      'message', 'Upload the photo before confirming.'
    );
  end if;

  if v_obj.metadata is not null
     and (v_obj.metadata->>'mimetype') is not null
     and (v_obj.metadata->>'mimetype') is distinct from v_photo.mime_type then
    return jsonb_build_object('ok', false, 'code', 'MIME_MISMATCH');
  end if;

  update public.photos
  set status = 'staged',
      staged_at_utc = clock_timestamp(),
      byte_size = coalesce((v_obj.metadata->>'size')::integer, byte_size)
  where id = v_photo.id;

  return jsonb_build_object(
    'ok', true,
    'photo_id', v_photo.id,
    'storage_path', v_photo.storage_path,
    'bucket', v_photo.bucket_id,
    'status', 'staged',
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.confirm_photo_upload(uuid) from public;
grant execute on function public.confirm_photo_upload(uuid) to authenticated;

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
    return jsonb_build_object('ok', true, 'status', 'abandoned', 'idempotent_replay', true);
  end if;

  update public.photos
  set status = 'abandoned', abandoned_at_utc = clock_timestamp()
  where id = v_photo.id;

  delete from storage.objects
  where bucket_id = v_photo.bucket_id
    and name = v_photo.storage_path;

  return jsonb_build_object('ok', true, 'photo_id', v_photo.id, 'status', 'abandoned');
end;
$$;

revoke all on function public.abandon_photo_upload(uuid) from public;
grant execute on function public.abandon_photo_upload(uuid) to authenticated;

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
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_photo from public.photos where id = p_photo_id;
  if not found or v_photo.owner_player_id is distinct from v_player then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;
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
    'staged_at_utc', v_photo.staged_at_utc
  );
end;
$$;

revoke all on function public.get_my_photo(uuid) from public;
grant execute on function public.get_my_photo(uuid) to authenticated;

-- Future submit RPCs: verify staged ownership/game. Reject fixture paths & unbound forgeries.
create or replace function public.verify_staged_photo_for_submit(
  p_photo_id uuid,
  p_player_id uuid,
  p_game public.game_id,
  p_purpose public.photo_purpose,
  p_required boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_photo public.photos%rowtype;
  v_obj_exists boolean;
begin
  if p_photo_id is null then
    if p_required then
      return jsonb_build_object('ok', false, 'code', 'PHOTO_REQUIRED');
    end if;
    return jsonb_build_object('ok', true, 'photo_id', null, 'optional_absent', true);
  end if;

  select * into v_photo from public.photos where id = p_photo_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;
  if v_photo.owner_player_id is distinct from p_player_id then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_OWNERSHIP');
  end if;
  if v_photo.game is distinct from p_game or v_photo.purpose is distinct from p_purpose then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_CONTEXT_MISMATCH');
  end if;
  if v_photo.storage_path like 'development-only/%' then
    return jsonb_build_object('ok', false, 'code', 'FIXTURE_PHOTO_REJECTED');
  end if;
  if v_photo.status = 'bound' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_ALREADY_BOUND');
  end if;
  if v_photo.status is distinct from 'staged' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_STAGED');
  end if;

  select exists (
    select 1 from storage.objects o
    where o.bucket_id = v_photo.bucket_id and o.name = v_photo.storage_path
  ) into v_obj_exists;

  if not v_obj_exists then
    return jsonb_build_object('ok', false, 'code', 'STORAGE_OBJECT_MISSING');
  end if;

  return jsonb_build_object(
    'ok', true,
    'photo_id', v_photo.id,
    'storage_path', v_photo.storage_path,
    'bucket', v_photo.bucket_id,
    'mime_type', v_photo.mime_type,
    'width', v_photo.width,
    'height', v_photo.height,
    'byte_size', v_photo.byte_size
  );
end;
$$;

revoke all on function public.verify_staged_photo_for_submit(uuid, uuid, public.game_id, public.photo_purpose, boolean) from public;
grant execute on function public.verify_staged_photo_for_submit(uuid, uuid, public.game_id, public.photo_purpose, boolean) to service_role;

-- Guard: bound photos cannot change storage_path / owner / status back to pending.
create or replace function public.photos_protect_bound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'bound' then
    if new.storage_path is distinct from old.storage_path
       or new.owner_player_id is distinct from old.owner_player_id
       or new.bucket_id is distinct from old.bucket_id
       or new.status is distinct from 'bound'
       or new.bound_submission_id is distinct from old.bound_submission_id then
      raise exception 'PHOTO_BOUND_IMMUTABLE' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists photos_protect_bound_trg on public.photos;
create trigger photos_protect_bound_trg
  before update on public.photos
  for each row execute function public.photos_protect_bound();

comment on function public.begin_photo_upload(public.game_id, public.photo_purpose, text, integer, integer, integer, text) is
  'Reserve a private staging path under the caller player id. Upload must land at that exact path before confirm.';
comment on function public.confirm_photo_upload(uuid) is
  'Mark a photo staged only after the Storage object is verifiably present.';
comment on function public.verify_staged_photo_for_submit(uuid, uuid, public.game_id, public.photo_purpose, boolean) is
  'Service-role helper for future submit RPCs. Rejects missing, unowned, fixture, or unbound references.';
