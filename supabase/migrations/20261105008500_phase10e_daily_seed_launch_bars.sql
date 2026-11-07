-- Phase 10E: align development-only daily Bar fixtures with launch-candidate bar keys.
-- Prior fixture keys (wake-view, good-spirits, poolside, carried-bar) are not present
-- after activating star-princess-launch-candidate-v1.

create or replace function public.dev_seed_daily_assignments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_version uuid;
  v_keys text[] := array[
    'wake-view-bar',
    'good-spirits-at-sea',
    'sea-view-bar',
    'crooners',
    'omalleys-irish-pub',
    'lido-bar',
    'promenade-bars'
  ];
  v_day integer;
  v_bar public.bars%rowtype;
  v_name text;
  v_bar_count integer := 0;
  v_daily_count integer := 0;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_config from public.cruise_config where is_active limit 1;
  if not found or v_config.label is distinct from 'development-only' then
    raise exception 'DEV_DAILY_SEED_FORBIDDEN' using errcode = '42501';
  end if;

  select id into v_version from public.catalog_versions
  where status = 'active' order by activated_at desc nulls last limit 1;
  if v_version is null then
    raise exception 'NO_ACTIVE_CATALOG' using errcode = 'P0001';
  end if;

  delete from public.bar_bounties where cruise_config_id = v_config.id;
  delete from public.daily_challenges where cruise_config_id = v_config.id;

  for v_day in 1..7 loop
    select b.* into v_bar
    from public.bars b
    where b.canonical_key = v_keys[v_day];
    if not found then
      raise exception 'BAR_KEY_MISSING:%', v_keys[v_day] using errcode = 'P0001';
    end if;
    select coalesce(cvb.name, v_bar.canonical_key) into v_name
    from public.catalog_version_bars cvb
    where cvb.catalog_version_id = v_version and cvb.bar_id = v_bar.id;

    insert into public.bar_bounties (
      cruise_config_id, day_number, bar_id, catalog_version_id, bar_canonical_key, bar_display_name
    ) values (
      v_config.id, v_day, v_bar.id, v_version, v_bar.canonical_key, coalesce(v_name, v_bar.canonical_key)
    );
    v_bar_count := v_bar_count + 1;
  end loop;

  -- Development-only example challenges (NOT production content).
  insert into public.daily_challenges (
    cruise_config_id, day_number, title, instructions, location_name,
    meeting_time_ship_local, is_all_hands, photo_required, points
  ) values
    (v_config.id, 1, 'Fixture Easy Stretch',
     'Take a photo completing a simple stretch on the open deck. Development fixture only.',
     null, null, false, true, 50),
    (v_config.id, 2, 'Fixture Named Bar Visit',
     'Visit the named fixture lounge and photograph the entrance sign. Development fixture only.',
     'Wake View Bar', null, false, true, 50),
    (v_config.id, 3, 'Fixture All-Hands Toast',
     'Join the All-Hands gathering and photograph the group toast. Development fixture only.',
     'Main Theater', time '16:00', true, true, 50),
    (v_config.id, 4, 'Fixture Timed Meetup',
     'Meet at the specified Ship Time and photograph the meetup spot. Development fixture only.',
     'Sea View Bar', time '14:30', false, true, 50),
    (v_config.id, 5, 'Fixture Photo Scavenger',
     'Photograph something blue on Deck 15. Photo required. Development fixture only.',
     'Deck 15', null, false, true, 50),
    (v_config.id, 6, 'Fixture Horizon Pose',
     'Photograph a sunset or horizon view from the aft railing. Development fixture only.',
     'Aft Observation', null, false, true, 50),
    (v_config.id, 7, 'Fixture Finale Wave',
     'Photograph a goodbye wave before 6:00 PM Ship Time. Development fixture only.',
     'Gangway Plaza', time '17:00', false, true, 50);

  v_daily_count := 7;

  return jsonb_build_object(
    'bar_assignments', v_bar_count,
    'daily_challenges', v_daily_count,
    'cruise_config_id', v_config.id,
    'catalog_version_id', v_version,
    'label', 'development-only-fixtures'
  );
end;
$$;

revoke all on function public.dev_seed_daily_assignments() from public;
revoke all on function public.dev_seed_daily_assignments() from authenticated, anon;
grant execute on function public.dev_seed_daily_assignments() to service_role;
