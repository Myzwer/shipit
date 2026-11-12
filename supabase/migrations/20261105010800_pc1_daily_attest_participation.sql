-- PC1: Daily Challenge honor-system participation acknowledgment.
-- New accepted claims require attest_participation = true.
-- Historical accepted submissions remain replayable with their original fingerprint
-- (legacy hash omits attest_participation when the key is absent).

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
  v_attest jsonb;
begin
  v_key := nullif(trim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_canonical := jsonb_build_object(
    'idempotency_key', v_key,
    'challenge_id', nullif(trim(coalesce(p_payload->>'challenge_id', '')), ''),
    'photo_id', nullif(trim(coalesce(p_payload->>'photo_id', '')), ''),
    'caption', nullif(trim(coalesce(p_payload->>'caption', '')), '')
  );

  -- Include attest only when present so pre-PC1 hashes still match on replay.
  if p_payload ? 'attest_participation' then
    v_attest := p_payload->'attest_participation';
    if jsonb_typeof(v_attest) = 'boolean' then
      v_canonical := v_canonical || jsonb_build_object('attest_participation', v_attest);
    elsif lower(trim(coalesce(v_attest #>> '{}', ''))) = 'true' then
      v_canonical := v_canonical || jsonb_build_object('attest_participation', true);
    elsif lower(trim(coalesce(v_attest #>> '{}', ''))) = 'false' then
      v_canonical := v_canonical || jsonb_build_object('attest_participation', false);
    else
      v_canonical := v_canonical || jsonb_build_object('attest_participation', false);
    end if;
  end if;

  v_hash := public.drinkit_canonical_request_hash(v_canonical);
  return jsonb_build_object('canonical', v_canonical, 'hash', v_hash);
end;
$$;

comment on function public.drinkit_daily_fingerprint(jsonb) is
  'Daily Challenge request fingerprint. attest_participation is hashed only when present '
  'so historical accepted claims remain idempotent without the field.';

revoke all on function public.drinkit_daily_fingerprint(jsonb) from public;
grant execute on function public.drinkit_daily_fingerprint(jsonb) to service_role;

create or replace function public.drinkit_parse_attest_participation(p_payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_raw jsonb;
begin
  if p_payload is null or not (p_payload ? 'attest_participation') then
    return false;
  end if;
  v_raw := p_payload->'attest_participation';
  if jsonb_typeof(v_raw) = 'boolean' then
    return (v_raw #>> '{}')::boolean;
  end if;
  return lower(trim(coalesce(v_raw #>> '{}', ''))) = 'true';
end;
$$;

revoke all on function public.drinkit_parse_attest_participation(jsonb) from public;
grant execute on function public.drinkit_parse_attest_participation(jsonb) to service_role;

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
  v_attest boolean;
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
  v_attest := public.drinkit_parse_attest_participation(p_payload);

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
    -- Replay before pause/finale/attestation revalidation (preserves historical accepts).
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
    v_points := 50;
  else
    v_points := v_challenge.points;
  end if;

  -- Honor acknowledgment required for NEW accepts only (not historical replay).
  if v_attest is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'ATTEST_PARTICIPATION_REQUIRED',
      'message', case
        when v_challenge.participation_mode = 'bring_a_friend' then
          'Confirm you completed this challenge with another Drink It! player.'
        else
          'Confirm you attended and participated in today''s scheduled meetup.'
      end,
      'participation_mode', v_challenge.participation_mode
    );
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
        'participation_mode', v_challenge.participation_mode,
        'attest_participation', true,
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
        'participation_mode', v_challenge.participation_mode,
        'attest_participation', true,
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
      'participation_mode', v_challenge.participation_mode,
      'attest_participation', true,
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
