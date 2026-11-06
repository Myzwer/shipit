-- Fix scavenger test reset under PostgREST: use session_replication_role to bypass bind trigger.

create or replace function public.dev_reset_scavenger_test_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('session_replication_role', 'replica', true);

  delete from public.scavenger_completions;
  delete from public.gallery_events where kind = 'scavenger';
  delete from public.submissions where kind in ('scavenger_completion', 'scavenger_dev_fixture');
  delete from public.photos where purpose = 'scavenger';

  perform set_config('session_replication_role', 'origin', true);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.dev_reset_scavenger_test_data() from public;
grant execute on function public.dev_reset_scavenger_test_data() to service_role;

-- Also: cruise reseed must not trip bind trigger via ON DELETE SET NULL on bound photos.
-- Prefer RESTRICT so cascade must clear photos first (tests call reset before seed).
alter table public.photos
  drop constraint if exists photos_bound_submission_id_fkey;

alter table public.photos
  add constraint photos_bound_submission_id_fkey
  foreign key (bound_submission_id) references public.submissions (id)
  on delete restrict;
