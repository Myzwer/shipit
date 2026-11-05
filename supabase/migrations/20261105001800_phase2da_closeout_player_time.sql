-- Phase 2D-A closeout: player bounty RPCs must never honor caller-controlled time.
-- Deterministic simulation remains service_role-only via dev_* helpers.

-- Drop player-facing overloads that accepted p_at_utc.
drop function if exists public.get_my_current_cocktail_bounty(timestamptz);
drop function if exists public.get_my_current_ingredient_bounty(timestamptz);

-- Zero-argument player reads: always server now(). No label-based bypass.
create or replace function public.get_my_current_cocktail_bounty()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
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
  return jsonb_build_object(
    'status', 'active',
    'offer_id', v_raw->>'offer_id',
    'slot_key', v_raw->>'slot_key',
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

create or replace function public.get_my_current_ingredient_bounty()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;

  v_raw := public.bounty_resolve_at('ingredient', now(), true, false);
  if v_raw->>'status' is distinct from 'active' then
    return v_raw;
  end if;
  return jsonb_build_object(
    'status', 'active',
    'offer_id', v_raw->>'offer_id',
    'slot_key', v_raw->>'slot_key',
    'ingredient_key', v_raw->'display'->>'ingredient_key',
    'display_name', v_raw->'display'->>'display_name',
    'tier', v_raw->'display'->>'tier',
    'points', (v_raw->'display'->>'points')::int,
    'known_bar_count', (v_raw->'display'->>'known_bar_count')::int,
    'public_end_utc', v_raw->>'public_end_utc'
  );
end;
$$;

revoke all on function public.get_my_current_cocktail_bounty() from public;
revoke all on function public.get_my_current_ingredient_bounty() from public;
grant execute on function public.get_my_current_cocktail_bounty() to authenticated;
grant execute on function public.get_my_current_ingredient_bounty() to authenticated;

-- Privileged player-shaped reads for deterministic local simulation (service_role only).
-- SQL grants alone are insufficient: Supabase may re-grant EXECUTE to authenticated/anon.
create or replace function public.dev_get_current_cocktail_bounty_at(p_at_utc timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
  v_config public.cruise_config%rowtype;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_config from public.cruise_config where is_active limit 1;
  if not found or v_config.label is distinct from 'development-only' then
    raise exception 'DEV_BOUNTY_SIM_FORBIDDEN' using errcode = '42501';
  end if;

  v_raw := public.bounty_resolve_at('cocktail', p_at_utc, true, false);
  if v_raw->>'status' is distinct from 'active' then
    return v_raw;
  end if;
  return jsonb_build_object(
    'status', 'active',
    'offer_id', v_raw->>'offer_id',
    'slot_key', v_raw->>'slot_key',
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

create or replace function public.dev_get_current_ingredient_bounty_at(p_at_utc timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
  v_config public.cruise_config%rowtype;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_config from public.cruise_config where is_active limit 1;
  if not found or v_config.label is distinct from 'development-only' then
    raise exception 'DEV_BOUNTY_SIM_FORBIDDEN' using errcode = '42501';
  end if;

  v_raw := public.bounty_resolve_at('ingredient', p_at_utc, true, false);
  if v_raw->>'status' is distinct from 'active' then
    return v_raw;
  end if;
  return jsonb_build_object(
    'status', 'active',
    'offer_id', v_raw->>'offer_id',
    'slot_key', v_raw->>'slot_key',
    'ingredient_key', v_raw->'display'->>'ingredient_key',
    'display_name', v_raw->'display'->>'display_name',
    'tier', v_raw->'display'->>'tier',
    'points', (v_raw->'display'->>'points')::int,
    'known_bar_count', (v_raw->'display'->>'known_bar_count')::int,
    'public_end_utc', v_raw->>'public_end_utc'
  );
end;
$$;

revoke all on function public.dev_get_current_cocktail_bounty_at(timestamptz) from public;
revoke all on function public.dev_get_current_cocktail_bounty_at(timestamptz) from authenticated, anon;
revoke all on function public.dev_get_current_ingredient_bounty_at(timestamptz) from public;
revoke all on function public.dev_get_current_ingredient_bounty_at(timestamptz) from authenticated, anon;
grant execute on function public.dev_get_current_cocktail_bounty_at(timestamptz) to service_role;
grant execute on function public.dev_get_current_ingredient_bounty_at(timestamptz) to service_role;

-- Harden existing eligibility helper the same way (in-function role gate).
create or replace function public.dev_resolve_bounty_eligibility_at(
  p_category public.bounty_category,
  p_at_utc timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  return public.bounty_resolve_at(p_category, p_at_utc, true, true);
end;
$$;

revoke all on function public.dev_resolve_bounty_eligibility_at(public.bounty_category, timestamptz) from public;
revoke all on function public.dev_resolve_bounty_eligibility_at(public.bounty_category, timestamptz) from authenticated, anon;
grant execute on function public.dev_resolve_bounty_eligibility_at(public.bounty_category, timestamptz) to service_role;

-- Ensure bounty_resolve_at itself is not executable by authenticated/anon clients.
-- Internal calls from security-definer wrappers still work as the function owner.
revoke all on function public.bounty_resolve_at(public.bounty_category, timestamptz, boolean, boolean) from public;
revoke all on function public.bounty_resolve_at(public.bounty_category, timestamptz, boolean, boolean) from authenticated, anon;
grant execute on function public.bounty_resolve_at(public.bounty_category, timestamptz, boolean, boolean) to service_role;
