-- Phase 2C: Catalog RLS + read-only admin preview RPC.
-- No publish/activate/rollback mutations in this phase.

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table public.bars enable row level security;
alter table public.drink_concepts enable row level security;
alter table public.ingredients enable row level security;
alter table public.bar_offerings enable row level security;
alter table public.catalog_versions enable row level security;
alter table public.active_catalog_pointer enable row level security;
alter table public.catalog_source_notes enable row level security;
alter table public.catalog_version_bars enable row level security;
alter table public.catalog_version_drink_concepts enable row level security;
alter table public.catalog_version_ingredients enable row level security;
alter table public.ingredient_aliases enable row level security;
alter table public.catalog_version_offerings enable row level security;
alter table public.catalog_offering_ingredients enable row level security;
alter table public.cocktail_candidates enable row level security;
alter table public.ingredient_candidates enable row level security;

alter table public.bars force row level security;
alter table public.drink_concepts force row level security;
alter table public.ingredients force row level security;
alter table public.bar_offerings force row level security;
alter table public.catalog_versions force row level security;
alter table public.active_catalog_pointer force row level security;
alter table public.catalog_source_notes force row level security;
alter table public.catalog_version_bars force row level security;
alter table public.catalog_version_drink_concepts force row level security;
alter table public.catalog_version_ingredients force row level security;
alter table public.ingredient_aliases force row level security;
alter table public.catalog_version_offerings force row level security;
alter table public.catalog_offering_ingredients force row level security;
alter table public.cocktail_candidates force row level security;
alter table public.ingredient_candidates force row level security;

-- ---------------------------------------------------------------------------
-- Grants: authenticated may SELECT public-safe rows; never mutate catalog tables.
-- Service role retains full access for future privileged import Edge Functions.
-- ---------------------------------------------------------------------------
revoke all on table public.bars from anon, authenticated;
revoke all on table public.drink_concepts from anon, authenticated;
revoke all on table public.ingredients from anon, authenticated;
revoke all on table public.bar_offerings from anon, authenticated;
revoke all on table public.catalog_versions from anon, authenticated;
revoke all on table public.active_catalog_pointer from anon, authenticated;
revoke all on table public.catalog_source_notes from anon, authenticated;
revoke all on table public.catalog_version_bars from anon, authenticated;
revoke all on table public.catalog_version_drink_concepts from anon, authenticated;
revoke all on table public.catalog_version_ingredients from anon, authenticated;
revoke all on table public.ingredient_aliases from anon, authenticated;
revoke all on table public.catalog_version_offerings from anon, authenticated;
revoke all on table public.catalog_offering_ingredients from anon, authenticated;
revoke all on table public.cocktail_candidates from anon, authenticated;
revoke all on table public.ingredient_candidates from anon, authenticated;

grant select on table public.bars to authenticated;
grant select on table public.drink_concepts to authenticated;
grant select on table public.ingredients to authenticated;
grant select on table public.bar_offerings to authenticated;
grant select on table public.catalog_versions to authenticated;
grant select on table public.active_catalog_pointer to authenticated;
grant select on table public.catalog_version_bars to authenticated;
grant select on table public.catalog_version_drink_concepts to authenticated;
grant select on table public.catalog_version_ingredients to authenticated;
grant select on table public.catalog_version_offerings to authenticated;
grant select on table public.catalog_offering_ingredients to authenticated;
grant select on table public.cocktail_candidates to authenticated;
-- ingredient_candidates: grant select, but RLS policy restricts to admins only
grant select on table public.ingredient_candidates to authenticated;
grant select on table public.ingredient_aliases to authenticated;
grant select on table public.catalog_source_notes to authenticated;

-- Views
grant select on public.player_ingredient_bounty_hints to authenticated;
grant select on public.player_cocktail_bounty_cards to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- Active catalog metadata readable by Drink It! members / admins
create policy catalog_versions_select_active_or_admin
  on public.catalog_versions
  for select
  to authenticated
  using (
    public.is_admin()
    or (status = 'active' and public.has_game('drinkit'::public.game_id))
  );

create policy active_catalog_pointer_select
  on public.active_catalog_pointer
  for select
  to authenticated
  using (public.is_admin() or public.has_game('drinkit'::public.game_id));

create policy bars_select_drinkit
  on public.bars
  for select
  to authenticated
  using (public.is_admin() or public.has_game('drinkit'::public.game_id));

create policy drink_concepts_select_drinkit
  on public.drink_concepts
  for select
  to authenticated
  using (public.is_admin() or public.has_game('drinkit'::public.game_id));

create policy ingredients_select_drinkit
  on public.ingredients
  for select
  to authenticated
  using (public.is_admin() or public.has_game('drinkit'::public.game_id));

create policy bar_offerings_select_drinkit
  on public.bar_offerings
  for select
  to authenticated
  using (public.is_admin() or public.has_game('drinkit'::public.game_id));

create policy catalog_version_bars_select
  on public.catalog_version_bars
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.catalog_versions cv
      where cv.id = catalog_version_id
        and cv.status = 'active'
        and public.has_game('drinkit'::public.game_id)
    )
  );

create policy catalog_version_drink_concepts_select
  on public.catalog_version_drink_concepts
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.catalog_versions cv
      where cv.id = catalog_version_id
        and cv.status = 'active'
        and public.has_game('drinkit'::public.game_id)
    )
  );

create policy catalog_version_ingredients_select
  on public.catalog_version_ingredients
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.catalog_versions cv
      where cv.id = catalog_version_id
        and cv.status = 'active'
        and public.has_game('drinkit'::public.game_id)
    )
  );

create policy catalog_version_offerings_select
  on public.catalog_version_offerings
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.catalog_versions cv
      where cv.id = catalog_version_id
        and cv.status = 'active'
        and public.has_game('drinkit'::public.game_id)
    )
  );

-- Offering ingredients are usable for logging; not a searchable Ingredient solution key.
create policy catalog_offering_ingredients_select
  on public.catalog_offering_ingredients
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.catalog_versions cv
      where cv.id = catalog_version_id
        and cv.status = 'active'
        and public.has_game('drinkit'::public.game_id)
    )
  );

create policy cocktail_candidates_select
  on public.cocktail_candidates
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.catalog_versions cv
      where cv.id = catalog_version_id
        and cv.status = 'active'
        and public.has_game('drinkit'::public.game_id)
    )
  );

-- Ingredient candidates (with coverage metadata) — admin only.
-- Players use player_ingredient_bounty_hints (bar count only, no locations).
create policy ingredient_candidates_admin_select
  on public.ingredient_candidates
  for select
  to authenticated
  using (public.is_admin());

create policy ingredient_aliases_select
  on public.ingredient_aliases
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.catalog_versions cv
      where cv.id = catalog_version_id
        and cv.status = 'active'
        and public.has_game('drinkit'::public.game_id)
    )
  );

create policy catalog_source_notes_admin_select
  on public.catalog_source_notes
  for select
  to authenticated
  using (public.is_admin());

-- Explicitly no INSERT/UPDATE/DELETE policies for authenticated/anon on catalog tables.

-- ---------------------------------------------------------------------------
-- Read-only admin preview: validates payload shape server-side, never writes.
-- Full cross-reference validation lives in the TypeScript catalog service;
-- this RPC enforces organizer authorization and returns a safe preview envelope.
-- ---------------------------------------------------------------------------
create or replace function public.admin_preview_catalog_import(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_before_versions integer;
  v_after_versions integer;
  v_schema_version text;
  v_catalog_id text;
  v_mode text;
  v_bars integer;
  v_drinks integer;
  v_ingredients integer;
  v_cocktail integer;
  v_ingredient integer;
  v_errors jsonb := '[]'::jsonb;
begin
  v_actor := public.require_admin();

  select count(*)::integer into v_before_versions from public.catalog_versions;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object(
      'authorized', true,
      'read_only', true,
      'mutated_database', false,
      'safe_to_publish', false,
      'structurally_valid', false,
      'errors', jsonb_build_array(jsonb_build_object(
        'code', 'PAYLOAD_REQUIRED',
        'message', 'Catalog payload must be a JSON object.'
      )),
      'catalog_versions_before', v_before_versions,
      'catalog_versions_after', v_before_versions
    );
  end if;

  v_schema_version := p_payload->>'schema_version';
  v_catalog_id := p_payload->>'catalog_id';
  v_mode := p_payload->>'mode';

  if v_schema_version is distinct from '1.0' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'SCHEMA_VERSION',
      'message', 'schema_version must be "1.0".'
    ));
  end if;
  if v_mode is distinct from 'full_snapshot' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'MODE',
      'message', 'mode must be "full_snapshot".'
    ));
  end if;
  if v_catalog_id is null or length(trim(v_catalog_id)) = 0 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'CATALOG_ID',
      'message', 'catalog_id is required.'
    ));
  end if;

  v_bars := coalesce(jsonb_array_length(p_payload->'bars'), 0);
  v_drinks := coalesce(jsonb_array_length(p_payload->'drinks'), 0);
  v_ingredients := coalesce(jsonb_array_length(p_payload->'ingredients'), 0);
  v_cocktail := coalesce(jsonb_array_length(p_payload->'cocktail_candidates'), 0);
  v_ingredient := coalesce(jsonb_array_length(p_payload->'ingredient_candidates'), 0);

  -- Intentionally no INSERT/UPDATE — preview only.
  select count(*)::integer into v_after_versions from public.catalog_versions;

  return jsonb_build_object(
    'authorized', true,
    'read_only', true,
    'mutated_database', false,
    'safe_to_publish', false,
    'structurally_valid', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'metadata', jsonb_build_object(
      'schema_version', v_schema_version,
      'catalog_id', v_catalog_id,
      'base_catalog_id', p_payload->>'base_catalog_id',
      'mode', v_mode
    ),
    'counts', jsonb_build_object(
      'bars', v_bars,
      'drinks', v_drinks,
      'ingredients', v_ingredients,
      'cocktail_candidates', v_cocktail,
      'ingredient_candidates', v_ingredient
    ),
    'actor_id', v_actor,
    'catalog_versions_before', v_before_versions,
    'catalog_versions_after', v_after_versions,
    'note', 'Full cross-reference validation is performed by the TypeScript catalog preview service. This RPC is the authorized, read-only server gate.'
  );
end;
$$;

revoke all on function public.admin_preview_catalog_import(jsonb) from public;
grant execute on function public.admin_preview_catalog_import(jsonb) to authenticated;

-- Deny non-admin catalog mutations via a deliberate stub (publish arrives in a later phase).
create or replace function public.admin_publish_catalog_import(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  raise exception 'CATALOG_PUBLISH_NOT_IMPLEMENTED'
    using errcode = 'P0001',
          hint = 'Phase 2C provides preview only. Publish/rollback arrives after scheduling foundation approval.';
end;
$$;

revoke all on function public.admin_publish_catalog_import(jsonb) from public;
grant execute on function public.admin_publish_catalog_import(jsonb) to authenticated;
