-- Phase 7A: Award grant/revoke, exclusive firsts, void recompute, submit hooks.

create or replace function public.achievement_dev_cruise_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cruise_config
    where is_active and label = 'development-only'
  );
$$;

-- Read-only finale check (no latch). Safe for STABLE list RPCs.
create or replace function public.achievement_is_finale(p_at timestamptz default clock_timestamp())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg public.cruise_config%rowtype;
  v_finale timestamptz;
begin
  if exists (select 1 from public.game_control where finalized_at_utc is not null) then
    return true;
  end if;
  select * into v_cfg from public.cruise_config where is_active limit 1;
  if not found then
    return false;
  end if;
  begin
    v_finale := public.finale_at_utc(v_cfg, p_at);
  exception when others then
    return false;
  end;
  return v_finale is not null and p_at >= v_finale;
end;
$$;

-- Write-path freeze: latch game_control then report.
create or replace function public.achievement_finale_frozen(p_at timestamptz default clock_timestamp())
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.ensure_finale_latched(p_at);
end;
$$;

create or replace function public.achievement_cfg(p_def public.achievement_definitions)
returns jsonb
language sql
immutable
as $$
  select coalesce(p_def.condition_config, '{}'::jsonb)
    || jsonb_build_object('type', p_def.condition_type);
$$;

-- Earliest accepted submission that is plausible evidence for this owner+def.
-- Used for exclusive ordering and award source linkage.
create or replace function public.achievement_owner_earliest_evidence(
  p_game public.game_id,
  p_owner_player uuid,
  p_owner_team uuid
) returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_game = 'drinkit' then
    select s.id into v_id
    from public.submissions s
    where s.status = 'accepted'
      and s.game = 'drinkit'
      and s.author_player_id = p_owner_player
      and s.kind in ('drink_log', 'daily_completion')
    order by s.received_at_utc asc, s.id asc
    limit 1;
  else
    select s.id into v_id
    from public.submissions s
    where s.status = 'accepted'
      and s.game = 'shipit'
      and s.team_id = p_owner_team
      and s.kind = 'scavenger_completion'
    order by s.received_at_utc asc, s.id asc
    limit 1;
  end if;
  return v_id;
end;
$$;

create or replace function public.achievement_owner_latest_evidence(
  p_game public.game_id,
  p_owner_player uuid,
  p_owner_team uuid
) returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_game = 'drinkit' then
    select s.id into v_id
    from public.submissions s
    where s.status = 'accepted'
      and s.game = 'drinkit'
      and s.author_player_id = p_owner_player
      and s.kind in ('drink_log', 'daily_completion')
    order by s.received_at_utc desc, s.id desc
    limit 1;
  else
    select s.id into v_id
    from public.submissions s
    where s.status = 'accepted'
      and s.game = 'shipit'
      and s.team_id = p_owner_team
      and s.kind = 'scavenger_completion'
    order by s.received_at_utc desc, s.id desc
    limit 1;
  end if;
  return v_id;
end;
$$;

create or replace function public.achievement_owner_qualifies(
  p_def public.achievement_definitions,
  p_owner_player uuid,
  p_owner_team uuid,
  p_trigger_submission uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.achievement_eval_condition(
    public.achievement_cfg(p_def),
    p_def.game,
    p_owner_player,
    p_owner_team,
    p_trigger_submission,
    0
  );
end;
$$;

create or replace function public.achievement_revoke_award(
  p_award_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_award public.achievement_awards%rowtype;
begin
  select * into v_award
  from public.achievement_awards
  where id = p_award_id
  for update;
  if not found or v_award.status <> 'active' then
    return;
  end if;

  update public.achievement_awards
  set status = 'revoked',
      revoked_at_utc = clock_timestamp(),
      revoke_reason = left(coalesce(p_reason, 'recompute'), 200),
      exclusive_slot = false
  where id = p_award_id;

  if v_award.gallery_event_id is not null then
    update public.gallery_events
    set active = false
    where id = v_award.gallery_event_id;
  end if;
end;
$$;

create or replace function public.achievement_grant_award(
  p_def public.achievement_definitions,
  p_owner_player uuid,
  p_owner_team uuid,
  p_source_submission uuid,
  p_actor_player uuid,
  p_awarded_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_award_id uuid;
  v_gallery_id uuid;
  v_title text;
  v_desc text;
  v_existing uuid;
begin
  -- Shared: one active per owner. Exclusive: one active globally.
  if p_def.exclusive then
    select id into v_existing
    from public.achievement_awards
    where definition_id = p_def.id and status = 'active' and exclusive_slot
    for update;
    if v_existing is not null then
      return null;
    end if;
  else
    select id into v_existing
    from public.achievement_awards
    where definition_id = p_def.id
      and status = 'active'
      and (
        (p_owner_player is not null and owner_player_id = p_owner_player)
        or (p_owner_team is not null and owner_team_id = p_owner_team)
      )
    for update;
    if v_existing is not null then
      return null;
    end if;
  end if;

  v_title := p_def.title;
  v_desc := p_def.display_description;

  insert into public.achievement_awards (
    definition_id, owner_player_id, owner_team_id, status,
    source_submission_id, awarded_at_utc, evidence_json, exclusive_slot
  ) values (
    p_def.id,
    p_owner_player,
    p_owner_team,
    'active',
    p_source_submission,
    p_awarded_at,
    jsonb_build_object(
      'definition_stable_key', p_def.stable_key,
      'source_submission_id', p_source_submission,
      'actor_player_id', p_actor_player
    ),
    p_def.exclusive
  )
  returning id into v_award_id;

  insert into public.gallery_events (
    game, owner_player_id, owner_team_id, kind, submission_id,
    achievement_award_id, created_at_utc, active
  ) values (
    p_def.game,
    coalesce(p_owner_player, p_actor_player),
    p_owner_team,
    'achievement',
    p_source_submission,
    v_award_id,
    p_awarded_at,
    true
  )
  returning id into v_gallery_id;

  update public.achievement_awards
  set gallery_event_id = v_gallery_id
  where id = v_award_id;

  -- Compact display lives on the linked submission snapshot when present;
  -- achievement reads join definitions. Store title on evidence for feed.
  update public.achievement_awards
  set evidence_json = evidence_json || jsonb_build_object(
    'gallery_title', v_title,
    'gallery_description', v_desc,
    'secret', p_def.secret,
    'group_key', p_def.group_key,
    'icon_key', p_def.icon_key
  )
  where id = v_award_id;

  return v_award_id;
exception
  when unique_violation then
    return null;
end;
$$;

-- Exclusive: among all owners who currently qualify, pick earliest evidence.
create or replace function public.achievement_exclusive_winner_candidate(
  p_def public.achievement_definitions
) returns table (owner_player_id uuid, owner_team_id uuid, evidence_submission_id uuid, evidence_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_def.game = 'drinkit' then
    return query
    with candidates as (
      select pl.id as pid
      from public.players pl
      join public.game_memberships m on m.player_id = pl.id
      where m.game = 'drinkit' and m.enabled is true and pl.active is true
    ),
    qualified as (
      select
        c.pid,
        public.achievement_owner_earliest_evidence('drinkit', c.pid, null) as evid
      from candidates c
      where public.achievement_owner_qualifies(p_def, c.pid, null, null)
    )
    select q.pid, null::uuid, q.evid, s.received_at_utc
    from qualified q
    join public.submissions s on s.id = q.evid
    order by s.received_at_utc asc, s.id asc
    limit 1;
  else
    return query
    with candidates as (
      select t.id as tid
      from public.teams t
      where t.active is true
    ),
    qualified as (
      select
        c.tid,
        public.achievement_owner_earliest_evidence('shipit', null, c.tid) as evid
      from candidates c
      where public.achievement_owner_qualifies(p_def, null, c.tid, null)
    )
    select null::uuid, q.tid, q.evid, s.received_at_utc
    from qualified q
    join public.submissions s on s.id = q.evid
    order by s.received_at_utc asc, s.id asc
    limit 1;
  end if;
end;
$$;

create or replace function public.achievement_evaluate_for_owner(
  p_game public.game_id,
  p_owner_player uuid,
  p_owner_team uuid,
  p_trigger_submission uuid,
  p_actor_player uuid,
  p_at timestamptz,
  p_allow_grant boolean default true
) returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_def public.achievement_definitions%rowtype;
  v_new uuid[] := array[]::uuid[];
  v_award_id uuid;
  v_source uuid;
  v_cand record;
  v_include_test boolean;
begin
  if public.achievement_finale_frozen(p_at) then
    return v_new;
  end if;

  v_include_test := public.achievement_dev_cruise_active();

  for v_def in
    select *
    from public.achievement_definitions d
    where d.enabled
      and d.game = p_game
      and (not d.test_only or v_include_test)
    order by d.stable_key
    for update of d
  loop
    -- Advisory lock per definition for exclusive races
    perform pg_advisory_xact_lock(hashtext('achievement:' || v_def.id::text));

    if not public.achievement_owner_qualifies(
      v_def, p_owner_player, p_owner_team, p_trigger_submission
    ) then
      continue;
    end if;

    if v_def.exclusive then
      select * into v_cand
      from public.achievement_exclusive_winner_candidate(v_def);
      if not found then
        continue;
      end if;
      if p_game = 'drinkit' and v_cand.owner_player_id is distinct from p_owner_player then
        continue;
      end if;
      if p_game = 'shipit' and v_cand.owner_team_id is distinct from p_owner_team then
        continue;
      end if;
      v_source := coalesce(v_cand.evidence_submission_id, p_trigger_submission);
    else
      v_source := coalesce(
        p_trigger_submission,
        public.achievement_owner_latest_evidence(p_game, p_owner_player, p_owner_team)
      );
    end if;

    if not p_allow_grant then
      continue;
    end if;

    v_award_id := public.achievement_grant_award(
      v_def, p_owner_player, p_owner_team, v_source, p_actor_player, p_at
    );
    if v_award_id is not null then
      v_new := array_append(v_new, v_award_id);
    end if;
  end loop;

  return v_new;
end;
$$;

create or replace function public.achievement_evaluate_after_submit(
  p_submission_id uuid
) returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.submissions%rowtype;
begin
  select * into v_sub from public.submissions where id = p_submission_id;
  if not found or v_sub.status <> 'accepted' then
    return array[]::uuid[];
  end if;

  if v_sub.game = 'drinkit' then
    return public.achievement_evaluate_for_owner(
      'drinkit', v_sub.author_player_id, null, v_sub.id,
      v_sub.author_player_id, v_sub.received_at_utc, true
    );
  end if;

  return public.achievement_evaluate_for_owner(
    'shipit', null, v_sub.team_id, v_sub.id,
    v_sub.author_player_id, v_sub.received_at_utc, true
  );
end;
$$;

create or replace function public.achievement_finalize_submit_result(p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_sub uuid;
  v_out jsonb;
begin
  if p_result is null or coalesce((p_result->>'ok')::boolean, false) is not true then
    return p_result;
  end if;
  if coalesce((p_result->>'idempotent_replay')::boolean, false) then
    return p_result;
  end if;
  v_sub := nullif(p_result->>'submission_id', '')::uuid;
  if v_sub is null then
    return p_result;
  end if;

  v_ids := public.achievement_evaluate_after_submit(v_sub);
  v_out := p_result || jsonb_build_object(
    'new_achievement_ids', to_jsonb(coalesce(v_ids, array[]::uuid[]))
  );

  update public.submissions
  set result_json = v_out
  where id = v_sub;

  return v_out;
end;
$$;

-- Full recompute for void: revoke unsupported, reassign exclusives.
create or replace function public.achievement_on_void_submission(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.submissions%rowtype;
  v_def public.achievement_definitions%rowtype;
  v_award public.achievement_awards%rowtype;
  v_include_test boolean;
  v_owner_player uuid;
  v_owner_team uuid;
  v_cand record;
  v_at timestamptz := clock_timestamp();
  v_player record;
  v_team record;
begin
  if p_submission_id is null then
    return;
  end if;

  if public.achievement_finale_frozen(v_at) then
    return;
  end if;

  select * into v_sub from public.submissions where id = p_submission_id;
  if not found then
    return;
  end if;

  v_include_test := public.achievement_dev_cruise_active();
  v_owner_player := case when v_sub.game = 'drinkit' then v_sub.author_player_id else null end;
  v_owner_team := case when v_sub.game = 'shipit' then v_sub.team_id else null end;

  -- Revoke any active awards no longer supported for owners in this game.
  for v_award in
    select a.*
    from public.achievement_awards a
    join public.achievement_definitions d on d.id = a.definition_id
    where a.status = 'active'
      and d.game = v_sub.game
      and (not d.test_only or v_include_test)
      and (
        (v_sub.game = 'drinkit' and a.owner_player_id is not null)
        or (v_sub.game = 'shipit' and a.owner_team_id is not null)
      )
    for update of a
  loop
    select * into v_def from public.achievement_definitions where id = v_award.definition_id;
    if not public.achievement_owner_qualifies(
      v_def, v_award.owner_player_id, v_award.owner_team_id, null
    ) then
      perform public.achievement_revoke_award(v_award.id, 'void_recompute');
    end if;
  end loop;

  -- Re-evaluate shared awards for the voided submission's owner (may still hold via other evidence).
  if v_sub.game = 'drinkit' and v_owner_player is not null then
    perform public.achievement_evaluate_for_owner(
      'drinkit', v_owner_player, null, null, v_owner_player, v_at, true
    );
  elsif v_sub.game = 'shipit' and v_owner_team is not null then
    perform public.achievement_evaluate_for_owner(
      'shipit', null, v_owner_team, null, v_sub.author_player_id, v_at, true
    );
  end if;

  -- Exclusive reassignment: for each exclusive def without an active winner, grant next.
  for v_def in
    select d.*
    from public.achievement_definitions d
    where d.enabled
      and d.exclusive
      and d.game = v_sub.game
      and (not d.test_only or v_include_test)
    order by d.stable_key
  loop
    perform pg_advisory_xact_lock(hashtext('achievement:' || v_def.id::text));

    if exists (
      select 1 from public.achievement_awards
      where definition_id = v_def.id and status = 'active' and exclusive_slot
    ) then
      continue;
    end if;

    select * into v_cand from public.achievement_exclusive_winner_candidate(v_def);
    if not found then
      continue;
    end if;

    perform public.achievement_grant_award(
      v_def,
      v_cand.owner_player_id,
      v_cand.owner_team_id,
      v_cand.evidence_submission_id,
      coalesce(v_cand.owner_player_id, v_sub.author_player_id),
      coalesce(v_cand.evidence_at, v_at)
    );
  end loop;
end;
$$;

revoke all on function public.achievement_on_void_submission(uuid) from public;
grant execute on function public.achievement_on_void_submission(uuid) to service_role;

comment on function public.achievement_on_void_submission(uuid) is
  'Phase 7A: transactional award recompute after Admin Void. Revokes unsupported, reassigns exclusives, suppresses Gallery.';

-- Submit wrappers: evaluate achievements in the same transaction after core accept.
create or replace function public.submit_drink(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid := public.current_player_id();
  v_receipt timestamptz := clock_timestamp();
begin
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;
  return public.achievement_finalize_submit_result(
    public.drinkit_submit_drink_core(v_player, p_payload, v_receipt)
  );
end;
$$;

create or replace function public.dev_submit_drink_at(
  p_payload jsonb,
  p_at_utc timestamptz,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;
  return public.achievement_finalize_submit_result(
    public.drinkit_submit_drink_core(p_player_id, p_payload, p_at_utc)
  );
end;
$$;

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
  return public.achievement_finalize_submit_result(
    public.drinkit_submit_daily_core(v_player, p_payload, clock_timestamp())
  );
end;
$$;

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
  return public.achievement_finalize_submit_result(
    public.drinkit_submit_daily_core(p_player_id, p_payload, p_at_utc)
  );
end;
$$;

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
  return public.achievement_finalize_submit_result(
    public.shipit_submit_scavenger_core(v_player, p_payload, clock_timestamp())
  );
end;
$$;

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
  return public.achievement_finalize_submit_result(
    public.shipit_submit_scavenger_core(p_player_id, p_payload, p_at_utc)
  );
end;
$$;
