-- Phase 7B2: working-catalog evaluator corrections + fruit-specific tags.
-- Adds grouped_count modes for same-cocktail repeats/bars and same-day bounty
-- categories; distinct_count bounty_claim_days; expands fruit tag vocabulary.

create or replace function public.catalog_approved_ingredient_classification_tags()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'spirit-family-gin','spirit-family-vodka','spirit-family-rum','spirit-family-tequila',
    'spirit-family-mezcal','spirit-family-whiskey','spirit-family-bourbon','spirit-family-brandy',
    'spirit-family-cognac','spirit-family-liqueur','spirit-family-other',
    'spirit-clear','spirit-dark',
    'rum-style-white','rum-style-gold','rum-style-dark','rum-style-spiced','rum-style-aged','rum-style-overproof',
    'fruit','fruit-citrus','fruit-berry','fruit-tropical',
    'fruit-pineapple','fruit-mango','fruit-passion-fruit','fruit-guava','fruit-dragon-fruit','fruit-lychee',
    'hot-pepper','wine','rose','prosecco','champagne'
  ]::text[];
$$;

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
    elsif p_cfg->>'subject' = 'bounty_claim_days' then
      -- D-014…D-017: distinct days with an active bounty claim (optional category)
      select count(distinct bc.game_day)::int into v_count
      from public.bounty_claims bc
      join public.submissions s on s.id = bc.submission_id
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and bc.status = 'active'
        and bc.player_id = p_owner_player
        and (
          p_cfg->>'bounty_category' is null
          or bc.category::text = p_cfg->>'bounty_category'
        );
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
    elsif p_cfg->>'mode' = 'same_cocktail_logs' then
      -- D-030: same named cocktail logged N times
      select coalesce(max(c), 0)::int into v_count
      from (
        select count(*) as c
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        where s.status = 'accepted'
          and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
          and s.author_player_id = p_owner_player
          and s.kind = 'drink_log'
          and d.drink_concept_id is not null
        group by d.drink_concept_id
      ) t;
      return v_count >= v_thresh;
    elsif p_cfg->>'mode' = 'same_cocktail_distinct_bars' then
      -- D-025: same named cocktail at N distinct bars
      select coalesce(max(c), 0)::int into v_count
      from (
        select count(distinct d.bar_id) as c
        from public.submissions s
        join public.drink_logs d on d.submission_id = s.id
        where s.status = 'accepted'
          and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
          and s.author_player_id = p_owner_player
          and s.kind = 'drink_log'
          and d.drink_concept_id is not null
        group by d.drink_concept_id
      ) t;
      return v_count >= v_thresh;
    elsif p_cfg->>'mode' = 'bounty_categories_same_day' then
      -- D-013: N distinct bounty categories on one cruise day
      select coalesce(max(c), 0)::int into v_count
      from (
        select count(distinct bc.category) as c
        from public.bounty_claims bc
        join public.submissions s on s.id = bc.submission_id
        where s.status = 'accepted'
          and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
          and bc.status = 'active'
          and bc.player_id = p_owner_player
        group by bc.game_day
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
          and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
          and s.author_player_id = p_owner_player
          and s.kind = 'drink_log'
          and (
            p_cfg->>'ship_hour_start' is null
            or public.achievement_ship_local_time_for_submission(s)
                 >= make_time((p_cfg->>'ship_hour_start')::int, 0, 0)
          )
          and (
            p_cfg->>'ship_hour_end' is null
            or public.achievement_ship_local_time_for_submission(s)
                 < make_time((p_cfg->>'ship_hour_end')::int, 0, 0)
          )
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
-- Dev-only upsert for working achievement definitions (idempotent by stable_key)
-- ---------------------------------------------------------------------------
create or replace function public.dev_upsert_working_achievement_definition(p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cruise text;
begin
  select label into v_cruise from public.cruise_config where is_active limit 1;
  if v_cruise is distinct from 'development-only' then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.achievement_definitions (
    stable_key, game, owner_type, group_key, title, display_description,
    secret, exclusive, icon_key, enabled, condition_type, condition_config, test_only
  ) values (
    p_row->>'stable_key',
    (p_row->>'game')::public.game_id,
    (p_row->>'owner_type')::public.achievement_owner_type,
    coalesce((p_row->>'group_key')::public.achievement_group, 'other'),
    p_row->>'title',
    p_row->>'display_description',
    coalesce((p_row->>'secret')::boolean, false),
    coalesce((p_row->>'exclusive')::boolean, false),
    nullif(p_row->>'icon_key', ''),
    coalesce((p_row->>'enabled')::boolean, false),
    p_row->>'condition_type',
    coalesce(p_row->'condition_config', '{}'::jsonb),
    coalesce((p_row->>'test_only')::boolean, true)
  )
  on conflict (stable_key) do update set
    game = excluded.game,
    owner_type = excluded.owner_type,
    group_key = excluded.group_key,
    title = excluded.title,
    display_description = excluded.display_description,
    secret = excluded.secret,
    exclusive = excluded.exclusive,
    icon_key = excluded.icon_key,
    enabled = excluded.enabled,
    condition_type = excluded.condition_type,
    condition_config = excluded.condition_config,
    test_only = excluded.test_only,
    updated_at = now()
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'stable_key', p_row->>'stable_key');
end;
$$;

revoke all on function public.dev_upsert_working_achievement_definition(jsonb) from public;
grant execute on function public.dev_upsert_working_achievement_definition(jsonb) to service_role;

create or replace function public.dev_disable_missing_working_achievements(p_keep_keys text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
  v_cruise text;
begin
  select label into v_cruise from public.cruise_config where is_active limit 1;
  if v_cruise is distinct from 'development-only' then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '')
       is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = 'P0001';
  end if;

  update public.achievement_definitions
  set enabled = false, updated_at = now()
  where test_only = true
    and stable_key like 'working-%'
    and not (stable_key = any (p_keep_keys));

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'disabled', v_n);
end;
$$;

revoke all on function public.dev_disable_missing_working_achievements(text[]) from public;
grant execute on function public.dev_disable_missing_working_achievements(text[]) to service_role;
