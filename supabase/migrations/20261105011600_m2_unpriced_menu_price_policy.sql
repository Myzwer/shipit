-- M2-P1: Category U — organizer-authorized complete price-free physical bar menus.
-- Additive only. Preserves Category A/B/C/D. Never invents price_usd = 15.
-- Per-bar authorization via source_notes.unpriced_menu_authorizations.
-- Cropped/incomplete price evidence and isolated missing prices on priced menus
-- do not qualify. Good Spirits may use Category U when validly authorized.
-- Explicit over-$15 always remains ineligible.
-- Depends on enum value from 20261105011500_m2_unpriced_menu_price_status_enum.sql.

-- ---------------------------------------------------------------------------
-- Valid Category U bars from payload source_notes (completeness + evidence).
-- ---------------------------------------------------------------------------
create or replace function public.catalog_payload_unpriced_menu_authorized_bars(p_payload jsonb)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(
    array(
      select distinct a->>'bar_key'
      from jsonb_array_elements(
        coalesce(p_payload->'source_notes'->'unpriced_menu_authorizations', '[]'::jsonb)
      ) a
      where a->>'bar_key' is not null
        and a->>'bar_key' <> ''
        and a->>'completeness' = 'complete_menu_no_printed_prices'
        and nullif(btrim(coalesce(a->>'evidence_reference', '')), '') is not null
    ),
    array[]::text[]
  );
$$;

revoke all on function public.catalog_payload_unpriced_menu_authorized_bars(jsonb)
  from public, anon, authenticated;
grant execute on function public.catalog_payload_unpriced_menu_authorized_bars(jsonb)
  to service_role;

comment on function public.catalog_payload_unpriced_menu_authorized_bars(jsonb) is
  'Bars with valid Category U complete price-free menu authorization in this catalog payload.';

-- ---------------------------------------------------------------------------
-- Payload price-evidence errors: A/B preserved + Category U gates.
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
  v_fp text;
  v_unpriced_bars text[];
  v_auth jsonb;
  v_printed_bars text[] := array[]::text[];
  v_seen_auth text[] := array[]::text[];
  v_blocking text[] := array[
    'PRICE_AREA_CROPPED',
    'PRICE_AREA_INCOMPLETE',
    'PRICE_AREA_OBSCURED',
    'MENU_PRICE_EVIDENCE_INCOMPLETE',
    'PARTIAL_MENU_PHOTO',
    'ISOLATED_MISSING_PRICE'
  ];
begin
  select coalesce(array_agg(a->>'approval_id'), array[]::text[])
  into v_declared
  from jsonb_array_elements(coalesce(p_payload->'source_notes'->'price_evidence_approvals', '[]'::jsonb)) a;

  v_unpriced_bars := public.catalog_payload_unpriced_menu_authorized_bars(p_payload);

  -- Bars that visibly print prices (Category A/D) cannot also claim complete unpriced menus.
  select coalesce(array_agg(distinct o->>'bar_key'), array[]::text[])
  into v_printed_bars
  from jsonb_array_elements(coalesce(p_payload->'drinks', '[]'::jsonb)) d
  cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o
  where o->>'price_status' in ('verified_within_limit', 'verified_over_limit');

  for v_auth in
    select * from jsonb_array_elements(
      coalesce(p_payload->'source_notes'->'unpriced_menu_authorizations', '[]'::jsonb)
    )
  loop
    v_bar := v_auth->>'bar_key';
    if v_bar is null or v_bar = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'UNPRICED_MENU_AUTH_INVALID',
        'message', 'unpriced_menu_authorizations entry missing bar_key.'
      ));
      continue;
    end if;

    if not exists (
      select 1 from jsonb_array_elements(coalesce(p_payload->'bars', '[]'::jsonb)) b
      where b->>'key' = v_bar
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'UNPRICED_MENU_UNKNOWN_BAR',
        'message', format('unpriced_menu_authorizations references unknown bar %s.', v_bar)
      ));
    end if;

    if v_bar = any (v_seen_auth) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'UNPRICED_MENU_DUPLICATE_BAR',
        'message', format('unpriced_menu_authorizations declares bar %s more than once.', v_bar)
      ));
    end if;
    v_seen_auth := array_append(v_seen_auth, v_bar);

    if v_auth->>'completeness' is distinct from 'complete_menu_no_printed_prices'
       or nullif(btrim(coalesce(v_auth->>'evidence_reference', '')), '') is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'UNPRICED_MENU_AUTH_INVALID',
        'message', format(
          'Unpriced-menu authorization for %s must set completeness=complete_menu_no_printed_prices and a non-empty evidence_reference.',
          v_bar
        )
      ));
    end if;

    if v_bar = any (v_printed_bars) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'UNPRICED_MENU_BAR_HAS_PRINTED_PRICES',
        'message', format(
          'Bar %s has visibly priced offerings; complete price-free menu authorization is not allowed.',
          v_bar
        )
      ));
    end if;

    if exists (
      select 1
      from jsonb_array_elements(coalesce(p_payload->'source_notes'->'uncertainty_flags', '[]'::jsonb)) f
      where f->>'bar_key' = v_bar
        and f->>'code' = any (v_blocking)
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'UNPRICED_MENU_EVIDENCE_INCOMPLETE',
        'message', format(
          'Bar %s has cropped/incomplete/obscured price-area uncertainty; Category U authorization is rejected.',
          v_bar
        )
      ));
    end if;
  end loop;

  for v_drink in select * from jsonb_array_elements(coalesce(p_payload->'drinks', '[]'::jsonb))
  loop
    v_drink_key := v_drink->>'key';
    for v_off in select * from jsonb_array_elements(coalesce(v_drink->'bar_offerings', '[]'::jsonb))
    loop
      v_status := v_off->>'price_status';
      v_bar := v_off->>'bar_key';
      v_price := nullif(v_off->>'price_usd', '')::numeric;
      v_approval_id := nullif(v_off->>'price_evidence_approval_id', '');
      v_fp := nullif(v_off->>'price_evidence_recipe_fingerprint', '');

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
        elsif not exists (
          select 1 from public.catalog_category_b_approved_offerings a
          where a.approval_id = v_approval_id
            and a.drink_key = v_drink_key
            and a.bar_key = v_bar
            and a.recipe_fingerprint = v_fp
        ) then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_FILTERED_OFFERING_NOT_IN_SET',
            'message', format('Offering %s@%s not in approved filtered-source set (identity/fingerprint).', v_drink_key, v_bar)
          ));
        elsif not (v_approval_id = any (v_declared)) then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_FILTERED_APPROVAL_UNDECLARED',
            'message', format('Offering %s@%s approval %s not declared in source_notes.', v_drink_key, v_bar, v_approval_id)
          ));
        end if;
      elsif v_status = 'approved_unpriced_menu_within_limit' then
        if v_price is not null then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_UNPRICED_INVENTS_PRICE',
            'message', format('Offering %s@%s must keep price_usd null for Category U.', v_drink_key, v_bar)
          ));
        end if;
        if v_approval_id is not null or v_fp is not null then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_UNPRICED_CATEGORY_B_FIELDS',
            'message', format('Offering %s@%s must not carry Category B approval_id/fingerprint under Category U.', v_drink_key, v_bar)
          ));
        end if;
        if not (v_bar = any (v_unpriced_bars)) then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_UNPRICED_BAR_NOT_AUTHORIZED',
            'message', format(
              'Offering %s@%s claims approved_unpriced_menu_within_limit without valid source_notes.unpriced_menu_authorizations for that bar.',
              v_drink_key, v_bar
            )
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
-- Cocktail pool: Category A, B, or authorized Category U.
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
      and (
        public.catalog_offering_supports_bounty_eligibility(
          o.bar_key,
          o.price_status,
          o.price_usd,
          nullif(o.approval_id, ''),
          o.drink_key,
          nullif(o.fingerprint, '')
        )
        or (
          o.price_status = 'approved_unpriced_menu_within_limit'
          and o.price_usd is null
          and nullif(o.approval_id, '') is null
          and nullif(o.fingerprint, '') is null
          and o.bar_key = any (public.catalog_payload_unpriced_menu_authorized_bars(p_payload))
        )
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
      o2->>'price_evidence_approval_id' as approval_id,
      o2->>'price_evidence_recipe_fingerprint' as fingerprint
    from jsonb_array_elements(p_payload->'drinks') d
    cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o2
    where d->>'key' = c->>'drink_key'
      and o2->>'bar_key' = c->>'designated_bar_key'
    limit 1
  ) o on true
$$;

-- ---------------------------------------------------------------------------
-- Ingredient pool: corroboration via A, B, or authorized U only.
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
      and (
        public.catalog_offering_supports_bounty_eligibility(
          o->>'bar_key',
          o->>'price_status',
          nullif(o->>'price_usd', '')::numeric,
          nullif(o->>'price_evidence_approval_id', ''),
          d->>'key',
          nullif(o->>'price_evidence_recipe_fingerprint', '')
        )
        or (
          o->>'price_status' = 'approved_unpriced_menu_within_limit'
          and nullif(o->>'price_usd', '') is null
          and nullif(o->>'price_evidence_approval_id', '') is null
          and nullif(o->>'price_evidence_recipe_fingerprint', '') is null
          and o->>'bar_key' = any (public.catalog_payload_unpriced_menu_authorized_bars(p_payload))
        )
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
-- Collection / gauntlet price gate: include Category U.
-- ---------------------------------------------------------------------------
create or replace function public.achievement_offering_collection_price_ok(
  p_price_status public.price_verification_status
) returns boolean
language sql
immutable
as $$
  select p_price_status in (
    'verified_within_limit'::public.price_verification_status,
    'approved_filtered_within_limit'::public.price_verification_status,
    'approved_unpriced_menu_within_limit'::public.price_verification_status
  );
$$;

comment on function public.achievement_offering_collection_price_ok(public.price_verification_status) is
  'Gauntlet/collection required offerings need Category A, B, or U within-$15 evidence. Unverified remains loggable but not mandatory.';
