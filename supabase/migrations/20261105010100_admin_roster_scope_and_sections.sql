-- Admin roster/teams scoping + lightweight overview for sectioned Admin UI.
-- Cruise roster = Auth-linked player profiles, excluding disposable Demo role aliases
-- used only by local integration fixtures (see tests/helpers/syntheticRoles.ts).

create or replace function public.admin_is_disposable_demo_alias(p_alias text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_alias, '')) in (
    'drink.only@star-princess.local',
    'ship.only@star-princess.local',
    'both.games@star-princess.local',
    'organizer@star-princess.local',
    'no.games@star-princess.local'
  );
$$;

revoke all on function public.admin_is_disposable_demo_alias(text) from public;
grant execute on function public.admin_is_disposable_demo_alias(text) to authenticated, service_role;

comment on function public.admin_is_disposable_demo_alias(text) is
  'True for stable local Demo role login aliases; never private family roster aliases.';

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
        where p.auth_user_id is not null
          and not public.admin_is_disposable_demo_alias(p.login_alias)
      ) q
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.admin_list_roster() from public;
grant execute on function public.admin_list_roster() to authenticated;

comment on function public.admin_list_roster() is
  'Admin cruise roster: Auth-linked players only; excludes disposable Demo role aliases and Auth-less synthetic fixtures.';

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
        and t.name not like 'Crew Synth%'
        and t.name not like 'Demo Team%'
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.admin_list_teams() from public;
grant execute on function public.admin_list_teams() to authenticated;

comment on function public.admin_list_teams() is
  'Active cruise teams for Admin assignment; excludes disposable Crew Synth / Demo Team fixtures.';

create or replace function public.admin_overview_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_players int;
  v_drinkit int;
  v_shipit int;
  v_teams int;
  v_unassigned int;
begin
  v_actor := public.require_admin();

  select count(*)::int into v_players
  from public.players p
  where p.auth_user_id is not null
    and not public.admin_is_disposable_demo_alias(p.login_alias);

  select count(*)::int into v_drinkit
  from public.game_memberships gm
  join public.players p on p.id = gm.player_id
  where gm.game = 'drinkit'
    and gm.enabled is true
    and p.auth_user_id is not null
    and not public.admin_is_disposable_demo_alias(p.login_alias);

  select count(*)::int into v_shipit
  from public.game_memberships gm
  join public.players p on p.id = gm.player_id
  where gm.game = 'shipit'
    and gm.enabled is true
    and p.auth_user_id is not null
    and not public.admin_is_disposable_demo_alias(p.login_alias);

  select count(*)::int into v_teams
  from public.teams t
  where t.active is true
    and t.name not like 'Crew Synth%'
    and t.name not like 'Demo Team%';

  select count(*)::int into v_unassigned
  from public.game_memberships gm
  join public.players p on p.id = gm.player_id
  where gm.game = 'shipit'
    and gm.enabled is true
    and p.auth_user_id is not null
    and not public.admin_is_disposable_demo_alias(p.login_alias)
    and not exists (
      select 1
      from public.team_memberships tm
      where tm.player_id = p.id
        and tm.active_to is null
    );

  return jsonb_build_object(
    'ok', true,
    'players', v_players,
    'drinkit_enabled', v_drinkit,
    'shipit_enabled', v_shipit,
    'teams', v_teams,
    'shipit_unassigned', v_unassigned
  );
end;
$$;

revoke all on function public.admin_overview_summary() from public;
grant execute on function public.admin_overview_summary() to authenticated;

comment on function public.admin_overview_summary() is
  'Bounded Admin overview counts for cruise-scoped Auth-linked players; no full table dumps.';
