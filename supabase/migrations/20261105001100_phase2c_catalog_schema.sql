-- Phase 2C: Normalized catalog foundation for Cocktail / Ingredient bounty pools.
-- Authority: handoff/03-Technical-Spec.md §4, §8.
-- Ranking drafts under handoff/data/rankings are NOT loaded as production data.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.catalog_version_status as enum (
  'draft',
  'validated',
  'active',
  'retired'
);

create type public.drink_kind as enum (
  'named_cocktail',
  'beer',
  'wine',
  'other_alcoholic',
  'nonalcoholic'
);

create type public.price_verification_status as enum (
  'verified_within_limit',
  'verified_over_limit',
  'unverified',
  'not_applicable'
);

create type public.cocktail_bounty_tier as enum (
  'familiar',
  'interesting',
  'unusual',
  'adventurous'
);

create type public.ingredient_bounty_tier as enum (
  'easy_to_find',
  'less_common',
  'hard_to_find',
  'elusive'
);

-- ---------------------------------------------------------------------------
-- Stable identities (survive catalog revisions when the entity is the same)
-- ---------------------------------------------------------------------------
create table public.bars (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,
  created_at timestamptz not null default now(),
  constraint bars_canonical_key_format check (canonical_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index bars_canonical_key_uidx on public.bars (canonical_key);

create table public.drink_concepts (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,
  created_at timestamptz not null default now(),
  constraint drink_concepts_canonical_key_format check (canonical_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index drink_concepts_canonical_key_uidx on public.drink_concepts (canonical_key);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,
  created_at timestamptz not null default now(),
  constraint ingredients_canonical_key_format check (canonical_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index ingredients_canonical_key_uidx on public.ingredients (canonical_key);

-- Distinct offering identity per (bar, drink concept) — Mai Tai at two bars = two rows.
create table public.bar_offerings (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars (id),
  drink_concept_id uuid not null references public.drink_concepts (id),
  created_at timestamptz not null default now(),
  constraint bar_offerings_unique_pair unique (bar_id, drink_concept_id)
);

create index bar_offerings_bar_idx on public.bar_offerings (bar_id);
create index bar_offerings_drink_idx on public.bar_offerings (drink_concept_id);

-- ---------------------------------------------------------------------------
-- Catalog versions (immutable snapshots for historical references)
-- ---------------------------------------------------------------------------
create table public.catalog_versions (
  id uuid primary key default gen_random_uuid(),
  catalog_id text not null,
  schema_version text not null,
  base_catalog_id text,
  mode text not null default 'full_snapshot',
  payload_hash text not null,
  manifest_json jsonb not null,
  status public.catalog_version_status not null default 'draft',
  source_notes jsonb not null default '{}'::jsonb,
  imported_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint catalog_versions_mode_check check (mode = 'full_snapshot'),
  constraint catalog_versions_catalog_id_format check (
    catalog_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
  )
);

create unique index catalog_versions_catalog_id_uidx on public.catalog_versions (catalog_id);
create unique index catalog_versions_one_active
  on public.catalog_versions ((status))
  where status = 'active';

comment on table public.catalog_versions is
  'Immutable catalog snapshots. Only one active version; drafts are never auto-activated.';

create table public.active_catalog_pointer (
  id integer primary key default 1 check (id = 1),
  catalog_version_id uuid references public.catalog_versions (id),
  updated_at timestamptz not null default now()
);

insert into public.active_catalog_pointer (id, catalog_version_id) values (1, null);

create table public.catalog_source_notes (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  note_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index catalog_source_notes_version_idx
  on public.catalog_source_notes (catalog_version_id);

-- ---------------------------------------------------------------------------
-- Version-scoped attributes
-- ---------------------------------------------------------------------------
create table public.catalog_version_bars (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  bar_id uuid not null references public.bars (id),
  name text not null,
  deck text,
  active boolean not null default true,
  primary key (catalog_version_id, bar_id)
);

create table public.catalog_version_drink_concepts (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  drink_concept_id uuid not null references public.drink_concepts (id),
  display_name text not null,
  kind public.drink_kind not null,
  primary key (catalog_version_id, drink_concept_id)
);

create table public.catalog_version_ingredients (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  display_name text not null,
  family text,
  primary key (catalog_version_id, ingredient_id)
);

create table public.ingredient_aliases (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  alias text not null,
  alias_normalized text not null,
  primary key (catalog_version_id, ingredient_id, alias_normalized)
);

create unique index ingredient_aliases_unique_normalized
  on public.ingredient_aliases (catalog_version_id, alias_normalized);

create table public.catalog_version_offerings (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  offering_id uuid not null references public.bar_offerings (id),
  price_usd numeric(8, 2),
  price_status public.price_verification_status not null,
  evidence_reference text,
  availability text not null default 'standard',
  seasonal boolean not null default false,
  primary key (catalog_version_id, offering_id),
  constraint catalog_version_offerings_availability_check check (
    availability in ('standard', 'seasonal', 'limited')
  )
);

create table public.catalog_offering_ingredients (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  offering_id uuid not null references public.bar_offerings (id),
  ingredient_id uuid not null references public.ingredients (id),
  display_label text,
  primary key (catalog_version_id, offering_id, ingredient_id)
);

-- ---------------------------------------------------------------------------
-- Curated candidates (classifications supplied externally — not computed here)
-- ---------------------------------------------------------------------------
create table public.cocktail_candidates (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  offering_id uuid not null references public.bar_offerings (id),
  tier public.cocktail_bounty_tier not null,
  points integer not null,
  eligible boolean not null default true,
  notes text,
  primary key (catalog_version_id, offering_id),
  constraint cocktail_candidates_points_check check (
    (tier = 'familiar' and points = 25)
    or (tier = 'interesting' and points = 50)
    or (tier = 'unusual' and points = 75)
    or (tier = 'adventurous' and points = 100)
  )
);

create table public.ingredient_candidates (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  known_bar_count integer not null,
  distinct_qualifying_drinks integer not null,
  tier public.ingredient_bounty_tier not null,
  points integer not null,
  eligible boolean not null default true,
  notes text,
  primary key (catalog_version_id, ingredient_id),
  constraint ingredient_candidates_points_check check (
    (tier = 'easy_to_find' and points = 25)
    or (tier = 'less_common' and points = 50)
    or (tier = 'hard_to_find' and points = 75)
    or (tier = 'elusive' and points = 100)
  ),
  constraint ingredient_candidates_counts_check check (
    known_bar_count >= 0 and distinct_qualifying_drinks >= 0
  )
);

comment on table public.cocktail_candidates is
  'Curated Cocktail Bounty pool for a catalog version. Points/tiers are imported, never computed.';
comment on table public.ingredient_candidates is
  'Curated Ingredient Bounty pool. Qualifying bar/drink lists are NOT player-facing.';

-- ---------------------------------------------------------------------------
-- Player-safe views (no hidden Ingredient locations / qualifying drinks)
-- ---------------------------------------------------------------------------
create or replace view public.player_ingredient_bounty_hints
with (security_invoker = true)
as
select
  ic.catalog_version_id,
  i.canonical_key as ingredient_key,
  cvi.display_name as ingredient_name,
  ic.tier,
  ic.points,
  ic.known_bar_count,
  ic.eligible
from public.ingredient_candidates ic
join public.ingredients i on i.id = ic.ingredient_id
join public.catalog_version_ingredients cvi
  on cvi.catalog_version_id = ic.catalog_version_id
 and cvi.ingredient_id = ic.ingredient_id
join public.catalog_versions cv on cv.id = ic.catalog_version_id
where cv.status = 'active'
  and ic.eligible = true;

comment on view public.player_ingredient_bounty_hints is
  'Player-facing Ingredient objective fields only — never bar names or qualifying drinks.';

create or replace view public.player_cocktail_bounty_cards
with (security_invoker = true)
as
select
  cc.catalog_version_id,
  dc.canonical_key as drink_key,
  cvdc.display_name as drink_name,
  b.canonical_key as designated_bar_key,
  cvb.name as designated_bar_name,
  cc.tier,
  cc.points,
  cc.eligible
from public.cocktail_candidates cc
join public.bar_offerings bo on bo.id = cc.offering_id
join public.drink_concepts dc on dc.id = bo.drink_concept_id
join public.bars b on b.id = bo.bar_id
join public.catalog_version_drink_concepts cvdc
  on cvdc.catalog_version_id = cc.catalog_version_id
 and cvdc.drink_concept_id = dc.id
join public.catalog_version_bars cvb
  on cvb.catalog_version_id = cc.catalog_version_id
 and cvb.bar_id = b.id
join public.catalog_versions cv on cv.id = cc.catalog_version_id
where cv.status = 'active'
  and cc.eligible = true;

comment on view public.player_cocktail_bounty_cards is
  'Player-facing Cocktail card fields (includes designated bar — required by rules).';
