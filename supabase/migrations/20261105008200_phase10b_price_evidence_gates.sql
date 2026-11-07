-- Phase 10B: Category A/B bounty eligibility gates (server-enforced).
-- Ordinary logging remains separate from bounty eligibility.
-- Category B requires allowlisted approval_id + authorized bar; forged evidence strings fail.

-- ---------------------------------------------------------------------------
-- Allowlist: sole Phase 10B filtered-source approval (mirrors TS allowlist).
-- ---------------------------------------------------------------------------
create or replace function public.catalog_price_evidence_approval_bars(p_approval_id text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_approval_id
    when 'star-princess-filtered-source-2026-11-07' then array[
      'omalleys-irish-pub',
      'princess-live',
      'bellinis-cocktail-bar',
      'wheelhouse-bar',
      'crooners',
      'wake-view-bar',
      'promenade-bars',
      'sea-view-bar',
      'cascade-bar',
      'lido-bar',
      'the-mix',
      'star-bar'
    ]::text[]
    else array[]::text[]
  end;
$$;

revoke all on function public.catalog_price_evidence_approval_bars(text) from public, anon, authenticated;
grant execute on function public.catalog_price_evidence_approval_bars(text) to service_role;

create or replace function public.catalog_offering_supports_bounty_eligibility(
  p_bar_key text,
  p_price_status text,
  p_price_usd numeric,
  p_approval_id text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_price_status = 'verified_within_limit'
      and p_price_usd is not null
      and p_price_usd <= 15
      then true
    when p_price_status = 'approved_filtered_within_limit'
      and p_price_usd is null
      and p_approval_id is not null
      and p_bar_key = any (public.catalog_price_evidence_approval_bars(p_approval_id))
      then true
    else false
  end;
$$;

revoke all on function public.catalog_offering_supports_bounty_eligibility(text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.catalog_offering_supports_bounty_eligibility(text, text, numeric, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Payload offering errors for forged / inconsistent Category B claims.
-- ---------------------------------------------------------------------------
create or replace function public.catalog_payload_price_evidence_errors(p_payload jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_drink jsonb;
  v_off jsonb;
  v_approval_id text;
  v_declared text[];
  v_status text;
  v_price numeric;
  v_bar text;
  v_drink_key text;
begin
  select coalesce(array_agg(a->>'approval_id'), array[]::text[])
  into v_declared
  from jsonb_array_elements(coalesce(p_payload->'source_notes'->'price_evidence_approvals', '[]'::jsonb)) a;

  for v_drink in select * from jsonb_array_elements(coalesce(p_payload->'drinks', '[]'::jsonb))
  loop
    v_drink_key := v_drink->>'key';
    for v_off in select * from jsonb_array_elements(coalesce(v_drink->'bar_offerings', '[]'::jsonb))
    loop
      v_status := v_off->>'price_status';
      v_bar := v_off->>'bar_key';
      v_price := nullif(v_off->>'price_usd', '')::numeric;
      v_approval_id := nullif(v_off->>'price_evidence_approval_id', '');

      if v_status = 'verified_within_limit' and v_price is null then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'PRICE_STATUS_INCONSISTENT',
          'message', format('Offering %s@%s claims verified_within_limit without exact price_usd.', v_drink_key, v_bar)
        ));
      end if;

      if v_status = 'approved_filtered_within_limit' then
        if v_price is not null then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_FILTERED_INVENTS_PRICE',
            'message', format('Offering %s@%s must keep price_usd null for Category B.', v_drink_key, v_bar)
          ));
        end if;
        if v_approval_id is null
           or cardinality(public.catalog_price_evidence_approval_bars(v_approval_id)) = 0 then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_FILTERED_UNKNOWN_APPROVAL',
            'message', format('Offering %s@%s has unknown/missing price_evidence_approval_id.', v_drink_key, v_bar)
          ));
        elsif not (v_bar = any (public.catalog_price_evidence_approval_bars(v_approval_id))) then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_FILTERED_BAR_NOT_AUTHORIZED',
            'message', format('Offering %s@%s bar not authorized under approval %s.', v_drink_key, v_bar, v_approval_id)
          ));
        elsif not (v_approval_id = any (v_declared)) then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_FILTERED_APPROVAL_UNDECLARED',
            'message', format('Offering %s@%s approval %s not declared in source_notes.', v_drink_key, v_bar, v_approval_id)
          ));
        end if;
      elsif v_approval_id is not null then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'PRICE_APPROVAL_STATUS_MISMATCH',
          'message', format('Offering %s@%s sets approval_id without approved_filtered_within_limit.', v_drink_key, v_bar)
        ));
      end if;
    end loop;
  end loop;

  -- Unknown declared approvals.
  if exists (
    select 1
    from unnest(v_declared) d
    where cardinality(public.catalog_price_evidence_approval_bars(d)) = 0
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'PRICE_APPROVAL_UNKNOWN',
      'message', 'source_notes.price_evidence_approvals references an unknown approval_id.'
    ));
  end if;

  return v_errors;
end;
$$;

revoke all on function public.catalog_payload_price_evidence_errors(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_payload_price_evidence_errors(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Cocktail pool: Category A or authorized Category B.
-- ---------------------------------------------------------------------------
create or replace function public.catalog_payload_cocktail_pool(p_payload jsonb)
returns table (
  drink_key text,
  bar_key text,
  tier text,
  points integer,
  eligible boolean
)
language sql
stable
set search_path = public
as $$
  select
    c->>'drink_key',
    c->>'designated_bar_key',
    c->>'tier',
    (c->>'points')::integer,
    (
      coalesce((c->>'eligible')::boolean, true)
      and o.kind = 'named_cocktail'
      and public.catalog_offering_supports_bounty_eligibility(
        o.bar_key,
        o.price_status,
        o.price_usd,
        nullif(o.approval_id, '')
      )
      and coalesce((
        select (b->>'active')::boolean
        from jsonb_array_elements(p_payload->'bars') b
        where b->>'key' = c->>'designated_bar_key'
        limit 1
      ), false)
    )
  from jsonb_array_elements(p_payload->'cocktail_candidates') c
  left join lateral (
    select
      d->>'key' as drink_key,
      o2->>'bar_key' as bar_key,
      d->>'kind' as kind,
      nullif(o2->>'price_usd', '')::numeric as price_usd,
      o2->>'price_status' as price_status,
      o2->>'price_evidence_approval_id' as approval_id
    from jsonb_array_elements(p_payload->'drinks') d
    cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o2
    where d->>'key' = c->>'drink_key'
      and o2->>'bar_key' = c->>'designated_bar_key'
    limit 1
  ) o on true
$$;

-- ---------------------------------------------------------------------------
-- Ingredient pool: corroboration via Category A or authorized Category B only.
-- ---------------------------------------------------------------------------
create or replace function public.catalog_payload_ingredient_pool(p_payload jsonb)
returns table (
  ingredient_key text,
  known_bar_count integer,
  distinct_qualifying_drinks integer,
  tier text,
  points integer,
  eligible boolean
)
language sql
stable
set search_path = public
as $$
  with
  active_bars as (
    select b->>'key' as bar_key
    from jsonb_array_elements(p_payload->'bars') b
    where coalesce((b->>'active')::boolean, true)
  ),
  within_limit_offerings as (
    select
      d->>'key' as drink_key,
      o->>'bar_key' as bar_key,
      coalesce(
        array(select jsonb_array_elements_text(coalesce(o->'ingredient_keys', '[]'::jsonb))),
        array[]::text[]
      ) as ingredient_keys
    from jsonb_array_elements(p_payload->'drinks') d
    cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o
    where d->>'kind' = 'named_cocktail'
      and o->>'bar_key' in (select bar_key from active_bars)
      and public.catalog_offering_supports_bounty_eligibility(
        o->>'bar_key',
        o->>'price_status',
        nullif(o->>'price_usd', '')::numeric,
        nullif(o->>'price_evidence_approval_id', '')
      )
  ),
  evidence as (
    select
      c->>'ingredient_key' as ingredient_key,
      (c->>'known_bar_count')::integer as known_bar_count,
      (c->>'distinct_qualifying_drinks')::integer as distinct_qualifying_drinks,
      c->>'tier' as tier,
      (c->>'points')::integer as points,
      coalesce((c->>'eligible')::boolean, true) as want_eligible,
      (
        select count(distinct w.bar_key)
        from within_limit_offerings w
        where (c->>'ingredient_key') = any (w.ingredient_keys)
      ) as corr_bars,
      (
        select count(distinct w.drink_key)
        from within_limit_offerings w
        where (c->>'ingredient_key') = any (w.ingredient_keys)
      ) as corr_drinks
    from jsonb_array_elements(p_payload->'ingredient_candidates') c
  )
  select
    e.ingredient_key,
    e.known_bar_count,
    e.distinct_qualifying_drinks,
    e.tier,
    e.points,
    (
      e.want_eligible
      and e.corr_bars >= 2
      and e.corr_drinks >= 1
      and e.known_bar_count = e.corr_bars
      and e.distinct_qualifying_drinks = e.corr_drinks
    ) as eligible
  from evidence e
$$;

revoke all on function public.catalog_payload_cocktail_pool(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_payload_cocktail_pool(jsonb) to service_role;
revoke all on function public.catalog_payload_ingredient_pool(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_payload_ingredient_pool(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Stage: reject forged Category B / inconsistent price evidence before pool size.
-- ---------------------------------------------------------------------------
create or replace function public.admin_stage_catalog_import(
  p_client_request_id uuid,
  p_payload jsonb,
  p_validation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.require_admin();
  v_hash text;
  v_existing public.catalog_import_candidates%rowtype;
  v_catalog_id text;
  v_base text;
  v_refs jsonb;
  v_price_err jsonb;
  v_cocktail_eligible integer;
  v_ingredient_eligible integer;
  v_warnings jsonb := '[]'::jsonb;
  v_class_err jsonb;
  v_bad_ing integer;
  v_bad_ck integer;
  v_candidate uuid;
  v_preview jsonb;
begin
  if p_client_request_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_ID');
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'PAYLOAD_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(hashtext('catalog_stage'), hashtext(p_client_request_id::text));

  v_hash := public.catalog_payload_sha256(p_payload);

  select * into v_existing
  from public.catalog_import_candidates
  where stage_request_id = p_client_request_id;
  if found then
    if v_existing.payload_hash is distinct from v_hash then
      return jsonb_build_object('ok', false, 'code', 'REQUEST_ID_OPERATION_MISMATCH');
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'candidate_id', v_existing.id,
      'catalog_id', v_existing.catalog_id,
      'payload_hash', v_existing.payload_hash,
      'status', v_existing.status,
      'client_request_id', p_client_request_id
    );
  end if;

  if not public.catalog_schema_version_ok(p_payload->>'schema_version') then
    return jsonb_build_object('ok', false, 'code', 'SCHEMA_VERSION');
  end if;
  if p_payload->>'mode' is distinct from 'full_snapshot' then
    return jsonb_build_object('ok', false, 'code', 'MODE');
  end if;

  v_catalog_id := p_payload->>'catalog_id';
  if v_catalog_id is null or v_catalog_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    return jsonb_build_object('ok', false, 'code', 'CATALOG_ID_INVALID');
  end if;

  v_base := nullif(p_payload->>'base_catalog_id', '');
  if v_base is not null then
    if v_base !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
      return jsonb_build_object('ok', false, 'code', 'BASE_CATALOG_INVALID');
    end if;
    if v_base = v_catalog_id then
      return jsonb_build_object('ok', false, 'code', 'BASE_CATALOG_SELF');
    end if;
    if not exists (select 1 from public.catalog_versions where catalog_id = v_base) then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'code', 'BASE_CATALOG_UNKNOWN',
        'message', 'base_catalog_id does not match any local catalog version.'
      ));
    end if;
  end if;

  if not public.catalog_payload_shape_ok(p_payload) then
    return jsonb_build_object('ok', false, 'code', 'PAYLOAD_SHAPE');
  end if;

  v_refs := public.catalog_payload_reference_errors(p_payload);
  if jsonb_array_length(v_refs) > 0 then
    return jsonb_build_object('ok', false, 'code', 'PAYLOAD_REFERENCE_ERROR', 'errors', v_refs);
  end if;

  v_class_err := public.catalog_payload_classification_errors(p_payload);
  if jsonb_array_length(v_class_err) > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'CLASSIFICATION_TAG_INVALID',
      'errors', v_class_err
    );
  end if;

  v_price_err := public.catalog_payload_price_evidence_errors(p_payload);
  if jsonb_array_length(v_price_err) > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'PRICE_EVIDENCE_INVALID',
      'errors', v_price_err
    );
  end if;

  if p_validation is null or jsonb_typeof(p_validation) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_REQUIRED');
  end if;
  if p_validation->>'readiness' is distinct from 'ready_for_scheduling' then
    return jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_NOT_READY',
      'readiness', p_validation->>'readiness'
    );
  end if;
  if coalesce((p_validation->>'error_count')::integer, 0) > 0 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERRORS');
  end if;
  if p_validation->>'payload_hash' is not null
     and p_validation->>'payload_hash' is distinct from v_hash then
    return jsonb_build_object(
      'ok', false, 'code', 'PAYLOAD_HASH_MISMATCH',
      'server_payload_hash', v_hash
    );
  end if;

  select count(*) into v_cocktail_eligible
  from public.catalog_payload_cocktail_pool(p_payload) c where c.eligible;
  select count(*) into v_ingredient_eligible
  from public.catalog_payload_ingredient_pool(p_payload) c where c.eligible;

  if v_cocktail_eligible < 72 or v_ingredient_eligible < 39 then
    return jsonb_build_object(
      'ok', false,
      'code', 'POOL_SHORTAGE',
      'cocktail_eligible', v_cocktail_eligible,
      'cocktail_required', 72,
      'ingredient_eligible', v_ingredient_eligible,
      'ingredient_required', 39
    );
  end if;

  select count(*)::integer into v_bad_ing
  from jsonb_array_elements(p_payload->'ingredient_candidates') x
  where coalesce((x->>'eligible')::boolean, true)
    and not exists (
      select 1
      from public.catalog_payload_ingredient_pool(p_payload) c
      where c.ingredient_key = x->>'ingredient_key'
        and c.eligible
    );
  if v_bad_ing > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INGREDIENT_EVIDENCE_INVALID',
      'invalid_ingredient_candidates', v_bad_ing
    );
  end if;

  select count(*)::integer into v_bad_ck
  from jsonb_array_elements(p_payload->'cocktail_candidates') x
  where coalesce((x->>'eligible')::boolean, true)
    and not exists (
      select 1
      from public.catalog_payload_cocktail_pool(p_payload) c
      where c.drink_key = x->>'drink_key'
        and c.bar_key = x->>'designated_bar_key'
        and c.eligible
    );
  if v_bad_ck > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'COCKTAIL_EVIDENCE_INVALID',
      'invalid_cocktail_candidates', v_bad_ck
    );
  end if;

  if exists (select 1 from public.catalog_versions where catalog_id = v_catalog_id) then
    return jsonb_build_object('ok', false, 'code', 'CATALOG_ID_EXISTS', 'catalog_id', v_catalog_id);
  end if;

  v_preview := p_validation || jsonb_build_object(
    'server_payload_hash', v_hash,
    'server_pool', jsonb_build_object(
      'cocktail_eligible', v_cocktail_eligible,
      'ingredient_eligible', v_ingredient_eligible
    )
  );

  update public.catalog_import_candidates
  set status = 'abandoned'
  where catalog_id = v_catalog_id and status = 'staged';

  insert into public.catalog_import_candidates (
    catalog_id, base_catalog_id, payload_hash, payload_json, preview_json,
    validation_fingerprint, status, stage_request_id, created_by
  ) values (
    v_catalog_id, v_base, v_hash, p_payload, v_preview,
    p_validation->>'fingerprint', 'staged', p_client_request_id, v_actor
  )
  returning id into v_candidate;

  perform public.write_admin_audit(
    'catalog.stage_import', v_actor, 'catalog_import_candidates', v_candidate::text,
    null,
    jsonb_build_object('catalog_id', v_catalog_id, 'payload_hash', v_hash)
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'candidate_id', v_candidate,
    'catalog_id', v_catalog_id,
    'base_catalog_id', v_base,
    'payload_hash', v_hash,
    'status', 'staged',
    'pool', jsonb_build_object(
      'cocktail_eligible', v_cocktail_eligible,
      'ingredient_eligible', v_ingredient_eligible
    ),
    'warnings', v_warnings,
    'client_request_id', p_client_request_id
  );
end;
$$;

revoke all on function public.admin_stage_catalog_import(uuid, jsonb, jsonb) from public;
grant execute on function public.admin_stage_catalog_import(uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.admin_stage_catalog_import(uuid, jsonb, jsonb) from anon;
