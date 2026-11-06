-- Phase 4B4: optional photo_id on submit_drink with atomic bind.
-- Legacy no-photo fingerprints stay identical (photo_id omitted when null).

create or replace function public.drinkit_request_fingerprint(p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text;
  v_canonical jsonb;
  v_hash text;
  v_photo_id text;
begin
  v_key := nullif(trim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_photo_id := nullif(trim(coalesce(p_payload->>'photo_id', '')), '');
  v_canonical := jsonb_build_object(
    'idempotency_key', v_key,
    'bar_canonical_key', lower(trim(coalesce(p_payload->>'bar_canonical_key', ''))),
    'drink', coalesce(p_payload->'drink', '{}'::jsonb),
    'companion_player_ids', public.drinkit_sorted_id_array(p_payload->'companion_player_ids'),
    'bar_eligible_companion_ids', public.drinkit_sorted_id_array(p_payload->'bar_eligible_companion_ids'),
    'selected_claims', public.drinkit_sorted_selected_claims(p_payload->'selected_claims'),
    'caption', nullif(trim(coalesce(p_payload->>'caption', '')), ''),
    -- Preserve legacy field: clients must send null / omit; non-null is rejected in submit.
    'photo_storage_key', nullif(trim(coalesce(p_payload->>'photo_storage_key', '')), '')
  );
  -- Only include photo_id when present so pre-4B4 no-photo hashes still match.
  if v_photo_id is not null then
    v_canonical := v_canonical || jsonb_build_object('photo_id', v_photo_id);
  end if;
  v_hash := public.drinkit_canonical_request_hash(v_canonical);
  return jsonb_build_object('canonical', v_canonical, 'hash', v_hash);
end;
$$;

revoke all on function public.drinkit_request_fingerprint(jsonb) from public;
grant execute on function public.drinkit_request_fingerprint(jsonb) to service_role;

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
  v_photo_path text;
  v_photo_id uuid;
  v_photo_lock jsonb;
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

  -- Client must not forge Storage paths; only nullable photo_id is accepted.
  if nullif(trim(coalesce(p_payload->>'photo_storage_key', '')), '') is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'FORGED_PHOTO_PATH',
      'message', 'Use photo_id from staging; photo_storage_key is not accepted'
    );
  end if;

  begin
    v_photo_id := nullif(trim(coalesce(p_payload->>'photo_id', '')), '')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_INVALID', 'message', 'photo_id must be a UUID');
  end;

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

  -- Optional photo: lock before any scoring writes so failure leaves photo unbound.
  v_photo_path := null;
  if v_photo_id is not null then
    v_photo_lock := public.drinkit_lock_staged_photo_for_bind(v_photo_id, p_player_id, 'drink_log');
    if coalesce((v_photo_lock->>'ok')::boolean, false) is not true then
      return jsonb_build_object(
        'ok', false,
        'code', coalesce(v_photo_lock->>'code', 'PHOTO_INVALID'),
        'message', 'Optional photo could not be attached'
      );
    end if;
    v_photo_path := v_photo_lock->>'storage_path';
  end if;

  v_cruise := (v_eval->>'cruise_config_id')::uuid;
  v_day := (v_eval->>'cruise_day')::int;

  v_display := jsonb_build_object(
    'bar_name', v_drink->>'bar_display_name',
    'drink_name', v_drink->>'drink_display_name',
    'drink_mode', v_drink->>'drink_mode',
    'companions', to_jsonb(v_companions),
    'bar_eligible_companions', to_jsonb(v_bar_eligible),
    'caption', v_caption,
    'catalog_version_id', v_eval->>'catalog_version_id',
    'photo_id', v_photo_id
  );

  begin
    insert into public.gallery_events (game, owner_player_id, kind, submission_id, created_at_utc, active)
    values ('drinkit', p_player_id, 'drink_log', null, p_receipt_at, true)
    returning id into v_gallery_id;

    insert into public.submissions (
      author_player_id, idempotency_key, game, kind, cruise_config_id,
      received_at_utc, ship_day, status, caption, photo_storage_key,
      request_payload_hash, request_payload_json, result_json, display_snapshot_json, gallery_event_id
    ) values (
      p_player_id, v_key, 'drinkit', 'drink_log', v_cruise,
      p_receipt_at, v_day, 'accepted', v_caption, v_photo_path,
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
          v_correction_id := public.drinkit_persist_ingredient_correction(
            (v_drink->>'offering_id')::uuid,
            v_confirm_ingredient_id,
            p_player_id,
            v_submission_id
          );
        end if;
      end if;
    end if;

    if v_photo_id is not null then
      update public.photos
      set status = 'bound',
          bound_submission_id = v_submission_id,
          bound_at_utc = clock_timestamp(),
          storage_cleanup_status = 'not_needed'
      where id = v_photo_id
        and status = 'staged';
      if not found then
        raise exception 'PHOTO_BIND_FAILED' using errcode = 'P0001';
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
      'ingredient_correction_id', v_correction_id,
      'photo_id', v_photo_id
    );

    update public.submissions set result_json = v_result where id = v_submission_id;
  exception
    when unique_violation then
      return jsonb_build_object(
        'ok', false,
        'code', 'CONFLICT',
        'message', 'Could not save this drink log'
      );
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'code', SQLERRM);
  end;

  return v_result;
end;
$$;

comment on function public.drinkit_submit_drink_core(uuid, jsonb, timestamptz) is
  'Phase 4B4: early replay + optional drink_log photo bind + ingredient corrections.';
