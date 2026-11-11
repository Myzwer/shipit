-- Development-only full preview gameplay ledger reset for demo/QA reseeds.
-- Clears submissions, claims, awards, gallery, photos bindings, crews, cursors,
-- and wrapped reveals while preserving roster, teams, catalog, and clock config.
-- service_role + active cruise_config.label = development-only only.

create or replace function public.dev_reset_preview_gameplay_ledger()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_photos int := 0;
  v_subs int := 0;
  v_awards int := 0;
  v_gallery int := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'DEV_ONLY: service_role required';
  end if;

  select label into v_label
  from public.cruise_config
  where is_active
  limit 1;

  if v_label is distinct from 'development-only' then
    raise exception 'DEV_ONLY: refusing gameplay ledger reset when active label is %', coalesce(v_label, '<none>');
  end if;

  delete from public.gallery_reactions where true;
  delete from public.read_cursors where true;
  delete from public.wrapped_reveals where true;

  -- Break award ↔ gallery links before deletes.
  update public.achievement_awards set gallery_event_id = null where gallery_event_id is not null;
  update public.submissions set gallery_event_id = null where gallery_event_id is not null;

  delete from public.gallery_events where true;
  get diagnostics v_gallery = row_count;

  delete from public.achievement_awards where true;
  get diagnostics v_awards = row_count;

  delete from public.bounty_claims where true;
  delete from public.bar_bounty_crew_members where true;
  delete from public.bar_bounty_crews where true;
  delete from public.bar_bounty_crew_days where true;
  delete from public.admin_bounty_skip_requests where true;

  -- Drink companions / scavenger child rows cascade or delete with submissions.
  begin
    delete from public.drink_log_companions where true;
  exception when undefined_table then
    null;
  end;
  begin
    delete from public.scavenger_completions where true;
  exception when undefined_table then
    null;
  end;

  execute 'alter table public.photos disable trigger photos_protect_bound_trg';
  begin
    update public.photos
    set status = 'abandoned',
        bound_submission_id = null,
        bound_at_utc = null,
        abandoned_at_utc = coalesce(abandoned_at_utc, clock_timestamp()),
        storage_cleanup_status = 'pending'
    where status is distinct from 'abandoned';

    delete from public.submissions where true;
    get diagnostics v_subs = row_count;

    delete from public.photos where true;
    get diagnostics v_photos = row_count;
  exception
    when others then
      execute 'alter table public.photos enable trigger photos_protect_bound_trg';
      raise;
  end;
  execute 'alter table public.photos enable trigger photos_protect_bound_trg';

  return jsonb_build_object(
    'ok', true,
    'deleted_gallery_events', v_gallery,
    'deleted_awards', v_awards,
    'deleted_submissions', v_subs,
    'deleted_photos', v_photos
  );
end;
$$;

revoke all on function public.dev_reset_preview_gameplay_ledger() from public;
grant execute on function public.dev_reset_preview_gameplay_ledger() to service_role;
