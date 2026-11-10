-- Phase B2: Bar Bounty claiming uses locked daily crews (B1) for server-authoritative points.
-- Does not change Cocktail / Ingredient / Daily / Ship It! scoring.
-- Historical accepted bounty_claims.points remain as stored; only new awards use crew bands.

-- ---------------------------------------------------------------------------
-- Crew-aware point bands (authoritative for new awards)
-- present_count includes the claimant.
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_bar_crew_points(
  p_crew_size integer,
  p_present_count integer
)
returns integer
language plpgsql
immutable
as $$
begin
  if p_crew_size is null or p_present_count is null then
    return 0;
  end if;
  if p_present_count < 2 then
    return 0;
  end if;
  if p_crew_size = 3 then
    if p_present_count >= 3 then
      return 40;
    end if;
    if p_present_count = 2 then
      return 20;
    end if;
    return 0;
  end if;
  if p_crew_size = 4 then
    if p_present_count >= 4 then
      return 40;
    end if;
    if p_present_count = 3 then
      return 30;
    end if;
    if p_present_count = 2 then
      return 20;
    end if;
    return 0;
  end if;
  return 0;
end;
$$;

comment on function public.drinkit_bar_crew_points(integer, integer) is
  'B2 Bar Bounty points from locked crew size and present assigned members (incl. claimant). Max 40.';

revoke all on function public.drinkit_bar_crew_points(integer, integer) from public;
grant execute on function public.drinkit_bar_crew_points(integer, integer) to service_role;
grant execute on function public.drinkit_bar_crew_points(integer, integer) to authenticated;

comment on function public.drinkit_bar_points(integer) is
  'DEPRECATED for new awards (pre-B2). Historical helper: min(95, 25 + 10×N). Active awards use drinkit_bar_crew_points.';

-- ---------------------------------------------------------------------------
-- Shared Bar evaluation against locked B1 crew snapshot
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_bar_bounty_crew_eval(
  p_player_id uuid,
  p_cruise_config_id uuid,
  p_cruise_day integer,
  p_at_utc timestamptz,
  p_companion_player_ids uuid[],
  p_drink jsonb,
  p_already_claimed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ensure jsonb;
  v_bar_row public.bar_bounties%rowtype;
  v_crew_id uuid;
  v_crew_size integer;
  v_mates uuid[];
  v_selected_mates uuid[];
  v_present integer;
  v_points integer;
  v_companions uuid[] := coalesce(p_companion_player_ids, array[]::uuid[]);
begin
  if p_already_claimed then
    return jsonb_build_object(
      'status', 'already_claimed',
      'reason', 'category_used_today',
      'claimable', false,
      'points', 0,
      'options', '[]'::jsonb
    );
  end if;

  -- Lock today's crews once (B1). Does not reshuffle existing days.
  v_ensure := public.bar_bounty_ensure_crews_at(p_at_utc, null, null);
  if coalesce((v_ensure->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', coalesce(v_ensure->>'code', v_ensure->>'status', 'crew_unavailable'),
      'message', v_ensure->>'message',
      'claimable', false,
      'points', 0,
      'roster_size', (v_ensure->>'roster_size')::int,
      'minimum_roster', coalesce((v_ensure->>'minimum_roster')::int, 7),
      'has_assigned_crew', false,
      'options', '[]'::jsonb
    );
  end if;

  select m.crew_id, c.size
  into v_crew_id, v_crew_size
  from public.bar_bounty_crew_members m
  join public.bar_bounty_crews c on c.id = m.crew_id
  where m.cruise_config_id = p_cruise_config_id
    and m.day_number = p_cruise_day
    and m.player_id = p_player_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'not_in_todays_roster',
      'claimable', false,
      'points', 0,
      'has_assigned_crew', false,
      'cruise_day', p_cruise_day,
      'crew_day_id', v_ensure->>'crew_day_id',
      'options', '[]'::jsonb
    );
  end if;

  v_mates := public.bar_bounty_crew_mate_ids(p_cruise_config_id, p_cruise_day, p_player_id);

  select coalesce(array_agg(x order by x), array[]::uuid[])
  into v_selected_mates
  from (
    select distinct c as x
    from unnest(v_companions) as c
    where c = any (v_mates)
  ) q;

  v_present := coalesce(cardinality(v_selected_mates), 0) + 1;
  v_points := public.drinkit_bar_crew_points(v_crew_size, v_present);

  select * into v_bar_row
  from public.bar_bounties
  where cruise_config_id = p_cruise_config_id
    and day_number = p_cruise_day;

  if not found then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'no_bar_assignment',
      'claimable', false,
      'points', 0,
      'has_assigned_crew', true,
      'crew_id', v_crew_id,
      'crew_size', v_crew_size,
      'qualifying_mate_count', coalesce(cardinality(v_selected_mates), 0),
      'present_count', v_present,
      'options', '[]'::jsonb
    );
  end if;

  if v_bar_row.bar_id is distinct from (p_drink->>'bar_id')::uuid then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'not_featured_bar',
      'claimable', false,
      'points', 0,
      'has_assigned_crew', true,
      'crew_id', v_crew_id,
      'crew_size', v_crew_size,
      'qualifying_mate_count', coalesce(cardinality(v_selected_mates), 0),
      'present_count', v_present,
      'featured_bar_key', v_bar_row.bar_canonical_key,
      'options', '[]'::jsonb
    );
  end if;

  if (p_drink->>'alcoholic')::boolean is not true then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'nonalcoholic',
      'claimable', false,
      'points', 0,
      'has_assigned_crew', true,
      'crew_id', v_crew_id,
      'crew_size', v_crew_size,
      'qualifying_mate_count', coalesce(cardinality(v_selected_mates), 0),
      'present_count', v_present,
      'options', '[]'::jsonb
    );
  end if;

  if v_points < 1 then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', case
        when coalesce(cardinality(v_selected_mates), 0) < 1 then 'solo_or_no_crewmate_selected'
        else 'insufficient_crew_present'
      end,
      'claimable', false,
      'points', 0,
      'has_assigned_crew', true,
      'crew_id', v_crew_id,
      'crew_size', v_crew_size,
      'qualifying_mate_ids', to_jsonb(v_selected_mates),
      'qualifying_mate_count', coalesce(cardinality(v_selected_mates), 0),
      'present_count', v_present,
      'options', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'status', 'eligible',
    'reason', null,
    'claimable', true,
    'points', v_points,
    'has_assigned_crew', true,
    'crew_id', v_crew_id,
    'crew_size', v_crew_size,
    'qualifying_mate_ids', to_jsonb(v_selected_mates),
    'qualifying_mate_count', coalesce(cardinality(v_selected_mates), 0),
    'present_count', v_present,
    'options', jsonb_build_array(jsonb_build_object(
      'category', 'bar',
      'assignment_id', v_bar_row.id,
      'bar_canonical_key', v_bar_row.bar_canonical_key,
      'bar_display_name', v_bar_row.bar_display_name,
      'points', v_points,
      'crew_id', v_crew_id,
      'crew_size', v_crew_size,
      'present_count', v_present,
      'qualifying_mate_count', coalesce(cardinality(v_selected_mates), 0),
      'qualifying_mate_ids', to_jsonb(v_selected_mates),
      'scoring', 'b2-crew-v1',
      'source', 'daily'
    ))
  );
end;
$$;

revoke all on function public.drinkit_bar_bounty_crew_eval(uuid, uuid, integer, timestamptz, uuid[], jsonb, boolean) from public;
grant execute on function public.drinkit_bar_bounty_crew_eval(uuid, uuid, integer, timestamptz, uuid[], jsonb, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Eligibility evaluator: replace Bar branch with crew scoring
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
  v_comp_count integer;
  v_bar_eligible_count integer;
  v_raw_bar_eligible uuid[];
  v_confirm_key text;
  v_confirm_ingredient_id uuid;
  v_unlisted_key text;
  v_confirm_featured boolean;
  v_confirmable jsonb;
  v_ing_display text;
  v_day integer;
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
  v_day := (v_life->>'cruise_day')::int;

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
    and game_day = coalesce(v_day, -1)
    and status = 'active';

  -- Cocktail (unchanged)
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

  -- Ingredient (unchanged)
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

  -- Bar (B2 crew scoring). Lifecycle gate kept before crew eval.
  if v_life->>'status' is distinct from 'open' then
    v_bar := jsonb_build_object(
      'status', 'unavailable',
      'reason', coalesce(v_life->>'reason', v_life->>'status'),
      'claimable', false,
      'points', 0,
      'options', '[]'::jsonb
    );
  else
    v_bar := public.drinkit_bar_bounty_crew_eval(
      p_player_id,
      v_config.id,
      v_day,
      p_at_utc,
      v_companions,
      v_drink,
      (v_claimed @> array['bar'])
    );
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
    'cruise_day', v_day,
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
-- Lightweight player preview for B3 companion selection (no writes / no claims)
-- ---------------------------------------------------------------------------
create or replace function public.preview_my_bar_bounty(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_eval jsonb;
  v_bar jsonb;
  v_payload jsonb;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  if p_payload ? 'points' or p_payload ? 'score' or p_payload ? 'player_id'
     or p_payload ? 'author_player_id' or p_payload ? 'received_at_utc'
     or p_payload ? 'ship_day' or p_payload ? 'cruise_day' or p_payload ? 'crew_id' then
    raise exception 'FORGED_FIELDS' using errcode = '42501';
  end if;

  -- Reuse full evaluator (same rules as submit). Ignore selected_claims for preview.
  v_payload := jsonb_build_object(
    'bar_canonical_key', p_payload->>'bar_canonical_key',
    'drink', coalesce(p_payload->'drink', jsonb_build_object('mode', 'generic_beer')),
    'companion_player_ids', coalesce(p_payload->'companion_player_ids', '[]'::jsonb),
    'bar_eligible_companion_ids', coalesce(
      p_payload->'bar_eligible_companion_ids',
      p_payload->'companion_player_ids',
      '[]'::jsonb
    ),
    'selected_claims', '[]'::jsonb
  );

  begin
    v_eval := public.drinkit_evaluate_eligibility(v_me, v_payload, clock_timestamp());
  exception
    when others then
      return jsonb_build_object(
        'ok', false,
        'code', SQLERRM,
        'awards_points', false,
        'creates_claim', false
      );
  end;

  if coalesce((v_eval->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(v_eval->>'code', 'UNAVAILABLE'),
      'message', v_eval->>'message',
      'awards_points', false,
      'creates_claim', false
    );
  end if;

  v_bar := v_eval->'categories'->'bar';

  return jsonb_build_object(
    'ok', true,
    'awards_points', false,
    'creates_claim', false,
    'cruise_day', (v_eval->>'cruise_day')::int,
    'has_assigned_crew', coalesce((v_bar->>'has_assigned_crew')::boolean, false),
    'crew_id', v_bar->>'crew_id',
    'crew_size', (v_bar->>'crew_size')::int,
    'qualifying_mate_count', coalesce((v_bar->>'qualifying_mate_count')::int, 0),
    'present_count', coalesce((v_bar->>'present_count')::int, 0),
    'claimable', coalesce((v_bar->>'claimable')::boolean, false),
    'already_claimed', (v_bar->>'status') = 'already_claimed',
    'points', coalesce((v_bar->>'points')::int, 0),
    'status', v_bar->>'status',
    'reason', v_bar->>'reason',
    'message', v_bar->>'message',
    'featured_bar_key', v_bar->>'featured_bar_key',
    'assignment_id', v_bar->'options'->0->>'assignment_id',
    'scoring', 'b2-crew-v1'
  );
end;
$$;

revoke all on function public.preview_my_bar_bounty(jsonb) from public;
grant execute on function public.preview_my_bar_bounty(jsonb) to authenticated;
grant execute on function public.preview_my_bar_bounty(jsonb) to service_role;

create or replace function public.dev_preview_my_bar_bounty_at(
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
  v_eval jsonb;
  v_bar jsonb;
  v_payload jsonb;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found or v_config.label is distinct from 'development-only' then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;

  v_payload := jsonb_build_object(
    'bar_canonical_key', p_payload->>'bar_canonical_key',
    'drink', coalesce(p_payload->'drink', jsonb_build_object('mode', 'generic_beer')),
    'companion_player_ids', coalesce(p_payload->'companion_player_ids', '[]'::jsonb),
    'bar_eligible_companion_ids', coalesce(
      p_payload->'bar_eligible_companion_ids',
      p_payload->'companion_player_ids',
      '[]'::jsonb
    ),
    'selected_claims', '[]'::jsonb
  );

  begin
    v_eval := public.drinkit_evaluate_eligibility(p_player_id, v_payload, p_at_utc);
  exception
    when others then
      return jsonb_build_object('ok', false, 'code', SQLERRM, 'awards_points', false, 'creates_claim', false);
  end;

  if coalesce((v_eval->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(v_eval->>'code', 'UNAVAILABLE'),
      'message', v_eval->>'message',
      'awards_points', false,
      'creates_claim', false
    );
  end if;

  v_bar := v_eval->'categories'->'bar';
  return jsonb_build_object(
    'ok', true,
    'awards_points', false,
    'creates_claim', false,
    'cruise_day', (v_eval->>'cruise_day')::int,
    'has_assigned_crew', coalesce((v_bar->>'has_assigned_crew')::boolean, false),
    'crew_id', v_bar->>'crew_id',
    'crew_size', (v_bar->>'crew_size')::int,
    'qualifying_mate_count', coalesce((v_bar->>'qualifying_mate_count')::int, 0),
    'present_count', coalesce((v_bar->>'present_count')::int, 0),
    'claimable', coalesce((v_bar->>'claimable')::boolean, false),
    'already_claimed', (v_bar->>'status') = 'already_claimed',
    'points', coalesce((v_bar->>'points')::int, 0),
    'status', v_bar->>'status',
    'reason', v_bar->>'reason',
    'assignment_id', v_bar->'options'->0->>'assignment_id',
    'scoring', 'b2-crew-v1'
  );
end;
$$;

revoke all on function public.dev_preview_my_bar_bounty_at(uuid, jsonb, timestamptz) from public;
grant execute on function public.dev_preview_my_bar_bounty_at(uuid, jsonb, timestamptz) to service_role;
