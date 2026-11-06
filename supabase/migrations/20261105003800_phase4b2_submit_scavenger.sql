-- Phase 4B2: atomic submit_scavenger + photo bind + challenge reads unlock.
-- Authority: Tech Spec §7.2–7.4, Game Rules §4, UX §6.2–6.3.

-- One bound photo per submission (and vice versa for non-null refs).
create unique index if not exists photos_bound_submission_uidx
  on public.photos (bound_submission_id)
  where bound_submission_id is not null;

create or replace function public.shipit_scavenger_fingerprint(p_payload jsonb)
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

revoke all on function public.shipit_scavenger_fingerprint(jsonb) from public;
grant execute on function public.shipit_scavenger_fingerprint(jsonb) to service_role;

-- Internal verify+lock for bind. Not granted to authenticated.
create or replace function public.shipit_lock_staged_photo_for_bind(
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
  if v_photo.game is distinct from 'shipit' or v_photo.purpose is distinct from p_purpose then
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
    'bucket', v_photo.bucket_id,
    'mime_type', v_photo.mime_type,
    'width', v_photo.width,
    'height', v_photo.height,
    'byte_size', v_photo.byte_size
  );
end;
$$;

revoke all on function public.shipit_lock_staged_photo_for_bind(uuid, uuid, public.photo_purpose) from public;
grant execute on function public.shipit_lock_staged_photo_for_bind(uuid, uuid, public.photo_purpose) to service_role;

create or replace function public.shipit_submit_scavenger_core(
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
  v_team uuid;
  v_team_name text;
  v_life jsonb;
  v_cruise uuid;
  v_day integer;
  v_challenge public.scavenger_challenges%rowtype;
  v_photo_lock jsonb;
  v_gallery_id uuid;
  v_submission_id uuid;
  v_completion_id uuid;
  v_result jsonb;
  v_lock_key bigint;
begin
  if p_payload ? 'points' or p_payload ? 'score' or p_payload ? 'team_id'
     or p_payload ? 'author_player_id' or p_payload ? 'player_id'
     or p_payload ? 'received_at_utc' or p_payload ? 'ship_day'
     or p_payload ? 'awarded_points' or p_payload ? 'is_admin' then
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

  v_fp := public.shipit_scavenger_fingerprint(p_payload);
  v_hash := v_fp->>'hash';

  -- Per-author idempotency lock (Drink It! pattern).
  perform pg_advisory_xact_lock(hashtext('shipit-submit:' || p_player_id::text));

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
    -- Replay before finale/team revalidation.
    return coalesce(v_existing.result_json, '{}'::jsonb)
      || jsonb_build_object('idempotent_replay', true);
  end if;

  select tm.team_id, t.name into v_team, v_team_name
  from public.team_memberships tm
  join public.teams t on t.id = tm.team_id
  where tm.player_id = p_player_id
    and tm.active_to is null
  limit 1;

  if v_team is null then
    return jsonb_build_object('ok', false, 'code', 'TEAM_REQUIRED');
  end if;

  if not exists (
    select 1 from public.game_memberships gm
    where gm.player_id = p_player_id and gm.game = 'shipit' and gm.enabled is true
  ) then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;

  perform public.ensure_finale_latched(p_received_at_utc);
  v_life := public.shipit_lifecycle_at(p_received_at_utc);
  if coalesce((v_life->>'accepting_submissions')::boolean, false) is not true then
    if v_life->>'status' in ('finale', 'post_cruise') then
      return jsonb_build_object('ok', false, 'code', 'GAME_ENDED');
    end if;
    return jsonb_build_object(
      'ok', false,
      'code', 'UNAVAILABLE',
      'lifecycle', v_life->>'status'
    );
  end if;

  v_cruise := (v_life->>'cruise_config_id')::uuid;
  v_day := nullif(v_life->>'cruise_day', '')::integer;
  if v_cruise is null or v_day is null then
    return jsonb_build_object('ok', false, 'code', 'UNAVAILABLE', 'reason', 'no_cruise_day');
  end if;

  select * into v_challenge
  from public.scavenger_challenges
  where id = v_challenge_id and enabled is true;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'CHALLENGE_NOT_FOUND');
  end if;
  if v_challenge.photo_required is not true then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_REQUIRED');
  end if;

  -- Team+challenge lock serializes teammates; EXISTS is authoritative after lock.
  v_lock_key := hashtext('shipit-challenge:' || v_team::text || ':' || v_challenge_id::text);
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1 from public.scavenger_completions sc
    where sc.team_id = v_team
      and sc.challenge_id = v_challenge_id
      and sc.status = 'active'
      and sc.cruise_config_id = v_cruise
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'TEAM_CHALLENGE_DONE',
      'message', 'Your team already completed this.'
    );
  end if;

  v_photo_lock := public.shipit_lock_staged_photo_for_bind(v_photo_id, p_player_id, 'scavenger');
  if coalesce((v_photo_lock->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(v_photo_lock->>'code', 'PHOTO_INVALID'),
      'message', 'A valid staged scavenger photo is required.'
    );
  end if;

  -- All writes in one subtransaction so unique_violation rolls them back together.
  begin
    insert into public.gallery_events (game, owner_player_id, kind, submission_id, created_at_utc, active)
    values ('shipit', p_player_id, 'scavenger', null, p_received_at_utc, true)
    returning id into v_gallery_id;

    insert into public.submissions (
      author_player_id, idempotency_key, game, kind, cruise_config_id, team_id,
      received_at_utc, ship_day, status, caption, photo_storage_key,
      request_payload_hash, request_payload_json, result_json, display_snapshot_json,
      gallery_event_id
    ) values (
      p_player_id, v_key, 'shipit', 'scavenger_completion', v_cruise, v_team,
      p_received_at_utc, v_day, 'accepted', v_caption, v_photo_lock->>'storage_path',
      v_hash, v_fp->'canonical', '{}'::jsonb,
      jsonb_build_object(
        'challenge_id', v_challenge.id,
        'challenge_canonical_key', v_challenge.canonical_key,
        'title', v_challenge.title,
        'category', v_challenge.category,
        'team_id', v_team,
        'team_name', v_team_name,
        'points', v_challenge.points,
        'photo_id', v_photo_id
      ),
      v_gallery_id
    )
    returning id into v_submission_id;

    update public.gallery_events
    set submission_id = v_submission_id
    where id = v_gallery_id;

    insert into public.scavenger_completions (
      team_id, challenge_id, submitting_player_id, submission_id, cruise_config_id,
      points, status, challenge_canonical_key, category, title_snapshot, instructions_snapshot,
      completed_at_utc
    ) values (
      v_team, v_challenge.id, p_player_id, v_submission_id, v_cruise,
      v_challenge.points, 'active', v_challenge.canonical_key, v_challenge.category,
      v_challenge.title, v_challenge.instructions, p_received_at_utc
    )
    returning id into v_completion_id;

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
      'completion_id', v_completion_id,
      'gallery_event_id', v_gallery_id,
      'challenge_id', v_challenge.id,
      'challenge_canonical_key', v_challenge.canonical_key,
      'team_id', v_team,
      'team_name', v_team_name,
      'awarded_points', v_challenge.points,
      'category', v_challenge.category,
      'photo_id', v_photo_id,
      'received_at_utc', p_received_at_utc,
      'ship_day', v_day,
      'claimed_categories', jsonb_build_array(v_challenge.category),
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
        'code', 'TEAM_CHALLENGE_DONE',
        'message', 'Your team already completed this.'
      );
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'code', SQLERRM);
  end;

  return v_result;
end;
$$;

revoke all on function public.shipit_submit_scavenger_core(uuid, jsonb, timestamptz) from public;
grant execute on function public.shipit_submit_scavenger_core(uuid, jsonb, timestamptz) to service_role;

create or replace function public.submit_scavenger(p_payload jsonb)
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
  if not public.has_game('shipit') then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;
  return public.shipit_submit_scavenger_core(v_player, p_payload, clock_timestamp());
end;
$$;

revoke all on function public.submit_scavenger(jsonb) from public;
grant execute on function public.submit_scavenger(jsonb) to authenticated;

-- Timed helper for integration tests (service role).
create or replace function public.dev_submit_scavenger_at(
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
  return public.shipit_submit_scavenger_core(p_player_id, p_payload, p_at_utc);
end;
$$;

revoke all on function public.dev_submit_scavenger_at(uuid, jsonb, timestamptz) from public;
grant execute on function public.dev_submit_scavenger_at(uuid, jsonb, timestamptz) to service_role;

-- Minimal authorized read for submitted-post stub (same-game members).
create or replace function public.get_my_shipit_submission(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_team uuid;
  v_sub public.submissions%rowtype;
  v_photo public.photos%rowtype;
  v_completion public.scavenger_completions%rowtype;
begin
  v_player := public.require_shipit_player();
  v_team := public.require_shipit_team_id();
  if p_submission_id is null then
    return jsonb_build_object('ok', false, 'code', 'SUBMISSION_REQUIRED');
  end if;

  select * into v_sub from public.submissions where id = p_submission_id;
  if not found or v_sub.game is distinct from 'shipit' then
    return jsonb_build_object('ok', false, 'code', 'SUBMISSION_NOT_FOUND');
  end if;
  -- Author or same team may view the stub post (not other teams' private details).
  if v_sub.author_player_id is distinct from v_player
     and (v_sub.team_id is distinct from v_team) then
    return jsonb_build_object('ok', false, 'code', 'SUBMISSION_NOT_FOUND');
  end if;

  select * into v_completion
  from public.scavenger_completions
  where submission_id = v_sub.id
  limit 1;

  select * into v_photo
  from public.photos
  where bound_submission_id = v_sub.id
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_sub.id,
    'caption', v_sub.caption,
    'received_at_utc', v_sub.received_at_utc,
    'result', v_sub.result_json,
    'display', v_sub.display_snapshot_json,
    'photo_id', v_photo.id,
    'photo_storage_path', v_photo.storage_path,
    'photo_bucket', v_photo.bucket_id,
    'completion_id', v_completion.id,
    'team_id', v_sub.team_id
  );
end;
$$;

revoke all on function public.get_my_shipit_submission(uuid) from public;
grant execute on function public.get_my_shipit_submission(uuid) to authenticated;

-- Signed URL helper: only for bound scavenger photos the caller's team may view.
create or replace function public.create_shipit_photo_signed_url(
  p_photo_id uuid,
  p_expires_seconds integer default 3600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_team uuid;
  v_photo public.photos%rowtype;
  v_sub public.submissions%rowtype;
begin
  v_player := public.require_shipit_player();
  v_team := public.require_shipit_team_id();
  if p_photo_id is null then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_REQUIRED');
  end if;

  select * into v_photo from public.photos where id = p_photo_id;
  if not found or v_photo.game is distinct from 'shipit' or v_photo.status is distinct from 'bound' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;

  select * into v_sub from public.submissions where id = v_photo.bound_submission_id;
  if not found or v_sub.team_id is distinct from v_team then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;

  -- Client uses Storage createSignedUrl with the path after authorization check.
  -- Returning path only; actual signing stays in Storage API with RLS/select.
  -- Expand select policy for bound same-team photos via this gate's path disclosure
  -- is insufficient alone — add a narrow storage select below.
  return jsonb_build_object(
    'ok', true,
    'bucket', v_photo.bucket_id,
    'storage_path', v_photo.storage_path,
    'expires_in', greatest(60, least(coalesce(p_expires_seconds, 3600), 86400))
  );
end;
$$;

revoke all on function public.create_shipit_photo_signed_url(uuid, integer) from public;
grant execute on function public.create_shipit_photo_signed_url(uuid, integer) to authenticated;

-- Allow select of bound scavenger objects for teammates (same team as bound submission).
drop policy if exists game_photos_select_shipit_teammate_bound on storage.objects;
create policy game_photos_select_shipit_teammate_bound
  on storage.objects for select to authenticated
  using (
    bucket_id = 'game-photos'
    and public.storage_current_player_id() is not null
    and exists (
      select 1
      from public.photos p
      join public.submissions s on s.id = p.bound_submission_id
      where p.storage_path = name
        and p.status = 'bound'
        and p.game = 'shipit'
        and s.team_id = public.current_team_id()
    )
  );

comment on function public.submit_scavenger(jsonb) is
  'Atomic Ship It! scavenger submit: verify staged photo, bind, team-once completion, gallery event.';
