-- Phase 3B: player-safe catalog reads for logging wizard + cocktail offering_id for Claim It prefill.

-- ---------------------------------------------------------------------------
-- Active bars (name + deck) for the active catalog
-- ---------------------------------------------------------------------------
create or replace function public.list_drinkit_bars()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_catalog uuid;
  v_out jsonb;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  select catalog_version_id into v_catalog from public.active_catalog_pointer where id = 1;
  if v_catalog is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'bar_id', b.id,
      'canonical_key', b.canonical_key,
      'name', cvb.name,
      'deck', nullif(regexp_replace(coalesce(cvb.deck, ''), '[^0-9]', '', 'g'), '')::int
    )
    order by lower(cvb.name), cvb.deck, b.canonical_key
  ), '[]'::jsonb)
  into v_out
  from public.catalog_version_bars cvb
  join public.bars b on b.id = cvb.bar_id
  where cvb.catalog_version_id = v_catalog
    and cvb.active is true;

  return v_out;
end;
$$;

comment on function public.list_drinkit_bars() is
  'Phase 3B: active catalog bars with display name and deck. No candidate pools.';

revoke all on function public.list_drinkit_bars() from public;
grant execute on function public.list_drinkit_bars() to authenticated;

-- ---------------------------------------------------------------------------
-- Named alcoholic drinks at a bar (active catalog offerings)
-- ---------------------------------------------------------------------------
create or replace function public.list_drinkit_bar_drinks(p_bar_canonical_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_catalog uuid;
  v_bar_id uuid;
  v_key text := lower(trim(coalesce(p_bar_canonical_key, '')));
  v_out jsonb;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;
  if v_key = '' then
    return '[]'::jsonb;
  end if;

  select catalog_version_id into v_catalog from public.active_catalog_pointer where id = 1;
  if v_catalog is null then
    return '[]'::jsonb;
  end if;

  select b.id into v_bar_id
  from public.bars b
  join public.catalog_version_bars cvb
    on cvb.bar_id = b.id and cvb.catalog_version_id = v_catalog and cvb.active is true
  where b.canonical_key = v_key
  limit 1;
  if v_bar_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'offering_id', bo.id,
      'drink_concept_id', dc.id,
      'canonical_key', dc.canonical_key,
      'display_name', cvd.display_name,
      'kind', cvd.kind
    )
    order by lower(cvd.display_name), dc.canonical_key
  ), '[]'::jsonb)
  into v_out
  from public.bar_offerings bo
  join public.catalog_version_offerings cvo
    on cvo.offering_id = bo.id and cvo.catalog_version_id = v_catalog
  join public.drink_concepts dc on dc.id = bo.drink_concept_id
  join public.catalog_version_drink_concepts cvd
    on cvd.catalog_version_id = v_catalog and cvd.drink_concept_id = dc.id
  where bo.bar_id = v_bar_id
    and cvd.kind in ('named_cocktail', 'beer', 'wine', 'other_alcoholic');

  return v_out;
end;
$$;

comment on function public.list_drinkit_bar_drinks(text) is
  'Phase 3B: alcoholic named offerings at one bar. No ingredients, no candidate pools.';

revoke all on function public.list_drinkit_bar_drinks(text) from public;
grant execute on function public.list_drinkit_bar_drinks(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Other Drink It! companions (exclude self)
-- ---------------------------------------------------------------------------
create or replace function public.list_drinkit_companions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_out jsonb;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'player_id', p.id,
      'display_name', p.display_name
    )
    order by lower(p.display_name), p.id
  ), '[]'::jsonb)
  into v_out
  from public.players p
  join public.game_memberships gm on gm.player_id = p.id
  where p.active is true
    and p.id is distinct from v_me
    and gm.game = 'drinkit'
    and gm.enabled is true;

  return v_out;
end;
$$;

comment on function public.list_drinkit_companions() is
  'Phase 3B: other enabled Drink It! players for Friends step. Excludes self and Ship It!-only.';

revoke all on function public.list_drinkit_companions() from public;
grant execute on function public.list_drinkit_companions() to authenticated;

-- ---------------------------------------------------------------------------
-- Own submission summary for post-submit Gallery stub
-- ---------------------------------------------------------------------------
create or replace function public.get_my_drink_submission(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_sub public.submissions%rowtype;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;
  if p_submission_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select * into v_sub
  from public.submissions
  where id = p_submission_id
    and author_player_id = v_me
    and game = 'drinkit';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_sub.id,
    'received_at_utc', v_sub.received_at_utc,
    'ship_day', v_sub.ship_day,
    'caption', v_sub.caption,
    'display', v_sub.display_snapshot_json,
    'result', v_sub.result_json,
    'gallery_event_id', v_sub.gallery_event_id
  );
end;
$$;

revoke all on function public.get_my_drink_submission(uuid) from public;
grant execute on function public.get_my_drink_submission(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Cocktail Claim It needs offering_id for exact drink prefill
-- ---------------------------------------------------------------------------
create or replace function public.get_my_current_cocktail_bounty()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
  v_offer public.bounty_slot_offers%rowtype;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  v_raw := public.bounty_resolve_at('cocktail', now(), true, false);
  if v_raw->>'status' is distinct from 'active' then
    return v_raw;
  end if;

  select * into v_offer from public.bounty_slot_offers where id = (v_raw->>'offer_id')::uuid;

  return jsonb_build_object(
    'status', 'active',
    'offer_id', v_raw->>'offer_id',
    'slot_key', v_raw->>'slot_key',
    'offering_id', v_offer.cocktail_offering_id,
    'drink_name', v_raw->'display'->>'drink_name',
    'designated_bar_key', v_raw->'display'->>'designated_bar_key',
    'designated_bar_name', v_raw->'display'->>'designated_bar_name',
    'tier', v_raw->'display'->>'tier',
    'points', (v_raw->'display'->>'points')::int,
    'listed_ingredients', v_raw->'display'->'listed_ingredients',
    'public_end_utc', v_raw->>'public_end_utc'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Friends step: should we show the informational Bar Bounty honor reminder?
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_bar_bounty_reminder(
  p_bar_canonical_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_bar jsonb;
  v_life jsonb;
  v_config public.cruise_config%rowtype;
  v_day integer;
  v_claimed boolean := false;
  v_key text := lower(trim(coalesce(p_bar_canonical_key, '')));
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;
  if v_key = '' then
    return jsonb_build_object('show_reminder', false, 'reason', 'no_bar');
  end if;

  v_life := public.drinkit_lifecycle_at(clock_timestamp());
  if v_life->>'status' is distinct from 'open' then
    return jsonb_build_object('show_reminder', false, 'reason', coalesce(v_life->>'status', 'closed'));
  end if;

  v_bar := public.get_my_current_bar_bounty();
  if v_bar->>'status' is distinct from 'active' then
    return jsonb_build_object('show_reminder', false, 'reason', 'bar_unavailable');
  end if;
  if lower(trim(coalesce(v_bar->>'bar_canonical_key', ''))) is distinct from v_key then
    return jsonb_build_object('show_reminder', false, 'reason', 'not_featured_bar');
  end if;

  select * into v_config from public.cruise_config where is_active limit 1;
  v_day := (v_life->>'cruise_day')::int;
  if v_config.id is null or v_day is null then
    return jsonb_build_object('show_reminder', false, 'reason', 'no_cruise_day');
  end if;

  select exists (
    select 1 from public.bounty_claims
    where player_id = v_me
      and cruise_config_id = v_config.id
      and game_day = v_day
      and category = 'bar'
      and status = 'active'
  ) into v_claimed;

  if v_claimed then
    return jsonb_build_object('show_reminder', false, 'reason', 'already_claimed');
  end if;

  return jsonb_build_object(
    'show_reminder', true,
    'bar_canonical_key', v_bar->>'bar_canonical_key',
    'bar_display_name', v_bar->>'bar_display_name'
  );
end;
$$;

revoke all on function public.drinkit_bar_bounty_reminder(text) from public;
grant execute on function public.drinkit_bar_bounty_reminder(text) to authenticated;

-- Keep timed helper aligned for tests that assert player-shaped fields via board.
create or replace function public.dev_get_current_cocktail_bounty_at(p_at_utc timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
  v_offer public.bounty_slot_offers%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;

  v_raw := public.bounty_resolve_at('cocktail', p_at_utc, true, false);
  if v_raw->>'status' is distinct from 'active' then
    return v_raw;
  end if;
  select * into v_offer from public.bounty_slot_offers where id = (v_raw->>'offer_id')::uuid;
  return jsonb_build_object(
    'status', 'active',
    'offer_id', v_raw->>'offer_id',
    'slot_key', v_raw->>'slot_key',
    'offering_id', v_offer.cocktail_offering_id,
    'drink_name', v_raw->'display'->>'drink_name',
    'designated_bar_key', v_raw->'display'->>'designated_bar_key',
    'designated_bar_name', v_raw->'display'->>'designated_bar_name',
    'tier', v_raw->'display'->>'tier',
    'points', (v_raw->'display'->>'points')::int,
    'listed_ingredients', v_raw->'display'->'listed_ingredients',
    'public_end_utc', v_raw->>'public_end_utc',
    'cruise_day', (v_raw->>'cruise_day')::int
  );
end;
$$;
