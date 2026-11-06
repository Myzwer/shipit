-- Phase 4B3: authenticated submit_daily — atomic Daily claim + photo bind.
-- Authority: Game Rules §2/§3.4, UX §3.2/§5, Tech Spec §7.

create or replace function public.drinkit_daily_fingerprint(p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text;
  v_canonical jsonb;
  v_hash text;
begin
  v_key := nullif(trim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_canonical := jsonb_build_object(
    'idempotency_key', v_key,
    'challenge_id', nullif(trim(coalesce(p_payload->>'challenge_id', '')), ''),
    'photo_id', nullif(trim(coalesce(p_payload->>'photo_id', '')), ''),
    'caption', nullif(trim(coalesce(p_payload->>'caption', '')), '')
  );
  v_hash := public.drinkit_canonical_request_hash(v_canonical);
  return jsonb_build_object('canonical', v_canonical, 'hash', v_hash);
end;
$$;

revoke all on function public.drinkit_daily_fingerprint(jsonb) from public;
grant execute on function public.drinkit_daily_fingerprint(jsonb) to service_role;

-- Internal verify+lock for Drink It! photo bind. Not granted to authenticated.
create or replace function public.drinkit_lock_staged_photo_for_bind(
  p_photo_id uuid,
  p_player_id uuid,
  p_purpose public.photo_purpose
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo public.photos%rowtype;
  v_obj_exists boolean;
begin
  if p_photo_id is null then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_REQUIRED');
  end if;

  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;
  if v_photo.owner_player_id is distinct from p_player_id then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_OWNERSHIP');
  end if;
  if v_photo.game is distinct from 'drinkit' or v_photo.purpose is distinct from p_purpose then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_CONTEXT_MISMATCH');
  end if;
  if v_photo.storage_path like 'development-only/%' then
    return jsonb_build_object('ok', false, 'code', 'FIXTURE_PHOTO_REJECTED');
  end if;
  if v_photo.status = 'bound' then
    return jsonb_build_object(
      'ok', false,
      'code', 'PHOTO_ALREADY_BOUND',
      'bound_submission_id', v_photo.bound_submission_id
    );
  end if;
  if v_photo.status is distinct from 'staged' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_STAGED', 'status', v_photo.status);
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
    'bucket', v_photo.bucket_id
  );
end;
$$;

revoke all on function public.drinkit_lock_staged_photo_for_bind(uuid, uuid, public.photo_purpose) from public;
grant execute on function public.drinkit_lock_staged_photo_for_bind(uuid, uuid, public.photo_purpose) to service_role;

create or replace function public.drinkit_submit_daily_core(
  p_player_id uuid,
  p_payload jsonb,
  p_received_at_utc timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key uuid;
  v_challenge_id uuid;
  v_photo_id uuid;
  v_caption text;
  v_fp jsonb;
  v_hash text;
  v_existing public.submissions%rowtype;
  v_life jsonb;
  v_cruise uuid;
  v_day integer;
  v_challenge public.daily_challenges%rowtype;
  v_photo_lock jsonb;
  v_gallery_id uuid;
  v_submission_id uuid;
  v_claim_id uuid;
  v_result jsonb;
  v_lock_key bigint;
  v_points integer := 50;
begin
  if p_payload ? 'points' or p_payload ? 'score' or p_payload ? 'team_id'
     or p_payload ? 'author_player_id' or p_payload ? 'player_id'
     or p_payload ? 'received_at_utc' or p_payload ? 'ship_day'
     or p_payload ? 'awarded_points' or p_payload ? 'game_day'
     or p_payload ? 'cruise_day' or p_payload ? 'is_admin' then
    return jsonb_build_object('ok', false, 'code', 'FORGED_FIELDS');
  end if;

  begin
    v_key := nullif(trim(coalesce(p_payload->>'idempotency_key', '')), '')::uuid;
  exception when others then
    v_key := null;
  end;
  if v_key is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_IDEMPOTENCY_KEY');
  end if;

  begin
    v_challenge_id := nullif(trim(coalesce(p_payload->>'challenge_id', '')), '')::uuid;
  exception when others then
    v_challenge_id := null;
  end;
  begin
    v_photo_id := nullif(trim(coalesce(p_payload->>'photo_id', '')), '')::uuid;
  exception when others then
    v_photo_id := null;
  end;
  v_caption := left(nullif(trim(coalesce(p_payload->>'caption', '')), ''), 500);

  if v_challenge_id is null then
    return jsonb_build_object('ok', false, 'code', 'CHALLENGE_REQUIRED');
  end if;
  if v_photo_id is null then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_REQUIRED');
  end if;

  v_fp := public.drinkit_daily_fingerprint(p_payload);
  v_hash := v_fp->>'hash';

  perform pg_advisory_xact_lock(hashtext('drinkit-daily-submit:' || p_player_id::text));

  select * into v_existing
  from public.submissions
  where author_player_id = p_player_id
    and idempotency_key = v_key
  for update;

  if found then
    if v_existing.request_payload_hash is distinct from v_hash then
      return jsonb_build_object(
        'ok', false,
        'code', 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        'message', 'Same idempotency key with a different payload'
      );
    end if;
    -- Replay before pause/finale/assignment revalidation.
    return coalesce(v_existing.result_json, '{}'::jsonb)
      || jsonb_build_object('idempotent_replay', true);
  end if;

  if not exists (
    select 1 from public.game_memberships gm
    where gm.player_id = p_player_id and gm.game = 'drinkit' and gm.enabled is true
  ) then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;

  perform public.ensure_finale_latched(p_received_at_utc);
  v_life := public.drinkit_lifecycle_at(p_received_at_utc);

  if v_life->>'status' = 'finale' then
    return jsonb_build_object('ok', false, 'code', 'GAME_ENDED', 'message', 'Drink It! is closed for the cruise.');
  end if;
  if v_life->>'status' = 'paused' then
    return jsonb_build_object('ok', false, 'code', 'GAME_PAUSED', 'message', 'Drink It! is paused');
  end if;
  if v_life->>'status' is distinct from 'open' then
    return jsonb_build_object(
      'ok', false,
      'code', 'UNAVAILABLE',
      'reason', coalesce(v_life->>'reason', v_life->>'status'),
      'lifecycle', v_life->>'status'
    );
  end if;

  v_cruise := (select id from public.cruise_config where is_active limit 1);
  v_day := nullif(v_life->>'cruise_day', '')::integer;
  if v_cruise is null or v_day is null then
    return jsonb_build_object('ok', false, 'code', 'UNAVAILABLE', 'reason', 'no_cruise_day');
  end if;

  select * into v_challenge
  from public.daily_challenges
  where id = v_challenge_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'CHALLENGE_NOT_FOUND');
  end if;
  if v_challenge.cruise_config_id is distinct from v_cruise then
    return jsonb_build_object('ok', false, 'code', 'CHALLENGE_WRONG_CRUISE');
  end if;
  if v_challenge.day_number is distinct from v_day then
    return jsonb_build_object(
      'ok', false,
      'code', 'CHALLENGE_NOT_TODAY',
      'message', 'Only today''s Daily Challenge can be claimed.'
    );
  end if;
  if v_challenge.photo_required is not true then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_REQUIRED');
  end if;
  if v_challenge.points is distinct from 50 then
    v_points := 50; -- server-authoritative; never trust row drift for award
  else
    v_points := v_challenge.points;
  end if;

  v_lock_key := hashtext(
    'drinkit-daily-claim:' || p_player_id::text || ':' || v_cruise::text || ':' || v_day::text
  );
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1 from public.bounty_claims bc
    where bc.player_id = p_player_id
      and bc.cruise_config_id = v_cruise
      and bc.game_day = v_day
      and bc.category = 'daily'
      and bc.status = 'active'
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'ALREADY_CLAIMED',
      'message', 'You''ve already completed today''s Daily Challenge.'
    );
  end if;

  v_photo_lock := public.drinkit_lock_staged_photo_for_bind(v_photo_id, p_player_id, 'daily');
  if coalesce((v_photo_lock->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(v_photo_lock->>'code', 'PHOTO_INVALID'),
      'message', 'A valid staged Daily Challenge photo is required.'
    );
  end if;

  begin
    insert into public.gallery_events (game, owner_player_id, kind, submission_id, created_at_utc, active)
    values ('drinkit', p_player_id, 'daily', null, p_received_at_utc, true)
    returning id into v_gallery_id;

    insert into public.submissions (
      author_player_id, idempotency_key, game, kind, cruise_config_id, team_id,
      received_at_utc, ship_day, status, caption, photo_storage_key,
      request_payload_hash, request_payload_json, result_json, display_snapshot_json,
      gallery_event_id
    ) values (
      p_player_id, v_key, 'drinkit', 'daily_completion', v_cruise, null,
      p_received_at_utc, v_day, 'accepted', v_caption, v_photo_lock->>'storage_path',
      v_hash, v_fp->'canonical', '{}'::jsonb,
      jsonb_build_object(
        'challenge_id', v_challenge.id,
        'title', v_challenge.title,
        'instructions', v_challenge.instructions,
        'location_name', v_challenge.location_name,
        'is_all_hands', v_challenge.is_all_hands,
        'points', v_points,
        'photo_id', v_photo_id,
        'kind', 'daily'
      ),
      v_gallery_id
    )
    returning id into v_submission_id;

    update public.gallery_events
    set submission_id = v_submission_id
    where id = v_gallery_id;

    insert into public.bounty_claims (
      submission_id, player_id, cruise_config_id, game_day, category,
      slot_id, offer_id, bar_assignment_id, daily_challenge_id,
      points, status, offer_snapshot_json, created_at
    ) values (
      v_submission_id, p_player_id, v_cruise, v_day, 'daily',
      null, null, null, v_challenge.id,
      v_points, 'active',
      jsonb_build_object(
        'challenge_id', v_challenge.id,
        'title', v_challenge.title,
        'day_number', v_challenge.day_number,
        'points', v_points
      ),
      p_received_at_utc
    )
    returning id into v_claim_id;

    update public.photos
    set status = 'bound',
        bound_submission_id = v_submission_id,
        bound_at_utc = clock_timestamp(),
        storage_cleanup_status = 'not_needed'
    where id = v_photo_id
      and status = 'staged';

    if not found then
      raise exception 'PHOTO_BIND_FAILED' using errcode = 'P0001';
    end if;

    v_result := jsonb_build_object(
      'ok', true,
      'code', 'ACCEPTED',
      'submission_id', v_submission_id,
      'claim_id', v_claim_id,
      'gallery_event_id', v_gallery_id,
      'challenge_id', v_challenge.id,
      'awarded_points', v_points,
      'category', 'daily',
      'photo_id', v_photo_id,
      'received_at_utc', p_received_at_utc,
      'ship_day', v_day,
      'claimed_categories', jsonb_build_array('daily'),
      'new_achievement_ids', '[]'::jsonb,
      'idempotent_replay', false
    );

    update public.submissions
    set result_json = v_result
    where id = v_submission_id;
  exception
    when unique_violation then
      return jsonb_build_object(
        'ok', false,
        'code', 'ALREADY_CLAIMED',
        'message', 'You''ve already completed today''s Daily Challenge.'
      );
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'code', SQLERRM);
  end;

  return v_result;
end;
$$;

revoke all on function public.drinkit_submit_daily_core(uuid, jsonb, timestamptz) from public;
grant execute on function public.drinkit_submit_daily_core(uuid, jsonb, timestamptz) to service_role;

create or replace function public.submit_daily(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game('drinkit') then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;
  return public.drinkit_submit_daily_core(v_player, p_payload, clock_timestamp());
end;
$$;

revoke all on function public.submit_daily(jsonb) from public;
grant execute on function public.submit_daily(jsonb) to authenticated;

create or replace function public.dev_submit_daily_at(
  p_player_id uuid,
  p_payload jsonb,
  p_at_utc timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  return public.drinkit_submit_daily_core(p_player_id, p_payload, p_at_utc);
end;
$$;

revoke all on function public.dev_submit_daily_at(uuid, jsonb, timestamptz) from public;
grant execute on function public.dev_submit_daily_at(uuid, jsonb, timestamptz) to service_role;

comment on function public.submit_daily(jsonb) is
  'Atomic Drink It! Daily Challenge submit: verify staged daily photo, bind, one claim/day, 50 points, gallery event.';
