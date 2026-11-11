-- Phase C2.1: Final Daily Challenge copy + Day 5/6 schedule correction.
-- Day 5 = Bartender's Choice (All Hands) @ Good Spirits
-- Day 6 = Martini Choice (Bring a Friend) @ Bellini's
-- Preserve challenge UUIDs; swap day 5/6 announcements so meetup notes follow All Hands content.

-- ---------------------------------------------------------------------------
-- One-time: swap day 5 <-> day 6 announcements before content rewrite
-- (Old day 6 was All Hands Bartender's; new day 5 is that challenge.)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_ann5 text;
  v_ann6 text;
  v_has5 boolean;
  v_has6 boolean;
begin
  for r in
    select cruise_config_id
    from public.daily_challenges
    group by cruise_config_id
  loop
    select admin_announcement into v_ann5
    from public.daily_challenges
    where cruise_config_id = r.cruise_config_id and day_number = 5;
    v_has5 := found;

    select admin_announcement into v_ann6
    from public.daily_challenges
    where cruise_config_id = r.cruise_config_id and day_number = 6;
    v_has6 := found;

    if v_has5 and v_has6 then
      update public.daily_challenges
      set admin_announcement = v_ann6
      where cruise_config_id = r.cruise_config_id and day_number = 5;

      update public.daily_challenges
      set admin_announcement = v_ann5
      where cruise_config_id = r.cruise_config_id and day_number = 6;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Apply final catalog content to every existing cruise (preserve ids)
-- ---------------------------------------------------------------------------
update public.daily_challenges dc
set
  title = v.title,
  instructions = v.instructions,
  location_name = v.location_name,
  bar_canonical_key = v.bar_canonical_key,
  meeting_time_ship_local = null,
  is_all_hands = (v.participation_mode = 'all_hands'),
  participation_mode = v.participation_mode,
  photo_required = true,
  points = 50
from (
  values
    (1, 'Tequila Shot',
     'Kick off the cruise with a shot of tequila! Gather the crew at Lido for our first group toast of the week.',
     'Lido Bar', 'lido-bar', 'all_hands'),
    (2, 'Switcheroo',
     'Time to switch things up! Pair up with someone older or younger than you. The older person picks and orders a drink for the younger person.',
     'Sea View Bar', 'sea-view-bar', 'all_hands'),
    (3, 'Irish Pub Pick',
     'Head to O''Malley''s with a friend and embrace your Irish side! Choose from whiskey, Guinness, Irish Red, or Irish Coffee.',
     'O''Malley''s Irish Pub', 'omalleys-irish-pub', 'bring_a_friend'),
    (4, '80''s Drink Night',
     'Travel back to the ''80s! Grab a friend and order a Long Island Iced Tea, one of the decade''s iconic cocktails.',
     'Crooners', 'crooners', 'bring_a_friend'),
    (5, 'Bartender''s Choice',
     'Let the bartender decide! Ask for their most popular cocktail and see what makes it a crowd favorite.',
     'Good Spirits at Sea', 'good-spirits-at-sea', 'all_hands'),
    (6, 'Martini Choice',
     'Shaken or stirred? Bring a friend to Bellini''s and enjoy a martini of your choice.',
     'Bellini''s Cocktail Bar', 'bellinis-cocktail-bar', 'bring_a_friend'),
    (7, 'Miami Vice Finale',
     'One last tropical toast! Gather the crew at Cascade and celebrate the end of the cruise with a frozen Miami Vice.',
     'Cascade Bar', 'cascade-bar', 'all_hands')
) as v(day_number, title, instructions, location_name, bar_canonical_key, participation_mode)
where dc.day_number = v.day_number;

-- ---------------------------------------------------------------------------
-- Dev seed: reproduce final schedule on future reseeds (preserve announcements by day)
-- ---------------------------------------------------------------------------
create or replace function public.dev_seed_daily_assignments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_version uuid;
  v_bar_keys text[] := array[
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
  v_daily_inserted integer := 0;
  v_daily_updated integer := 0;
  v_existing_id uuid;
  v_titles text[] := array[
    'Tequila Shot',
    'Switcheroo',
    'Irish Pub Pick',
    '80''s Drink Night',
    'Bartender''s Choice',
    'Martini Choice',
    'Miami Vice Finale'
  ];
  v_locations text[] := array[
    'Lido Bar',
    'Sea View Bar',
    'O''Malley''s Irish Pub',
    'Crooners',
    'Good Spirits at Sea',
    'Bellini''s Cocktail Bar',
    'Cascade Bar'
  ];
  v_daily_bar_keys text[] := array[
    'lido-bar',
    'sea-view-bar',
    'omalleys-irish-pub',
    'crooners',
    'good-spirits-at-sea',
    'bellinis-cocktail-bar',
    'cascade-bar'
  ];
  v_modes text[] := array[
    'all_hands',
    'all_hands',
    'bring_a_friend',
    'bring_a_friend',
    'all_hands',
    'bring_a_friend',
    'all_hands'
  ];
  v_instructions text[] := array[
    'Kick off the cruise with a shot of tequila! Gather the crew at Lido for our first group toast of the week.',
    'Time to switch things up! Pair up with someone older or younger than you. The older person picks and orders a drink for the younger person.',
    'Head to O''Malley''s with a friend and embrace your Irish side! Choose from whiskey, Guinness, Irish Red, or Irish Coffee.',
    'Travel back to the ''80s! Grab a friend and order a Long Island Iced Tea, one of the decade''s iconic cocktails.',
    'Let the bartender decide! Ask for their most popular cocktail and see what makes it a crowd favorite.',
    'Shaken or stirred? Bring a friend to Bellini''s and enjoy a martini of your choice.',
    'One last tropical toast! Gather the crew at Cascade and celebrate the end of the cruise with a frozen Miami Vice.'
  ];
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

  for v_day in 1..7 loop
    select b.* into v_bar
    from public.bars b
    where b.canonical_key = v_bar_keys[v_day];
    if not found then
      raise exception 'BAR_KEY_MISSING:%', v_bar_keys[v_day] using errcode = 'P0001';
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

  for v_day in 1..7 loop
    if not exists (
      select 1 from public.bars b where b.canonical_key = v_daily_bar_keys[v_day]
    ) then
      raise exception 'DAILY_BAR_KEY_MISSING:%', v_daily_bar_keys[v_day] using errcode = 'P0001';
    end if;
  end loop;

  for v_day in 1..7 loop
    select id into v_existing_id
    from public.daily_challenges
    where cruise_config_id = v_config.id and day_number = v_day;

    if v_existing_id is null then
      insert into public.daily_challenges (
        cruise_config_id, day_number, title, instructions, location_name,
        bar_canonical_key, meeting_time_ship_local, is_all_hands, participation_mode,
        photo_required, points, admin_announcement
      ) values (
        v_config.id,
        v_day,
        v_titles[v_day],
        v_instructions[v_day],
        v_locations[v_day],
        v_daily_bar_keys[v_day],
        null,
        (v_modes[v_day] = 'all_hands'),
        v_modes[v_day],
        true,
        50,
        null
      );
      v_daily_inserted := v_daily_inserted + 1;
    else
      update public.daily_challenges
      set title = v_titles[v_day],
          instructions = v_instructions[v_day],
          location_name = v_locations[v_day],
          bar_canonical_key = v_daily_bar_keys[v_day],
          meeting_time_ship_local = null,
          is_all_hands = (v_modes[v_day] = 'all_hands'),
          participation_mode = v_modes[v_day],
          photo_required = true,
          points = 50
          -- admin_announcement intentionally preserved by day_number
      where id = v_existing_id;
      v_daily_updated := v_daily_updated + 1;
    end if;
  end loop;

  select count(*)::integer into v_daily_count
  from public.daily_challenges
  where cruise_config_id = v_config.id;

  if v_daily_count is distinct from 7 then
    raise exception 'DAILY_CHALLENGE_COUNT_INVALID:%', v_daily_count using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'bar_assignments', v_bar_count,
    'daily_challenges', v_daily_count,
    'daily_inserted', v_daily_inserted,
    'daily_updated', v_daily_updated,
    'cruise_config_id', v_config.id,
    'catalog_version_id', v_version,
    'label', 'c2-1-final-daily-challenge-copy'
  );
end;
$$;

revoke all on function public.dev_seed_daily_assignments() from public;
revoke all on function public.dev_seed_daily_assignments() from authenticated, anon;
grant execute on function public.dev_seed_daily_assignments() to service_role;
