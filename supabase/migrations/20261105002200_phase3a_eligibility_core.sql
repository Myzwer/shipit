-- Phase 3A: shared eligibility evaluator (no player grants — called by preview/submit).

create or replace function public.drinkit_bar_points(p_companion_count integer)
returns integer
language sql
immutable
as $$
  select least(95, 25 + 10 * greatest(p_companion_count, 0));
$$;

comment on function public.drinkit_bar_points(integer) is
  'Bar Bounty points: min(95, 25 + 10 × additional companions). Claim requires companion_count >= 1.';

revoke all on function public.drinkit_bar_points(integer) from public;
grant execute on function public.drinkit_bar_points(integer) to service_role;
grant execute on function public.drinkit_bar_points(integer) to authenticated;

create or replace function public.drinkit_canonical_request_hash(p_payload jsonb)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
$$;

-- Normalize companions: distinct, not self, Drink It! enrolled. Raises on invalid.
create or replace function public.drinkit_normalize_companions(
  p_author uuid,
  p_companion_ids uuid[]
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(p_companion_ids, array[]::uuid[]);
  v_out uuid[] := array[]::uuid[];
  v_id uuid;
  v_ok boolean;
begin
  foreach v_id in array v_ids loop
    if v_id is null then
      raise exception 'INVALID_COMPANION' using errcode = '22023';
    end if;
    if v_id = p_author then
      raise exception 'SELF_COMPANION' using errcode = '22023';
    end if;
    if v_id = any (v_out) then
      continue; -- drop duplicates quietly
    end if;
    select exists (
      select 1
      from public.players p
      join public.game_memberships gm on gm.player_id = p.id
      where p.id = v_id
        and p.active
        and gm.game = 'drinkit'
        and gm.enabled
    ) into v_ok;
    if not v_ok then
      raise exception 'COMPANION_NOT_DRINKIT' using errcode = '22023';
    end if;
    v_out := array_append(v_out, v_id);
  end loop;
  return v_out;
end;
$$;

revoke all on function public.drinkit_normalize_companions(uuid, uuid[]) from public;
grant execute on function public.drinkit_normalize_companions(uuid, uuid[]) to service_role;

-- Resolve bar + drink mode from payload against active catalog.
create or replace function public.drinkit_resolve_drink_input(
  p_payload jsonb,
  p_catalog_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bar_key text := lower(trim(coalesce(p_payload->>'bar_canonical_key', '')));
  v_mode text := coalesce(p_payload->'drink'->>'mode', '');
  v_bar public.bars%rowtype;
  v_bar_name text;
  v_offering_id uuid;
  v_offering public.bar_offerings%rowtype;
  v_concept_key text;
  v_concept_name text;
  v_kind public.drink_kind;
  v_ings jsonb := '[]'::jsonb;
  v_custom text;
begin
  if v_bar_key = '' then
    raise exception 'BAR_REQUIRED' using errcode = '22023';
  end if;

  select b.* into v_bar from public.bars b where b.canonical_key = v_bar_key;
  if not found then
    raise exception 'BAR_UNKNOWN' using errcode = '22023';
  end if;

  select cvb.name into v_bar_name
  from public.catalog_version_bars cvb
  where cvb.catalog_version_id = p_catalog_version_id
    and cvb.bar_id = v_bar.id
    and cvb.active;
  if v_bar_name is null then
    raise exception 'BAR_INACTIVE' using errcode = '22023';
  end if;

  if v_mode = 'named_catalog' then
    begin
      v_offering_id := (p_payload->'drink'->>'offering_id')::uuid;
    exception when others then
      raise exception 'OFFERING_REQUIRED' using errcode = '22023';
    end;
    if v_offering_id is null then
      raise exception 'OFFERING_REQUIRED' using errcode = '22023';
    end if;

    select * into v_offering from public.bar_offerings where id = v_offering_id;
    if not found or v_offering.bar_id is distinct from v_bar.id then
      raise exception 'OFFERING_BAR_MISMATCH' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.catalog_version_offerings cvo
      where cvo.catalog_version_id = p_catalog_version_id
        and cvo.offering_id = v_offering_id
    ) then
      raise exception 'OFFERING_NOT_IN_CATALOG' using errcode = '22023';
    end if;

    select dc.canonical_key, cvd.display_name, cvd.kind
      into v_concept_key, v_concept_name, v_kind
    from public.drink_concepts dc
    join public.catalog_version_drink_concepts cvd
      on cvd.drink_concept_id = dc.id
     and cvd.catalog_version_id = p_catalog_version_id
    where dc.id = v_offering.drink_concept_id;

    if v_kind = 'nonalcoholic' then
      raise exception 'NONALCOHOLIC_FORBIDDEN' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'ingredient_id', i.id,
      'canonical_key', i.canonical_key,
      'display_name', cvi.display_name
    ) order by i.canonical_key), '[]'::jsonb)
      into v_ings
    from public.catalog_offering_ingredients coi
    join public.ingredients i on i.id = coi.ingredient_id
    join public.catalog_version_ingredients cvi
      on cvi.catalog_version_id = coi.catalog_version_id
     and cvi.ingredient_id = i.id
    where coi.catalog_version_id = p_catalog_version_id
      and coi.offering_id = v_offering_id;

    return jsonb_build_object(
      'bar_id', v_bar.id,
      'bar_canonical_key', v_bar.canonical_key,
      'bar_display_name', v_bar_name,
      'drink_mode', 'named_catalog',
      'offering_id', v_offering_id,
      'drink_concept_id', v_offering.drink_concept_id,
      'drink_concept_key', v_concept_key,
      'drink_display_name', v_concept_name,
      'drink_kind', v_kind,
      'alcoholic', true,
      'ingredients', v_ings
    );
  elsif v_mode in ('generic_beer', 'generic_wine', 'generic_other') then
    return jsonb_build_object(
      'bar_id', v_bar.id,
      'bar_canonical_key', v_bar.canonical_key,
      'bar_display_name', v_bar_name,
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
    -- Shape reserved for Phase 3C ingredient confirmation; no auto ingredient eligibility.
    return jsonb_build_object(
      'bar_id', v_bar.id,
      'bar_canonical_key', v_bar.canonical_key,
      'bar_display_name', v_bar_name,
      'drink_mode', 'unlisted_named',
      'offering_id', null,
      'drink_concept_id', null,
      'drink_concept_key', null,
      'drink_display_name', v_custom,
      'custom_name', v_custom,
      'drink_kind', 'named_cocktail',
      'alcoholic', true,
      'ingredients', '[]'::jsonb,
      'unlisted_contains_ingredient_key', p_payload->'drink'->>'unlisted_contains_ingredient_key'
    );
  else
    raise exception 'DRINK_MODE_INVALID' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.drinkit_resolve_drink_input(jsonb, uuid) from public;
grant execute on function public.drinkit_resolve_drink_input(jsonb, uuid) to service_role;

-- Build offer option object from bounty_slot_offers + slot
create or replace function public.drinkit_offer_option(
  p_offer public.bounty_slot_offers,
  p_slot public.bounty_slots,
  p_source text
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'category', p_slot.category::text,
    'offer_id', p_offer.id,
    'slot_id', p_slot.id,
    'slot_key', p_slot.slot_key,
    'canonical_key', p_offer.canonical_key,
    'points', p_offer.points,
    'tier', p_offer.tier,
    'source', p_source,
    'display', p_offer.display_snapshot
  );
$$;

-- Core evaluator used by preview + submit (service_role / security definer callers).
create or replace function public.drinkit_evaluate_eligibility(
  p_player_id uuid,
  p_payload jsonb,
  p_at_utc timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_catalog uuid;
  v_life jsonb;
  v_companions uuid[];
  v_drink jsonb;
  v_cocktail_raw jsonb;
  v_ingredient_raw jsonb;
  v_cocktail jsonb;
  v_ingredient jsonb;
  v_bar jsonb;
  v_daily jsonb;
  v_claimed text[];
  v_options jsonb := '[]'::jsonb;
  v_offer public.bounty_slot_offers%rowtype;
  v_slot public.bounty_slots%rowtype;
  v_grace jsonb;
  v_grace_offer public.bounty_slot_offers%rowtype;
  v_grace_slot public.bounty_slots%rowtype;
  v_match boolean;
  v_bar_row public.bar_bounties%rowtype;
  v_comp_count integer;
  v_bar_points integer;
  v_status text;
begin
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'UNAVAILABLE', 'message', 'No active cruise');
  end if;

  select catalog_version_id into v_catalog from public.active_catalog_pointer where id = 1;
  if v_catalog is null then
    return jsonb_build_object('ok', false, 'code', 'UNAVAILABLE', 'message', 'No active catalog');
  end if;

  v_life := public.drinkit_lifecycle_at(p_at_utc);
  -- Pause/finale block all logs at submit; preview still returns structure with lifecycle.
  select coalesce(array_agg(x::uuid), array[]::uuid[])
    into v_companions
  from jsonb_array_elements_text(coalesce(p_payload->'companion_player_ids', '[]'::jsonb)) as t(x);
  v_companions := public.drinkit_normalize_companions(p_player_id, v_companions);
  v_comp_count := coalesce(array_length(v_companions, 1), 0);
  v_drink := public.drinkit_resolve_drink_input(p_payload, v_catalog);

  select coalesce(array_agg(category::text), array[]::text[])
    into v_claimed
  from public.bounty_claims
  where player_id = p_player_id
    and cruise_config_id = v_config.id
    and game_day = coalesce((v_life->>'cruise_day')::int, -1)
    and status = 'active';

  -- ----- Cocktail -----
  v_options := '[]'::jsonb;
  v_cocktail_raw := public.bounty_resolve_at('cocktail', p_at_utc, true, true);
  if (v_claimed @> array['cocktail']) then
    v_cocktail := jsonb_build_object(
      'status', 'already_claimed',
      'reason', 'category_used_today',
      'options', '[]'::jsonb
    );
  elsif v_comp_count < 1 then
    v_cocktail := jsonb_build_object(
      'status', 'unavailable',
      'reason', 'companion_required',
      'options', '[]'::jsonb
    );
  elsif (v_drink->>'drink_mode') is distinct from 'named_catalog' then
    v_cocktail := jsonb_build_object(
      'status', 'unavailable',
      'reason', 'named_catalog_required',
      'options', '[]'::jsonb
    );
  elsif v_cocktail_raw->>'status' is distinct from 'active' then
    v_cocktail := jsonb_build_object(
      'status', 'unavailable',
      'reason', coalesce(v_cocktail_raw->>'reason', v_cocktail_raw->>'status'),
      'options', '[]'::jsonb
    );
  else
    select * into v_offer from public.bounty_slot_offers where id = (v_cocktail_raw->>'offer_id')::uuid;
    select * into v_slot from public.bounty_slots where id = (v_cocktail_raw->>'slot_id')::uuid;
    v_match := v_offer.cocktail_offering_id is not null
      and v_offer.cocktail_offering_id = (v_drink->>'offering_id')::uuid
      and v_offer.exposed_at_utc is not null;
    if v_match then
      v_options := v_options || jsonb_build_array(public.drinkit_offer_option(v_offer, v_slot, 'current'));
    end if;

    v_grace := v_cocktail_raw->'grace_previous';
    if v_grace is not null and v_grace->>'offer_id' is not null then
      select * into v_grace_offer from public.bounty_slot_offers where id = (v_grace->>'offer_id')::uuid;
      select * into v_grace_slot from public.bounty_slots where id = v_grace_offer.slot_id;
      if v_grace_offer.cocktail_offering_id = (v_drink->>'offering_id')::uuid
         and v_grace_offer.exposed_at_utc is not null then
        v_options := v_options || jsonb_build_array(
          public.drinkit_offer_option(v_grace_offer, v_grace_slot, 'grace_previous')
        );
      end if;
    end if;

    if jsonb_array_length(v_options) > 0 then
      v_cocktail := jsonb_build_object('status', 'eligible', 'reason', null, 'options', v_options);
    else
      v_cocktail := jsonb_build_object(
        'status', 'unavailable',
        'reason', 'drink_or_bar_mismatch',
        'options', '[]'::jsonb
      );
    end if;
  end if;

  -- ----- Ingredient -----
  v_options := '[]'::jsonb;
  v_ingredient_raw := public.bounty_resolve_at('ingredient', p_at_utc, true, true);
  if (v_claimed @> array['ingredient']) then
    v_ingredient := jsonb_build_object(
      'status', 'already_claimed',
      'reason', 'category_used_today',
      'options', '[]'::jsonb
    );
  elsif v_comp_count < 1 then
    v_ingredient := jsonb_build_object(
      'status', 'unavailable',
      'reason', 'companion_required',
      'options', '[]'::jsonb
    );
  elsif (v_drink->>'drink_mode') is distinct from 'named_catalog' then
    v_ingredient := jsonb_build_object(
      'status', 'unavailable',
      'reason', 'named_catalog_required',
      'options', '[]'::jsonb
    );
  elsif v_ingredient_raw->>'status' is distinct from 'active' then
    v_ingredient := jsonb_build_object(
      'status', 'unavailable',
      'reason', coalesce(v_ingredient_raw->>'reason', v_ingredient_raw->>'status'),
      'options', '[]'::jsonb
    );
  else
    select * into v_offer from public.bounty_slot_offers where id = (v_ingredient_raw->>'offer_id')::uuid;
    select * into v_slot from public.bounty_slots where id = (v_ingredient_raw->>'slot_id')::uuid;
    v_match := v_offer.ingredient_id is not null
      and v_offer.exposed_at_utc is not null
      and exists (
        select 1 from public.catalog_offering_ingredients coi
        where coi.catalog_version_id = v_catalog
          and coi.offering_id = (v_drink->>'offering_id')::uuid
          and coi.ingredient_id = v_offer.ingredient_id
      );
    if v_match then
      v_options := v_options || jsonb_build_array(public.drinkit_offer_option(v_offer, v_slot, 'current'));
    end if;

    v_grace := v_ingredient_raw->'grace_previous';
    if v_grace is not null and v_grace->>'offer_id' is not null then
      select * into v_grace_offer from public.bounty_slot_offers where id = (v_grace->>'offer_id')::uuid;
      select * into v_grace_slot from public.bounty_slots where id = v_grace_offer.slot_id;
      if v_grace_offer.ingredient_id is not null
         and v_grace_offer.exposed_at_utc is not null
         and exists (
           select 1 from public.catalog_offering_ingredients coi
           where coi.catalog_version_id = v_catalog
             and coi.offering_id = (v_drink->>'offering_id')::uuid
             and coi.ingredient_id = v_grace_offer.ingredient_id
         ) then
        v_options := v_options || jsonb_build_array(
          public.drinkit_offer_option(v_grace_offer, v_grace_slot, 'grace_previous')
        );
      end if;
    end if;

    if jsonb_array_length(v_options) > 0 then
      v_ingredient := jsonb_build_object('status', 'eligible', 'reason', null, 'options', v_options);
    else
      v_ingredient := jsonb_build_object(
        'status', 'unavailable',
        'reason', 'ingredient_not_in_offering',
        'options', '[]'::jsonb
      );
    end if;
  end if;

  -- ----- Bar -----
  if (v_claimed @> array['bar']) then
    v_bar := jsonb_build_object(
      'status', 'already_claimed',
      'reason', 'category_used_today',
      'options', '[]'::jsonb
    );
  elsif v_comp_count < 1 then
    v_bar := jsonb_build_object(
      'status', 'unavailable',
      'reason', 'companion_required',
      'options', '[]'::jsonb
    );
  elsif v_life->>'status' is distinct from 'open' then
    v_bar := jsonb_build_object(
      'status', 'unavailable',
      'reason', coalesce(v_life->>'reason', v_life->>'status'),
      'options', '[]'::jsonb
    );
  else
    select * into v_bar_row
    from public.bar_bounties
    where cruise_config_id = v_config.id
      and day_number = (v_life->>'cruise_day')::int;
    if not found then
      v_bar := jsonb_build_object(
        'status', 'unavailable',
        'reason', 'no_bar_assignment',
        'options', '[]'::jsonb
      );
    elsif v_bar_row.bar_id is distinct from (v_drink->>'bar_id')::uuid then
      v_bar := jsonb_build_object(
        'status', 'unavailable',
        'reason', 'not_featured_bar',
        'options', '[]'::jsonb
      );
    elsif (v_drink->>'alcoholic')::boolean is not true then
      v_bar := jsonb_build_object(
        'status', 'unavailable',
        'reason', 'nonalcoholic',
        'options', '[]'::jsonb
      );
    else
      v_bar_points := public.drinkit_bar_points(v_comp_count);
      v_bar := jsonb_build_object(
        'status', 'eligible',
        'reason', null,
        'options', jsonb_build_array(jsonb_build_object(
          'category', 'bar',
          'assignment_id', v_bar_row.id,
          'bar_canonical_key', v_bar_row.bar_canonical_key,
          'bar_display_name', v_bar_row.bar_display_name,
          'points', v_bar_points,
          'companion_count', v_comp_count,
          'source', 'daily'
        ))
      );
    end if;
  end if;

  -- ----- Daily (not via drink submit) -----
  v_daily := jsonb_build_object(
    'status', 'unavailable',
    'reason', 'separate_submission_path',
    'options', '[]'::jsonb
  );
  if (v_claimed @> array['daily']) then
    v_daily := jsonb_build_object(
      'status', 'already_claimed',
      'reason', 'category_used_today',
      'options', '[]'::jsonb
    );
  end if;

  v_status := v_life->>'status';

  return jsonb_build_object(
    'ok', true,
    'lifecycle', v_life,
    'cruise_config_id', v_config.id,
    'catalog_version_id', v_catalog,
    'cruise_day', (v_life->>'cruise_day')::int,
    'received_at_utc', p_at_utc,
    'companion_player_ids', to_jsonb(v_companions),
    'companion_count', v_comp_count,
    'drink', v_drink,
    'categories', jsonb_build_object(
      'cocktail', v_cocktail,
      'ingredient', v_ingredient,
      'bar', v_bar,
      'daily', v_daily
    )
  );
end;
$$;

revoke all on function public.drinkit_evaluate_eligibility(uuid, jsonb, timestamptz) from public;
grant execute on function public.drinkit_evaluate_eligibility(uuid, jsonb, timestamptz) to service_role;
