-- Gate B: bound Ship It! Storage reads require enabled shipit membership,
-- not merely a team_memberships row (Drink It!-only players may share a team).

drop policy if exists game_photos_select_shipit_teammate_bound on storage.objects;
create policy game_photos_select_shipit_teammate_bound
  on storage.objects for select to authenticated
  using (
    bucket_id = 'game-photos'
    and public.storage_current_player_id() is not null
    and public.has_game('shipit')
    and exists (
      select 1
      from public.photos p
      join public.submissions s on s.id = p.bound_submission_id
      where p.storage_path = name
        and p.status = 'bound'
        and p.game = 'shipit'
        and s.team_id = public.current_team_id()
    )
  );
