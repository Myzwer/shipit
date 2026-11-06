-- Phase 5C Gate 1: Admin Void fingerprint includes normalized reason (v2).
-- Legacy Phase 5B fingerprints (no reason) remain replayable when the stored
-- reason column still matches the retry payload.

create or replace function public.admin_void_fingerprint(
  p_submission_id uuid,
  p_expected_status text,
  p_reason text default null
)
returns text
language sql
immutable
as $$
  select 'void_submission:v2:'
    || p_submission_id::text
    || ':'
    || lower(trim(coalesce(p_expected_status, '')))
    || ':'
    || coalesce(lower(trim(p_reason)), '');
$$;

-- Keep 2-arg overload for any callers; delegates to v2 with empty reason.
create or replace function public.admin_void_fingerprint(
  p_submission_id uuid,
  p_expected_status text
)
returns text
language sql
immutable
as $$
  select public.admin_void_fingerprint(p_submission_id, p_expected_status, null);
$$;

revoke all on function public.admin_void_fingerprint(uuid, text) from public;
revoke all on function public.admin_void_fingerprint(uuid, text, text) from public;
grant execute on function public.admin_void_fingerprint(uuid, text) to authenticated;
grant execute on function public.admin_void_fingerprint(uuid, text, text) to authenticated;

create or replace function public.admin_void_fingerprint_legacy_v1(
  p_submission_id uuid,
  p_expected_status text
)
returns text
language sql
immutable
as $$
  select 'void_submission:'
    || p_submission_id::text
    || ':'
    || lower(trim(coalesce(p_expected_status, '')));
$$;

revoke all on function public.admin_void_fingerprint_legacy_v1(uuid, text) from public;
grant execute on function public.admin_void_fingerprint_legacy_v1(uuid, text) to authenticated;

comment on function public.admin_void_fingerprint(uuid, text, text) is
  'Phase 5C v2 void request identity: submission + expected status + normalized reason.';

-- Replace void RPC fingerprint check (body otherwise unchanged from 059).
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
  v_fp_legacy text;
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
  v_legacy_match boolean := false;
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

  v_fp := public.admin_void_fingerprint(p_submission_id, v_expected, v_reason);
  v_fp_legacy := public.admin_void_fingerprint_legacy_v1(p_submission_id, v_expected);

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
    if v_existing.fingerprint = v_fp then
      null; -- exact v2 match
    elsif v_existing.fingerprint = v_fp_legacy then
      -- Phase 5B legacy: reason was not in fingerprint; compare stored reason column.
      if coalesce(nullif(trim(coalesce(v_existing.reason, '')), ''), '')
         is distinct from coalesce(v_reason, '') then
        return jsonb_build_object(
          'ok', false,
          'code', 'REQUEST_ID_OPERATION_MISMATCH',
          'message', 'Same request id was used for a different void operation'
        );
      end if;
      v_legacy_match := true;
    else
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
      'completed_at_utc', v_existing.completed_at_utc,
      'legacy_fingerprint_replay', v_legacy_match
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

    -- Interim single-source deactivate; replaced by provenance-aware path in 061.
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

  update public.gallery_events
  set active = false
  where submission_id = v_sub.id
    and active is true;

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
  'Phase 5C: Admin soft-void with v2 fingerprint (includes reason). Legacy v1 fingerprints reconcile via stored reason.';
