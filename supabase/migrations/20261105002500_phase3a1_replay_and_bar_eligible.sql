-- Phase 3A.1: idempotent replay before eligibility revalidation;
-- Bar multiplier uses self-reported bar_eligible_companion_ids (honor system).

-- ---------------------------------------------------------------------------
-- Persist which companions counted toward the Bar multiplier (audit / replay)
-- ---------------------------------------------------------------------------
alter table public.drink_log_companions
  add column if not exists bar_multiplier_eligible boolean not null default false;

comment on column public.drink_log_companions.bar_multiplier_eligible is
  'Honor-system: companion counted toward Bar points at gathering time. Independent of claim status at submit.';

-- ---------------------------------------------------------------------------
-- Deterministic request fingerprint (no catalog/membership/clock dependence)
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_sorted_id_array(p_arr jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_agg(to_jsonb(x) order by x),
    '[]'::jsonb
  )
  from (
    select distinct nullif(trim(value), '') as x
    from jsonb_array_elements_text(coalesce(p_arr, '[]'::jsonb))
    where nullif(trim(value), '') is not null
  ) s;
$$;

create or replace function public.drinkit_sorted_selected_claims(p_claims jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_agg(elem order by elem->>'category', coalesce(elem->>'offer_id', ''), coalesce(elem->>'assignment_id', '')),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(p_claims, '[]'::jsonb)) as t(elem);
$$;

create or replace function public.drinkit_request_fingerprint(p_payload jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_key text;
  v_canonical jsonb;
  v_hash text;
begin
  v_key := nullif(trim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_canonical := jsonb_build_object(
    'idempotency_key', v_key,
    'bar_canonical_key', lower(trim(coalesce(p_payload->>'bar_canonical_key', ''))),
    'drink', coalesce(p_payload->'drink', '{}'::jsonb),
    'companion_player_ids', public.drinkit_sorted_id_array(p_payload->'companion_player_ids'),
    'bar_eligible_companion_ids', public.drinkit_sorted_id_array(p_payload->'bar_eligible_companion_ids'),
    'selected_claims', public.drinkit_sorted_selected_claims(p_payload->'selected_claims'),
    'caption', nullif(trim(coalesce(p_payload->>'caption', '')), ''),
    'photo_storage_key', nullif(trim(coalesce(p_payload->>'photo_storage_key', '')), '')
  );
  v_hash := public.drinkit_canonical_request_hash(v_canonical);
  return jsonb_build_object('canonical', v_canonical, 'hash', v_hash);
end;
$$;

revoke all on function public.drinkit_sorted_id_array(jsonb) from public;
revoke all on function public.drinkit_sorted_selected_claims(jsonb) from public;
revoke all on function public.drinkit_request_fingerprint(jsonb) from public;
grant execute on function public.drinkit_sorted_id_array(jsonb) to service_role;
grant execute on function public.drinkit_sorted_selected_claims(jsonb) to service_role;
grant execute on function public.drinkit_request_fingerprint(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Normalize bar-eligible companions: subset of presence companions
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_normalize_bar_eligible(
  p_presence uuid[],
  p_bar_eligible_ids uuid[]
)
returns uuid[]
language plpgsql
stable
as $$
declare
  v_ids uuid[] := coalesce(p_bar_eligible_ids, array[]::uuid[]);
  v_out uuid[] := array[]::uuid[];
  v_id uuid;
begin
  foreach v_id in array v_ids loop
    if v_id is null then
      raise exception 'INVALID_BAR_ELIGIBLE_COMPANION' using errcode = '22023';
    end if;
    if v_id = any (v_out) then
      continue;
    end if;
    if not (v_id = any (p_presence)) then
      raise exception 'BAR_ELIGIBLE_NOT_SUBSET' using errcode = '22023';
    end if;
    v_out := array_append(v_out, v_id);
  end loop;
  return v_out;
end;
$$;

revoke all on function public.drinkit_normalize_bar_eligible(uuid[], uuid[]) from public;
grant execute on function public.drinkit_normalize_bar_eligible(uuid[], uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- Replace evaluator: Bar points from bar_eligible_companion_ids
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

  select coalesce(array_agg(category::text), array[]::text[])
    into v_claimed
  from public.bounty_claims
  where player_id = p_player_id
    and cruise_config_id = v_config.id
    and game_day = coalesce((v_life->>'cruise_day')::int, -1)
    and status = 'active';

  -- Cocktail (presence companions)
  v_options := '[]'::jsonb;
  v_cocktail_raw := public.bounty_resolve_at('cocktail', p_at_utc, true, true);
  if (v_claimed @> array['cocktail']) then
    v_cocktail := jsonb_build_object('status', 'already_claimed', 'reason', 'category_used_today', 'options', '[]'::jsonb);
  elsif v_comp_count < 1 then
    v_cocktail := jsonb_build_object('status', 'unavailable', 'reason', 'companion_required', 'options', '[]'::jsonb);
  elsif (v_drink->>'drink_mode') is distinct from 'named_catalog' then
    v_cocktail := jsonb_build_object('status', 'unavailable', 'reason', 'named_catalog_required', 'options', '[]'::jsonb);
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
      v_cocktail := jsonb_build_object('status', 'unavailable', 'reason', 'drink_or_bar_mismatch', 'options', '[]'::jsonb);
    end if;
  end if;

  -- Ingredient (presence companions)
  v_options := '[]'::jsonb;
  v_ingredient_raw := public.bounty_resolve_at('ingredient', p_at_utc, true, true);
  if (v_claimed @> array['ingredient']) then
    v_ingredient := jsonb_build_object('status', 'already_claimed', 'reason', 'category_used_today', 'options', '[]'::jsonb);
  elsif v_comp_count < 1 then
    v_ingredient := jsonb_build_object('status', 'unavailable', 'reason', 'companion_required', 'options', '[]'::jsonb);
  elsif (v_drink->>'drink_mode') is distinct from 'named_catalog' then
    v_ingredient := jsonb_build_object('status', 'unavailable', 'reason', 'named_catalog_required', 'options', '[]'::jsonb);
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
      v_ingredient := jsonb_build_object('status', 'unavailable', 'reason', 'ingredient_not_in_offering', 'options', '[]'::jsonb);
    end if;
  end if;

  -- Bar (bar-eligible companions only — honor-system subset)
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
-- Submit core: fingerprint + early replay BEFORE eligibility revalidation
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
    'idempotent_replay', false
  );

  update public.submissions set result_json = v_result where id = v_submission_id;
  return v_result;
end;
$$;

comment on function public.drinkit_submit_drink_core(uuid, jsonb, timestamptz) is
  'Phase 3A.1: early idempotent replay via deterministic fingerprint; Bar uses bar_eligible_companion_ids.';
