-- Phase 7B1: tag log counts, drink-day filtering, recipe primitives,
-- Princess Plus ingredient corroboration (within-limit only).

-- ---------------------------------------------------------------------------
-- 1) Condition type allow-list
-- ---------------------------------------------------------------------------
create or replace function public.achievement_validate_condition_type(p_type text)
returns boolean
language sql
immutable
as $$
  select p_type in (
    'event_count', 'distinct_count', 'grouped_count', 'exact_match', 'tag_match',
    'same_submission_claims', 'set_completion', 'category_completion',
    'event_interval', 'ordered_after', 'companion_predicate',
    'ship_time_window', 'cruise_day', 'recipe_ingredient_count', 'all', 'any'
  );
$$;


-- ---------------------------------------------------------------------------
-- 2) Evaluator updates
-- ---------------------------------------------------------------------------
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
  v_child jsonb;
  v_ok boolean;
  v_count int;
  v_thresh int;
  v_sub public.submissions%rowtype;
  v_time time;
  v_cruise public.cruise_config%rowtype;
  v_key text;
  v_keys text[];
  v_cats int;
  v_full int;
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

  if v_type = 'all' then
    for v_child in select * from jsonb_array_elements(coalesce(p_cfg->'conditions', '[]'::jsonb))
    loop
      if not public.achievement_eval_condition_as_of(
        v_child, p_game, p_owner_player, p_owner_team, p_trigger_submission,
        p_as_of_utc, p_as_of_id, p_depth + 1
      ) then
        return false;
      end if;
    end loop;
    return jsonb_array_length(coalesce(p_cfg->'conditions', '[]'::jsonb)) > 0;
  end if;

  if v_type = 'any' then
    for v_child in select * from jsonb_array_elements(coalesce(p_cfg->'conditions', '[]'::jsonb))
    loop
      if public.achievement_eval_condition_as_of(
        v_child, p_game, p_owner_player, p_owner_team, p_trigger_submission,
        p_as_of_utc, p_as_of_id, p_depth + 1
      ) then
        return true;
      end if;
    end loop;
    return false;
  end if;

  if v_type = 'event_count' then
    return public.achievement_owner_has_event_count_as_of(
      p_game, p_owner_player, p_owner_team,
      p_cfg->>'event',
      greatest(1, coalesce((p_cfg->>'threshold')::int, 1)),
      p_cfg->>'bounty_category',
      p_cfg->>'drink_mode',
      p_cfg->>'challenge_key',
      p_as_of_utc, p_as_of_id
    );
  end if;

  if v_type = 'distinct_count' then
    v_thresh := greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    if p_cfg->>'subject' = 'bars' then
      select count(distinct d.bar_id)::int into v_count
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player and s.kind = 'drink_log';
      return v_count >= v_thresh;
    elsif p_cfg->>'subject' = 'drink_concepts' then
      select count(distinct d.drink_concept_id)::int into v_count
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
        and s.kind = 'drink_log' and d.drink_concept_id is not null;
      return v_count >= v_thresh;
    elsif p_cfg->>'subject' = 'cruise_days' then
      -- Default Drink It! day counts to drink_log (D-078). Opt into daily/bounty via event.
      if p_game = 'drinkit' then
        select count(distinct s.ship_day)::int into v_count
        from public.submissions s
        where s.status = 'accepted'
          and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
          and s.author_player_id = p_owner_player
          and s.kind = coalesce(nullif(p_cfg->>'event', ''), 'drink_log');
      else
        select count(distinct s.ship_day)::int into v_count
        from public.submissions s
        where s.status = 'accepted'
          and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
          and s.team_id = p_owner_team
          and s.kind = coalesce(nullif(p_cfg->>'event', ''), 'scavenger_completion');
      end if;
      return v_count >= v_thresh;
    elsif p_cfg->>'subject' = 'companions' then
      select count(distinct dc.companion_player_id)::int into v_count
      from public.submissions s
      join public.drink_log_companions dc on dc.submission_id = s.id
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player;
      return v_count >= v_thresh;
    elsif p_cfg->>'subject' = 'bounty_categories' then
      select count(distinct bc.category)::int into v_count
      from public.bounty_claims bc
      join public.submissions s on s.id = bc.submission_id
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and bc.status = 'active' and bc.player_id = p_owner_player;
      return v_count >= v_thresh;
    elsif p_cfg->>'subject' = 'scavenger_categories' then
      select count(distinct ch.category)::int into v_count
      from public.submissions s
      join public.scavenger_completions sc on sc.submission_id = s.id
      join public.scavenger_challenges ch on ch.id = sc.challenge_id
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.team_id = p_owner_team;
      return v_count >= v_thresh;
    elsif p_cfg->>'subject' = 'drink_modes' then
      select count(distinct d.drink_mode)::int into v_count
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player;
      return v_count >= v_thresh;
    elsif p_cfg->>'subject' = 'ingredient_tags' then
      -- Distinct tags from configured list encountered across logged cocktails.
      select count(distinct it.tag)::int into v_count
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      join public.catalog_offering_ingredients coi
        on coi.offering_id = d.offering_id
       and coi.catalog_version_id = d.catalog_version_id
      join public.catalog_version_ingredient_tags it
        on it.ingredient_id = coi.ingredient_id
       and it.catalog_version_id = d.catalog_version_id
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.author_player_id = p_owner_player
        and d.offering_id is not null
        and (
          p_cfg->'tags' is null
          or it.tag in (select jsonb_array_elements_text(p_cfg->'tags'))
        );
      return v_count >= v_thresh;
    end if;
    return false;
  end if;

  if v_type = 'grouped_count' then
    v_thresh := greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    if p_cfg->>'mode' = 'events_same_day' then
      select coalesce(max(c), 0)::int into v_count
      from (
        select count(*) as c
        from public.submissions s
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
          and (
            (p_game = 'shipit' and s.team_id = p_owner_team and s.kind = 'scavenger_completion')
            or (p_game = 'drinkit' and s.author_player_id = p_owner_player and s.kind = 'drink_log')
          )
        group by s.ship_day
      ) t;
      return v_count >= v_thresh;
    elsif p_cfg->>'mode' = 'same_bar_distinct_days' then
      select coalesce(max(c), 0)::int into v_count
      from (
        select count(distinct s.ship_day) as c
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
        group by d.bar_id
      ) t;
      return v_count >= v_thresh;
    elsif p_cfg->>'mode' = 'distinct_cocktails_one_bar' then
      select coalesce(max(c), 0)::int into v_count
      from (
        select count(distinct d.drink_concept_id) as c
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
          and d.drink_concept_id is not null
        group by d.bar_id
      ) t;
      return v_count >= v_thresh;
    elsif p_cfg->>'mode' = 'bars_same_day' then
      select coalesce(max(c), 0)::int into v_count
      from (
        select count(distinct d.bar_id) as c
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
        group by s.ship_day
      ) t;
      return v_count >= v_thresh;
    end if;
    return false;
  end if;

  if v_type = 'exact_match' then
    if p_cfg->>'challenge_key' is not null then
      return public.achievement_owner_has_event_count_as_of(
        p_game, p_owner_player, p_owner_team, 'scavenger_completion', 1,
        null, null, p_cfg->>'challenge_key', p_as_of_utc, p_as_of_id
      );
    end if;
    if p_cfg->>'drink_mode' is not null then
      return public.achievement_owner_has_event_count_as_of(
        p_game, p_owner_player, p_owner_team, 'drink_log', 1,
        null, p_cfg->>'drink_mode', null, p_as_of_utc, p_as_of_id
      );
    end if;
    if p_cfg->>'ingredient_key' is not null then
      select exists (
        select 1
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        join public.catalog_offering_ingredients coi
          on coi.offering_id = d.offering_id and coi.catalog_version_id = d.catalog_version_id
        join public.ingredients i on i.id = coi.ingredient_id
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
          and i.canonical_key = p_cfg->>'ingredient_key'
      ) into v_ok;
      return coalesce(v_ok, false);
    end if;
    if p_cfg->>'drink_concept_key' is not null then
      select exists (
        select 1
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        join public.drink_concepts dc on dc.id = d.drink_concept_id
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
          and dc.canonical_key = p_cfg->>'drink_concept_key'
      ) into v_ok;
      return coalesce(v_ok, false);
    end if;
    return false;
  end if;

  if v_type = 'tag_match' then
    -- Without curated tags, this returns false (never invent classifications).

    -- Count qualifying drink logs containing any listed tag (each log once).
    if coalesce((p_cfg->>'count_logs')::boolean, false) then
      select count(distinct s.id)::int into v_count
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.author_player_id = p_owner_player
        and s.kind = 'drink_log'
        and d.offering_id is not null
        and exists (
          select 1
          from public.catalog_offering_ingredients coi
          join public.catalog_version_ingredient_tags it
            on it.ingredient_id = coi.ingredient_id
           and it.catalog_version_id = d.catalog_version_id
          where coi.offering_id = d.offering_id
            and coi.catalog_version_id = d.catalog_version_id
            and it.tag in (select jsonb_array_elements_text(p_cfg->'tags'))
        );
      return v_count >= greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    end if;

    -- One cocktail with at least N distinct tags from the configured set (D-063 / D-064).
    if coalesce((p_cfg->>'min_distinct_on_log')::boolean, false) then
      select exists (
        select 1
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        where s.status = 'accepted'
          and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
          and s.author_player_id = p_owner_player
          and s.kind = 'drink_log'
          and d.offering_id is not null
          and (
            select count(distinct it.tag)
            from public.catalog_offering_ingredients coi
            join public.catalog_version_ingredient_tags it
              on it.ingredient_id = coi.ingredient_id
             and it.catalog_version_id = d.catalog_version_id
            where coi.offering_id = d.offering_id
              and coi.catalog_version_id = d.catalog_version_id
              and it.tag in (select jsonb_array_elements_text(p_cfg->'tags'))
          ) >= greatest(1, coalesce((p_cfg->>'threshold')::int, 2))
      ) into v_ok;
      return coalesce(v_ok, false);
    end if;

    if coalesce((p_cfg->>'distinct_across_cruise')::boolean, false) then
      select count(distinct t.tag)::int into v_count
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      join public.catalog_offering_ingredients coi
        on coi.offering_id = d.offering_id and coi.catalog_version_id = d.catalog_version_id
      join public.catalog_version_ingredient_tags t
        on t.ingredient_id = coi.ingredient_id
       and t.catalog_version_id = d.catalog_version_id
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
        and t.tag in (select jsonb_array_elements_text(p_cfg->'tags'));
      return v_count >= greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    end if;
    if p_cfg->>'scope' = 'drink_concept' then
      select exists (
        select 1
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        join lateral (
          select tag from public.catalog_version_drink_concept_tags dct
          where dct.drink_concept_id = d.drink_concept_id
            and dct.catalog_version_id = d.catalog_version_id
          union
          select tag from public.catalog_version_offering_tags ot
          where ot.offering_id = d.offering_id
            and ot.catalog_version_id = d.catalog_version_id
        ) t on true
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
          and t.tag in (select jsonb_array_elements_text(p_cfg->'tags'))
      ) into v_ok;
      return coalesce(v_ok, false);
    end if;
    -- ingredient scope: one cocktail containing required tags
    if coalesce(p_cfg->>'match', 'any') = 'all' then
      select exists (
        select 1
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
          and d.offering_id is not null
          and (
            select count(distinct it.tag)
            from public.catalog_offering_ingredients coi
            join public.catalog_version_ingredient_tags it
              on it.ingredient_id = coi.ingredient_id
             and it.catalog_version_id = d.catalog_version_id
            where coi.offering_id = d.offering_id
              and coi.catalog_version_id = d.catalog_version_id
              and it.tag in (select jsonb_array_elements_text(p_cfg->'tags'))
          ) >= jsonb_array_length(p_cfg->'tags')
      ) into v_ok;
    else
      select exists (
        select 1
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        join public.catalog_offering_ingredients coi
          on coi.offering_id = d.offering_id and coi.catalog_version_id = d.catalog_version_id
        join public.catalog_version_ingredient_tags it
              on it.ingredient_id = coi.ingredient_id
             and it.catalog_version_id = coi.catalog_version_id
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
          and it.tag in (select jsonb_array_elements_text(p_cfg->'tags'))
      ) into v_ok;
    end if;
    return coalesce(v_ok, false);
  end if;

  if v_type = 'same_submission_claims' then
    select exists (
      select 1
      from public.submissions s
      join public.bounty_claims bc on bc.submission_id = s.id and bc.status = 'active'
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
      group by s.id
      having count(distinct bc.category) >= greatest(
        1,
        coalesce(
          (p_cfg->>'min_categories')::int,
          jsonb_array_length(coalesce(p_cfg->'require_categories', '[]'::jsonb))
        )
      )
      and (
        p_cfg->'require_categories' is null
        or (
          select count(*) from jsonb_array_elements_text(p_cfg->'require_categories') req
          where req in (
            select bc2.category::text from public.bounty_claims bc2
            where bc2.submission_id = s.id and bc2.status = 'active'
          )
        ) >= jsonb_array_length(p_cfg->'require_categories')
      )
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  if v_type = 'set_completion' then
    if p_cfg->>'scope' = 'all_scavenger_challenges' then
      select count(*)::int into v_count
      from public.scavenger_challenges ch
      where ch.enabled is true;
      select count(distinct sc.challenge_id)::int into v_full
      from public.submissions s
      join public.scavenger_completions sc on sc.submission_id = s.id
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.team_id = p_owner_team;
      return v_full >= v_count and v_count > 0;
    end if;
    select array_agg(x) into v_keys
    from jsonb_array_elements_text(coalesce(p_cfg->'challenge_keys', '[]'::jsonb)) t(x);
    if v_keys is null or array_length(v_keys, 1) is null then
      return false;
    end if;
    select count(distinct ch.canonical_key)::int into v_count
    from public.submissions s
    join public.scavenger_completions sc on sc.submission_id = s.id
    join public.scavenger_challenges ch on ch.id = sc.challenge_id
    where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.team_id = p_owner_team
      and ch.canonical_key = any (v_keys);
    return v_count >= array_length(v_keys, 1);
  end if;

  if v_type = 'category_completion' then
    if p_cfg->>'mode' = 'one_per_category' then
      select count(distinct ch.category)::int into v_cats
      from public.scavenger_challenges ch where ch.enabled;
      select count(distinct ch.category)::int into v_count
      from public.submissions s
      join public.scavenger_completions sc on sc.submission_id = s.id
      join public.scavenger_challenges ch on ch.id = sc.challenge_id
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.team_id = p_owner_team;
      return v_count >= v_cats and v_cats > 0;
    end if;
    -- full_any_category
    select exists (
      select 1
      from public.scavenger_challenges ch
      where ch.enabled
      group by ch.category
      having count(*) = (
        select count(distinct sc.challenge_id)
        from public.submissions s
        join public.scavenger_completions sc on sc.submission_id = s.id
        join public.scavenger_challenges ch2 on ch2.id = sc.challenge_id
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.team_id = p_owner_team
          and ch2.category = ch.category
      )
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  if v_type = 'event_interval' then
    -- Find any two accepted events satisfying interval constraints.
    if p_cfg->>'event' = 'scavenger_completion' then
      select exists (
        select 1
        from public.submissions a
        join public.submissions b on b.team_id = a.team_id and b.id <> a.id
        where a.status = 'accepted'
        and public.achievement_as_of_ok(a.received_at_utc, a.id, p_as_of_utc, p_as_of_id) and b.status = 'accepted'
        and public.achievement_as_of_ok(b.received_at_utc, b.id, p_as_of_utc, p_as_of_id)
          and a.team_id = p_owner_team
          and a.kind = 'scavenger_completion' and b.kind = 'scavenger_completion'
          and b.received_at_utc >= a.received_at_utc
          and (
            p_cfg->>'max_minutes' is null
            or b.received_at_utc <= a.received_at_utc
              + make_interval(mins => (p_cfg->>'max_minutes')::int)
          )
          and (
            p_cfg->>'min_minutes' is null
            or b.received_at_utc >= a.received_at_utc
              + make_interval(mins => (p_cfg->>'min_minutes')::int)
          )
      ) into v_ok;
      return coalesce(v_ok, false);
    end if;
    select exists (
      select 1
      from public.submissions a
      join public.drink_logs da on da.submission_id = a.id
      join public.submissions b on b.author_player_id = a.author_player_id and b.id <> a.id
      join public.drink_logs db on db.submission_id = b.id
      where a.status = 'accepted'
        and public.achievement_as_of_ok(a.received_at_utc, a.id, p_as_of_utc, p_as_of_id) and b.status = 'accepted'
        and public.achievement_as_of_ok(b.received_at_utc, b.id, p_as_of_utc, p_as_of_id)
        and a.author_player_id = p_owner_player
        and a.kind = 'drink_log' and b.kind = 'drink_log'
        and b.received_at_utc >= a.received_at_utc
        and (
          p_cfg->>'max_minutes' is null
          or b.received_at_utc <= a.received_at_utc
            + make_interval(mins => (p_cfg->>'max_minutes')::int)
        )
        and (
          p_cfg->>'min_minutes' is null
          or b.received_at_utc >= a.received_at_utc
            + make_interval(mins => (p_cfg->>'min_minutes')::int)
        )
        and (coalesce((p_cfg->>'same_bar')::boolean, false) is false or da.bar_id = db.bar_id)
        and (
          coalesce((p_cfg->>'same_drink_concept')::boolean, false) is false
          or (da.drink_concept_id is not null and da.drink_concept_id = db.drink_concept_id)
        )
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  if v_type = 'ordered_after' then
    -- Cocktail claim on concept, then later drink_log of same concept.
    select exists (
      select 1
      from public.bounty_claims bc
      join public.submissions cs on cs.id = bc.submission_id
      join public.drink_logs cd on cd.submission_id = cs.id
      join public.submissions later on later.author_player_id = cs.author_player_id
      join public.drink_logs ld on ld.submission_id = later.id
      where bc.status = 'active' and bc.category = 'cocktail'
        and cs.status = 'accepted'
        and public.achievement_as_of_ok(cs.received_at_utc, cs.id, p_as_of_utc, p_as_of_id)
        and later.status = 'accepted'
        and public.achievement_as_of_ok(later.received_at_utc, later.id, p_as_of_utc, p_as_of_id)
        and cs.author_player_id = p_owner_player
        and cd.drink_concept_id is not null
        and ld.drink_concept_id = cd.drink_concept_id
        and later.received_at_utc > cs.received_at_utc
        and later.id is distinct from cs.id
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  if v_type = 'companion_predicate' then
    if p_cfg->>'mode' = 'min_companions' then
      select exists (
        select 1
        from public.submissions s
        join public.drink_log_companions dc on dc.submission_id = s.id
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
        group by s.id
        having count(*) >= greatest(1, coalesce((p_cfg->>'threshold')::int, 1))
      ) into v_ok;
      return coalesce(v_ok, false);
    elsif p_cfg->>'mode' = 'distinct_companions' then
      select count(distinct dc.companion_player_id)::int into v_count
      from public.submissions s
      join public.drink_log_companions dc on dc.submission_id = s.id
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player;
      return v_count >= greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    elsif p_cfg->>'mode' = 'same_companion_distinct_bars' then
      select exists (
        select 1
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        join public.drink_log_companions dc on dc.submission_id = s.id
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
        group by dc.companion_player_id
        having count(distinct d.bar_id) >= greatest(1, coalesce((p_cfg->>'threshold')::int, 3))
      ) into v_ok;
      return coalesce(v_ok, false);
    elsif p_cfg->>'mode' = 'named_companion' then
      if p_cfg->>'companion_player_id' is null then
        return false;
      end if;
      select exists (
        select 1
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        join public.drink_log_companions dc on dc.submission_id = s.id
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
          and dc.companion_player_id = (p_cfg->>'companion_player_id')::uuid
          and (
            p_cfg->>'require_drink_mode' is null
            or d.drink_mode::text = p_cfg->>'require_drink_mode'
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
      ) into v_ok;
      return coalesce(v_ok, false);
    end if;
    return false;
  end if;

  if v_type = 'ship_time_window' then
    select * into v_cruise from public.cruise_config where is_active limit 1;
    select exists (
      select 1
      from public.submissions s
      where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and (
          (p_game = 'drinkit' and s.author_player_id = p_owner_player
            and s.kind = coalesce(nullif(p_cfg->>'event', ''), 'drink_log'))
          or (p_game = 'shipit' and s.team_id = p_owner_team
            and s.kind = 'scavenger_completion')
        )
        and (
          p_cfg->>'before_hour' is null
          or public.achievement_ship_local_time_for_submission(s)
            < make_time((p_cfg->>'before_hour')::int, 0, 0)
        )
        and (
          p_cfg->>'after_hour' is null
          or public.achievement_ship_local_time_for_submission(s)
            >= make_time((p_cfg->>'after_hour')::int, 0, 0)
        )
        and (
          p_cfg->>'hour_start' is null
          or (
            public.achievement_ship_local_time_for_submission(s)
              >= make_time((p_cfg->>'hour_start')::int, 0, 0)
            and public.achievement_ship_local_time_for_submission(s)
              < make_time((p_cfg->>'hour_end')::int, 0, 0)
          )
        )
        and (
          coalesce((p_cfg->>'port_day_only')::boolean, false) is false
          or s.ship_day = any (coalesce(v_cruise.port_days, '{}'::int[]))
        )
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  if v_type = 'cruise_day' then
    select * into v_cruise from public.cruise_config where is_active limit 1;
    if p_cfg->>'which' = 'thanksgiving' then
      if v_cruise.thanksgiving_ship_date is null then
        return false;
      end if;
      -- Drink It!: accepted drink_log on Thanksgiving ship-local date.
      select exists (
        select 1 from public.submissions s
        where s.status = 'accepted'
          and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
          and s.kind = 'drink_log'
          and s.author_player_id = p_owner_player
          and public.achievement_ship_local_date_for_submission(s) = v_cruise.thanksgiving_ship_date
      ) into v_ok;
      return coalesce(v_ok, false);
    end if;
    select exists (
      select 1 from public.submissions s
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and (
          (p_game = 'drinkit'
            and s.author_player_id = p_owner_player
            and s.kind = 'drink_log')
          or (p_game = 'shipit'
            and s.team_id = p_owner_team
            and s.kind = 'scavenger_completion')
        )
        and (
          (p_cfg->>'which' = 'first' and s.ship_day = 1)
          or (p_cfg->>'which' = 'final' and s.ship_day = v_cruise.final_day)
        )
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  if v_type = 'recipe_ingredient_count' then
    v_thresh := greatest(1, coalesce((p_cfg->>'threshold')::int, 7));
    select exists (
      select 1
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.author_player_id = p_owner_player
        and s.kind = 'drink_log'
        and d.offering_id is not null
        and d.catalog_version_id is not null
        and (
          select count(*)::int
          from public.catalog_offering_ingredients coi
          where coi.offering_id = d.offering_id
            and coi.catalog_version_id = d.catalog_version_id
        ) >= v_thresh
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  return false;
end;
$$;

revoke all on function public.achievement_eval_condition_as_of(jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, int) from public;
grant execute on function public.achievement_eval_condition_as_of(jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- 3) Ingredient pool: Princess Plus within-limit evidence only
-- ---------------------------------------------------------------------------
-- Over-$15 and unverified prices do not corroborate Ingredient Bounty attainability.
create or replace function public.catalog_payload_ingredient_pool(p_payload jsonb)
returns table (
  ingredient_key text,
  known_bar_count integer,
  distinct_qualifying_drinks integer,
  tier text,
  points integer,
  eligible boolean
)
language sql
stable
set search_path = public
as $$
  with
  active_bars as (
    select b->>'key' as bar_key
    from jsonb_array_elements(p_payload->'bars') b
    where coalesce((b->>'active')::boolean, true)
  ),
  within_limit_offerings as (
    select
      d->>'key' as drink_key,
      o->>'bar_key' as bar_key,
      coalesce(
        array(select jsonb_array_elements_text(coalesce(o->'ingredient_keys', '[]'::jsonb))),
        array[]::text[]
      ) as ingredient_keys
    from jsonb_array_elements(p_payload->'drinks') d
    cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o
    where d->>'kind' = 'named_cocktail'
      and o->>'bar_key' in (select bar_key from active_bars)
      and o->>'price_status' = 'verified_within_limit'
      and nullif(o->>'price_usd', '')::numeric is not null
      and nullif(o->>'price_usd', '')::numeric <= 15
  ),
  evidence as (
    select
      c->>'ingredient_key' as ingredient_key,
      (c->>'known_bar_count')::integer as known_bar_count,
      (c->>'distinct_qualifying_drinks')::integer as distinct_qualifying_drinks,
      c->>'tier' as tier,
      (c->>'points')::integer as points,
      coalesce((c->>'eligible')::boolean, true) as want_eligible,
      (
        select count(distinct w.bar_key)
        from within_limit_offerings w
        where (c->>'ingredient_key') = any (w.ingredient_keys)
      ) as corr_bars,
      (
        select count(distinct w.drink_key)
        from within_limit_offerings w
        where (c->>'ingredient_key') = any (w.ingredient_keys)
      ) as corr_drinks
    from jsonb_array_elements(p_payload->'ingredient_candidates') c
  )
  select
    e.ingredient_key,
    e.known_bar_count,
    e.distinct_qualifying_drinks,
    e.tier,
    e.points,
    (
      e.want_eligible
      and e.corr_bars >= 2
      and e.corr_drinks >= 1
      and e.known_bar_count = e.corr_bars
      and e.distinct_qualifying_drinks = e.corr_drinks
    ) as eligible
  from evidence e
$$;

revoke all on function public.catalog_payload_ingredient_pool(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_payload_ingredient_pool(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 4) Stage rejects invalid ingredient/cocktail evidence even when pool size is OK
-- ---------------------------------------------------------------------------
create or replace function public.admin_stage_catalog_import(
  p_client_request_id uuid,
  p_payload jsonb,
  p_validation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.require_admin();
  v_hash text;
  v_existing public.catalog_import_candidates%rowtype;
  v_catalog_id text;
  v_base text;
  v_refs jsonb;
  v_cocktail_eligible integer;
  v_ingredient_eligible integer;
  v_warnings jsonb := '[]'::jsonb;
  v_class_err jsonb;
  v_bad_ing integer;
  v_bad_ck integer;
  v_candidate uuid;
  v_preview jsonb;
begin
  if p_client_request_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_ID');
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'PAYLOAD_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(hashtext('catalog_stage'), hashtext(p_client_request_id::text));

  v_hash := public.catalog_payload_sha256(p_payload);

  select * into v_existing
  from public.catalog_import_candidates
  where stage_request_id = p_client_request_id;
  if found then
    if v_existing.payload_hash is distinct from v_hash then
      return jsonb_build_object('ok', false, 'code', 'REQUEST_ID_OPERATION_MISMATCH');
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'candidate_id', v_existing.id,
      'catalog_id', v_existing.catalog_id,
      'payload_hash', v_existing.payload_hash,
      'status', v_existing.status,
      'client_request_id', p_client_request_id
    );
  end if;

  if not public.catalog_schema_version_ok(p_payload->>'schema_version') then
    return jsonb_build_object('ok', false, 'code', 'SCHEMA_VERSION');
  end if;
  if p_payload->>'mode' is distinct from 'full_snapshot' then
    return jsonb_build_object('ok', false, 'code', 'MODE');
  end if;

  v_catalog_id := p_payload->>'catalog_id';
  if v_catalog_id is null or v_catalog_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    return jsonb_build_object('ok', false, 'code', 'CATALOG_ID_INVALID');
  end if;

  v_base := nullif(p_payload->>'base_catalog_id', '');
  if v_base is not null then
    if v_base !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
      return jsonb_build_object('ok', false, 'code', 'BASE_CATALOG_INVALID');
    end if;
    if v_base = v_catalog_id then
      return jsonb_build_object('ok', false, 'code', 'BASE_CATALOG_SELF');
    end if;
    if not exists (select 1 from public.catalog_versions where catalog_id = v_base) then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'code', 'BASE_CATALOG_UNKNOWN',
        'message', 'base_catalog_id does not match any local catalog version.'
      ));
    end if;
  end if;

  if not public.catalog_payload_shape_ok(p_payload) then
    return jsonb_build_object('ok', false, 'code', 'PAYLOAD_SHAPE');
  end if;

  v_refs := public.catalog_payload_reference_errors(p_payload);
  if jsonb_array_length(v_refs) > 0 then
    return jsonb_build_object('ok', false, 'code', 'PAYLOAD_REFERENCE_ERROR', 'errors', v_refs);
  end if;

  v_class_err := public.catalog_payload_classification_errors(p_payload);
  if jsonb_array_length(v_class_err) > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'CLASSIFICATION_TAG_INVALID',
      'errors', v_class_err
    );
  end if;

  if p_validation is null or jsonb_typeof(p_validation) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_REQUIRED');
  end if;
  if p_validation->>'readiness' is distinct from 'ready_for_scheduling' then
    return jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_NOT_READY',
      'readiness', p_validation->>'readiness'
    );
  end if;
  if coalesce((p_validation->>'error_count')::integer, 0) > 0 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERRORS');
  end if;
  if p_validation->>'payload_hash' is not null
     and p_validation->>'payload_hash' is distinct from v_hash then
    return jsonb_build_object(
      'ok', false, 'code', 'PAYLOAD_HASH_MISMATCH',
      'server_payload_hash', v_hash
    );
  end if;

  -- Server-side pool recount (client summary is advisory only). 72 / 39 are the schedule slot totals.
  select count(*) into v_cocktail_eligible
  from public.catalog_payload_cocktail_pool(p_payload) c where c.eligible;
  select count(*) into v_ingredient_eligible
  from public.catalog_payload_ingredient_pool(p_payload) c where c.eligible;

  if v_cocktail_eligible < 72 or v_ingredient_eligible < 39 then
    return jsonb_build_object(
      'ok', false,
      'code', 'POOL_SHORTAGE',
      'cocktail_eligible', v_cocktail_eligible,
      'cocktail_required', 72,
      'ingredient_eligible', v_ingredient_eligible,
      'ingredient_required', 39
    );
  end if;

  -- Every ingredient_candidate that claims eligible must pass within-limit corroboration.
  select count(*)::integer into v_bad_ing
  from jsonb_array_elements(p_payload->'ingredient_candidates') x
  where coalesce((x->>'eligible')::boolean, true)
    and not exists (
      select 1
      from public.catalog_payload_ingredient_pool(p_payload) c
      where c.ingredient_key = x->>'ingredient_key'
        and c.eligible
    );
  if v_bad_ing > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INGREDIENT_EVIDENCE_INVALID',
      'invalid_ingredient_candidates', v_bad_ing
    );
  end if;

  -- Cocktail candidates that claim eligible must pass within-limit cocktail pool rules.
  select count(*)::integer into v_bad_ck
  from jsonb_array_elements(p_payload->'cocktail_candidates') x
  where coalesce((x->>'eligible')::boolean, true)
    and not exists (
      select 1
      from public.catalog_payload_cocktail_pool(p_payload) c
      where c.drink_key = x->>'drink_key'
        and c.bar_key = x->>'designated_bar_key'
        and c.eligible
    );
  if v_bad_ck > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'COCKTAIL_EVIDENCE_INVALID',
      'invalid_cocktail_candidates', v_bad_ck
    );
  end if;

  if exists (select 1 from public.catalog_versions where catalog_id = v_catalog_id) then
    return jsonb_build_object('ok', false, 'code', 'CATALOG_ID_EXISTS', 'catalog_id', v_catalog_id);
  end if;

  v_preview := p_validation || jsonb_build_object(
    'server_payload_hash', v_hash,
    'server_pool', jsonb_build_object(
      'cocktail_eligible', v_cocktail_eligible,
      'ingredient_eligible', v_ingredient_eligible
    )
  );

  update public.catalog_import_candidates
  set status = 'abandoned'
  where catalog_id = v_catalog_id and status = 'staged';

  insert into public.catalog_import_candidates (
    catalog_id, base_catalog_id, payload_hash, payload_json, preview_json,
    validation_fingerprint, status, stage_request_id, created_by
  ) values (
    v_catalog_id, v_base, v_hash, p_payload, v_preview,
    p_validation->>'fingerprint', 'staged', p_client_request_id, v_actor
  )
  returning id into v_candidate;

  perform public.write_admin_audit(
    'catalog.stage_import', v_actor, 'catalog_import_candidates', v_candidate::text,
    null,
    jsonb_build_object('catalog_id', v_catalog_id, 'payload_hash', v_hash)
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'candidate_id', v_candidate,
    'catalog_id', v_catalog_id,
    'base_catalog_id', v_base,
    'payload_hash', v_hash,
    'status', 'staged',
    'pool', jsonb_build_object(
      'cocktail_eligible', v_cocktail_eligible,
      'ingredient_eligible', v_ingredient_eligible
    ),
    'warnings', v_warnings,
    'client_request_id', p_client_request_id
  );
end;
$$;




revoke all on function public.admin_stage_catalog_import(uuid, jsonb, jsonb) from public;
grant execute on function public.admin_stage_catalog_import(uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.admin_stage_catalog_import(uuid, jsonb, jsonb) from anon;
