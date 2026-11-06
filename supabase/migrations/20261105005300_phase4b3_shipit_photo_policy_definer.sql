-- Gate B fix: storage policy EXISTS against photos/submissions is subject to
-- those tables' RLS, so teammates could not see the owner's bound row.
-- Evaluate membership via a security-definer helper instead.

create or replace function public.storage_can_read_shipit_bound_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.storage_current_player_id() is not null
    and public.has_game('shipit')
    and exists (
      select 1
      from public.photos p
      join public.submissions s on s.id = p.bound_submission_id
      where p.storage_path = p_storage_path
        and p.status = 'bound'
        and p.game = 'shipit'
        and s.team_id = public.current_team_id()
    );
$$;

revoke all on function public.storage_can_read_shipit_bound_object(text) from public;
grant execute on function public.storage_can_read_shipit_bound_object(text) to authenticated;

drop policy if exists game_photos_select_shipit_teammate_bound on storage.objects;
create policy game_photos_select_shipit_teammate_bound
  on storage.objects for select to authenticated
  using (
    bucket_id = 'game-photos'
    and public.storage_can_read_shipit_bound_object(name)
  );
