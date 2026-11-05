-- Phase 1A: RLS + least-privilege grants
-- Authority: handoff/03-Technical-Spec.md §3.3

alter table public.players enable row level security;
alter table public.game_memberships enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;

-- Force RLS for table owners in local/testing contexts
alter table public.players force row level security;
alter table public.game_memberships force row level security;
alter table public.teams force row level security;
alter table public.team_memberships force row level security;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on table public.players from anon, authenticated;
revoke all on table public.game_memberships from anon, authenticated;
revoke all on table public.teams from anon, authenticated;
revoke all on table public.team_memberships from anon, authenticated;

grant select on public.login_directory to anon, authenticated;

grant select on table public.players to authenticated;
grant select on table public.game_memberships to authenticated;
grant select on table public.teams to authenticated;
grant select on table public.team_memberships to authenticated;

-- No direct writes for anon/authenticated — provisioning uses service role
revoke insert, update, delete on table public.players from anon, authenticated;
revoke insert, update, delete on table public.game_memberships from anon, authenticated;
revoke insert, update, delete on table public.teams from anon, authenticated;
revoke insert, update, delete on table public.team_memberships from anon, authenticated;

revoke all on function public.current_player_id() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.has_game(public.game_id) from public;
revoke all on function public.shares_game_with(uuid) from public;
revoke all on function public.current_team_id() from public;
revoke all on function public.get_my_session_profile() from public;

grant execute on function public.current_player_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_game(public.game_id) to authenticated;
grant execute on function public.shares_game_with(uuid) to authenticated;
grant execute on function public.current_team_id() to authenticated;
grant execute on function public.get_my_session_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------
create policy players_select_self_or_shared_game
  on public.players
  for select
  to authenticated
  using (
    public.is_admin()
    or auth_user_id = auth.uid()
    or public.shares_game_with(id)
  );

-- Explicitly no insert/update/delete policies for authenticated/anon

-- ---------------------------------------------------------------------------
-- game_memberships
-- ---------------------------------------------------------------------------
create policy game_memberships_select_visible
  on public.game_memberships
  for select
  to authenticated
  using (
    public.is_admin()
    or player_id = public.current_player_id()
    or (
      enabled = true
      and public.has_game(game)
    )
  );

-- ---------------------------------------------------------------------------
-- teams: Ship It! members may read teams (leaderboard); others may not
-- ---------------------------------------------------------------------------
create policy teams_select_shipit_members
  on public.teams
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_game('shipit')
  );

-- ---------------------------------------------------------------------------
-- team_memberships
-- ---------------------------------------------------------------------------
create policy team_memberships_select_shipit_members
  on public.team_memberships
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_game('shipit')
  );
