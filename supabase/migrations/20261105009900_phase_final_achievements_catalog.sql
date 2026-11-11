-- FINAL Achievements catalog install (2026-11-10).
-- Adds FINAL category enum values + evaluator support for newly enabled conditions.
-- Does not seed definition rows (content loader remains source of truth).
-- Preserves existing awards; retired definitions are disabled by the working loader.

-- ---------------------------------------------------------------------------
-- Category enum expansion (Drink It! 8 + Ship It! 4 display groups)
-- ---------------------------------------------------------------------------
alter type public.achievement_group add value if not exists 'firsts_early_wins';
alter type public.achievement_group add value if not exists 'bounties_competition';
alter type public.achievement_group add value if not exists 'bars_exploration';
alter type public.achievement_group add value if not exists 'spirits_ingredients';
alter type public.achievement_group add value if not exists 'friends_social';
alter type public.achievement_group add value if not exists 'ship_time_milestones';
alter type public.achievement_group add value if not exists 'progress_completion';
alter type public.achievement_group add value if not exists 'challenge_spotlights';

comment on type public.achievement_group is
  'FINAL achievement categories. Drink It! has no First to Find. Ship It! First to Find remains `firsts`.';

-- ---------------------------------------------------------------------------
-- Condition type allow-list: day_bounty_score (Take it to the limit)
-- ---------------------------------------------------------------------------
create or replace function public.achievement_validate_condition_type(p_type text)
returns boolean
language sql
immutable
as $$
  select p_type = any (array[
    'event_count', 'distinct_count', 'grouped_count', 'exact_match', 'tag_match',
    'same_submission_claims', 'set_completion', 'category_completion',
    'event_interval', 'ordered_after', 'companion_predicate', 'ship_time_window',
    'cruise_day', 'recipe_ingredient_count', 'same_log', 'offering_collection',
    'day_bounty_score', 'all', 'any'
  ]::text[]);
$$;

-- ---------------------------------------------------------------------------
-- Take it to the limit: ≥ min_points on one ship-local day AND all required categories
-- ---------------------------------------------------------------------------
create or replace function public.achievement_eval_day_bounty_score(
  p_cfg jsonb,
  p_owner_player uuid,
  p_as_of_utc timestamptz,
  p_as_of_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_min int := greatest(1, coalesce((p_cfg->>'min_points')::int, 275));
  v_required text[];
  v_ok boolean;
begin
  if p_owner_player is null then
    return false;
  end if;
  if p_cfg ? 'require_categories' then
    select coalesce(array_agg(x), '{}'::text[])
      into v_required
    from jsonb_array_elements_text(p_cfg->'require_categories') t(x);
  else
    v_required := array['cocktail', 'ingredient', 'bar', 'daily'];
  end if;
  if coalesce(cardinality(v_required), 0) < 1 then
    return false;
  end if;

  select exists (
    select 1
    from public.bounty_claims bc
    join public.submissions s on s.id = bc.submission_id
    where bc.player_id = p_owner_player
      and bc.status = 'active'
      and s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
    group by bc.game_day
    having sum(bc.points) >= v_min
       and count(distinct bc.category::text) filter (
         where bc.category::text = any (v_required)
       ) >= cardinality(v_required)
  ) into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.achievement_eval_day_bounty_score(jsonb, uuid, timestamptz, uuid) from public;
grant execute on function public.achievement_eval_day_bounty_score(jsonb, uuid, timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Collection resolve: bar gauntlets OR cross-bar drink_tag collections (frozen)
-- ---------------------------------------------------------------------------
create or replace function public.achievement_collection_required_ids_for_tag(
  p_version_id uuid,
  p_drink_tag text,
  p_require_tropical boolean default false
) returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct cvo.offering_id order by cvo.offering_id), '{}'::uuid[])
  from public.catalog_version_offerings cvo
  join public.bar_offerings bo on bo.id = cvo.offering_id
  join public.catalog_version_drink_concepts dc
    on dc.catalog_version_id = cvo.catalog_version_id
   and dc.drink_concept_id = bo.drink_concept_id
  where cvo.catalog_version_id = p_version_id
    and dc.kind not in ('beer', 'wine')
    and public.achievement_offering_collection_price_ok(cvo.price_status)
    and not exists (
      select 1 from public.admin_manual_offerings amo
      where amo.catalog_version_id = cvo.catalog_version_id
        and amo.offering_id = cvo.offering_id
        and amo.active
    )
    and not exists (
      select 1 from public.catalog_version_offering_tags t
      where t.catalog_version_id = cvo.catalog_version_id
        and t.offering_id = cvo.offering_id
        and t.tag = 'collection-excluded'
    )
    and (
      exists (
        select 1 from public.catalog_version_drink_concept_tags t
        where t.catalog_version_id = cvo.catalog_version_id
          and t.drink_concept_id = bo.drink_concept_id
          and t.tag = p_drink_tag
      )
      or exists (
        select 1 from public.catalog_version_offering_tags t
        where t.catalog_version_id = cvo.catalog_version_id
          and t.offering_id = cvo.offering_id
          and t.tag = p_drink_tag
      )
    )
    and (
      not coalesce(p_require_tropical, false)
      or exists (
        select 1
        from public.catalog_offering_ingredients coi
        join public.catalog_version_ingredient_tags it
          on it.ingredient_id = coi.ingredient_id
         and it.catalog_version_id = coi.catalog_version_id
        where coi.offering_id = cvo.offering_id
          and coi.catalog_version_id = cvo.catalog_version_id
          and it.tag in (
            'fruit-tropical', 'fruit-pineapple', 'fruit-mango', 'fruit-passion-fruit',
            'fruit-guava', 'fruit-dragon-fruit', 'fruit-lychee', 'fruit-coconut'
          )
      )
      or exists (
        select 1 from public.catalog_version_drink_concept_tags t
        where t.catalog_version_id = cvo.catalog_version_id
          and t.drink_concept_id = bo.drink_concept_id
          and t.tag in ('tropical', 'fruit-tropical')
      )
    );
$$;

revoke all on function public.achievement_collection_required_ids_for_tag(uuid, text, boolean) from public;
grant execute on function public.achievement_collection_required_ids_for_tag(uuid, text, boolean) to service_role;

create or replace function public.achievement_collection_resolve(p_cfg jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bar_id uuid;
  v_version uuid;
  v_ids uuid[];
  v_mode text;
  v_threshold int;
  v_target int;
  v_tag text := nullif(p_cfg->>'drink_tag', '');
  v_bar_key text := nullif(p_cfg->>'bar_key', '');
  v_require_tropical boolean := coalesce((p_cfg->>'require_tropical')::boolean, false);
  v_verification_required boolean := coalesce((p_cfg->>'verification_required')::boolean, false);
begin
  if p_cfg is null then
    return null;
  end if;
  v_version := public.achievement_active_catalog_version_id();
  if v_version is null then
    return null;
  end if;

  if v_bar_key is not null then
    select id into v_bar_id from public.bars where canonical_key = v_bar_key;
    if v_bar_id is null then
      return null;
    end if;
    v_ids := public.achievement_collection_required_ids(v_bar_id, v_version);
  elsif v_tag is not null then
    v_ids := public.achievement_collection_required_ids_for_tag(
      v_version, v_tag, v_require_tropical
    );
  else
    return null;
  end if;

  if coalesce(p_cfg->>'threshold', '') ~ '^[0-9]+$' then
    v_threshold := (p_cfg->>'threshold')::int;
  end if;
  if coalesce(p_cfg->>'mode', '') = 'threshold' or (
    coalesce(p_cfg->>'mode', '') = '' and v_threshold is not null
  ) then
    v_mode := 'threshold';
    v_target := v_threshold;
    -- Threshold collections still require a non-empty eligible universe.
    if coalesce(cardinality(v_ids), 0) < 1 then
      return jsonb_build_object(
        'bar_id', v_bar_id,
        'bar_key', v_bar_key,
        'drink_tag', v_tag,
        'catalog_version_id', v_version,
        'mode', v_mode,
        'scope', coalesce(p_cfg->>'scope', 'personal'),
        'target', 0,
        'offering_ids', '[]'::jsonb,
        'verification_pending', true
      );
    end if;
  else
    v_mode := 'full_menu';
    v_target := coalesce(cardinality(v_ids), 0);
  end if;

  if v_mode = 'threshold' and (v_target is null or v_target < 1) then
    return null;
  end if;

  return jsonb_build_object(
    'bar_id', v_bar_id,
    'bar_key', v_bar_key,
    'drink_tag', v_tag,
    'catalog_version_id', v_version,
    'mode', v_mode,
    'scope', coalesce(p_cfg->>'scope', 'personal'),
    'target', v_target,
    'offering_ids', to_jsonb(coalesce(v_ids, '{}'::uuid[])),
    'verification_pending',
      (v_verification_required and coalesce(cardinality(v_ids), 0) < 1)
      or (v_target = 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Companion: all other enrolled Drink It! players + named companion extras
-- ---------------------------------------------------------------------------
create or replace function public.achievement_eval_companion_predicate_final(
  p_cfg jsonb,
  p_owner_player uuid,
  p_as_of_utc timestamptz,
  p_as_of_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_count int;
  v_needed int;
begin
  if p_owner_player is null then
    return false;
  end if;

  if p_cfg->>'mode' = 'all_other_enrolled_companions' then
    select count(*)::int into v_needed
    from public.game_memberships gm
    where gm.game = 'drinkit'
      and gm.enabled
      and gm.player_id <> p_owner_player;
    if coalesce(v_needed, 0) < 1 then
      return false;
    end if;
    select count(distinct dc.companion_player_id)::int into v_count
    from public.submissions s
    join public.drink_log_companions dc on dc.submission_id = s.id
    join public.game_memberships gm
      on gm.player_id = dc.companion_player_id
     and gm.game = 'drinkit'
     and gm.enabled
    where s.status = 'accepted'
      and s.kind = 'drink_log'
      and s.author_player_id = p_owner_player
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
      and dc.companion_player_id <> p_owner_player;
    return coalesce(v_count, 0) >= v_needed;
  end if;

  if p_cfg->>'mode' = 'named_companion' then
    if p_cfg->>'companion_player_id' is null then
      return false;
    end if;
    select exists (
      select 1
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      join public.drink_log_companions dc on dc.submission_id = s.id
      where s.status = 'accepted'
        and s.kind = 'drink_log'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.author_player_id = p_owner_player
        and dc.companion_player_id = (p_cfg->>'companion_player_id')::uuid
        and (
          -- Drink It! logs are alcoholic by schema; flag only requires a real drink_log row.
          coalesce((p_cfg->>'require_alcoholic')::boolean, false) is false
          or d.submission_id is not null
        )
        and (
          p_cfg->>'require_drink_mode' is null
          or d.drink_mode::text = p_cfg->>'require_drink_mode'
        )
        and (
          p_cfg->>'require_ingredient_key' is null
          or exists (
            select 1
            from public.catalog_offering_ingredients coi
            join public.ingredients ing on ing.id = coi.ingredient_id
            where coi.offering_id = d.offering_id
              and coi.catalog_version_id = d.catalog_version_id
              and ing.canonical_key = p_cfg->>'require_ingredient_key'
          )
        )
        and (
          p_cfg->>'require_ingredient_tag' is null
          or exists (
            select 1
            from public.catalog_offering_ingredients coi
            join public.catalog_version_ingredient_tags it
              on it.ingredient_id = coi.ingredient_id
             and it.catalog_version_id = coi.catalog_version_id
            where coi.offering_id = d.offering_id
              and coi.catalog_version_id = d.catalog_version_id
              and it.tag = p_cfg->>'require_ingredient_tag'
          )
        )
        and (
          p_cfg->>'require_drink_concept_tag' is null
          or exists (
            select 1 from (
              select tag from public.catalog_version_drink_concept_tags dct
              where dct.drink_concept_id = d.drink_concept_id
                and dct.catalog_version_id = d.catalog_version_id
              union
              select tag from public.catalog_version_offering_tags ot
              where ot.offering_id = d.offering_id
                and ot.catalog_version_id = d.catalog_version_id
            ) t where t.tag = p_cfg->>'require_drink_concept_tag'
          )
        )
        and (
          coalesce((p_cfg->>'forbid_bounty_claims')::boolean, false) is false
          or not exists (
            select 1 from public.bounty_claims bc
            where bc.submission_id = s.id
              and bc.status = 'active'
          )
        )
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  return false;
end;
$$;

revoke all on function public.achievement_eval_companion_predicate_final(jsonb, uuid, timestamptz, uuid) from public;
grant execute on function public.achievement_eval_companion_predicate_final(jsonb, uuid, timestamptz, uuid) to service_role;

-- Wrap eval dispatcher to include day_bounty_score + companion final modes.
alter function public.achievement_eval_condition_as_of(
  jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer
) rename to achievement_eval_condition_as_of_pre_final;

create or replace function public.achievement_eval_condition_as_of(
  p_cfg jsonb,
  p_game public.game_id,
  p_owner_player uuid,
  p_owner_team uuid,
  p_trigger_submission uuid,
  p_as_of_utc timestamptz,
  p_as_of_id uuid,
  p_depth int default 0
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if p_depth > 4 then
    raise exception 'CONDITION_NESTING_TOO_DEEP' using errcode = 'P0001';
  end if;
  if p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then
    return false;
  end if;
  v_type := p_cfg->>'type';
  if not public.achievement_validate_condition_type(v_type) then
    raise exception 'UNKNOWN_CONDITION_TYPE' using errcode = 'P0001';
  end if;

  if v_type = 'day_bounty_score' then
    return public.achievement_eval_day_bounty_score(
      p_cfg, p_owner_player, p_as_of_utc, p_as_of_id
    );
  end if;

  if v_type = 'companion_predicate'
     and p_cfg->>'mode' in ('all_other_enrolled_companions', 'named_companion')
     and (
       p_cfg->>'mode' = 'all_other_enrolled_companions'
       or p_cfg ? 'forbid_bounty_claims'
       or p_cfg ? 'require_alcoholic'
       or p_cfg ? 'require_ingredient_key'
     ) then
    return public.achievement_eval_companion_predicate_final(
      p_cfg, p_owner_player, p_as_of_utc, p_as_of_id
    );
  end if;

  return public.achievement_eval_condition_as_of_pre_final(
    p_cfg, p_game, p_owner_player, p_owner_team, p_trigger_submission,
    p_as_of_utc, p_as_of_id, p_depth
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Gauntlet summaries: include verification-gated bars (Good Spirits) even at 0/0
-- ---------------------------------------------------------------------------
create or replace function public.list_drinkit_bar_gauntlet_summaries()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_include_test boolean;
  v_rows jsonb := '[]'::jsonb;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game('drinkit') and not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;
  v_include_test := public.achievement_dev_cruise_active();

  select coalesce(jsonb_agg(row_data order by row_data->>'bar_name', row_data->>'bar_key'), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'bar_key', personal_cfg->>'bar_key',
      'bar_name', coalesce(cvb.name, personal_cfg->>'bar_key'),
      'live_target', coalesce((pstat->>'live_target')::int, 0),
      'verification_pending',
        coalesce((pstat->>'verification_pending')::boolean, false)
        or (
          coalesce((personal_cfg->>'verification_required')::boolean, false)
          and coalesce((pstat->>'live_target')::int, 0) < 1
        ),
      'personal', jsonb_build_object(
        'definition_id', pdef.id,
        'stable_key', pdef.stable_key,
        'earned', paward.id is not null,
        'badge_earned', paward.id is not null,
        'live_current', coalesce((pstat->>'live_current')::int, 0),
        'live_target', coalesce((pstat->>'live_target')::int, 0),
        'pin_target', case
          when paward.evidence_json->'collection_pin'->'offering_ids' is null then null
          else jsonb_array_length(paward.evidence_json->'collection_pin'->'offering_ids')
        end,
        'icon_key', pdef.icon_key
      ),
      'collective', jsonb_build_object(
        'definition_id', cdef.id,
        'stable_key', cdef.stable_key,
        'earned', caward.id is not null,
        'badge_earned', caward.id is not null,
        'live_current', coalesce((cstat->>'live_current')::int, 0),
        'live_target', coalesce((cstat->>'live_target')::int, 0),
        'pin_target', case
          when caward.evidence_json->'collection_pin'->'offering_ids' is null then null
          else jsonb_array_length(caward.evidence_json->'collection_pin'->'offering_ids')
        end,
        'icon_key', cdef.icon_key
      )
    ) as row_data
    from public.achievement_definitions pdef
    join public.achievement_definitions cdef
      on cdef.game = 'drinkit'
     and cdef.condition_type = 'offering_collection'
     and cdef.enabled
     and (not cdef.test_only or v_include_test)
     and coalesce(cdef.condition_config->>'scope', 'personal') = 'collective'
     and cdef.condition_config->>'bar_key' = pdef.condition_config->>'bar_key'
    left join public.bars b on b.canonical_key = pdef.condition_config->>'bar_key'
    left join public.active_catalog_pointer acp on acp.id = 1
    left join public.catalog_version_bars cvb
      on cvb.catalog_version_id = acp.catalog_version_id
     and cvb.bar_id = b.id
    left join lateral (
      select * from public.achievement_awards a
      where a.definition_id = pdef.id and a.owner_player_id = v_me and a.status = 'active'
      limit 1
    ) paward on true
    left join lateral (
      select * from public.achievement_awards a
      where a.definition_id = cdef.id and a.owner_player_id = v_me and a.status = 'active'
      limit 1
    ) caward on true
    left join lateral (
      select public.achievement_collection_live_progress(pdef.id, v_me) as s
    ) ps on true
    left join lateral (
      select public.achievement_collection_live_progress(cdef.id, v_me) as s
    ) cs on true
    cross join lateral (select pdef.condition_config as personal_cfg) cfg
    cross join lateral (select ps.s as pstat, cs.s as cstat) st
    where pdef.game = 'drinkit'
      and pdef.condition_type = 'offering_collection'
      and pdef.enabled
      and (not pdef.test_only or v_include_test)
      and coalesce(pdef.condition_config->>'scope', 'personal') = 'personal'
      and nullif(pdef.condition_config->>'bar_key', '') is not null
      and (
        coalesce((pstat->>'live_target')::int, 0) > 0
        or coalesce((personal_cfg->>'verification_required')::boolean, false)
      )
  ) q;

  return jsonb_build_object('ok', true, 'bars', coalesce(v_rows, '[]'::jsonb));
end;
$$;

comment on function public.list_drinkit_bar_gauntlet_summaries() is
  'Bar gauntlet progress including verification-gated bars (Good Spirits) with verification_pending.';

create or replace function public.achievement_collection_live_progress(
  p_definition_id uuid,
  p_owner_player uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_def public.achievement_definitions%rowtype;
  v_resolved jsonb;
  v_ids uuid[];
  v_owner uuid;
  v_current int;
  v_target int;
begin
  select * into v_def from public.achievement_definitions where id = p_definition_id;
  if not found or v_def.condition_type <> 'offering_collection' then
    return jsonb_build_object('ok', false, 'code', 'NOT_A_COLLECTION');
  end if;

  v_resolved := public.achievement_collection_resolve(public.achievement_cfg(v_def));
  if v_resolved is null then
    return jsonb_build_object('ok', false, 'code', 'COLLECTION_UNRESOLVED');
  end if;

  select coalesce(array_agg(x::uuid), '{}'::uuid[])
    into v_ids
  from jsonb_array_elements_text(coalesce(v_resolved->'offering_ids', '[]'::jsonb)) t(x);

  v_owner := case when public.achievement_definition_is_collective(v_def) then null else p_owner_player end;
  v_target := coalesce((v_resolved->>'target')::int, 0);
  v_current := public.achievement_collection_covered_count(v_ids, v_owner, null, null);

  return jsonb_build_object(
    'ok', true,
    'definition_id', v_def.id,
    'stable_key', v_def.stable_key,
    'mode', v_resolved->>'mode',
    'scope', v_resolved->>'scope',
    'bar_key', v_resolved->>'bar_key',
    'drink_tag', v_resolved->>'drink_tag',
    'catalog_version_id', v_resolved->>'catalog_version_id',
    'live_target', v_target,
    'live_current', least(v_current, greatest(v_target, 0)),
    'verification_pending', coalesce((v_resolved->>'verification_pending')::boolean, false)
  );
end;
$$;
