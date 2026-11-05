-- Phase 4B1 gate: Admin Skip Current only applies to an *exposed* objective.
-- A preallocated offer whose public window has begun but was never shown
-- (e.g. Drink It! paused across opening) is not a "current" skippable bounty.
-- Authority: UX §10, Tech Spec §6.5, docs/BOUNTY_SCHEDULING.md ("currently exposed").

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

  -- Skip/status "current" means player-visible / exposed — not merely scheduled.
  if v_offer.exposed_at_utc is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_EXPOSED',
      'message', 'No current bounty has been shown for this window yet.',
      'slot_id', v_slot.id,
      'offer_id', v_offer.id,
      'paused', v_control.status = 'paused'
    );
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
    'paused', v_control.status = 'paused',
    'exposed_at_utc', v_offer.exposed_at_utc
  );
end;
$$;

revoke all on function public.bounty_find_public_slot_at(public.bounty_category, timestamptz) from public;
grant execute on function public.bounty_find_public_slot_at(public.bounty_category, timestamptz) to service_role;

comment on function public.bounty_find_public_slot_at(public.bounty_category, timestamptz) is
  'Locate the currently exposed public Cocktail/Ingredient offer at a ship-time instant. Unexposed preallocated offers are not skippable.';
