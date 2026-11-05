-- Phase 3C-A: ingredient correction overlay + evaluate/submit honor confirmations.
-- Shared corrections attach to catalog offering_id (named drinks only).
-- Unlisted honor confirmations qualify the current submission only (no invented menu identity).

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
create table if not exists public.ingredient_corrections (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.bar_offerings (id),
  ingredient_id uuid not null references public.ingredients (id),
  confirmed_by_player_id uuid not null references public.players (id),
  source_submission_id uuid references public.submissions (id) on delete set null,
  active boolean not null default true,
  created_at_utc timestamptz not null default clock_timestamp(),
  deactivated_at_utc timestamptz,
  deactivated_by_player_id uuid references public.players (id),
  deactivation_note text,
  constraint ingredient_corrections_offering_ingredient_unique unique (offering_id, ingredient_id)
);

comment on table public.ingredient_corrections is
  'Phase 3C-A: player-confirmed bar-specific offering↔ingredient overlay. Idempotent; does not change tiers/rotation.';

create index if not exists ingredient_corrections_active_offering_idx
  on public.ingredient_corrections (offering_id, ingredient_id)
  where active is true;

alter table public.ingredient_corrections enable row level security;

-- Players: no direct writes. Select own confirmation rows only (audit / Gallery).
create policy ingredient_corrections_select_own
  on public.ingredient_corrections for select to authenticated
  using (confirmed_by_player_id = public.current_player_id() or public.is_admin());

revoke all on table public.ingredient_corrections from public;
grant select on table public.ingredient_corrections to authenticated;
-- Inserts only via SECURITY DEFINER submit path (table owner / service_role).

-- ---------------------------------------------------------------------------
-- Offering contains ingredient? (catalog ∪ active overlay ∪ in-request confirm)
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_offering_has_ingredient(
  p_catalog_version_id uuid,
  p_offering_id uuid,
  p_ingredient_id uuid,
  p_confirm_ingredient_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_offering_id is not null
    and p_ingredient_id is not null
    and (
      exists (
        select 1 from public.catalog_offering_ingredients coi
        where coi.catalog_version_id = p_catalog_version_id
          and coi.offering_id = p_offering_id
          and coi.ingredient_id = p_ingredient_id
      )
      or exists (
        select 1 from public.ingredient_corrections ic
        where ic.offering_id = p_offering_id
          and ic.ingredient_id = p_ingredient_id
          and ic.active is true
      )
      or (p_confirm_ingredient_id is not null and p_confirm_ingredient_id = p_ingredient_id)
    );
$$;

revoke all on function public.drinkit_offering_has_ingredient(uuid, uuid, uuid, uuid) from public;
grant execute on function public.drinkit_offering_has_ingredient(uuid, uuid, uuid, uuid) to service_role;

-- Resolve confirm_contains_ingredient_key → ingredient_id (active catalog only).
create or replace function public.drinkit_resolve_ingredient_key(
  p_catalog_version_id uuid,
  p_ingredient_key text
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select i.id
  from public.ingredients i
  join public.catalog_version_ingredients cvi
    on cvi.ingredient_id = i.id and cvi.catalog_version_id = p_catalog_version_id
  where i.canonical_key = lower(trim(coalesce(p_ingredient_key, '')))
  limit 1;
$$;

revoke all on function public.drinkit_resolve_ingredient_key(uuid, text) from public;
grant execute on function public.drinkit_resolve_ingredient_key(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Admin-ready deactivate (authorized + audited); UI deferred.
-- ---------------------------------------------------------------------------
create or replace function public.admin_deactivate_ingredient_correction(
  p_correction_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_row public.ingredient_corrections%rowtype;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_row from public.ingredient_corrections where id = p_correction_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  perform public.write_admin_audit(
    'ingredient_correction.deactivate',
    v_me,
    'ingredient_corrections',
    v_row.id::text,
    jsonb_build_object(
      'offering_id', v_row.offering_id,
      'ingredient_id', v_row.ingredient_id,
      'active', v_row.active
    ),
    jsonb_build_object(
      'offering_id', v_row.offering_id,
      'ingredient_id', v_row.ingredient_id,
      'active', false,
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  );

  update public.ingredient_corrections
  set
    active = false,
    deactivated_at_utc = clock_timestamp(),
    deactivated_by_player_id = v_me,
    deactivation_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_correction_id
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'correction_id', v_row.id,
    'offering_id', v_row.offering_id,
    'ingredient_id', v_row.ingredient_id,
    'active', v_row.active
  );
end;
$$;

revoke all on function public.admin_deactivate_ingredient_correction(uuid, text) from public;
grant execute on function public.admin_deactivate_ingredient_correction(uuid, text) to authenticated;

-- Unlisted drink_kind from client type (cocktail vs beer/wine/other).
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

  if v_mode = 'named_catalog' then
    begin
      v_offering := (p_payload->'drink'->>'offering_id')::uuid;
    exception when others then
      raise exception 'OFFERING_REQUIRED' using errcode = '22023';
    end;
    if v_offering is null then
      raise exception 'OFFERING_REQUIRED' using errcode = '22023';
    end if;

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

    -- Include active overlay ingredients in snapshot.
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
      'drink_kind', v_unlisted_kind,
      'alcoholic', true,
      'ingredients', '[]'::jsonb,
      'unlisted_contains_ingredient_key', p_payload->'drink'->>'unlisted_contains_ingredient_key',
      'confirm_featured_cocktail', coalesce((p_payload->'drink'->>'confirm_featured_cocktail')::boolean, false)
    );
  else
    raise exception 'DRINK_MODE_INVALID' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Evaluate eligibility (3C-A confirmations)
-- ---------------------------------------------------------------------------
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
  v_bar_eligible uuid[];
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
  v_bar_eligible_count integer;
  v_bar_points integer;
  v_raw_bar_eligible uuid[];
  v_confirm_key text;
  v_confirm_ingredient_id uuid;
  v_unlisted_key text;
  v_confirm_featured boolean;
  v_confirmable jsonb;
  v_ing_display text;
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

  select coalesce(array_agg(x::uuid), array[]::uuid[])
    into v_companions
  from jsonb_array_elements_text(coalesce(p_payload->'companion_player_ids', '[]'::jsonb)) as t(x);
  v_companions := public.drinkit_normalize_companions(p_player_id, v_companions);
  v_comp_count := coalesce(array_length(v_companions, 1), 0);

  select coalesce(array_agg(x::uuid), array[]::uuid[])
    into v_raw_bar_eligible
  from jsonb_array_elements_text(coalesce(p_payload->'bar_eligible_companion_ids', '[]'::jsonb)) as t(x);
  v_bar_eligible := public.drinkit_normalize_bar_eligible(v_companions, v_raw_bar_eligible);
  v_bar_eligible_count := coalesce(array_length(v_bar_eligible, 1), 0);

  v_drink := public.drinkit_resolve_drink_input(p_payload, v_catalog);

  v_confirm_key := nullif(trim(coalesce(p_payload->'drink'->>'confirm_contains_ingredient_key', '')), '');
  v_unlisted_key := nullif(trim(coalesce(p_payload->'drink'->>'unlisted_contains_ingredient_key', '')), '');
  v_confirm_featured := coalesce((p_payload->'drink'->>'confirm_featured_cocktail')::boolean, false);
  if v_confirm_key is not null then
    v_confirm_ingredient_id := public.drinkit_resolve_ingredient_key(v_catalog, v_confirm_key);
  end if;

  select coalesce(array_agg(category::text), array[]::text[])
    into v_claimed
  from public.bounty_claims
  where player_id = p_player_id
    and cruise_config_id = v_config.id
    and game_day = coalesce((v_life->>'cruise_day')::int, -1)
    and status = 'active';

  -- Cocktail
  v_options := '[]'::jsonb;
  v_cocktail_raw := public.bounty_resolve_at('cocktail', p_at_utc, true, true);
  if (v_claimed @> array['cocktail']) then
    v_cocktail := jsonb_build_object('status', 'already_claimed', 'reason', 'category_used_today', 'options', '[]'::jsonb);
  elsif v_comp_count < 1 then
    v_cocktail := jsonb_build_object('status', 'unavailable', 'reason', 'companion_required', 'options', '[]'::jsonb);
  elsif (v_drink->>'drink_mode') = 'named_catalog' then
    if v_cocktail_raw->>'status' is distinct from 'active' then
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
        v_cocktail := jsonb_build_object('status', 'unavailable', 'reason', 'drink_or_bar_mismatch', 'options', '[]'::jsonb);
      end if;
    end if;
  elsif (v_drink->>'drink_mode') = 'unlisted_named' and v_confirm_featured then
    -- Honor: unlisted entry is the featured Cocktail at its designated bar only.
    if v_cocktail_raw->>'status' is distinct from 'active' then
      v_cocktail := jsonb_build_object(
        'status', 'unavailable',
        'reason', coalesce(v_cocktail_raw->>'reason', v_cocktail_raw->>'status'),
        'options', '[]'::jsonb
      );
    else
      select * into v_offer from public.bounty_slot_offers where id = (v_cocktail_raw->>'offer_id')::uuid;
      select * into v_slot from public.bounty_slots where id = (v_cocktail_raw->>'slot_id')::uuid;
      v_match := v_offer.exposed_at_utc is not null
        and lower(trim(coalesce(v_offer.display_snapshot->>'designated_bar_key', '')))
            = lower(trim(coalesce(v_drink->>'bar_canonical_key', '')))
        and lower(trim(coalesce(v_drink->>'custom_name', v_drink->>'drink_display_name', '')))
            = lower(trim(coalesce(v_offer.display_snapshot->>'drink_name', '')));
      if v_match then
        v_cocktail := jsonb_build_object(
          'status', 'eligible',
          'reason', null,
          'options', jsonb_build_array(public.drinkit_offer_option(v_offer, v_slot, 'current')),
          'via', 'unlisted_featured_confirm'
        );
      else
        v_cocktail := jsonb_build_object(
          'status', 'unavailable',
          'reason', 'featured_cocktail_bar_or_name_mismatch',
          'options', '[]'::jsonb
        );
      end if;
    end if;
  else
    v_cocktail := jsonb_build_object('status', 'unavailable', 'reason', 'named_catalog_required', 'options', '[]'::jsonb);
  end if;

  -- Ingredient
  v_options := '[]'::jsonb;
  v_confirmable := null;
  v_ingredient_raw := public.bounty_resolve_at('ingredient', p_at_utc, true, true);
  if (v_claimed @> array['ingredient']) then
    v_ingredient := jsonb_build_object('status', 'already_claimed', 'reason', 'category_used_today', 'options', '[]'::jsonb);
  elsif v_comp_count < 1 then
    v_ingredient := jsonb_build_object('status', 'unavailable', 'reason', 'companion_required', 'options', '[]'::jsonb);
  elsif v_ingredient_raw->>'status' is distinct from 'active' then
    v_ingredient := jsonb_build_object(
      'status', 'unavailable',
      'reason', coalesce(v_ingredient_raw->>'reason', v_ingredient_raw->>'status'),
      'options', '[]'::jsonb
    );
  elsif (v_drink->>'drink_mode') = 'named_catalog' then
    select * into v_offer from public.bounty_slot_offers where id = (v_ingredient_raw->>'offer_id')::uuid;
    select * into v_slot from public.bounty_slots where id = (v_ingredient_raw->>'slot_id')::uuid;
    v_match := v_offer.ingredient_id is not null
      and v_offer.exposed_at_utc is not null
      and public.drinkit_offering_has_ingredient(
        v_catalog,
        (v_drink->>'offering_id')::uuid,
        v_offer.ingredient_id,
        v_confirm_ingredient_id
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
         and public.drinkit_offering_has_ingredient(
           v_catalog,
           (v_drink->>'offering_id')::uuid,
           v_grace_offer.ingredient_id,
           v_confirm_ingredient_id
         ) then
        v_options := v_options || jsonb_build_array(
          public.drinkit_offer_option(v_grace_offer, v_grace_slot, 'grace_previous')
        );
      end if;
    end if;
    if jsonb_array_length(v_options) > 0 then
      v_ingredient := jsonb_build_object('status', 'eligible', 'reason', null, 'options', v_options);
    else
      -- Confirmable hint for Review mismatch link (current offer only; not promotional).
      select coalesce(v_offer.display_snapshot->>'display_name', i.canonical_key)
        into v_ing_display
      from public.ingredients i
      where i.id = v_offer.ingredient_id;
      v_confirmable := jsonb_build_object(
        'offer_id', v_offer.id,
        'ingredient_id', v_offer.ingredient_id,
        'ingredient_key', (
          select i.canonical_key from public.ingredients i where i.id = v_offer.ingredient_id
        ),
        'ingredient_display_name', v_ing_display,
        'offering_id', v_drink->>'offering_id',
        'drink_display_name', v_drink->>'drink_display_name',
        'bar_canonical_key', v_drink->>'bar_canonical_key'
      );
      v_ingredient := jsonb_build_object(
        'status', 'unavailable',
        'reason', 'ingredient_not_in_offering',
        'options', '[]'::jsonb,
        'confirmable', v_confirmable
      );
    end if;
  elsif (v_drink->>'drink_mode') = 'unlisted_named'
        and v_unlisted_key is not null
        and (v_drink->>'drink_kind') is not distinct from 'named_cocktail' then
    -- Per-submission honor only — no shared correction without offering_id.
    select * into v_offer from public.bounty_slot_offers where id = (v_ingredient_raw->>'offer_id')::uuid;
    select * into v_slot from public.bounty_slots where id = (v_ingredient_raw->>'slot_id')::uuid;
    if v_offer.ingredient_id is not null
       and v_offer.exposed_at_utc is not null
       and exists (
         select 1 from public.ingredients i
         where i.id = v_offer.ingredient_id
           and i.canonical_key = lower(v_unlisted_key)
       ) then
      v_ingredient := jsonb_build_object(
        'status', 'eligible',
        'reason', null,
        'options', jsonb_build_array(public.drinkit_offer_option(v_offer, v_slot, 'current')),
        'via', 'unlisted_honor_confirm'
      );
    else
      v_ingredient := jsonb_build_object(
        'status', 'unavailable',
        'reason', 'unlisted_ingredient_key_mismatch',
        'options', '[]'::jsonb
      );
    end if;
  else
    v_ingredient := jsonb_build_object('status', 'unavailable', 'reason', 'named_catalog_required', 'options', '[]'::jsonb);
  end if;

  -- Bar
  if (v_claimed @> array['bar']) then
    v_bar := jsonb_build_object('status', 'already_claimed', 'reason', 'category_used_today', 'options', '[]'::jsonb);
  elsif v_bar_eligible_count < 1 then
    v_bar := jsonb_build_object(
      'status', 'unavailable',
      'reason', 'bar_eligible_companion_required',
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
      v_bar := jsonb_build_object('status', 'unavailable', 'reason', 'no_bar_assignment', 'options', '[]'::jsonb);
    elsif v_bar_row.bar_id is distinct from (v_drink->>'bar_id')::uuid then
      v_bar := jsonb_build_object('status', 'unavailable', 'reason', 'not_featured_bar', 'options', '[]'::jsonb);
    elsif (v_drink->>'alcoholic')::boolean is not true then
      v_bar := jsonb_build_object('status', 'unavailable', 'reason', 'nonalcoholic', 'options', '[]'::jsonb);
    else
      v_bar_points := public.drinkit_bar_points(v_bar_eligible_count);
      v_bar := jsonb_build_object(
        'status', 'eligible',
        'reason', null,
        'options', jsonb_build_array(jsonb_build_object(
          'category', 'bar',
          'assignment_id', v_bar_row.id,
          'bar_canonical_key', v_bar_row.bar_canonical_key,
          'bar_display_name', v_bar_row.bar_display_name,
          'points', v_bar_points,
          'companion_count', v_bar_eligible_count,
          'bar_eligible_companion_ids', to_jsonb(v_bar_eligible),
          'source', 'daily'
        ))
      );
    end if;
  end if;

  v_daily := jsonb_build_object('status', 'unavailable', 'reason', 'separate_submission_path', 'options', '[]'::jsonb);
  if (v_claimed @> array['daily']) then
    v_daily := jsonb_build_object('status', 'already_claimed', 'reason', 'category_used_today', 'options', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'ok', true,
    'lifecycle', v_life,
    'cruise_config_id', v_config.id,
    'catalog_version_id', v_catalog,
    'cruise_day', (v_life->>'cruise_day')::int,
    'received_at_utc', p_at_utc,
    'companion_player_ids', to_jsonb(v_companions),
    'bar_eligible_companion_ids', to_jsonb(v_bar_eligible),
    'companion_count', v_comp_count,
    'bar_eligible_count', v_bar_eligible_count,
    'drink', v_drink,
    'confirm_contains_ingredient_key', v_confirm_key,
    'unlisted_contains_ingredient_key', v_unlisted_key,
    'confirm_featured_cocktail', v_confirm_featured,
    'categories', jsonb_build_object(
      'cocktail', v_cocktail,
      'ingredient', v_ingredient,
      'bar', v_bar,
      'daily', v_daily
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Submit core: atomic correction persistence
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_submit_drink_core(
  p_player_id uuid,
  p_payload jsonb,
  p_receipt_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key uuid;
  v_fp jsonb;
  v_hash text;
  v_canonical jsonb;
  v_existing public.submissions%rowtype;
  v_eval jsonb;
  v_life jsonb;
  v_validated jsonb;
  v_claims jsonb;
  v_claim jsonb;
  v_drink jsonb;
  v_companions uuid[];
  v_bar_eligible uuid[];
  v_submission_id uuid;
  v_gallery_id uuid;
  v_total integer := 0;
  v_awarded jsonb := '[]'::jsonb;
  v_result jsonb;
  v_cruise uuid;
  v_day integer;
  v_caption text;
  v_photo text;
  v_display jsonb;
  v_has_existing boolean := false;
  v_cat text;
  v_confirm_key text;
  v_confirm_ingredient_id uuid;
  v_correction_id uuid;
  v_awarded_ingredient boolean := false;
begin
  begin
    v_key := (p_payload->>'idempotency_key')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'INVALID_IDEMPOTENCY_KEY', 'message', 'idempotency_key required');
  end;
  if v_key is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_IDEMPOTENCY_KEY', 'message', 'idempotency_key required');
  end if;

  if p_payload ? 'points' or p_payload ? 'score' or p_payload ? 'author_player_id'
     or p_payload ? 'received_at_utc' or p_payload ? 'ship_day' or p_payload ? 'player_id' then
    return jsonb_build_object(
      'ok', false,
      'code', 'FORGED_FIELDS',
      'message', 'Client must not supply score, identity, or timestamp authority fields'
    );
  end if;

  -- Deterministic fingerprint from client request only (no live game state).
  v_fp := public.drinkit_request_fingerprint(p_payload);
  v_canonical := v_fp->'canonical';
  v_hash := v_fp->>'hash';

  perform pg_advisory_xact_lock(hashtext(p_player_id::text));

  select * into v_existing
  from public.submissions
  where author_player_id = p_player_id
    and idempotency_key = v_key
  for update;
  v_has_existing := found;

  -- CRITICAL: return original result before any eligibility / pause / finale revalidation.
  if v_has_existing then
    if v_existing.request_payload_hash is distinct from v_hash then
      return jsonb_build_object(
        'ok', false,
        'code', 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        'message', 'Same idempotency key with a different payload'
      );
    end if;
    return v_existing.result_json || jsonb_build_object('idempotent_replay', true);
  end if;

  -- New submission only: evaluate current rules.
  begin
    v_eval := public.drinkit_evaluate_eligibility(p_player_id, p_payload, p_receipt_at);
  exception
    when sqlstate '22023' then
      return jsonb_build_object('ok', false, 'code', SQLERRM, 'message', SQLERRM);
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'code', SQLERRM, 'message', SQLERRM);
  end;

  if v_eval->>'ok' is distinct from 'true' then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(v_eval->>'code', 'UNAVAILABLE'),
      'message', coalesce(v_eval->>'message', 'Eligibility unavailable'),
      'preview', v_eval
    );
  end if;

  v_drink := v_eval->'drink';
  select coalesce(array_agg(x::uuid), array[]::uuid[])
    into v_companions
  from jsonb_array_elements_text(coalesce(v_eval->'companion_player_ids', '[]'::jsonb)) as t(x);
  select coalesce(array_agg(x::uuid), array[]::uuid[])
    into v_bar_eligible
  from jsonb_array_elements_text(coalesce(v_eval->'bar_eligible_companion_ids', '[]'::jsonb)) as t(x);

  v_caption := nullif(trim(coalesce(p_payload->>'caption', '')), '');
  v_photo := nullif(trim(coalesce(p_payload->>'photo_storage_key', '')), '');

  v_life := v_eval->'lifecycle';
  if v_life->>'status' = 'paused'
     or exists (select 1 from public.game_control where game = 'drinkit' and status = 'paused') then
    return jsonb_build_object('ok', false, 'code', 'GAME_PAUSED', 'message', 'Drink It! is paused');
  end if;
  if v_life->>'status' = 'finale' then
    return jsonb_build_object('ok', false, 'code', 'GAME_ENDED', 'message', 'Drink It! is finalized');
  end if;
  if (v_life->>'cruise_day') is null then
    return jsonb_build_object('ok', false, 'code', 'UNAVAILABLE', 'message', 'Outside cruise window');
  end if;

  perform public.ensure_finale_latched(p_receipt_at);
  if exists (
    select 1 from public.game_control where game = 'drinkit' and finalized_at_utc is not null
  ) and p_receipt_at >= (
    select public.ship_local_to_utc(
      ((c.day1_ship_date + (c.final_day - 1)) + time '18:00')::timestamp,
      public.clock_offset_at(c.id, c.base_ship_offset_minutes, p_receipt_at)
    ) from public.cruise_config c where c.is_active limit 1
  ) then
    return jsonb_build_object('ok', false, 'code', 'GAME_ENDED', 'message', 'Drink It! is finalized');
  end if;

  v_validated := public.drinkit_validate_selected_claims(v_eval, p_payload->'selected_claims');
  if v_validated->>'ok' is distinct from 'true' then
    return v_validated || jsonb_build_object('preview', v_eval);
  end if;
  v_claims := v_validated->'claims';

  for v_cat in
    select distinct jsonb_array_elements(v_claims)->>'category'
  loop
    if exists (
      select 1 from public.bounty_claims
      where player_id = p_player_id
        and cruise_config_id = (v_eval->>'cruise_config_id')::uuid
        and game_day = (v_eval->>'cruise_day')::int
        and category = v_cat::public.drinkit_claim_category
        and status = 'active'
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'ALREADY_CLAIMED',
        'message', format('Category %s already claimed today', v_cat),
        'preview', v_eval
      );
    end if;
  end loop;

  v_cruise := (v_eval->>'cruise_config_id')::uuid;
  v_day := (v_eval->>'cruise_day')::int;

  v_display := jsonb_build_object(
    'bar_name', v_drink->>'bar_display_name',
    'drink_name', v_drink->>'drink_display_name',
    'drink_mode', v_drink->>'drink_mode',
    'companions', to_jsonb(v_companions),
    'bar_eligible_companions', to_jsonb(v_bar_eligible),
    'caption', v_caption,
    'catalog_version_id', v_eval->>'catalog_version_id'
  );

  insert into public.gallery_events (game, owner_player_id, kind, submission_id, created_at_utc, active)
  values ('drinkit', p_player_id, 'drink_log', null, p_receipt_at, true)
  returning id into v_gallery_id;

  insert into public.submissions (
    author_player_id, idempotency_key, game, kind, cruise_config_id,
    received_at_utc, ship_day, status, caption, photo_storage_key,
    request_payload_hash, request_payload_json, result_json, display_snapshot_json, gallery_event_id
  ) values (
    p_player_id, v_key, 'drinkit', 'drink_log', v_cruise,
    p_receipt_at, v_day, 'accepted', v_caption, v_photo,
    v_hash, v_canonical, '{}'::jsonb, v_display, v_gallery_id
  )
  returning id into v_submission_id;

  update public.gallery_events set submission_id = v_submission_id where id = v_gallery_id;

  insert into public.drink_logs (
    submission_id, bar_id, bar_canonical_key, bar_display_name, catalog_version_id,
    offering_id, drink_concept_id, drink_mode, drink_display_name, custom_name, generic_type,
    ingredient_snapshot_json
  ) values (
    v_submission_id,
    (v_drink->>'bar_id')::uuid,
    v_drink->>'bar_canonical_key',
    v_drink->>'bar_display_name',
    (v_eval->>'catalog_version_id')::uuid,
    nullif(v_drink->>'offering_id', '')::uuid,
    nullif(v_drink->>'drink_concept_id', '')::uuid,
    (v_drink->>'drink_mode')::public.drink_log_mode,
    v_drink->>'drink_display_name',
    v_drink->>'custom_name',
    v_drink->>'generic_type',
    coalesce(v_drink->'ingredients', '[]'::jsonb)
  );

  if coalesce(array_length(v_companions, 1), 0) > 0 then
    insert into public.drink_log_companions (submission_id, companion_player_id, bar_multiplier_eligible)
    select
      v_submission_id,
      c,
      (c = any (coalesce(v_bar_eligible, array[]::uuid[])))
    from unnest(v_companions) as c;
  end if;

  for v_claim in select * from jsonb_array_elements(v_claims)
  loop
    if v_claim->>'category' = 'bar' then
      insert into public.bounty_claims (
        submission_id, player_id, cruise_config_id, game_day, category,
        bar_assignment_id, points, status, offer_snapshot_json
      ) values (
        v_submission_id, p_player_id, v_cruise, v_day, 'bar',
        (v_claim->>'assignment_id')::uuid,
        (v_claim->>'points')::int,
        'active',
        v_claim
      );
    else
      insert into public.bounty_claims (
        submission_id, player_id, cruise_config_id, game_day, category,
        slot_id, offer_id, points, status, offer_snapshot_json
      ) values (
        v_submission_id, p_player_id, v_cruise, v_day,
        (v_claim->>'category')::public.drinkit_claim_category,
        (v_claim->>'slot_id')::uuid,
        (v_claim->>'offer_id')::uuid,
        (v_claim->>'points')::int,
        'active',
        v_claim
      );
    end if;
    v_total := v_total + (v_claim->>'points')::int;
    v_awarded := v_awarded || jsonb_build_array(jsonb_build_object(
      'category', v_claim->>'category',
      'points', (v_claim->>'points')::int,
      'offer_id', v_claim->>'offer_id',
      'assignment_id', v_claim->>'assignment_id'
    ));
  end loop;


  -- Persist shared correction only when named catalog confirm was used and Ingredient awarded.
  v_confirm_key := nullif(trim(coalesce(p_payload->'drink'->>'confirm_contains_ingredient_key', '')), '');
  if v_confirm_key is not null
     and (v_drink->>'drink_mode') = 'named_catalog'
     and (v_drink->>'offering_id') is not null then
    select exists (
      select 1 from jsonb_array_elements(v_awarded) e
      where e->>'category' = 'ingredient'
    ) into v_awarded_ingredient;
    if v_awarded_ingredient then
      v_confirm_ingredient_id := public.drinkit_resolve_ingredient_key(
        (v_eval->>'catalog_version_id')::uuid,
        v_confirm_key
      );
      if v_confirm_ingredient_id is not null then
        insert into public.ingredient_corrections (
          offering_id, ingredient_id, confirmed_by_player_id, source_submission_id, active
        ) values (
          (v_drink->>'offering_id')::uuid,
          v_confirm_ingredient_id,
          p_player_id,
          v_submission_id,
          true
        )
        on conflict (offering_id, ingredient_id) do update
          set
            -- Keep first source; refresh confirmer only if previously inactive
            active = true,
            deactivated_at_utc = null,
            deactivated_by_player_id = null,
            deactivation_note = null,
            confirmed_by_player_id = coalesce(public.ingredient_corrections.confirmed_by_player_id, excluded.confirmed_by_player_id),
            source_submission_id = coalesce(public.ingredient_corrections.source_submission_id, excluded.source_submission_id)
        returning id into v_correction_id;
      end if;
    end if;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'ACCEPTED',
    'submission_id', v_submission_id,
    'received_at_utc', p_receipt_at,
    'ship_day', v_day,
    'awarded_points', v_total,
    'claimed_categories', v_awarded,
    'gallery_event_id', v_gallery_id,
    'new_achievement_ids', '[]'::jsonb,
    'idempotent_replay', false,
    'ingredient_correction_id', v_correction_id
  );

  update public.submissions set result_json = v_result where id = v_submission_id;
  return v_result;
end;
$$;


comment on function public.drinkit_submit_drink_core(uuid, jsonb, timestamptz) is
  'Phase 3C-A: early replay + Bar eligibility + atomic ingredient_corrections on successful Ingredient award.';
