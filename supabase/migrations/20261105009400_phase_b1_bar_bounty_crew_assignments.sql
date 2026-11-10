-- Phase B1: Daily Bar Bounty crew assignment engine
-- Server-authoritative, once-per-game-day locking. No scoring or UI changes.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
create table public.bar_bounty_crew_days (
  id uuid primary key default gen_random_uuid(),
  cruise_config_id uuid not null references public.cruise_config (id) on delete cascade,
  day_number integer not null check (day_number between 1 and 7),
  generated_at_utc timestamptz not null default clock_timestamp(),
  roster_size integer not null check (roster_size >= 7),
  seed text not null,
  algorithm_version text not null default 'b1-v1',
  created_at timestamptz not null default now(),
  constraint bar_bounty_crew_days_unique_day unique (cruise_config_id, day_number),
  constraint bar_bounty_crew_days_seed_nonempty check (char_length(trim(seed)) > 0)
);

comment on table public.bar_bounty_crew_days is
  'One locked Bar Bounty crew-assignment generation per cruise game day. Cascade-deleted with cruise_config.';

create table public.bar_bounty_crews (
  id uuid primary key default gen_random_uuid(),
  crew_day_id uuid not null references public.bar_bounty_crew_days (id) on delete cascade,
  crew_index integer not null check (crew_index >= 0),
  size integer not null check (size in (3, 4)),
  created_at timestamptz not null default now(),
  constraint bar_bounty_crews_unique_index unique (crew_day_id, crew_index)
);

comment on table public.bar_bounty_crews is
  'Crew groups for a locked Bar Bounty assignment day. Independent of Ship It! teams.';

create table public.bar_bounty_crew_members (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.bar_bounty_crews (id) on delete cascade,
  cruise_config_id uuid not null references public.cruise_config (id) on delete cascade,
  day_number integer not null check (day_number between 1 and 7),
  player_id uuid not null references public.players (id),
  display_name_snapshot text not null,
  created_at timestamptz not null default now(),
  constraint bar_bounty_crew_members_one_per_day unique (cruise_config_id, day_number, player_id),
  constraint bar_bounty_crew_members_name_nonempty check (char_length(trim(display_name_snapshot)) > 0)
);

comment on table public.bar_bounty_crew_members is
  'Immutable per-day membership snapshot. Mid-day roster changes do not reshape existing rows. B2 scoring should key off player_id + day.';

create index bar_bounty_crew_days_cruise_idx on public.bar_bounty_crew_days (cruise_config_id);
create index bar_bounty_crews_day_idx on public.bar_bounty_crews (crew_day_id);
create index bar_bounty_crew_members_crew_idx on public.bar_bounty_crew_members (crew_id);
create index bar_bounty_crew_members_player_day_idx
  on public.bar_bounty_crew_members (player_id, cruise_config_id, day_number);

alter table public.bar_bounty_crew_days enable row level security;
alter table public.bar_bounty_crews enable row level security;
alter table public.bar_bounty_crew_members enable row level security;
alter table public.bar_bounty_crew_days force row level security;
alter table public.bar_bounty_crews force row level security;
alter table public.bar_bounty_crew_members force row level security;

revoke all on table public.bar_bounty_crew_days from anon, authenticated;
revoke all on table public.bar_bounty_crews from anon, authenticated;
revoke all on table public.bar_bounty_crew_members from anon, authenticated;

grant select, insert, update, delete on table public.bar_bounty_crew_days to service_role;
grant select, insert, update, delete on table public.bar_bounty_crews to service_role;
grant select, insert, update, delete on table public.bar_bounty_crew_members to service_role;

-- No authenticated table grants or policies — reads go through RPCs only (matches bar_bounties).

-- ---------------------------------------------------------------------------
-- Pure helpers: day context, partition sizes, seeded RNG
-- ---------------------------------------------------------------------------
create or replace function public.bar_bounty_crew_context_at(p_at_utc timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_offset integer;
  v_ship timestamp;
  v_ship_date date;
  v_cruise_day integer;
begin
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_cruise_config');
  end if;

  v_offset := public.clock_offset_at(v_config.id, v_config.base_ship_offset_minutes, p_at_utc);
  v_ship := public.utc_to_ship_local(p_at_utc, v_offset);
  v_ship_date := v_ship::date;
  v_cruise_day := public.cruise_day_for_ship_date(v_config.day1_ship_date, v_ship_date, v_config.final_day);

  if v_cruise_day is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'outside_cruise',
      'cruise_config_id', v_config.id,
      'ship_date', v_ship_date,
      'offset_minutes', v_offset
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'cruise_config_id', v_config.id,
    'cruise_day', v_cruise_day,
    'ship_date', v_ship_date,
    'offset_minutes', v_offset
  );
end;
$$;

comment on function public.bar_bounty_crew_context_at(timestamptz) is
  'Authoritative cruise day for Bar Bounty crews. Uses Ship Clock only; ignores Drink It open/close windows.';

create or replace function public.bar_bounty_crew_partition_sizes(p_n integer)
returns integer[]
language plpgsql
immutable
as $$
declare
  r integer;
  a integer;
  b integer;
  sizes integer[] := '{}'::integer[];
  i integer;
begin
  if p_n is null or p_n < 7 then
    raise exception 'ROSTER_TOO_SMALL' using errcode = 'P0001';
  end if;

  r := p_n % 4;
  if r = 0 then
    b := 0;
    a := p_n / 4;
  elsif r = 1 then
    b := 3;
    a := (p_n - 9) / 4;
  elsif r = 2 then
    b := 2;
    a := (p_n - 6) / 4;
  else
    b := 1;
    a := (p_n - 3) / 4;
  end if;

  if a < 0 then
    raise exception 'ROSTER_TOO_SMALL' using errcode = 'P0001';
  end if;

  for i in 1..a loop
    sizes := array_append(sizes, 4);
  end loop;
  for i in 1..b loop
    sizes := array_append(sizes, 3);
  end loop;

  return sizes;
end;
$$;

comment on function public.bar_bounty_crew_partition_sizes(integer) is
  'Crew sizes of 3 or 4 only. Prefer fours; when n≡1 (mod 4) use three threes + remaining fours.';

create or replace function public.bar_bounty_crew_rand(p_seed text, p_counter bigint)
returns double precision
language sql
immutable
as $$
  select (
    ('x' || substr(md5(p_seed || ':' || p_counter::text), 1, 8))::bit(32)::bigint::double precision
  ) / 4294967296.0;
$$;

revoke all on function public.bar_bounty_crew_context_at(timestamptz) from public;
revoke all on function public.bar_bounty_crew_partition_sizes(integer) from public;
revoke all on function public.bar_bounty_crew_rand(text, bigint) from public;
grant execute on function public.bar_bounty_crew_context_at(timestamptz) to service_role;
grant execute on function public.bar_bounty_crew_partition_sizes(integer) to service_role;
grant execute on function public.bar_bounty_crew_rand(text, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- Active Drink It! roster (authoritative membership source)
-- ---------------------------------------------------------------------------
create or replace function public.bar_bounty_active_drinkit_roster()
returns table (player_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name
  from public.players p
  join public.game_memberships gm
    on gm.player_id = p.id
   and gm.game = 'drinkit'::public.game_id
   and gm.enabled
  where p.active
  order by lower(p.display_name), p.id;
$$;

revoke all on function public.bar_bounty_active_drinkit_roster() from public;
grant execute on function public.bar_bounty_active_drinkit_roster() to service_role;

-- ---------------------------------------------------------------------------
-- Serialization helpers for persisted day payloads
-- ---------------------------------------------------------------------------
create or replace function public.bar_bounty_crew_day_payload(p_crew_day_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day public.bar_bounty_crew_days%rowtype;
  v_crews jsonb := '[]'::jsonb;
begin
  select * into v_day from public.bar_bounty_crew_days where id = p_crew_day_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select coalesce(jsonb_agg(crew_obj order by crew_index), '[]'::jsonb)
  into v_crews
  from (
    select
      c.crew_index,
      jsonb_build_object(
        'crew_id', c.id,
        'crew_index', c.crew_index,
        'size', c.size,
        'members', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'player_id', m.player_id,
              'display_name', coalesce(p.display_name, m.display_name_snapshot)
            )
            order by lower(coalesce(p.display_name, m.display_name_snapshot)), m.player_id
          ), '[]'::jsonb)
          from public.bar_bounty_crew_members m
          left join public.players p on p.id = m.player_id
          where m.crew_id = c.id
        )
      ) as crew_obj
    from public.bar_bounty_crews c
    where c.crew_day_id = v_day.id
  ) q;

  return jsonb_build_object(
    'ok', true,
    'status', 'active',
    'crew_day_id', v_day.id,
    'cruise_config_id', v_day.cruise_config_id,
    'cruise_day', v_day.day_number,
    'roster_size', v_day.roster_size,
    'generated_at_utc', v_day.generated_at_utc,
    'seed', v_day.seed,
    'algorithm_version', v_day.algorithm_version,
    'crews', v_crews
  );
end;
$$;

revoke all on function public.bar_bounty_crew_day_payload(uuid) from public;
grant execute on function public.bar_bounty_crew_day_payload(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Core ensure: generate-once with advisory lock + unique day constraint
-- ---------------------------------------------------------------------------
create or replace function public.bar_bounty_ensure_crews_at(
  p_at_utc timestamptz,
  p_seed text default null,
  p_roster_override uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb;
  v_cruise_id uuid;
  v_day integer;
  v_existing_id uuid;
  v_seed text;
  v_roster uuid[];
  v_names text[];
  v_n integer;
  v_sizes integer[];
  v_pair_counts jsonb := '{}'::jsonb;
  v_trials integer := 48;
  v_trial integer;
  v_counter bigint := 0;
  v_order uuid[];
  v_tmp uuid;
  v_i integer;
  v_j integer;
  v_r double precision;
  v_score numeric;
  v_trial_scores numeric[] := '{}'::numeric[];
  v_trial_orders jsonb := '[]'::jsonb;
  v_pair_key text;
  v_pair_count numeric;
  v_cursor integer;
  v_crew_size integer;
  v_crew_ids uuid[];
  v_a uuid;
  v_b uuid;
  v_weight numeric;
  v_weight_sum numeric := 0;
  v_pick numeric;
  v_chosen_idx integer;
  v_chosen uuid[];
  v_day_id uuid;
  v_crew_id uuid;
  v_crew_index integer;
  v_member uuid;
  v_display text;
  v_name_map jsonb := '{}'::jsonb;
  v_lock_ns int;
  v_lock_key int;
begin
  v_ctx := public.bar_bounty_crew_context_at(p_at_utc);
  if coalesce((v_ctx->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'DAY_UNAVAILABLE',
      'reason', coalesce(v_ctx->>'reason', 'unavailable'),
      'cruise_day', (v_ctx->>'cruise_day')::int
    );
  end if;

  v_cruise_id := (v_ctx->>'cruise_config_id')::uuid;
  v_day := (v_ctx->>'cruise_day')::int;

  v_lock_ns := hashtext('bar-bounty-crew');
  v_lock_key := hashtext(v_cruise_id::text || ':' || v_day::text);
  perform pg_advisory_xact_lock(v_lock_ns, v_lock_key);

  select id into v_existing_id
  from public.bar_bounty_crew_days
  where cruise_config_id = v_cruise_id
    and day_number = v_day;

  if found then
    return public.bar_bounty_crew_day_payload(v_existing_id)
      || jsonb_build_object('idempotent', true, 'generated', false);
  end if;

  -- Roster: production uses live Drink It! memberships; override is service/dev only.
  if p_roster_override is not null then
    select array_agg(x.player_id order by lower(x.display_name), x.player_id),
           array_agg(x.display_name order by lower(x.display_name), x.player_id)
    into v_roster, v_names
    from (
      select distinct p.id as player_id, p.display_name
      from unnest(p_roster_override) as oid(id)
      join public.players p on p.id = oid.id
      where p.active
    ) x;
  else
    select array_agg(r.player_id order by lower(r.display_name), r.player_id),
           array_agg(r.display_name order by lower(r.display_name), r.player_id)
    into v_roster, v_names
    from public.bar_bounty_active_drinkit_roster() r;
  end if;

  v_n := coalesce(cardinality(v_roster), 0);
  if v_n < 7 then
    return jsonb_build_object(
      'ok', false,
      'code', 'ROSTER_TOO_SMALL',
      'message', format(
        'Bar Bounty crews need at least 7 active Drink It! players (found %s). Assignments were not created for day %s.',
        v_n, v_day
      ),
      'status', 'roster_too_small',
      'cruise_config_id', v_cruise_id,
      'cruise_day', v_day,
      'roster_size', v_n,
      'minimum_roster', 7
    );
  end if;

  begin
    v_sizes := public.bar_bounty_crew_partition_sizes(v_n);
  exception
    when others then
      return jsonb_build_object(
        'ok', false,
        'code', 'ROSTER_TOO_SMALL',
        'message', format('Cannot partition %s players into crews of 3 or 4.', v_n),
        'status', 'roster_too_small',
        'cruise_config_id', v_cruise_id,
        'cruise_day', v_day,
        'roster_size', v_n,
        'minimum_roster', 7
      );
  end;

  v_seed := nullif(trim(coalesce(p_seed, '')), '');
  if v_seed is null then
    v_seed := gen_random_uuid()::text;
  end if;

  for v_i in 1..v_n loop
    v_name_map := v_name_map || jsonb_build_object(v_roster[v_i]::text, v_names[v_i]);
  end loop;

  -- Pair history from earlier locked days on this cruise.
  select coalesce(jsonb_object_agg(pair_key, cnt), '{}'::jsonb)
  into v_pair_counts
  from (
    select
      least(m1.player_id::text, m2.player_id::text) || '|' ||
        greatest(m1.player_id::text, m2.player_id::text) as pair_key,
      count(*)::numeric as cnt
    from public.bar_bounty_crew_members m1
    join public.bar_bounty_crew_members m2
      on m1.crew_id = m2.crew_id
     and m1.player_id < m2.player_id
    where m1.cruise_config_id = v_cruise_id
      and m1.day_number < v_day
      and m1.player_id = any (v_roster)
      and m2.player_id = any (v_roster)
    group by 1
  ) hist;

  -- Sample random partitions; prefer fewer repeated pairings via soft weights.
  for v_trial in 0..(v_trials - 1) loop
    v_order := v_roster;

    -- Fisher–Yates using hash stream (seed || trial || counter)
    for v_i in reverse cardinality(v_order)..2 loop
      v_counter := v_counter + 1;
      v_r := public.bar_bounty_crew_rand(v_seed || ':t' || v_trial::text, v_counter);
      v_j := 1 + floor(v_r * v_i)::int;
      if v_j < 1 then v_j := 1; end if;
      if v_j > v_i then v_j := v_i; end if;
      v_tmp := v_order[v_i];
      v_order[v_i] := v_order[v_j];
      v_order[v_j] := v_tmp;
    end loop;

    v_score := 0;
    v_cursor := 1;
    foreach v_crew_size in array v_sizes loop
      v_crew_ids := v_order[v_cursor:(v_cursor + v_crew_size - 1)];
      for v_i in 1..(v_crew_size - 1) loop
        for v_j in (v_i + 1)..v_crew_size loop
          v_a := v_crew_ids[v_i];
          v_b := v_crew_ids[v_j];
          v_pair_key := least(v_a::text, v_b::text) || '|' || greatest(v_a::text, v_b::text);
          v_pair_count := coalesce((v_pair_counts->>v_pair_key)::numeric, 0);
          v_score := v_score + v_pair_count;
        end loop;
      end loop;
      v_cursor := v_cursor + v_crew_size;
    end loop;

    v_trial_scores := array_append(v_trial_scores, v_score);
    v_trial_orders := v_trial_orders || jsonb_build_array(to_jsonb(v_order));
  end loop;

  -- weight_i = exp(-0.85 * score_i); pick with seeded roulette
  v_weight_sum := 0;
  for v_i in 1..cardinality(v_trial_scores) loop
    v_weight := exp((-0.85)::double precision * v_trial_scores[v_i]::double precision);
    v_weight_sum := v_weight_sum + v_weight;
  end loop;

  v_counter := v_counter + 1;
  v_pick := public.bar_bounty_crew_rand(v_seed || ':pick', v_counter) * v_weight_sum;
  v_chosen_idx := cardinality(v_trial_scores);
  for v_i in 1..cardinality(v_trial_scores) loop
    v_weight := exp((-0.85)::double precision * v_trial_scores[v_i]::double precision);
    v_pick := v_pick - v_weight;
    if v_pick <= 0 then
      v_chosen_idx := v_i;
      exit;
    end if;
  end loop;

  select array_agg(x::uuid order by ord)
  into v_chosen
  from jsonb_array_elements_text(v_trial_orders -> (v_chosen_idx - 1))
    with ordinality as t(x, ord);

  begin
    insert into public.bar_bounty_crew_days (
      cruise_config_id, day_number, roster_size, seed, algorithm_version, generated_at_utc
    ) values (
      v_cruise_id, v_day, v_n, v_seed, 'b1-v1', clock_timestamp()
    )
    returning id into v_day_id;
  exception
    when unique_violation then
      select id into v_existing_id
      from public.bar_bounty_crew_days
      where cruise_config_id = v_cruise_id
        and day_number = v_day;
      return public.bar_bounty_crew_day_payload(v_existing_id)
        || jsonb_build_object('idempotent', true, 'generated', false, 'raced', true);
  end;

  v_cursor := 1;
  v_crew_index := 0;
  foreach v_crew_size in array v_sizes loop
    insert into public.bar_bounty_crews (crew_day_id, crew_index, size)
    values (v_day_id, v_crew_index, v_crew_size)
    returning id into v_crew_id;

    for v_i in 0..(v_crew_size - 1) loop
      v_member := v_chosen[v_cursor + v_i];
      v_display := coalesce(v_name_map->>v_member::text, v_member::text);

      insert into public.bar_bounty_crew_members (
        crew_id, cruise_config_id, day_number, player_id, display_name_snapshot
      ) values (
        v_crew_id, v_cruise_id, v_day, v_member, v_display
      );
    end loop;

    v_cursor := v_cursor + v_crew_size;
    v_crew_index := v_crew_index + 1;
  end loop;

  return public.bar_bounty_crew_day_payload(v_day_id)
    || jsonb_build_object(
      'idempotent', false,
      'generated', true,
      'partition_sizes', to_jsonb(v_sizes),
      'selected_trial_score', v_trial_scores[v_chosen_idx]
    );
end;
$$;

revoke all on function public.bar_bounty_ensure_crews_at(timestamptz, text, uuid[]) from public;
grant execute on function public.bar_bounty_ensure_crews_at(timestamptz, text, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- Dev wrappers (service_role + development-only cruise)
-- ---------------------------------------------------------------------------
create or replace function public.dev_ensure_bar_bounty_crews_at(
  p_at_utc timestamptz,
  p_seed text default null,
  p_roster_override uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found or v_config.label is distinct from 'development-only' then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;
  return public.bar_bounty_ensure_crews_at(p_at_utc, p_seed, p_roster_override);
end;
$$;

create or replace function public.dev_get_bar_bounty_crews_at(p_at_utc timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_ctx jsonb;
  v_day_id uuid;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found or v_config.label is distinct from 'development-only' then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;

  v_ctx := public.bar_bounty_crew_context_at(p_at_utc);
  if coalesce((v_ctx->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'DAY_UNAVAILABLE',
      'reason', coalesce(v_ctx->>'reason', 'unavailable')
    );
  end if;

  select id into v_day_id
  from public.bar_bounty_crew_days
  where cruise_config_id = (v_ctx->>'cruise_config_id')::uuid
    and day_number = (v_ctx->>'cruise_day')::int;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_GENERATED',
      'cruise_day', (v_ctx->>'cruise_day')::int
    );
  end if;

  return public.bar_bounty_crew_day_payload(v_day_id);
end;
$$;

create or replace function public.dev_bar_bounty_crew_partition_sizes(p_n integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_n is null or p_n < 7 then
    return jsonb_build_object('ok', false, 'code', 'ROSTER_TOO_SMALL', 'n', p_n);
  end if;
  return jsonb_build_object(
    'ok', true,
    'n', p_n,
    'sizes', to_jsonb(public.bar_bounty_crew_partition_sizes(p_n))
  );
end;
$$;

revoke all on function public.dev_ensure_bar_bounty_crews_at(timestamptz, text, uuid[]) from public;
revoke all on function public.dev_get_bar_bounty_crews_at(timestamptz) from public;
revoke all on function public.dev_bar_bounty_crew_partition_sizes(integer) from public;
grant execute on function public.dev_ensure_bar_bounty_crews_at(timestamptz, text, uuid[]) to service_role;
grant execute on function public.dev_get_bar_bounty_crews_at(timestamptz) to service_role;
grant execute on function public.dev_bar_bounty_crew_partition_sizes(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Player read: own current-day crew (generate-on-demand)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_bar_bounty_crew()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_ensured jsonb;
  v_crew_id uuid;
  v_size integer;
  v_members jsonb;
  v_day integer;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  -- Never accept client time/day/roster. Server clock only.
  v_ensured := public.bar_bounty_ensure_crews_at(clock_timestamp(), null, null);

  if coalesce((v_ensured->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'status', coalesce(v_ensured->>'status', 'unavailable'),
      'code', coalesce(v_ensured->>'code', 'UNAVAILABLE'),
      'message', v_ensured->>'message',
      'reason', v_ensured->>'reason',
      'cruise_day', (v_ensured->>'cruise_day')::int,
      'roster_size', (v_ensured->>'roster_size')::int,
      'minimum_roster', (v_ensured->>'minimum_roster')::int
    );
  end if;

  v_day := (v_ensured->>'cruise_day')::int;

  select m.crew_id, c.size
  into v_crew_id, v_size
  from public.bar_bounty_crew_members m
  join public.bar_bounty_crews c on c.id = m.crew_id
  where m.cruise_config_id = (v_ensured->>'cruise_config_id')::uuid
    and m.day_number = v_day
    and m.player_id = v_me
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'status', 'unassigned',
      'reason', 'not_in_todays_roster',
      'cruise_day', v_day,
      'crew_day_id', v_ensured->>'crew_day_id',
      'message', 'Today''s crews are already locked. You will be included on the next game day if still enrolled.'
    );
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'player_id', m.player_id,
      'display_name', coalesce(p.display_name, m.display_name_snapshot),
      'is_self', m.player_id = v_me
    )
    order by (m.player_id = v_me) desc, lower(coalesce(p.display_name, m.display_name_snapshot)), m.player_id
  ), '[]'::jsonb)
  into v_members
  from public.bar_bounty_crew_members m
  left join public.players p on p.id = m.player_id
  where m.crew_id = v_crew_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'assigned',
    'cruise_day', v_day,
    'crew_day_id', v_ensured->>'crew_day_id',
    'crew_id', v_crew_id,
    'crew_size', v_size,
    'members', v_members,
    'generated_at_utc', v_ensured->>'generated_at_utc'
  );
end;
$$;

revoke all on function public.get_my_bar_bounty_crew() from public;
grant execute on function public.get_my_bar_bounty_crew() to authenticated;
grant execute on function public.get_my_bar_bounty_crew() to service_role;

-- ---------------------------------------------------------------------------
-- Admin read: all of today's crews (generate-on-demand) + roster issues
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_bar_bounty_crews()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.require_admin();
  v_ensured jsonb;
begin
  v_ensured := public.bar_bounty_ensure_crews_at(clock_timestamp(), null, null);

  if coalesce((v_ensured->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'status', coalesce(v_ensured->>'status', 'unavailable'),
      'code', coalesce(v_ensured->>'code', 'UNAVAILABLE'),
      'message', coalesce(
        v_ensured->>'message',
        'Bar Bounty crews are unavailable.'
      ),
      'reason', v_ensured->>'reason',
      'cruise_day', (v_ensured->>'cruise_day')::int,
      'roster_size', (v_ensured->>'roster_size')::int,
      'minimum_roster', coalesce((v_ensured->>'minimum_roster')::int, 7),
      'issue', case
        when v_ensured->>'code' = 'ROSTER_TOO_SMALL' then jsonb_build_object(
          'code', 'ROSTER_TOO_SMALL',
          'message', v_ensured->>'message',
          'roster_size', (v_ensured->>'roster_size')::int,
          'minimum_roster', 7
        )
        else null
      end,
      'actor_id', v_actor
    );
  end if;

  return v_ensured || jsonb_build_object('actor_id', v_actor);
end;
$$;

revoke all on function public.admin_list_bar_bounty_crews() from public;
grant execute on function public.admin_list_bar_bounty_crews() to authenticated;
grant execute on function public.admin_list_bar_bounty_crews() to service_role;

-- ---------------------------------------------------------------------------
-- B2 integration helper: assigned mate ids for a player on a day (excludes self)
-- ---------------------------------------------------------------------------
create or replace function public.bar_bounty_crew_mate_ids(
  p_cruise_config_id uuid,
  p_day_number integer,
  p_player_id uuid
)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(m2.player_id order by m2.player_id), '{}'::uuid[])
  from public.bar_bounty_crew_members m1
  join public.bar_bounty_crew_members m2
    on m2.crew_id = m1.crew_id
   and m2.player_id <> m1.player_id
  where m1.cruise_config_id = p_cruise_config_id
    and m1.day_number = p_day_number
    and m1.player_id = p_player_id;
$$;

comment on function public.bar_bounty_crew_mate_ids(uuid, integer, uuid) is
  'B2 scoring helper: assigned crewmates for a player on a locked day. Empty if unassigned.';

revoke all on function public.bar_bounty_crew_mate_ids(uuid, integer, uuid) from public;
grant execute on function public.bar_bounty_crew_mate_ids(uuid, integer, uuid) to service_role;
