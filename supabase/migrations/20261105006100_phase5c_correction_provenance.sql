-- Phase 5C Gate 2: independent ingredient correction provenance.
-- Independent support = a successful drink_log that awarded Ingredient and
-- persisted a confirm for that exact offering_id + ingredient_id
-- (drinkit_persist_ingredient_correction). No extra player questions.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
alter table public.ingredient_corrections
  add column if not exists inactive_cause text;

alter table public.ingredient_corrections
  drop constraint if exists ingredient_corrections_inactive_cause_check;

alter table public.ingredient_corrections
  add constraint ingredient_corrections_inactive_cause_check check (
    inactive_cause is null
    or inactive_cause in ('admin', 'no_valid_sources')
  );

comment on column public.ingredient_corrections.inactive_cause is
  'null when active; admin = organizer suppression (never auto-reactivate); no_valid_sources = automatic after last valid provenance removed.';

-- Backfill inactive_cause for existing deactivated rows.
update public.ingredient_corrections
set inactive_cause = case
  when deactivated_by_player_id is not null then 'admin'
  else 'no_valid_sources'
end
where active is false
  and inactive_cause is null;

create table public.ingredient_correction_sources (
  correction_id uuid not null references public.ingredient_corrections (id) on delete cascade,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  created_at_utc timestamptz not null default clock_timestamp(),
  valid boolean not null default true,
  invalidated_at_utc timestamptz,
  primary key (correction_id, submission_id),
  constraint ingredient_correction_sources_invalid_fields check (
    (valid is true and invalidated_at_utc is null)
    or (valid is false and invalidated_at_utc is not null)
  )
);

comment on table public.ingredient_correction_sources is
  'Phase 5C: independently supporting submissions for a shared offering+ingredient correction. One row per submission.';

create index ingredient_correction_sources_submission_idx
  on public.ingredient_correction_sources (submission_id);

create index ingredient_correction_sources_valid_idx
  on public.ingredient_correction_sources (correction_id)
  where valid is true;

alter table public.ingredient_correction_sources enable row level security;
alter table public.ingredient_correction_sources force row level security;

revoke all on table public.ingredient_correction_sources from anon, authenticated;
grant select on table public.ingredient_correction_sources to authenticated;
grant select, insert, update, delete on table public.ingredient_correction_sources to service_role;

-- Players may read sources for corrections they confirmed; admins all.
create policy ingredient_correction_sources_select
  on public.ingredient_correction_sources for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.ingredient_corrections ic
      where ic.id = correction_id
        and ic.confirmed_by_player_id = public.current_player_id()
    )
  );

-- Backfill proven sources only (no fabrication).
insert into public.ingredient_correction_sources (correction_id, submission_id, valid, invalidated_at_utc)
select
  ic.id,
  ic.source_submission_id,
  (s.status = 'accepted'),
  case
    when s.status = 'accepted' then null::timestamptz
    else coalesce(s.voided_at_utc, clock_timestamp())
  end
from public.ingredient_corrections ic
join public.submissions s on s.id = ic.source_submission_id
where ic.source_submission_id is not null
on conflict (correction_id, submission_id) do nothing;

-- Additional proven support: accepted drink_logs whose result references the correction
-- and awarded an Ingredient claim for the same offering.
insert into public.ingredient_correction_sources (correction_id, submission_id, valid, invalidated_at_utc)
select distinct
  ic.id,
  s.id,
  true,
  null::timestamptz
from public.ingredient_corrections ic
join public.submissions s
  on s.status = 'accepted'
 and s.kind = 'drink_log'
 and (s.result_json->>'ingredient_correction_id') = ic.id::text
join public.drink_logs dl
  on dl.submission_id = s.id
 and dl.offering_id = ic.offering_id
join public.bounty_claims bc
  on bc.submission_id = s.id
 and bc.category = 'ingredient'
where not exists (
  select 1 from public.ingredient_correction_sources ics
  where ics.correction_id = ic.id and ics.submission_id = s.id
)
on conflict (correction_id, submission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Reactivation gate: block only Admin suppression
-- ---------------------------------------------------------------------------
create or replace function public.ingredient_corrections_block_reactivation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.active is false
     and new.active is true then
    if coalesce(old.inactive_cause, 'admin') = 'admin'
       or old.deactivated_by_player_id is not null then
      new.active := false;
      new.deactivated_at_utc := old.deactivated_at_utc;
      new.deactivated_by_player_id := old.deactivated_by_player_id;
      new.deactivation_note := old.deactivation_note;
      new.inactive_cause := coalesce(old.inactive_cause, 'admin');
      new.confirmed_by_player_id := old.confirmed_by_player_id;
      new.source_submission_id := old.source_submission_id;
    end if;
    -- inactive_cause = no_valid_sources may reactivate when new support arrives.
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Persist correction + provenance source (atomic with successful Ingredient award)
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_persist_ingredient_correction(
  p_offering_id uuid,
  p_ingredient_id uuid,
  p_player_id uuid,
  p_submission_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_row public.ingredient_corrections%rowtype;
begin
  if p_offering_id is null or p_ingredient_id is null or p_player_id is null or p_submission_id is null then
    return null;
  end if;

  select * into v_row
  from public.ingredient_corrections
  where offering_id = p_offering_id
    and ingredient_id = p_ingredient_id
  for update;

  if found then
    v_id := v_row.id;
    if v_row.active is false and coalesce(v_row.inactive_cause, 'admin') = 'admin' then
      -- Admin-suppressed: never reactivate; still do not attach source that implies eligibility.
      return null;
    end if;

    if v_row.active is false and v_row.inactive_cause = 'no_valid_sources' then
      update public.ingredient_corrections
      set active = true,
          deactivated_at_utc = null,
          deactivated_by_player_id = null,
          deactivation_note = null,
          inactive_cause = null,
          confirmed_by_player_id = coalesce(confirmed_by_player_id, p_player_id),
          source_submission_id = coalesce(source_submission_id, p_submission_id)
      where id = v_id;
    elsif v_row.active is true then
      update public.ingredient_corrections
      set confirmed_by_player_id = coalesce(confirmed_by_player_id, p_player_id),
          source_submission_id = coalesce(source_submission_id, p_submission_id)
      where id = v_id;
    end if;
  else
    insert into public.ingredient_corrections (
      offering_id, ingredient_id, confirmed_by_player_id, source_submission_id, active, inactive_cause
    ) values (
      p_offering_id, p_ingredient_id, p_player_id, p_submission_id, true, null
    )
    returning id into v_id;
  end if;

  insert into public.ingredient_correction_sources (
    correction_id, submission_id, valid, invalidated_at_utc
  ) values (
    v_id, p_submission_id, true, null
  )
  on conflict (correction_id, submission_id) do update
    set valid = true,
        invalidated_at_utc = null
    where public.ingredient_correction_sources.valid is false;

  return v_id;
end;
$$;

revoke all on function public.drinkit_persist_ingredient_correction(uuid, uuid, uuid, uuid) from public;
grant execute on function public.drinkit_persist_ingredient_correction(uuid, uuid, uuid, uuid) to service_role;

comment on function public.drinkit_persist_ingredient_correction(uuid, uuid, uuid, uuid) is
  'Phase 5C: upsert correction + provenance source. Never reactivates admin-suppressed rows. Idempotent per submission.';

-- ---------------------------------------------------------------------------
-- Invalidate one submission's support; deactivate only when no valid sources remain
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_invalidate_correction_sources(
  p_submission_id uuid,
  p_actor_id uuid default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_deactivated uuid[] := array[]::uuid[];
  v_corr uuid;
  v_remaining integer;
  v_cause text;
begin
  if p_submission_id is null then
    return v_deactivated;
  end if;

  update public.ingredient_correction_sources
  set valid = false,
      invalidated_at_utc = v_now
  where submission_id = p_submission_id
    and valid is true;

  for v_corr in
    select distinct correction_id
    from public.ingredient_correction_sources
    where submission_id = p_submission_id
  loop
    select inactive_cause into v_cause
    from public.ingredient_corrections
    where id = v_corr;

    if coalesce(v_cause, '') = 'admin' then
      continue; -- leave admin-suppressed alone
    end if;

    select count(*)::integer into v_remaining
    from public.ingredient_correction_sources
    where correction_id = v_corr
      and valid is true;

    if v_remaining = 0 then
      update public.ingredient_corrections
      set active = false,
          deactivated_at_utc = v_now,
          deactivated_by_player_id = null,
          deactivation_note = 'no_valid_sources',
          inactive_cause = 'no_valid_sources'
      where id = v_corr
        and active is true
        and coalesce(inactive_cause, '') is distinct from 'admin';

      if found then
        v_deactivated := array_append(v_deactivated, v_corr);
      end if;
    end if;
  end loop;

  return v_deactivated;
end;
$$;

revoke all on function public.drinkit_invalidate_correction_sources(uuid, uuid) from public;
grant execute on function public.drinkit_invalidate_correction_sources(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Admin deactivate sets inactive_cause = admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_deactivate_ingredient_correction(
  p_correction_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_row public.ingredient_corrections%rowtype;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_row from public.ingredient_corrections where id = p_correction_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  perform public.write_admin_audit(
    'ingredient_correction.deactivate',
    v_me,
    'ingredient_corrections',
    v_row.id::text,
    jsonb_build_object(
      'offering_id', v_row.offering_id,
      'ingredient_id', v_row.ingredient_id,
      'active', v_row.active,
      'inactive_cause', v_row.inactive_cause
    ),
    jsonb_build_object(
      'offering_id', v_row.offering_id,
      'ingredient_id', v_row.ingredient_id,
      'active', false,
      'inactive_cause', 'admin',
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  );

  update public.ingredient_corrections
  set
    active = false,
    deactivated_at_utc = clock_timestamp(),
    deactivated_by_player_id = v_me,
    deactivation_note = nullif(trim(coalesce(p_note, '')), ''),
    inactive_cause = 'admin'
  where id = p_correction_id
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'correction_id', v_row.id,
    'offering_id', v_row.offering_id,
    'ingredient_id', v_row.ingredient_id,
    'active', v_row.active,
    'inactive_cause', v_row.inactive_cause
  );
end;
$$;

revoke all on function public.admin_deactivate_ingredient_correction(uuid, text) from public;
grant execute on function public.admin_deactivate_ingredient_correction(uuid, text) to authenticated;

-- Void uses provenance invalidation
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

    v_correction_ids := public.drinkit_invalidate_correction_sources(v_sub.id, v_actor);
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


revoke all on function public.admin_void_submission(uuid, uuid, text, text) from public;
grant execute on function public.admin_void_submission(uuid, uuid, text, text) to authenticated;
