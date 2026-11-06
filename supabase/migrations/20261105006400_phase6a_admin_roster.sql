-- Phase 6A: Admin roster read + membership/team/access mutations.
-- Auth create/password reset live in Edge Function admin-roster (service role).
-- Authority: Tech Spec §3, §13, §15; UX §1, §10; Phase 6A brief.

-- ---------------------------------------------------------------------------
-- Request ledgers (idempotency; never store passwords)
-- ---------------------------------------------------------------------------
create table public.admin_roster_access_requests (
  client_request_id uuid primary key,
  fingerprint text not null,
  actor_id uuid not null references public.players (id),
  player_id uuid not null references public.players (id),
  result_json jsonb not null,
  received_at_utc timestamptz not null default clock_timestamp(),
  completed_at_utc timestamptz not null default clock_timestamp()
);

create index admin_roster_access_requests_player_idx
  on public.admin_roster_access_requests (player_id, received_at_utc desc);

alter table public.admin_roster_access_requests enable row level security;
alter table public.admin_roster_access_requests force row level security;
revoke all on table public.admin_roster_access_requests from anon, authenticated;
grant select on table public.admin_roster_access_requests to authenticated;
grant select, insert, update, delete on table public.admin_roster_access_requests to service_role;

create policy admin_roster_access_requests_admin_select
  on public.admin_roster_access_requests for select to authenticated
  using (public.is_admin());

create table public.admin_roster_auth_requests (
  client_request_id uuid primary key,
  action text not null check (action in ('create_player', 'reset_password')),
  fingerprint text not null,
  actor_id uuid not null references public.players (id),
  player_id uuid references public.players (id),
  login_alias text,
  result_json jsonb not null,
  orphan_auth_user_id uuid,
  received_at_utc timestamptz not null default clock_timestamp(),
  completed_at_utc timestamptz not null default clock_timestamp(),
  constraint admin_roster_auth_requests_no_secret_in_fingerprint check (
    position('password=' in lower(fingerprint)) = 0
    and position('"password"' in lower(fingerprint)) = 0
  )
);

comment on table public.admin_roster_auth_requests is
  'Phase 6A: create/reset Auth intents. Fingerprint never includes password. orphan_auth_user_id marks partial Auth provisioning for reconcile.';

create index admin_roster_auth_requests_alias_idx
  on public.admin_roster_auth_requests (lower(login_alias));

alter table public.admin_roster_auth_requests enable row level security;
alter table public.admin_roster_auth_requests force row level security;
revoke all on table public.admin_roster_auth_requests from anon, authenticated;
grant select on table public.admin_roster_auth_requests to authenticated;
grant select, insert, update, delete on table public.admin_roster_auth_requests to service_role;

create policy admin_roster_auth_requests_admin_select
  on public.admin_roster_auth_requests for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.admin_roster_player_fingerprint(p_player_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(
    coalesce(p.id::text, '') || '|' ||
    coalesce(p.active::text, '') || '|' ||
    coalesce(p.updated_at::text, '') || '|' ||
    coalesce(
      (
        select string_agg(gm.game::text || ':' || gm.enabled::text, ',' order by gm.game)
        from public.game_memberships gm
        where gm.player_id = p.id
      ),
      ''
    ) || '|' ||
    coalesce(
      (
        select tm.team_id::text
        from public.team_memberships tm
        where tm.player_id = p.id and tm.active_to is null
        limit 1
      ),
      ''
    )
  )
  from public.players p
  where p.id = p_player_id
$$;

revoke all on function public.admin_roster_player_fingerprint(uuid) from public;
grant execute on function public.admin_roster_player_fingerprint(uuid) to authenticated, service_role;

create or replace function public.admin_player_has_shipit_history(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.submissions s
    where s.author_player_id = p_player_id
      and s.game = 'shipit'
      and s.team_id is not null
  )
$$;

revoke all on function public.admin_player_has_shipit_history(uuid) from public;
grant execute on function public.admin_player_has_shipit_history(uuid) to authenticated, service_role;

create or replace function public.admin_normalize_login_alias(p_display_name text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_slug text;
begin
  v_slug := lower(trim(coalesce(p_display_name, '')));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '.', 'g');
  v_slug := regexp_replace(v_slug, '^\.+|\.+$', '', 'g');
  if v_slug = '' then
    return null;
  end if;
  return v_slug || '@star-princess.local';
end;
$$;

revoke all on function public.admin_normalize_login_alias(text) from public;
grant execute on function public.admin_normalize_login_alias(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Read contracts
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_roster()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public.require_admin();

  return coalesce(
    (
      select jsonb_agg(row_json order by lower(row_json->>'display_name'))
      from (
        select jsonb_build_object(
          'player_id', p.id,
          'display_name', p.display_name,
          'login_alias', p.login_alias,
          'active', p.active,
          'is_admin', p.is_admin,
          'updated_at', p.updated_at,
          'state_fingerprint', public.admin_roster_player_fingerprint(p.id),
          'drinkit_enabled', coalesce(
            (select gm.enabled from public.game_memberships gm
             where gm.player_id = p.id and gm.game = 'drinkit'),
            false
          ),
          'shipit_enabled', coalesce(
            (select gm.enabled from public.game_memberships gm
             where gm.player_id = p.id and gm.game = 'shipit'),
            false
          ),
          'team', (
            select jsonb_build_object(
              'team_id', t.id,
              'name', t.name,
              'color', t.color
            )
            from public.team_memberships tm
            join public.teams t on t.id = tm.team_id
            where tm.player_id = p.id
              and tm.active_to is null
            limit 1
          ),
          'has_shipit_history', public.admin_player_has_shipit_history(p.id)
        ) as row_json
        from public.players p
      ) q
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.admin_list_roster() from public;
grant execute on function public.admin_list_roster() to authenticated;

create or replace function public.admin_list_teams()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'team_id', t.id,
          'name', t.name,
          'color', t.color,
          'active', t.active
        )
        order by lower(t.name)
      )
      from public.teams t
      where t.active is true
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.admin_list_teams() from public;
grant execute on function public.admin_list_teams() to authenticated;

-- ---------------------------------------------------------------------------
-- Membership / team / active mutation (optimistic fingerprint)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_player_access(
  p_client_request_id uuid,
  p_player_id uuid,
  p_active boolean,
  p_drinkit_enabled boolean,
  p_shipit_enabled boolean,
  p_team_id uuid,
  p_expected_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.require_admin();
  v_fp text;
  v_existing public.admin_roster_access_requests%rowtype;
  v_player public.players%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_current_fp text;
  v_current_team uuid;
  v_has_history boolean;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_client_request_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_ID');
  end if;
  if p_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_REQUIRED');
  end if;
  if p_expected_fingerprint is null or trim(p_expected_fingerprint) = '' then
    return jsonb_build_object('ok', false, 'code', 'EXPECTED_FINGERPRINT_REQUIRED');
  end if;

  v_fp := md5(
    p_player_id::text || '|' ||
    coalesce(p_active::text, '') || '|' ||
    coalesce(p_drinkit_enabled::text, '') || '|' ||
    coalesce(p_shipit_enabled::text, '') || '|' ||
    coalesce(p_team_id::text, '') || '|' ||
    trim(p_expected_fingerprint)
  );

  perform pg_advisory_xact_lock(
    hashtext('admin_roster_access_request'),
    hashtext(p_client_request_id::text)
  );
  perform pg_advisory_xact_lock(
    hashtext('admin_roster_player'),
    hashtext(p_player_id::text)
  );

  select * into v_existing
  from public.admin_roster_access_requests
  where client_request_id = p_client_request_id;

  if found then
    if v_existing.fingerprint is distinct from v_fp then
      return jsonb_build_object(
        'ok', false,
        'code', 'REQUEST_ID_OPERATION_MISMATCH',
        'message', 'Same request id was used for a different roster change'
      );
    end if;
    return coalesce(v_existing.result_json, '{}'::jsonb) || jsonb_build_object(
      'idempotent_replay', true,
      'client_request_id', p_client_request_id
    );
  end if;

  select * into v_player from public.players where id = p_player_id for update;
  if not found then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'PLAYER_NOT_FOUND',
      'client_request_id', p_client_request_id
    );
    insert into public.admin_roster_access_requests (
      client_request_id, fingerprint, actor_id, player_id, result_json
    ) values (
      p_client_request_id, v_fp, v_actor, p_player_id, v_result
    );
    return v_result;
  end if;

  v_current_fp := public.admin_roster_player_fingerprint(p_player_id);
  if v_current_fp is distinct from trim(p_expected_fingerprint) then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'STALE_ROSTER_STATE',
      'message', 'Player roster changed. Refresh and try again.',
      'client_request_id', p_client_request_id,
      'player_id', p_player_id
    );
    insert into public.admin_roster_access_requests (
      client_request_id, fingerprint, actor_id, player_id, result_json
    ) values (
      p_client_request_id, v_fp, v_actor, p_player_id, v_result
    );
    return v_result;
  end if;

  -- Never create Admin via this path; never strip the last Admin's own access lockout.
  if v_player.id = v_actor and p_active is false then
    return jsonb_build_object(
      'ok', false,
      'code', 'ADMIN_SELF_LOCKOUT',
      'message', 'You cannot disable your own account.'
    );
  end if;

  if p_shipit_enabled is true and p_team_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'TEAM_REQUIRED',
      'message', 'Ship It! access requires a team assignment.'
    );
  end if;

  if p_team_id is not null then
    if not exists (select 1 from public.teams t where t.id = p_team_id and t.active is true) then
      return jsonb_build_object('ok', false, 'code', 'TEAM_NOT_FOUND');
    end if;
  end if;

  select tm.team_id into v_current_team
  from public.team_memberships tm
  where tm.player_id = p_player_id and tm.active_to is null
  limit 1;

  v_has_history := public.admin_player_has_shipit_history(p_player_id);

  if v_has_history
     and p_team_id is not null
     and v_current_team is not null
     and p_team_id is distinct from v_current_team then
    return jsonb_build_object(
      'ok', false,
      'code', 'TEAM_HISTORY_LOCKED',
      'message', 'This player already has Ship It! submissions. Team reassignment would make historical team scores ambiguous.'
    );
  end if;

  -- When disabling Ship It!, optional team clear/change is only allowed without history.
  if p_shipit_enabled is not true
     and p_team_id is not null
     and v_current_team is not null
     and p_team_id is distinct from v_current_team
     and v_has_history then
    return jsonb_build_object(
      'ok', false,
      'code', 'TEAM_HISTORY_LOCKED',
      'message', 'This player already has Ship It! submissions. Team reassignment would make historical team scores ambiguous.'
    );
  end if;

  v_before := jsonb_build_object(
    'player_id', v_player.id,
    'active', v_player.active,
    'drinkit_enabled', coalesce(
      (select gm.enabled from public.game_memberships gm
       where gm.player_id = v_player.id and gm.game = 'drinkit'), false),
    'shipit_enabled', coalesce(
      (select gm.enabled from public.game_memberships gm
       where gm.player_id = v_player.id and gm.game = 'shipit'), false),
    'team_id', v_current_team
  );

  -- Apply active
  update public.players
  set active = coalesce(p_active, active)
  where id = v_player.id;

  -- Drink It! membership upsert / disable
  if p_drinkit_enabled is true then
    insert into public.game_memberships (player_id, game, enabled)
    values (p_player_id, 'drinkit', true)
    on conflict (player_id, game) do update set enabled = true;
  else
    insert into public.game_memberships (player_id, game, enabled)
    values (p_player_id, 'drinkit', false)
    on conflict (player_id, game) do update set enabled = false;
  end if;

  -- Team assignment before Ship It! enable (deferred constraint)
  if p_shipit_enabled is true then
    if v_current_team is distinct from p_team_id then
      if v_current_team is not null then
        update public.team_memberships
        set active_to = v_now
        where player_id = p_player_id
          and active_to is null;
      end if;
      insert into public.team_memberships (player_id, team_id, active_from)
      values (p_player_id, p_team_id, v_now);
    end if;

    insert into public.game_memberships (player_id, game, enabled)
    values (p_player_id, 'shipit', true)
    on conflict (player_id, game) do update set enabled = true;
  else
    insert into public.game_memberships (player_id, game, enabled)
    values (p_player_id, 'shipit', false)
    on conflict (player_id, game) do update set enabled = false;

    -- Closing Ship It! keeps the active team row when history exists (re-enable safety).
    -- Without history, organizer may clear or change the team assignment.
    if p_team_id is null and v_current_team is not null and not v_has_history then
      update public.team_memberships
      set active_to = v_now
      where player_id = p_player_id
        and active_to is null;
    elsif p_team_id is not null and v_current_team is distinct from p_team_id then
      update public.team_memberships
      set active_to = v_now
      where player_id = p_player_id and active_to is null;
      insert into public.team_memberships (player_id, team_id, active_from)
      values (p_player_id, p_team_id, v_now);
    end if;
  end if;

  select tm.team_id into v_current_team
  from public.team_memberships tm
  where tm.player_id = p_player_id and tm.active_to is null
  limit 1;

  select * into v_player from public.players where id = p_player_id;

  v_after := jsonb_build_object(
    'player_id', v_player.id,
    'active', v_player.active,
    'drinkit_enabled', coalesce(
      (select gm.enabled from public.game_memberships gm
       where gm.player_id = v_player.id and gm.game = 'drinkit'), false),
    'shipit_enabled', coalesce(
      (select gm.enabled from public.game_memberships gm
       where gm.player_id = v_player.id and gm.game = 'shipit'), false),
    'team_id', v_current_team,
    'state_fingerprint', public.admin_roster_player_fingerprint(v_player.id)
  );

  perform public.write_admin_audit(
    'roster.access_update',
    v_actor,
    'players',
    v_player.id::text,
    v_before,
    v_after
  );

  v_result := jsonb_build_object(
    'ok', true,
    'client_request_id', p_client_request_id,
    'player_id', v_player.id,
    'active', v_player.active,
    'drinkit_enabled', v_after->>'drinkit_enabled' = 'true',
    'shipit_enabled', v_after->>'shipit_enabled' = 'true',
    'team_id', v_current_team,
    'state_fingerprint', v_after->>'state_fingerprint'
  );

  insert into public.admin_roster_access_requests (
    client_request_id, fingerprint, actor_id, player_id, result_json
  ) values (
    p_client_request_id, v_fp, v_actor, p_player_id, v_result
  );

  return v_result;
end;
$$;

revoke all on function public.admin_set_player_access(uuid, uuid, boolean, boolean, boolean, uuid, text) from public;
grant execute on function public.admin_set_player_access(uuid, uuid, boolean, boolean, boolean, uuid, text) to authenticated;

create or replace function public.admin_find_roster_access_request_by_id(
  p_client_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.admin_roster_access_requests%rowtype;
begin
  perform public.require_admin();
  if p_client_request_id is null then
    return null;
  end if;
  select * into v_row
  from public.admin_roster_access_requests
  where client_request_id = p_client_request_id;
  if not found then
    return null;
  end if;
  return coalesce(v_row.result_json, '{}'::jsonb) || jsonb_build_object(
    'client_request_id', v_row.client_request_id,
    'received_at_utc', v_row.received_at_utc,
    'completed_at_utc', v_row.completed_at_utc
  );
end;
$$;

revoke all on function public.admin_find_roster_access_request_by_id(uuid) from public;
grant execute on function public.admin_find_roster_access_request_by_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Service-role player provisioning (called by Edge Function after Auth create)
-- ---------------------------------------------------------------------------
create or replace function public.admin_provision_player_record(
  p_client_request_id uuid,
  p_actor_id uuid,
  p_auth_user_id uuid,
  p_display_name text,
  p_login_alias text,
  p_drinkit_enabled boolean,
  p_shipit_enabled boolean,
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_alias text := nullif(trim(coalesce(p_login_alias, '')), '');
  v_player public.players%rowtype;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_client_request_id is null or p_actor_id is null or p_auth_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT');
  end if;
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DISPLAY_NAME');
  end if;
  if v_alias is null or v_alias !~* '^[a-z0-9._%+-]+@star-princess\.local$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LOGIN_ALIAS');
  end if;
  if p_shipit_enabled is true and p_team_id is null then
    return jsonb_build_object('ok', false, 'code', 'TEAM_REQUIRED');
  end if;

  -- Reconcile: player already linked to this auth user
  select * into v_player from public.players where auth_user_id = p_auth_user_id;
  if found then
    return jsonb_build_object(
      'ok', true,
      'reconciled', true,
      'player_id', v_player.id,
      'display_name', v_player.display_name,
      'login_alias', v_player.login_alias,
      'client_request_id', p_client_request_id
    );
  end if;

  -- Reconcile: alias exists
  select * into v_player from public.players where lower(login_alias) = lower(v_alias);
  if found then
    if v_player.auth_user_id is null then
      update public.players
      set auth_user_id = p_auth_user_id,
          display_name = v_name,
          active = true
      where id = v_player.id
      returning * into v_player;
    elsif v_player.auth_user_id is distinct from p_auth_user_id then
      return jsonb_build_object(
        'ok', false,
        'code', 'LOGIN_ALIAS_TAKEN',
        'player_id', v_player.id
      );
    end if;
  else
    if exists (select 1 from public.players where lower(display_name) = lower(v_name)) then
      return jsonb_build_object('ok', false, 'code', 'DISPLAY_NAME_TAKEN');
    end if;

    insert into public.players (
      auth_user_id, display_name, login_alias, is_admin, active
    ) values (
      p_auth_user_id, v_name, lower(v_alias), false, true
    )
    returning * into v_player;
  end if;

  -- Provisioning never grants Admin. Leave an existing admin row untouched only if
  -- reconciling the same auth user (should not happen for create_player).
  if v_player.is_admin is true then
    update public.players set is_admin = false where id = v_player.id;
    v_player.is_admin := false;
  end if;

  if p_team_id is not null then
    if not exists (select 1 from public.teams where id = p_team_id and active is true) then
      return jsonb_build_object('ok', false, 'code', 'TEAM_NOT_FOUND');
    end if;
    update public.team_memberships
    set active_to = v_now
    where player_id = v_player.id and active_to is null;
    insert into public.team_memberships (player_id, team_id, active_from)
    values (v_player.id, p_team_id, v_now);
  end if;

  if p_drinkit_enabled is true then
    insert into public.game_memberships (player_id, game, enabled)
    values (v_player.id, 'drinkit', true)
    on conflict (player_id, game) do update set enabled = true;
  else
    insert into public.game_memberships (player_id, game, enabled)
    values (v_player.id, 'drinkit', false)
    on conflict (player_id, game) do update set enabled = false;
  end if;

  if p_shipit_enabled is true then
    insert into public.game_memberships (player_id, game, enabled)
    values (v_player.id, 'shipit', true)
    on conflict (player_id, game) do update set enabled = true;
  else
    insert into public.game_memberships (player_id, game, enabled)
    values (v_player.id, 'shipit', false)
    on conflict (player_id, game) do update set enabled = false;
  end if;

  perform public.write_admin_audit(
    'roster.player_create',
    p_actor_id,
    'players',
    v_player.id::text,
    null,
    jsonb_build_object(
      'player_id', v_player.id,
      'display_name', v_player.display_name,
      'login_alias', v_player.login_alias,
      'drinkit_enabled', coalesce(p_drinkit_enabled, false),
      'shipit_enabled', coalesce(p_shipit_enabled, false),
      'team_id', p_team_id,
      'auth_user_id', p_auth_user_id
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'player_id', v_player.id,
    'display_name', v_player.display_name,
    'login_alias', v_player.login_alias,
    'drinkit_enabled', coalesce(p_drinkit_enabled, false),
    'shipit_enabled', coalesce(p_shipit_enabled, false),
    'team_id', p_team_id,
    'client_request_id', p_client_request_id
  );
  return v_result;
end;
$$;

revoke all on function public.admin_provision_player_record(uuid, uuid, uuid, text, text, boolean, boolean, uuid) from public;
grant execute on function public.admin_provision_player_record(uuid, uuid, uuid, text, text, boolean, boolean, uuid) to service_role;

-- Auth request ledger helpers (service role + admin find)
create or replace function public.admin_roster_auth_begin(
  p_client_request_id uuid,
  p_action text,
  p_fingerprint text,
  p_actor_id uuid,
  p_player_id uuid,
  p_login_alias text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.admin_roster_auth_requests%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_client_request_id is null or p_action is null or p_fingerprint is null or p_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT');
  end if;
  if position('password=' in lower(p_fingerprint)) > 0
     or position('"password"' in lower(p_fingerprint)) > 0 then
    return jsonb_build_object('ok', false, 'code', 'FINGERPRINT_REJECTED');
  end if;

  perform pg_advisory_xact_lock(
    hashtext('admin_roster_auth_request'),
    hashtext(p_client_request_id::text)
  );

  select * into v_existing
  from public.admin_roster_auth_requests
  where client_request_id = p_client_request_id;

  if found then
    if v_existing.fingerprint is distinct from p_fingerprint
       or v_existing.action is distinct from p_action then
      return jsonb_build_object(
        'ok', false,
        'code', 'REQUEST_ID_OPERATION_MISMATCH'
      );
    end if;
    return jsonb_build_object(
      'ok', true,
      'replay', true,
      'result', v_existing.result_json,
      'orphan_auth_user_id', v_existing.orphan_auth_user_id
    );
  end if;

  return jsonb_build_object('ok', true, 'replay', false);
end;
$$;

revoke all on function public.admin_roster_auth_begin(uuid, text, text, uuid, uuid, text) from public;
grant execute on function public.admin_roster_auth_begin(uuid, text, text, uuid, uuid, text) to service_role;

create or replace function public.admin_roster_auth_complete(
  p_client_request_id uuid,
  p_action text,
  p_fingerprint text,
  p_actor_id uuid,
  p_player_id uuid,
  p_login_alias text,
  p_result jsonb,
  p_orphan_auth_user_id uuid default null
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

  insert into public.admin_roster_auth_requests (
    client_request_id, action, fingerprint, actor_id, player_id, login_alias,
    result_json, orphan_auth_user_id
  ) values (
    p_client_request_id, p_action, p_fingerprint, p_actor_id, p_player_id, p_login_alias,
    p_result, p_orphan_auth_user_id
  )
  on conflict (client_request_id) do update
    set result_json = excluded.result_json,
        orphan_auth_user_id = coalesce(excluded.orphan_auth_user_id, public.admin_roster_auth_requests.orphan_auth_user_id),
        player_id = coalesce(excluded.player_id, public.admin_roster_auth_requests.player_id),
        completed_at_utc = clock_timestamp();

  return p_result;
end;
$$;

revoke all on function public.admin_roster_auth_complete(uuid, text, text, uuid, uuid, text, jsonb, uuid) from public;
grant execute on function public.admin_roster_auth_complete(uuid, text, text, uuid, uuid, text, jsonb, uuid) to service_role;

create or replace function public.admin_find_roster_auth_request_by_id(
  p_client_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.admin_roster_auth_requests%rowtype;
begin
  perform public.require_admin();
  if p_client_request_id is null then
    return null;
  end if;
  select * into v_row
  from public.admin_roster_auth_requests
  where client_request_id = p_client_request_id;
  if not found then
    return null;
  end if;
  return coalesce(v_row.result_json, '{}'::jsonb) || jsonb_build_object(
    'client_request_id', v_row.client_request_id,
    'action', v_row.action,
    'received_at_utc', v_row.received_at_utc,
    'completed_at_utc', v_row.completed_at_utc,
    'has_orphan_auth', v_row.orphan_auth_user_id is not null
  );
end;
$$;

revoke all on function public.admin_find_roster_auth_request_by_id(uuid) from public;
grant execute on function public.admin_find_roster_auth_request_by_id(uuid) to authenticated;

-- Lookup helpers for Edge Function (service role)
create or replace function public.admin_roster_resolve_actor()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Callable with user JWT via Edge Function user-scoped client, or service after set
  v_id := public.current_player_id();
  if v_id is null or not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'ADMIN_REQUIRED');
  end if;
  return jsonb_build_object(
    'ok', true,
    'actor_id', v_id,
    'display_name', (select display_name from public.players where id = v_id)
  );
end;
$$;

revoke all on function public.admin_roster_resolve_actor() from public;
grant execute on function public.admin_roster_resolve_actor() to authenticated, service_role;

create or replace function public.admin_roster_get_player_auth(
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_player public.players%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select * into v_player from public.players where id = p_player_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_FOUND');
  end if;
  return jsonb_build_object(
    'ok', true,
    'player_id', v_player.id,
    'auth_user_id', v_player.auth_user_id,
    'login_alias', v_player.login_alias,
    'display_name', v_player.display_name,
    'active', v_player.active,
    'is_admin', v_player.is_admin
  );
end;
$$;

revoke all on function public.admin_roster_get_player_auth(uuid) from public;
grant execute on function public.admin_roster_get_player_auth(uuid) to service_role;

create or replace function public.admin_roster_audit_password_reset(
  p_actor_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  perform public.write_admin_audit(
    'roster.password_reset',
    p_actor_id,
    'players',
    p_player_id::text,
    jsonb_build_object('player_id', p_player_id),
    jsonb_build_object('player_id', p_player_id, 'password_updated', true)
  );
end;
$$;

revoke all on function public.admin_roster_audit_password_reset(uuid, uuid) from public;
grant execute on function public.admin_roster_audit_password_reset(uuid, uuid) to service_role;
