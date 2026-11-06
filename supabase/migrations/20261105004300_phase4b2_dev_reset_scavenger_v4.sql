-- Add WHERE clauses — local Supabase rejects unqualified DELETE even inside RPCs.

create or replace function public.dev_reset_scavenger_test_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  execute 'alter table public.photos disable trigger photos_protect_bound_trg';

  update public.photos
  set status = 'abandoned',
      bound_submission_id = null,
      bound_at_utc = null,
      abandoned_at_utc = coalesce(abandoned_at_utc, clock_timestamp()),
      storage_cleanup_status = 'pending'
  where purpose = 'scavenger';

  delete from public.scavenger_completions where id is not null;
  delete from public.gallery_events where kind = 'scavenger';
  delete from public.submissions
  where kind in ('scavenger_completion', 'scavenger_dev_fixture');
  delete from public.photos where purpose = 'scavenger';

  execute 'alter table public.photos enable trigger photos_protect_bound_trg';

  return jsonb_build_object('ok', true);
exception
  when others then
    begin
      execute 'alter table public.photos enable trigger photos_protect_bound_trg';
    exception when others then
      null;
    end;
    raise;
end;
$$;

revoke all on function public.dev_reset_scavenger_test_data() from public;
grant execute on function public.dev_reset_scavenger_test_data() to service_role;
