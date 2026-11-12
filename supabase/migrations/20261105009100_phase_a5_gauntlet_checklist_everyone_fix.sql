-- Fix gauntlet checklist: everyone/US must use collective coverage, not personal.
-- Prefer personal status for display names + mine; merge covered from collective status.
-- live_current on each side already came from the correct definition; items did not.

create or replace function public.get_drinkit_collection_checklist(p_bar_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_key text := lower(trim(coalesce(p_bar_key, '')));
  v_include_test boolean;
  v_personal public.achievement_definitions%rowtype;
  v_collective public.achievement_definitions%rowtype;
  v_pstat jsonb;
  v_cstat jsonb;
  v_paward public.achievement_awards%rowtype;
  v_caward public.achievement_awards%rowtype;
  v_bar_name text;
  v_items jsonb := '[]'::jsonb;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game('drinkit') and not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;
  if v_key = '' then
    return jsonb_build_object('ok', false, 'code', 'BAR_KEY_REQUIRED');
  end if;
  v_include_test := public.achievement_dev_cruise_active();

  select * into v_personal
  from public.achievement_definitions d
  where d.game = 'drinkit'
    and d.condition_type = 'offering_collection'
    and d.enabled
    and (not d.test_only or v_include_test)
    and coalesce(d.condition_config->>'scope', 'personal') = 'personal'
    and d.condition_config->>'bar_key' = v_key
  order by d.stable_key
  limit 1;

  select * into v_collective
  from public.achievement_definitions d
  where d.game = 'drinkit'
    and d.condition_type = 'offering_collection'
    and d.enabled
    and (not d.test_only or v_include_test)
    and coalesce(d.condition_config->>'scope', 'personal') = 'collective'
    and d.condition_config->>'bar_key' = v_key
  order by d.stable_key
  limit 1;

  if v_personal.id is null and v_collective.id is null then
    return jsonb_build_object('ok', false, 'code', 'GAUNTLET_NOT_FOUND', 'bar_key', v_key);
  end if;

  select coalesce(cvb.name, v_key) into v_bar_name
  from public.bars b
  left join public.active_catalog_pointer acp on acp.id = 1
  left join public.catalog_version_bars cvb
    on cvb.catalog_version_id = acp.catalog_version_id
   and cvb.bar_id = b.id
  where b.canonical_key = v_key;

  if v_personal.id is not null then
    v_pstat := public.achievement_collection_status(v_personal.id, v_me);
    select * into v_paward from public.achievement_awards
    where definition_id = v_personal.id and owner_player_id = v_me and status = 'active'
    limit 1;
  end if;
  if v_collective.id is not null then
    v_cstat := public.achievement_collection_status(v_collective.id, v_me);
    select * into v_caward from public.achievement_awards
    where definition_id = v_collective.id and owner_player_id = v_me and status = 'active'
    limit 1;
  end if;

  -- Merge required offerings: mine from personal coverage, everyone from collective.
  -- Fall back to whichever status exists when only one scope is published.
  with personal_items as (
    select
      item->>'offering_id' as offering_id,
      item->>'concept_key' as concept_key,
      item->>'display_name' as display_name,
      coalesce((item->>'mine')::boolean, false) as mine,
      coalesce((item->>'covered')::boolean, false) as covered
    from jsonb_array_elements(coalesce(v_pstat->'items', '[]'::jsonb)) item
    where coalesce(v_pstat->>'ok', 'false') = 'true'
  ),
  collective_items as (
    select
      item->>'offering_id' as offering_id,
      item->>'concept_key' as concept_key,
      item->>'display_name' as display_name,
      coalesce((item->>'mine')::boolean, false) as mine,
      coalesce((item->>'covered')::boolean, false) as covered
    from jsonb_array_elements(coalesce(v_cstat->'items', '[]'::jsonb)) item
    where coalesce(v_cstat->>'ok', 'false') = 'true'
  ),
  offering_ids as (
    select offering_id from personal_items
    union
    select offering_id from collective_items
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'offering_id', o.offering_id,
      'concept_key', coalesce(p.concept_key, c.concept_key),
      'display_name', coalesce(p.display_name, c.display_name),
      'mine', coalesce(p.mine, c.mine, false),
      'everyone', case
        when coalesce(v_cstat->>'ok', 'false') = 'true' then coalesce(c.covered, false)
        else coalesce(p.covered, false)
      end
    )
    order by coalesce(p.concept_key, c.concept_key)
  ), '[]'::jsonb)
  into v_items
  from offering_ids o
  left join personal_items p on p.offering_id = o.offering_id
  left join collective_items c on c.offering_id = o.offering_id;

  return jsonb_build_object(
    'ok', true,
    'bar_key', v_key,
    'bar_name', coalesce(v_bar_name, v_key),
    'items', coalesce(v_items, '[]'::jsonb),
    'personal', case when v_personal.id is null then null else jsonb_build_object(
      'definition_id', v_personal.id,
      'stable_key', v_personal.stable_key,
      'badge_earned', v_paward.id is not null,
      'live_current', coalesce((v_pstat->>'live_current')::int, 0),
      'live_target', coalesce((v_pstat->>'live_target')::int, 0),
      'pin_target', case
        when v_paward.evidence_json->'collection_pin'->'offering_ids' is null then null
        else jsonb_array_length(v_paward.evidence_json->'collection_pin'->'offering_ids')
      end,
      'current_menu_complete',
        coalesce((v_pstat->>'live_target')::int, 0) > 0
        and coalesce((v_pstat->>'live_current')::int, 0)
          >= coalesce((v_pstat->>'live_target')::int, 0)
    ) end,
    'collective', case when v_collective.id is null then null else jsonb_build_object(
      'definition_id', v_collective.id,
      'stable_key', v_collective.stable_key,
      'badge_earned', v_caward.id is not null,
      'live_current', coalesce((v_cstat->>'live_current')::int, 0),
      'live_target', coalesce((v_cstat->>'live_target')::int, 0),
      'pin_target', case
        when v_caward.evidence_json->'collection_pin'->'offering_ids' is null then null
        else jsonb_array_length(v_caward.evidence_json->'collection_pin'->'offering_ids')
      end,
      'current_menu_complete',
        coalesce((v_cstat->>'live_target')::int, 0) > 0
        and coalesce((v_cstat->>'live_current')::int, 0)
          >= coalesce((v_cstat->>'live_target')::int, 0)
    ) end
  );
end;
$$;

comment on function public.get_drinkit_collection_checklist(text) is
  'Bar gauntlet checklist: mine from personal coverage, everyone from collective coverage. Denominators follow the active eligible catalog.';
