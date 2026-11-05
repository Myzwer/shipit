-- Phase 3C-B: Admin Skip Current Cocktail/Ingredient + correction reactivation gate.
-- Authority: UX §10, Tech Spec §6.5, Game Rules §3.1–3.2.

-- ---------------------------------------------------------------------------
-- Gate: never silently reactivate admin-deactivated ingredient_corrections
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_persist_ingredient_correction(
  p_offering_id uuid,
  p_ingredient_id uuid,
  p_player_id uuid,
  p_submission_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_offering_id is null or p_ingredient_id is null or p_player_id is null then
    return null;
  end if;

  insert into public.ingredient_corrections (
    offering_id, ingredient_id, confirmed_by_player_id, source_submission_id, active
  ) values (
    p_offering_id, p_ingredient_id, p_player_id, p_submission_id, true
  )
  on conflict (offering_id, ingredient_id) do update
    set
      confirmed_by_player_id = coalesce(
        public.ingredient_corrections.confirmed_by_player_id,
        excluded.confirmed_by_player_id
      ),
      source_submission_id = coalesce(
        public.ingredient_corrections.source_submission_id,
        excluded.source_submission_id
      )
    where public.ingredient_corrections.active is true
  returning id into v_id;

  if v_id is null then
    -- Either deactivated (no update) or race; only return id when still active.
    select id into v_id
    from public.ingredient_corrections
    where offering_id = p_offering_id
      and ingredient_id = p_ingredient_id
      and active is true;
  end if;

  return v_id;
end;
$$;

revoke all on function public.drinkit_persist_ingredient_correction(uuid, uuid, uuid, uuid) from public;
grant execute on function public.drinkit_persist_ingredient_correction(uuid, uuid, uuid, uuid) to service_role;

create or replace function public.ingredient_corrections_block_reactivation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.active is false
     and new.active is true then
    new.active := false;
    new.deactivated_at_utc := old.deactivated_at_utc;
    new.deactivated_by_player_id := old.deactivated_by_player_id;
    new.deactivation_note := old.deactivation_note;
    new.confirmed_by_player_id := old.confirmed_by_player_id;
    new.source_submission_id := old.source_submission_id;
  end if;
  return new;
end;
$$;

drop trigger if exists ingredient_corrections_block_reactivation_trg on public.ingredient_corrections;
create trigger ingredient_corrections_block_reactivation_trg
  before update on public.ingredient_corrections
  for each row
  execute function public.ingredient_corrections_block_reactivation();

comment on function public.drinkit_persist_ingredient_correction(uuid, uuid, uuid, uuid) is
  'Phase 3C-B: upsert shared correction only when active; never reactivate admin-deactivated rows.';

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
        v_correction_id := public.drinkit_persist_ingredient_correction(
          (v_drink->>'offering_id')::uuid,
          v_confirm_ingredient_id,
          p_player_id,
          v_submission_id
        );
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
  'Phase 3C-B: early replay + Bar eligibility + atomic ingredient_corrections that never reactivate after admin deactivation.';


-- ---------------------------------------------------------------------------
-- Admin Skip request ledger (idempotency)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_bounty_skip_requests (
  client_request_id uuid primary key,
  fingerprint text not null,
  category public.bounty_category not null,
  expected_offer_id uuid not null,
  actor_id uuid references public.players (id) on delete set null,
  cruise_config_id uuid references public.cruise_config (id) on delete set null,
  slot_id uuid references public.bounty_slots (id) on delete set null,
  retired_offer_id uuid references public.bounty_slot_offers (id) on delete set null,
  replacement_offer_id uuid references public.bounty_slot_offers (id) on delete set null,
  result_json jsonb not null,
  received_at_utc timestamptz not null,
  completed_at_utc timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  constraint admin_bounty_skip_requests_fp_nonempty check (char_length(trim(fingerprint)) > 0)
);

comment on table public.admin_bounty_skip_requests is
  'Idempotent Admin Skip ledger keyed by client_request_id + fingerprint (category+expected_offer).';

create index if not exists admin_bounty_skip_requests_created_idx
  on public.admin_bounty_skip_requests (created_at desc);

alter table public.admin_bounty_skip_requests enable row level security;
alter table public.admin_bounty_skip_requests force row level security;

revoke all on table public.admin_bounty_skip_requests from anon, authenticated;
grant select on table public.admin_bounty_skip_requests to authenticated;

drop policy if exists admin_bounty_skip_requests_select_admin on public.admin_bounty_skip_requests;
create policy admin_bounty_skip_requests_select_admin
  on public.admin_bounty_skip_requests for select to authenticated
  using (public.is_admin());

create or replace function public.bounty_skip_fingerprint(
  p_category public.bounty_category,
  p_expected_offer_id uuid
)
returns text
language sql
immutable
as $$
  select 'bounty_skip:' || p_category::text || ':' || coalesce(p_expected_offer_id::text, 'null');
$$;

revoke all on function public.bounty_skip_fingerprint(public.bounty_category, uuid) from public;
grant execute on function public.bounty_skip_fingerprint(public.bounty_category, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Unused reserve inventory (actual selectable candidates)
-- ---------------------------------------------------------------------------
create or replace function public.bounty_unused_reserve_count(
  p_cruise_config_id uuid,
  p_catalog_version_id uuid,
  p_category public.bounty_category
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_category = 'cocktail' then (
      select count(*)::integer
      from public.cocktail_candidates cc
      join public.bar_offerings bo on bo.id = cc.offering_id
      join public.drink_concepts dc on dc.id = bo.drink_concept_id
      where cc.catalog_version_id = p_catalog_version_id
        and cc.eligible is true
        and not exists (
          select 1
          from public.bounty_slot_offers o
          join public.bounty_slots s on s.id = o.slot_id
          where s.cruise_config_id = p_cruise_config_id
            and s.category = 'cocktail'
            and o.canonical_key = dc.canonical_key
        )
        and not exists (
          select 1 from public.bounty_objective_exposures e
          where e.cruise_config_id = p_cruise_config_id
            and e.category = 'cocktail'
            and e.canonical_key = dc.canonical_key
        )
    )
    else (
      select count(*)::integer
      from public.ingredient_candidates ic
      join public.ingredients i on i.id = ic.ingredient_id
      where ic.catalog_version_id = p_catalog_version_id
        and ic.eligible is true
        and not exists (
          select 1
          from public.bounty_slot_offers o
          join public.bounty_slots s on s.id = o.slot_id
          where s.cruise_config_id = p_cruise_config_id
            and s.category = 'ingredient'
            and o.canonical_key = i.canonical_key
        )
        and not exists (
          select 1 from public.bounty_objective_exposures e
          where e.cruise_config_id = p_cruise_config_id
            and e.category = 'ingredient'
            and e.canonical_key = i.canonical_key
        )
    )
  end;
$$;

revoke all on function public.bounty_unused_reserve_count(uuid, uuid, public.bounty_category) from public;
grant execute on function public.bounty_unused_reserve_count(uuid, uuid, public.bounty_category) to service_role;

-- Locate the public current slot at a ship-time instant (ignores pause; honors finale).
create or replace function public.bounty_find_public_slot_at(
  p_category public.bounty_category,
  p_at_utc timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_control public.game_control%rowtype;
  v_offset integer;
  v_ship timestamp;
  v_ship_date date;
  v_ship_time time;
  v_cruise_day integer;
  v_finale_utc timestamptz;
  v_slot public.bounty_slots%rowtype;
  v_offer public.bounty_slot_offers%rowtype;
  v_end_utc timestamptz;
begin
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_CRUISE');
  end if;

  select * into v_control from public.game_control where game = 'drinkit';
  v_offset := public.clock_offset_at(v_config.id, v_config.base_ship_offset_minutes, p_at_utc);
  v_ship := public.utc_to_ship_local(p_at_utc, v_offset);
  v_ship_date := v_ship::date;
  v_ship_time := v_ship::time;
  v_cruise_day := public.cruise_day_for_ship_date(v_config.day1_ship_date, v_ship_date, v_config.final_day);

  v_finale_utc := public.ship_local_to_utc(
    ((v_config.day1_ship_date + (v_config.final_day - 1)) + time '18:00')::timestamp,
    v_offset
  );

  if p_at_utc >= v_finale_utc or v_control.finalized_at_utc is not null then
    return jsonb_build_object('ok', false, 'code', 'FINALE_LOCKED');
  end if;

  if v_cruise_day is null then
    return jsonb_build_object('ok', false, 'code', 'NO_PUBLIC_SLOT', 'reason', 'outside_cruise');
  end if;

  select * into v_slot
  from public.bounty_slots s
  where s.cruise_config_id = v_config.id
    and s.category = p_category
    and s.ship_date = v_ship_date
    and s.public_start_ship_local <= v_ship_time
    and s.public_end_ship_local > v_ship_time
    and s.state is distinct from 'missed_paused'
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_PUBLIC_SLOT');
  end if;

  select * into v_offer
  from public.bounty_slot_offers
  where id = v_slot.current_offer_id and is_active is true;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_OFFER', 'slot_id', v_slot.id);
  end if;

  v_end_utc := public.ship_local_to_utc(
    (v_slot.ship_date + v_slot.public_end_ship_local)::timestamp,
    v_offset
  );

  return jsonb_build_object(
    'ok', true,
    'cruise_config_id', v_config.id,
    'catalog_version_id', v_slot.catalog_version_id,
    'slot_id', v_slot.id,
    'slot_key', v_slot.slot_key,
    'offer_id', v_offer.id,
    'canonical_key', v_offer.canonical_key,
    'display', v_offer.display_snapshot,
    'public_end_utc', v_end_utc,
    'paused', v_control.status = 'paused'
  );
end;
$$;

revoke all on function public.bounty_find_public_slot_at(public.bounty_category, timestamptz) from public;
grant execute on function public.bounty_find_public_slot_at(public.bounty_category, timestamptz) to service_role;


-- ---------------------------------------------------------------------------
-- Core skip (timed; service_role path + admin path share this)
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- Admin status + skip + reconcile (authenticated admin; server now())
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_bounty_skip_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_cocktail jsonb;
  v_ingredient jsonb;
  v_cat public.bounty_category;
  v_info jsonb;
  v_reserves integer;
  v_can boolean;
  v_reason text;
  v_name text;
  v_out jsonb := '{}'::jsonb;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  perform public.ensure_finale_latched(now());
  select * into v_config from public.cruise_config where is_active limit 1;

  foreach v_cat in array array['cocktail'::public.bounty_category, 'ingredient'::public.bounty_category]
  loop
    v_info := public.bounty_find_public_slot_at(v_cat, now());
    v_reserves := 0;
    v_can := false;
    v_reason := null;
    v_name := null;

    if coalesce((v_info->>'ok')::boolean, false) then
      v_reserves := public.bounty_unused_reserve_count(
        (v_info->>'cruise_config_id')::uuid,
        (v_info->>'catalog_version_id')::uuid,
        v_cat
      );
      if v_cat = 'cocktail' then
        v_name := v_info->'display'->>'drink_name';
      else
        v_name := v_info->'display'->>'display_name';
      end if;
      if v_reserves < 1 then
        v_reason := 'NO_RESERVES';
      else
        v_can := true;
      end if;
    else
      v_reason := coalesce(v_info->>'code', 'UNAVAILABLE');
    end if;

    v_out := v_out || jsonb_build_object(
      v_cat::text, jsonb_build_object(
        'category', v_cat,
        'ok', coalesce((v_info->>'ok')::boolean, false),
        'display_name', v_name,
        'offer_id', v_info->>'offer_id',
        'slot_key', v_info->>'slot_key',
        'public_end_utc', v_info->>'public_end_utc',
        'replacements_remaining', v_reserves,
        'can_skip', v_can,
        'skip_blocked_reason', v_reason,
        'paused', coalesce((v_info->>'paused')::boolean, false)
      )
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'cruise_config_id', v_config.id,
    'categories', v_out
  );
end;
$$;

revoke all on function public.admin_get_bounty_skip_status() from public;
grant execute on function public.admin_get_bounty_skip_status() to authenticated;

create or replace function public.admin_skip_current_bounty(
  p_category text,
  p_expected_offer_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_cat public.bounty_category;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  begin
    v_cat := lower(trim(p_category))::public.bounty_category;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CATEGORY');
  end;

  if v_cat not in ('cocktail', 'ingredient') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CATEGORY');
  end if;

  return public.drinkit_admin_skip_bounty_core(
    v_me, v_cat, p_expected_offer_id, p_client_request_id, clock_timestamp()
  );
end;
$$;

revoke all on function public.admin_skip_current_bounty(text, uuid, uuid) from public;
grant execute on function public.admin_skip_current_bounty(text, uuid, uuid) to authenticated;

create or replace function public.admin_find_bounty_skip_request_by_id(
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_bounty_skip_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    return null;
  end if;

  select * into v_row
  from public.admin_bounty_skip_requests
  where client_request_id = p_client_request_id;

  if not found then
    return null;
  end if;

  return v_row.result_json || jsonb_build_object(
    'idempotent_replay', true,
    'client_request_id', v_row.client_request_id,
    'fingerprint', v_row.fingerprint,
    'category', v_row.category,
    'expected_offer_id', v_row.expected_offer_id,
    'received_at_utc', v_row.received_at_utc,
    'completed_at_utc', v_row.completed_at_utc
  );
end;
$$;

revoke all on function public.admin_find_bounty_skip_request_by_id(uuid) from public;
grant execute on function public.admin_find_bounty_skip_request_by_id(uuid) to authenticated;

-- Timed simulation for tests (service_role + development-only)
create or replace function public.dev_admin_skip_bounty_at(
  p_category text,
  p_expected_offer_id uuid,
  p_client_request_id uuid,
  p_at_utc timestamptz,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat public.bounty_category;
  v_actor uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;

  v_cat := lower(trim(p_category))::public.bounty_category;
  v_actor := coalesce(
    p_actor_id,
    (select id from public.players where is_admin is true order by created_at nulls last limit 1)
  );

  return public.drinkit_admin_skip_bounty_core(
    v_actor, v_cat, p_expected_offer_id, p_client_request_id, p_at_utc
  );
end;
$$;

revoke all on function public.dev_admin_skip_bounty_at(text, uuid, uuid, timestamptz, uuid) from public;
grant execute on function public.dev_admin_skip_bounty_at(text, uuid, uuid, timestamptz, uuid) to service_role;

comment on function public.admin_skip_current_bounty(text, uuid, uuid) is
  'Phase 3C-B: Admin Skip Current Cocktail/Ingredient from unused reserve; idempotent by client_request_id.';

