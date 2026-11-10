-- Phase C1: Final seven Daily Challenges, participation modes, Admin announcements.
-- Display-only announcements. No claim gating, clock, or scoring changes.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
alter table public.daily_challenges
  add column if not exists participation_mode text;

alter table public.daily_challenges
  add column if not exists admin_announcement text;

alter table public.daily_challenges
  add column if not exists bar_canonical_key text;

-- Backfill participation from legacy is_all_hands before tightening constraints.
update public.daily_challenges
set participation_mode = case
  when is_all_hands then 'all_hands'
  else 'bring_a_friend'
end
where participation_mode is null
   or trim(participation_mode) = ''
   or participation_mode not in ('all_hands', 'bring_a_friend');

alter table public.daily_challenges
  alter column participation_mode set default 'all_hands';

alter table public.daily_challenges
  alter column participation_mode set not null;

alter table public.daily_challenges
  drop constraint if exists daily_challenges_participation_mode_check;

alter table public.daily_challenges
  add constraint daily_challenges_participation_mode_check
  check (participation_mode in ('all_hands', 'bring_a_friend'));

alter table public.daily_challenges
  drop constraint if exists daily_challenges_participation_all_hands_sync;

alter table public.daily_challenges
  add constraint daily_challenges_participation_all_hands_sync
  check (is_all_hands = (participation_mode = 'all_hands'));

alter table public.daily_challenges
  drop constraint if exists daily_challenges_bar_key_nonempty;

alter table public.daily_challenges
  add constraint daily_challenges_bar_key_nonempty
  check (bar_canonical_key is null or char_length(trim(bar_canonical_key)) > 0);

alter table public.daily_challenges
  drop constraint if exists daily_challenges_announcement_len;

alter table public.daily_challenges
  add constraint daily_challenges_announcement_len
  check (
    admin_announcement is null
    or char_length(admin_announcement) <= 280
  );

comment on column public.daily_challenges.participation_mode is
  'C1: all_hands | bring_a_friend. Honor-system social intent; no partner verification.';

comment on column public.daily_challenges.admin_announcement is
  'C1: Admin-editable plain-text meetup note. Display only; never gates claims or Ship Clock.';

comment on column public.daily_challenges.bar_canonical_key is
  'C1: Canonical bar key for the challenge location. Independent of Bar Bounty day assignment.';

comment on table public.daily_challenges is
  'Exactly one Daily Challenge per cruise day. Points fixed at 50. Meeting time / admin announcement are descriptive only.';

-- ---------------------------------------------------------------------------
-- Plain-text announcement normalization
-- ---------------------------------------------------------------------------
create or replace function public.normalize_daily_challenge_announcement(p_raw text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text;
begin
  if p_raw is null then
    return null;
  end if;
  -- Strip C0 controls except ordinary whitespace; collapse to a single plain line budget.
  v_text := regexp_replace(p_raw, E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', '', 'g');
  v_text := regexp_replace(v_text, E'[\\r\\n\\t]+', ' ', 'g');
  v_text := trim(both from v_text);
  if v_text = '' then
    return null;
  end if;
  if char_length(v_text) > 280 then
    raise exception 'ANNOUNCEMENT_TOO_LONG' using errcode = '22023';
  end if;
  return v_text;
end;
$$;

revoke all on function public.normalize_daily_challenge_announcement(text) from public;
grant execute on function public.normalize_daily_challenge_announcement(text) to authenticated;
grant execute on function public.normalize_daily_challenge_announcement(text) to service_role;

-- ---------------------------------------------------------------------------
-- Dev seed: preserve Bar Bounty schedule; upsert final Daily Challenges by day
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
  -- Phase 10E / B4 Bar Bounty featured bars (unchanged by C1).
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
    'Martini Choice',
    'Bartender''s Choice',
    'Miami Vice Finale'
  ];
  v_locations text[] := array[
    'Lido',
    'Sea View',
    'O''Malley''s',
    'Crooners',
    'Bellini''s',
    'Good Spirits',
    'Cascade'
  ];
  v_daily_bar_keys text[] := array[
    'lido-bar',
    'sea-view-bar',
    'omalleys-irish-pub',
    'crooners',
    'bellinis-cocktail-bar',
    'good-spirits-at-sea',
    'cascade-bar'
  ];
  v_modes text[] := array[
    'all_hands',
    'all_hands',
    'bring_a_friend',
    'bring_a_friend',
    'bring_a_friend',
    'all_hands',
    'all_hands'
  ];
  v_instructions constant text :=
    'Detailed challenge instructions pending organizer supply.';
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

  -- Bar Bounties remain delete+reseed (no announcement field to preserve).
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

  -- Verify Daily Challenge location bars exist (catalog-backed keys).
  for v_day in 1..7 loop
    if not exists (
      select 1 from public.bars b where b.canonical_key = v_daily_bar_keys[v_day]
    ) then
      raise exception 'DAILY_BAR_KEY_MISSING:%', v_daily_bar_keys[v_day] using errcode = 'P0001';
    end if;
  end loop;

  -- Upsert by day: preserve stable ids + admin_announcement; replace fixture content.
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
        v_instructions,
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
          instructions = v_instructions,
          location_name = v_locations[v_day],
          bar_canonical_key = v_daily_bar_keys[v_day],
          meeting_time_ship_local = null,
          is_all_hands = (v_modes[v_day] = 'all_hands'),
          participation_mode = v_modes[v_day],
          photo_required = true,
          points = 50
          -- admin_announcement intentionally preserved
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
    'label', 'c1-final-daily-challenges'
  );
end;
$$;

revoke all on function public.dev_seed_daily_assignments() from public;
revoke all on function public.dev_seed_daily_assignments() from authenticated, anon;
grant execute on function public.dev_seed_daily_assignments() to service_role;

-- ---------------------------------------------------------------------------
-- Player + timed-sim reads
-- ---------------------------------------------------------------------------
create or replace function public.get_my_current_daily_challenge()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_life jsonb;
  v_config public.cruise_config%rowtype;
  v_row public.daily_challenges%rowtype;
  v_day integer;
  v_claim public.bounty_claims%rowtype;
begin
  if v_me is null then
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

  select * into v_claim
  from public.bounty_claims
  where player_id = v_me
    and cruise_config_id = v_config.id
    and game_day = v_day
    and category = 'daily'
    and status = 'active'
  limit 1;

  if found then
    select * into v_row from public.daily_challenges where id = v_claim.daily_challenge_id;
    return jsonb_build_object(
      'status', 'already_claimed',
      'reason', 'category_used_today',
      'cruise_day', v_day,
      'challenge_id', v_claim.daily_challenge_id,
      'title', coalesce(v_row.title, v_claim.offer_snapshot_json->>'title'),
      'instructions', v_row.instructions,
      'location_name', v_row.location_name,
      'bar_canonical_key', v_row.bar_canonical_key,
      'meeting_time_ship_local', v_row.meeting_time_ship_local,
      'is_all_hands', coalesce(v_row.is_all_hands, false),
      'participation_mode', coalesce(v_row.participation_mode, 'bring_a_friend'),
      'admin_announcement', v_row.admin_announcement,
      'photo_required', coalesce(v_row.photo_required, true),
      'points', v_claim.points,
      'submission_id', v_claim.submission_id,
      'public_end_utc', v_life->>'public_end_utc'
    );
  end if;

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
    'bar_canonical_key', v_row.bar_canonical_key,
    'meeting_time_ship_local', v_row.meeting_time_ship_local,
    'is_all_hands', v_row.is_all_hands,
    'participation_mode', v_row.participation_mode,
    'admin_announcement', v_row.admin_announcement,
    'photo_required', v_row.photo_required,
    'points', v_row.points,
    'public_end_utc', v_life->>'public_end_utc'
  );
end;
$$;

revoke all on function public.get_my_current_daily_challenge() from public;
grant execute on function public.get_my_current_daily_challenge() to authenticated;

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
    'bar_canonical_key', v_row.bar_canonical_key,
    'meeting_time_ship_local', v_row.meeting_time_ship_local,
    'is_all_hands', v_row.is_all_hands,
    'participation_mode', v_row.participation_mode,
    'admin_announcement', v_row.admin_announcement,
    'photo_required', v_row.photo_required,
    'points', v_row.points,
    'public_end_utc', v_life->>'public_end_utc'
  );
end;
$$;

revoke all on function public.dev_get_current_daily_challenge_at(timestamptz) from public;
grant execute on function public.dev_get_current_daily_challenge_at(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Admin: list + set announcement (display only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_daily_challenges()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.require_admin();
  v_config public.cruise_config%rowtype;
  v_rows jsonb;
begin
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_CRUISE_CONFIG');
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'challenge_id', dc.id,
      'day_number', dc.day_number,
      'title', dc.title,
      'instructions', dc.instructions,
      'location_name', dc.location_name,
      'bar_canonical_key', dc.bar_canonical_key,
      'meeting_time_ship_local', dc.meeting_time_ship_local,
      'is_all_hands', dc.is_all_hands,
      'participation_mode', dc.participation_mode,
      'admin_announcement', dc.admin_announcement,
      'photo_required', dc.photo_required,
      'points', dc.points
    )
    order by dc.day_number
  ), '[]'::jsonb)
  into v_rows
  from public.daily_challenges dc
  where dc.cruise_config_id = v_config.id;

  return jsonb_build_object(
    'ok', true,
    'cruise_config_id', v_config.id,
    'challenges', v_rows,
    'actor_player_id', v_actor
  );
end;
$$;

revoke all on function public.admin_list_daily_challenges() from public;
grant execute on function public.admin_list_daily_challenges() to authenticated;

comment on function public.admin_list_daily_challenges() is
  'C1: Admin read-model for the seven Daily Challenges including optional announcements.';

create or replace function public.admin_set_daily_challenge_announcement(
  p_day_number integer,
  p_announcement text,
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.require_admin();
  v_config public.cruise_config%rowtype;
  v_row public.daily_challenges%rowtype;
  v_before text;
  v_after text;
  v_audit uuid;
begin
  if p_day_number is null or p_day_number < 1 or p_day_number > 7 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DAY_NUMBER');
  end if;

  begin
    v_after := public.normalize_daily_challenge_announcement(p_announcement);
  exception
    when others then
      if sqlerrm like 'ANNOUNCEMENT_TOO_LONG%' then
        return jsonb_build_object('ok', false, 'code', 'ANNOUNCEMENT_TOO_LONG');
      end if;
      raise;
  end;

  select * into v_config from public.cruise_config where is_active limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_CRUISE_CONFIG');
  end if;

  select * into v_row
  from public.daily_challenges
  where cruise_config_id = v_config.id and day_number = p_day_number
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'CHALLENGE_NOT_FOUND', 'day_number', p_day_number);
  end if;

  v_before := v_row.admin_announcement;

  if v_before is not distinct from v_after then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'challenge_id', v_row.id,
      'day_number', v_row.day_number,
      'participation_mode', v_row.participation_mode,
      'admin_announcement', v_row.admin_announcement,
      'client_request_id', p_client_request_id
    );
  end if;

  update public.daily_challenges
  set admin_announcement = v_after
  where id = v_row.id
  returning * into v_row;

  v_audit := public.write_admin_audit(
    'daily_challenge_announcement_set',
    v_actor,
    'daily_challenge',
    v_row.id::text,
    jsonb_build_object(
      'day_number', v_row.day_number,
      'admin_announcement', v_before
    ),
    jsonb_build_object(
      'day_number', v_row.day_number,
      'admin_announcement', v_row.admin_announcement,
      'client_request_id', p_client_request_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'challenge_id', v_row.id,
    'day_number', v_row.day_number,
    'participation_mode', v_row.participation_mode,
    'admin_announcement', v_row.admin_announcement,
    'audit_id', v_audit,
    'client_request_id', p_client_request_id
  );
end;
$$;

revoke all on function public.admin_set_daily_challenge_announcement(integer, text, uuid) from public;
grant execute on function public.admin_set_daily_challenge_announcement(integer, text, uuid) to authenticated;

comment on function public.admin_set_daily_challenge_announcement(integer, text, uuid) is
  'C1: Admin create/edit/clear Daily Challenge announcement. Display only; does not affect availability or scoring.';
