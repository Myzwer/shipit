-- Other Drinks: catalog-independent ordinary-log concept compatibility.
-- Attaches allowlisted drink_concept_id for achievement identity only.
-- Never invents offering_id, ingredient links, or bounty eligibility.
-- Preserves Mobile Order named_catalog resolution from prior migrations.

create or replace function public.drinkit_other_drinks_concept_allowlist()
returns text[]
language sql
immutable
as $$
  select array[
    'loaded-corona',
    'princess-ultimate-cooler',
    'tequila-shot',
    'sambuca-shot',
    'fireball-shot'
  ]::text[];
$$;

comment on function public.drinkit_other_drinks_concept_allowlist() is
  'Permanent Other Drinks concept keys eligible for achievement identity attachment. Not a catalog menu.';

CREATE OR REPLACE FUNCTION public.drinkit_resolve_drink_input(p_payload jsonb, p_catalog_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bar public.bars%rowtype;
  v_bar_name text;
  v_mode text := coalesce(p_payload->'drink'->>'mode', '');
  v_offering uuid;
  v_concept uuid;
  v_concept_key text;
  v_display text;
  v_kind text;
  v_alcoholic boolean;
  v_ings jsonb;
  v_custom text;
  v_unlisted_kind text;
  v_other_concept_key text;
  v_restricted boolean;
begin
  select b.* into v_bar
  from public.bars b
  where b.canonical_key = lower(trim(coalesce(p_payload->>'bar_canonical_key', '')))
  limit 1;
  if not found then
    raise exception 'BAR_NOT_FOUND' using errcode = '22023';
  end if;

  select cvb.name into v_bar_name
  from public.catalog_version_bars cvb
  where cvb.catalog_version_id = p_catalog_version_id and cvb.bar_id = v_bar.id;

  if v_bar_name is null and v_bar.is_virtual then
    v_bar_name := 'Mobile Order';
  end if;

  if v_mode = 'named_catalog' then
    begin
      v_offering := (p_payload->'drink'->>'offering_id')::uuid;
    exception when others then
      raise exception 'OFFERING_REQUIRED' using errcode = '22023';
    end;
    if v_offering is null then
      raise exception 'OFFERING_REQUIRED' using errcode = '22023';
    end if;

    if v_bar.is_virtual then
      v_restricted := public.mobile_order_menu_is_restricted(p_catalog_version_id);
      select bo.drink_concept_id, dc.canonical_key, cvd.display_name, cvd.kind
        into v_concept, v_concept_key, v_display, v_kind
      from public.bar_offerings bo
      join public.bars pb on pb.id = bo.bar_id and pb.is_virtual is false
      join public.drink_concepts dc on dc.id = bo.drink_concept_id
      join public.catalog_version_drink_concepts cvd
        on cvd.catalog_version_id = p_catalog_version_id and cvd.drink_concept_id = dc.id
      join public.catalog_version_offerings cvo
        on cvo.catalog_version_id = p_catalog_version_id and cvo.offering_id = bo.id
      where bo.id = v_offering
        and (
          not v_restricted
          or exists (
            select 1
            from public.mobile_order_menu_concepts m
            where m.catalog_version_id = p_catalog_version_id
              and m.drink_concept_id = bo.drink_concept_id
              and m.active is true
          )
        );
      if not found then
        raise exception 'OFFERING_NOT_AT_BAR' using errcode = '22023';
      end if;
    else
      select bo.drink_concept_id, dc.canonical_key, cvd.display_name, cvd.kind
        into v_concept, v_concept_key, v_display, v_kind
      from public.bar_offerings bo
      join public.drink_concepts dc on dc.id = bo.drink_concept_id
      join public.catalog_version_drink_concepts cvd
        on cvd.catalog_version_id = p_catalog_version_id and cvd.drink_concept_id = dc.id
      join public.catalog_version_offerings cvo
        on cvo.catalog_version_id = p_catalog_version_id and cvo.offering_id = bo.id
      where bo.id = v_offering and bo.bar_id = v_bar.id;
      if not found then
        raise exception 'OFFERING_NOT_AT_BAR' using errcode = '22023';
      end if;
    end if;

    if v_kind = 'nonalcoholic' then
      raise exception 'NONALCOHOLIC_NOT_ALLOWED' using errcode = '22023';
    end if;
    v_alcoholic := true;

    select coalesce(jsonb_agg(jsonb_build_object(
      'ingredient_id', coi.ingredient_id,
      'canonical_key', i.canonical_key,
      'display_name', coalesce(coi.display_label, cvi.display_name)
    ) order by coalesce(coi.display_label, cvi.display_name)), '[]'::jsonb)
    into v_ings
    from public.catalog_offering_ingredients coi
    join public.ingredients i on i.id = coi.ingredient_id
    join public.catalog_version_ingredients cvi
      on cvi.catalog_version_id = p_catalog_version_id and cvi.ingredient_id = i.id
    where coi.catalog_version_id = p_catalog_version_id and coi.offering_id = v_offering;

    select coalesce(v_ings, '[]'::jsonb) || coalesce((
      select jsonb_agg(jsonb_build_object(
        'ingredient_id', ic.ingredient_id,
        'canonical_key', i.canonical_key,
        'display_name', coalesce(cvi.display_name, i.canonical_key),
        'via', 'correction'
      ))
      from public.ingredient_corrections ic
      join public.ingredients i on i.id = ic.ingredient_id
      left join public.catalog_version_ingredients cvi
        on cvi.catalog_version_id = p_catalog_version_id and cvi.ingredient_id = i.id
      where ic.offering_id = v_offering and ic.active is true
        and not exists (
          select 1 from public.catalog_offering_ingredients coi2
          where coi2.catalog_version_id = p_catalog_version_id
            and coi2.offering_id = v_offering
            and coi2.ingredient_id = ic.ingredient_id
        )
    ), '[]'::jsonb)
    into v_ings;

    return jsonb_build_object(
      'bar_id', v_bar.id,
      'bar_canonical_key', v_bar.canonical_key,
      'bar_display_name', v_bar_name,
      'bar_is_virtual', v_bar.is_virtual,
      'drink_mode', 'named_catalog',
      'offering_id', v_offering,
      'drink_concept_id', v_concept,
      'drink_concept_key', v_concept_key,
      'drink_display_name', v_display,
      'drink_kind', v_kind,
      'alcoholic', v_alcoholic,
      'ingredients', coalesce(v_ings, '[]'::jsonb)
    );
  elsif v_mode in ('generic_beer', 'generic_wine', 'generic_other') then
    return jsonb_build_object(
      'bar_id', v_bar.id,
      'bar_canonical_key', v_bar.canonical_key,
      'bar_display_name', v_bar_name,
      'bar_is_virtual', v_bar.is_virtual,
      'drink_mode', v_mode,
      'offering_id', null,
      'drink_concept_id', null,
      'drink_concept_key', null,
      'drink_display_name', case v_mode
        when 'generic_beer' then 'Beer'
        when 'generic_wine' then 'Wine'
        else 'Other Alcoholic Beverage'
      end,
      'drink_kind', case v_mode
        when 'generic_beer' then 'beer'
        when 'generic_wine' then 'wine'
        else 'other_alcoholic'
      end,
      'generic_type', case v_mode
        when 'generic_beer' then 'beer'
        when 'generic_wine' then 'wine'
        else 'other_alcoholic'
      end,
      'alcoholic', true,
      'ingredients', '[]'::jsonb
    );
  elsif v_mode = 'unlisted_named' then
    v_custom := trim(coalesce(p_payload->'drink'->>'custom_name', ''));
    if v_custom = '' then
      raise exception 'CUSTOM_NAME_REQUIRED' using errcode = '22023';
    end if;
    v_unlisted_kind := lower(trim(coalesce(p_payload->'drink'->>'unlisted_drink_kind', 'named_cocktail')));
    if v_unlisted_kind not in ('named_cocktail', 'beer', 'wine', 'other_alcoholic') then
      v_unlisted_kind := 'named_cocktail';
    end if;

    -- Other Drinks: optional allowlisted concept identity (no offering / no ingredients).
    v_other_concept_key := nullif(lower(trim(coalesce(
      p_payload->'drink'->>'other_drinks_concept_key',
      ''
    ))), '');
    v_concept := null;
    v_concept_key := null;
    if v_other_concept_key is not null then
      if not (v_other_concept_key = any (public.drinkit_other_drinks_concept_allowlist())) then
        raise exception 'OTHER_DRINKS_CONCEPT_INVALID' using errcode = '22023';
      end if;
      if coalesce(v_bar.is_virtual, false) then
        raise exception 'OTHER_DRINKS_NOT_ON_MOBILE_ORDER' using errcode = '22023';
      end if;
      select dc.id, dc.canonical_key
        into v_concept, v_concept_key
      from public.drink_concepts dc
      where dc.canonical_key = v_other_concept_key
      limit 1;
    end if;

    return jsonb_build_object(
      'bar_id', v_bar.id,
      'bar_canonical_key', v_bar.canonical_key,
      'bar_display_name', v_bar_name,
      'bar_is_virtual', v_bar.is_virtual,
      'drink_mode', 'unlisted_named',
      'offering_id', null,
      'drink_concept_id', v_concept,
      'drink_concept_key', v_concept_key,
      'drink_display_name', v_custom,
      'custom_name', v_custom,
      'drink_kind', v_unlisted_kind,
      'alcoholic', true,
      'ingredients', '[]'::jsonb,
      'unlisted_contains_ingredient_key', p_payload->'drink'->>'unlisted_contains_ingredient_key',
      'confirm_featured_cocktail', coalesce((p_payload->'drink'->>'confirm_featured_cocktail')::boolean, false),
      'other_drinks_key', nullif(trim(coalesce(p_payload->'drink'->>'other_drinks_key', '')), ''),
      'other_drinks_concept_key', v_concept_key
    );
  else
    raise exception 'DRINK_MODE_INVALID' using errcode = '22023';
  end if;
end;
$function$;

comment on function public.drinkit_resolve_drink_input(jsonb, uuid) is
  'Resolve drink payload. Other Drinks may attach allowlisted drink_concept_id without offering_id. Virtual Mobile Order may use a physical-bar offering as concept snapshot; menu table may restrict.';


-- Allow optional drink_concept_id on unlisted_named for Other Drinks identity
-- (still no offering_id; custom_name required). Does not invent menu offerings.
alter table public.drink_logs drop constraint if exists drink_logs_mode_check;

alter table public.drink_logs
  add constraint drink_logs_mode_check check (
    (
      drink_mode = 'named_catalog'::public.drink_log_mode
      and offering_id is not null
      and drink_concept_id is not null
      and custom_name is null
      and generic_type is null
    )
    or (
      drink_mode = any (array[
        'generic_beer'::public.drink_log_mode,
        'generic_wine'::public.drink_log_mode,
        'generic_other'::public.drink_log_mode
      ])
      and offering_id is null
      and drink_concept_id is null
      and custom_name is null
      and generic_type = any (array['beer'::text, 'wine'::text, 'other_alcoholic'::text])
    )
    or (
      drink_mode = 'unlisted_named'::public.drink_log_mode
      and offering_id is null
      and custom_name is not null
      and char_length(trim(both from custom_name)) > 0
    )
  );

