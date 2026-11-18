-- FINAL Bar Bounty schedule (organizer-approved venue sequence).
-- Forward-only: replaces initialize_bounty_schedule_core Bar Bounty day keys only.
-- Does not alter Daily Challenge venues, Cocktail/Ingredient pool selection,
-- scoring, request-id idempotency, or admin_initialize_bounty_schedule wrapper.
-- Does not initialize or mutate any live bounty schedule data.
--
-- Days 1–7 Bar Bounty venues:
--   1 wake-view-bar
--   2 good-spirits-at-sea
--   3 the-mix
--   4 wheelhouse-bar
--   5 star-bar
--   6 princess-live
--   7 promenade-bars
--
-- Good Spirits remains a valid Bar Bounty location: Category C / unpriced-menu
-- restrictions affect Cocktail/Ingredient bounty eligibility, not bar_bounties
-- venue assignment (existence check only via BAR_KEY_MISSING).

create or replace function public.initialize_bounty_schedule_core(
  p_seed text,
  p_source text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_version uuid;
  v_day integer;
  v_idx integer;
  v_starts time[];
  v_start time;
  v_end time;
  v_ship_date date;
  v_slot_id uuid;
  v_offer_id uuid;
  v_cocktail_pool uuid[];
  v_ingredient_pool uuid[];
  v_pick uuid;
  v_concept uuid;
  v_offering uuid;
  v_ing uuid;
  v_key text;
  v_tier text;
  v_points integer;
  v_snap jsonb;
  v_bar_key text;
  v_bar_name text;
  v_drink_name text;
  v_ing_name text;
  v_bar_count integer;
  v_run_id uuid;
  v_c_count integer := 0;
  v_i_count integer := 0;
  v_bar_assignments integer := 0;
  v_daily_inserted integer := 0;
  v_daily_updated integer := 0;
  v_daily_count integer := 0;
  v_existing_id uuid;
  v_bar public.bars%rowtype;
  v_name text;
  r record;
  v_bar_keys text[] := array[
    'wake-view-bar',
    'good-spirits-at-sea',
    'the-mix',
    'wheelhouse-bar',
    'star-bar',
    'princess-live',
    'promenade-bars'
  ];
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
  select * into v_config from public.cruise_config where is_active limit 1 for update;
  if not found then
    raise exception 'NO_ACTIVE_CRUISE_CONFIG' using errcode = 'P0001';
  end if;

  select catalog_version_id into v_version from public.active_catalog_pointer where id = 1;
  if v_version is null then
    raise exception 'NO_ACTIVE_CATALOG' using errcode = 'P0001';
  end if;

  -- Eligible Cocktail pool: active catalog only; never virtual Mobile Order.
  select coalesce(array_agg(cc.offering_id order by md5(cc.offering_id::text || coalesce(p_seed, ''))), array[]::uuid[])
  into v_cocktail_pool
  from public.cocktail_candidates cc
  join public.bar_offerings bo on bo.id = cc.offering_id
  join public.bars b on b.id = bo.bar_id
  where cc.catalog_version_id = v_version
    and cc.eligible is true
    and coalesce(b.is_virtual, false) is false
    and b.canonical_key is distinct from 'mobile-order';

  select coalesce(array_agg(ic.ingredient_id order by md5(ic.ingredient_id::text || coalesce(p_seed, '') || 'i')), array[]::uuid[])
  into v_ingredient_pool
  from public.ingredient_candidates ic
  where ic.catalog_version_id = v_version
    and ic.eligible is true;

  if coalesce(array_length(v_cocktail_pool, 1), 0) < 72 then
    raise exception 'COCKTAIL_POOL_SHORTAGE: need 72 eligible cocktail candidates, have %',
      coalesce(array_length(v_cocktail_pool, 1), 0)
      using errcode = 'P0001';
  end if;
  if coalesce(array_length(v_ingredient_pool, 1), 0) < 39 then
    raise exception 'INGREDIENT_POOL_SHORTAGE: need 39 eligible ingredient candidates, have %',
      coalesce(array_length(v_ingredient_pool, 1), 0)
      using errcode = 'P0001';
  end if;

  -- Validate bar itinerary keys before writing any slots.
  for v_day in 1..7 loop
    if not exists (select 1 from public.bars b where b.canonical_key = v_bar_keys[v_day]) then
      raise exception 'BAR_KEY_MISSING:%', v_bar_keys[v_day] using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.bars b where b.canonical_key = v_daily_bar_keys[v_day]) then
      raise exception 'DAILY_BAR_KEY_MISSING:%', v_daily_bar_keys[v_day] using errcode = 'P0001';
    end if;
  end loop;

  insert into public.bounty_schedule_runs (
    cruise_config_id, catalog_version_id, cocktail_slots, ingredient_slots,
    seed_token, created_by, notes
  ) values (
    v_config.id, v_version, 72, 39, p_seed, p_actor_id,
    jsonb_build_object('source', p_source)
  )
  returning id into v_run_id;

  -- Cocktail slots (Days 1–6: 11 hourly 12–23; Day 7: 6 hourly 12–18)
  for v_day in 1..7 loop
    v_starts := public.bounty_cocktail_slot_starts(v_day);
    v_ship_date := v_config.day1_ship_date + (v_day - 1);
    v_idx := 0;
    foreach v_start in array v_starts loop
      v_end := (v_start + interval '1 hour')::time;
      insert into public.bounty_slots (
        cruise_config_id, catalog_version_id, category, cruise_day, slot_index, slot_key,
        ship_date, public_start_ship_local, public_end_ship_local, state
      ) values (
        v_config.id, v_version, 'cocktail', v_day, v_idx,
        format('cocktail:day:%s:h%s', v_day, to_char(v_start, 'HH24')),
        v_ship_date, v_start, v_end::time, 'scheduled'
      )
      returning id into v_slot_id;

      v_pick := v_cocktail_pool[v_c_count + 1];
      v_c_count := v_c_count + 1;

      select bo.drink_concept_id, bo.id, dc.canonical_key, cvdc.display_name,
             cc.tier::text, cc.points, b.canonical_key, cvb.name
      into v_concept, v_offering, v_key, v_drink_name, v_tier, v_points, v_bar_key, v_bar_name
      from public.bar_offerings bo
      join public.drink_concepts dc on dc.id = bo.drink_concept_id
      join public.cocktail_candidates cc
        on cc.offering_id = bo.id and cc.catalog_version_id = v_version
      join public.bars b on b.id = bo.bar_id
      join public.catalog_version_drink_concepts cvdc
        on cvdc.catalog_version_id = v_version and cvdc.drink_concept_id = dc.id
      join public.catalog_version_bars cvb
        on cvb.catalog_version_id = v_version and cvb.bar_id = b.id
      where bo.id = v_pick;

      select coalesce(jsonb_agg(jsonb_build_object(
        'ingredient_key', i.canonical_key,
        'display_label', coalesce(coi.display_label, cvi.display_name)
      ) order by coalesce(coi.display_label, cvi.display_name)), '[]'::jsonb)
      into v_snap
      from public.catalog_offering_ingredients coi
      join public.ingredients i on i.id = coi.ingredient_id
      join public.catalog_version_ingredients cvi
        on cvi.catalog_version_id = v_version and cvi.ingredient_id = i.id
      where coi.catalog_version_id = v_version and coi.offering_id = v_offering;

      v_snap := jsonb_build_object(
        'drink_key', v_key,
        'drink_name', v_drink_name,
        'designated_bar_key', v_bar_key,
        'designated_bar_name', v_bar_name,
        'tier', v_tier,
        'points', v_points,
        'listed_ingredients', coalesce(v_snap, '[]'::jsonb)
      );

      insert into public.bounty_slot_offers (
        slot_id, catalog_version_id, canonical_key, cocktail_concept_id, cocktail_offering_id,
        tier, points, display_snapshot, is_active, reason
      ) values (
        v_slot_id, v_version, v_key, v_concept, v_offering, v_tier, v_points, v_snap, true, 'initial'
      )
      returning id into v_offer_id;

      update public.bounty_slots set current_offer_id = v_offer_id where id = v_slot_id;
      v_idx := v_idx + 1;
    end loop;
  end loop;

  -- Ingredient slots (2h windows; final Days 1–6 window is 22–23)
  for v_day in 1..7 loop
    v_ship_date := v_config.day1_ship_date + (v_day - 1);
    v_idx := 0;
    for r in select * from public.bounty_ingredient_windows(v_day) loop
      insert into public.bounty_slots (
        cruise_config_id, catalog_version_id, category, cruise_day, slot_index, slot_key,
        ship_date, public_start_ship_local, public_end_ship_local, state
      ) values (
        v_config.id, v_version, 'ingredient', v_day, v_idx,
        format('ingredient:day:%s:h%s', v_day, to_char(r.start_t, 'HH24')),
        v_ship_date, r.start_t, r.end_t, 'scheduled'
      )
      returning id into v_slot_id;

      v_pick := v_ingredient_pool[v_i_count + 1];
      v_i_count := v_i_count + 1;

      select i.id, i.canonical_key, cvi.display_name, ic.tier::text, ic.points, ic.known_bar_count
      into v_ing, v_key, v_ing_name, v_tier, v_points, v_bar_count
      from public.ingredients i
      join public.ingredient_candidates ic
        on ic.ingredient_id = i.id and ic.catalog_version_id = v_version
      join public.catalog_version_ingredients cvi
        on cvi.catalog_version_id = v_version and cvi.ingredient_id = i.id
      where i.id = v_pick;

      v_snap := jsonb_build_object(
        'ingredient_key', v_key,
        'display_name', v_ing_name,
        'tier', v_tier,
        'points', v_points,
        'known_bar_count', v_bar_count
      );

      insert into public.bounty_slot_offers (
        slot_id, catalog_version_id, canonical_key, ingredient_id,
        tier, points, display_snapshot, is_active, reason
      ) values (
        v_slot_id, v_version, v_key, v_ing, v_tier, v_points, v_snap, true, 'initial'
      )
      returning id into v_offer_id;

      update public.bounty_slots set current_offer_id = v_offer_id where id = v_slot_id;
      v_idx := v_idx + 1;
    end loop;
  end loop;

  -- Bar Bounty day sequence (approved physical bars)
  delete from public.bar_bounties where cruise_config_id = v_config.id;
  for v_day in 1..7 loop
    select b.* into v_bar from public.bars b where b.canonical_key = v_bar_keys[v_day];
    select coalesce(cvb.name, v_bar.canonical_key) into v_name
    from public.catalog_version_bars cvb
    where cvb.catalog_version_id = v_version and cvb.bar_id = v_bar.id;

    insert into public.bar_bounties (
      cruise_config_id, day_number, bar_id, catalog_version_id, bar_canonical_key, bar_display_name
    ) values (
      v_config.id, v_day, v_bar.id, v_version, v_bar.canonical_key, coalesce(v_name, v_bar.canonical_key)
    );
    v_bar_assignments := v_bar_assignments + 1;
  end loop;

  -- Daily Challenges (preserve announcement text on update by day)
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
      where id = v_existing_id;
      v_daily_updated := v_daily_updated + 1;
    end if;
  end loop;

  select count(*)::integer into v_daily_count
  from public.daily_challenges
  where cruise_config_id = v_config.id;

  if v_c_count is distinct from 72 or v_i_count is distinct from 39
     or v_bar_assignments is distinct from 7 or v_daily_count is distinct from 7 then
    raise exception 'SCHEDULE_GENERATION_INCOMPLETE' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'INITIALIZED',
    'idempotent', false,
    'schedule_run_id', v_run_id,
    'cocktail_slots', v_c_count,
    'ingredient_slots', v_i_count,
    'bar_assignments', v_bar_assignments,
    'daily_challenges', v_daily_count,
    'daily_inserted', v_daily_inserted,
    'daily_updated', v_daily_updated,
    'catalog_version_id', v_version,
    'cruise_config_id', v_config.id,
    'source', p_source,
    'gameplay_started', false
  );
end;
$$;

revoke all on function public.initialize_bounty_schedule_core(text, text, uuid) from public;
