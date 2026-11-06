-- Phase 7A.1: Exclusive First qualifying-event order, historical Ship Time, dev RPC lockdown.

-- ---------------------------------------------------------------------------
-- Gate 2 helpers: historical ship-local wall from clock_offset_at (Gallery parity)
-- ---------------------------------------------------------------------------
create or replace function public.achievement_as_of_ok(
  p_received_at timestamptz,
  p_submission_id uuid,
  p_as_of_utc timestamptz,
  p_as_of_id uuid
) returns boolean
language sql
immutable
as $$
  select p_as_of_utc is null
    or (p_received_at, p_submission_id) <= (p_as_of_utc, p_as_of_id);
$$;

create or replace function public.achievement_ship_local_time(p_at_utc timestamptz)
returns time
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg public.cruise_config%rowtype;
  v_offset int;
begin
  select * into v_cfg from public.cruise_config where is_active limit 1;
  if not found then
    return (p_at_utc at time zone 'UTC')::time;
  end if;
  v_offset := public.clock_offset_at(v_cfg.id, v_cfg.base_ship_offset_minutes, p_at_utc);
  return public.utc_to_ship_local(p_at_utc, v_offset)::time;
end;
$$;

create or replace function public.achievement_ship_local_time_for_submission(p_sub public.submissions)
returns time
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base int;
  v_offset int;
begin
  select base_ship_offset_minutes into v_base
  from public.cruise_config where id = p_sub.cruise_config_id;
  if v_base is null then
    select base_ship_offset_minutes into v_base
    from public.cruise_config where is_active limit 1;
  end if;
  if v_base is null then
    return (p_sub.received_at_utc at time zone 'UTC')::time;
  end if;
  v_offset := public.clock_offset_at(
    coalesce(p_sub.cruise_config_id, (select id from public.cruise_config where is_active limit 1)),
    v_base,
    p_sub.received_at_utc
  );
  return public.utc_to_ship_local(p_sub.received_at_utc, v_offset)::time;
end;
$$;

create or replace function public.achievement_ship_local_date_for_submission(p_sub public.submissions)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base int;
  v_offset int;
  v_cfg_id uuid;
begin
  v_cfg_id := p_sub.cruise_config_id;
  select base_ship_offset_minutes into v_base from public.cruise_config where id = v_cfg_id;
  if v_base is null then
    select id, base_ship_offset_minutes into v_cfg_id, v_base
    from public.cruise_config where is_active limit 1;
  end if;
  if v_base is null then
    return (p_sub.received_at_utc at time zone 'UTC')::date;
  end if;
  v_offset := public.clock_offset_at(v_cfg_id, v_base, p_sub.received_at_utc);
  return public.utc_to_ship_local(p_sub.received_at_utc, v_offset)::date;
end;
$$;

create or replace function public.achievement_owner_has_event_count_as_of(
  p_game public.game_id,
  p_owner_player uuid,
  p_owner_team uuid,
  p_event text,
  p_threshold int,
  p_bounty_category text,
  p_drink_mode text,
  p_challenge_key text,
  p_as_of_utc timestamptz,
  p_as_of_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  if p_event = 'scavenger_completion' then
    select count(*)::int into v_count
    from public.submissions s
    join public.scavenger_completions sc on sc.submission_id = s.id
    join public.scavenger_challenges ch on ch.id = sc.challenge_id
    where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
      and s.game = 'shipit'
      and s.kind = 'scavenger_completion'
      and s.team_id = p_owner_team
      and (p_challenge_key is null or ch.canonical_key = p_challenge_key);
  elsif p_event = 'drink_log' then
    select count(*)::int into v_count
    from public.submissions s
    join public.drink_logs d on d.submission_id = s.id
    where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
      and s.game = 'drinkit'
      and s.kind = 'drink_log'
      and s.author_player_id = p_owner_player
      and (p_drink_mode is null or d.drink_mode::text = p_drink_mode);
  elsif p_event = 'daily_completion' then
    select count(*)::int into v_count
    from public.submissions s
    where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
      and s.game = 'drinkit'
      and s.kind = 'daily_completion'
      and s.author_player_id = p_owner_player;
  elsif p_event = 'bounty_claim' then
    select count(*)::int into v_count
    from public.bounty_claims bc
    join public.submissions s on s.id = bc.submission_id
    where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
      and bc.status = 'active'
      and bc.player_id = p_owner_player
      and (p_bounty_category is null or bc.category::text = p_bounty_category);
  else
    return false;
  end if;
  return v_count >= p_threshold;
end;
$$;

-- Keep unbounded event_count helper as as_of with null bounds.
create or replace function public.achievement_owner_has_event_count(
  p_game public.game_id,
  p_owner_player uuid,
  p_owner_team uuid,
  p_event text,
  p_threshold int,
  p_bounty_category text,
  p_drink_mode text,
  p_challenge_key text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.achievement_owner_has_event_count_as_of(
    p_game, p_owner_player, p_owner_team, p_event, p_threshold,
    p_bounty_category, p_drink_mode, p_challenge_key, null, null
  );
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
      if p_game = 'drinkit' then
        select count(distinct s.ship_day)::int into v_count
        from public.submissions s
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.author_player_id = p_owner_player
          and s.kind in ('drink_log', 'daily_completion');
      else
        select count(distinct s.ship_day)::int into v_count
        from public.submissions s
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and s.team_id = p_owner_team
          and s.kind = 'scavenger_completion';
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
      join public.ingredient_tags it on it.ingredient_id = coi.ingredient_id
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
    if coalesce((p_cfg->>'distinct_across_cruise')::boolean, false) then
      select count(distinct t.tag)::int into v_count
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      join public.catalog_offering_ingredients coi
        on coi.offering_id = d.offering_id and coi.catalog_version_id = d.catalog_version_id
      join public.ingredient_tags t on t.ingredient_id = coi.ingredient_id
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
        join public.drink_concept_tags t on t.drink_concept_id = d.drink_concept_id
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
            join public.ingredient_tags it on it.ingredient_id = coi.ingredient_id
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
        join public.ingredient_tags it on it.ingredient_id = coi.ingredient_id
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
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id) and later.status = 'accepted'
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
              join public.ingredient_tags it on it.ingredient_id = coi.ingredient_id
              where coi.offering_id = d.offering_id
                and coi.catalog_version_id = d.catalog_version_id
                and it.tag = p_cfg->>'require_ingredient_tag'
            )
          )
          and (
            p_cfg->>'require_drink_concept_tag' is null
            or exists (
              select 1 from public.drink_concept_tags t
              where t.drink_concept_id = d.drink_concept_id
                and t.tag = p_cfg->>'require_drink_concept_tag'
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
      -- Compare ship-local date of submission to configured thanksgiving date
      select exists (
        select 1 from public.submissions s
        where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
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
          (p_game = 'drinkit' and s.author_player_id = p_owner_player)
          or (p_game = 'shipit' and s.team_id = p_owner_team)
        )
        and (
          (p_cfg->>'which' = 'first' and s.ship_day = 1)
          or (p_cfg->>'which' = 'final' and s.ship_day = v_cruise.final_day)
        )
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  return false;
end;
$$;


revoke all on function public.achievement_eval_condition_as_of(jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, int) from public;
grant execute on function public.achievement_eval_condition_as_of(jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, int) to service_role;

-- Unbounded eval delegates to as_of with null bounds (and historical clock via helpers above).
create or replace function public.achievement_eval_condition(
  p_cfg jsonb,
  p_game public.game_id,
  p_owner_player uuid,
  p_owner_team uuid,
  p_trigger_submission uuid,
  p_depth int default 0
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.achievement_eval_condition_as_of(
    p_cfg, p_game, p_owner_player, p_owner_team, p_trigger_submission,
    null, null, p_depth
  );
$$;

revoke all on function public.achievement_eval_condition(jsonb, public.game_id, uuid, uuid, uuid, int) from public;
grant execute on function public.achievement_eval_condition(jsonb, public.game_id, uuid, uuid, uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- Gate 1: earliest QUALIFYING submission (prefix eval), not earliest any-evidence
-- ---------------------------------------------------------------------------
create or replace function public.achievement_owner_first_qualifying_submission(
  p_def public.achievement_definitions,
  p_owner_player uuid,
  p_owner_team uuid
) returns table (submission_id uuid, received_at_utc timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg jsonb := public.achievement_cfg(p_def);
  v_sub public.submissions%rowtype;
begin
  if not public.achievement_owner_qualifies(p_def, p_owner_player, p_owner_team, null) then
    return;
  end if;

  for v_sub in
    select s.*
    from public.submissions s
    where s.status = 'accepted'
      and (
        (p_def.game = 'drinkit' and s.author_player_id = p_owner_player
          and s.kind in ('drink_log', 'daily_completion'))
        or (p_def.game = 'shipit' and s.team_id = p_owner_team
          and s.kind = 'scavenger_completion')
      )
    order by s.received_at_utc asc, s.id asc
  loop
    if public.achievement_eval_condition_as_of(
      v_cfg, p_def.game, p_owner_player, p_owner_team, v_sub.id,
      v_sub.received_at_utc, v_sub.id, 0
    ) then
      submission_id := v_sub.id;
      received_at_utc := v_sub.received_at_utc;
      return next;
      return;
    end if;
  end loop;
end;
$$;

create or replace function public.achievement_exclusive_winner_candidate(
  p_def public.achievement_definitions
) returns table (owner_player_id uuid, owner_team_id uuid, evidence_submission_id uuid, evidence_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_def.game = 'drinkit' then
    return query
    with candidates as (
      select pl.id as pid
      from public.players pl
      join public.game_memberships m on m.player_id = pl.id
      where m.game = 'drinkit' and m.enabled is true and pl.active is true
    ),
    qualified as (
      select
        c.pid,
        q.submission_id as evid,
        q.received_at_utc as evid_at
      from candidates c
      cross join lateral public.achievement_owner_first_qualifying_submission(p_def, c.pid, null) q
    )
    select q.pid, null::uuid, q.evid, q.evid_at
    from qualified q
    order by q.evid_at asc, q.evid asc
    limit 1;
  else
    return query
    with candidates as (
      select t.id as tid
      from public.teams t
      where t.active is true
    ),
    qualified as (
      select
        c.tid,
        q.submission_id as evid,
        q.received_at_utc as evid_at
      from candidates c
      cross join lateral public.achievement_owner_first_qualifying_submission(p_def, null, c.tid) q
    )
    select null::uuid, q.tid, q.evid, q.evid_at
    from qualified q
    order by q.evid_at asc, q.evid asc
    limit 1;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gate 3: lock down development submission wrappers
-- ---------------------------------------------------------------------------
create or replace function public.dev_submit_scavenger_at(
  p_player_id uuid,
  p_payload jsonb,
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
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;
  return public.achievement_finalize_submit_result(
    public.shipit_submit_scavenger_core(p_player_id, p_payload, p_at_utc)
  );
end;
$$;

create or replace function public.dev_submit_drink_at(
  p_payload jsonb,
  p_at_utc timestamptz,
  p_player_id uuid
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
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;
  return public.achievement_finalize_submit_result(
    public.drinkit_submit_drink_core(p_player_id, p_payload, p_at_utc)
  );
end;
$$;

create or replace function public.dev_submit_daily_at(
  p_player_id uuid,
  p_payload jsonb,
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
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;
  return public.achievement_finalize_submit_result(
    public.drinkit_submit_daily_core(p_player_id, p_payload, p_at_utc)
  );
end;
$$;

revoke all on function public.dev_submit_scavenger_at(uuid, jsonb, timestamptz) from public;
revoke all on function public.dev_submit_scavenger_at(uuid, jsonb, timestamptz) from anon, authenticated;
grant execute on function public.dev_submit_scavenger_at(uuid, jsonb, timestamptz) to service_role;

revoke all on function public.dev_submit_drink_at(jsonb, timestamptz, uuid) from public;
revoke all on function public.dev_submit_drink_at(jsonb, timestamptz, uuid) from anon, authenticated;
grant execute on function public.dev_submit_drink_at(jsonb, timestamptz, uuid) to service_role;

revoke all on function public.dev_submit_daily_at(uuid, jsonb, timestamptz) from public;
revoke all on function public.dev_submit_daily_at(uuid, jsonb, timestamptz) from anon, authenticated;
grant execute on function public.dev_submit_daily_at(uuid, jsonb, timestamptz) to service_role;

comment on function public.dev_submit_scavenger_at(uuid, jsonb, timestamptz) is
  'Phase 7A.1: service_role + development-only timed scavenger submit for fixtures/tests.';
comment on function public.achievement_exclusive_winner_candidate(public.achievement_definitions) is
  'Phase 7A.1: exclusive winner = earliest first-qualifying submission, not earliest any-evidence.';
