-- Phase 6B2 Gate 1: Manual Add Drink must not mutate base catalog drinks/offerings
-- or turn an existing base offering into a removable manual overlay.

alter table public.admin_manual_offerings
  add column if not exists introduced_version_offering boolean not null default true;

comment on column public.admin_manual_offerings.introduced_version_offering is
  'True only when this overlay created the catalog_version_offerings row. Deactivate may delete that version association only when true.';

-- Existing rows: treat as introduced only when evidence is the admin add marker and
-- the offering is not a cocktail candidate (base pool drink).
update public.admin_manual_offerings amo
set introduced_version_offering = (
  exists (
    select 1
    from public.catalog_version_offerings cvo
    where cvo.catalog_version_id = amo.catalog_version_id
      and cvo.offering_id = amo.offering_id
      and cvo.evidence_reference = 'admin_add_drink'
  )
  and not exists (
    select 1
    from public.cocktail_candidates cc
    where cc.catalog_version_id = amo.catalog_version_id
      and cc.offering_id = amo.offering_id
  )
);

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
  v_cvd public.catalog_version_drink_concepts%rowtype;
  v_has_version_offering boolean;
  v_manual public.admin_manual_offerings%rowtype;
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

  -- Ensure stable drink concept identity (global). Never overwrite existing concept key.
  select id into v_concept_id from public.drink_concepts where canonical_key = v_drink_key;
  if v_concept_id is null then
    insert into public.drink_concepts (canonical_key) values (v_drink_key) returning id into v_concept_id;
  end if;

  -- Version drink row: insert only. Never overwrite base display_name/kind.
  select * into v_cvd
  from public.catalog_version_drink_concepts
  where catalog_version_id = v_catalog and drink_concept_id = v_concept_id;

  if found then
    if v_cvd.kind is distinct from v_kind then
      return jsonb_build_object(
        'ok', false,
        'code', 'DRINK_KIND_CONFLICT',
        'message', 'Existing catalog drink kind does not match the requested kind.',
        'drink_canonical_key', v_drink_key,
        'existing_kind', v_cvd.kind,
        'requested_kind', v_kind
      );
    end if;
    -- Keep authoritative display_name/kind untouched.
  else
    insert into public.catalog_version_drink_concepts (
      catalog_version_id, drink_concept_id, display_name, kind
    ) values (
      v_catalog, v_concept_id, v_name, v_kind
    );
  end if;

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

    select exists (
      select 1 from public.catalog_version_offerings
      where catalog_version_id = v_catalog and offering_id = v_offering_id
    ) into v_has_version_offering;

    select * into v_manual
    from public.admin_manual_offerings
    where catalog_version_id = v_catalog and offering_id = v_offering_id;

    if found then
      if v_manual.active is not true then
        return jsonb_build_object(
          'ok', false,
          'code', 'MANUAL_OFFERING_INACTIVE',
          'message', 'A deactivated manual offering exists for this bar and drink. It will not be silently reactivated.',
          'offering_id', v_offering_id,
          'bar_canonical_key', v_bar->>'canonical_key'
        );
      end if;
      -- Active manual already present — include in result without mutation.
      v_created_offerings := v_created_offerings || jsonb_build_array(jsonb_build_object(
        'offering_id', v_offering_id,
        'bar_id', v_bar_id,
        'bar_canonical_key', v_bar->>'canonical_key',
        'drink_concept_id', v_concept_id,
        'already_manual', true,
        'introduced_version_offering', v_manual.introduced_version_offering
      ));
      continue;
    end if;

    if v_has_version_offering then
      -- Base (or otherwise already published) offering — do not register as removable manual.
      return jsonb_build_object(
        'ok', false,
        'code', 'BASE_OFFERING_EXISTS',
        'message', 'That drink is already offered at this bar in the active catalog. Add Drink will not turn it into a removable manual overlay.',
        'offering_id', v_offering_id,
        'bar_canonical_key', v_bar->>'canonical_key',
        'drink_canonical_key', v_drink_key
      );
    end if;

    -- New bar-specific offering introduced by Admin.
    insert into public.catalog_version_offerings (
      catalog_version_id, offering_id, price_usd, price_status, evidence_reference, availability, seasonal
    ) values (
      v_catalog, v_offering_id, null, 'unverified', 'admin_add_drink', 'standard', false
    );

    insert into public.admin_manual_offerings (
      catalog_version_id, offering_id, drink_concept_id, bar_id, display_name,
      drink_canonical_key, kind, active, created_by_player_id, client_request_id,
      introduced_version_offering
    ) values (
      v_catalog, v_offering_id, v_concept_id, v_bar_id, v_name,
      v_drink_key, v_kind, true, v_actor, p_client_request_id,
      true
    );

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
      'drink_concept_id', v_concept_id,
      'introduced_version_offering', true
    ));
  end loop;

  if jsonb_array_length(v_created_offerings) = 0 then
    return jsonb_build_object('ok', false, 'code', 'NO_OFFERINGS_CREATED');
  end if;

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
  v_removed_version_row boolean := false;
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

  if v_row.active is not true then
    return jsonb_build_object(
      'ok', true,
      'offering_id', p_offering_id,
      'active', false,
      'idempotent_replay', true,
      'display_name', v_row.display_name
    );
  end if;

  update public.admin_manual_offerings
  set active = false,
      deactivated_at_utc = clock_timestamp(),
      deactivated_by_player_id = v_actor,
      deactivation_note = nullif(trim(coalesce(p_note, '')), '')
  where id = v_row.id
  returning * into v_row;

  -- Only remove the version association when this overlay introduced it.
  if coalesce(v_row.introduced_version_offering, false) is true then
    delete from public.catalog_version_offerings
    where catalog_version_id = v_catalog and offering_id = p_offering_id;
    v_removed_version_row := true;
  end if;

  perform public.write_admin_audit(
    'catalog.admin_deactivate_manual_offering',
    v_actor,
    'admin_manual_offerings',
    p_offering_id::text,
    jsonb_build_object(
      'active', true,
      'display_name', v_row.display_name,
      'introduced_version_offering', v_row.introduced_version_offering
    ),
    jsonb_build_object(
      'active', false,
      'note', v_row.deactivation_note,
      'removed_version_offering', v_removed_version_row
    )
  );

  return jsonb_build_object(
    'ok', true,
    'offering_id', p_offering_id,
    'active', false,
    'display_name', v_row.display_name,
    'removed_version_offering', v_removed_version_row,
    'introduced_version_offering', v_row.introduced_version_offering
  );
end;
$$;

revoke all on function public.admin_deactivate_manual_offering(uuid, text) from public;
grant execute on function public.admin_deactivate_manual_offering(uuid, text) to authenticated;

comment on function public.admin_add_drink(uuid, text, text[], text[], text) is
  'Phase 6B2: Add Drink never mutates base drink name/kind, never registers base offerings as removable manuals, never silently reactivates deactivated manuals.';

comment on function public.admin_deactivate_manual_offering(uuid, text) is
  'Phase 6B2: Deactivate only removes catalog_version_offerings when introduced_version_offering is true.';
