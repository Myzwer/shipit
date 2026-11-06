-- Phase 7A: Achievement definitions, awards, classification tags, Gallery achievement kind.
-- Engine evaluate / void / submit wiring lands in 070–071.

-- ---------------------------------------------------------------------------
-- Gallery: achievement announcements
-- ---------------------------------------------------------------------------
alter type public.gallery_event_kind add value if not exists 'achievement';

alter table public.gallery_events
  add column if not exists achievement_award_id uuid;

comment on column public.gallery_events.achievement_award_id is
  'Set for kind=achievement. Null for submission posts.';

-- ---------------------------------------------------------------------------
-- Optional cruise calendar hints (empty until organizer configures)
-- ---------------------------------------------------------------------------
alter table public.cruise_config
  add column if not exists port_days integer[] not null default '{}',
  add column if not exists thanksgiving_ship_date date,
  add column if not exists port_day_start_local time without time zone default time '10:00',
  add column if not exists port_day_end_local time without time zone default time '16:00';

comment on column public.cruise_config.port_days is
  'Cruise day numbers (1–7) designated as port days for achievement windows. Empty until configured.';
comment on column public.cruise_config.thanksgiving_ship_date is
  'Ship-local calendar date for Thanksgiving achievements. Null until voyage confirmed.';

-- ---------------------------------------------------------------------------
-- Classification metadata (empty; never invent values)
-- ---------------------------------------------------------------------------
create table public.ingredient_tags (
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  tag text not null,
  primary key (ingredient_id, tag),
  constraint ingredient_tags_tag_format check (tag ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

comment on table public.ingredient_tags is
  'Structured ingredient classifications (spirit families, fruits, etc.). Empty until curated. Never derived from display aliases.';

create table public.drink_concept_tags (
  drink_concept_id uuid not null references public.drink_concepts (id) on delete cascade,
  tag text not null,
  primary key (drink_concept_id, tag),
  constraint drink_concept_tags_tag_format check (tag ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

comment on table public.drink_concept_tags is
  'Structured drink classifications (frozen, margarita, …). Empty until curated.';

alter table public.ingredient_tags enable row level security;
alter table public.ingredient_tags force row level security;
alter table public.drink_concept_tags enable row level security;
alter table public.drink_concept_tags force row level security;

revoke all on table public.ingredient_tags from anon, authenticated;
revoke all on table public.drink_concept_tags from anon, authenticated;
grant select on table public.ingredient_tags to authenticated, service_role;
grant select on table public.drink_concept_tags to authenticated, service_role;
grant select, insert, update, delete on table public.ingredient_tags to service_role;
grant select, insert, update, delete on table public.drink_concept_tags to service_role;

create policy ingredient_tags_select_drinkit on public.ingredient_tags
  for select to authenticated
  using (public.is_admin() or public.has_game('drinkit'));

create policy drink_concept_tags_select_drinkit on public.drink_concept_tags
  for select to authenticated
  using (public.is_admin() or public.has_game('drinkit'));

-- ---------------------------------------------------------------------------
-- Achievement definitions & awards
-- ---------------------------------------------------------------------------
create type public.achievement_owner_type as enum ('player', 'team');
create type public.achievement_group as enum ('milestones', 'firsts', 'other');
create type public.achievement_award_status as enum ('active', 'revoked');

create table public.achievement_definitions (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null,
  game public.game_id not null,
  owner_type public.achievement_owner_type not null,
  group_key public.achievement_group not null default 'other',
  title text not null,
  display_description text not null,
  secret boolean not null default false,
  exclusive boolean not null default false,
  icon_key text,
  enabled boolean not null default true,
  condition_type text not null,
  condition_config jsonb not null default '{}'::jsonb,
  test_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint achievement_definitions_stable_key_unique unique (stable_key),
  constraint achievement_definitions_stable_key_format check (
    stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint achievement_definitions_title_nonempty check (char_length(trim(title)) > 0),
  constraint achievement_definitions_condition_type_nonempty check (char_length(trim(condition_type)) > 0),
  constraint achievement_definitions_owner_game check (
    (game = 'drinkit' and owner_type = 'player')
    or (game = 'shipit' and owner_type = 'team')
  )
);

comment on table public.achievement_definitions is
  'Data-driven achievement catalog. Phase 7A ships test-only defs; production catalog is Phase 7B.';

create table public.achievement_awards (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.achievement_definitions (id),
  owner_player_id uuid references public.players (id),
  owner_team_id uuid references public.teams (id),
  status public.achievement_award_status not null default 'active',
  source_submission_id uuid references public.submissions (id) on delete set null,
  awarded_at_utc timestamptz not null,
  revoked_at_utc timestamptz,
  revoke_reason text,
  evidence_json jsonb not null default '{}'::jsonb,
  gallery_event_id uuid,
  created_at timestamptz not null default now(),
  constraint achievement_awards_owner_xor check (
    (owner_player_id is not null and owner_team_id is null)
    or (owner_player_id is null and owner_team_id is not null)
  ),
  constraint achievement_awards_revoke_fields check (
    (status = 'active' and revoked_at_utc is null)
    or (status = 'revoked' and revoked_at_utc is not null)
  )
);

create unique index achievement_awards_one_active_shared
  on public.achievement_awards (definition_id, owner_player_id)
  where status = 'active' and owner_player_id is not null;

create unique index achievement_awards_one_active_team
  on public.achievement_awards (definition_id, owner_team_id)
  where status = 'active' and owner_team_id is not null;

create unique index achievement_awards_one_active_exclusive
  on public.achievement_awards (definition_id)
  where status = 'active';

-- Note: exclusive unique applies to ALL active awards per definition.
-- Shared awards need the exclusive flag false so multiple owners can win.
-- Enforce: exclusive defs use only the exclusive index conceptually by
-- checking exclusive at insert time; shared defs would conflict on exclusive index!
-- Fix: partial exclusive index only when definition is exclusive — use a flag column copy
-- or expression. Postgres can't join in partial index easily. Approach:
-- drop blanket exclusive unique; add exclusive_winner boolean on award for exclusive defs only.

drop index if exists public.achievement_awards_one_active_exclusive;

alter table public.achievement_awards
  add column if not exists exclusive_slot boolean not null default false;

create unique index achievement_awards_one_active_exclusive
  on public.achievement_awards (definition_id)
  where status = 'active' and exclusive_slot is true;

create index achievement_awards_owner_player_idx
  on public.achievement_awards (owner_player_id, awarded_at_utc desc)
  where status = 'active';

create index achievement_awards_owner_team_idx
  on public.achievement_awards (owner_team_id, awarded_at_utc desc)
  where status = 'active';

alter table public.achievement_awards
  add constraint achievement_awards_gallery_fk
  foreign key (gallery_event_id) references public.gallery_events (id);

alter table public.gallery_events
  add constraint gallery_events_achievement_award_fk
  foreign key (achievement_award_id) references public.achievement_awards (id) on delete set null;

alter table public.achievement_definitions enable row level security;
alter table public.achievement_definitions force row level security;
alter table public.achievement_awards enable row level security;
alter table public.achievement_awards force row level security;

revoke all on table public.achievement_definitions from anon, authenticated;
revoke all on table public.achievement_awards from anon, authenticated;
grant select on table public.achievement_definitions to authenticated, service_role;
grant select on table public.achievement_awards to authenticated, service_role;
grant select, insert, update, delete on table public.achievement_definitions to service_role;
grant select, insert, update, delete on table public.achievement_awards to service_role;

-- Players may read non-secret definitions and their own/team awards via RPCs primarily.
-- Direct select: enabled non-test defs for members of that game; secret rows still selectable
-- but RPCs mask fields. Awards: own player or own team membership.
create policy achievement_definitions_select on public.achievement_definitions
  for select to authenticated
  using (
    public.is_admin()
    or (
      test_only is false
      and enabled is true
      and public.has_game(game)
    )
  );

create policy achievement_awards_select on public.achievement_awards
  for select to authenticated
  using (
    public.is_admin()
    or owner_player_id = public.current_player_id()
    or (
      owner_team_id is not null
      and exists (
        select 1 from public.team_memberships tm
        where tm.team_id = achievement_awards.owner_team_id
          and tm.player_id = public.current_player_id()
          and tm.active_to is null
      )
    )
  );
