-- Phase 4B3: Daily Home claimed state + submission read includes photo.

create or replace function public.get_my_current_daily_challenge()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_life jsonb;
  v_config public.cruise_config%rowtype;
  v_row public.daily_challenges%rowtype;
  v_day integer;
  v_claim public.bounty_claims%rowtype;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  v_life := public.drinkit_lifecycle_at(now());
  if v_life->>'status' is distinct from 'open' then
    return jsonb_build_object(
      'status', coalesce(v_life->>'status', 'unavailable'),
      'reason', v_life->>'reason',
      'cruise_day', (v_life->>'cruise_day')::int
    );
  end if;

  v_day := (v_life->>'cruise_day')::int;
  select * into v_config from public.cruise_config where is_active limit 1;

  select * into v_claim
  from public.bounty_claims
  where player_id = v_me
    and cruise_config_id = v_config.id
    and game_day = v_day
    and category = 'daily'
    and status = 'active'
  limit 1;

  if found then
    select * into v_row from public.daily_challenges where id = v_claim.daily_challenge_id;
    return jsonb_build_object(
      'status', 'already_claimed',
      'reason', 'category_used_today',
      'cruise_day', v_day,
      'challenge_id', v_claim.daily_challenge_id,
      'title', coalesce(v_row.title, v_claim.offer_snapshot_json->>'title'),
      'points', v_claim.points,
      'submission_id', v_claim.submission_id,
      'public_end_utc', v_life->>'public_end_utc'
    );
  end if;

  select * into v_row from public.daily_challenges
  where cruise_config_id = v_config.id and day_number = v_day;

  if not found then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'no_daily_assignment',
      'cruise_day', v_day
    );
  end if;

  return jsonb_build_object(
    'status', 'active',
    'challenge_id', v_row.id,
    'cruise_day', v_day,
    'title', v_row.title,
    'instructions', v_row.instructions,
    'location_name', v_row.location_name,
    'meeting_time_ship_local', v_row.meeting_time_ship_local,
    'is_all_hands', v_row.is_all_hands,
    'photo_required', v_row.photo_required,
    'points', v_row.points,
    'public_end_utc', v_life->>'public_end_utc'
  );
end;
$$;

create or replace function public.dev_get_current_daily_challenge_at(p_at_utc timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_life jsonb;
  v_row public.daily_challenges%rowtype;
  v_day integer;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found or v_config.label is distinct from 'development-only' then
    raise exception 'DEV_BOUNTY_SIM_FORBIDDEN' using errcode = '42501';
  end if;

  v_life := public.drinkit_lifecycle_at(p_at_utc);
  if v_life->>'status' is distinct from 'open' then
    return jsonb_build_object(
      'status', coalesce(v_life->>'status', 'unavailable'),
      'reason', v_life->>'reason',
      'cruise_day', (v_life->>'cruise_day')::int
    );
  end if;
  v_day := (v_life->>'cruise_day')::int;
  select * into v_row from public.daily_challenges
  where cruise_config_id = v_config.id and day_number = v_day;
  if not found then
    return jsonb_build_object('status', 'unavailable', 'reason', 'no_daily_assignment', 'cruise_day', v_day);
  end if;
  return jsonb_build_object(
    'status', 'active',
    'challenge_id', v_row.id,
    'cruise_day', v_day,
    'title', v_row.title,
    'instructions', v_row.instructions,
    'location_name', v_row.location_name,
    'meeting_time_ship_local', v_row.meeting_time_ship_local,
    'is_all_hands', v_row.is_all_hands,
    'photo_required', v_row.photo_required,
    'points', v_row.points,
    'public_end_utc', v_life->>'public_end_utc'
  );
end;
$$;

create or replace function public.get_my_drink_submission(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_sub public.submissions%rowtype;
  v_photo_id uuid;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;
  if p_submission_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select * into v_sub
  from public.submissions
  where id = p_submission_id
    and author_player_id = v_me
    and game = 'drinkit';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select p.id into v_photo_id
  from public.photos p
  where p.bound_submission_id = v_sub.id
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_sub.id,
    'kind', v_sub.kind,
    'received_at_utc', v_sub.received_at_utc,
    'ship_day', v_sub.ship_day,
    'caption', v_sub.caption,
    'display', v_sub.display_snapshot_json,
    'result', v_sub.result_json,
    'gallery_event_id', v_sub.gallery_event_id,
    'photo_id', v_photo_id
  );
end;
$$;

-- Authorize own bound Drink It! photo path for signed URL (Storage still enforces).
create or replace function public.create_drinkit_photo_signed_url(
  p_photo_id uuid,
  p_expires_seconds integer default 3600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_photo public.photos%rowtype;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game('drinkit') then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;
  if p_photo_id is null then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_REQUIRED');
  end if;

  select * into v_photo from public.photos where id = p_photo_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;
  if v_photo.owner_player_id is distinct from v_me then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_OWNERSHIP');
  end if;
  if v_photo.game is distinct from 'drinkit' or v_photo.status is distinct from 'bound' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_AVAILABLE');
  end if;

  return jsonb_build_object(
    'ok', true,
    'bucket', v_photo.bucket_id,
    'storage_path', v_photo.storage_path,
    'expires_in', greatest(60, least(coalesce(p_expires_seconds, 3600), 86400))
  );
end;
$$;

revoke all on function public.create_drinkit_photo_signed_url(uuid, integer) from public;
grant execute on function public.create_drinkit_photo_signed_url(uuid, integer) to authenticated;
