-- Phase 3A: preview_drink_claims + submit_drink (+ service_role timed helpers).

create or replace function public.preview_drink_claims(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid := public.current_player_id();
  v_eval jsonb;
begin
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game('drinkit'::public.game_id) and not public.is_admin() then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  v_eval := public.drinkit_evaluate_eligibility(v_player, p_payload, clock_timestamp());
  -- Preview never awards; strip nothing — categories already non-scoring.
  return jsonb_build_object(
    'ok', v_eval->>'ok' = 'true',
    'code', case when v_eval->>'ok' = 'true' then 'PREVIEW' else v_eval->>'code' end,
    'preview', v_eval,
    'awards_points', false,
    'creates_submission', false
  );
end;
$$;

create or replace function public.dev_preview_drink_claims_at(
  p_payload jsonb,
  p_at_utc timestamptz,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eval jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;
  v_eval := public.drinkit_evaluate_eligibility(p_player_id, p_payload, p_at_utc);
  return jsonb_build_object(
    'ok', v_eval->>'ok' = 'true',
    'code', 'PREVIEW',
    'preview', v_eval,
    'awards_points', false,
    'creates_submission', false
  );
end;
$$;

-- Validate selected_claims against eligibility; returns claims to award or raises/returns error jsonb.
create or replace function public.drinkit_validate_selected_claims(
  p_eval jsonb,
  p_selected jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sel jsonb;
  v_cat text;
  v_offer_id uuid;
  v_assignment_id uuid;
  v_cat_state jsonb;
  v_opt jsonb;
  v_found boolean;
  v_awarded jsonb := '[]'::jsonb;
  v_selected jsonb := coalesce(p_selected, '[]'::jsonb);
begin
  if jsonb_typeof(v_selected) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SELECTION', 'message', 'selected_claims must be an array');
  end if;

  for v_sel in select * from jsonb_array_elements(v_selected)
  loop
    v_cat := v_sel->>'category';
    if v_cat = 'daily' then
      return jsonb_build_object(
        'ok', false,
        'code', 'ELIGIBILITY_CHANGED',
        'message', 'Daily Challenge cannot be claimed through submit_drink'
      );
    end if;
    if v_cat not in ('cocktail', 'ingredient', 'bar') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_SELECTION', 'message', 'Unknown claim category');
    end if;

    v_cat_state := p_eval->'categories'->v_cat;
    if v_cat_state->>'status' is distinct from 'eligible' then
      return jsonb_build_object(
        'ok', false,
        'code', 'ELIGIBILITY_CHANGED',
        'message', format('Category %s is not currently eligible', v_cat),
        'category', v_cat,
        'category_status', v_cat_state
      );
    end if;

    v_found := false;
    if v_cat = 'bar' then
      begin
        v_assignment_id := (v_sel->>'assignment_id')::uuid;
      exception when others then
        v_assignment_id := null;
      end;
      for v_opt in select * from jsonb_array_elements(coalesce(v_cat_state->'options', '[]'::jsonb))
      loop
        if (v_opt->>'assignment_id')::uuid = v_assignment_id then
          v_found := true;
          v_awarded := v_awarded || jsonb_build_array(v_opt || jsonb_build_object('category', 'bar'));
          exit;
        end if;
      end loop;
    else
      begin
        v_offer_id := (v_sel->>'offer_id')::uuid;
      exception when others then
        v_offer_id := null;
      end;
      for v_opt in select * from jsonb_array_elements(coalesce(v_cat_state->'options', '[]'::jsonb))
      loop
        if (v_opt->>'offer_id')::uuid = v_offer_id then
          v_found := true;
          v_awarded := v_awarded || jsonb_build_array(v_opt);
          exit;
        end if;
      end loop;
    end if;

    if not v_found then
      return jsonb_build_object(
        'ok', false,
        'code', 'ELIGIBILITY_CHANGED',
        'message', format('Selected %s offer is no longer valid', v_cat),
        'category', v_cat
      );
    end if;
  end loop;

  if exists (
    select 1
    from (
      select value->>'category' as c
      from jsonb_array_elements(v_awarded)
    ) s
    group by c
    having count(*) > 1
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_SELECTION',
      'message', 'At most one claim per category'
    );
  end if;

  return jsonb_build_object('ok', true, 'claims', v_awarded);
end;
$$;

revoke all on function public.drinkit_validate_selected_claims(jsonb, jsonb) from public;
grant execute on function public.drinkit_validate_selected_claims(jsonb, jsonb) to service_role;

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

  perform pg_advisory_xact_lock(hashtext(p_player_id::text));

  select * into v_existing
  from public.submissions
  where author_player_id = p_player_id
    and idempotency_key = v_key
  for update;
  v_has_existing := found;

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

  v_caption := nullif(trim(coalesce(p_payload->>'caption', '')), '');
  v_photo := nullif(trim(coalesce(p_payload->>'photo_storage_key', '')), '');

  v_canonical := jsonb_build_object(
    'idempotency_key', v_key,
    'bar_canonical_key', v_drink->>'bar_canonical_key',
    'drink', p_payload->'drink',
    'companion_player_ids', to_jsonb(v_companions),
    'selected_claims', coalesce(p_payload->'selected_claims', '[]'::jsonb),
    'caption', v_caption,
    'photo_storage_key', v_photo
  );
  v_hash := public.drinkit_canonical_request_hash(v_canonical);

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

  -- Pre-check daily uniqueness so we never partially write on conflict.
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
    insert into public.drink_log_companions (submission_id, companion_player_id)
    select v_submission_id, unnest(v_companions);
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

revoke all on function public.drinkit_submit_drink_core(uuid, jsonb, timestamptz) from public;
grant execute on function public.drinkit_submit_drink_core(uuid, jsonb, timestamptz) to service_role;

create or replace function public.submit_drink(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid := public.current_player_id();
  v_receipt timestamptz := clock_timestamp();
begin
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;
  return public.drinkit_submit_drink_core(v_player, p_payload, v_receipt);
end;
$$;

create or replace function public.dev_submit_drink_at(
  p_payload jsonb,
  p_at_utc timestamptz,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;
  return public.drinkit_submit_drink_core(p_player_id, p_payload, p_at_utc);
end;
$$;

revoke all on function public.preview_drink_claims(jsonb) from public;
revoke all on function public.submit_drink(jsonb) from public;
revoke all on function public.dev_preview_drink_claims_at(jsonb, timestamptz, uuid) from public;
revoke all on function public.dev_submit_drink_at(jsonb, timestamptz, uuid) from public;

grant execute on function public.preview_drink_claims(jsonb) to authenticated;
grant execute on function public.submit_drink(jsonb) to authenticated;
grant execute on function public.dev_preview_drink_claims_at(jsonb, timestamptz, uuid) to service_role;
grant execute on function public.dev_submit_drink_at(jsonb, timestamptz, uuid) to service_role;

comment on function public.preview_drink_claims(jsonb) is
  'Player Review preview. Recalculates eligibility; does not score or persist.';
comment on function public.submit_drink(jsonb) is
  'Atomic Drink It! drink log + selected bounty claims. Server receipt time; idempotent by author+key.';
