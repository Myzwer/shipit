-- R5 / REP-SCHED-001 / INT-SCHED-001
-- Production-safe Admin initialization of the full seven-day bounty schedule.
-- Does NOT start gameplay, mutate Ship Clock, or require development-only fixtures.
-- Depends on schedule ledger (015/017), daily assignments (098), catalog publish rebind (068),
-- and physical-bar flag from 10900. Independent of Wrapped ranks migration 11100.

-- ---------------------------------------------------------------------------
-- Durable Admin request ledger (lost-response / double-tap safe)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_bounty_schedule_init_requests (
  client_request_id uuid primary key,
  fingerprint text not null,
  actor_id uuid references public.players (id) on delete set null,
  cruise_config_id uuid references public.cruise_config (id) on delete set null,
  catalog_version_id uuid references public.catalog_versions (id) on delete set null,
  seed_token text,
  result_json jsonb not null,
  received_at_utc timestamptz not null default clock_timestamp(),
  completed_at_utc timestamptz not null default clock_timestamp(),
  constraint admin_bounty_schedule_init_requests_fp_nonempty
    check (char_length(trim(fingerprint)) > 0)
);

comment on table public.admin_bounty_schedule_init_requests is
  'Idempotent Admin initialize-bounty-schedule ledger keyed by client_request_id + fingerprint.';

create index if not exists admin_bounty_schedule_init_requests_created_idx
  on public.admin_bounty_schedule_init_requests (received_at_utc desc);

alter table public.admin_bounty_schedule_init_requests enable row level security;
alter table public.admin_bounty_schedule_init_requests force row level security;

revoke all on table public.admin_bounty_schedule_init_requests from anon, authenticated;
grant select on table public.admin_bounty_schedule_init_requests to authenticated;

drop policy if exists admin_bounty_schedule_init_requests_select_admin
  on public.admin_bounty_schedule_init_requests;
create policy admin_bounty_schedule_init_requests_select_admin
  on public.admin_bounty_schedule_init_requests for select to authenticated
  using (public.is_admin());

create or replace function public.bounty_schedule_init_fingerprint(p_seed text)
returns text
language sql
immutable
parallel safe
as $$
  select 'initialize_bounty_schedule:' || coalesce(p_seed, '');
$$;

revoke all on function public.bounty_schedule_init_fingerprint(text) from public;

-- ---------------------------------------------------------------------------
-- Completeness snapshot (72 cocktail + 39 ingredient + 7 bar + 7 daily)
-- ---------------------------------------------------------------------------
create or replace function public.bounty_schedule_completeness(p_cruise_config_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c integer := 0;
  v_i integer := 0;
  v_bar integer := 0;
  v_daily integer := 0;
  v_runs integer := 0;
  v_claims integer := 0;
  v_complete boolean;
begin
  select count(*) into v_c
  from public.bounty_slots
  where cruise_config_id = p_cruise_config_id and category = 'cocktail';

  select count(*) into v_i
  from public.bounty_slots
  where cruise_config_id = p_cruise_config_id and category = 'ingredient';

  select count(*) into v_bar
  from public.bar_bounties
  where cruise_config_id = p_cruise_config_id;

  select count(*) into v_daily
  from public.daily_challenges
  where cruise_config_id = p_cruise_config_id;

  select count(*) into v_runs
  from public.bounty_schedule_runs
  where cruise_config_id = p_cruise_config_id;

  select count(*) into v_claims
  from public.bounty_claims
  where cruise_config_id = p_cruise_config_id
    and status = 'active';

  v_complete := (v_c = 72 and v_i = 39 and v_bar = 7 and v_daily = 7);

  return jsonb_build_object(
    'cocktail_slots', v_c,
    'ingredient_slots', v_i,
    'bar_assignments', v_bar,
    'daily_challenges', v_daily,
    'schedule_runs', v_runs,
    'active_claims', v_claims,
    'complete', v_complete,
    'partial', (v_c + v_i + v_bar + v_daily + v_runs) > 0 and not v_complete
  );
end;
$$;

revoke all on function public.bounty_schedule_completeness(uuid) from public;
grant execute on function public.bounty_schedule_completeness(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Core generator (security definer; only called by Admin / status wrappers)
-- Atomic: any shortage or missing bar raises and rolls back the whole init.
-- ---------------------------------------------------------------------------
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
    'sea-view-bar',
    'crooners',
    'omalleys-irish-pub',
    'lido-bar',
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

-- ---------------------------------------------------------------------------
-- Admin status (read-only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_bounty_schedule_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_control public.game_control%rowtype;
  v_version uuid;
  v_complete jsonb;
  v_cocktail_eligible integer := 0;
  v_ingredient_eligible integer := 0;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_config from public.cruise_config where is_active limit 1;
  select * into v_control from public.game_control where game = 'drinkit';
  select catalog_version_id into v_version from public.active_catalog_pointer where id = 1;

  if v_config.id is null then
    return jsonb_build_object(
      'ok', true,
      'initialized', false,
      'can_initialize', false,
      'code', 'NO_ACTIVE_CRUISE_CONFIG',
      'message', 'No active cruise configuration.'
    );
  end if;

  v_complete := public.bounty_schedule_completeness(v_config.id);

  if v_version is not null then
    select count(*) into v_cocktail_eligible
    from public.cocktail_candidates cc
    join public.bar_offerings bo on bo.id = cc.offering_id
    join public.bars b on b.id = bo.bar_id
    where cc.catalog_version_id = v_version
      and cc.eligible is true
      and coalesce(b.is_virtual, false) is false;

    select count(*) into v_ingredient_eligible
    from public.ingredient_candidates ic
    where ic.catalog_version_id = v_version and ic.eligible is true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'cruise_config_id', v_config.id,
    'cruise_label', v_config.label,
    'day1_ship_date', v_config.day1_ship_date,
    'catalog_version_id', v_version,
    'drinkit_status', v_control.status,
    'finalized_at_utc', v_control.finalized_at_utc,
    'initialized', coalesce((v_complete->>'complete')::boolean, false),
    'partial', coalesce((v_complete->>'partial')::boolean, false),
    'completeness', v_complete,
    'eligible_cocktail_candidates', v_cocktail_eligible,
    'eligible_ingredient_candidates', v_ingredient_eligible,
    'can_initialize',
      v_control.finalized_at_utc is null
      and v_control.status is distinct from 'final'
      and v_version is not null
      and coalesce((v_complete->>'complete')::boolean, false) is not true
      and coalesce((v_complete->>'partial')::boolean, false) is not true
      and v_cocktail_eligible >= 72
      and v_ingredient_eligible >= 39,
    'gameplay_started_by_schedule', false
  );
end;
$$;

revoke all on function public.admin_get_bounty_schedule_status() from public;
grant execute on function public.admin_get_bounty_schedule_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin initialize (production path)
-- ---------------------------------------------------------------------------
create or replace function public.admin_initialize_bounty_schedule(
  p_client_request_id uuid,
  p_seed text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_fp text;
  v_existing public.admin_bounty_schedule_init_requests%rowtype;
  v_config public.cruise_config%rowtype;
  v_control public.game_control%rowtype;
  v_version uuid;
  v_complete jsonb;
  v_result jsonb;
  v_core jsonb;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if p_client_request_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_REQUEST_ID',
      'message', 'A client_request_id is required.'
    );
  end if;

  v_actor := public.current_player_id();
  v_fp := public.bounty_schedule_init_fingerprint(p_seed);

  select * into v_existing
  from public.admin_bounty_schedule_init_requests
  where client_request_id = p_client_request_id;

  if found then
    if v_existing.fingerprint is distinct from v_fp then
      return jsonb_build_object(
        'ok', false,
        'code', 'REQUEST_ID_OPERATION_MISMATCH',
        'message', 'Same request id was used for a different schedule initialization.',
        'client_request_id', p_client_request_id
      );
    end if;
    return v_existing.result_json || jsonb_build_object(
      'idempotent_replay', true,
      'client_request_id', p_client_request_id,
      'received_at_utc', v_existing.received_at_utc,
      'completed_at_utc', v_existing.completed_at_utc
    );
  end if;

  -- Serialize concurrent Admin inits for the active cruise.
  perform pg_advisory_xact_lock(hashtext('bounty_schedule_init'), hashtext(coalesce(
    (select id::text from public.cruise_config where is_active limit 1),
    'none'
  )));

  -- Re-check ledger after lock (concurrent twin with same id).
  select * into v_existing
  from public.admin_bounty_schedule_init_requests
  where client_request_id = p_client_request_id;
  if found then
    if v_existing.fingerprint is distinct from v_fp then
      return jsonb_build_object(
        'ok', false,
        'code', 'REQUEST_ID_OPERATION_MISMATCH',
        'message', 'Same request id was used for a different schedule initialization.',
        'client_request_id', p_client_request_id
      );
    end if;
    return v_existing.result_json || jsonb_build_object(
      'idempotent_replay', true,
      'client_request_id', p_client_request_id
    );
  end if;

  select * into v_config from public.cruise_config where is_active limit 1 for update;
  if not found then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'NO_ACTIVE_CRUISE_CONFIG',
      'message', 'No active cruise configuration. Configure voyage dates before initializing the schedule.',
      'client_request_id', p_client_request_id
    );
    insert into public.admin_bounty_schedule_init_requests (
      client_request_id, fingerprint, actor_id, seed_token, result_json
    ) values (
      p_client_request_id, v_fp, v_actor, p_seed, v_result || jsonb_build_object('idempotent_replay', false)
    );
    return v_result || jsonb_build_object('idempotent_replay', false);
  end if;

  select * into v_control from public.game_control where game = 'drinkit' for update;
  perform public.ensure_finale_latched(clock_timestamp());
  select * into v_control from public.game_control where game = 'drinkit';

  if v_control.finalized_at_utc is not null or v_control.status = 'final' then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'CRUISE_FINALIZED',
      'message', 'Cannot initialize a bounty schedule after Friday 6 PM / finale latch.',
      'client_request_id', p_client_request_id,
      'cruise_config_id', v_config.id
    );
    insert into public.admin_bounty_schedule_init_requests (
      client_request_id, fingerprint, actor_id, cruise_config_id, seed_token, result_json
    ) values (
      p_client_request_id, v_fp, v_actor, v_config.id, p_seed,
      v_result || jsonb_build_object('idempotent_replay', false)
    );
    return v_result || jsonb_build_object('idempotent_replay', false);
  end if;

  select catalog_version_id into v_version from public.active_catalog_pointer where id = 1;
  if v_version is null then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'NO_ACTIVE_CATALOG',
      'message', 'Activate a valid catalog before initializing the bounty schedule.',
      'client_request_id', p_client_request_id,
      'cruise_config_id', v_config.id
    );
    insert into public.admin_bounty_schedule_init_requests (
      client_request_id, fingerprint, actor_id, cruise_config_id, seed_token, result_json
    ) values (
      p_client_request_id, v_fp, v_actor, v_config.id, p_seed,
      v_result || jsonb_build_object('idempotent_replay', false)
    );
    return v_result || jsonb_build_object('idempotent_replay', false);
  end if;

  v_complete := public.bounty_schedule_completeness(v_config.id);

  -- Already fully initialized: acknowledge without reshuffle / without replacing offers.
  if coalesce((v_complete->>'complete')::boolean, false) then
    v_result := jsonb_build_object(
      'ok', true,
      'code', 'SCHEDULE_ALREADY_INITIALIZED',
      'idempotent', true,
      'message', 'Bounty schedule is already initialized for this cruise. No changes were made.',
      'client_request_id', p_client_request_id,
      'cruise_config_id', v_config.id,
      'catalog_version_id', v_version,
      'completeness', v_complete,
      'gameplay_started', false
    );
    insert into public.admin_bounty_schedule_init_requests (
      client_request_id, fingerprint, actor_id, cruise_config_id, catalog_version_id,
      seed_token, result_json
    ) values (
      p_client_request_id, v_fp, v_actor, v_config.id, v_version, p_seed,
      v_result || jsonb_build_object('idempotent_replay', false)
    );
    return v_result || jsonb_build_object('idempotent_replay', false);
  end if;

  -- Partial / corrupt ledger: never silently repair or replace.
  if coalesce((v_complete->>'partial')::boolean, false) then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'SCHEDULE_INCOMPLETE_OR_CORRUPT',
      'message', 'A partial bounty schedule already exists. Refusing to initialize or replace it.',
      'client_request_id', p_client_request_id,
      'cruise_config_id', v_config.id,
      'completeness', v_complete
    );
    insert into public.admin_bounty_schedule_init_requests (
      client_request_id, fingerprint, actor_id, cruise_config_id, catalog_version_id,
      seed_token, result_json
    ) values (
      p_client_request_id, v_fp, v_actor, v_config.id, v_version, p_seed,
      v_result || jsonb_build_object('idempotent_replay', false)
    );
    return v_result || jsonb_build_object('idempotent_replay', false);
  end if;

  -- Active claims without a complete schedule is an unsafe state.
  if coalesce((v_complete->>'active_claims')::integer, 0) > 0 then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'EXISTING_ACCEPTED_CLAIMS',
      'message', 'Active bounty claims already exist. Refusing schedule initialization.',
      'client_request_id', p_client_request_id,
      'cruise_config_id', v_config.id,
      'completeness', v_complete
    );
    insert into public.admin_bounty_schedule_init_requests (
      client_request_id, fingerprint, actor_id, cruise_config_id, catalog_version_id,
      seed_token, result_json
    ) values (
      p_client_request_id, v_fp, v_actor, v_config.id, v_version, p_seed,
      v_result || jsonb_build_object('idempotent_replay', false)
    );
    return v_result || jsonb_build_object('idempotent_replay', false);
  end if;

  begin
    v_core := public.initialize_bounty_schedule_core(
      p_seed,
      'admin_initialize_bounty_schedule',
      v_actor
    );
  exception
    when others then
      v_result := jsonb_build_object(
        'ok', false,
        'code', split_part(SQLERRM, ':', 1),
        'message', SQLERRM,
        'client_request_id', p_client_request_id,
        'cruise_config_id', v_config.id,
        'catalog_version_id', v_version
      );
      insert into public.admin_bounty_schedule_init_requests (
        client_request_id, fingerprint, actor_id, cruise_config_id, catalog_version_id,
        seed_token, result_json
      ) values (
        p_client_request_id, v_fp, v_actor, v_config.id, v_version, p_seed,
        v_result || jsonb_build_object('idempotent_replay', false)
      );
      return v_result || jsonb_build_object('idempotent_replay', false);
  end;

  v_result := v_core || jsonb_build_object(
    'client_request_id', p_client_request_id,
    'client_request_fingerprint', v_fp
  );

  insert into public.admin_audit_log (action, actor_id, target_type, target_id, before_json, after_json)
  values (
    'bounty_schedule_initialize',
    v_actor,
    'cruise_config',
    v_config.id::text,
    jsonb_build_object('completeness', v_complete),
    v_result
  );

  insert into public.admin_bounty_schedule_init_requests (
    client_request_id, fingerprint, actor_id, cruise_config_id, catalog_version_id,
    seed_token, result_json
  ) values (
    p_client_request_id, v_fp, v_actor, v_config.id, v_version, p_seed,
    v_result || jsonb_build_object('idempotent_replay', false)
  );

  return v_result || jsonb_build_object('idempotent_replay', false);
end;
$$;

revoke all on function public.admin_initialize_bounty_schedule(uuid, text) from public;
grant execute on function public.admin_initialize_bounty_schedule(uuid, text) to authenticated;

comment on function public.admin_initialize_bounty_schedule(uuid, text) is
  'Admin-only production first bounty schedule initializer. Idempotent by client_request_id. Does not start gameplay or reshuffle an existing complete schedule.';

-- ---------------------------------------------------------------------------
-- Lost-response reconcile
-- ---------------------------------------------------------------------------
create or replace function public.admin_find_bounty_schedule_init_request_by_id(
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_bounty_schedule_init_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_ID');
  end if;

  select * into v_row
  from public.admin_bounty_schedule_init_requests
  where client_request_id = p_client_request_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_FOUND',
      'client_request_id', p_client_request_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'client_request_id', v_row.client_request_id,
    'fingerprint', v_row.fingerprint,
    'cruise_config_id', v_row.cruise_config_id,
    'catalog_version_id', v_row.catalog_version_id,
    'received_at_utc', v_row.received_at_utc,
    'completed_at_utc', v_row.completed_at_utc,
    'result', v_row.result_json
  );
end;
$$;

revoke all on function public.admin_find_bounty_schedule_init_request_by_id(uuid) from public;
grant execute on function public.admin_find_bounty_schedule_init_request_by_id(uuid) to authenticated;

-- Extend preview gameplay reset to clear the new Admin init ledger (dev-only).
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
  delete from public.admin_bounty_schedule_init_requests where true;

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

-- Disposable test helper: clear schedule ledger only (not full gameplay reset).
create or replace function public.dev_clear_bounty_schedule_ledger()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.cruise_config%rowtype;
  v_slots integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'DEV_ONLY: service_role required';
  end if;

  select * into v_cfg from public.cruise_config where is_active limit 1;
  if not found or v_cfg.label is distinct from 'development-only' then
    raise exception 'DEV_ONLY: refusing schedule clear when active label is %',
      coalesce(v_cfg.label, '<none>');
  end if;

  delete from public.bounty_claims where cruise_config_id = v_cfg.id;
  delete from public.bounty_objective_exposures where cruise_config_id = v_cfg.id;
  delete from public.admin_bounty_schedule_init_requests where cruise_config_id = v_cfg.id
    or cruise_config_id is null;
  delete from public.ingredient_bounty_public_cards where true;

  update public.bounty_slots
  set current_offer_id = null
  where cruise_config_id = v_cfg.id;

  delete from public.bounty_slot_offers o
  using public.bounty_slots s
  where o.slot_id = s.id and s.cruise_config_id = v_cfg.id;

  delete from public.bounty_slots where cruise_config_id = v_cfg.id;
  get diagnostics v_slots = row_count;

  delete from public.bounty_schedule_runs where cruise_config_id = v_cfg.id;
  delete from public.bar_bounties where cruise_config_id = v_cfg.id;
  delete from public.daily_challenges where cruise_config_id = v_cfg.id;

  return jsonb_build_object(
    'ok', true,
    'slots_deleted', v_slots,
    'cruise_config_id', v_cfg.id
  );
end;
$$;

revoke all on function public.dev_clear_bounty_schedule_ledger() from public;
grant execute on function public.dev_clear_bounty_schedule_ledger() to service_role;
