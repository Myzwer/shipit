-- Phase 10A: authentic Ship It! challenge titles + catalog fixture schema 1.1 support.
-- Development preview only. Does not authorize production activation.

-- ---------------------------------------------------------------------------
-- 1) Strip [DEV] prefixes from development challenge titles (stable keys unchanged)
-- ---------------------------------------------------------------------------
update public.scavenger_challenges
set title = regexp_replace(title, '^\[DEV\]\s+', '')
where title like '[DEV] %';

-- ---------------------------------------------------------------------------
-- 2) Allow development catalog fixture activation for schema 1.0 or 1.1
-- ---------------------------------------------------------------------------
create or replace function public.dev_activate_catalog_fixture(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config;
  v_version_id uuid;
  v_catalog_id text;
  v_schema text;
  v_bar jsonb;
  v_ing jsonb;
  v_drink jsonb;
  v_off jsonb;
  v_cand jsonb;
  v_bar_id uuid;
  v_drink_id uuid;
  v_ing_id uuid;
  v_offering_id uuid;
  v_alias text;
  v_hash text;
begin
  select * into v_config from public.cruise_config where is_active limit 1 for update;
  if not found then
    raise exception 'NO_ACTIVE_CRUISE_CONFIG' using errcode = 'P0001';
  end if;
  if v_config.label is distinct from 'development-only' then
    raise exception 'DEV_CATALOG_ACTIVATION_FORBIDDEN'
      using errcode = '42501',
            hint = 'Fixture activation is allowed only when cruise_config.label = development-only';
  end if;

  v_schema := p_payload->>'schema_version';
  if v_schema is distinct from '1.0' and v_schema is distinct from '1.1' then
    raise exception 'INVALID_CATALOG_FIXTURE'
      using errcode = '22023',
            hint = 'schema_version must be 1.0 or 1.1 with mode full_snapshot';
  end if;
  if p_payload->>'mode' is distinct from 'full_snapshot' then
    raise exception 'INVALID_CATALOG_FIXTURE' using errcode = '22023';
  end if;

  v_catalog_id := p_payload->>'catalog_id';
  v_hash := md5(p_payload::text);

  delete from public.bounty_objective_exposures where cruise_config_id = v_config.id;
  delete from public.bounty_schedule_runs where cruise_config_id = v_config.id;
  update public.bounty_slots set current_offer_id = null where cruise_config_id = v_config.id;
  delete from public.bounty_slot_offers
    where slot_id in (select id from public.bounty_slots where cruise_config_id = v_config.id);
  delete from public.bounty_slots where cruise_config_id = v_config.id;
  delete from public.ingredient_bounty_public_cards where id is not null;
  update public.active_catalog_pointer set catalog_version_id = null, updated_at = now() where id = 1;
  update public.catalog_versions set status = 'retired' where status in ('active', 'validated');

  insert into public.catalog_versions (
    catalog_id, schema_version, base_catalog_id, mode, payload_hash,
    manifest_json, status, source_notes, imported_at, activated_at
  ) values (
    v_catalog_id,
    v_schema,
    p_payload->>'base_catalog_id',
    'full_snapshot',
    v_hash,
    p_payload,
    'draft',
    coalesce(p_payload->'source_notes', '{}'::jsonb),
    now(),
    null
  )
  on conflict (catalog_id) do update
    set payload_hash = excluded.payload_hash,
        manifest_json = excluded.manifest_json,
        schema_version = excluded.schema_version,
        status = 'draft',
        source_notes = excluded.source_notes,
        imported_at = now(),
        activated_at = null
  returning id into v_version_id;

  delete from public.cocktail_candidates where catalog_version_id = v_version_id;
  delete from public.ingredient_candidates where catalog_version_id = v_version_id;
  delete from public.catalog_offering_ingredients where catalog_version_id = v_version_id;
  delete from public.catalog_version_offerings where catalog_version_id = v_version_id;
  delete from public.ingredient_aliases where catalog_version_id = v_version_id;
  delete from public.catalog_version_ingredients where catalog_version_id = v_version_id;
  delete from public.catalog_version_drink_concepts where catalog_version_id = v_version_id;
  delete from public.catalog_version_bars where catalog_version_id = v_version_id;
  delete from public.catalog_version_ingredient_tags where catalog_version_id = v_version_id;
  delete from public.catalog_version_drink_concept_tags where catalog_version_id = v_version_id;
  delete from public.catalog_version_offering_tags where catalog_version_id = v_version_id;

  for v_bar in select * from jsonb_array_elements(p_payload->'bars')
  loop
    insert into public.bars (canonical_key)
    values (v_bar->>'key')
    on conflict (canonical_key) do update set canonical_key = excluded.canonical_key
    returning id into v_bar_id;
    select id into v_bar_id from public.bars where canonical_key = v_bar->>'key';
    insert into public.catalog_version_bars (catalog_version_id, bar_id, name, deck, active)
    values (
      v_version_id, v_bar_id, v_bar->>'name', nullif(v_bar->>'deck', ''),
      coalesce((v_bar->>'active')::boolean, true)
    )
    on conflict (catalog_version_id, bar_id) do update
      set name = excluded.name, deck = excluded.deck, active = excluded.active;
  end loop;

  for v_ing in select * from jsonb_array_elements(p_payload->'ingredients')
  loop
    insert into public.ingredients (canonical_key)
    values (v_ing->>'key')
    on conflict (canonical_key) do nothing;
    select id into v_ing_id from public.ingredients where canonical_key = v_ing->>'key';
    insert into public.catalog_version_ingredients (catalog_version_id, ingredient_id, display_name, family)
    values (v_version_id, v_ing_id, v_ing->>'name', nullif(v_ing->>'family', ''))
    on conflict (catalog_version_id, ingredient_id) do update
      set display_name = excluded.display_name, family = excluded.family;
    if v_ing ? 'aliases' then
      for v_alias in select * from jsonb_array_elements_text(v_ing->'aliases')
      loop
        insert into public.ingredient_aliases (
          catalog_version_id, ingredient_id, alias, alias_normalized
        ) values (
          v_version_id, v_ing_id, v_alias, lower(trim(v_alias))
        )
        on conflict do nothing;
      end loop;
    end if;
  end loop;

  for v_drink in select * from jsonb_array_elements(p_payload->'drinks')
  loop
    insert into public.drink_concepts (canonical_key)
    values (v_drink->>'key')
    on conflict (canonical_key) do nothing;
    select id into v_drink_id from public.drink_concepts where canonical_key = v_drink->>'key';
    insert into public.catalog_version_drink_concepts (
      catalog_version_id, drink_concept_id, display_name, kind
    ) values (
      v_version_id, v_drink_id, v_drink->>'name', (v_drink->>'kind')::public.drink_kind
    )
    on conflict (catalog_version_id, drink_concept_id) do update
      set display_name = excluded.display_name, kind = excluded.kind;

    for v_off in select * from jsonb_array_elements(v_drink->'bar_offerings')
    loop
      select id into v_bar_id from public.bars where canonical_key = v_off->>'bar_key';
      insert into public.bar_offerings (bar_id, drink_concept_id)
      values (v_bar_id, v_drink_id)
      on conflict (bar_id, drink_concept_id) do nothing;
      select id into v_offering_id from public.bar_offerings
      where bar_id = v_bar_id and drink_concept_id = v_drink_id;

      insert into public.catalog_version_offerings (
        catalog_version_id, offering_id, price_usd, price_status, evidence_reference, availability, seasonal
      ) values (
        v_version_id,
        v_offering_id,
        nullif(v_off->>'price_usd', '')::numeric,
        (v_off->>'price_status')::public.price_verification_status,
        v_off->>'evidence_reference',
        coalesce(v_off->>'availability', 'standard'),
        coalesce((v_off->>'seasonal')::boolean, false)
      )
      on conflict (catalog_version_id, offering_id) do update
        set price_usd = excluded.price_usd,
            price_status = excluded.price_status,
            evidence_reference = excluded.evidence_reference;

      delete from public.catalog_offering_ingredients
      where catalog_version_id = v_version_id and offering_id = v_offering_id;

      if v_off ? 'ingredient_keys' then
        for v_alias in select * from jsonb_array_elements_text(v_off->'ingredient_keys')
        loop
          select id into v_ing_id from public.ingredients where canonical_key = v_alias;
          if v_ing_id is not null then
            insert into public.catalog_offering_ingredients (
              catalog_version_id, offering_id, ingredient_id, display_label
            ) values (v_version_id, v_offering_id, v_ing_id, null);
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  for v_cand in select * from jsonb_array_elements(p_payload->'cocktail_candidates')
  loop
    select dc.id, bo.id into v_drink_id, v_offering_id
    from public.drink_concepts dc
    join public.bars b on b.canonical_key = v_cand->>'designated_bar_key'
    join public.bar_offerings bo on bo.drink_concept_id = dc.id and bo.bar_id = b.id
    where dc.canonical_key = v_cand->>'drink_key';

    insert into public.cocktail_candidates (
      catalog_version_id, offering_id, drink_concept_id, tier, points, eligible
    ) values (
      v_version_id,
      v_offering_id,
      v_drink_id,
      (v_cand->>'tier')::public.cocktail_bounty_tier,
      (v_cand->>'points')::integer,
      coalesce((v_cand->>'eligible')::boolean, true)
    )
    on conflict (catalog_version_id, offering_id) do update
      set tier = excluded.tier, points = excluded.points, eligible = excluded.eligible,
          drink_concept_id = excluded.drink_concept_id;
  end loop;

  for v_cand in select * from jsonb_array_elements(p_payload->'ingredient_candidates')
  loop
    select id into v_ing_id from public.ingredients where canonical_key = v_cand->>'ingredient_key';
    insert into public.ingredient_candidates (
      catalog_version_id, ingredient_id, known_bar_count, distinct_qualifying_drinks,
      tier, points, eligible
    ) values (
      v_version_id, v_ing_id,
      (v_cand->>'known_bar_count')::integer,
      (v_cand->>'distinct_qualifying_drinks')::integer,
      (v_cand->>'tier')::public.ingredient_bounty_tier,
      (v_cand->>'points')::integer,
      coalesce((v_cand->>'eligible')::boolean, true)
    )
    on conflict (catalog_version_id, ingredient_id) do update
      set known_bar_count = excluded.known_bar_count,
          distinct_qualifying_drinks = excluded.distinct_qualifying_drinks,
          tier = excluded.tier, points = excluded.points, eligible = excluded.eligible;
  end loop;

  update public.catalog_versions
  set status = 'active', activated_at = now()
  where id = v_version_id;

  update public.active_catalog_pointer
  set catalog_version_id = v_version_id, updated_at = now()
  where id = 1;

  return jsonb_build_object(
    'catalog_version_id', v_version_id,
    'catalog_id', v_catalog_id,
    'schema_version', v_schema,
    'activated', true,
    'development_only', true
  );
end;
$$;

revoke all on function public.dev_activate_catalog_fixture(jsonb) from public;
grant execute on function public.dev_activate_catalog_fixture(jsonb) to service_role;

comment on function public.dev_activate_catalog_fixture(jsonb) is
  'Phase 2D-A/10A: activate a full_snapshot catalog (schema 1.0 or 1.1) on development-only cruises only.';
