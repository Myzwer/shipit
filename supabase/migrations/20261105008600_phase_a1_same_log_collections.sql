-- Stage A1: same-log predicates, version-aware offering collections, collective grants.
-- Does not load catalog rows or achievement definitions. Existing 140 definitions are unchanged.
--
-- Collection policy
-- 1. A historical log counts only when that log's catalog_version_id marked the offering eligible
--    (not beer/wine, not verified_over_limit, not an active admin manual offering, not
--    collection-excluded). Later publications do not rewrite that decision.
-- 2. An incomplete collection's required set and denominator are the eligible offerings at the
--    bar on the currently active catalog. A menu import that changes 11 offerings to 13 updates
--    progress immediately. Nothing is pinned until an award is granted, and menu counts are not
--    hardcoded.
-- 3. Stable identity across versions is bar_offerings.id (one row per bar + drink concept).
-- 4. Granting stores collection_pin on the award: full_menu pins that moment's required offering
--    ids; threshold pins the offering ids that satisfied the count. Admin Void keeps the award
--    while those pinned ids still have eligible historical logs, and revokes it when a necessary
--    log is voided. Publishing or rolling back the active catalog does not revoke awards.
-- 5. full_menu is the gauntlet mode (omit threshold). threshold is a fixed milestone count of
--    whatever the active menu currently allows. Future imports only change catalog rows.

-- ---------------------------------------------------------------------------
-- Offering tag future imports can set without another engine change
-- ---------------------------------------------------------------------------
create or replace function public.catalog_approved_offering_classification_tags()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['frozen', 'margarita', 'mixed-spirits', 'collection-excluded']::text[];
$$;

create or replace function public.achievement_validate_condition_type(p_type text)
returns boolean
language sql
immutable
as $$
  select p_type in (
    'event_count', 'distinct_count', 'grouped_count', 'exact_match', 'tag_match',
    'same_submission_claims', 'set_completion', 'category_completion',
    'event_interval', 'ordered_after', 'companion_predicate',
    'ship_time_window', 'cruise_day', 'recipe_ingredient_count',
    'same_log', 'offering_collection', 'all', 'any'
  );
$$;

-- ---------------------------------------------------------------------------
-- Collection helpers
-- ---------------------------------------------------------------------------
create or replace function public.achievement_definition_is_collective(
  p_def public.achievement_definitions
) returns boolean
language sql
immutable
as $$
  select p_def.condition_type = 'offering_collection'
    and coalesce(p_def.condition_config->>'scope', 'personal') = 'collective';
$$;

create or replace function public.achievement_active_catalog_version_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select catalog_version_id from public.active_catalog_pointer where id = 1;
$$;

create or replace function public.achievement_log_counts_for_collection(
  p_offering_id uuid,
  p_owner uuid,
  p_as_of_utc timestamptz,
  p_as_of_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.submissions s
    join public.drink_logs d on d.submission_id = s.id
    join public.bar_offerings bo on bo.id = d.offering_id
    join public.catalog_version_offerings cvo
      on cvo.catalog_version_id = d.catalog_version_id
     and cvo.offering_id = d.offering_id
    join public.catalog_version_drink_concepts dc
      on dc.catalog_version_id = d.catalog_version_id
     and dc.drink_concept_id = bo.drink_concept_id
    where s.status = 'accepted'
      and s.kind = 'drink_log'
      and d.drink_mode = 'named_catalog'
      and d.offering_id = p_offering_id
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
      and (p_owner is null or s.author_player_id = p_owner)
      and dc.kind not in ('beer', 'wine')
      and cvo.price_status is distinct from 'verified_over_limit'
      and not exists (
        select 1
        from public.admin_manual_offerings amo
        where amo.catalog_version_id = d.catalog_version_id
          and amo.offering_id = d.offering_id
          and amo.active
      )
      and not exists (
        select 1
        from public.catalog_version_offering_tags t
        where t.catalog_version_id = d.catalog_version_id
          and t.offering_id = d.offering_id
          and t.tag = 'collection-excluded'
      )
  );
$$;

create or replace function public.achievement_collection_required_ids(
  p_bar_id uuid,
  p_version_id uuid
) returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(cvo.offering_id order by dc2.canonical_key), '{}'::uuid[])
  from public.catalog_version_offerings cvo
  join public.bar_offerings bo on bo.id = cvo.offering_id
  join public.drink_concepts dc2 on dc2.id = bo.drink_concept_id
  join public.catalog_version_drink_concepts dc
    on dc.catalog_version_id = cvo.catalog_version_id
   and dc.drink_concept_id = bo.drink_concept_id
  where cvo.catalog_version_id = p_version_id
    and bo.bar_id = p_bar_id
    and dc.kind not in ('beer', 'wine')
    and cvo.price_status is distinct from 'verified_over_limit'
    and not exists (
      select 1
      from public.admin_manual_offerings amo
      where amo.catalog_version_id = cvo.catalog_version_id
        and amo.offering_id = cvo.offering_id
        and amo.active
    )
    and not exists (
      select 1
      from public.catalog_version_offering_tags t
      where t.catalog_version_id = cvo.catalog_version_id
        and t.offering_id = cvo.offering_id
        and t.tag = 'collection-excluded'
    );
$$;

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
begin
  if p_cfg is null or nullif(p_cfg->>'bar_key', '') is null then
    return null;
  end if;
  select id into v_bar_id from public.bars where canonical_key = p_cfg->>'bar_key';
  if v_bar_id is null then
    return null;
  end if;
  v_version := public.achievement_active_catalog_version_id();
  if v_version is null then
    return null;
  end if;
  v_ids := public.achievement_collection_required_ids(v_bar_id, v_version);
  if coalesce(p_cfg->>'threshold', '') ~ '^[0-9]+$' then
    v_threshold := (p_cfg->>'threshold')::int;
  end if;
  if coalesce(p_cfg->>'mode', '') = 'threshold' or (
    coalesce(p_cfg->>'mode', '') = '' and v_threshold is not null
  ) then
    v_mode := 'threshold';
    v_target := v_threshold;
  else
    v_mode := 'full_menu';
    v_target := coalesce(cardinality(v_ids), 0);
  end if;
  if v_mode = 'threshold' and (v_target is null or v_target < 1) then
    return null;
  end if;
  return jsonb_build_object(
    'bar_id', v_bar_id,
    'bar_key', p_cfg->>'bar_key',
    'catalog_version_id', v_version,
    'mode', v_mode,
    'scope', coalesce(p_cfg->>'scope', 'personal'),
    'target', v_target,
    'offering_ids', to_jsonb(v_ids)
  );
end;
$$;

create or replace function public.achievement_collection_covered_ids(
  p_offering_ids uuid[],
  p_owner uuid,
  p_as_of_utc timestamptz,
  p_as_of_id uuid
) returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(x order by x), '{}'::uuid[])
  from unnest(coalesce(p_offering_ids, '{}'::uuid[])) as u(x)
  where public.achievement_log_counts_for_collection(x, p_owner, p_as_of_utc, p_as_of_id);
$$;

create or replace function public.achievement_collection_live_met_config(
  p_cfg jsonb,
  p_owner uuid,
  p_as_of_utc timestamptz default null,
  p_as_of_id uuid default null
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_resolved jsonb;
  v_ids uuid[];
  v_covered uuid[];
  v_owner uuid;
begin
  v_resolved := public.achievement_collection_resolve(p_cfg);
  if v_resolved is null then
    return false;
  end if;
  if coalesce((v_resolved->>'target')::int, 0) < 1 then
    return false;
  end if;
  select coalesce(array_agg(x::uuid), '{}'::uuid[])
    into v_ids
  from jsonb_array_elements_text(coalesce(v_resolved->'offering_ids', '[]'::jsonb)) t(x);
  v_owner := case
    when coalesce(p_cfg->>'scope', 'personal') = 'collective' then null
    else p_owner
  end;
  v_covered := public.achievement_collection_covered_ids(v_ids, v_owner, p_as_of_utc, p_as_of_id);
  return coalesce(cardinality(v_covered), 0) >= (v_resolved->>'target')::int;
end;
$$;

create or replace function public.achievement_collection_live_met(
  p_def public.achievement_definitions,
  p_owner uuid,
  p_as_of_utc timestamptz default null,
  p_as_of_id uuid default null
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.achievement_collection_live_met_config(
    public.achievement_cfg(p_def), p_owner, p_as_of_utc, p_as_of_id
  );
$$;

create or replace function public.achievement_collection_build_pin(
  p_def public.achievement_definitions,
  p_owner uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_resolved jsonb;
  v_ids uuid[];
  v_covered uuid[];
  v_owner uuid;
  v_pin_ids uuid[];
begin
  v_resolved := public.achievement_collection_resolve(public.achievement_cfg(p_def));
  if v_resolved is null then
    return null;
  end if;
  select coalesce(array_agg(x::uuid), '{}'::uuid[])
    into v_ids
  from jsonb_array_elements_text(coalesce(v_resolved->'offering_ids', '[]'::jsonb)) t(x);
  v_owner := case when public.achievement_definition_is_collective(p_def) then null else p_owner end;
  v_covered := public.achievement_collection_covered_ids(v_ids, v_owner, null, null);
  if v_resolved->>'mode' = 'full_menu' then
    v_pin_ids := v_ids;
  else
    v_pin_ids := v_covered;
  end if;
  return jsonb_build_object(
    'mode', v_resolved->>'mode',
    'scope', v_resolved->>'scope',
    'target', (v_resolved->>'target')::int,
    'catalog_version_id', v_resolved->>'catalog_version_id',
    'bar_id', v_resolved->>'bar_id',
    'offering_ids', to_jsonb(coalesce(v_pin_ids, '{}'::uuid[]))
  );
end;
$$;

create or replace function public.achievement_collection_attach_pin(
  p_award_id uuid,
  p_pin jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_award_id is null or p_pin is null then
    return;
  end if;
  update public.achievement_awards
  set evidence_json = evidence_json || jsonb_build_object('collection_pin', p_pin)
  where id = p_award_id;
end;
$$;

create or replace function public.achievement_collection_pin_covered(
  p_def public.achievement_definitions,
  p_owner uuid,
  p_pin jsonb
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_covered uuid[];
  v_owner uuid;
  v_target int;
begin
  if p_pin is null or jsonb_typeof(p_pin->'offering_ids') <> 'array' then
    return false;
  end if;
  select coalesce(array_agg(x::uuid), '{}'::uuid[])
    into v_ids
  from jsonb_array_elements_text(p_pin->'offering_ids') t(x);
  if coalesce(cardinality(v_ids), 0) = 0 then
    return false;
  end if;
  v_owner := case when public.achievement_definition_is_collective(p_def) then null else p_owner end;
  v_covered := public.achievement_collection_covered_ids(v_ids, v_owner, null, null);
  v_target := coalesce((p_pin->>'target')::int, 0);
  if coalesce(p_pin->>'mode', 'full_menu') = 'threshold' then
    return v_target > 0 and coalesce(cardinality(v_covered), 0) >= v_target;
  end if;
  return coalesce(cardinality(v_covered), 0) = cardinality(v_ids);
end;
$$;

create or replace function public.achievement_collection_status(
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
  v_award_id uuid;
  v_pin jsonb;
  v_items jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'offering_id', bo.id,
    'concept_key', concept.canonical_key,
    'display_name', dc.display_name,
    'mine', public.achievement_log_counts_for_collection(bo.id, p_owner_player, null, null),
    'covered', public.achievement_log_counts_for_collection(bo.id, v_owner, null, null)
  ) order by concept.canonical_key), '[]'::jsonb)
    into v_items
  from unnest(v_ids) as required(id)
  join public.bar_offerings bo on bo.id = required.id
  join public.drink_concepts concept on concept.id = bo.drink_concept_id
  join public.catalog_version_drink_concepts dc
    on dc.catalog_version_id = (v_resolved->>'catalog_version_id')::uuid
   and dc.drink_concept_id = bo.drink_concept_id;

  select a.id, a.evidence_json->'collection_pin'
    into v_award_id, v_pin
  from public.achievement_awards a
  where a.definition_id = v_def.id
    and a.owner_player_id = p_owner_player
    and a.status = 'active'
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'definition_id', v_def.id,
    'stable_key', v_def.stable_key,
    'mode', v_resolved->>'mode',
    'scope', v_resolved->>'scope',
    'bar_key', v_resolved->>'bar_key',
    'catalog_version_id', v_resolved->>'catalog_version_id',
    'live_target', (v_resolved->>'target')::int,
    'live_current', coalesce((
      select count(*)::int
      from unnest(public.achievement_collection_covered_ids(v_ids, v_owner, null, null)) c
    ), 0),
    'earned', v_award_id is not null,
    'award_id', v_award_id,
    'pin', v_pin,
    'pin_covered', case
      when v_award_id is null then null
      else public.achievement_collection_pin_covered(v_def, p_owner_player, v_pin)
    end,
    'items', coalesce(v_items, '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Same-log predicate. `all` / `any` stay cross-log in the phase 7b2 evaluator.
-- ---------------------------------------------------------------------------
create or replace function public.achievement_eval_same_log(
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
  v_players uuid[];
  v_bars text[];
  v_has_players boolean := p_cfg ? 'player_ids';
  v_concept text := nullif(p_cfg->>'drink_concept_key', '');
  v_concept_id uuid;
  v_tag text := nullif(p_cfg->>'drink_tag', '');
  v_hour_start int;
  v_hour_end int;
  v_has_hours boolean := false;
  v_ok boolean;
begin
  if p_owner_player is null then
    return false;
  end if;
  if v_has_players then
    begin
      select coalesce(array_agg(x::uuid), '{}'::uuid[])
        into v_players
      from jsonb_array_elements_text(p_cfg->'player_ids') t(x);
    exception when others then
      return false;
    end;
    if coalesce(cardinality(v_players), 0) = 0 then
      return false;
    end if;
  end if;

  if p_cfg ? 'bar_keys' then
    select coalesce(array_agg(x), '{}'::text[])
      into v_bars
    from jsonb_array_elements_text(p_cfg->'bar_keys') t(x);
  elsif nullif(p_cfg->>'bar_key', '') is not null then
    v_bars := array[p_cfg->>'bar_key'];
  end if;

  if nullif(p_cfg->>'drink_concept_id', '') is not null then
    begin
      v_concept_id := (p_cfg->>'drink_concept_id')::uuid;
    exception when others then
      return false;
    end;
  end if;

  if p_cfg ? 'hour_start' or p_cfg ? 'hour_end' then
    if coalesce(p_cfg->>'hour_start', '') !~ '^[0-9]+$'
      or coalesce(p_cfg->>'hour_end', '') !~ '^[0-9]+$' then
      return false;
    end if;
    v_hour_start := (p_cfg->>'hour_start')::int;
    v_hour_end := (p_cfg->>'hour_end')::int;
    if v_hour_start is null or v_hour_end is null
      or v_hour_start < 0 or v_hour_start > 23
      or v_hour_end < 1 or v_hour_end > 24
      or v_hour_end <= v_hour_start then
      return false;
    end if;
    v_has_hours := true;
  end if;

  if not v_has_players and v_concept is null and v_concept_id is null
     and v_tag is null and v_bars is null and not v_has_hours then
    return false;
  end if;

  select exists (
    select 1
    from public.submissions s
    join public.drink_logs d on d.submission_id = s.id
    where s.status = 'accepted'
      and s.kind = 'drink_log'
      and s.author_player_id = p_owner_player
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
      and (
        not v_has_players
        or s.author_player_id = any (v_players)
        or exists (
          select 1
          from public.drink_log_companions c
          where c.submission_id = s.id
            and c.companion_player_id = any (v_players)
        )
      )
      and (
        v_concept is null
        or exists (
          select 1 from public.drink_concepts concept
          where concept.id = d.drink_concept_id
            and concept.canonical_key = v_concept
        )
      )
      and (
        v_concept_id is null
        or d.drink_concept_id = v_concept_id
      )
      and (
        v_bars is null
        or exists (
          select 1 from public.bars b
          where b.id = d.bar_id
            and b.canonical_key = any (v_bars)
        )
      )
      and (
        v_tag is null
        or exists (
          select 1
          from public.catalog_version_drink_concept_tags t
          where t.catalog_version_id = d.catalog_version_id
            and t.drink_concept_id = d.drink_concept_id
            and t.tag = v_tag
          union all
          select 1
          from public.catalog_version_offering_tags t
          where t.catalog_version_id = d.catalog_version_id
            and t.offering_id = d.offering_id
            and t.tag = v_tag
        )
      )
      and (
        not v_has_hours
        or (
          public.achievement_ship_local_time_for_submission(s) >= make_time(v_hour_start, 0, 0)
          and public.achievement_ship_local_time_for_submission(s)
            < (v_hour_end::text || ':00:00')::time
        )
      )
  ) into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- Keep the phase 7b2 body for every previous condition, including cross-log all/any.
alter function public.achievement_eval_condition_as_of(
  jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer
) rename to achievement_eval_condition_as_of_phase7b2;

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
  if v_type = 'same_log' then
    return public.achievement_eval_same_log(p_cfg, p_owner_player, p_as_of_utc, p_as_of_id);
  end if;
  if v_type = 'offering_collection' then
    return public.achievement_collection_live_met_config(
      p_cfg, p_owner_player, p_as_of_utc, p_as_of_id
    );
  end if;
  return public.achievement_eval_condition_as_of_phase7b2(
    p_cfg, p_game, p_owner_player, p_owner_team, p_trigger_submission,
    p_as_of_utc, p_as_of_id, p_depth
  );
end;
$$;

create or replace function public.achievement_owner_qualifies(
  p_def public.achievement_definitions,
  p_owner_player uuid,
  p_owner_team uuid,
  p_trigger_submission uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
begin
  -- Earned collections stay qualified while their pinned offering ids still have
  -- eligible historical logs. The live menu is not consulted for that decision.
  if p_def.condition_type = 'offering_collection' and p_owner_player is not null then
    select a.evidence_json->'collection_pin'
      into v_pin
    from public.achievement_awards a
    where a.definition_id = p_def.id
      and a.owner_player_id = p_owner_player
      and a.status = 'active'
    limit 1;
    if v_pin is not null then
      return public.achievement_collection_pin_covered(p_def, p_owner_player, v_pin);
    end if;
  end if;
  return public.achievement_eval_condition(
    public.achievement_cfg(p_def),
    p_def.game,
    p_owner_player,
    p_owner_team,
    p_trigger_submission,
    0
  );
end;
$$;

create or replace function public.achievement_evaluate_for_owner(
  p_game public.game_id,
  p_owner_player uuid,
  p_owner_team uuid,
  p_trigger_submission uuid,
  p_actor_player uuid,
  p_at timestamptz,
  p_allow_grant boolean default true
) returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_def public.achievement_definitions%rowtype;
  v_new uuid[] := array[]::uuid[];
  v_award_id uuid;
  v_source uuid;
  v_cand record;
  v_include_test boolean;
  v_pin jsonb;
  v_member record;
begin
  if public.achievement_finale_frozen(p_at) then
    return v_new;
  end if;

  v_include_test := public.achievement_dev_cruise_active();

  for v_def in
    select *
    from public.achievement_definitions d
    where d.enabled
      and d.game = p_game
      and (not d.test_only or v_include_test)
    order by d.stable_key
    for update of d
  loop
    perform pg_advisory_xact_lock(hashtext('achievement:' || v_def.id::text));

    if public.achievement_definition_is_collective(v_def) then
      -- Live menu only. An older pin must not mint awards for players who were
      -- not members when a since-expanded menu was completed.
      if not p_allow_grant then
        continue;
      end if;
      if not public.achievement_collection_live_met(v_def, p_owner_player, null, null) then
        continue;
      end if;
      v_pin := public.achievement_collection_build_pin(v_def, p_owner_player);
      if v_pin is null then
        continue;
      end if;
      v_source := coalesce(
        p_trigger_submission,
        public.achievement_owner_latest_evidence(p_game, p_owner_player, p_owner_team)
      );
      for v_member in
        select pl.id
        from public.players pl
        join public.game_memberships m
          on m.player_id = pl.id
         and m.game = 'drinkit'
         and m.enabled
        where pl.active
      loop
        v_award_id := public.achievement_grant_award(
          v_def, v_member.id, null, v_source, p_actor_player, p_at
        );
        if v_award_id is not null then
          perform public.achievement_collection_attach_pin(v_award_id, v_pin);
          if v_member.id = p_owner_player then
            v_new := array_append(v_new, v_award_id);
          end if;
        end if;
      end loop;
      continue;
    end if;

    if v_def.condition_type = 'offering_collection' then
      if exists (
        select 1 from public.achievement_awards a
        where a.definition_id = v_def.id
          and a.owner_player_id = p_owner_player
          and a.status = 'active'
      ) then
        continue;
      end if;
      if not public.achievement_collection_live_met(v_def, p_owner_player, null, null) then
        continue;
      end if;
      if not p_allow_grant then
        continue;
      end if;
      v_source := coalesce(
        p_trigger_submission,
        public.achievement_owner_latest_evidence(p_game, p_owner_player, p_owner_team)
      );
      v_award_id := public.achievement_grant_award(
        v_def, p_owner_player, p_owner_team, v_source, p_actor_player, p_at
      );
      if v_award_id is not null then
        perform public.achievement_collection_attach_pin(
          v_award_id,
          public.achievement_collection_build_pin(v_def, p_owner_player)
        );
        v_new := array_append(v_new, v_award_id);
      end if;
      continue;
    end if;

    if not public.achievement_owner_qualifies(
      v_def, p_owner_player, p_owner_team, p_trigger_submission
    ) then
      continue;
    end if;

    if v_def.exclusive then
      select * into v_cand
      from public.achievement_exclusive_winner_candidate(v_def);
      if not found then
        continue;
      end if;
      if p_game = 'drinkit' and v_cand.owner_player_id is distinct from p_owner_player then
        continue;
      end if;
      if p_game = 'shipit' and v_cand.owner_team_id is distinct from p_owner_team then
        continue;
      end if;
      v_source := coalesce(v_cand.evidence_submission_id, p_trigger_submission);
    else
      v_source := coalesce(
        p_trigger_submission,
        public.achievement_owner_latest_evidence(p_game, p_owner_player, p_owner_team)
      );
    end if;

    if not p_allow_grant then
      continue;
    end if;

    v_award_id := public.achievement_grant_award(
      v_def, p_owner_player, p_owner_team, v_source, p_actor_player, p_at
    );
    if v_award_id is not null then
      v_new := array_append(v_new, v_award_id);
    end if;
  end loop;

  return v_new;
end;
$$;

-- New Drink It! members receive collective awards only when the live menu is
-- already complete. Disabling membership does not revoke anything.
create or replace function public.achievement_backfill_collective_for_player(
  p_player_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_def public.achievement_definitions%rowtype;
  v_include_test boolean;
  v_pin jsonb;
  v_award_id uuid;
  v_source uuid;
  v_at timestamptz := clock_timestamp();
begin
  if p_player_id is null then
    return;
  end if;
  if public.achievement_finale_frozen(v_at) then
    return;
  end if;
  if not exists (
    select 1
    from public.players pl
    join public.game_memberships m on m.player_id = pl.id
    where pl.id = p_player_id
      and pl.active
      and m.game = 'drinkit'
      and m.enabled
  ) then
    return;
  end if;

  v_include_test := public.achievement_dev_cruise_active();
  for v_def in
    select *
    from public.achievement_definitions d
    where d.enabled
      and d.game = 'drinkit'
      and d.condition_type = 'offering_collection'
      and coalesce(d.condition_config->>'scope', 'personal') = 'collective'
      and (not d.test_only or v_include_test)
  loop
    perform pg_advisory_xact_lock(hashtext('achievement:' || v_def.id::text));
    if exists (
      select 1 from public.achievement_awards a
      where a.definition_id = v_def.id
        and a.owner_player_id = p_player_id
        and a.status = 'active'
    ) then
      continue;
    end if;
    if not public.achievement_collection_live_met(v_def, p_player_id, null, null) then
      continue;
    end if;
    v_pin := public.achievement_collection_build_pin(v_def, p_player_id);
    select s.id
      into v_source
    from public.submissions s
    join public.drink_logs d on d.submission_id = s.id
    where s.status = 'accepted'
      and s.kind = 'drink_log'
      and d.offering_id in (
        select x::uuid
        from jsonb_array_elements_text(coalesce(v_pin->'offering_ids', '[]'::jsonb)) t(x)
      )
    order by s.received_at_utc desc
    limit 1;
    v_award_id := public.achievement_grant_award(
      v_def, p_player_id, null, v_source, p_player_id, v_at
    );
    if v_award_id is not null then
      perform public.achievement_collection_attach_pin(v_award_id, v_pin);
    end if;
  end loop;
end;
$$;

create or replace function public.achievement_tg_drinkit_member_enabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.enabled is true then
    return new;
  end if;
  perform public.achievement_backfill_collective_for_player(new.player_id);
  return new;
end;
$$;

drop trigger if exists achievement_drinkit_member_enabled on public.game_memberships;
create trigger achievement_drinkit_member_enabled
  after insert or update of enabled on public.game_memberships
  for each row
  when (new.game = 'drinkit' and new.enabled is true)
  execute function public.achievement_tg_drinkit_member_enabled();

comment on function public.achievement_on_void_submission(uuid) is
  'Revokes awards whose evidence no longer qualifies, then re-evaluates the voided owner. Collective collections re-grant every current Drink It! member only when the live menu is still complete. A catalog publication does not call this function. Earned collection pins ignore menu edits and fail only when a pinned offering loses its last eligible log.';

-- ---------------------------------------------------------------------------
-- Privileges. New entry points stay off the client.
-- ---------------------------------------------------------------------------
revoke all on function public.achievement_definition_is_collective(public.achievement_definitions) from public, anon, authenticated;
revoke all on function public.achievement_active_catalog_version_id() from public, anon, authenticated;
revoke all on function public.achievement_log_counts_for_collection(uuid, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.achievement_collection_required_ids(uuid, uuid) from public, anon, authenticated;
revoke all on function public.achievement_collection_resolve(jsonb) from public, anon, authenticated;
revoke all on function public.achievement_collection_covered_ids(uuid[], uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.achievement_collection_live_met_config(jsonb, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.achievement_collection_live_met(public.achievement_definitions, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.achievement_collection_build_pin(public.achievement_definitions, uuid) from public, anon, authenticated;
revoke all on function public.achievement_collection_attach_pin(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.achievement_collection_pin_covered(public.achievement_definitions, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.achievement_collection_status(uuid, uuid) from public, anon, authenticated;
revoke all on function public.achievement_eval_same_log(jsonb, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.achievement_eval_condition_as_of(jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.achievement_eval_condition_as_of_phase7b2(jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.achievement_owner_qualifies(public.achievement_definitions, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.achievement_evaluate_for_owner(public.game_id, uuid, uuid, uuid, uuid, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.achievement_backfill_collective_for_player(uuid) from public, anon, authenticated;
revoke all on function public.achievement_tg_drinkit_member_enabled() from public, anon, authenticated;

grant execute on function public.achievement_definition_is_collective(public.achievement_definitions) to service_role;
grant execute on function public.achievement_active_catalog_version_id() to service_role;
grant execute on function public.achievement_log_counts_for_collection(uuid, uuid, timestamptz, uuid) to service_role;
grant execute on function public.achievement_collection_required_ids(uuid, uuid) to service_role;
grant execute on function public.achievement_collection_resolve(jsonb) to service_role;
grant execute on function public.achievement_collection_covered_ids(uuid[], uuid, timestamptz, uuid) to service_role;
grant execute on function public.achievement_collection_live_met_config(jsonb, uuid, timestamptz, uuid) to service_role;
grant execute on function public.achievement_collection_live_met(public.achievement_definitions, uuid, timestamptz, uuid) to service_role;
grant execute on function public.achievement_collection_build_pin(public.achievement_definitions, uuid) to service_role;
grant execute on function public.achievement_collection_attach_pin(uuid, jsonb) to service_role;
grant execute on function public.achievement_collection_pin_covered(public.achievement_definitions, uuid, jsonb) to service_role;
grant execute on function public.achievement_collection_status(uuid, uuid) to service_role;
grant execute on function public.achievement_eval_same_log(jsonb, uuid, timestamptz, uuid) to service_role;
grant execute on function public.achievement_eval_condition_as_of(jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer) to service_role;
grant execute on function public.achievement_eval_condition_as_of_phase7b2(jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer) to service_role;
grant execute on function public.achievement_owner_qualifies(public.achievement_definitions, uuid, uuid, uuid) to service_role;
grant execute on function public.achievement_evaluate_for_owner(public.game_id, uuid, uuid, uuid, uuid, timestamptz, boolean) to service_role;
grant execute on function public.achievement_backfill_collective_for_player(uuid) to service_role;
grant execute on function public.achievement_tg_drinkit_member_enabled() to service_role;
