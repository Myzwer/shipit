-- Phase 2D-A: Durable bounty slot ledger (Cocktail + Ingredient).
-- Authority: Technical Spec §4, §5.2, §6.1; Director Phase 2D-A slot windows.

create type public.bounty_category as enum ('cocktail', 'ingredient');

create type public.bounty_slot_state as enum (
  'scheduled',      -- preallocated; not yet shown
  'current',        -- publicly exposed as the live objective
  'exposed',        -- was shown; public window ended
  'missed_paused',  -- window elapsed while Drink It! paused; never shown
  'skipped'         -- reserved for future Admin skip
);

create table public.bounty_slots (
  id uuid primary key default gen_random_uuid(),
  cruise_config_id uuid not null references public.cruise_config (id) on delete cascade,
  catalog_version_id uuid not null references public.catalog_versions (id),
  category public.bounty_category not null,
  cruise_day integer not null,
  slot_index integer not null,
  slot_key text not null,
  -- Ship-local public window (timezone-less wall clock on the cruise day calendar date)
  ship_date date not null,
  public_start_ship_local time not null,
  public_end_ship_local time not null,
  state public.bounty_slot_state not null default 'scheduled',
  current_offer_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bounty_slots_day_check check (cruise_day between 1 and 7),
  constraint bounty_slots_index_check check (slot_index >= 0),
  constraint bounty_slots_window_check check (public_end_ship_local > public_start_ship_local),
  constraint bounty_slots_unique_identity unique (cruise_config_id, category, cruise_day, slot_index),
  constraint bounty_slots_unique_key unique (cruise_config_id, slot_key)
);

create index bounty_slots_lookup_idx
  on public.bounty_slots (cruise_config_id, category, ship_date, public_start_ship_local);

create table public.bounty_slot_offers (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.bounty_slots (id) on delete cascade,
  catalog_version_id uuid not null references public.catalog_versions (id),
  -- Canonical nonrepetition identity (drink concept key or ingredient key)
  canonical_key text not null,
  cocktail_concept_id uuid references public.drink_concepts (id),
  cocktail_offering_id uuid references public.bar_offerings (id),
  ingredient_id uuid references public.ingredients (id),
  tier text not null,
  points integer not null,
  -- Immutable player-safe display snapshot at assignment time
  display_snapshot jsonb not null default '{}'::jsonb,
  assigned_at_utc timestamptz not null default now(),
  exposed_at_utc timestamptz,
  replaced_at_utc timestamptz,
  is_active boolean not null default true,
  reason text not null default 'initial',
  constraint bounty_slot_offers_points_check check (points in (25, 50, 75, 100)),
  constraint bounty_slot_offers_objective_check check (
    (cocktail_concept_id is not null and cocktail_offering_id is not null and ingredient_id is null)
    or (ingredient_id is not null and cocktail_concept_id is null and cocktail_offering_id is null)
  )
);

create unique index bounty_slot_offers_one_active
  on public.bounty_slot_offers (slot_id)
  where is_active;

create index bounty_slot_offers_canonical_idx
  on public.bounty_slot_offers (catalog_version_id, canonical_key);

alter table public.bounty_slots
  add constraint bounty_slots_current_offer_fk
  foreign key (current_offer_id) references public.bounty_slot_offers (id);

-- Cruise-wide nonrepetition of exposed objectives (survives catalog version swaps for future imports)
create table public.bounty_objective_exposures (
  id uuid primary key default gen_random_uuid(),
  cruise_config_id uuid not null references public.cruise_config (id) on delete cascade,
  category public.bounty_category not null,
  canonical_key text not null,
  first_offer_id uuid not null references public.bounty_slot_offers (id),
  first_slot_id uuid not null references public.bounty_slots (id),
  first_exposed_at_utc timestamptz not null,
  constraint bounty_objective_exposures_unique unique (cruise_config_id, category, canonical_key)
);

create table public.bounty_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  cruise_config_id uuid not null references public.cruise_config (id) on delete cascade,
  catalog_version_id uuid not null references public.catalog_versions (id),
  cocktail_slots integer not null,
  ingredient_slots integer not null,
  seed_token text,
  created_at timestamptz not null default now(),
  created_by uuid references public.players (id),
  notes jsonb not null default '{}'::jsonb
);

create unique index bounty_schedule_runs_one_per_cruise
  on public.bounty_schedule_runs (cruise_config_id);

comment on table public.bounty_slots is
  'Durable Drink It! rotating slot ledger. Slot identity is cruise day + ship-local window, not phone TZ.';
comment on table public.bounty_slot_offers is
  'Offer revisions for a slot. Active offer is current assignment; exposure is tracked separately.';
comment on table public.bounty_objective_exposures is
  'Once exposed, canonical Cocktail concept / Ingredient key cannot repeat this cruise.';

-- RLS: players never read the ledger tables directly
alter table public.bounty_slots enable row level security;
alter table public.bounty_slot_offers enable row level security;
alter table public.bounty_objective_exposures enable row level security;
alter table public.bounty_schedule_runs enable row level security;

alter table public.bounty_slots force row level security;
alter table public.bounty_slot_offers force row level security;
alter table public.bounty_objective_exposures force row level security;
alter table public.bounty_schedule_runs force row level security;

revoke all on table public.bounty_slots from anon, authenticated;
revoke all on table public.bounty_slot_offers from anon, authenticated;
revoke all on table public.bounty_objective_exposures from anon, authenticated;
revoke all on table public.bounty_schedule_runs from anon, authenticated;

grant select on table public.bounty_slots to authenticated;
grant select on table public.bounty_slot_offers to authenticated;
grant select on table public.bounty_objective_exposures to authenticated;
grant select on table public.bounty_schedule_runs to authenticated;

create policy bounty_slots_admin_select
  on public.bounty_slots for select to authenticated
  using (public.is_admin());

create policy bounty_slot_offers_admin_select
  on public.bounty_slot_offers for select to authenticated
  using (public.is_admin());

create policy bounty_objective_exposures_admin_select
  on public.bounty_objective_exposures for select to authenticated
  using (public.is_admin());

create policy bounty_schedule_runs_admin_select
  on public.bounty_schedule_runs for select to authenticated
  using (public.is_admin());
