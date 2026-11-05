-- Phase 1B: Restrict internal identity columns on public.players
-- Authority: handoff/03-Technical-Spec.md §3.3; Phase 1B security hardening
--
-- Authenticated clients may still see roster-safe columns for shared-game peers
-- (RLS row filter unchanged). auth_user_id and is_admin are not granted for
-- direct SELECT — use get_my_session_profile() / is_admin() instead.

revoke select on table public.players from authenticated;

grant select (
  id,
  display_name,
  login_alias,
  active,
  created_at,
  updated_at
) on table public.players to authenticated;

-- Explicit roster view for leaderboards / member lists (security invoker → players RLS).
create or replace view public.player_roster
with (security_invoker = true)
as
select
  id,
  display_name,
  active
from public.players
where active = true;

comment on view public.player_roster is
  'Roster-safe player fields only. No auth_user_id or is_admin.';

grant select on public.player_roster to authenticated;
revoke insert, update, delete on public.player_roster from anon, authenticated;
