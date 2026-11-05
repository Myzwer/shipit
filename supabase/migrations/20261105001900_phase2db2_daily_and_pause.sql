-- Phase 2D-B2: fixed Bar/Daily assignments + admin Pause/Resume Drink It!
-- Player RPCs never honor caller-controlled time.

-- ---------------------------------------------------------------------------
-- Schema: fixed daily content (per cruise_config)
-- ---------------------------------------------------------------------------
create table public.bar_bounties (
  id uuid primary key default gen_random_uuid(),
  cruise_config_id uuid not null references public.cruise_config (id) on delete cascade,
  day_number integer not null check (day_number between 1 and 7),
  bar_id uuid not null references public.bars (id),
  catalog_version_id uuid references public.catalog_versions (id) on delete set null,
  bar_canonical_key text not null,
  bar_display_name text not null,
  created_at timestamptz not null default now(),
  constraint bar_bounties_unique_day unique (cruise_config_id, day_number),
  constraint bar_bounties_name_nonempty check (char_length(trim(bar_display_name)) > 0),
  constraint bar_bounties_key_nonempty check (char_length(trim(bar_canonical_key)) > 0)
);

comment on table public.bar_bounties is
  'Exactly one featured Bar Bounty per cruise day. Display name is snapshotted for history.';

create table public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  cruise_config_id uuid not null references public.cruise_config (id) on delete cascade,
  day_number integer not null check (day_number between 1 and 7),
  title text not null,
  instructions text not null,
  location_name text,
  meeting_time_ship_local time,
  is_all_hands boolean not null default false,
  photo_required boolean not null default true,
  points integer not null default 50 check (points = 50),
  created_at timestamptz not null default now(),
  constraint daily_challenges_unique_day unique (cruise_config_id, day_number),
  constraint daily_challenges_title_nonempty check (char_length(trim(title)) > 0),
  constraint daily_challenges_instructions_nonempty check (char_length(trim(instructions)) > 0)
);

comment on table public.daily_challenges is
  'Exactly one Daily Challenge per cruise day. Meeting time is descriptive only. Points fixed at 50.';

create index bar_bounties_cruise_idx on public.bar_bounties (cruise_config_id);
create index daily_challenges_cruise_idx on public.daily_challenges (cruise_config_id);

alter table public.bar_bounties enable row level security;
alter table public.daily_challenges enable row level security;
alter table public.bar_bounties force row level security;
alter table public.daily_challenges force row level security;

revoke all on table public.bar_bounties from anon, authenticated;
revoke all on table public.daily_challenges from anon, authenticated;
-- No direct SELECT for authenticated — only via player RPCs that return current day.
grant select, insert, update, delete on table public.bar_bounties to service_role;
grant select, insert, update, delete on table public.daily_challenges to service_role;

-- ---------------------------------------------------------------------------
-- Helpers: public closing time for daily categories
-- ---------------------------------------------------------------------------
create or replace function public.daily_public_end_ship_local(p_cruise_day integer)
returns time
language sql
immutable
as $$
  select case when p_cruise_day = 7 then time '18:00' else time '23:00' end;
$$;

-- Shared lifecycle gate for Drink It! player reads / future submissions.
create or replace function public.drinkit_lifecycle_at(p_at_utc timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_control public.game_control%rowtype;
  v_offset integer;
  v_ship timestamp;
  v_ship_date date;
  v_cruise_day integer;
  v_ship_time time;
  v_finale_utc timestamptz;
  v_open time := time '12:00';
  v_close time;
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
    ((v_config.day1_ship_date + (v_config.final_day - 1)) + time '18:00')::timestamp,
    v_offset
  );

  if p_at_utc >= v_finale_utc or v_control.finalized_at_utc is not null then
    return jsonb_build_object(
      'status', 'finale',
      'reason', 'friday_6pm_cutoff',
      'cruise_day', v_cruise_day,
      'ship_date', v_ship_date,
      'at_utc', p_at_utc
    );
  end if;

  if v_control.status = 'paused' then
    return jsonb_build_object(
      'status', 'paused',
      'reason', 'drinkit_paused',
      'cruise_day', v_cruise_day,
      'ship_date', v_ship_date,
      'at_utc', p_at_utc
    );
  end if;

  if v_cruise_day is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'outside_cruise',
      'at_utc', p_at_utc
    );
  end if;

  v_close := public.daily_public_end_ship_local(v_cruise_day);

  if v_ship_time < v_open then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'pre_open',
      'cruise_day', v_cruise_day,
      'ship_date', v_ship_date,
      'at_utc', p_at_utc
    );
  end if;

  if v_ship_time >= v_close then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'overnight',
      'cruise_day', v_cruise_day,
      'ship_date', v_ship_date,
      'at_utc', p_at_utc
    );
  end if;

  return jsonb_build_object(
    'status', 'open',
    'cruise_day', v_cruise_day,
    'ship_date', v_ship_date,
    'at_utc', p_at_utc,
    'public_end_utc', public.ship_local_to_utc((v_ship_date + v_close)::timestamp, v_offset),
    'offset_minutes', v_offset
  );
end;
$$;

revoke all on function public.drinkit_lifecycle_at(timestamptz) from public;
revoke all on function public.drinkit_lifecycle_at(timestamptz) from authenticated, anon;
grant execute on function public.drinkit_lifecycle_at(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Player RPCs: current-day Bar + Daily (zero-arg, now() only)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_current_bar_bounty()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_life jsonb;
  v_config public.cruise_config%rowtype;
  v_row public.bar_bounties%rowtype;
  v_day integer;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  v_life := public.drinkit_lifecycle_at(now());
  if v_life->>'status' is distinct from 'open' then
    return jsonb_build_object(
      'status', coalesce(v_life->>'status', 'unavailable'),
      'reason', v_life->>'reason',
      'cruise_day', (v_life->>'cruise_day')::int
    );
  end if;

  v_day := (v_life->>'cruise_day')::int;
  select * into v_config from public.cruise_config where is_active limit 1;
  select * into v_row from public.bar_bounties
  where cruise_config_id = v_config.id and day_number = v_day;

  if not found then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'no_bar_assignment',
      'cruise_day', v_day
    );
  end if;

  return jsonb_build_object(
    'status', 'active',
    'assignment_id', v_row.id,
    'cruise_day', v_day,
    'bar_id', v_row.bar_id,
    'bar_canonical_key', v_row.bar_canonical_key,
    'bar_display_name', v_row.bar_display_name,
    'points_base', 25,
    'points_per_companion', 10,
    'points_cap', 95,
    'public_end_utc', v_life->>'public_end_utc'
  );
end;
$$;

create or replace function public.get_my_current_daily_challenge()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_life jsonb;
  v_config public.cruise_config%rowtype;
  v_row public.daily_challenges%rowtype;
  v_day integer;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  v_life := public.drinkit_lifecycle_at(now());
  if v_life->>'status' is distinct from 'open' then
    return jsonb_build_object(
      'status', coalesce(v_life->>'status', 'unavailable'),
      'reason', v_life->>'reason',
      'cruise_day', (v_life->>'cruise_day')::int
    );
  end if;

  v_day := (v_life->>'cruise_day')::int;
  select * into v_config from public.cruise_config where is_active limit 1;
  select * into v_row from public.daily_challenges
  where cruise_config_id = v_config.id and day_number = v_day;

  if not found then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'no_daily_assignment',
      'cruise_day', v_day
    );
  end if;

  return jsonb_build_object(
    'status', 'active',
    'challenge_id', v_row.id,
    'cruise_day', v_day,
    'title', v_row.title,
    'instructions', v_row.instructions,
    'location_name', v_row.location_name,
    'meeting_time_ship_local', v_row.meeting_time_ship_local,
    'is_all_hands', v_row.is_all_hands,
    'photo_required', v_row.photo_required,
    'points', v_row.points,
    'public_end_utc', v_life->>'public_end_utc'
  );
end;
$$;

revoke all on function public.get_my_current_bar_bounty() from public;
revoke all on function public.get_my_current_daily_challenge() from public;
grant execute on function public.get_my_current_bar_bounty() to authenticated;
grant execute on function public.get_my_current_daily_challenge() to authenticated;

-- Combined board read: one now(), consistent cruise day for all four categories.
create or replace function public.get_my_drinkit_home_board()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := now();
  v_clock jsonb;
  v_cocktail jsonb;
  v_ingredient jsonb;
  v_bar jsonb;
  v_daily jsonb;
  v_life jsonb;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  v_clock := public.get_ship_clock_state();
  v_life := public.drinkit_lifecycle_at(v_at);

  -- Reuse existing zero-arg resolvers (also use now()); same wall clock within this txn.
  v_cocktail := public.get_my_current_cocktail_bounty();
  v_ingredient := public.get_my_current_ingredient_bounty();
  v_bar := public.get_my_current_bar_bounty();
  v_daily := public.get_my_current_daily_challenge();

  return jsonb_build_object(
    'at_utc', v_at,
    'cruise_day', (v_life->>'cruise_day')::int,
    'lifecycle', v_life,
    'clock', v_clock,
    'cocktail', v_cocktail,
    'ingredient', v_ingredient,
    'bar', v_bar,
    'daily', v_daily
  );
end;
$$;

revoke all on function public.get_my_drinkit_home_board() from public;
grant execute on function public.get_my_drinkit_home_board() to authenticated;

-- Privileged timed sim for daily categories (service_role + development-only).
create or replace function public.dev_get_current_bar_bounty_at(p_at_utc timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_life jsonb;
  v_row public.bar_bounties%rowtype;
  v_day integer;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found or v_config.label is distinct from 'development-only' then
    raise exception 'DEV_BOUNTY_SIM_FORBIDDEN' using errcode = '42501';
  end if;

  v_life := public.drinkit_lifecycle_at(p_at_utc);
  if v_life->>'status' is distinct from 'open' then
    return jsonb_build_object(
      'status', coalesce(v_life->>'status', 'unavailable'),
      'reason', v_life->>'reason',
      'cruise_day', (v_life->>'cruise_day')::int
    );
  end if;
  v_day := (v_life->>'cruise_day')::int;
  select * into v_row from public.bar_bounties
  where cruise_config_id = v_config.id and day_number = v_day;
  if not found then
    return jsonb_build_object('status', 'unavailable', 'reason', 'no_bar_assignment', 'cruise_day', v_day);
  end if;
  return jsonb_build_object(
    'status', 'active',
    'assignment_id', v_row.id,
    'cruise_day', v_day,
    'bar_id', v_row.bar_id,
    'bar_canonical_key', v_row.bar_canonical_key,
    'bar_display_name', v_row.bar_display_name,
    'points_base', 25,
    'points_per_companion', 10,
    'points_cap', 95,
    'public_end_utc', v_life->>'public_end_utc'
  );
end;
$$;

create or replace function public.dev_get_current_daily_challenge_at(p_at_utc timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_life jsonb;
  v_row public.daily_challenges%rowtype;
  v_day integer;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found or v_config.label is distinct from 'development-only' then
    raise exception 'DEV_BOUNTY_SIM_FORBIDDEN' using errcode = '42501';
  end if;

  v_life := public.drinkit_lifecycle_at(p_at_utc);
  if v_life->>'status' is distinct from 'open' then
    return jsonb_build_object(
      'status', coalesce(v_life->>'status', 'unavailable'),
      'reason', v_life->>'reason',
      'cruise_day', (v_life->>'cruise_day')::int
    );
  end if;
  v_day := (v_life->>'cruise_day')::int;
  select * into v_row from public.daily_challenges
  where cruise_config_id = v_config.id and day_number = v_day;
  if not found then
    return jsonb_build_object('status', 'unavailable', 'reason', 'no_daily_assignment', 'cruise_day', v_day);
  end if;
  return jsonb_build_object(
    'status', 'active',
    'challenge_id', v_row.id,
    'cruise_day', v_day,
    'title', v_row.title,
    'instructions', v_row.instructions,
    'location_name', v_row.location_name,
    'meeting_time_ship_local', v_row.meeting_time_ship_local,
    'is_all_hands', v_row.is_all_hands,
    'photo_required', v_row.photo_required,
    'points', v_row.points,
    'public_end_utc', v_life->>'public_end_utc'
  );
end;
$$;

revoke all on function public.dev_get_current_bar_bounty_at(timestamptz) from public;
revoke all on function public.dev_get_current_bar_bounty_at(timestamptz) from authenticated, anon;
revoke all on function public.dev_get_current_daily_challenge_at(timestamptz) from public;
revoke all on function public.dev_get_current_daily_challenge_at(timestamptz) from authenticated, anon;
grant execute on function public.dev_get_current_bar_bounty_at(timestamptz) to service_role;
grant execute on function public.dev_get_current_daily_challenge_at(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Dev seed: seven Bar + seven Daily fixtures (development-only cruise)
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
  v_keys text[] := array['wake-view', 'good-spirits', 'poolside', 'carried-bar', 'wake-view', 'good-spirits', 'poolside'];
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
     'Wake View', null, false, true, 50),
    (v_config.id, 3, 'Fixture All-Hands Toast',
     'Join the All-Hands gathering and photograph the group toast. Development fixture only.',
     'Main Theater', time '16:00', true, true, 50),
    (v_config.id, 4, 'Fixture Timed Meetup',
     'Meet at the specified Ship Time and photograph the meetup spot. Development fixture only.',
     'Poolside', time '14:30', false, true, 50),
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

-- ---------------------------------------------------------------------------
-- Admin Pause / Resume (idempotent desired-state)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_drinkit_paused(
  p_paused boolean,
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_before public.game_control%rowtype;
  v_after public.game_control%rowtype;
  v_changed boolean := false;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  v_actor := public.current_player_id();

  select * into v_before from public.game_control where game = 'drinkit' for update;

  if v_before.finalized_at_utc is not null or v_before.status = 'final' then
    raise exception 'FINALE_LOCKED' using errcode = 'P0001';
  end if;

  if p_paused then
    if v_before.status is distinct from 'paused' then
      update public.game_control
      set status = 'paused',
          paused_at_utc = now(),
          paused_by = v_actor,
          updated_at = now()
      where game = 'drinkit';
      v_changed := true;
    end if;
  else
    if v_before.status = 'paused' then
      update public.game_control
      set status = 'active',
          paused_at_utc = null,
          paused_by = null,
          updated_at = now()
      where game = 'drinkit';
      v_changed := true;
    end if;
  end if;

  select * into v_after from public.game_control where game = 'drinkit';

  if v_changed then
    insert into public.admin_audit_log (action, actor_id, target_type, target_id, before_json, after_json)
    values (
      case when p_paused then 'drinkit_pause' else 'drinkit_resume' end,
      v_actor,
      'game_control',
      'drinkit',
      jsonb_build_object(
        'status', v_before.status,
        'paused_at_utc', v_before.paused_at_utc,
        'client_request_id', p_client_request_id
      ),
      jsonb_build_object(
        'status', v_after.status,
        'paused_at_utc', v_after.paused_at_utc,
        'client_request_id', p_client_request_id
      )
    );
  end if;

  return jsonb_build_object(
    'paused', v_after.status = 'paused',
    'status', v_after.status,
    'changed', v_changed,
    'paused_at_utc', v_after.paused_at_utc,
    'finalized_at_utc', v_after.finalized_at_utc,
    'client_request_id', p_client_request_id
  );
end;
$$;

create or replace function public.admin_get_drinkit_pause_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.game_control%rowtype;
  v_ship public.game_control%rowtype;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  select * into v_row from public.game_control where game = 'drinkit';
  select * into v_ship from public.game_control where game = 'shipit';
  return jsonb_build_object(
    'drinkit', jsonb_build_object(
      'status', v_row.status,
      'paused', v_row.status = 'paused',
      'paused_at_utc', v_row.paused_at_utc,
      'finalized_at_utc', v_row.finalized_at_utc
    ),
    'shipit', jsonb_build_object(
      'status', v_ship.status,
      'paused', false,
      'finalized_at_utc', v_ship.finalized_at_utc
    )
  );
end;
$$;

revoke all on function public.admin_set_drinkit_paused(boolean, uuid) from public;
revoke all on function public.admin_get_drinkit_pause_status() from public;
grant execute on function public.admin_set_drinkit_paused(boolean, uuid) to authenticated;
grant execute on function public.admin_get_drinkit_pause_status() to authenticated;

comment on function public.admin_set_drinkit_paused(boolean, uuid) is
  'Organizer-only idempotent Pause/Resume for Drink It!. Does not affect Ship It!. Cannot reopen after finale.';
