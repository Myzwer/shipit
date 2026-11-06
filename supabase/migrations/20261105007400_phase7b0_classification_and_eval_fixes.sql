-- Phase 7B0: Achievement evaluator corrections + versioned classification metadata.
-- Gate 1: fix ordered_after bogus "s" alias; Drink It! cruise_day requires drink_log.
-- Gates 2–4: versioned ingredient/drink/offering tags from full_snapshot; historical eval.

-- ---------------------------------------------------------------------------
-- 1) Versioned classification tables (historical; never rewrite prior versions)
-- ---------------------------------------------------------------------------
create table public.catalog_version_ingredient_tags (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  tag text not null,
  primary key (catalog_version_id, ingredient_id, tag),
  constraint catalog_version_ingredient_tags_format check (tag ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.catalog_version_drink_concept_tags (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  drink_concept_id uuid not null references public.drink_concepts (id) on delete cascade,
  tag text not null,
  primary key (catalog_version_id, drink_concept_id, tag),
  constraint catalog_version_drink_concept_tags_format check (tag ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.catalog_version_offering_tags (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  offering_id uuid not null references public.bar_offerings (id) on delete cascade,
  tag text not null,
  primary key (catalog_version_id, offering_id, tag),
  constraint catalog_version_offering_tags_format check (tag ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

comment on table public.catalog_version_ingredient_tags is
  'Version-scoped ingredient classifications for achievement eval. Bound to the logged catalog_version_id.';
comment on table public.catalog_version_drink_concept_tags is
  'Version-scoped drink-concept classifications (frozen/margarita/…).';
comment on table public.catalog_version_offering_tags is
  'Offering-specific classifications when the same named cocktail differs by bar or recipe revision.';

comment on table public.ingredient_tags is
  'LEGACY global tags (Phase 7A). Achievement eval uses catalog_version_*_tags only. Do not write new rows here.';
comment on table public.drink_concept_tags is
  'LEGACY global tags (Phase 7A). Achievement eval uses catalog_version_*_tags only. Do not write new rows here.';

alter table public.catalog_version_ingredient_tags enable row level security;
alter table public.catalog_version_ingredient_tags force row level security;
alter table public.catalog_version_drink_concept_tags enable row level security;
alter table public.catalog_version_drink_concept_tags force row level security;
alter table public.catalog_version_offering_tags enable row level security;
alter table public.catalog_version_offering_tags force row level security;

revoke all on table public.catalog_version_ingredient_tags from anon, authenticated;
revoke all on table public.catalog_version_drink_concept_tags from anon, authenticated;
revoke all on table public.catalog_version_offering_tags from anon, authenticated;
grant select on table public.catalog_version_ingredient_tags to authenticated, service_role;
grant select on table public.catalog_version_drink_concept_tags to authenticated, service_role;
grant select on table public.catalog_version_offering_tags to authenticated, service_role;
grant select, insert, update, delete on table public.catalog_version_ingredient_tags to service_role;
grant select, insert, update, delete on table public.catalog_version_drink_concept_tags to service_role;
grant select, insert, update, delete on table public.catalog_version_offering_tags to service_role;

create policy catalog_version_ingredient_tags_select_drinkit
  on public.catalog_version_ingredient_tags for select to authenticated
  using (public.is_admin() or public.has_game('drinkit'));
create policy catalog_version_drink_concept_tags_select_drinkit
  on public.catalog_version_drink_concept_tags for select to authenticated
  using (public.is_admin() or public.has_game('drinkit'));
create policy catalog_version_offering_tags_select_drinkit
  on public.catalog_version_offering_tags for select to authenticated
  using (public.is_admin() or public.has_game('drinkit'));

-- ---------------------------------------------------------------------------
-- 2) Approved vocabulary + payload validation
-- ---------------------------------------------------------------------------
create or replace function public.catalog_approved_ingredient_classification_tags()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['spirit-family-gin','spirit-family-vodka','spirit-family-rum','spirit-family-tequila','spirit-family-mezcal','spirit-family-whiskey','spirit-family-bourbon','spirit-family-brandy','spirit-family-cognac','spirit-family-liqueur','spirit-family-other','spirit-clear','spirit-dark','rum-style-white','rum-style-gold','rum-style-dark','rum-style-spiced','rum-style-aged','rum-style-overproof','fruit','fruit-citrus','fruit-berry','fruit-tropical','hot-pepper','wine','rose','prosecco','champagne']::text[];
$$;

create or replace function public.catalog_approved_drink_classification_tags()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['frozen','margarita','mixed-spirits']::text[];
$$;

create or replace function public.catalog_approved_offering_classification_tags()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['frozen','margarita','mixed-spirits']::text[];
$$;

create or replace function public.catalog_schema_version_ok(p_version text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_version in ('1.0', '1.1');
$$;

create or replace function public.catalog_payload_classification_errors(p_payload jsonb)
returns jsonb
language sql
stable
set search_path = public
as $$
  with
  ing_tags as (
    select i->>'key' as ref, t.tag
    from jsonb_array_elements(coalesce(p_payload->'ingredients', '[]'::jsonb)) i
    cross join lateral jsonb_array_elements_text(coalesce(i->'classification_tags', '[]'::jsonb)) as t(tag)
  ),
  drink_tags as (
    select d->>'key' as ref, t.tag
    from jsonb_array_elements(coalesce(p_payload->'drinks', '[]'::jsonb)) d
    cross join lateral jsonb_array_elements_text(coalesce(d->'classification_tags', '[]'::jsonb)) as t(tag)
  ),
  off_tags as (
    select (d->>'key') || '@' || (o->>'bar_key') as ref, t.tag
    from jsonb_array_elements(coalesce(p_payload->'drinks', '[]'::jsonb)) d
    cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o
    cross join lateral jsonb_array_elements_text(coalesce(o->'classification_tags', '[]'::jsonb)) as t(tag)
  ),
  errs as (
    select 'UNKNOWN_INGREDIENT_CLASSIFICATION_TAG' as code, ref || ':' || tag as ref
    from ing_tags
    where tag is null or tag <> all (public.catalog_approved_ingredient_classification_tags())
    union all
    select 'UNKNOWN_DRINK_CLASSIFICATION_TAG', ref || ':' || tag
    from drink_tags
    where tag is null or tag <> all (public.catalog_approved_drink_classification_tags())
    union all
    select 'UNKNOWN_OFFERING_CLASSIFICATION_TAG', ref || ':' || tag
    from off_tags
    where tag is null or tag <> all (public.catalog_approved_offering_classification_tags())
    union all
    select 'DUPLICATE_INGREDIENT_CLASSIFICATION_TAG', ref || ':' || tag
    from ing_tags group by ref, tag having count(*) > 1
    union all
    select 'DUPLICATE_DRINK_CLASSIFICATION_TAG', ref || ':' || tag
    from drink_tags group by ref, tag having count(*) > 1
    union all
    select 'DUPLICATE_OFFERING_CLASSIFICATION_TAG', ref || ':' || tag
    from off_tags group by ref, tag having count(*) > 1
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('code', e.code, 'ref', e.ref)),
    '[]'::jsonb
  )
  from (select * from errs limit 50) e
$$;

revoke all on function public.catalog_approved_ingredient_classification_tags() from public, anon, authenticated;
revoke all on function public.catalog_approved_drink_classification_tags() from public, anon, authenticated;
revoke all on function public.catalog_approved_offering_classification_tags() from public, anon, authenticated;
revoke all on function public.catalog_schema_version_ok(text) from public, anon, authenticated;
revoke all on function public.catalog_payload_classification_errors(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_approved_ingredient_classification_tags() to service_role;
grant execute on function public.catalog_approved_drink_classification_tags() to service_role;
grant execute on function public.catalog_approved_offering_classification_tags() to service_role;
grant execute on function public.catalog_schema_version_ok(text) to service_role;
grant execute on function public.catalog_payload_classification_errors(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3) Write versioned tags from stored manifest on every new catalog version
-- ---------------------------------------------------------------------------
create or replace function public.catalog_version_write_classification_tags(p_version_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.catalog_version_ingredient_tags where catalog_version_id = p_version_id;
  delete from public.catalog_version_drink_concept_tags where catalog_version_id = p_version_id;
  delete from public.catalog_version_offering_tags where catalog_version_id = p_version_id;

  insert into public.catalog_version_ingredient_tags (catalog_version_id, ingredient_id, tag)
  select distinct p_version_id, i.id, t.tag
  from jsonb_array_elements(coalesce(p_payload->'ingredients', '[]'::jsonb)) x
  join public.ingredients i on i.canonical_key = x->>'key'
  cross join lateral jsonb_array_elements_text(coalesce(x->'classification_tags', '[]'::jsonb)) as t(tag)
  where t.tag = any (public.catalog_approved_ingredient_classification_tags());

  insert into public.catalog_version_drink_concept_tags (catalog_version_id, drink_concept_id, tag)
  select distinct p_version_id, dc.id, t.tag
  from jsonb_array_elements(coalesce(p_payload->'drinks', '[]'::jsonb)) d
  join public.drink_concepts dc on dc.canonical_key = d->>'key'
  cross join lateral jsonb_array_elements_text(coalesce(d->'classification_tags', '[]'::jsonb)) as t(tag)
  where t.tag = any (public.catalog_approved_drink_classification_tags());

  insert into public.catalog_version_offering_tags (catalog_version_id, offering_id, tag)
  select distinct p_version_id, bo.id, t.tag
  from jsonb_array_elements(coalesce(p_payload->'drinks', '[]'::jsonb)) d
  cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o
  join public.bars br on br.canonical_key = o->>'bar_key'
  join public.drink_concepts dc on dc.canonical_key = d->>'key'
  join public.bar_offerings bo on bo.bar_id = br.id and bo.drink_concept_id = dc.id
  cross join lateral jsonb_array_elements_text(coalesce(o->'classification_tags', '[]'::jsonb)) as t(tag)
  where t.tag = any (public.catalog_approved_offering_classification_tags());
end;
$$;

revoke all on function public.catalog_version_write_classification_tags(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.catalog_version_write_classification_tags(uuid, jsonb) to service_role;

create or replace function public.catalog_versions_after_insert_classification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Prefer payload schema_version over the legacy hard-coded column write.
  -- Tag rows are written when the version becomes active (after offerings exist).
  if new.manifest_json is not null
     and public.catalog_schema_version_ok(new.manifest_json->>'schema_version')
     and new.schema_version is distinct from (new.manifest_json->>'schema_version') then
    update public.catalog_versions
      set schema_version = new.manifest_json->>'schema_version'
      where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_versions_after_insert_classification on public.catalog_versions;
create trigger catalog_versions_after_insert_classification
  after insert on public.catalog_versions
  for each row execute function public.catalog_versions_after_insert_classification();

create or replace function public.catalog_versions_after_activate_classification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform public.catalog_version_write_classification_tags(
      new.id,
      coalesce(new.manifest_json, '{}'::jsonb)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_versions_after_activate_classification on public.catalog_versions;
create trigger catalog_versions_after_activate_classification
  after insert or update of status on public.catalog_versions
  for each row execute function public.catalog_versions_after_activate_classification();


-- ---------------------------------------------------------------------------
-- 5) Achievement evaluator: ordered_after fix, cruise_day drink_log, versioned tags
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

  return false;
end;
$$;

revoke all on function public.achievement_eval_condition_as_of(jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, int) from public;
grant execute on function public.achievement_eval_condition_as_of(jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- 6) Catalog stage / evaluate / rollback / list accept 1.0|1.1 + tag validation
-- ---------------------------------------------------------------------------

create or replace function public.catalog_publish_evaluate(
  p_payload jsonb,
  p_active_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_cfg public.cruise_config%rowtype;
  v_has_cfg boolean := false;
  v_control public.game_control%rowtype;
  v_active public.catalog_versions%rowtype;
  v_refs jsonb;
  v_protected jsonb := '[]'::jsonb;
  v_item jsonb;
  v_present boolean;
  v_excluded text[];
  v_scheduled_c integer := 0;
  v_scheduled_i integer := 0;
  v_available_c integer := 0;
  v_available_i integer := 0;
  v_carry jsonb := '[]'::jsonb;
  v_redundant jsonb := '[]'::jsonb;
  v_dropped jsonb := '[]'::jsonb;
  v_row record;
  v_corr_redundant integer := 0;
  v_corr_orphaned integer := 0;
  v_corr_suppressed jsonb := '[]'::jsonb;
  v_a_bars text[] := array[]::text[];
  v_a_off text[] := array[]::text[];
  v_a_ing text[] := array[]::text[];
  v_a_cc text[] := array[]::text[];
  v_a_ic text[] := array[]::text[];
  v_diff jsonb;
  v_class_err jsonb;
begin
  if not public.catalog_payload_shape_ok(p_payload) then
    return jsonb_build_object(
      'blockers', jsonb_build_array(jsonb_build_object(
        'code', 'PAYLOAD_SHAPE',
        'message', 'Catalog payload is missing required arrays.'
      )),
      'warnings', '[]'::jsonb,
      'diff', '{}'::jsonb,
      'overlays', '{}'::jsonb,
      'schedule', '{}'::jsonb
    );
  end if;

  if not public.catalog_schema_version_ok(p_payload->>'schema_version')
     or p_payload->>'mode' is distinct from 'full_snapshot' then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'PAYLOAD_SCHEMA',
      'message', 'schema_version must be 1.0 or 1.1 and mode full_snapshot.'
    ));
  end if;

  v_class_err := public.catalog_payload_classification_errors(p_payload);
  if jsonb_array_length(v_class_err) > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'CLASSIFICATION_TAG_INVALID',
      'message', 'Catalog payload has unknown or duplicate classification tags.',
      'errors', v_class_err
    ));
  end if;

  v_refs := public.catalog_payload_reference_errors(p_payload);
  if jsonb_array_length(v_refs) > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'PAYLOAD_REFERENCE_ERROR',
      'message', 'Catalog payload has unresolved cross-references.',
      'errors', v_refs
    ));
  end if;

  if exists (select 1 from public.catalog_versions where catalog_id = p_payload->>'catalog_id') then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'CATALOG_ID_EXISTS',
      'message', 'A catalog version with this catalog_id already exists.',
      'catalog_id', p_payload->>'catalog_id'
    ));
  end if;

  if p_active_version_id is not null then
    select * into v_active from public.catalog_versions where id = p_active_version_id;
    if found
       and p_payload->>'base_catalog_id' is not null
       and p_payload->>'base_catalog_id' is distinct from v_active.catalog_id then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'code', 'BASE_CATALOG_NOT_ACTIVE',
        'message', 'Payload base_catalog_id differs from the active catalog_id.',
        'base_catalog_id', p_payload->>'base_catalog_id',
        'active_catalog_id', v_active.catalog_id
      ));
    end if;
  end if;

  -- Cruise / finale / schedule --------------------------------------------
  select * into v_cfg from public.cruise_config where is_active limit 1;
  v_has_cfg := found;

  if v_has_cfg then
    select * into v_control from public.game_control where game = 'drinkit';
    if v_control.finalized_at_utc is not null
       or now() >= public.finale_at_utc(v_cfg, now()) then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code', 'CATALOG_FINALE_PASSED',
        'message', 'The finale has passed; catalog changes are closed.'
      ));
    end if;

    -- Current / grace offers must still exist in the proposed content.
    v_protected := public.catalog_publish_protected_offers(v_cfg.id, now());
    for v_item in select * from jsonb_array_elements(v_protected)
    loop
      if v_item->>'category' = 'cocktail' then
        select exists (
          select 1
          from public.bar_offerings bo
          join public.drink_concepts dc on dc.id = bo.drink_concept_id
          join public.bars b on b.id = bo.bar_id
          join public.catalog_payload_offerings(p_payload) po
            on po.drink_key = dc.canonical_key and po.bar_key = b.canonical_key
          where bo.id = (v_item->>'cocktail_offering_id')::uuid
        ) into v_present;
      else
        select exists (
          select 1 from jsonb_array_elements(p_payload->'ingredients') i
          where i->>'key' = v_item->>'canonical_key'
        ) into v_present;
      end if;
      if not v_present then
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code', 'CURRENT_OFFER_MISSING',
          'message', 'A live or grace-window objective is absent from the proposed catalog.',
          'category', v_item->>'category',
          'canonical_key', v_item->>'canonical_key',
          'slot_key', v_item->>'slot_key',
          'grace', (v_item->>'is_grace')::boolean
        ));
      end if;
    end loop;

    -- Remaining scheduled slots vs unused eligible pool.
    select count(*) into v_scheduled_c from public.bounty_slots
      where cruise_config_id = v_cfg.id and category = 'cocktail' and state = 'scheduled';
    select count(*) into v_scheduled_i from public.bounty_slots
      where cruise_config_id = v_cfg.id and category = 'ingredient' and state = 'scheduled';

    v_excluded := public.catalog_publish_excluded_keys(v_cfg.id, 'cocktail');
    select count(*) into v_available_c
    from public.catalog_payload_cocktail_pool(p_payload) c
    where c.eligible and c.drink_key <> all (v_excluded);

    v_excluded := public.catalog_publish_excluded_keys(v_cfg.id, 'ingredient');
    select count(*) into v_available_i
    from public.catalog_payload_ingredient_pool(p_payload) c
    where c.eligible and c.ingredient_key <> all (v_excluded);

    if v_available_c < v_scheduled_c then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code', 'REMAINING_POOL_SHORTAGE',
        'message', 'Not enough unused eligible Cocktail candidates for remaining scheduled slots.',
        'category', 'cocktail',
        'scheduled_slots', v_scheduled_c,
        'available', v_available_c,
        'shortage', v_scheduled_c - v_available_c
      ));
    end if;
    if v_available_i < v_scheduled_i then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code', 'REMAINING_POOL_SHORTAGE',
        'message', 'Not enough unused eligible Ingredient candidates for remaining scheduled slots.',
        'category', 'ingredient',
        'scheduled_slots', v_scheduled_i,
        'available', v_available_i,
        'shortage', v_scheduled_i - v_available_i
      ));
    end if;
  end if;

  -- Manual overlay plan -----------------------------------------------------
  if p_active_version_id is not null then
    for v_row in
      select amo.offering_id, amo.display_name, amo.drink_canonical_key, amo.kind::text as kind,
             b.canonical_key as bar_key
      from public.admin_manual_offerings amo
      join public.bars b on b.id = amo.bar_id
      where amo.catalog_version_id = p_active_version_id and amo.active is true
      order by b.canonical_key, amo.drink_canonical_key
    loop
      if exists (
        select 1 from public.catalog_payload_offerings(p_payload) po
        where po.drink_key = v_row.drink_canonical_key and po.bar_key = v_row.bar_key
      ) then
        v_redundant := v_redundant || jsonb_build_array(jsonb_build_object(
          'offering_id', v_row.offering_id,
          'drink_key', v_row.drink_canonical_key,
          'bar_key', v_row.bar_key,
          'display_name', v_row.display_name
        ));
      elsif exists (
        select 1 from jsonb_array_elements(p_payload->'bars') b
        where b->>'key' = v_row.bar_key and coalesce((b->>'active')::boolean, true)
      ) then
        if exists (
          select 1 from jsonb_array_elements(p_payload->'drinks') d
          where d->>'key' = v_row.drink_canonical_key and d->>'kind' is distinct from v_row.kind
        ) then
          v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
            'code', 'MANUAL_KIND_CONFLICT',
            'message', 'A manual drink conflicts with the proposed catalog drink kind.',
            'drink_key', v_row.drink_canonical_key,
            'bar_key', v_row.bar_key
          ));
        end if;
        v_carry := v_carry || jsonb_build_array(jsonb_build_object(
          'offering_id', v_row.offering_id,
          'drink_key', v_row.drink_canonical_key,
          'bar_key', v_row.bar_key,
          'display_name', v_row.display_name
        ));
      else
        v_dropped := v_dropped || jsonb_build_array(jsonb_build_object(
          'offering_id', v_row.offering_id,
          'drink_key', v_row.drink_canonical_key,
          'bar_key', v_row.bar_key,
          'display_name', v_row.display_name,
          'reason', 'bar_not_active_in_proposed_catalog'
        ));
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'code', 'MANUAL_OFFERING_DROPPED',
          'message', 'A manual offering will be dropped because its bar is not active in the proposed catalog.',
          'drink_key', v_row.drink_canonical_key,
          'bar_key', v_row.bar_key
        ));
      end if;
    end loop;

    -- Ingredient correction overlays (global per offering+ingredient) -------
    select count(*) into v_corr_redundant
    from public.ingredient_corrections ic
    join public.bar_offerings bo on bo.id = ic.offering_id
    join public.drink_concepts dc on dc.id = bo.drink_concept_id
    join public.bars b on b.id = bo.bar_id
    join public.ingredients i on i.id = ic.ingredient_id
    where ic.active is true
      and coalesce(ic.inactive_cause, '') is distinct from 'admin'
      and exists (
        select 1 from public.catalog_payload_offerings(p_payload) po
        where po.drink_key = dc.canonical_key
          and po.bar_key = b.canonical_key
          and i.canonical_key = any (po.ingredient_keys)
      );

    select count(*) into v_corr_orphaned
    from public.ingredient_corrections ic
    join public.bar_offerings bo on bo.id = ic.offering_id
    join public.drink_concepts dc on dc.id = bo.drink_concept_id
    join public.bars b on b.id = bo.bar_id
    where ic.active is true
      and not exists (
        select 1 from public.catalog_payload_offerings(p_payload) po
        where po.drink_key = dc.canonical_key and po.bar_key = b.canonical_key
      )
      and not exists (
        select 1 from public.admin_manual_offerings amo
        where amo.catalog_version_id = p_active_version_id
          and amo.offering_id = ic.offering_id
          and amo.active is true
      );

    if v_corr_orphaned > 0 then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'code', 'CORRECTION_OFFERING_REMOVED',
        'message', 'Active ingredient corrections reference offerings absent from the proposed catalog.',
        'count', v_corr_orphaned
      ));
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'drink_key', dc.canonical_key,
      'bar_key', b.canonical_key,
      'ingredient_key', i.canonical_key
    )), '[]'::jsonb)
    into v_corr_suppressed
    from public.ingredient_corrections ic
    join public.bar_offerings bo on bo.id = ic.offering_id
    join public.drink_concepts dc on dc.id = bo.drink_concept_id
    join public.bars b on b.id = bo.bar_id
    join public.ingredients i on i.id = ic.ingredient_id
    where ic.active is false
      and ic.inactive_cause = 'admin'
      and exists (
        select 1 from public.catalog_payload_offerings(p_payload) po
        where po.drink_key = dc.canonical_key
          and po.bar_key = b.canonical_key
          and i.canonical_key = any (po.ingredient_keys)
      );

    -- Active-side key sets for the diff -------------------------------------
    v_a_bars := array(
      select b.canonical_key from public.catalog_version_bars cvb
      join public.bars b on b.id = cvb.bar_id
      where cvb.catalog_version_id = p_active_version_id
    );
    v_a_off := array(
      select dc.canonical_key || '@' || b.canonical_key
      from public.catalog_version_offerings cvo
      join public.bar_offerings bo on bo.id = cvo.offering_id
      join public.drink_concepts dc on dc.id = bo.drink_concept_id
      join public.bars b on b.id = bo.bar_id
      where cvo.catalog_version_id = p_active_version_id
        and not exists (
          select 1 from public.admin_manual_offerings amo
          where amo.catalog_version_id = p_active_version_id
            and amo.offering_id = cvo.offering_id
            and amo.active is true
        )
    );
    v_a_ing := array(
      select i.canonical_key from public.catalog_version_ingredients cvi
      join public.ingredients i on i.id = cvi.ingredient_id
      where cvi.catalog_version_id = p_active_version_id
    );
    v_a_cc := array(
      select dc.canonical_key from public.cocktail_candidates cc
      join public.bar_offerings bo on bo.id = cc.offering_id
      join public.drink_concepts dc on dc.id = bo.drink_concept_id
      where cc.catalog_version_id = p_active_version_id
    );
    v_a_ic := array(
      select i.canonical_key from public.ingredient_candidates ic
      join public.ingredients i on i.id = ic.ingredient_id
      where ic.catalog_version_id = p_active_version_id
    );
  end if;

  v_diff := jsonb_build_object(
    'bars', public.catalog_publish_set_diff(
      v_a_bars, array(select b->>'key' from jsonb_array_elements(p_payload->'bars') b)
    ),
    'offerings', public.catalog_publish_set_diff(
      v_a_off, array(select o.drink_key || '@' || o.bar_key from public.catalog_payload_offerings(p_payload) o)
    ),
    'ingredients', public.catalog_publish_set_diff(
      v_a_ing, array(select i->>'key' from jsonb_array_elements(p_payload->'ingredients') i)
    ),
    'cocktail_candidates', public.catalog_publish_set_diff(
      v_a_cc, array(select c.drink_key from public.catalog_payload_cocktail_pool(p_payload) c)
    ),
    'ingredient_candidates', public.catalog_publish_set_diff(
      v_a_ic, array(select c.ingredient_key from public.catalog_payload_ingredient_pool(p_payload) c)
    )
  );

  return jsonb_build_object(
    'blockers', v_blockers,
    'warnings', v_warnings,
    'diff', v_diff,
    'overlays', jsonb_build_object(
      'manual_offerings', jsonb_build_object(
        'carry_forward', v_carry,
        'redundant', v_redundant,
        'dropped', v_dropped
      ),
      'corrections', jsonb_build_object(
        'redundant_count', v_corr_redundant,
        'orphaned_count', v_corr_orphaned,
        'admin_suppressed_in_catalog', v_corr_suppressed
      )
    ),
    'schedule', jsonb_build_object(
      'cruise_config_id', case when v_has_cfg then v_cfg.id else null end,
      'scheduled_slots', jsonb_build_object('cocktail', v_scheduled_c, 'ingredient', v_scheduled_i),
      'available_pool', jsonb_build_object('cocktail', v_available_c, 'ingredient', v_available_i),
      'protected_offers', v_protected
    )
  );
end;
$$;



revoke all on function public.catalog_publish_evaluate(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.catalog_publish_evaluate(jsonb, uuid) to service_role;

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

create or replace function public.admin_rollback_catalog(
  p_client_request_id uuid,
  p_target_catalog_version_id uuid,
  p_expected_active_catalog_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.require_admin();
  v_fp text;
  v_replay jsonb;
  v_target public.catalog_versions%rowtype;
  v_active uuid;
  v_payload jsonb;
  v_new_id text;
  v_hash text;
  v_eval jsonb;
  v_applied jsonb;
  v_result jsonb;
begin
  if p_client_request_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_ID');
  end if;

  perform pg_advisory_xact_lock(hashtext('catalog_publish'));

  v_fp := md5(
    'rollback|' || coalesce(p_target_catalog_version_id::text, '') || '|' ||
    coalesce(p_expected_active_catalog_version_id::text, '')
  );

  v_replay := public.catalog_publish_begin_request(
    p_client_request_id, v_fp, 'rollback', v_actor,
    p_expected_active_catalog_version_id, null, p_target_catalog_version_id, null
  );
  if v_replay is not null then
    return v_replay;
  end if;

  v_active := public.admin_active_catalog_id();
  if v_active is distinct from p_expected_active_catalog_version_id then
    return public.catalog_publish_finish_request(
      p_client_request_id, 'failed',
      jsonb_build_object(
        'ok', false, 'code', 'STALE_ACTIVE_VERSION',
        'active_catalog_version_id', v_active
      )
    );
  end if;

  select * into v_target from public.catalog_versions where id = p_target_catalog_version_id;
  if not found then
    return public.catalog_publish_finish_request(
      p_client_request_id, 'failed',
      jsonb_build_object('ok', false, 'code', 'ROLLBACK_TARGET_NOT_FOUND')
    );
  end if;
  if v_target.id = v_active then
    return public.catalog_publish_finish_request(
      p_client_request_id, 'failed',
      jsonb_build_object('ok', false, 'code', 'ROLLBACK_TARGET_ACTIVE')
    );
  end if;
  if v_target.status <> 'retired' then
    return public.catalog_publish_finish_request(
      p_client_request_id, 'failed',
      jsonb_build_object('ok', false, 'code', 'ROLLBACK_TARGET_NOT_RETIRED', 'status', v_target.status)
    );
  end if;
  if not public.catalog_payload_shape_ok(v_target.manifest_json)
     or not public.catalog_schema_version_ok(v_target.manifest_json->>'schema_version')
     or v_target.manifest_json->>'mode' is distinct from 'full_snapshot' then
    return public.catalog_publish_finish_request(
      p_client_request_id, 'failed',
      jsonb_build_object('ok', false, 'code', 'ROLLBACK_TARGET_NOT_RESTORABLE')
    );
  end if;

  v_new_id := left(v_target.catalog_id, 100) || '-rollback-' ||
              substr(md5(p_client_request_id::text), 1, 8);
  v_payload := v_target.manifest_json || jsonb_build_object(
    'catalog_id', v_new_id,
    'base_catalog_id', v_target.catalog_id
  );
  v_hash := public.catalog_payload_sha256(v_payload);

  v_eval := public.catalog_publish_evaluate(v_payload, v_active);
  if jsonb_array_length(v_eval->'blockers') > 0 then
    return public.catalog_publish_finish_request(
      p_client_request_id, 'failed',
      jsonb_build_object(
        'ok', false, 'code', 'ROLLBACK_BLOCKED',
        'blockers', v_eval->'blockers',
        'warnings', v_eval->'warnings'
      )
    );
  end if;

  v_applied := public.catalog_publish_apply(
    v_payload, v_hash, v_actor, 'rollback',
    jsonb_build_object(
      'target_catalog_version_id', v_target.id,
      'target_catalog_id', v_target.catalog_id,
      'client_request_id', p_client_request_id
    ),
    v_active
  );

  perform public.write_admin_audit(
    'catalog.rollback', v_actor, 'catalog_versions', v_applied->>'catalog_version_id',
    jsonb_build_object('previous_catalog_version_id', v_active),
    v_applied || jsonb_build_object('target_catalog_version_id', v_target.id)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'action', 'rollback',
    'target_catalog_version_id', v_target.id,
    'target_catalog_id', v_target.catalog_id,
    'warnings', v_eval->'warnings'
  ) || v_applied;

  return public.catalog_publish_finish_request(p_client_request_id, 'completed', v_result);
end;
$$;

revoke all on function public.admin_rollback_catalog(uuid, uuid, uuid) from public;
grant execute on function public.admin_rollback_catalog(uuid, uuid, uuid) to authenticated;

create or replace function public.admin_list_catalog_versions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_active uuid;
begin
  perform public.require_admin();
  v_active := public.admin_active_catalog_id();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', cv.id,
      'catalog_id', cv.catalog_id,
      'base_catalog_id', cv.base_catalog_id,
      'status', cv.status,
      'is_active', cv.id = v_active,
      'payload_hash', cv.payload_hash,
      'imported_at', cv.imported_at,
      'activated_at', cv.activated_at,
      'created_at', cv.created_at,
      'rollback_eligible',
        cv.status = 'retired'
        and public.catalog_payload_shape_ok(cv.manifest_json)
        and public.catalog_schema_version_ok(cv.manifest_json->>'schema_version'),
      'origin', coalesce((
        select n.note_type from public.catalog_source_notes n
        where n.catalog_version_id = cv.id and n.note_type in ('publish', 'rollback')
        order by n.created_at desc limit 1
      ), 'fixture')
    ) order by coalesce(cv.activated_at, cv.created_at) desc, cv.created_at desc)
    from public.catalog_versions cv
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_catalog_versions() from public;
grant execute on function public.admin_list_catalog_versions() to authenticated;
