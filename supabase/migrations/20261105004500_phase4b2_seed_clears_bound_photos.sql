-- Local cruise reseed deletes development-only cruise_config, which cascades to
-- submissions. Bound photos use ON DELETE RESTRICT so seed must clear them first.
-- Production configs are never touched by this development-only helper.

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

  -- Serialize concurrent local test suites that reseed the same development config.
  perform pg_advisory_xact_lock(872334501);

  if exists (
    select 1 from public.cruise_config
    where is_active and label is distinct from 'development-only'
  ) then
    raise exception 'ACTIVE_NON_DEV_CONFIG_BLOCKS_DEV_SEED';
  end if;

  -- Bound photos block submission cascade deletes. Clear local photo/scavenger
  -- evidence before removing the development cruise (never production).
  perform set_config('session_replication_role', 'replica', true);

  delete from public.photos p
  where p.bound_submission_id in (
      select s.id
      from public.submissions s
      join public.cruise_config c on c.id = s.cruise_config_id
      where c.label = 'development-only'
    )
    or p.purpose = 'scavenger';

  delete from public.scavenger_completions sc
  where exists (
    select 1 from public.cruise_config c
    where c.id = sc.cruise_config_id and c.label = 'development-only'
  );

  delete from public.gallery_events ge
  where ge.kind = 'scavenger'
    and (
      ge.submission_id is null
      or exists (
        select 1
        from public.submissions s
        join public.cruise_config c on c.id = s.cruise_config_id
        where s.id = ge.submission_id
          and c.label = 'development-only'
      )
    );

  update public.submissions s
  set gallery_event_id = null
  where s.kind in ('scavenger_completion', 'scavenger_dev_fixture')
    and exists (
      select 1 from public.cruise_config c
      where c.id = s.cruise_config_id and c.label = 'development-only'
    );

  delete from public.submissions s
  where s.kind in ('scavenger_completion', 'scavenger_dev_fixture')
    and exists (
      select 1 from public.cruise_config c
      where c.id = s.cruise_config_id and c.label = 'development-only'
    );

  perform set_config('session_replication_role', 'origin', true);

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
