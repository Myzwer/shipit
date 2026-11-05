-- Phase 2D-A: Schedule generation + exposure + player/public resolve + private grace.

create or replace function public.dev_generate_bounty_schedule(p_seed text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config;
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
  r record;
begin
  select * into v_config from public.cruise_config where is_active limit 1 for update;
  if not found then
    raise exception 'NO_ACTIVE_CRUISE_CONFIG' using errcode = 'P0001';
  end if;
  if v_config.label is distinct from 'development-only' then
    raise exception 'DEV_SCHEDULE_FORBIDDEN' using errcode = '42501';
  end if;

  select catalog_version_id into v_version from public.active_catalog_pointer where id = 1;
  if v_version is null then
    raise exception 'NO_ACTIVE_CATALOG' using errcode = 'P0001';
  end if;

  -- Idempotent: if schedule already exists for this cruise, return it (no reshuffle)
  if exists (select 1 from public.bounty_schedule_runs where cruise_config_id = v_config.id) then
    select id into v_run_id from public.bounty_schedule_runs where cruise_config_id = v_config.id;
    select count(*) into v_c_count from public.bounty_slots
      where cruise_config_id = v_config.id and category = 'cocktail';
    select count(*) into v_i_count from public.bounty_slots
      where cruise_config_id = v_config.id and category = 'ingredient';
    return jsonb_build_object(
      'idempotent', true,
      'schedule_run_id', v_run_id,
      'cocktail_slots', v_c_count,
      'ingredient_slots', v_i_count
    );
  end if;

  select coalesce(array_agg(cc.offering_id order by md5(cc.offering_id::text || coalesce(p_seed, ''))), array[]::uuid[])
  into v_cocktail_pool
  from public.cocktail_candidates cc
  where cc.catalog_version_id = v_version and cc.eligible = true;

  select coalesce(array_agg(ic.ingredient_id order by md5(ic.ingredient_id::text || coalesce(p_seed, '') || 'i')), array[]::uuid[])
  into v_ingredient_pool
  from public.ingredient_candidates ic
  where ic.catalog_version_id = v_version and ic.eligible = true;

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

  insert into public.bounty_schedule_runs (
    cruise_config_id, catalog_version_id, cocktail_slots, ingredient_slots, seed_token, notes
  ) values (
    v_config.id, v_version, 72, 39, p_seed,
    jsonb_build_object('source', 'dev_generate_bounty_schedule')
  )
  returning id into v_run_id;

  -- Cocktail slots
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

  -- Ingredient slots
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

  return jsonb_build_object(
    'idempotent', false,
    'schedule_run_id', v_run_id,
    'cocktail_slots', v_c_count,
    'ingredient_slots', v_i_count,
    'catalog_version_id', v_version
  );
end;
$$;

revoke all on function public.dev_generate_bounty_schedule(text) from public;
grant execute on function public.dev_generate_bounty_schedule(text) to service_role;

-- Mark missed paused slots when evaluating (no exposure)
create or replace function public.bounty_mark_missed_paused(
  p_config_id uuid,
  p_at_utc timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offset integer;
  v_ship timestamp;
  v_control public.game_control%rowtype;
  v_slot public.bounty_slots%rowtype;
  v_end_utc timestamptz;
  v_config public.cruise_config%rowtype;
begin
  select * into v_control from public.game_control where game = 'drinkit';
  if v_control.status is distinct from 'paused' then
    return;
  end if;
  select * into v_config from public.cruise_config where id = p_config_id;
  v_offset := public.clock_offset_at(p_config_id, v_config.base_ship_offset_minutes, p_at_utc);

  for v_slot in
    select * from public.bounty_slots
    where cruise_config_id = p_config_id
      and state = 'scheduled'
  loop
    v_end_utc := public.ship_local_to_utc(
      (v_slot.ship_date + v_slot.public_end_ship_local)::timestamp,
      public.clock_offset_at(
        p_config_id,
        v_config.base_ship_offset_minutes,
        public.ship_local_to_utc((v_slot.ship_date + v_slot.public_end_ship_local)::timestamp, v_offset)
      )
    );
    -- Approximate end using offset at evaluation time (stable enough for pause miss marking)
    v_end_utc := public.ship_local_to_utc(
      (v_slot.ship_date + v_slot.public_end_ship_local)::timestamp,
      v_offset
    );
    if v_end_utc <= p_at_utc then
      update public.bounty_slots
      set state = 'missed_paused', updated_at = now()
      where id = v_slot.id and state = 'scheduled';
    end if;
  end loop;
end;
$$;

-- Core resolver used by player + private grace + tests
create or replace function public.bounty_resolve_at(
  p_category public.bounty_category,
  p_at_utc timestamptz,
  p_expose boolean,
  p_include_grace boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_control public.game_control%rowtype;
  v_offset integer;
  v_ship timestamp;
  v_ship_date date;
  v_ship_time time;
  v_cruise_day integer;
  v_finale_utc timestamptz;
  v_slot public.bounty_slots%rowtype;
  v_offer public.bounty_slot_offers%rowtype;
  v_prev public.bounty_slots%rowtype;
  v_prev_offer public.bounty_slot_offers%rowtype;
  v_start_utc timestamptz;
  v_end_utc timestamptz;
  v_prev_end_utc timestamptz;
  v_grace jsonb := null;
  v_status text;
begin
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found then
    return jsonb_build_object('status', 'unavailable', 'reason', 'no_cruise_config');
  end if;

  select * into v_control from public.game_control where game = 'drinkit';
  v_offset := public.clock_offset_at(v_config.id, v_config.base_ship_offset_minutes, p_at_utc);
  v_ship := public.utc_to_ship_local(p_at_utc, v_offset);
  v_ship_date := v_ship::date;
  v_ship_time := v_ship::time;
  v_cruise_day := public.cruise_day_for_ship_date(v_config.day1_ship_date, v_ship_date, v_config.final_day);

  v_finale_utc := public.ship_local_to_utc(
    ((v_config.day1_ship_date + 6) + time '18:00')::timestamp,
    public.clock_offset_at(
      v_config.id,
      v_config.base_ship_offset_minutes,
      public.ship_local_to_utc(((v_config.day1_ship_date + 6) + time '18:00')::timestamp, v_offset)
    )
  );
  -- Use offset at evaluation for finale boundary
  v_finale_utc := public.ship_local_to_utc(
    ((v_config.day1_ship_date + (v_config.final_day - 1)) + time '18:00')::timestamp,
    v_offset
  );

  if p_at_utc >= v_finale_utc or v_control.finalized_at_utc is not null then
    return jsonb_build_object('status', 'finale', 'reason', 'friday_6pm_cutoff');
  end if;

  if v_control.status = 'paused' then
    perform public.bounty_mark_missed_paused(v_config.id, p_at_utc);
    return jsonb_build_object('status', 'paused', 'reason', 'drinkit_paused');
  end if;

  if v_cruise_day is null then
    return jsonb_build_object('status', 'unavailable', 'reason', 'outside_cruise');
  end if;

  -- Find public current slot
  select * into v_slot
  from public.bounty_slots s
  where s.cruise_config_id = v_config.id
    and s.category = p_category
    and s.ship_date = v_ship_date
    and s.public_start_ship_local <= v_ship_time
    and s.public_end_ship_local > v_ship_time
    and s.state is distinct from 'missed_paused'
  limit 1;

  if not found then
    return jsonb_build_object('status', 'unavailable', 'reason', 'no_public_slot');
  end if;

  if v_slot.state = 'missed_paused' then
    return jsonb_build_object('status', 'unavailable', 'reason', 'missed_while_paused');
  end if;

  select * into v_offer from public.bounty_slot_offers
  where id = v_slot.current_offer_id and is_active;

  if not found then
    return jsonb_build_object('status', 'unavailable', 'reason', 'no_active_offer');
  end if;

  v_start_utc := public.ship_local_to_utc((v_slot.ship_date + v_slot.public_start_ship_local)::timestamp, v_offset);
  v_end_utc := public.ship_local_to_utc((v_slot.ship_date + v_slot.public_end_ship_local)::timestamp, v_offset);

  -- Expose on authorized read (idempotent)
  if p_expose then
    if v_slot.state in ('scheduled', 'current') then
      update public.bounty_slots
      set state = 'current', updated_at = now()
      where id = v_slot.id and state in ('scheduled', 'current');

      update public.bounty_slot_offers
      set exposed_at_utc = coalesce(exposed_at_utc, p_at_utc)
      where id = v_offer.id and exposed_at_utc is null;

      insert into public.bounty_objective_exposures (
        cruise_config_id, category, canonical_key, first_offer_id, first_slot_id, first_exposed_at_utc
      ) values (
        v_config.id, p_category, v_offer.canonical_key, v_offer.id, v_slot.id, p_at_utc
      )
      on conflict (cruise_config_id, category, canonical_key) do nothing;

      -- Retire prior current slots in this category
      update public.bounty_slots
      set state = 'exposed', updated_at = now()
      where cruise_config_id = v_config.id
        and category = p_category
        and id is distinct from v_slot.id
        and state = 'current';

      -- Sync ingredient public card (current only; no future pool leak)
      if p_category = 'ingredient' then
        update public.ingredient_bounty_public_cards
        set exposure_status = 'retired'
        where exposure_status = 'current';

        delete from public.ingredient_bounty_public_cards
        where slot_key = v_slot.slot_key;

        insert into public.ingredient_bounty_public_cards (
          catalog_version_id, ingredient_id, ingredient_canonical_key, display_name,
          tier, points, known_bar_count, exposure_status, slot_key, exposed_at_utc
        ) values (
          v_offer.catalog_version_id,
          v_offer.ingredient_id,
          v_offer.canonical_key,
          v_offer.display_snapshot->>'display_name',
          (v_offer.tier)::public.ingredient_bounty_tier,
          v_offer.points,
          (v_offer.display_snapshot->>'known_bar_count')::integer,
          'current',
          v_slot.slot_key,
          coalesce((select exposed_at_utc from public.bounty_slot_offers where id = v_offer.id), p_at_utc)
        );
      end if;
    end if;
  end if;

  -- Private grace: previous exposed slot within 15 minutes (never after finale)
  if p_include_grace then
    select * into v_prev
    from public.bounty_slots s
    where s.cruise_config_id = v_config.id
      and s.category = p_category
      and s.state in ('exposed', 'current')
      and s.id is distinct from v_slot.id
      and public.ship_local_to_utc((s.ship_date + s.public_end_ship_local)::timestamp, v_offset) <= p_at_utc
      and public.ship_local_to_utc((s.ship_date + s.public_end_ship_local)::timestamp, v_offset)
          > p_at_utc - interval '15 minutes'
    order by s.ship_date desc, s.public_end_ship_local desc
    limit 1;

    if found then
      select * into v_prev_offer from public.bounty_slot_offers
      where id = v_prev.current_offer_id and is_active;
      if found and v_prev_offer.exposed_at_utc is not null and v_prev.state is distinct from 'skipped' then
        v_prev_end_utc := public.ship_local_to_utc(
          (v_prev.ship_date + v_prev.public_end_ship_local)::timestamp, v_offset
        );
        v_grace := jsonb_build_object(
          'offer_id', v_prev_offer.id,
          'slot_key', v_prev.slot_key,
          'canonical_key', v_prev_offer.canonical_key,
          'public_end_utc', v_prev_end_utc,
          'grace_ends_utc', v_prev_end_utc + interval '15 minutes',
          'display', v_prev_offer.display_snapshot
        );
      end if;
    end if;
  end if;

  v_status := 'active';
  return jsonb_build_object(
    'status', v_status,
    'category', p_category,
    'slot_id', v_slot.id,
    'slot_key', v_slot.slot_key,
    'offer_id', v_offer.id,
    'canonical_key', v_offer.canonical_key,
    'cruise_day', v_slot.cruise_day,
    'public_start_utc', v_start_utc,
    'public_end_utc', v_end_utc,
    'display', v_offer.display_snapshot,
    'grace_previous', v_grace
  );
end;
$$;

revoke all on function public.bounty_resolve_at(public.bounty_category, timestamptz, boolean, boolean) from public;

-- Player-facing reads. Optional p_at_utc is honored ONLY when cruise label is
-- development-only (local simulation). Production always uses server now().
create or replace function public.get_my_current_cocktail_bounty(
  p_at_utc timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
  v_config public.cruise_config%rowtype;
  v_at timestamptz;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;
  select * into v_config from public.cruise_config where is_active limit 1;
  if v_config.label = 'development-only' and p_at_utc is not null then
    v_at := p_at_utc;
  else
    v_at := now();
  end if;
  v_raw := public.bounty_resolve_at('cocktail', v_at, true, false);
  if v_raw->>'status' is distinct from 'active' then
    return v_raw;
  end if;
  return jsonb_build_object(
    'status', 'active',
    'offer_id', v_raw->>'offer_id',
    'slot_key', v_raw->>'slot_key',
    'drink_name', v_raw->'display'->>'drink_name',
    'designated_bar_key', v_raw->'display'->>'designated_bar_key',
    'designated_bar_name', v_raw->'display'->>'designated_bar_name',
    'tier', v_raw->'display'->>'tier',
    'points', (v_raw->'display'->>'points')::int,
    'listed_ingredients', v_raw->'display'->'listed_ingredients',
    'public_end_utc', v_raw->>'public_end_utc'
  );
end;
$$;

create or replace function public.get_my_current_ingredient_bounty(
  p_at_utc timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
  v_config public.cruise_config%rowtype;
  v_at timestamptz;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;
  select * into v_config from public.cruise_config where is_active limit 1;
  if v_config.label = 'development-only' and p_at_utc is not null then
    v_at := p_at_utc;
  else
    v_at := now();
  end if;
  v_raw := public.bounty_resolve_at('ingredient', v_at, true, false);
  if v_raw->>'status' is distinct from 'active' then
    return v_raw;
  end if;
  return jsonb_build_object(
    'status', 'active',
    'offer_id', v_raw->>'offer_id',
    'slot_key', v_raw->>'slot_key',
    'ingredient_key', v_raw->'display'->>'ingredient_key',
    'display_name', v_raw->'display'->>'display_name',
    'tier', v_raw->'display'->>'tier',
    'points', (v_raw->'display'->>'points')::int,
    'known_bar_count', (v_raw->'display'->>'known_bar_count')::int,
    'public_end_utc', v_raw->>'public_end_utc'
  );
end;
$$;

revoke all on function public.get_my_current_cocktail_bounty(timestamptz) from public;
revoke all on function public.get_my_current_ingredient_bounty(timestamptz) from public;
grant execute on function public.get_my_current_cocktail_bounty(timestamptz) to authenticated;
grant execute on function public.get_my_current_ingredient_bounty(timestamptz) to authenticated;

-- Private eligibility for future scoring (includes grace). Service/admin tests + future submit RPC.
create or replace function public.dev_resolve_bounty_eligibility_at(
  p_category public.bounty_category,
  p_at_utc timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.bounty_resolve_at(p_category, p_at_utc, true, true);
end;
$$;

revoke all on function public.dev_resolve_bounty_eligibility_at(public.bounty_category, timestamptz) from public;
grant execute on function public.dev_resolve_bounty_eligibility_at(public.bounty_category, timestamptz) to service_role;

-- Test helper: set Drink It! pause without Admin UI
create or replace function public.dev_set_drinkit_paused(p_paused boolean, p_at_utc timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_paused then
    update public.game_control
    set status = 'paused', paused_at_utc = p_at_utc, paused_by = null, updated_at = now()
    where game = 'drinkit';
  else
    update public.game_control
    set status = 'active', paused_at_utc = null, paused_by = null, updated_at = now()
    where game = 'drinkit' and status = 'paused';
  end if;
  return jsonb_build_object('paused', p_paused);
end;
$$;

revoke all on function public.dev_set_drinkit_paused(boolean, timestamptz) from public;
grant execute on function public.dev_set_drinkit_paused(boolean, timestamptz) to service_role;
