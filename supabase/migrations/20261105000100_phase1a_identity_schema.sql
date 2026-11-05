-- Phase 1A: identity, memberships, teams, login directory foundation
-- Authority: handoff/03-Technical-Spec.md §3–4

create extension if not exists "pgcrypto";

create type public.game_id as enum ('drinkit', 'shipit');

-- ---------------------------------------------------------------------------
-- players: stable app identity (separate from auth.users)
-- ---------------------------------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  display_name text not null,
  login_alias text not null,
  is_admin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_display_name_nonempty check (char_length(trim(display_name)) > 0),
  constraint players_login_alias_nonempty check (char_length(trim(login_alias)) > 0)
);

create unique index players_login_alias_unique on public.players (lower(login_alias));
create unique index players_display_name_unique on public.players (lower(display_name));

create table public.game_memberships (
  player_id uuid not null references public.players (id) on delete cascade,
  game public.game_id not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (player_id, game)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint teams_name_nonempty check (char_length(trim(name)) > 0)
);

create unique index teams_name_unique on public.teams (lower(name));

-- Historical memberships keep team_id forever; only one active membership per player.
create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid not null references public.teams (id),
  active_from timestamptz not null default now(),
  active_to timestamptz,
  created_at timestamptz not null default now(),
  constraint team_memberships_range_valid check (
    active_to is null or active_to > active_from
  )
);

create unique index team_memberships_one_active_per_player
  on public.team_memberships (player_id)
  where active_to is null;

create index team_memberships_team_id_idx on public.team_memberships (team_id);
create index game_memberships_game_enabled_idx
  on public.game_memberships (game)
  where enabled;

-- Public login directory: display name + login alias only (no auth ids, roles, passwords)
create or replace view public.login_directory
with (security_invoker = false)
as
select
  display_name,
  login_alias
from public.players
where active = true
order by display_name;

comment on view public.login_directory is
  'Allowlisted pre-auth dropdown fields only. Never expose auth_user_id, is_admin, or secrets.';

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER with fixed search_path)
-- ---------------------------------------------------------------------------
create or replace function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.players p
  where p.auth_user_id = auth.uid()
    and p.active = true
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_admin
      from public.players p
      where p.auth_user_id = auth.uid()
        and p.active = true
    ),
    false
  )
$$;

create or replace function public.has_game(p_game public.game_id)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_memberships gm
    where gm.player_id = public.current_player_id()
      and gm.game = p_game
      and gm.enabled = true
  )
$$;

create or replace function public.shares_game_with(p_other_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_memberships mine
    join public.game_memberships theirs
      on theirs.game = mine.game
     and theirs.enabled = true
    where mine.player_id = public.current_player_id()
      and mine.enabled = true
      and theirs.player_id = p_other_player_id
  )
$$;

create or replace function public.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.team_id
  from public.team_memberships tm
  where tm.player_id = public.current_player_id()
    and tm.active_to is null
  limit 1
$$;

-- Ship It! members must have exactly one active team (enforced on write)
create or replace function public.enforce_shipit_team_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_shipit boolean;
  v_active_teams integer;
begin
  select exists (
    select 1
    from public.game_memberships gm
    where gm.player_id = coalesce(new.player_id, old.player_id)
      and gm.game = 'shipit'
      and gm.enabled = true
  ) into v_has_shipit;

  select count(*)::integer
  into v_active_teams
  from public.team_memberships tm
  where tm.player_id = coalesce(new.player_id, old.player_id)
    and tm.active_to is null;

  if tg_table_name = 'game_memberships'
     and new.game = 'shipit'
     and new.enabled = true
     and v_active_teams <> 1 then
    raise exception 'Ship It! membership requires exactly one active team assignment'
      using errcode = '23514';
  end if;

  if tg_table_name = 'team_memberships' and v_has_shipit and v_active_teams <> 1 then
    -- Allow transition moments inside a single statement; re-check after statement via constraint trigger.
    null;
  end if;

  return coalesce(new, old);
end;
$$;

create constraint trigger game_memberships_shipit_requires_team
  after insert or update on public.game_memberships
  deferrable initially deferred
  for each row
  execute function public.enforce_shipit_team_assignment();

create or replace function public.enforce_active_team_count_for_shipit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid := coalesce(new.player_id, old.player_id);
  v_has_shipit boolean;
  v_active_teams integer;
begin
  select exists (
    select 1
    from public.game_memberships gm
    where gm.player_id = v_player_id
      and gm.game = 'shipit'
      and gm.enabled = true
  ) into v_has_shipit;

  select count(*)::integer
  into v_active_teams
  from public.team_memberships tm
  where tm.player_id = v_player_id
    and tm.active_to is null;

  if v_has_shipit and v_active_teams <> 1 then
    raise exception 'Ship It! player must have exactly one active team (found %)', v_active_teams
      using errcode = '23514';
  end if;

  if (not v_has_shipit) and v_active_teams > 1 then
    raise exception 'A player may have at most one active team membership'
      using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

create constraint trigger team_memberships_active_count
  after insert or update or delete on public.team_memberships
  deferrable initially deferred
  for each row
  execute function public.enforce_active_team_count_for_shipit();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger players_set_updated_at
  before update on public.players
  for each row
  execute function public.set_updated_at();

-- Session profile for authenticated clients (Phase 1B will consume this)
create or replace function public.get_my_session_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_player public.players%rowtype;
  v_result jsonb;
begin
  select * into v_player
  from public.players
  where auth_user_id = auth.uid()
    and active = true;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'player_id', v_player.id,
    'display_name', v_player.display_name,
    'login_alias', v_player.login_alias,
    'is_admin', v_player.is_admin,
    'games', coalesce(
      (
        select jsonb_agg(jsonb_build_object('game', gm.game, 'enabled', gm.enabled) order by gm.game)
        from public.game_memberships gm
        where gm.player_id = v_player.id
          and gm.enabled = true
      ),
      '[]'::jsonb
    ),
    'team', (
      select jsonb_build_object(
        'team_id', t.id,
        'name', t.name,
        'color', t.color
      )
      from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
      where tm.player_id = v_player.id
        and tm.active_to is null
      limit 1
    )
  )
  into v_result;

  return v_result;
end;
$$;
