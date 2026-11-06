-- Fix: cannot set session_replication_role under local Supabase roles.
-- Clear scavenger data via existing reset helper, then unbind any remaining
-- photos attached to development-only submissions before cruise cascade.

create or replace function public.dev_seed_cruise_clock(
  p_day1_ship_date date,
  p_base_offset_minutes integer,
  p_label text default 'development-only'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_day integer;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_label is distinct from 'development-only' then
    raise exception 'DEV_SEED_REQUIRES_DEVELOPMENT_ONLY_LABEL';
  end if;

  perform pg_advisory_xact_lock(872334501);

  if exists (
    select 1 from public.cruise_config
    where is_active and label is distinct from 'development-only'
  ) then
    raise exception 'ACTIVE_NON_DEV_CONFIG_BLOCKS_DEV_SEED';
  end if;

  -- Clears scavenger photos/completions/submissions (trigger-safe).
  perform public.dev_reset_scavenger_test_data();

  -- Drink It! / other bound photos on the development cruise also block cascade.
  begin
    execute 'alter table public.photos disable trigger photos_protect_bound_trg';

    update public.photos p
    set status = 'abandoned',
        bound_submission_id = null,
        bound_at_utc = null,
        abandoned_at_utc = coalesce(p.abandoned_at_utc, clock_timestamp()),
        storage_cleanup_status = 'pending'
    where p.bound_submission_id in (
      select s.id
      from public.submissions s
      join public.cruise_config c on c.id = s.cruise_config_id
      where c.label = 'development-only'
    );

    delete from public.photos
    where status = 'abandoned'
      and storage_cleanup_status = 'pending'
      and bound_submission_id is null;

    execute 'alter table public.photos enable trigger photos_protect_bound_trg';
  exception
    when others then
      begin
        execute 'alter table public.photos enable trigger photos_protect_bound_trg';
      exception when others then
        null;
      end;
      raise;
  end;

  delete from public.cruise_config where label = 'development-only';

  insert into public.cruise_config (
    day1_ship_date, base_ship_offset_minutes, label, is_active
  ) values (
    p_day1_ship_date, p_base_offset_minutes, p_label, true
  )
  returning id into v_id;

  for v_day in 1..7 loop
    insert into public.ship_clock_plan (cruise_config_id, day_number, delta_minutes, enabled)
    values (v_id, v_day, 0, true);
  end loop;

  update public.game_control
  set status = 'pre_cruise',
      paused_at_utc = null,
      paused_by = null,
      finalized_at_utc = null,
      updated_at = now()
  where game in ('drinkit', 'shipit');

  delete from public.admin_audit_log where true;

  perform public.rebuild_scheduled_clock_events(v_id, timestamptz '1970-01-01');

  return v_id;
end;
$$;

revoke all on function public.dev_seed_cruise_clock(date, integer, text) from public;
grant execute on function public.dev_seed_cruise_clock(date, integer, text) to service_role;
