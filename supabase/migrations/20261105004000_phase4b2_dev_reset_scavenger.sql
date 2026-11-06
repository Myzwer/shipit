-- Service-role test cleanup for scavenger submissions + bound photos.

create or replace function public.dev_reset_scavenger_test_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Completions first, then submissions, then photos (disable bind guard for wipe).
  delete from public.scavenger_completions;
  alter table public.photos disable trigger photos_protect_bound_trg;
  update public.photos
  set status = 'abandoned',
      bound_submission_id = null,
      bound_at_utc = null,
      abandoned_at_utc = coalesce(abandoned_at_utc, clock_timestamp()),
      storage_cleanup_status = 'pending'
  where purpose = 'scavenger' and status = 'bound';
  alter table public.photos enable trigger photos_protect_bound_trg;

  delete from public.submissions where kind = 'scavenger_completion';
  delete from public.gallery_events where kind = 'scavenger';
  delete from public.photos where purpose = 'scavenger';

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.dev_reset_scavenger_test_data() from public;
grant execute on function public.dev_reset_scavenger_test_data() to service_role;
