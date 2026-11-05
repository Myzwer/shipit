-- Phase 2C.1: Player-safe Ingredient hint contract + cocktail concept uniqueness.
-- Does not expose the full ingredient candidate pool or qualifying bar/drink lists.

-- ---------------------------------------------------------------------------
-- 1) Replace broken security_invoker view with an exposure ledger + RPC
-- ---------------------------------------------------------------------------
drop view if exists public.player_ingredient_bounty_hints;

-- Narrow public cards: only fields a Drink It! player may see for an *exposed* objective.
-- Populated by the future scheduling engine (Phase 2D). Never join player reads to
-- ingredient_candidates (which retains admin-only RLS).
create table public.ingredient_bounty_public_cards (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  ingredient_canonical_key text not null,
  display_name text not null,
  tier public.ingredient_bounty_tier not null,
  points integer not null,
  known_bar_count integer not null,
  -- 'scheduled' = reserved for a future slot (not player-visible yet)
  -- 'current'   = the active exposed objective players may read
  -- 'retired'   = previously shown; retained for audit, not player-visible
  exposure_status text not null default 'scheduled',
  slot_key text,
  exposed_at_utc timestamptz,
  created_at timestamptz not null default now(),
  constraint ingredient_bounty_public_cards_status_check check (
    exposure_status in ('scheduled', 'current', 'retired')
  ),
  constraint ingredient_bounty_public_cards_points_check check (
    points in (25, 50, 75, 100)
  ),
  constraint ingredient_bounty_public_cards_bar_count_check check (
    known_bar_count >= 0
  )
);

create unique index ingredient_bounty_public_cards_one_current
  on public.ingredient_bounty_public_cards ((exposure_status))
  where exposure_status = 'current';

create index ingredient_bounty_public_cards_version_idx
  on public.ingredient_bounty_public_cards (catalog_version_id);

comment on table public.ingredient_bounty_public_cards is
  'Player-safe Ingredient objective snapshots. Only exposure_status=current is readable by Drink It! players. Qualifying bars/drinks are never stored here. Phase 2D scheduling writes rows; Phase 2C.1 establishes the contract.';

alter table public.ingredient_bounty_public_cards enable row level security;
alter table public.ingredient_bounty_public_cards force row level security;

revoke all on table public.ingredient_bounty_public_cards from anon, authenticated;
grant select on table public.ingredient_bounty_public_cards to authenticated;

-- Players: only the current exposed card (no scheduled/future pool).
create policy ingredient_bounty_public_cards_player_current
  on public.ingredient_bounty_public_cards
  for select
  to authenticated
  using (
    public.is_admin()
    or (
      exposure_status = 'current'
      and public.has_game('drinkit'::public.game_id)
    )
  );

-- Security-definer read contract: returns at most the current card for Drink It! members.
create or replace function public.get_my_ingredient_bounty_hint()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_row public.ingredient_bounty_public_cards%rowtype;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  select * into v_row
  from public.ingredient_bounty_public_cards
  where exposure_status = 'current'
  limit 1;

  if not found then
    -- Foundation ready; Phase 2D slot ledger will expose objectives.
    return null;
  end if;

  -- Deliberately omit ingredient_id linkage details beyond canonical key + public fields.
  return jsonb_build_object(
    'ingredient_key', v_row.ingredient_canonical_key,
    'display_name', v_row.display_name,
    'tier', v_row.tier,
    'points', v_row.points,
    'known_bar_count', v_row.known_bar_count,
    'slot_key', v_row.slot_key,
    'exposed_at_utc', v_row.exposed_at_utc
  );
end;
$$;

revoke all on function public.get_my_ingredient_bounty_hint() from public;
grant execute on function public.get_my_ingredient_bounty_hint() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Cocktail candidates: one curated bounty per drink concept per version
-- ---------------------------------------------------------------------------
alter table public.cocktail_candidates
  add column if not exists drink_concept_id uuid references public.drink_concepts (id);

update public.cocktail_candidates cc
set drink_concept_id = bo.drink_concept_id
from public.bar_offerings bo
where cc.offering_id = bo.id
  and cc.drink_concept_id is null;

create unique index if not exists cocktail_candidates_one_concept_per_version
  on public.cocktail_candidates (catalog_version_id, drink_concept_id)
  where drink_concept_id is not null;

create or replace function public.enforce_cocktail_candidate_concept()
returns trigger
language plpgsql
as $$
declare
  v_concept uuid;
begin
  select drink_concept_id into v_concept
  from public.bar_offerings
  where id = new.offering_id;
  if v_concept is null then
    raise exception 'COCKTAIL_CANDIDATE_UNKNOWN_OFFERING' using errcode = '23503';
  end if;
  if new.drink_concept_id is null then
    new.drink_concept_id := v_concept;
  elsif new.drink_concept_id is distinct from v_concept then
    raise exception 'COCKTAIL_CANDIDATE_CONCEPT_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists cocktail_candidates_sync_concept on public.cocktail_candidates;
create trigger cocktail_candidates_sync_concept
  before insert or update of offering_id, drink_concept_id
  on public.cocktail_candidates
  for each row
  execute function public.enforce_cocktail_candidate_concept();

comment on column public.cocktail_candidates.drink_concept_id is
  'Canonical drink concept for nonrepetition. At most one Cocktail Bounty candidate per concept per catalog version; designated bar is the offering''s bar.';
