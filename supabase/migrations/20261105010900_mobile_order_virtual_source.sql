-- Mobile Order: virtual ordering source for ordinary Drink It! logging.
-- Not a physical bar. Do not apply to the organizer Wrapped QA environment until approved.

-- ---------------------------------------------------------------------------
-- Identity: stable virtual flag on bars
-- ---------------------------------------------------------------------------
alter table public.bars
  add column if not exists is_virtual boolean not null default false;

comment on column public.bars.is_virtual is
  'True for non-physical ordering sources (e.g. Mobile Order / Princess app). Excluded from physical bar counts, gauntlet venues, and location-restricted bounties.';

insert into public.bars (canonical_key, is_virtual)
values ('mobile-order', true)
on conflict (canonical_key) do update
set is_virtual = true;

-- Optional future verified OceanNow / Mobile Order menu. Empty = search all distinct
-- catalog drink concepts at physical bars. When any active rows exist for the
-- active catalog version, the picker and resolve path restrict to that set.
create table if not exists public.mobile_order_menu_concepts (
  catalog_version_id uuid not null references public.catalog_versions (id) on delete cascade,
  drink_concept_id uuid not null references public.drink_concepts (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (catalog_version_id, drink_concept_id)
);

comment on table public.mobile_order_menu_concepts is
  'Optional verified Mobile Order menu by drink_concept. Empty for a catalog version => unrestricted distinct-concept search across physical bars.';

alter table public.mobile_order_menu_concepts enable row level security;
alter table public.mobile_order_menu_concepts force row level security;
revoke all on table public.mobile_order_menu_concepts from public, anon, authenticated;

create or replace function public.bar_is_physical(p_bar_id uuid)
returns boolean
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  select coalesce(
    (select not b.is_virtual from public.bars b where b.id = p_bar_id),
    false
  );
$$;

comment on function public.bar_is_physical(uuid) is
  'True when bar_id is a real ship venue (not Mobile Order / virtual).';

revoke all on function public.bar_is_physical(uuid) from public;
grant execute on function public.bar_is_physical(uuid) to authenticated, service_role;

create or replace function public.mobile_order_menu_is_restricted(p_catalog_version_id uuid)
returns boolean
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mobile_order_menu_concepts m
    where m.catalog_version_id = p_catalog_version_id
      and m.active is true
  );
$$;

revoke all on function public.mobile_order_menu_is_restricted(uuid) from public;
grant execute on function public.mobile_order_menu_is_restricted(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Wizard reads: include virtual Mobile Order last; expose is_virtual
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

  select coalesce(jsonb_agg(row_json order by is_virtual asc, lower(name), deck nulls last, canonical_key), '[]'::jsonb)
  into v_out
  from (
    select
      jsonb_build_object(
        'bar_id', b.id,
        'canonical_key', b.canonical_key,
        'name', cvb.name,
        'deck', nullif(regexp_replace(coalesce(cvb.deck, ''), '[^0-9]', '', 'g'), '')::int,
        'is_virtual', false
      ) as row_json,
      false as is_virtual,
      cvb.name as name,
      nullif(regexp_replace(coalesce(cvb.deck, ''), '[^0-9]', '', 'g'), '')::int as deck,
      b.canonical_key
    from public.catalog_version_bars cvb
    join public.bars b on b.id = cvb.bar_id
    where cvb.catalog_version_id = v_catalog
      and cvb.active is true
      and b.is_virtual is false

    union all

    select
      jsonb_build_object(
        'bar_id', b.id,
        'canonical_key', b.canonical_key,
        'name', coalesce(cvb.name, 'Mobile Order'),
        'deck', null,
        'is_virtual', true
      ) as row_json,
      true as is_virtual,
      coalesce(cvb.name, 'Mobile Order') as name,
      null::int as deck,
      b.canonical_key
    from public.bars b
    left join public.catalog_version_bars cvb
      on cvb.bar_id = b.id and cvb.catalog_version_id = v_catalog
    where b.is_virtual is true
  ) t;

  return v_out;
end;
$$;

comment on function public.list_drinkit_bars() is
  'Active catalog physical bars plus virtual Mobile Order (last). Includes is_virtual.';

revoke all on function public.list_drinkit_bars() from public;
grant execute on function public.list_drinkit_bars() to authenticated;

-- Distinct drink concepts across physical bars (deduped). Representative offering_id
-- is a stable pick for ingredient snapshots — not a claim the drink is on OceanNow.
create or replace function public.list_drinkit_mobile_order_drinks()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_catalog uuid;
  v_restricted boolean;
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

  v_restricted := public.mobile_order_menu_is_restricted(v_catalog);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'offering_id', x.offering_id,
      'drink_concept_id', x.drink_concept_id,
      'canonical_key', x.canonical_key,
      'display_name', x.display_name,
      'kind', x.kind
    )
    order by
      case
        when exists (
          select 1
          from public.catalog_version_offering_tags t
          where t.catalog_version_id = v_catalog
            and t.offering_id = x.offering_id
            and t.tag = 'organizer-authorized-exception'
        ) then 1
        else 0
      end,
      lower(x.display_name),
      x.canonical_key
  ), '[]'::jsonb)
  into v_out
  from (
    select distinct on (dc.id)
      bo.id as offering_id,
      dc.id as drink_concept_id,
      dc.canonical_key,
      cvd.display_name,
      cvd.kind
    from public.bar_offerings bo
    join public.bars b on b.id = bo.bar_id and b.is_virtual is false
    join public.catalog_version_bars cvb
      on cvb.bar_id = b.id and cvb.catalog_version_id = v_catalog and cvb.active is true
    join public.catalog_version_offerings cvo
      on cvo.offering_id = bo.id and cvo.catalog_version_id = v_catalog
    join public.drink_concepts dc on dc.id = bo.drink_concept_id
    join public.catalog_version_drink_concepts cvd
      on cvd.catalog_version_id = v_catalog and cvd.drink_concept_id = dc.id
    where cvd.kind in ('named_cocktail', 'beer', 'wine', 'other_alcoholic')
      and (
        not v_restricted
        or exists (
          select 1
          from public.mobile_order_menu_concepts m
          where m.catalog_version_id = v_catalog
            and m.drink_concept_id = dc.id
            and m.active is true
        )
      )
    order by dc.id, bo.id
  ) x;

  return v_out;
end;
$$;

comment on function public.list_drinkit_mobile_order_drinks() is
  'Distinct alcoholic drink concepts across physical bars for Mobile Order logging. Optional menu table may restrict. Not an official OceanNow menu claim.';

revoke all on function public.list_drinkit_mobile_order_drinks() from public;
grant execute on function public.list_drinkit_mobile_order_drinks() to authenticated;

-- ---------------------------------------------------------------------------
-- Resolve: virtual bar may reference a physical-bar offering for the concept
-- ---------------------------------------------------------------------------
create or replace function public.drinkit_resolve_drink_input(
  p_payload jsonb,
  p_catalog_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bar public.bars%rowtype;
  v_bar_name text;
  v_mode text := coalesce(p_payload->'drink'->>'mode', '');
  v_offering uuid;
  v_concept uuid;
  v_concept_key text;
  v_display text;
  v_kind text;
  v_alcoholic boolean;
  v_ings jsonb;
  v_custom text;
  v_unlisted_kind text;
  v_restricted boolean;
begin
  select b.* into v_bar
  from public.bars b
  where b.canonical_key = lower(trim(coalesce(p_payload->>'bar_canonical_key', '')))
  limit 1;
  if not found then
    raise exception 'BAR_NOT_FOUND' using errcode = '22023';
  end if;

  select cvb.name into v_bar_name
  from public.catalog_version_bars cvb
  where cvb.catalog_version_id = p_catalog_version_id and cvb.bar_id = v_bar.id;

  if v_bar_name is null and v_bar.is_virtual then
    v_bar_name := 'Mobile Order';
  end if;

  if v_mode = 'named_catalog' then
    begin
      v_offering := (p_payload->'drink'->>'offering_id')::uuid;
    exception when others then
      raise exception 'OFFERING_REQUIRED' using errcode = '22023';
    end;
    if v_offering is null then
      raise exception 'OFFERING_REQUIRED' using errcode = '22023';
    end if;

    if v_bar.is_virtual then
      v_restricted := public.mobile_order_menu_is_restricted(p_catalog_version_id);
      select bo.drink_concept_id, dc.canonical_key, cvd.display_name, cvd.kind
        into v_concept, v_concept_key, v_display, v_kind
      from public.bar_offerings bo
      join public.bars pb on pb.id = bo.bar_id and pb.is_virtual is false
      join public.drink_concepts dc on dc.id = bo.drink_concept_id
      join public.catalog_version_drink_concepts cvd
        on cvd.catalog_version_id = p_catalog_version_id and cvd.drink_concept_id = dc.id
      join public.catalog_version_offerings cvo
        on cvo.catalog_version_id = p_catalog_version_id and cvo.offering_id = bo.id
      where bo.id = v_offering
        and (
          not v_restricted
          or exists (
            select 1
            from public.mobile_order_menu_concepts m
            where m.catalog_version_id = p_catalog_version_id
              and m.drink_concept_id = bo.drink_concept_id
              and m.active is true
          )
        );
      if not found then
        raise exception 'OFFERING_NOT_AT_BAR' using errcode = '22023';
      end if;
    else
      select bo.drink_concept_id, dc.canonical_key, cvd.display_name, cvd.kind
        into v_concept, v_concept_key, v_display, v_kind
      from public.bar_offerings bo
      join public.drink_concepts dc on dc.id = bo.drink_concept_id
      join public.catalog_version_drink_concepts cvd
        on cvd.catalog_version_id = p_catalog_version_id and cvd.drink_concept_id = dc.id
      join public.catalog_version_offerings cvo
        on cvo.catalog_version_id = p_catalog_version_id and cvo.offering_id = bo.id
      where bo.id = v_offering and bo.bar_id = v_bar.id;
      if not found then
        raise exception 'OFFERING_NOT_AT_BAR' using errcode = '22023';
      end if;
    end if;

    if v_kind = 'nonalcoholic' then
      raise exception 'NONALCOHOLIC_NOT_ALLOWED' using errcode = '22023';
    end if;
    v_alcoholic := true;

    select coalesce(jsonb_agg(jsonb_build_object(
      'ingredient_id', coi.ingredient_id,
      'canonical_key', i.canonical_key,
      'display_name', coalesce(coi.display_label, cvi.display_name)
    ) order by coalesce(coi.display_label, cvi.display_name)), '[]'::jsonb)
    into v_ings
    from public.catalog_offering_ingredients coi
    join public.ingredients i on i.id = coi.ingredient_id
    join public.catalog_version_ingredients cvi
      on cvi.catalog_version_id = p_catalog_version_id and cvi.ingredient_id = i.id
    where coi.catalog_version_id = p_catalog_version_id and coi.offering_id = v_offering;

    select coalesce(v_ings, '[]'::jsonb) || coalesce((
      select jsonb_agg(jsonb_build_object(
        'ingredient_id', ic.ingredient_id,
        'canonical_key', i.canonical_key,
        'display_name', coalesce(cvi.display_name, i.canonical_key),
        'via', 'correction'
      ))
      from public.ingredient_corrections ic
      join public.ingredients i on i.id = ic.ingredient_id
      left join public.catalog_version_ingredients cvi
        on cvi.catalog_version_id = p_catalog_version_id and cvi.ingredient_id = i.id
      where ic.offering_id = v_offering and ic.active is true
        and not exists (
          select 1 from public.catalog_offering_ingredients coi2
          where coi2.catalog_version_id = p_catalog_version_id
            and coi2.offering_id = v_offering
            and coi2.ingredient_id = ic.ingredient_id
        )
    ), '[]'::jsonb)
    into v_ings;

    return jsonb_build_object(
      'bar_id', v_bar.id,
      'bar_canonical_key', v_bar.canonical_key,
      'bar_display_name', v_bar_name,
      'bar_is_virtual', v_bar.is_virtual,
      'drink_mode', 'named_catalog',
      'offering_id', v_offering,
      'drink_concept_id', v_concept,
      'drink_concept_key', v_concept_key,
      'drink_display_name', v_display,
      'drink_kind', v_kind,
      'alcoholic', v_alcoholic,
      'ingredients', coalesce(v_ings, '[]'::jsonb)
    );
  elsif v_mode in ('generic_beer', 'generic_wine', 'generic_other') then
    return jsonb_build_object(
      'bar_id', v_bar.id,
      'bar_canonical_key', v_bar.canonical_key,
      'bar_display_name', v_bar_name,
      'bar_is_virtual', v_bar.is_virtual,
      'drink_mode', v_mode,
      'offering_id', null,
      'drink_concept_id', null,
      'drink_concept_key', null,
      'drink_display_name', case v_mode
        when 'generic_beer' then 'Beer'
        when 'generic_wine' then 'Wine'
        else 'Other Alcoholic Beverage'
      end,
      'drink_kind', case v_mode
        when 'generic_beer' then 'beer'
        when 'generic_wine' then 'wine'
        else 'other_alcoholic'
      end,
      'generic_type', case v_mode
        when 'generic_beer' then 'beer'
        when 'generic_wine' then 'wine'
        else 'other_alcoholic'
      end,
      'alcoholic', true,
      'ingredients', '[]'::jsonb
    );
  elsif v_mode = 'unlisted_named' then
    v_custom := trim(coalesce(p_payload->'drink'->>'custom_name', ''));
    if v_custom = '' then
      raise exception 'CUSTOM_NAME_REQUIRED' using errcode = '22023';
    end if;
    v_unlisted_kind := lower(trim(coalesce(p_payload->'drink'->>'unlisted_drink_kind', 'named_cocktail')));
    if v_unlisted_kind not in ('named_cocktail', 'beer', 'wine', 'other_alcoholic') then
      v_unlisted_kind := 'named_cocktail';
    end if;
    return jsonb_build_object(
      'bar_id', v_bar.id,
      'bar_canonical_key', v_bar.canonical_key,
      'bar_display_name', v_bar_name,
      'bar_is_virtual', v_bar.is_virtual,
      'drink_mode', 'unlisted_named',
      'offering_id', null,
      'drink_concept_id', null,
      'drink_concept_key', null,
      'drink_display_name', v_custom,
      'custom_name', v_custom,
      'drink_kind', v_unlisted_kind,
      'alcoholic', true,
      'ingredients', '[]'::jsonb,
      'unlisted_contains_ingredient_key', p_payload->'drink'->>'unlisted_contains_ingredient_key',
      'confirm_featured_cocktail', coalesce((p_payload->'drink'->>'confirm_featured_cocktail')::boolean, false)
    );
  else
    raise exception 'DRINK_MODE_INVALID' using errcode = '22023';
  end if;
end;
$$;

comment on function public.drinkit_resolve_drink_input(jsonb, uuid) is
  'Resolve drink payload. Virtual Mobile Order may use a physical-bar offering as concept snapshot; menu table may restrict.';

-- ---------------------------------------------------------------------------
-- Ingredient bounty: do not silently broaden eligibility for Mobile Order
-- ---------------------------------------------------------------------------
alter function public.drinkit_evaluate_eligibility(uuid, jsonb, timestamptz)
  rename to drinkit_evaluate_eligibility_pre_mobile_order;

create or replace function public.drinkit_evaluate_eligibility(
  p_player_id uuid,
  p_payload jsonb,
  p_at_utc timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_drink jsonb;
  v_ing jsonb;
begin
  v_result := public.drinkit_evaluate_eligibility_pre_mobile_order(p_player_id, p_payload, p_at_utc);
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    return v_result;
  end if;

  v_drink := v_result->'drink';
  if coalesce((v_drink->>'bar_is_virtual')::boolean, false) is not true
     and not exists (
       select 1 from public.bars b
       where b.id = nullif(v_drink->>'bar_id', '')::uuid and b.is_virtual is true
     ) then
    return v_result;
  end if;

  -- Safe default until product rules Mobile Order Ingredient eligibility separately.
  v_ing := v_result->'categories'->'ingredient';
  if v_ing is not null and coalesce(v_ing->>'status', '') = 'eligible' then
    v_result := jsonb_set(
      v_result,
      '{categories,ingredient}',
      jsonb_build_object(
        'status', 'unavailable',
        'reason', 'virtual_order_source',
        'options', '[]'::jsonb
      ),
      true
    );
  elsif v_ing is not null and v_ing ? 'confirmable' then
    v_result := jsonb_set(
      v_result,
      '{categories,ingredient}',
      jsonb_build_object(
        'status', 'unavailable',
        'reason', 'virtual_order_source',
        'options', '[]'::jsonb
      ),
      true
    );
  end if;

  return v_result;
end;
$$;

comment on function public.drinkit_evaluate_eligibility(uuid, jsonb, timestamptz) is
  'Eligibility with Mobile Order Ingredient blocked (virtual_order_source) until a separate rule decision.';

revoke all on function public.drinkit_evaluate_eligibility(uuid, jsonb, timestamptz) from public;
grant execute on function public.drinkit_evaluate_eligibility(uuid, jsonb, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Achievements: physical-bar-only counts for bar-related conditions
-- ---------------------------------------------------------------------------
alter function public.achievement_eval_condition_as_of(
  jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer
) rename to achievement_eval_condition_as_of_pre_mobile_order;

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
  v_thresh int;
  v_count int;
  v_ok boolean;
begin
  if p_depth > 4 then
    raise exception 'CONDITION_NESTING_TOO_DEEP' using errcode = 'P0001';
  end if;
  if p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then
    return false;
  end if;
  v_type := p_cfg->>'type';

  if v_type = 'distinct_count' and p_cfg->>'subject' = 'bars' then
    v_thresh := greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    select count(distinct d.bar_id)::int into v_count
    from public.submissions s
    join public.drink_logs d on d.submission_id = s.id
    join public.bars b on b.id = d.bar_id and b.is_virtual is false
    where s.status = 'accepted'
      and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
      and s.author_player_id = p_owner_player
      and s.kind = 'drink_log';
    return v_count >= v_thresh;
  end if;

  if v_type = 'grouped_count' and p_cfg->>'mode' = 'same_bar_distinct_days' then
    v_thresh := greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    select coalesce(max(c), 0)::int into v_count
    from (
      select count(distinct s.ship_day) as c
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      join public.bars b on b.id = d.bar_id and b.is_virtual is false
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.author_player_id = p_owner_player
      group by d.bar_id
    ) t;
    return v_count >= v_thresh;
  end if;

  if v_type = 'grouped_count' and p_cfg->>'mode' = 'distinct_cocktails_one_bar' then
    v_thresh := greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    select coalesce(max(c), 0)::int into v_count
    from (
      select count(distinct d.drink_concept_id) as c
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      join public.bars b on b.id = d.bar_id and b.is_virtual is false
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.author_player_id = p_owner_player
        and d.drink_concept_id is not null
      group by d.bar_id
    ) t;
    return v_count >= v_thresh;
  end if;

  if v_type = 'grouped_count' and p_cfg->>'mode' = 'bars_same_day' then
    v_thresh := greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    select coalesce(max(c), 0)::int into v_count
    from (
      select count(distinct d.bar_id) as c
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      join public.bars b on b.id = d.bar_id and b.is_virtual is false
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.author_player_id = p_owner_player
      group by s.ship_day
    ) t;
    return v_count >= v_thresh;
  end if;

  if v_type = 'grouped_count' and p_cfg->>'mode' = 'same_cocktail_distinct_bars' then
    v_thresh := greatest(1, coalesce((p_cfg->>'threshold')::int, 1));
    select coalesce(max(c), 0)::int into v_count
    from (
      select count(distinct d.bar_id) as c
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      join public.bars b on b.id = d.bar_id and b.is_virtual is false
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.author_player_id = p_owner_player
        and s.kind = 'drink_log'
        and d.drink_concept_id is not null
      group by d.drink_concept_id
    ) t;
    return v_count >= v_thresh;
  end if;

  if v_type = 'companion_predicate' and p_cfg->>'mode' = 'same_companion_distinct_bars' then
    select exists (
      select 1
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      join public.bars b on b.id = d.bar_id and b.is_virtual is false
      join public.drink_log_companions dc on dc.submission_id = s.id
      where s.status = 'accepted'
        and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
        and s.author_player_id = p_owner_player
      group by dc.companion_player_id
      having count(distinct d.bar_id) >= greatest(1, coalesce((p_cfg->>'threshold')::int, 3))
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  if v_type = 'event_interval' and coalesce((p_cfg->>'same_bar')::boolean, false) then
    select exists (
      select 1
      from public.submissions a
      join public.drink_logs da on da.submission_id = a.id
      join public.bars ba on ba.id = da.bar_id and ba.is_virtual is false
      join public.submissions b on b.author_player_id = a.author_player_id and b.id <> a.id
      join public.drink_logs db on db.submission_id = b.id
      where a.status = 'accepted'
        and public.achievement_as_of_ok(a.received_at_utc, a.id, p_as_of_utc, p_as_of_id)
        and b.status = 'accepted'
        and public.achievement_as_of_ok(b.received_at_utc, b.id, p_as_of_utc, p_as_of_id)
        and a.author_player_id = p_owner_player
        and a.kind = 'drink_log' and b.kind = 'drink_log'
        and da.bar_id = db.bar_id
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
        and (
          coalesce((p_cfg->>'same_drink_concept')::boolean, false) is false
          or (da.drink_concept_id is not null and da.drink_concept_id = db.drink_concept_id)
        )
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;

  return public.achievement_eval_condition_as_of_pre_mobile_order(
    p_cfg, p_game, p_owner_player, p_owner_team, p_trigger_submission,
    p_as_of_utc, p_as_of_id, p_depth
  );
end;
$$;

comment on function public.achievement_eval_condition_as_of(
  jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer
) is
  'Achievement eval with Mobile Order excluded from physical-bar conditions.';

revoke all on function public.achievement_eval_condition_as_of(
  jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer
) from public;
grant execute on function public.achievement_eval_condition_as_of(
  jsonb, public.game_id, uuid, uuid, uuid, timestamptz, uuid, integer
) to service_role;

-- Progress read-model: bars subject ignores virtual
create or replace function public.achievement_progress_for_owner(
  p_def public.achievement_definitions,
  p_owner_player uuid,
  p_owner_team uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg jsonb := public.achievement_cfg(p_def);
  v_type text := v_cfg->>'type';
  v_current int := 0;
  v_target int := 0;
  v_status jsonb;
begin
  if v_type = 'offering_collection' then
    v_status := public.achievement_collection_live_progress(p_def.id, p_owner_player);
    if coalesce(v_status->>'ok', 'false') <> 'true' then
      return null;
    end if;
    v_target := coalesce((v_status->>'live_target')::int, 0);
    if v_target < 1 then
      return null;
    end if;
    v_current := coalesce((v_status->>'live_current')::int, 0);
    return jsonb_build_object(
      'current', least(v_current, v_target),
      'target', v_target,
      'kind', 'collection'
    );
  end if;

  if v_type = 'same_log' then
    return null;
  end if;

  if v_type = 'event_count' then
    v_target := greatest(1, coalesce((v_cfg->>'threshold')::int, 1));
    if v_cfg->>'event' = 'scavenger_completion' then
      select count(*)::int into v_current
      from public.submissions s
      join public.scavenger_completions sc on sc.submission_id = s.id
      join public.scavenger_challenges ch on ch.id = sc.challenge_id
      where s.status = 'accepted' and s.team_id = p_owner_team
        and (v_cfg->>'challenge_key' is null or ch.canonical_key = v_cfg->>'challenge_key');
    elsif v_cfg->>'event' = 'drink_log' then
      select count(*)::int into v_current
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      where s.status = 'accepted' and s.author_player_id = p_owner_player
        and (v_cfg->>'drink_mode' is null or d.drink_mode::text = v_cfg->>'drink_mode');
    elsif v_cfg->>'event' = 'bounty_claim' then
      select count(*)::int into v_current
      from public.bounty_claims bc
      join public.submissions s on s.id = bc.submission_id
      where s.status = 'accepted' and bc.status = 'active' and bc.player_id = p_owner_player
        and (v_cfg->>'bounty_category' is null or bc.category::text = v_cfg->>'bounty_category');
    else
      return null;
    end if;
    return jsonb_build_object('current', least(v_current, v_target), 'target', v_target);
  end if;

  if v_type = 'distinct_count' then
    v_target := greatest(1, coalesce((v_cfg->>'threshold')::int, 1));
    if v_cfg->>'subject' = 'bars' then
      select count(distinct d.bar_id)::int into v_current
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      join public.bars b on b.id = d.bar_id and b.is_virtual is false
      where s.status = 'accepted' and s.author_player_id = p_owner_player;
    elsif v_cfg->>'subject' = 'drink_concepts' then
      select count(distinct d.drink_concept_id)::int into v_current
      from public.submissions s
      join public.drink_logs d on d.submission_id = s.id
      where s.status = 'accepted' and s.author_player_id = p_owner_player
        and d.drink_concept_id is not null;
    elsif v_cfg->>'subject' = 'companions' then
      select count(distinct dc.companion_player_id)::int into v_current
      from public.submissions s
      join public.drink_log_companions dc on dc.submission_id = s.id
      where s.status = 'accepted' and s.author_player_id = p_owner_player;
    else
      return null;
    end if;
    return jsonb_build_object('current', least(v_current, v_target), 'target', v_target);
  end if;

  if v_type = 'set_completion' and v_cfg->>'scope' = 'all_scavenger_challenges' then
    select count(*)::int into v_target from public.scavenger_challenges where enabled;
    select count(distinct sc.challenge_id)::int into v_current
    from public.submissions s
    join public.scavenger_completions sc on sc.submission_id = s.id
    where s.status = 'accepted' and s.team_id = p_owner_team;
    if v_target <= 0 then return null; end if;
    return jsonb_build_object('current', least(v_current, v_target), 'target', v_target);
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wrapped stats: virtual logs still count for drinks; bar_id null for venues
-- ---------------------------------------------------------------------------
create or replace function public.wrapped_di_log_rows(p_cruise_config_id uuid)
returns table (
  submission_id uuid,
  player_id uuid,
  player_name text,
  ship_day integer,
  received_at_utc timestamptz,
  bar_id uuid,
  bar_name text,
  drink_mode text,
  drink_concept_id uuid,
  drink_name text,
  catalog_version_id uuid,
  offering_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    r.player_id,
    r.display_name,
    s.ship_day,
    s.received_at_utc,
    case when b.is_virtual then null else dl.bar_id end,
    case
      when b.is_virtual then coalesce(nullif(dl.bar_display_name, ''), 'Mobile Order')
      else dl.bar_display_name
    end,
    dl.drink_mode::text,
    dl.drink_concept_id,
    dl.drink_display_name,
    dl.catalog_version_id,
    dl.offering_id
  from public.drinkit_player_score_rows(p_cruise_config_id) r
  join public.submissions s
    on s.author_player_id = r.player_id
   and s.cruise_config_id = p_cruise_config_id
   and s.game = 'drinkit'
   and s.kind = 'drink_log'
   and s.status = 'accepted'
  join public.drink_logs dl on dl.submission_id = s.id
  join public.bars b on b.id = dl.bar_id;
$$;

comment on function public.wrapped_di_log_rows(uuid) is
  'Drink It! wrapped log rows. Virtual Mobile Order keeps drink stats but nulls bar_id so venue cards ignore it.';

revoke all on function public.wrapped_di_log_rows(uuid) from public;
grant execute on function public.wrapped_di_log_rows(uuid) to service_role;
