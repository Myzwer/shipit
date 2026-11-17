-- Phase 2C.13A: Ingredient Bounty — eligible bar availability (locations only).
--
-- Reveals which physical bars carry an eligible matching offering for the
-- current Ingredient Bounty. Never returns qualifying drink names.
--
-- Eligibility mirrors catalog corroboration / bounty-capable offerings:
--   - active physical bars in the current catalog version
--   - named_cocktail offerings
--   - within-limit price evidence (achievement_offering_collection_price_ok)
--   - drinkit_offering_has_ingredient (catalog associations + active corrections)
-- Distinct bars (not offerings). Virtual Mobile Order is excluded.
--
-- Does not change rarity, points, claim limits, scoring, photo, or companions.

-- ---------------------------------------------------------------------------
-- Internal: distinct eligible bar keys for one ingredient in one catalog.
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_ingredient_eligible_bar_keys(
  p_catalog_version_id uuid,
  p_ingredient_id uuid
)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(canonical_key order by canonical_key),
    array[]::text[]
  )
  from (
    select distinct b.canonical_key
    from public.bar_offerings bo
    join public.catalog_version_offerings cvo
      on cvo.offering_id = bo.id
     and cvo.catalog_version_id = p_catalog_version_id
    join public.drink_concepts dc
      on dc.id = bo.drink_concept_id
    join public.catalog_version_drink_concepts cvd
      on cvd.catalog_version_id = p_catalog_version_id
     and cvd.drink_concept_id = dc.id
    join public.bars b
      on b.id = bo.bar_id
    join public.catalog_version_bars cvb
      on cvb.catalog_version_id = p_catalog_version_id
     and cvb.bar_id = b.id
    where p_catalog_version_id is not null
      and p_ingredient_id is not null
      and cvb.active is true
      -- Physical bars only (Mobile Order / virtual sources never guide Ingredient Claim).
      and coalesce((to_jsonb(b)->>'is_virtual')::boolean, false) is false
      and b.canonical_key is distinct from 'mobile-order'
      and cvd.kind = 'named_cocktail'
      and public.achievement_offering_collection_price_ok(cvo.price_status)
      and public.drinkit_offering_has_ingredient(
        p_catalog_version_id,
        bo.id,
        p_ingredient_id,
        null
      )
  ) t;
$$;

revoke all on function public.drinkit_ingredient_eligible_bar_keys(uuid, uuid) from public;
grant execute on function public.drinkit_ingredient_eligible_bar_keys(uuid, uuid) to service_role;

comment on function public.drinkit_ingredient_eligible_bar_keys(uuid, uuid) is
  '2C.13A: distinct physical bar keys with a bounty-capable offering carrying the ingredient. No drink names.';

-- ---------------------------------------------------------------------------
-- Player read: current Ingredient Bounty eligible bars (keys + count only).
-- ---------------------------------------------------------------------------
create or replace function public.get_my_ingredient_bounty_bar_availability()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_raw jsonb;
  v_catalog uuid;
  v_ingredient_id uuid;
  v_keys text[];
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  select catalog_version_id into v_catalog from public.active_catalog_pointer where id = 1;
  if v_catalog is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'no_active_catalog',
      'bar_count', 0,
      'bar_canonical_keys', '[]'::jsonb
    );
  end if;

  v_raw := public.bounty_resolve_at('ingredient', now(), true, false);
  if v_raw->>'status' is distinct from 'active' then
    return jsonb_build_object(
      'status', coalesce(v_raw->>'status', 'unavailable'),
      'reason', coalesce(v_raw->>'reason', v_raw->>'status'),
      'bar_count', 0,
      'bar_canonical_keys', '[]'::jsonb
    );
  end if;

  begin
    v_ingredient_id := (v_raw->>'ingredient_id')::uuid;
  exception when others then
    v_ingredient_id := null;
  end;

  if v_ingredient_id is null then
    select bso.ingredient_id
      into v_ingredient_id
    from public.bounty_slot_offers bso
    where bso.id = (v_raw->>'offer_id')::uuid
    limit 1;
  end if;

  if v_ingredient_id is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'ingredient_unresolved',
      'offer_id', v_raw->>'offer_id',
      'slot_key', v_raw->>'slot_key',
      'bar_count', 0,
      'bar_canonical_keys', '[]'::jsonb
    );
  end if;

  v_keys := public.drinkit_ingredient_eligible_bar_keys(v_catalog, v_ingredient_id);

  return jsonb_build_object(
    'status', 'active',
    'offer_id', v_raw->>'offer_id',
    'slot_key', v_raw->>'slot_key',
    'ingredient_key', v_raw->'display'->>'ingredient_key',
    'bar_count', coalesce(cardinality(v_keys), 0),
    'bar_canonical_keys', to_jsonb(coalesce(v_keys, array[]::text[]))
  );
end;
$$;

revoke all on function public.get_my_ingredient_bounty_bar_availability() from public;
grant execute on function public.get_my_ingredient_bounty_bar_availability() to authenticated;
grant execute on function public.get_my_ingredient_bounty_bar_availability() to service_role;

comment on function public.get_my_ingredient_bounty_bar_availability() is
  '2C.13A: Ingredient Claim bar guidance. Returns eligible bar keys + count only — never drink names.';

-- ---------------------------------------------------------------------------
-- Home card: known_bar_count from the same live eligibility (keeps Home ↔ Claim aligned).
-- ---------------------------------------------------------------------------
create or replace function public.get_my_current_ingredient_bounty()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_raw jsonb;
  v_config public.cruise_config%rowtype;
  v_life jsonb;
  v_day integer;
  v_claimed boolean := false;
  v_claimed_points integer := null;
  v_catalog uuid;
  v_ingredient_id uuid;
  v_bar_count integer;
  v_snapshot_count integer;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  v_raw := public.bounty_resolve_at('ingredient', now(), true, false);
  if v_raw->>'status' is distinct from 'active' then
    return v_raw;
  end if;

  select catalog_version_id into v_catalog from public.active_catalog_pointer where id = 1;

  begin
    v_ingredient_id := (v_raw->>'ingredient_id')::uuid;
  exception when others then
    v_ingredient_id := null;
  end;
  if v_ingredient_id is null and v_raw->>'offer_id' is not null then
    select bso.ingredient_id
      into v_ingredient_id
    from public.bounty_slot_offers bso
    where bso.id = (v_raw->>'offer_id')::uuid
    limit 1;
  end if;

  if v_catalog is not null and v_ingredient_id is not null then
    v_bar_count := cardinality(
      public.drinkit_ingredient_eligible_bar_keys(v_catalog, v_ingredient_id)
    );
  else
    begin
      v_snapshot_count := (v_raw->'display'->>'known_bar_count')::int;
    exception when others then
      v_snapshot_count := null;
    end;
    v_bar_count := v_snapshot_count;
  end if;

  v_life := public.drinkit_lifecycle_at(now());
  v_day := (v_life->>'cruise_day')::int;
  select * into v_config from public.cruise_config where is_active limit 1;

  if v_config.id is not null and v_day is not null then
    select true, bc.points
      into v_claimed, v_claimed_points
    from public.bounty_claims bc
    where bc.player_id = v_me
      and bc.cruise_config_id = v_config.id
      and bc.category = 'ingredient'
      and bc.status = 'active'
      and bc.game_day = v_day
    limit 1;
  end if;

  if coalesce(v_claimed, false) then
    return jsonb_build_object(
      'status', 'already_claimed',
      'reason', 'category_used_today',
      'cruise_day', v_day,
      'offer_id', v_raw->>'offer_id',
      'slot_key', v_raw->>'slot_key',
      'ingredient_key', v_raw->'display'->>'ingredient_key',
      'display_name', v_raw->'display'->>'display_name',
      'tier', v_raw->'display'->>'tier',
      'points', coalesce(v_claimed_points, 0),
      'known_bar_count', v_bar_count,
      'public_end_utc', v_raw->>'public_end_utc'
    );
  end if;

  return jsonb_build_object(
    'status', 'active',
    'offer_id', v_raw->>'offer_id',
    'slot_key', v_raw->>'slot_key',
    'ingredient_key', v_raw->'display'->>'ingredient_key',
    'display_name', v_raw->'display'->>'display_name',
    'tier', v_raw->'display'->>'tier',
    'points', (v_raw->'display'->>'points')::int,
    'known_bar_count', v_bar_count,
    'public_end_utc', v_raw->>'public_end_utc'
  );
end;
$$;

revoke all on function public.get_my_current_ingredient_bounty() from public;
grant execute on function public.get_my_current_ingredient_bounty() to authenticated;
grant execute on function public.get_my_current_ingredient_bounty() to service_role;

comment on function public.get_my_current_ingredient_bounty() is
  'Player Ingredient Bounty home card. 2C.13A: known_bar_count from live eligible bars (no drink names).';
