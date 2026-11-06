-- Phase 5B: Admin Void preview + atomic void RPC + photo/gallery privacy after void.

create or replace function public.admin_preview_void_submission(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub public.submissions%rowtype;
  v_claims jsonb := '[]'::jsonb;
  v_completion public.scavenger_completions%rowtype;
  v_has_completion boolean := false;
  v_points integer := 0;
  v_permitted boolean := false;
  v_block text := null;
  v_owner_name text;
  v_team_name text;
  v_photo_id uuid;
  v_event_id uuid;
  v_event_active boolean;
  v_correction_ids uuid[] := array[]::uuid[];
  v_cfg public.cruise_config;
  v_off integer;
  v_finale_at timestamptz;
  v_gc public.game_control%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_submission_id is null then
    return jsonb_build_object('ok', false, 'code', 'SUBMISSION_REQUIRED');
  end if;

  select * into v_sub from public.submissions where id = p_submission_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'SUBMISSION_NOT_FOUND');
  end if;

  select p.display_name into v_owner_name from public.players p where p.id = v_sub.author_player_id;
  if v_sub.team_id is not null then
    select t.name into v_team_name from public.teams t where t.id = v_sub.team_id;
  end if;

  select ph.id into v_photo_id
  from public.photos ph
  where ph.bound_submission_id = v_sub.id and ph.status = 'bound'
  limit 1;

  select ge.id, ge.active into v_event_id, v_event_active
  from public.gallery_events ge
  where ge.submission_id = v_sub.id
  order by ge.created_at_utc desc
  limit 1;

  if v_sub.kind in ('drink_log', 'daily_completion') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'claim_id', bc.id,
      'player_id', bc.player_id,
      'player_name', p.display_name,
      'category', bc.category::text,
      'points', bc.points,
      'status', bc.status::text,
      'game_day', bc.game_day
    ) order by bc.created_at), '[]'::jsonb)
    into v_claims
    from public.bounty_claims bc
    left join public.players p on p.id = bc.player_id
    where bc.submission_id = v_sub.id;

    select coalesce(sum(bc.points), 0)::integer into v_points
    from public.bounty_claims bc
    where bc.submission_id = v_sub.id and bc.status = 'active';

    select coalesce(array_agg(ic.id), array[]::uuid[])
    into v_correction_ids
    from public.ingredient_corrections ic
    where ic.source_submission_id = v_sub.id and ic.active is true;
  elsif v_sub.kind = 'scavenger_completion' then
    select * into v_completion
    from public.scavenger_completions
    where submission_id = v_sub.id
    order by created_at desc
    limit 1;
    v_has_completion := found;
    if v_has_completion and v_completion.status = 'active' then
      v_points := v_completion.points;
    end if;
  end if;

  perform public.ensure_finale_latched(v_now);
  v_cfg := public.active_cruise_config();
  select * into v_gc from public.game_control where game = v_sub.game;
  if v_cfg is not null then
    v_off := public.clock_offset_at(v_cfg.id, v_cfg.base_ship_offset_minutes, v_now);
    v_finale_at := public.ship_local_to_utc(
      ((v_cfg.day1_ship_date + (v_cfg.final_day - 1)) + time '18:00')::timestamp,
      v_off
    );
  end if;

  if v_sub.status = 'voided' then
    v_permitted := false;
    v_block := 'ALREADY_VOIDED';
  elsif coalesce(v_gc.finalized_at_utc is not null, false)
        or (v_finale_at is not null and v_now >= v_finale_at) then
    v_permitted := false;
    v_block := 'FINALE_LOCKED';
  elsif v_sub.status is distinct from 'accepted' then
    v_permitted := false;
    v_block := 'NOT_ACCEPTED';
  else
    v_permitted := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_sub.id,
    'game', v_sub.game,
    'kind', v_sub.kind,
    'status', v_sub.status,
    'expected_status', v_sub.status,
    'owner_player_id', v_sub.author_player_id,
    'owner_player_name', v_owner_name,
    'owner_team_id', v_sub.team_id,
    'owner_team_name', v_team_name,
    'received_at_utc', v_sub.received_at_utc,
    'ship_day', v_sub.ship_day,
    'caption', v_sub.caption,
    'display', coalesce(v_sub.display_snapshot_json, '{}'::jsonb),
    'points_active', v_points,
    'claims', coalesce(v_claims, '[]'::jsonb),
    'scavenger_completion', case
      when v_has_completion then jsonb_build_object(
        'completion_id', v_completion.id,
        'challenge_id', v_completion.challenge_id,
        'challenge_key', v_completion.challenge_canonical_key,
        'title', v_completion.title_snapshot,
        'points', v_completion.points,
        'status', v_completion.status,
        'team_id', v_completion.team_id
      )
      else null
    end,
    'gallery_event_id', v_event_id,
    'gallery_event_active', v_event_active,
    'photo_id', v_photo_id,
    'ingredient_correction_ids', to_jsonb(v_correction_ids),
    'void_permitted', v_permitted,
    'void_block_code', v_block,
    'consequences', jsonb_build_object(
      'deactivate_claims', v_sub.kind in ('drink_log', 'daily_completion'),
      'deactivate_completion', v_sub.kind = 'scavenger_completion',
      'reopen_challenge', v_sub.kind = 'scavenger_completion',
      'suppress_gallery', true,
      'preserve_photo_audit', true,
      'achievement_recompute', 'deferred_until_achievements_phase'
    )
  );
end;
$$;

revoke all on function public.admin_preview_void_submission(uuid) from public;
grant execute on function public.admin_preview_void_submission(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reconcile lookup
-- ---------------------------------------------------------------------------
create or replace function public.admin_find_void_request_by_id(p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_void_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    return null;
  end if;

  select * into v_row
  from public.admin_void_requests
  where client_request_id = p_client_request_id;

  if not found then
    return null;
  end if;

  return coalesce(v_row.result_json, '{}'::jsonb) || jsonb_build_object(
    'client_request_id', v_row.client_request_id,
    'fingerprint', v_row.fingerprint,
    'submission_id', v_row.submission_id,
    'idempotent_replay', true,
    'received_at_utc', v_row.received_at_utc,
    'completed_at_utc', v_row.completed_at_utc
  );
end;
$$;

revoke all on function public.admin_find_void_request_by_id(uuid) from public;
grant execute on function public.admin_find_void_request_by_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic void
-- ---------------------------------------------------------------------------
create or replace function public.admin_void_submission(
  p_client_request_id uuid,
  p_submission_id uuid,
  p_expected_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_player_id();
  v_fp text;
  v_existing public.admin_void_requests%rowtype;
  v_sub public.submissions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_cfg public.cruise_config;
  v_off integer;
  v_finale_at timestamptz;
  v_gc public.game_control%rowtype;
  v_expected text := lower(trim(coalesce(p_expected_status, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_claims_voided integer := 0;
  v_points_removed integer := 0;
  v_completion_id uuid;
  v_challenge_id uuid;
  v_team_id uuid;
  v_correction_ids uuid[] := array[]::uuid[];
  v_result jsonb;
  v_before jsonb;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_ID');
  end if;
  if p_submission_id is null then
    return jsonb_build_object('ok', false, 'code', 'SUBMISSION_REQUIRED');
  end if;
  if v_expected = '' then
    return jsonb_build_object('ok', false, 'code', 'EXPECTED_STATUS_REQUIRED');
  end if;

  v_fp := public.admin_void_fingerprint(p_submission_id, v_expected);

  -- Serialize same request UUID and same submission voids.
  perform pg_advisory_xact_lock(
    hashtext('admin_void_request'),
    hashtext(p_client_request_id::text)
  );
  perform pg_advisory_xact_lock(
    hashtext('admin_void_submission'),
    hashtext(p_submission_id::text)
  );

  select * into v_existing
  from public.admin_void_requests
  where client_request_id = p_client_request_id;

  if found then
    if v_existing.fingerprint is distinct from v_fp then
      return jsonb_build_object(
        'ok', false,
        'code', 'REQUEST_ID_OPERATION_MISMATCH',
        'message', 'Same request id was used for a different void operation'
      );
    end if;
    return coalesce(v_existing.result_json, '{}'::jsonb) || jsonb_build_object(
      'idempotent_replay', true,
      'client_request_id', p_client_request_id,
      'received_at_utc', v_existing.received_at_utc,
      'completed_at_utc', v_existing.completed_at_utc
    );
  end if;

  perform public.ensure_finale_latched(v_now);
  v_cfg := public.active_cruise_config();
  if v_cfg is not null then
    v_off := public.clock_offset_at(v_cfg.id, v_cfg.base_ship_offset_minutes, v_now);
    v_finale_at := public.ship_local_to_utc(
      ((v_cfg.day1_ship_date + (v_cfg.final_day - 1)) + time '18:00')::timestamp,
      v_off
    );
  end if;

  select * into v_sub
  from public.submissions
  where id = p_submission_id
  for update;

  if not found then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'SUBMISSION_NOT_FOUND',
      'client_request_id', p_client_request_id
    );
    insert into public.admin_void_requests (
      client_request_id, fingerprint, submission_id, expected_status, reason,
      actor_id, cruise_config_id, result_json, received_at_utc
    ) values (
      p_client_request_id, v_fp, p_submission_id, v_expected, v_reason,
      v_actor, case when v_cfg is not null then v_cfg.id else null end, v_result, v_now
    );
    return v_result;
  end if;

  select * into v_gc from public.game_control where game = v_sub.game for update;

  if coalesce(v_gc.finalized_at_utc is not null, false)
     or (v_finale_at is not null and v_now >= v_finale_at) then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'FINALE_LOCKED',
      'message', 'Submissions cannot be changed after the games end.',
      'client_request_id', p_client_request_id,
      'submission_id', v_sub.id
    );
    insert into public.admin_void_requests (
      client_request_id, fingerprint, submission_id, expected_status, reason,
      actor_id, cruise_config_id, result_json, received_at_utc
    ) values (
      p_client_request_id, v_fp, v_sub.id, v_expected, v_reason,
      v_actor, v_sub.cruise_config_id, v_result, v_now
    );
    return v_result;
  end if;

  -- Stale expected-state: caller believed accepted but record moved (or wrong id target).
  if v_sub.status::text is distinct from v_expected then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'STALE_EXPECTED_STATE',
      'message', 'Submission state changed. Refresh and try again.',
      'client_request_id', p_client_request_id,
      'submission_id', v_sub.id,
      'current_status', v_sub.status
    );
    insert into public.admin_void_requests (
      client_request_id, fingerprint, submission_id, expected_status, reason,
      actor_id, cruise_config_id, result_json, received_at_utc
    ) values (
      p_client_request_id, v_fp, v_sub.id, v_expected, v_reason,
      v_actor, v_sub.cruise_config_id, v_result, v_now
    );
    return v_result;
  end if;

  if v_sub.status = 'voided' then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'ALREADY_VOIDED',
      'client_request_id', p_client_request_id,
      'submission_id', v_sub.id
    );
    insert into public.admin_void_requests (
      client_request_id, fingerprint, submission_id, expected_status, reason,
      actor_id, cruise_config_id, result_json, received_at_utc
    ) values (
      p_client_request_id, v_fp, v_sub.id, v_expected, v_reason,
      v_actor, v_sub.cruise_config_id, v_result, v_now
    );
    return v_result;
  end if;

  if v_sub.status is distinct from 'accepted' then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'NOT_ACCEPTED',
      'client_request_id', p_client_request_id,
      'submission_id', v_sub.id
    );
    insert into public.admin_void_requests (
      client_request_id, fingerprint, submission_id, expected_status, reason,
      actor_id, cruise_config_id, result_json, received_at_utc
    ) values (
      p_client_request_id, v_fp, v_sub.id, v_expected, v_reason,
      v_actor, v_sub.cruise_config_id, v_result, v_now
    );
    return v_result;
  end if;

  v_before := jsonb_build_object(
    'submission_id', v_sub.id,
    'status', v_sub.status,
    'kind', v_sub.kind,
    'game', v_sub.game
  );

  -- Drink It! / Daily: void claims belonging to this submission only.
  if v_sub.kind in ('drink_log', 'daily_completion') then
    select coalesce(sum(bc.points), 0)::integer, count(*)::integer
      into v_points_removed, v_claims_voided
    from public.bounty_claims bc
    where bc.submission_id = v_sub.id and bc.status = 'active';

    update public.bounty_claims
    set status = 'voided',
        voided_at_utc = v_now,
        voided_by_player_id = v_actor
    where submission_id = v_sub.id
      and status = 'active';

    -- Ingredient corrections: deactivate only when this submission is the recorded source.
    -- LIMITATION: schema stores a single source_submission_id per offering+ingredient;
    -- independently supporting submissions are not multi-tracked. Smallest future fix:
    -- ingredient_correction_sources(correction_id, submission_id) junction.
    update public.ingredient_corrections
    set active = false,
        deactivated_at_utc = v_now,
        deactivated_by_player_id = v_actor,
        deactivation_note = coalesce(v_reason, 'voided source submission')
    where source_submission_id = v_sub.id
      and active is true;

    select coalesce(array_agg(ic.id), array[]::uuid[])
    into v_correction_ids
    from public.ingredient_corrections ic
    where ic.source_submission_id = v_sub.id
      and ic.active is false
      and ic.deactivated_at_utc = v_now
      and ic.deactivated_by_player_id = v_actor;
  end if;

  -- Ship It!: void completion (reopens challenge via unique active index).
  if v_sub.kind = 'scavenger_completion' then
    update public.scavenger_completions
    set status = 'voided',
        voided_at_utc = v_now,
        voided_by_player_id = v_actor
    where submission_id = v_sub.id
      and status = 'active'
    returning id, challenge_id, team_id, points
      into v_completion_id, v_challenge_id, v_team_id, v_points_removed;
  end if;

  -- Suppress Gallery activity (preserve row + reactions for audit; not public).
  update public.gallery_events
  set active = false
  where submission_id = v_sub.id
    and active is true;

  -- Soft-void submission; enrich result_json so UUID retries surface voided status.
  update public.submissions
  set status = 'voided',
      voided_at_utc = v_now,
      voided_by_player_id = v_actor,
      void_reason = v_reason,
      result_json = coalesce(result_json, '{}'::jsonb) || jsonb_build_object(
        'voided', true,
        'submission_status', 'voided',
        'voided_at_utc', v_now
      )
  where id = v_sub.id;

  -- Bound photos remain bound for audit; access policies require accepted+active.

  perform public.achievement_on_void_submission(v_sub.id);

  v_result := jsonb_build_object(
    'ok', true,
    'voided', true,
    'client_request_id', p_client_request_id,
    'submission_id', v_sub.id,
    'game', v_sub.game,
    'kind', v_sub.kind,
    'points_removed', coalesce(v_points_removed, 0),
    'claims_voided', coalesce(v_claims_voided, 0),
    'completion_id', v_completion_id,
    'challenge_id', v_challenge_id,
    'team_id', coalesce(v_team_id, v_sub.team_id),
    'ingredient_corrections_deactivated', to_jsonb(coalesce(v_correction_ids, array[]::uuid[])),
    'voided_at_utc', v_now,
    'achievement_boundary', 'deferred_until_achievements_phase'
  );

  insert into public.admin_void_requests (
    client_request_id, fingerprint, submission_id, expected_status, reason,
    actor_id, cruise_config_id, result_json, received_at_utc
  ) values (
    p_client_request_id, v_fp, v_sub.id, v_expected, v_reason,
    v_actor, v_sub.cruise_config_id, v_result, v_now
  );

  insert into public.admin_audit_log (
    action, actor_id, target_type, target_id, before_json, after_json
  ) values (
    'submission.void',
    v_actor,
    'submissions',
    v_sub.id::text,
    v_before,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.admin_void_submission(uuid, uuid, text, text) from public;
grant execute on function public.admin_void_submission(uuid, uuid, text, text) to authenticated;

comment on function public.admin_void_submission(uuid, uuid, text, text) is
  'Phase 5B: organizer soft-void of an accepted submission before Friday 6 PM. Idempotent by client_request_id.';

-- ---------------------------------------------------------------------------
-- Photo / storage: require accepted bound submission (voided denied to members)
-- ---------------------------------------------------------------------------
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
  v_sub public.submissions%rowtype;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game('drinkit') and not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;
  if p_photo_id is null then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_REQUIRED');
  end if;

  select * into v_photo from public.photos where id = p_photo_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;
  if v_photo.game is distinct from 'drinkit' or v_photo.status is distinct from 'bound' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_AVAILABLE');
  end if;
  if v_photo.storage_path like 'development-only/%' then
    return jsonb_build_object('ok', false, 'code', 'FIXTURE_PHOTO_REJECTED');
  end if;

  if v_photo.bound_submission_id is null then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_AVAILABLE');
  end if;
  select * into v_sub from public.submissions where id = v_photo.bound_submission_id;
  if not found or v_sub.status is distinct from 'accepted' then
    -- Admins may still inspect for audit via service role / separate path; member Gallery denied.
    if not public.is_admin() then
      return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_AVAILABLE');
    end if;
  end if;
  if not exists (
    select 1 from public.gallery_events ge
    where ge.submission_id = v_photo.bound_submission_id
      and ge.active is true
  ) and not public.is_admin() then
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
  v_me uuid := public.current_player_id();
  v_photo public.photos%rowtype;
  v_sub public.submissions%rowtype;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game('shipit') and not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;
  if p_photo_id is null then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_REQUIRED');
  end if;

  select * into v_photo from public.photos where id = p_photo_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;
  if v_photo.game is distinct from 'shipit' or v_photo.status is distinct from 'bound' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_AVAILABLE');
  end if;
  if v_photo.storage_path like 'development-only/%' then
    return jsonb_build_object('ok', false, 'code', 'FIXTURE_PHOTO_REJECTED');
  end if;

  if v_photo.bound_submission_id is null then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_AVAILABLE');
  end if;
  select * into v_sub from public.submissions where id = v_photo.bound_submission_id;
  if not found or v_sub.status is distinct from 'accepted' then
    if not public.is_admin() then
      return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_AVAILABLE');
    end if;
  end if;
  if not exists (
    select 1 from public.gallery_events ge
    where ge.submission_id = v_photo.bound_submission_id
      and ge.active is true
  ) and not public.is_admin() then
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

create or replace function public.storage_can_read_drinkit_bound_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.storage_current_player_id() is not null
    and (
      public.is_admin()
      or (
        public.has_game('drinkit')
        and exists (
          select 1
          from public.photos p
          join public.submissions s on s.id = p.bound_submission_id and s.status = 'accepted'
          join public.gallery_events ge
            on ge.submission_id = s.id and ge.active is true
          where p.storage_path = p_storage_path
            and p.status = 'bound'
            and p.game = 'drinkit'
        )
      )
    );
$$;

create or replace function public.storage_can_read_shipit_bound_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.storage_current_player_id() is not null
    and (
      public.is_admin()
      or (
        public.has_game('shipit')
        and exists (
          select 1
          from public.photos p
          join public.submissions s on s.id = p.bound_submission_id and s.status = 'accepted'
          join public.gallery_events ge
            on ge.submission_id = s.id and ge.active is true
          where p.storage_path = p_storage_path
            and p.status = 'bound'
            and p.game = 'shipit'
        )
      )
    );
$$;

comment on function public.storage_can_read_drinkit_bound_object(text) is
  'Phase 5B: bound Drink It! reads require accepted submission + active gallery event. Previously issued signed URLs may remain usable until expiry.';

comment on function public.storage_can_read_shipit_bound_object(text) is
  'Phase 5B: bound Ship It! reads require accepted submission + active gallery event. Previously issued signed URLs may remain usable until expiry.';

-- Submitted-post reads: surface voided status; do not expose as public Gallery activity.
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
  v_event_active boolean;
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

  select ge.active into v_event_active
  from public.gallery_events ge
  where ge.submission_id = v_sub.id
  order by ge.created_at_utc desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_sub.id,
    'kind', v_sub.kind,
    'status', v_sub.status,
    'voided', v_sub.status = 'voided',
    'received_at_utc', v_sub.received_at_utc,
    'ship_day', v_sub.ship_day,
    'caption', v_sub.caption,
    'display', v_sub.display_snapshot_json,
    'result', v_sub.result_json,
    'gallery_event_id', v_sub.gallery_event_id,
    'gallery_event_active', coalesce(v_event_active, false),
    'photo_id', case when v_sub.status = 'accepted' and coalesce(v_event_active, false) then v_photo_id else null end
  );
end;
$$;

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
  v_has_photo boolean := false;
  v_has_completion boolean := false;
  v_event_active boolean;
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
  if v_sub.author_player_id is distinct from v_player
     and (v_sub.team_id is distinct from v_team) then
    return jsonb_build_object('ok', false, 'code', 'SUBMISSION_NOT_FOUND');
  end if;

  select * into v_completion
  from public.scavenger_completions
  where submission_id = v_sub.id
  limit 1;
  v_has_completion := found;

  select * into v_photo
  from public.photos
  where bound_submission_id = v_sub.id
  limit 1;
  v_has_photo := found;

  select ge.active into v_event_active
  from public.gallery_events ge
  where ge.submission_id = v_sub.id
  order by ge.created_at_utc desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_sub.id,
    'status', v_sub.status,
    'voided', v_sub.status = 'voided',
    'caption', v_sub.caption,
    'received_at_utc', v_sub.received_at_utc,
    'result', v_sub.result_json,
    'display', v_sub.display_snapshot_json,
    'photo_id', case
      when v_sub.status = 'accepted' and coalesce(v_event_active, false) and v_has_photo then v_photo.id
      else null
    end,
    'photo_storage_path', case
      when v_sub.status = 'accepted' and coalesce(v_event_active, false) and v_has_photo then v_photo.storage_path
      else null
    end,
    'photo_bucket', case
      when v_sub.status = 'accepted' and coalesce(v_event_active, false) and v_has_photo then v_photo.bucket_id
      else null
    end,
    'completion_id', case when v_has_completion then v_completion.id else null end,
    'completion_status', case when v_has_completion then v_completion.status else null end,
    'gallery_event_active', coalesce(v_event_active, false),
    'team_id', v_sub.team_id
  );
end;
$$;

-- Unread: only active events with accepted submissions.
create or replace function public.get_gallery_unread(p_game public.game_id)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_cursor public.read_cursors%rowtype;
  v_latest public.gallery_events%rowtype;
  v_has boolean := false;
  v_has_cursor boolean := false;
begin
  v_me := public.gallery_require_game(p_game);

  select * into v_cursor
  from public.read_cursors
  where player_id = v_me
    and game = p_game
    and scope = 'gallery_everyone';
  v_has_cursor := found;

  select ge.* into v_latest
  from public.gallery_events ge
  join public.submissions s on s.id = ge.submission_id and s.status = 'accepted'
  where ge.game = p_game
    and ge.active
    and ge.kind in ('drink_log', 'daily', 'scavenger')
    and ge.owner_player_id is distinct from v_me
  order by ge.created_at_utc desc, ge.id desc
  limit 1;

  if found then
    if not v_has_cursor or v_cursor.last_seen_event_id is null then
      v_has := true;
    elsif (v_latest.created_at_utc, v_latest.id)
          > (coalesce(v_cursor.last_seen_at_utc, '-infinity'::timestamptz), v_cursor.last_seen_event_id)
    then
      v_has := true;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'game', p_game,
    'has_unread', v_has,
    'latest_other_event_id', v_latest.id,
    'latest_other_created_at_utc', v_latest.created_at_utc
  );
end;
$$;
