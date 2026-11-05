-- Phase 4A gate: concurrent Admin Skip same-UUID must return the original result.
-- Does not change skip scoring, history, reserve selection, or pause/prealloc behavior.

create or replace function public.drinkit_admin_skip_bounty_core(
  p_actor_id uuid,
  p_category public.bounty_category,
  p_expected_offer_id uuid,
  p_client_request_id uuid,
  p_at_utc timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fp text;
  v_existing public.admin_bounty_skip_requests%rowtype;
  v_slot_info jsonb;
  v_config_id uuid;
  v_catalog uuid;
  v_slot_id uuid;
  v_offer public.bounty_slot_offers%rowtype;
  v_slot public.bounty_slots%rowtype;
  v_reserve_count integer;
  v_pick_offering uuid;
  v_pick_ingredient uuid;
  v_concept uuid;
  v_key text;
  v_tier text;
  v_points integer;
  v_snap jsonb;
  v_bar_key text;
  v_bar_name text;
  v_drink_name text;
  v_ing_name text;
  v_bar_count integer;
  v_new_offer_id uuid;
  v_result jsonb;
begin
  if p_client_request_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_ID');
  end if;
  if p_category is null or p_category not in ('cocktail', 'ingredient') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CATEGORY');
  end if;
  if p_expected_offer_id is null then
    return jsonb_build_object('ok', false, 'code', 'EXPECTED_OFFER_REQUIRED');
  end if;

  v_fp := public.bounty_skip_fingerprint(p_category, p_expected_offer_id);

  -- Serialize concurrent retries that share the same client_request_id so the
  -- loser always observes the durable ledger row and returns the original result
  -- (never STALE_OFFER / unique_violation from a racing insert).
  perform pg_advisory_xact_lock(
    hashtext('admin_bounty_skip_request'),
    hashtext(p_client_request_id::text)
  );

  select * into v_existing
  from public.admin_bounty_skip_requests
  where client_request_id = p_client_request_id;

  if found then
    if v_existing.fingerprint is distinct from v_fp then
      return jsonb_build_object(
        'ok', false,
        'code', 'REQUEST_ID_OPERATION_MISMATCH',
        'message', 'Same request id was used for a different skip operation'
      );
    end if;
    return v_existing.result_json || jsonb_build_object(
      'idempotent_replay', true,
      'client_request_id', p_client_request_id,
      'received_at_utc', v_existing.received_at_utc,
      'completed_at_utc', v_existing.completed_at_utc
    );
  end if;

  perform public.ensure_finale_latched(p_at_utc);

  v_slot_info := public.bounty_find_public_slot_at(p_category, p_at_utc);
  if coalesce((v_slot_info->>'ok')::boolean, false) is not true then
    v_result := jsonb_build_object(
      'ok', false,
      'code', coalesce(v_slot_info->>'code', 'UNAVAILABLE'),
      'message', case coalesce(v_slot_info->>'code', '')
        when 'FINALE_LOCKED' then 'Skip is closed after Friday 6 PM Ship Time.'
        when 'NO_PUBLIC_SLOT' then 'No current bounty slot to skip.'
        else 'Skip is unavailable right now.'
      end,
      'client_request_id', p_client_request_id
    );
    -- Durable reject so retries do not mutate later state under same id+fp
    insert into public.admin_bounty_skip_requests (
      client_request_id, fingerprint, category, expected_offer_id, actor_id,
      cruise_config_id, result_json, received_at_utc
    ) values (
      p_client_request_id, v_fp, p_category, p_expected_offer_id, p_actor_id,
      null, v_result || jsonb_build_object('idempotent_replay', false), p_at_utc
    );
    return v_result || jsonb_build_object('idempotent_replay', false);
  end if;

  v_config_id := (v_slot_info->>'cruise_config_id')::uuid;
  v_catalog := (v_slot_info->>'catalog_version_id')::uuid;
  v_slot_id := (v_slot_info->>'slot_id')::uuid;

  -- Stale protection: expected offer must still be the active current offer.
  if (v_slot_info->>'offer_id')::uuid is distinct from p_expected_offer_id then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'STALE_OFFER',
      'message', 'The current bounty was already replaced. Refresh and try again if needed.',
      'current_offer_id', v_slot_info->>'offer_id',
      'client_request_id', p_client_request_id
    );
    insert into public.admin_bounty_skip_requests (
      client_request_id, fingerprint, category, expected_offer_id, actor_id,
      cruise_config_id, slot_id, result_json, received_at_utc
    ) values (
      p_client_request_id, v_fp, p_category, p_expected_offer_id, p_actor_id,
      v_config_id, v_slot_id, v_result || jsonb_build_object('idempotent_replay', false), p_at_utc
    );
    return v_result || jsonb_build_object('idempotent_replay', false);
  end if;

  perform pg_advisory_xact_lock(
    hashtext('bounty_skip:' || v_config_id::text),
    hashtext(p_category::text)
  );

  select * into v_slot from public.bounty_slots where id = v_slot_id for update;
  select * into v_offer
  from public.bounty_slot_offers
  where id = v_slot.current_offer_id and is_active is true
  for update;

  if not found or v_offer.id is distinct from p_expected_offer_id then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'STALE_OFFER',
      'message', 'The current bounty was already replaced. Refresh and try again if needed.',
      'client_request_id', p_client_request_id
    );
    insert into public.admin_bounty_skip_requests (
      client_request_id, fingerprint, category, expected_offer_id, actor_id,
      cruise_config_id, slot_id, result_json, received_at_utc
    ) values (
      p_client_request_id, v_fp, p_category, p_expected_offer_id, p_actor_id,
      v_config_id, v_slot_id, v_result || jsonb_build_object('idempotent_replay', false), p_at_utc
    )
    on conflict (client_request_id) do nothing;

    select * into v_existing
    from public.admin_bounty_skip_requests
    where client_request_id = p_client_request_id;
    if found and v_existing.fingerprint is not distinct from v_fp then
      return v_existing.result_json || jsonb_build_object(
        'idempotent_replay', true,
        'client_request_id', p_client_request_id,
        'received_at_utc', v_existing.received_at_utc,
        'completed_at_utc', v_existing.completed_at_utc
      );
    end if;
    return v_result || jsonb_build_object('idempotent_replay', false);
  end if;

  v_reserve_count := public.bounty_unused_reserve_count(v_config_id, v_catalog, p_category);
  if v_reserve_count < 1 then
    v_result := jsonb_build_object(
      'ok', false,
      'code', 'NO_RESERVES',
      'message', 'No unused replacements remain for this bounty.',
      'replacements_remaining', 0,
      'client_request_id', p_client_request_id
    );
    insert into public.admin_bounty_skip_requests (
      client_request_id, fingerprint, category, expected_offer_id, actor_id,
      cruise_config_id, slot_id, retired_offer_id, result_json, received_at_utc
    ) values (
      p_client_request_id, v_fp, p_category, p_expected_offer_id, p_actor_id,
      v_config_id, v_slot_id, v_offer.id,
      v_result || jsonb_build_object('idempotent_replay', false), p_at_utc
    );
    return v_result || jsonb_build_object('idempotent_replay', false);
  end if;

  if p_category = 'cocktail' then
    select cc.offering_id into v_pick_offering
    from public.cocktail_candidates cc
    join public.bar_offerings bo on bo.id = cc.offering_id
    join public.drink_concepts dc on dc.id = bo.drink_concept_id
    where cc.catalog_version_id = v_catalog
      and cc.eligible is true
      and not exists (
        select 1 from public.bounty_slot_offers o
        join public.bounty_slots s on s.id = o.slot_id
        where s.cruise_config_id = v_config_id
          and s.category = 'cocktail'
          and o.canonical_key = dc.canonical_key
      )
      and not exists (
        select 1 from public.bounty_objective_exposures e
        where e.cruise_config_id = v_config_id
          and e.category = 'cocktail'
          and e.canonical_key = dc.canonical_key
      )
    order by md5(cc.offering_id::text || p_client_request_id::text || p_at_utc::text)
    limit 1;

    if v_pick_offering is null then
      return jsonb_build_object('ok', false, 'code', 'NO_RESERVES', 'message', 'No unused replacements remain for this bounty.');
    end if;

    select bo.drink_concept_id, bo.id, dc.canonical_key, cvdc.display_name,
           cc.tier::text, cc.points, b.canonical_key, cvb.name
    into v_concept, v_pick_offering, v_key, v_drink_name, v_tier, v_points, v_bar_key, v_bar_name
    from public.bar_offerings bo
    join public.drink_concepts dc on dc.id = bo.drink_concept_id
    join public.cocktail_candidates cc
      on cc.offering_id = bo.id and cc.catalog_version_id = v_catalog
    join public.bars b on b.id = bo.bar_id
    join public.catalog_version_drink_concepts cvdc
      on cvdc.catalog_version_id = v_catalog and cvdc.drink_concept_id = dc.id
    join public.catalog_version_bars cvb
      on cvb.catalog_version_id = v_catalog and cvb.bar_id = b.id
    where bo.id = v_pick_offering;

    select coalesce(jsonb_agg(jsonb_build_object(
      'ingredient_key', i.canonical_key,
      'display_label', coalesce(coi.display_label, cvi.display_name)
    ) order by coalesce(coi.display_label, cvi.display_name)), '[]'::jsonb)
    into v_snap
    from public.catalog_offering_ingredients coi
    join public.ingredients i on i.id = coi.ingredient_id
    join public.catalog_version_ingredients cvi
      on cvi.catalog_version_id = v_catalog and cvi.ingredient_id = i.id
    where coi.catalog_version_id = v_catalog and coi.offering_id = v_pick_offering;

    v_snap := jsonb_build_object(
      'drink_key', v_key,
      'drink_name', v_drink_name,
      'designated_bar_key', v_bar_key,
      'designated_bar_name', v_bar_name,
      'tier', v_tier,
      'points', v_points,
      'listed_ingredients', coalesce(v_snap, '[]'::jsonb)
    );

    -- Retire current offer (no grace for this revision).
    update public.bounty_slot_offers
    set is_active = false,
        replaced_at_utc = p_at_utc,
        reason = case
          when reason = 'initial' then 'admin_skip'
          else reason || '+admin_skip'
        end
    where id = v_offer.id;

    insert into public.bounty_slot_offers (
      slot_id, catalog_version_id, canonical_key, cocktail_concept_id, cocktail_offering_id,
      tier, points, display_snapshot, is_active, reason, exposed_at_utc
    ) values (
      v_slot_id, v_catalog, v_key, v_concept, v_pick_offering,
      v_tier, v_points, v_snap, true, 'admin_skip_replacement', p_at_utc
    )
    returning id into v_new_offer_id;

  else
    select ic.ingredient_id into v_pick_ingredient
    from public.ingredient_candidates ic
    join public.ingredients i on i.id = ic.ingredient_id
    where ic.catalog_version_id = v_catalog
      and ic.eligible is true
      and not exists (
        select 1 from public.bounty_slot_offers o
        join public.bounty_slots s on s.id = o.slot_id
        where s.cruise_config_id = v_config_id
          and s.category = 'ingredient'
          and o.canonical_key = i.canonical_key
      )
      and not exists (
        select 1 from public.bounty_objective_exposures e
        where e.cruise_config_id = v_config_id
          and e.category = 'ingredient'
          and e.canonical_key = i.canonical_key
      )
    order by md5(ic.ingredient_id::text || p_client_request_id::text || p_at_utc::text)
    limit 1;

    if v_pick_ingredient is null then
      return jsonb_build_object('ok', false, 'code', 'NO_RESERVES', 'message', 'No unused replacements remain for this bounty.');
    end if;

    select i.id, i.canonical_key, cvi.display_name, ic.tier::text, ic.points, ic.known_bar_count
    into v_pick_ingredient, v_key, v_ing_name, v_tier, v_points, v_bar_count
    from public.ingredients i
    join public.ingredient_candidates ic
      on ic.ingredient_id = i.id and ic.catalog_version_id = v_catalog
    join public.catalog_version_ingredients cvi
      on cvi.catalog_version_id = v_catalog and cvi.ingredient_id = i.id
    where i.id = v_pick_ingredient;

    v_snap := jsonb_build_object(
      'ingredient_key', v_key,
      'display_name', v_ing_name,
      'tier', v_tier,
      'points', v_points,
      'known_bar_count', v_bar_count
    );

    update public.bounty_slot_offers
    set is_active = false,
        replaced_at_utc = p_at_utc,
        reason = case
          when reason = 'initial' then 'admin_skip'
          else reason || '+admin_skip'
        end
    where id = v_offer.id;

    insert into public.bounty_slot_offers (
      slot_id, catalog_version_id, canonical_key, ingredient_id,
      tier, points, display_snapshot, is_active, reason, exposed_at_utc
    ) values (
      v_slot_id, v_catalog, v_key, v_pick_ingredient,
      v_tier, v_points, v_snap, true, 'admin_skip_replacement', p_at_utc
    )
    returning id into v_new_offer_id;

    -- Sync public Ingredient card to replacement (current only).
    update public.ingredient_bounty_public_cards
    set exposure_status = 'retired'
    where exposure_status = 'current';

    delete from public.ingredient_bounty_public_cards
    where slot_key = v_slot.slot_key;

    insert into public.ingredient_bounty_public_cards (
      catalog_version_id, ingredient_id, ingredient_canonical_key, display_name,
      tier, points, known_bar_count, exposure_status, slot_key, exposed_at_utc
    ) values (
      v_catalog,
      v_pick_ingredient,
      v_key,
      v_ing_name,
      v_tier::public.ingredient_bounty_tier,
      v_points,
      v_bar_count,
      'current',
      v_slot.slot_key,
      p_at_utc
    );
  end if;

  update public.bounty_slots
  set current_offer_id = v_new_offer_id,
      state = 'current',
      updated_at = now()
  where id = v_slot_id;

  insert into public.bounty_objective_exposures (
    cruise_config_id, category, canonical_key, first_offer_id, first_slot_id, first_exposed_at_utc
  ) values (
    v_config_id, p_category, v_key, v_new_offer_id, v_slot_id, p_at_utc
  )
  on conflict (cruise_config_id, category, canonical_key) do nothing;

  -- Retired offer remains in exposures from its original exposure (nonrepetition).
  insert into public.bounty_objective_exposures (
    cruise_config_id, category, canonical_key, first_offer_id, first_slot_id, first_exposed_at_utc
  ) values (
    v_config_id, p_category, v_offer.canonical_key, v_offer.id, v_slot_id,
    coalesce(v_offer.exposed_at_utc, p_at_utc)
  )
  on conflict (cruise_config_id, category, canonical_key) do nothing;

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'REPLACED',
    'message', 'Bounty replaced.',
    'category', p_category,
    'slot_id', v_slot_id,
    'slot_key', v_slot.slot_key,
    'retired_offer_id', v_offer.id,
    'replacement_offer_id', v_new_offer_id,
    'public_end_utc', v_slot_info->>'public_end_utc',
    'display', v_snap,
    'replacements_remaining', public.bounty_unused_reserve_count(v_config_id, v_catalog, p_category),
    'client_request_id', p_client_request_id,
    'received_at_utc', p_at_utc,
    'idempotent_replay', false
  );

  insert into public.admin_bounty_skip_requests (
    client_request_id, fingerprint, category, expected_offer_id, actor_id,
    cruise_config_id, slot_id, retired_offer_id, replacement_offer_id,
    result_json, received_at_utc
  ) values (
    p_client_request_id, v_fp, p_category, p_expected_offer_id, p_actor_id,
    v_config_id, v_slot_id, v_offer.id, v_new_offer_id,
    v_result, p_at_utc
  );

  perform public.write_admin_audit(
    'bounty.skip_' || p_category::text,
    p_actor_id,
    'bounty_slots',
    v_slot_id::text,
    jsonb_build_object(
      'offer_id', v_offer.id,
      'canonical_key', v_offer.canonical_key,
      'display', v_offer.display_snapshot
    ),
    jsonb_build_object(
      'offer_id', v_new_offer_id,
      'canonical_key', v_key,
      'display', v_snap,
      'client_request_id', p_client_request_id
    )
  );

  return v_result;
end;
$$;

revoke all on function public.drinkit_admin_skip_bounty_core(uuid, public.bounty_category, uuid, uuid, timestamptz) from public;
grant execute on function public.drinkit_admin_skip_bounty_core(uuid, public.bounty_category, uuid, uuid, timestamptz) to service_role;

comment on function public.drinkit_admin_skip_bounty_core(uuid, public.bounty_category, uuid, uuid, timestamptz) is
  'Admin Skip core: request-id advisory lock makes concurrent same-UUID retries return the original durable result.';
