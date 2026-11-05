-- Phase 2D-A first gate: stop premature Cocktail/Ingredient objective disclosure.
-- Curated candidate pools and reverse ingredient→drink indexes are admin/server only.
-- Ordinary menu browsing (bars, drink concepts, offerings) remains available to Drink It!.

drop view if exists public.player_cocktail_bounty_cards;

-- cocktail_candidates: admin only (was readable by all Drink It! members)
drop policy if exists cocktail_candidates_select on public.cocktail_candidates;
create policy cocktail_candidates_admin_select
  on public.cocktail_candidates
  for select
  to authenticated
  using (public.is_admin());

-- Reverse ingredient index: do not let players query "which drinks have X?"
drop policy if exists catalog_offering_ingredients_select on public.catalog_offering_ingredients;
create policy catalog_offering_ingredients_admin_select
  on public.catalog_offering_ingredients
  for select
  to authenticated
  using (public.is_admin());

-- Forward recipe for a known offering (drink picker). Requires offering_id — not searchable by ingredient.
create or replace function public.get_offering_display_ingredients(p_offering_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_version uuid;
  v_rows jsonb;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  select catalog_version_id into v_version
  from public.active_catalog_pointer
  where id = 1;

  if v_version is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ingredient_key', i.canonical_key,
    'display_label', coalesce(coi.display_label, cvi.display_name)
  ) order by coalesce(coi.display_label, cvi.display_name)), '[]'::jsonb)
  into v_rows
  from public.catalog_offering_ingredients coi
  join public.ingredients i on i.id = coi.ingredient_id
  join public.catalog_version_ingredients cvi
    on cvi.catalog_version_id = coi.catalog_version_id
   and cvi.ingredient_id = coi.ingredient_id
  where coi.catalog_version_id = v_version
    and coi.offering_id = p_offering_id;

  return v_rows;
end;
$$;

revoke all on function public.get_offering_display_ingredients(uuid) from public;
grant execute on function public.get_offering_display_ingredients(uuid) to authenticated;

comment on function public.get_offering_display_ingredients(uuid) is
  'Forward recipe for a known bar offering. Not a reverse Ingredient Bounty solution search.';
