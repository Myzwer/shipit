-- Phase 7B0: clear achievement unread cursors with test achievement wipe (suite isolation).
create or replace function public.dev_clear_test_achievements()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.cruise_config where is_active and label is distinct from 'development-only'
  ) then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;

  update public.gallery_events ge
  set achievement_award_id = null
  where achievement_award_id is not null;

  update public.achievement_awards set gallery_event_id = null;

  delete from public.gallery_events where kind = 'achievement';
  delete from public.achievement_awards;
  delete from public.achievement_definitions where test_only;
  delete from public.ingredient_tags;
  delete from public.drink_concept_tags;
  delete from public.read_cursors where scope = 'achievements_mine';
end;
$$;

revoke all on function public.dev_clear_test_achievements() from public;
grant execute on function public.dev_clear_test_achievements() to service_role;
