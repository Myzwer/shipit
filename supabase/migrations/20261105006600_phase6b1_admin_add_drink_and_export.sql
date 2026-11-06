-- Phase 6B1: Admin Add Drink overlay + Export Current Game Data.
-- Manual offerings are version-scoped overlays. Never enter cocktail_candidates.
-- Base catalog snapshots remain immutable; deactivate affects future picker only.

-- ---------------------------------------------------------------------------
-- Overlay registry
-- ---------------------------------------------------------------------------
create table public.admin_manual_offerings (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  offering_id uuid not null references public.bar_offerings (id),
  drink_concept_id uuid not null references public.drink_concepts (id),
  bar_id uuid not null references public.bars (id),
  display_name text not null,
  drink_canonical_key text not null,
  kind public.drink_kind not null default 'named_cocktail',
  active boolean not null default true,
  created_by_player_id uuid not null references public.players (id),
  created_at_utc timestamptz not null default clock_timestamp(),
  deactivated_at_utc timestamptz,
  deactivated_by_player_id uuid references public.players (id),
  deactivation_note text,
  client_request_id uuid,
  constraint admin_manual_offerings_kind_alcoholic check (
    kind in ('named_cocktail', 'beer', 'wine', 'other_alcoholic')
  ),
  constraint admin_manual_offerings_unique_offering unique (catalog_version_id, offering_id)
);

create index admin_manual_offerings_bar_idx
  on public.admin_manual_offerings (catalog_version_id, bar_id)
  where active is true;

create table public.admin_manual_offering_ingredients (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  offering_id uuid not null references public.bar_offerings (id),
  ingredient_id uuid not null references public.ingredients (id),
  display_label text,
  primary key (catalog_version_id, offering_id, ingredient_id)
);

create table public.admin_add_drink_requests (
  client_request_id uuid primary key,
  fingerprint text not null,
  actor_id uuid not null references public.players (id),
  result_json jsonb not null,
  received_at_utc timestamptz not null default clock_timestamp(),
  completed_at_utc timestamptz not null default clock_timestamp()
);

alter table public.admin_manual_offerings enable row level security;
alter table public.admin_manual_offerings force row level security;
alter table public.admin_manual_offering_ingredients enable row level security;
alter table public.admin_manual_offering_ingredients force row level security;
alter table public.admin_add_drink_requests enable row level security;
alter table public.admin_add_drink_requests force row level security;

revoke all on table public.admin_manual_offerings from anon, authenticated;
revoke all on table public.admin_manual_offering_ingredients from anon, authenticated;
revoke all on table public.admin_add_drink_requests from anon, authenticated;

grant select on table public.admin_manual_offerings to authenticated;
grant select on table public.admin_manual_offering_ingredients to authenticated;
grant select on table public.admin_add_drink_requests to authenticated;
grant select, insert, update, delete on table public.admin_manual_offerings to service_role;
grant select, insert, update, delete on table public.admin_manual_offering_ingredients to service_role;
grant select, insert, update, delete on table public.admin_add_drink_requests to service_role;

create policy admin_manual_offerings_admin_select
  on public.admin_manual_offerings for select to authenticated
  using (public.is_admin());

create policy admin_manual_offering_ingredients_admin_select
  on public.admin_manual_offering_ingredients for select to authenticated
  using (public.is_admin());

create policy admin_add_drink_requests_admin_select
  on public.admin_add_drink_requests for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.admin_normalize_canonical_key(p_raw text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := lower(trim(coalesce(p_raw, '')));
begin
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := regexp_replace(v, '-+', '-', 'g');
  v := regexp_replace(v, '^-+|-+$', '', 'g');
  if v = '' or v !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    return null;
  end if;
  return v;
end;
$$;

revoke all on function public.admin_normalize_canonical_key(text) from public;
grant execute on function public.admin_normalize_canonical_key(text) to authenticated, service_role;

create or replace function public.admin_active_catalog_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select catalog_version_id from public.active_catalog_pointer where id = 1
$$;

revoke all on function public.admin_active_catalog_id() from public;
grant execute on function public.admin_active_catalog_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Picker: exclude deactivated manual offerings
-- ---------------------------------------------------------------------------
create or replace function public.list_drinkit_bar_drinks(p_bar_canonical_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_catalog uuid;
  v_bar_id uuid;
  v_key text := lower(trim(coalesce(p_bar_canonical_key, '')));
  v_out jsonb;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;
  if v_key = '' then
    return '[]'::jsonb;
  end if;

  select catalog_version_id into v_catalog from public.active_catalog_pointer where id = 1;
  if v_catalog is null then
    return '[]'::jsonb;
  end if;

  select b.id into v_bar_id
  from public.bars b
  join public.catalog_version_bars cvb
    on cvb.bar_id = b.id and cvb.catalog_version_id = v_catalog and cvb.active is true
  where b.canonical_key = v_key
  limit 1;
  if v_bar_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'offering_id', bo.id,
      'drink_concept_id', dc.id,
      'canonical_key', dc.canonical_key,
      'display_name', cvd.display_name,
      'kind', cvd.kind,
      'admin_added', exists (
        select 1 from public.admin_manual_offerings amo
        where amo.catalog_version_id = v_catalog
          and amo.offering_id = bo.id
          and amo.active is true
      )
    )
    order by lower(cvd.display_name), dc.canonical_key
  ), '[]'::jsonb)
  into v_out
  from public.bar_offerings bo
  join public.catalog_version_offerings cvo
    on cvo.offering_id = bo.id and cvo.catalog_version_id = v_catalog
  join public.drink_concepts dc on dc.id = bo.drink_concept_id
  join public.catalog_version_drink_concepts cvd
    on cvd.catalog_version_id = v_catalog and cvd.drink_concept_id = dc.id
  where bo.bar_id = v_bar_id
    and cvd.kind in ('named_cocktail', 'beer', 'wine', 'other_alcoholic')
    and not exists (
      select 1 from public.admin_manual_offerings amo
      where amo.catalog_version_id = v_catalog
        and amo.offering_id = bo.id
        and amo.active is false
    );

  return v_out;
end;
$$;

revoke all on function public.list_drinkit_bar_drinks(text) from public;
grant execute on function public.list_drinkit_bar_drinks(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Add Drink (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.admin_preview_add_drink(
  p_display_name text,
  p_bar_canonical_keys text[],
  p_ingredient_canonical_keys text[],
  p_kind text default 'named_cocktail'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.require_admin();
  v_catalog uuid := public.admin_active_catalog_id();
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_drink_key text;
  v_kind public.drink_kind;
  v_bars jsonb := '[]'::jsonb;
  v_ings jsonb := '[]'::jsonb;
  v_key text;
  v_bar public.bars%rowtype;
  v_ing public.ingredients%rowtype;
  v_ing_name text;
begin
  if v_catalog is null then
    return jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_CATALOG');
  end if;
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DISPLAY_NAME');
  end if;
  v_drink_key := public.admin_normalize_canonical_key(v_name);
  if v_drink_key is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DISPLAY_NAME');
  end if;
  begin
    v_kind := coalesce(nullif(trim(coalesce(p_kind, '')), ''), 'named_cocktail')::public.drink_kind;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'INVALID_KIND');
  end;
  if v_kind not in ('named_cocktail', 'beer', 'wine', 'other_alcoholic') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_KIND');
  end if;
  if p_bar_canonical_keys is null or coalesce(cardinality(p_bar_canonical_keys), 0) = 0 then
    return jsonb_build_object('ok', false, 'code', 'BARS_REQUIRED');
  end if;

  foreach v_key in array p_bar_canonical_keys
  loop
    select b.* into v_bar
    from public.bars b
    join public.catalog_version_bars cvb
      on cvb.bar_id = b.id and cvb.catalog_version_id = v_catalog and cvb.active is true
    where b.canonical_key = lower(trim(v_key));
    if not found then
      return jsonb_build_object('ok', false, 'code', 'BAR_NOT_FOUND', 'bar_key', lower(trim(v_key)));
    end if;
    v_bars := v_bars || jsonb_build_array(jsonb_build_object(
      'bar_id', v_bar.id,
      'canonical_key', v_bar.canonical_key,
      'name', (select name from public.catalog_version_bars where catalog_version_id = v_catalog and bar_id = v_bar.id)
    ));
  end loop;

  if p_ingredient_canonical_keys is not null then
    foreach v_key in array p_ingredient_canonical_keys
    loop
      select i.* into v_ing
      from public.ingredients i
      join public.catalog_version_ingredients cvi
        on cvi.ingredient_id = i.id and cvi.catalog_version_id = v_catalog
      where i.canonical_key = public.admin_normalize_canonical_key(v_key)
         or i.canonical_key = lower(trim(v_key));
      if not found then
        -- Allow new ingredient keys that normalize cleanly (created on save).
        v_key := public.admin_normalize_canonical_key(v_key);
        if v_key is null then
          return jsonb_build_object('ok', false, 'code', 'INVALID_INGREDIENT', 'ingredient_key', v_key);
        end if;
        v_ings := v_ings || jsonb_build_array(jsonb_build_object(
          'ingredient_id', null,
          'canonical_key', v_key,
          'display_name', initcap(replace(v_key, '-', ' ')),
          'will_create', true
        ));
      else
        select display_name into v_ing_name
        from public.catalog_version_ingredients
        where catalog_version_id = v_catalog and ingredient_id = v_ing.id;
        v_ings := v_ings || jsonb_build_array(jsonb_build_object(
          'ingredient_id', v_ing.id,
          'canonical_key', v_ing.canonical_key,
          'display_name', v_ing_name,
          'will_create', false
        ));
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'catalog_version_id', v_catalog,
    'display_name', v_name,
    'drink_canonical_key', v_drink_key,
    'kind', v_kind,
    'bars', v_bars,
    'ingredients', v_ings,
    'enters_cocktail_rotation', false,
    'actor_id', v_actor
  );
end;
$$;

revoke all on function public.admin_preview_add_drink(text, text[], text[], text) from public;
grant execute on function public.admin_preview_add_drink(text, text[], text[], text) to authenticated;

create or replace function public.admin_add_drink(
  p_client_request_id uuid,
  p_display_name text,
  p_bar_canonical_keys text[],
  p_ingredient_canonical_keys text[],
  p_kind text default 'named_cocktail'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.require_admin();
  v_catalog uuid := public.admin_active_catalog_id();
  v_preview jsonb;
  v_fp text;
  v_existing public.admin_add_drink_requests%rowtype;
  v_name text;
  v_drink_key text;
  v_kind public.drink_kind;
  v_concept_id uuid;
  v_bar jsonb;
  v_bar_id uuid;
  v_offering_id uuid;
  v_ing jsonb;
  v_ing_id uuid;
  v_ing_key text;
  v_created_offerings jsonb := '[]'::jsonb;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_client_request_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_ID');
  end if;

  v_preview := public.admin_preview_add_drink(
    p_display_name, p_bar_canonical_keys, p_ingredient_canonical_keys, p_kind
  );
  if coalesce((v_preview->>'ok')::boolean, false) is not true then
    return v_preview;
  end if;

  v_name := v_preview->>'display_name';
  v_drink_key := v_preview->>'drink_canonical_key';
  v_kind := (v_preview->>'kind')::public.drink_kind;
  v_fp := md5(
    v_catalog::text || '|' || v_drink_key || '|' || v_kind::text || '|' ||
    coalesce((select string_agg(x, ',' order by x) from jsonb_array_elements_text(
      coalesce((select jsonb_agg(b->>'canonical_key') from jsonb_array_elements(v_preview->'bars') b), '[]'::jsonb)
    ) t(x)), '') || '|' ||
    coalesce((select string_agg(x, ',' order by x) from jsonb_array_elements_text(
      coalesce((select jsonb_agg(i->>'canonical_key') from jsonb_array_elements(v_preview->'ingredients') i), '[]'::jsonb)
    ) t(x)), '')
  );

  perform pg_advisory_xact_lock(hashtext('admin_add_drink'), hashtext(p_client_request_id::text));
  perform pg_advisory_xact_lock(hashtext('admin_add_drink_catalog'), hashtext(v_catalog::text));

  select * into v_existing from public.admin_add_drink_requests where client_request_id = p_client_request_id;
  if found then
    if v_existing.fingerprint is distinct from v_fp then
      return jsonb_build_object('ok', false, 'code', 'REQUEST_ID_OPERATION_MISMATCH');
    end if;
    return coalesce(v_existing.result_json, '{}'::jsonb) || jsonb_build_object(
      'idempotent_replay', true,
      'client_request_id', p_client_request_id
    );
  end if;

  -- Ensure drink concept
  select id into v_concept_id from public.drink_concepts where canonical_key = v_drink_key;
  if v_concept_id is null then
    insert into public.drink_concepts (canonical_key) values (v_drink_key) returning id into v_concept_id;
  end if;

  insert into public.catalog_version_drink_concepts (catalog_version_id, drink_concept_id, display_name, kind)
  values (v_catalog, v_concept_id, v_name, v_kind)
  on conflict (catalog_version_id, drink_concept_id) do update
    set display_name = excluded.display_name,
        kind = excluded.kind;

  for v_bar in select * from jsonb_array_elements(v_preview->'bars')
  loop
    v_bar_id := (v_bar->>'bar_id')::uuid;

    select id into v_offering_id
    from public.bar_offerings
    where bar_id = v_bar_id and drink_concept_id = v_concept_id;

    if v_offering_id is null then
      insert into public.bar_offerings (bar_id, drink_concept_id)
      values (v_bar_id, v_concept_id)
      returning id into v_offering_id;
    end if;

    insert into public.catalog_version_offerings (
      catalog_version_id, offering_id, price_usd, price_status, evidence_reference, availability, seasonal
    ) values (
      v_catalog, v_offering_id, null, 'unverified', 'admin_add_drink', 'standard', false
    )
    on conflict (catalog_version_id, offering_id) do update
      set evidence_reference = coalesce(catalog_version_offerings.evidence_reference, 'admin_add_drink');

    insert into public.admin_manual_offerings (
      catalog_version_id, offering_id, drink_concept_id, bar_id, display_name,
      drink_canonical_key, kind, active, created_by_player_id, client_request_id
    ) values (
      v_catalog, v_offering_id, v_concept_id, v_bar_id, v_name,
      v_drink_key, v_kind, true, v_actor, p_client_request_id
    )
    on conflict (catalog_version_id, offering_id) do update
      set active = true,
          deactivated_at_utc = null,
          deactivated_by_player_id = null,
          deactivation_note = null,
          display_name = excluded.display_name,
          kind = excluded.kind;

    -- Ingredients for this offering
    for v_ing in select * from jsonb_array_elements(coalesce(v_preview->'ingredients', '[]'::jsonb))
    loop
      v_ing_key := v_ing->>'canonical_key';
      if coalesce((v_ing->>'will_create')::boolean, false) then
        select id into v_ing_id from public.ingredients where canonical_key = v_ing_key;
        if v_ing_id is null then
          insert into public.ingredients (canonical_key) values (v_ing_key) returning id into v_ing_id;
        end if;
        insert into public.catalog_version_ingredients (
          catalog_version_id, ingredient_id, display_name, family
        ) values (
          v_catalog, v_ing_id, coalesce(v_ing->>'display_name', initcap(replace(v_ing_key, '-', ' '))), null
        )
        on conflict (catalog_version_id, ingredient_id) do nothing;
      else
        v_ing_id := (v_ing->>'ingredient_id')::uuid;
      end if;

      insert into public.catalog_offering_ingredients (
        catalog_version_id, offering_id, ingredient_id, display_label
      ) values (
        v_catalog, v_offering_id, v_ing_id, null
      )
      on conflict (catalog_version_id, offering_id, ingredient_id) do nothing;

      insert into public.admin_manual_offering_ingredients (
        catalog_version_id, offering_id, ingredient_id, display_label
      ) values (
        v_catalog, v_offering_id, v_ing_id, null
      )
      on conflict (catalog_version_id, offering_id, ingredient_id) do nothing;
    end loop;

    v_created_offerings := v_created_offerings || jsonb_build_array(jsonb_build_object(
      'offering_id', v_offering_id,
      'bar_id', v_bar_id,
      'bar_canonical_key', v_bar->>'canonical_key',
      'drink_concept_id', v_concept_id
    ));
  end loop;

  -- Hard guarantee: never create cocktail_candidates for manual adds.
  -- (No insert performed.)

  v_result := jsonb_build_object(
    'ok', true,
    'client_request_id', p_client_request_id,
    'catalog_version_id', v_catalog,
    'display_name', v_name,
    'drink_canonical_key', v_drink_key,
    'drink_concept_id', v_concept_id,
    'kind', v_kind,
    'offerings', v_created_offerings,
    'enters_cocktail_rotation', false
  );

  perform public.write_admin_audit(
    'catalog.admin_add_drink',
    v_actor,
    'admin_manual_offerings',
    v_drink_key,
    null,
    v_result
  );

  insert into public.admin_add_drink_requests (
    client_request_id, fingerprint, actor_id, result_json
  ) values (
    p_client_request_id, v_fp, v_actor, v_result
  );

  return v_result;
end;
$$;

revoke all on function public.admin_add_drink(uuid, text, text[], text[], text) from public;
grant execute on function public.admin_add_drink(uuid, text, text[], text[], text) to authenticated;

create or replace function public.admin_deactivate_manual_offering(
  p_offering_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.require_admin();
  v_catalog uuid := public.admin_active_catalog_id();
  v_row public.admin_manual_offerings%rowtype;
begin
  if p_offering_id is null or v_catalog is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT');
  end if;

  select * into v_row
  from public.admin_manual_offerings
  where catalog_version_id = v_catalog and offering_id = p_offering_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_MANUAL_OFFERING');
  end if;

  update public.admin_manual_offerings
  set active = false,
      deactivated_at_utc = clock_timestamp(),
      deactivated_by_player_id = v_actor,
      deactivation_note = nullif(trim(coalesce(p_note, '')), '')
  where id = v_row.id
  returning * into v_row;

  -- Remove from active version picker surface only; keep bar_offerings identity.
  delete from public.catalog_version_offerings
  where catalog_version_id = v_catalog and offering_id = p_offering_id;

  perform public.write_admin_audit(
    'catalog.admin_deactivate_manual_offering',
    v_actor,
    'admin_manual_offerings',
    p_offering_id::text,
    jsonb_build_object('active', true, 'display_name', v_row.display_name),
    jsonb_build_object('active', false, 'note', v_row.deactivation_note)
  );

  return jsonb_build_object(
    'ok', true,
    'offering_id', p_offering_id,
    'active', false,
    'display_name', v_row.display_name
  );
end;
$$;

revoke all on function public.admin_deactivate_manual_offering(uuid, text) from public;
grant execute on function public.admin_deactivate_manual_offering(uuid, text) to authenticated;

create or replace function public.admin_list_manual_offerings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_catalog uuid;
begin
  perform public.require_admin();
  v_catalog := public.admin_active_catalog_id();
  if v_catalog is null then
    return '[]'::jsonb;
  end if;
  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'offering_id', amo.offering_id,
          'display_name', amo.display_name,
          'drink_canonical_key', amo.drink_canonical_key,
          'bar_canonical_key', b.canonical_key,
          'bar_name', cvb.name,
          'kind', amo.kind,
          'active', amo.active,
          'created_at_utc', amo.created_at_utc,
          'ingredients', coalesce((
            select jsonb_agg(jsonb_build_object(
              'canonical_key', i.canonical_key,
              'display_name', cvi.display_name
            ) order by lower(cvi.display_name))
            from public.admin_manual_offering_ingredients amoi
            join public.ingredients i on i.id = amoi.ingredient_id
            left join public.catalog_version_ingredients cvi
              on cvi.catalog_version_id = amo.catalog_version_id
             and cvi.ingredient_id = i.id
            where amoi.catalog_version_id = amo.catalog_version_id
              and amoi.offering_id = amo.offering_id
          ), '[]'::jsonb)
        )
        order by lower(amo.display_name), b.canonical_key
      )
      from public.admin_manual_offerings amo
      join public.bars b on b.id = amo.bar_id
      left join public.catalog_version_bars cvb
        on cvb.catalog_version_id = amo.catalog_version_id and cvb.bar_id = amo.bar_id
      where amo.catalog_version_id = v_catalog
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.admin_list_manual_offerings() from public;
grant execute on function public.admin_list_manual_offerings() to authenticated;

create or replace function public.admin_find_add_drink_request_by_id(p_client_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.admin_add_drink_requests%rowtype;
begin
  perform public.require_admin();
  if p_client_request_id is null then return null; end if;
  select * into v_row from public.admin_add_drink_requests where client_request_id = p_client_request_id;
  if not found then return null; end if;
  return coalesce(v_row.result_json, '{}'::jsonb) || jsonb_build_object(
    'client_request_id', v_row.client_request_id,
    'received_at_utc', v_row.received_at_utc
  );
end;
$$;

revoke all on function public.admin_find_add_drink_request_by_id(uuid) from public;
grant execute on function public.admin_find_add_drink_request_by_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Export Current Game Data (Admin-only; no roster/secrets/photos)
-- ---------------------------------------------------------------------------
create or replace function public.admin_export_current_game_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_catalog uuid;
  v_cv public.catalog_versions%rowtype;
  v_cruise public.cruise_config%rowtype;
begin
  perform public.require_admin();
  v_catalog := public.admin_active_catalog_id();
  if v_catalog is null then
    return jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_CATALOG');
  end if;
  select * into v_cv from public.catalog_versions where id = v_catalog;
  select * into v_cruise from public.cruise_config where is_active limit 1;

  return jsonb_build_object(
    'ok', true,
    'export_schema_version', '1.0',
    'exported_at_utc', clock_timestamp(),
    'catalog', jsonb_build_object(
      'catalog_version_id', v_cv.id,
      'catalog_id', v_cv.catalog_id,
      'schema_version', v_cv.schema_version,
      'base_catalog_id', v_cv.base_catalog_id,
      'mode', v_cv.mode,
      'payload_hash', v_cv.payload_hash,
      'status', v_cv.status,
      'source_notes', v_cv.source_notes,
      'manifest', v_cv.manifest_json
    ),
    'bars', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bar_id', b.id,
        'canonical_key', b.canonical_key,
        'name', cvb.name,
        'deck', cvb.deck,
        'active', cvb.active
      ) order by lower(cvb.name))
      from public.catalog_version_bars cvb
      join public.bars b on b.id = cvb.bar_id
      where cvb.catalog_version_id = v_catalog
    ), '[]'::jsonb),
    'offerings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'offering_id', bo.id,
        'bar_canonical_key', b.canonical_key,
        'drink_canonical_key', dc.canonical_key,
        'display_name', cvd.display_name,
        'kind', cvd.kind,
        'price_usd', cvo.price_usd,
        'price_status', cvo.price_status,
        'availability', cvo.availability,
        'evidence_reference', cvo.evidence_reference,
        'admin_added', exists (
          select 1 from public.admin_manual_offerings amo
          where amo.catalog_version_id = v_catalog and amo.offering_id = bo.id and amo.active is true
        ),
        'ingredients', coalesce((
          select jsonb_agg(jsonb_build_object(
            'canonical_key', i.canonical_key,
            'display_name', cvi.display_name,
            'display_label', coi.display_label
          ) order by lower(cvi.display_name))
          from public.catalog_offering_ingredients coi
          join public.ingredients i on i.id = coi.ingredient_id
          join public.catalog_version_ingredients cvi
            on cvi.catalog_version_id = v_catalog and cvi.ingredient_id = i.id
          where coi.catalog_version_id = v_catalog and coi.offering_id = bo.id
        ), '[]'::jsonb)
      ) order by b.canonical_key, lower(cvd.display_name))
      from public.catalog_version_offerings cvo
      join public.bar_offerings bo on bo.id = cvo.offering_id
      join public.bars b on b.id = bo.bar_id
      join public.drink_concepts dc on dc.id = bo.drink_concept_id
      join public.catalog_version_drink_concepts cvd
        on cvd.catalog_version_id = v_catalog and cvd.drink_concept_id = dc.id
      where cvo.catalog_version_id = v_catalog
    ), '[]'::jsonb),
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ingredient_id', i.id,
        'canonical_key', i.canonical_key,
        'display_name', cvi.display_name,
        'family', cvi.family
      ) order by lower(cvi.display_name))
      from public.catalog_version_ingredients cvi
      join public.ingredients i on i.id = cvi.ingredient_id
      where cvi.catalog_version_id = v_catalog
    ), '[]'::jsonb),
    'cocktail_candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'offering_id', cc.offering_id,
        'drink_canonical_key', dc.canonical_key,
        'bar_canonical_key', b.canonical_key,
        'tier', cc.tier,
        'points', cc.points,
        'eligible', cc.eligible
      ) order by cc.tier, dc.canonical_key)
      from public.cocktail_candidates cc
      join public.bar_offerings bo on bo.id = cc.offering_id
      join public.drink_concepts dc on dc.id = bo.drink_concept_id
      join public.bars b on b.id = bo.bar_id
      where cc.catalog_version_id = v_catalog
    ), '[]'::jsonb),
    'ingredient_candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ingredient_canonical_key', i.canonical_key,
        'known_bar_count', ic.known_bar_count,
        'distinct_qualifying_drinks', ic.distinct_qualifying_drinks,
        'tier', ic.tier,
        'points', ic.points,
        'eligible', ic.eligible
      ) order by ic.tier, i.canonical_key)
      from public.ingredient_candidates ic
      join public.ingredients i on i.id = ic.ingredient_id
      where ic.catalog_version_id = v_catalog
    ), '[]'::jsonb),
    'admin_manual_offerings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'offering_id', amo.offering_id,
        'display_name', amo.display_name,
        'drink_canonical_key', amo.drink_canonical_key,
        'bar_canonical_key', b.canonical_key,
        'kind', amo.kind,
        'active', amo.active,
        'created_at_utc', amo.created_at_utc,
        'deactivated_at_utc', amo.deactivated_at_utc
      ) order by lower(amo.display_name))
      from public.admin_manual_offerings amo
      join public.bars b on b.id = amo.bar_id
      where amo.catalog_version_id = v_catalog
    ), '[]'::jsonb),
    'ingredient_correction_overlays', coalesce((
      select jsonb_agg(jsonb_build_object(
        'correction_id', ic.id,
        'offering_id', ic.offering_id,
        'ingredient_canonical_key', i.canonical_key,
        'active', ic.active,
        'inactive_cause', ic.inactive_cause,
        'confirmed_at_utc', ic.created_at_utc
      ) order by ic.created_at_utc)
      from public.ingredient_corrections ic
      join public.ingredients i on i.id = ic.ingredient_id
    ), '[]'::jsonb),
    'exposure', jsonb_build_object(
      'exposed_cocktail_keys', coalesce((
        select jsonb_agg(distinct boe.canonical_key order by boe.canonical_key)
        from public.bounty_objective_exposures boe
        where v_cruise.id is not null
          and boe.cruise_config_id = v_cruise.id
          and boe.category = 'cocktail'
      ), '[]'::jsonb),
      'exposed_ingredient_keys', coalesce((
        select jsonb_agg(distinct boe.canonical_key order by boe.canonical_key)
        from public.bounty_objective_exposures boe
        where v_cruise.id is not null
          and boe.cruise_config_id = v_cruise.id
          and boe.category = 'ingredient'
      ), '[]'::jsonb)
    ),
    'schedule', jsonb_build_object(
      'cruise_config_id', v_cruise.id,
      'day1_ship_date', v_cruise.day1_ship_date,
      'slots', coalesce((
        select jsonb_agg(jsonb_build_object(
          'slot_id', bs.id,
          'cruise_day', bs.cruise_day,
          'category', bs.category,
          'state', bs.state,
          'slot_index', bs.slot_index,
          'active_offer', (
            select jsonb_build_object(
              'offer_id', bso.id,
              'canonical_key', bso.canonical_key,
              'exposed_at_utc', bso.exposed_at_utc,
              'is_active', bso.is_active
            )
            from public.bounty_slot_offers bso
            where bso.slot_id = bs.id and bso.is_active is true
            limit 1
          )
        ) order by bs.cruise_day, bs.category, bs.slot_index)
        from public.bounty_slots bs
        where v_cruise.id is not null and bs.cruise_config_id = v_cruise.id
      ), '[]'::jsonb),
      -- bounty_category is cocktail|ingredient only; Featured Bar / Daily use day tables.
      'remaining_scheduled_counts', coalesce((
        select jsonb_build_object(
          'cocktail', count(*) filter (where category = 'cocktail' and state = 'scheduled'),
          'ingredient', count(*) filter (where category = 'ingredient' and state = 'scheduled')
        )
        from public.bounty_slots
        where v_cruise.id is not null and cruise_config_id = v_cruise.id
      ), '{}'::jsonb),
      'featured_bar_days', coalesce((
        select jsonb_agg(jsonb_build_object(
          'day_number', bb.day_number,
          'bar_canonical_key', bb.bar_canonical_key,
          'bar_display_name', bb.bar_display_name
        ) order by bb.day_number)
        from public.bar_bounties bb
        where v_cruise.id is not null and bb.cruise_config_id = v_cruise.id
      ), '[]'::jsonb),
      'daily_challenge_days', coalesce((
        select jsonb_agg(jsonb_build_object(
          'day_number', dc.day_number,
          'title', dc.title,
          'points', dc.points,
          'is_all_hands', dc.is_all_hands
        ) order by dc.day_number)
        from public.daily_challenges dc
        where v_cruise.id is not null and dc.cruise_config_id = v_cruise.id
      ), '[]'::jsonb)
    ),
    'compatibility', jsonb_build_object(
      'catalog_import_schema', '1.0',
      'export_schema_version', '1.0',
      'notes', jsonb_build_array(
        'Admin-added offerings are listed under admin_manual_offerings and flagged on offerings[].admin_added.',
        'Player ingredient corrections are overlays; admin-suppressed rows keep inactive_cause=admin.',
        'Exposed objective keys must remain consumed across future catalog versions.',
        'This export excludes roster, Auth identifiers, credentials, photos, and personal Gallery content.'
      )
    )
  );
end;
$$;

revoke all on function public.admin_export_current_game_data() from public;
grant execute on function public.admin_export_current_game_data() to authenticated;

comment on function public.admin_export_current_game_data() is
  'Phase 6B1: organizer export for external menu reconstruction. No roster/secrets/photos.';
