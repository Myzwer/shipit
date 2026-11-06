-- Phase 6B2: Catalog import stage / preview / publish / rollback.
--
-- Flow (all RPCs require_admin, security definer):
--   admin_stage_catalog_import     -> catalog_import_candidates (status staged)
--   admin_preview_catalog_publish  -> read-only plan: diff, overlays, blockers
--   admin_publish_catalog_import   -> new catalog_versions row + pointer flip + safe schedule rebind
--   admin_rollback_catalog         -> audited NEW revision cloned from a retired version's content
--
-- Design rules
--   * A publish never deletes schedule rows, exposures, claims, submissions, points, or Daily/Bar
--     assignments. Only *scheduled, never-shown* Cocktail/Ingredient slots get new offers.
--   * Current / exposed / missed_paused / skipped slots keep their offers (and those offers keep
--     their prior catalog_version_id). Active (current) slots may therefore reference a prior
--     catalog version through their offer; scoring does not compare offer.catalog_version_id to
--     the active pointer. The slot-level catalog_version_id of a *current* slot is repointed so
--     Admin Skip draws reserves from the live catalog instead of the retired one.
--   * Non-repetition is cruise-scoped by canonical_key (bounty_objective_exposures), so a new
--     catalog can never re-offer an exposed key.
--   * Payload hash = sha256(hex) of jsonb::text. The TypeScript client reproduces jsonb::text
--     (see src/lib/adminCatalogImport.ts canonicalJsonbText) so client and server agree.
--   * Rollback is NOT a pointer flip: it publishes the target version's stored manifest under a
--     fresh catalog_id (`<target>-rollback-<8 hex>`) through the same safety checks.

-- ---------------------------------------------------------------------------
-- 0) Allow more than one schedule run per cruise (one per catalog version)
-- ---------------------------------------------------------------------------
drop index if exists public.bounty_schedule_runs_one_per_cruise;

create unique index if not exists bounty_schedule_runs_cruise_version_uidx
  on public.bounty_schedule_runs (cruise_config_id, catalog_version_id);

comment on table public.bounty_schedule_runs is
  'Schedule generation / catalog-publish rebind runs. One row per (cruise, catalog version).';

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------
create table public.catalog_import_candidates (
  id uuid primary key default gen_random_uuid(),
  catalog_id text not null,
  base_catalog_id text,
  payload_hash text not null,
  payload_json jsonb not null,
  preview_json jsonb,
  validation_fingerprint text,
  status text not null default 'staged',
  stage_request_id uuid unique,
  created_by uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now(),
  published_catalog_version_id uuid references public.catalog_versions (id),
  published_at timestamptz,
  constraint catalog_import_candidates_status_check
    check (status in ('staged', 'published', 'abandoned', 'rejected')),
  constraint catalog_import_candidates_catalog_id_format
    check (catalog_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$')
);

create index catalog_import_candidates_catalog_idx
  on public.catalog_import_candidates (catalog_id, created_at desc);

comment on table public.catalog_import_candidates is
  'Validated full_snapshot imports staged for publish. payload_json is the exact document that will be loaded.';

create table public.admin_catalog_publish_requests (
  client_request_id uuid primary key,
  fingerprint text not null,
  action text not null,
  actor_id uuid references public.players (id) on delete set null,
  expected_active_version_id uuid,
  candidate_id uuid,
  target_catalog_version_id uuid,
  payload_hash text,
  result_json jsonb,
  status text not null default 'in_progress',
  lease_expires_at_utc timestamptz not null default (clock_timestamp() + interval '2 minutes'),
  received_at_utc timestamptz not null default clock_timestamp(),
  completed_at_utc timestamptz,
  constraint admin_catalog_publish_requests_action_check
    check (action in ('publish', 'rollback')),
  constraint admin_catalog_publish_requests_status_check
    check (status in ('in_progress', 'completed', 'failed')),
  constraint admin_catalog_publish_requests_fp_nonempty
    check (char_length(trim(fingerprint)) > 0)
);

comment on table public.admin_catalog_publish_requests is
  'Idempotency ledger for catalog publish / rollback. Same client_request_id + same fingerprint replays the stored result.';

alter table public.catalog_import_candidates enable row level security;
alter table public.catalog_import_candidates force row level security;
alter table public.admin_catalog_publish_requests enable row level security;
alter table public.admin_catalog_publish_requests force row level security;

revoke all on table public.catalog_import_candidates from anon, authenticated;
revoke all on table public.admin_catalog_publish_requests from anon, authenticated;
grant select on table public.catalog_import_candidates to authenticated;
grant select on table public.admin_catalog_publish_requests to authenticated;
grant select, insert, update, delete on table public.catalog_import_candidates to service_role;
grant select, insert, update, delete on table public.admin_catalog_publish_requests to service_role;

create policy catalog_import_candidates_admin_select
  on public.catalog_import_candidates for select to authenticated
  using (public.is_admin());

create policy admin_catalog_publish_requests_admin_select
  on public.admin_catalog_publish_requests for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) Payload helpers (pure; internal)
-- ---------------------------------------------------------------------------
create or replace function public.catalog_payload_sha256(p_payload jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex')
$$;

create or replace function public.catalog_payload_shape_ok(p_payload jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_payload is not null
     and jsonb_typeof(p_payload) = 'object'
     and jsonb_typeof(p_payload->'bars') = 'array'
     and jsonb_typeof(p_payload->'ingredients') = 'array'
     and jsonb_typeof(p_payload->'drinks') = 'array'
     and jsonb_typeof(p_payload->'cocktail_candidates') = 'array'
     and jsonb_typeof(p_payload->'ingredient_candidates') = 'array'
$$;

-- One row per (drink, bar) offering declared in the payload.
create or replace function public.catalog_payload_offerings(p_payload jsonb)
returns table (
  drink_key text,
  bar_key text,
  drink_name text,
  kind text,
  ingredient_keys text[],
  price_usd numeric,
  price_status text
)
language sql
stable
set search_path = public
as $$
  select
    d->>'key',
    o->>'bar_key',
    d->>'name',
    d->>'kind',
    coalesce(
      array(select jsonb_array_elements_text(coalesce(o->'ingredient_keys', '[]'::jsonb))),
      array[]::text[]
    ),
    nullif(o->>'price_usd', '')::numeric,
    o->>'price_status'
  from jsonb_array_elements(p_payload->'drinks') d
  cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o
$$;

-- Cocktail pool as the database will load it. Mirrors the TS eligibility rules
-- (named cocktail, verified price <= $15, active designated bar, eligible flag).
create or replace function public.catalog_payload_cocktail_pool(p_payload jsonb)
returns table (
  drink_key text,
  bar_key text,
  tier text,
  points integer,
  eligible boolean
)
language sql
stable
set search_path = public
as $$
  select
    c->>'drink_key',
    c->>'designated_bar_key',
    c->>'tier',
    (c->>'points')::integer,
    (
      coalesce((c->>'eligible')::boolean, true)
      and o.kind = 'named_cocktail'
      and o.price_status = 'verified_within_limit'
      and o.price_usd is not null
      and o.price_usd <= 15
      and coalesce((
        select (b->>'active')::boolean
        from jsonb_array_elements(p_payload->'bars') b
        where b->>'key' = c->>'designated_bar_key'
        limit 1
      ), false)
    )
  from jsonb_array_elements(p_payload->'cocktail_candidates') c
  left join public.catalog_payload_offerings(p_payload) o
    on o.drink_key = c->>'drink_key'
   and o.bar_key = c->>'designated_bar_key'
$$;

-- Ingredient pool as the database will load it: eligible flag AND >= 2 corroborating
-- active bars with a named-cocktail offering listing the ingredient.
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
  select
    c->>'ingredient_key',
    (c->>'known_bar_count')::integer,
    (c->>'distinct_qualifying_drinks')::integer,
    c->>'tier',
    (c->>'points')::integer,
    (
      coalesce((c->>'eligible')::boolean, true)
      and (
        select count(distinct o.bar_key)
        from public.catalog_payload_offerings(p_payload) o
        join jsonb_array_elements(p_payload->'bars') b
          on b->>'key' = o.bar_key and coalesce((b->>'active')::boolean, true)
        where o.kind = 'named_cocktail'
          and (c->>'ingredient_key') = any (o.ingredient_keys)
      ) >= 2
    )
  from jsonb_array_elements(p_payload->'ingredient_candidates') c
$$;

-- Cross-reference problems the loader would trip over. Empty array = clean.
create or replace function public.catalog_payload_reference_errors(p_payload jsonb)
returns jsonb
language sql
stable
set search_path = public
as $$
  with
  p_bars as (select b->>'key' as k from jsonb_array_elements(p_payload->'bars') b),
  p_ings as (select i->>'key' as k from jsonb_array_elements(p_payload->'ingredients') i),
  p_drinks as (select d->>'key' as k from jsonb_array_elements(p_payload->'drinks') d),
  offs as (select * from public.catalog_payload_offerings(p_payload)),
  errs as (
    select 'DUPLICATE_BAR_KEY' as code, k as ref from p_bars group by k having count(*) > 1
    union all
    select 'DUPLICATE_INGREDIENT_KEY', k from p_ings group by k having count(*) > 1
    union all
    select 'DUPLICATE_DRINK_KEY', k from p_drinks group by k having count(*) > 1
    union all
    select 'KEY_FORMAT', coalesce(k, '(null)')
    from (select k from p_bars union all select k from p_ings union all select k from p_drinks) x
    where k is null or k !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    union all
    select 'OFFERING_UNKNOWN_BAR', o.drink_key || '@' || coalesce(o.bar_key, '(null)')
    from offs o
    where o.bar_key is null or not exists (select 1 from p_bars b where b.k = o.bar_key)
    union all
    select 'OFFERING_UNKNOWN_INGREDIENT', o.drink_key || '@' || o.bar_key || ':' || ik
    from offs o, unnest(o.ingredient_keys) ik
    where not exists (select 1 from p_ings i where i.k = ik)
    union all
    select 'DUPLICATE_OFFERING', o.drink_key || '@' || o.bar_key
    from offs o group by o.drink_key, o.bar_key having count(*) > 1
    union all
    select 'COCKTAIL_CANDIDATE_NO_OFFERING', (c->>'drink_key') || '@' || (c->>'designated_bar_key')
    from jsonb_array_elements(p_payload->'cocktail_candidates') c
    where not exists (
      select 1 from offs o
      where o.drink_key = c->>'drink_key' and o.bar_key = c->>'designated_bar_key'
    )
    union all
    select 'DUPLICATE_COCKTAIL_CONCEPT', c->>'drink_key'
    from jsonb_array_elements(p_payload->'cocktail_candidates') c
    group by c->>'drink_key' having count(*) > 1
    union all
    select 'INGREDIENT_CANDIDATE_UNKNOWN', c->>'ingredient_key'
    from jsonb_array_elements(p_payload->'ingredient_candidates') c
    where not exists (select 1 from p_ings i where i.k = c->>'ingredient_key')
    union all
    select 'DUPLICATE_INGREDIENT_CANDIDATE', c->>'ingredient_key'
    from jsonb_array_elements(p_payload->'ingredient_candidates') c
    group by c->>'ingredient_key' having count(*) > 1
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('code', e.code, 'ref', e.ref)),
    '[]'::jsonb
  )
  from (select * from errs limit 50) e
$$;

create or replace function public.catalog_publish_set_diff(p_a text[], p_b text[])
returns jsonb
language sql
immutable
set search_path = public
as $$
  with
  added as (
    select t.x from unnest(p_b) as t(x)
    except
    select t.x from unnest(p_a) as t(x)
  ),
  removed as (
    select t.x from unnest(p_a) as t(x)
    except
    select t.x from unnest(p_b) as t(x)
  ),
  kept as (
    select t.x from unnest(p_a) as t(x)
    intersect
    select t.x from unnest(p_b) as t(x)
  )
  select jsonb_build_object(
    'added', coalesce((select jsonb_agg(s.x order by s.x) from (select x from added order by x limit 200) s), '[]'::jsonb),
    'added_count', (select count(*) from added),
    'removed', coalesce((select jsonb_agg(s.x order by s.x) from (select x from removed order by x limit 200) s), '[]'::jsonb),
    'removed_count', (select count(*) from removed),
    'unchanged_count', (select count(*) from kept)
  )
$$;

-- ---------------------------------------------------------------------------
-- 3) Schedule helpers (read-only)
-- ---------------------------------------------------------------------------
-- Keys that can never be assigned to a re-bound scheduled slot: cruise-wide exposures plus
-- every key sitting on a non-scheduled slot's offer (current, exposed, missed_paused, skipped).
create or replace function public.catalog_publish_excluded_keys(
  p_cruise_config_id uuid,
  p_category public.bounty_category
)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x.k), array[]::text[])
  from (
    select e.canonical_key as k
    from public.bounty_objective_exposures e
    where e.cruise_config_id = p_cruise_config_id and e.category = p_category
    union
    select o.canonical_key
    from public.bounty_slot_offers o
    join public.bounty_slots s on s.id = o.slot_id
    where s.cruise_config_id = p_cruise_config_id
      and s.category = p_category
      and s.state <> 'scheduled'
  ) x
$$;

revoke all on function public.catalog_publish_excluded_keys(uuid, public.bounty_category) from public, anon, authenticated;

-- Offers a publish must not strand: the live (current) offer per category and any offer
-- still inside its private 15-minute grace window.
create or replace function public.catalog_publish_protected_offers(
  p_cruise_config_id uuid,
  p_at_utc timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg public.cruise_config%rowtype;
  v_offset integer;
begin
  select * into v_cfg from public.cruise_config where id = p_cruise_config_id;
  if not found then
    return '[]'::jsonb;
  end if;
  v_offset := public.clock_offset_at(v_cfg.id, v_cfg.base_ship_offset_minutes, p_at_utc);

  return coalesce((
    select jsonb_agg(x.j)
    from (
      select jsonb_build_object(
        'offer_id', o.id,
        'slot_id', s.id,
        'slot_key', s.slot_key,
        'category', s.category,
        'canonical_key', o.canonical_key,
        'cocktail_offering_id', o.cocktail_offering_id,
        'ingredient_id', o.ingredient_id,
        'is_grace', false
      ) as j
      from public.bounty_slots s
      join public.bounty_slot_offers o on o.id = s.current_offer_id and o.is_active
      where s.cruise_config_id = p_cruise_config_id
        and s.state = 'current'
      union all
      select jsonb_build_object(
        'offer_id', o.id,
        'slot_id', s.id,
        'slot_key', s.slot_key,
        'category', s.category,
        'canonical_key', o.canonical_key,
        'cocktail_offering_id', o.cocktail_offering_id,
        'ingredient_id', o.ingredient_id,
        'is_grace', true
      )
      from public.bounty_slots s
      join public.bounty_slot_offers o on o.id = s.current_offer_id and o.is_active
      where s.cruise_config_id = p_cruise_config_id
        and s.state = 'exposed'
        and o.exposed_at_utc is not null
        and public.ship_local_to_utc((s.ship_date + s.public_end_ship_local)::timestamp, v_offset) <= p_at_utc
        and public.ship_local_to_utc((s.ship_date + s.public_end_ship_local)::timestamp, v_offset)
            > p_at_utc - interval '15 minutes'
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.catalog_publish_protected_offers(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Shared safety evaluation (read-only; used by preview, publish, rollback)
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

  if p_payload->>'schema_version' is distinct from '1.0'
     or p_payload->>'mode' is distinct from 'full_snapshot' then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'PAYLOAD_SCHEMA',
      'message', 'schema_version must be 1.0 and mode full_snapshot.'
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

-- ---------------------------------------------------------------------------
-- 5) Apply engine (volatile; caller holds advisory lock `catalog_publish`)
-- ---------------------------------------------------------------------------
-- Loads p_payload as a NEW catalog version (mirrors dev_activate_catalog_fixture loading,
-- but never deletes schedule / exposure / slot rows), reconciles overlays, then rebinds only
-- scheduled never-shown slots.
create or replace function public.catalog_publish_apply(
  p_payload jsonb,
  p_payload_hash text,
  p_actor_id uuid,
  p_source text,
  p_source_ref jsonb,
  p_active_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version uuid;
  v_cfg public.cruise_config%rowtype;
  v_has_cfg boolean := false;
  v_row record;
  v_ing record;
  v_n_carry integer := 0;
  v_n_redundant integer := 0;
  v_n_dropped integer := 0;
  v_n_corr integer := 0;
  v_re_c integer := 0;
  v_re_i integer := 0;
  v_pool uuid[];
  v_i integer;
  v_pick uuid;
  v_new_offer uuid;
  v_snap jsonb;
  v_concept uuid;
  v_key text;
  v_drink_name text;
  v_tier text;
  v_points integer;
  v_bar_key text;
  v_bar_name text;
  v_ing_name text;
  v_bar_count integer;
  v_preserved jsonb;
  v_reason text := 'catalog_' || p_source;
begin
  -- 5a) New catalog version (draft) ------------------------------------------
  insert into public.catalog_versions (
    catalog_id, schema_version, base_catalog_id, mode, payload_hash,
    manifest_json, status, source_notes, imported_at, activated_at
  ) values (
    p_payload->>'catalog_id',
    '1.0',
    nullif(p_payload->>'base_catalog_id', ''),
    'full_snapshot',
    p_payload_hash,
    p_payload,
    'draft',
    coalesce(p_payload->'source_notes', '{}'::jsonb),
    now(),
    null
  )
  returning id into v_version;

  -- 5b) Bars -----------------------------------------------------------------
  insert into public.bars (canonical_key)
  select distinct b->>'key' from jsonb_array_elements(p_payload->'bars') b
  on conflict (canonical_key) do nothing;

  insert into public.catalog_version_bars (catalog_version_id, bar_id, name, deck, active)
  select v_version, br.id, b->>'name', nullif(b->>'deck', ''),
         coalesce((b->>'active')::boolean, true)
  from jsonb_array_elements(p_payload->'bars') b
  join public.bars br on br.canonical_key = b->>'key';

  -- 5c) Ingredients + aliases ------------------------------------------------
  insert into public.ingredients (canonical_key)
  select distinct x->>'key' from jsonb_array_elements(p_payload->'ingredients') x
  on conflict (canonical_key) do nothing;

  insert into public.catalog_version_ingredients (catalog_version_id, ingredient_id, display_name, family)
  select v_version, i.id, x->>'name', nullif(x->>'family', '')
  from jsonb_array_elements(p_payload->'ingredients') x
  join public.ingredients i on i.canonical_key = x->>'key';

  insert into public.ingredient_aliases (catalog_version_id, ingredient_id, alias, alias_normalized)
  select v_version, i.id, a.alias, lower(trim(a.alias))
  from jsonb_array_elements(p_payload->'ingredients') x
  join public.ingredients i on i.canonical_key = x->>'key'
  cross join lateral jsonb_array_elements_text(coalesce(x->'aliases', '[]'::jsonb)) as a(alias)
  on conflict do nothing;

  -- 5d) Drinks, offerings, offering ingredients ------------------------------
  insert into public.drink_concepts (canonical_key)
  select distinct d->>'key' from jsonb_array_elements(p_payload->'drinks') d
  on conflict (canonical_key) do nothing;

  insert into public.catalog_version_drink_concepts (
    catalog_version_id, drink_concept_id, display_name, kind
  )
  select v_version, dc.id, d->>'name', (d->>'kind')::public.drink_kind
  from jsonb_array_elements(p_payload->'drinks') d
  join public.drink_concepts dc on dc.canonical_key = d->>'key';

  insert into public.bar_offerings (bar_id, drink_concept_id)
  select distinct br.id, dc.id
  from jsonb_array_elements(p_payload->'drinks') d
  cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o
  join public.bars br on br.canonical_key = o->>'bar_key'
  join public.drink_concepts dc on dc.canonical_key = d->>'key'
  on conflict (bar_id, drink_concept_id) do nothing;

  insert into public.catalog_version_offerings (
    catalog_version_id, offering_id, price_usd, price_status, evidence_reference, availability, seasonal
  )
  select v_version, bo.id,
         nullif(o->>'price_usd', '')::numeric,
         (o->>'price_status')::public.price_verification_status,
         o->>'evidence_reference',
         coalesce(o->>'availability', 'standard'),
         coalesce((o->>'seasonal')::boolean, false)
  from jsonb_array_elements(p_payload->'drinks') d
  cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o
  join public.bars br on br.canonical_key = o->>'bar_key'
  join public.drink_concepts dc on dc.canonical_key = d->>'key'
  join public.bar_offerings bo on bo.bar_id = br.id and bo.drink_concept_id = dc.id;

  insert into public.catalog_offering_ingredients (
    catalog_version_id, offering_id, ingredient_id, display_label
  )
  select distinct v_version, bo.id, i.id, null::text
  from jsonb_array_elements(p_payload->'drinks') d
  cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o
  cross join lateral jsonb_array_elements_text(coalesce(o->'ingredient_keys', '[]'::jsonb)) as k(ikey)
  join public.bars br on br.canonical_key = o->>'bar_key'
  join public.drink_concepts dc on dc.canonical_key = d->>'key'
  join public.bar_offerings bo on bo.bar_id = br.id and bo.drink_concept_id = dc.id
  join public.ingredients i on i.canonical_key = k.ikey;

  -- 5e) Candidates (eligibility derived by the same rules the stage check used) --
  insert into public.cocktail_candidates (
    catalog_version_id, offering_id, drink_concept_id, tier, points, eligible
  )
  select v_version, bo.id, dc.id, c.tier::public.cocktail_bounty_tier, c.points, c.eligible
  from public.catalog_payload_cocktail_pool(p_payload) c
  join public.bars br on br.canonical_key = c.bar_key
  join public.drink_concepts dc on dc.canonical_key = c.drink_key
  join public.bar_offerings bo on bo.bar_id = br.id and bo.drink_concept_id = dc.id;

  insert into public.ingredient_candidates (
    catalog_version_id, ingredient_id, known_bar_count, distinct_qualifying_drinks,
    tier, points, eligible
  )
  select v_version, i.id, c.known_bar_count, c.distinct_qualifying_drinks,
         c.tier::public.ingredient_bounty_tier, c.points, c.eligible
  from public.catalog_payload_ingredient_pool(p_payload) c
  join public.ingredients i on i.canonical_key = c.ingredient_key;

  -- 5f) Manual overlay reconcile ---------------------------------------------
  if p_active_version_id is not null then
    for v_row in
      select amo.*
      from public.admin_manual_offerings amo
      where amo.catalog_version_id = p_active_version_id and amo.active is true
      order by amo.created_at_utc
      for update
    loop
      if exists (
        select 1 from public.catalog_version_offerings
        where catalog_version_id = v_version and offering_id = v_row.offering_id
      ) then
        -- Snapshot now carries the same bar+drink: overlay is redundant. Deactivate on the
        -- old version only; never copy.
        update public.admin_manual_offerings
        set active = false,
            deactivated_at_utc = clock_timestamp(),
            deactivated_by_player_id = p_actor_id,
            deactivation_note = 'catalog_superseded: base catalog now includes this offering'
        where id = v_row.id;
        v_n_redundant := v_n_redundant + 1;

      elsif exists (
        select 1 from public.catalog_version_bars
        where catalog_version_id = v_version and bar_id = v_row.bar_id and active is true
      ) then
        -- Carry forward: drink concept row (base wins if the payload already has the concept).
        insert into public.catalog_version_drink_concepts (
          catalog_version_id, drink_concept_id, display_name, kind
        )
        select v_version, src.drink_concept_id, src.display_name, src.kind
        from public.catalog_version_drink_concepts src
        where src.catalog_version_id = p_active_version_id
          and src.drink_concept_id = v_row.drink_concept_id
        on conflict (catalog_version_id, drink_concept_id) do nothing;

        insert into public.catalog_version_drink_concepts (
          catalog_version_id, drink_concept_id, display_name, kind
        ) values (v_version, v_row.drink_concept_id, v_row.display_name, v_row.kind)
        on conflict (catalog_version_id, drink_concept_id) do nothing;

        insert into public.catalog_version_offerings (
          catalog_version_id, offering_id, price_usd, price_status, evidence_reference,
          availability, seasonal
        )
        select v_version, src.offering_id, src.price_usd, src.price_status, src.evidence_reference,
               src.availability, src.seasonal
        from public.catalog_version_offerings src
        where src.catalog_version_id = p_active_version_id and src.offering_id = v_row.offering_id;

        insert into public.admin_manual_offerings (
          catalog_version_id, offering_id, drink_concept_id, bar_id, display_name,
          drink_canonical_key, kind, active, created_by_player_id, created_at_utc,
          introduced_version_offering
        ) values (
          v_version, v_row.offering_id, v_row.drink_concept_id, v_row.bar_id, v_row.display_name,
          v_row.drink_canonical_key, v_row.kind, true, v_row.created_by_player_id,
          v_row.created_at_utc, true
        );

        for v_ing in
          select * from public.admin_manual_offering_ingredients
          where catalog_version_id = p_active_version_id and offering_id = v_row.offering_id
        loop
          insert into public.catalog_version_ingredients (
            catalog_version_id, ingredient_id, display_name, family
          )
          select v_version, src.ingredient_id, src.display_name, src.family
          from public.catalog_version_ingredients src
          where src.catalog_version_id = p_active_version_id
            and src.ingredient_id = v_ing.ingredient_id
          on conflict (catalog_version_id, ingredient_id) do nothing;

          insert into public.catalog_offering_ingredients (
            catalog_version_id, offering_id, ingredient_id, display_label
          ) values (v_version, v_ing.offering_id, v_ing.ingredient_id, v_ing.display_label)
          on conflict (catalog_version_id, offering_id, ingredient_id) do nothing;

          insert into public.admin_manual_offering_ingredients (
            catalog_version_id, offering_id, ingredient_id, display_label
          ) values (v_version, v_ing.offering_id, v_ing.ingredient_id, v_ing.display_label)
          on conflict (catalog_version_id, offering_id, ingredient_id) do nothing;
        end loop;
        v_n_carry := v_n_carry + 1;

      else
        update public.admin_manual_offerings
        set active = false,
            deactivated_at_utc = clock_timestamp(),
            deactivated_by_player_id = p_actor_id,
            deactivation_note = 'catalog_superseded: bar not active in new catalog'
        where id = v_row.id;
        v_n_dropped := v_n_dropped + 1;
      end if;
    end loop;
  end if;

  -- 5g) Corrections: catalog now carries the association -> overlay is redundant.
  -- Admin-suppressed rows (inactive_cause = admin) are never touched or reactivated.
  -- inactive_cause only allows admin | no_valid_sources, so redundant rows use
  -- no_valid_sources with a catalog_superseded note (they can reactivate on new support).
  update public.ingredient_corrections ic
  set active = false,
      deactivated_at_utc = clock_timestamp(),
      deactivated_by_player_id = null,
      deactivation_note = 'catalog_superseded',
      inactive_cause = 'no_valid_sources'
  where ic.active is true
    and coalesce(ic.inactive_cause, '') is distinct from 'admin'
    and exists (
      select 1 from public.catalog_offering_ingredients coi
      where coi.catalog_version_id = v_version
        and coi.offering_id = ic.offering_id
        and coi.ingredient_id = ic.ingredient_id
    );
  get diagnostics v_n_corr = row_count;

  -- 5h) Activate: retire old, activate new, flip pointer -----------------------
  if p_active_version_id is not null then
    update public.catalog_versions set status = 'retired'
    where id = p_active_version_id and status = 'active';
  end if;

  update public.catalog_versions
  set status = 'active', activated_at = now()
  where id = v_version;

  update public.active_catalog_pointer
  set catalog_version_id = v_version, updated_at = now()
  where id = 1;

  -- 5i) Rebind ONLY scheduled, never-shown slots ---------------------------------
  select * into v_cfg from public.cruise_config where is_active limit 1;
  v_has_cfg := found;

  if v_has_cfg then
    -- Serialize against slot exposure / skip while we rebind.
    perform 1 from public.bounty_slots where cruise_config_id = v_cfg.id order by id for update;

    -- A *current* slot keeps its offer (and the offer keeps its prior catalog_version_id) so
    -- the live objective and grace scoring are untouched. Only the slot pointer moves so Admin
    -- Skip draws replacement reserves from the live catalog.
    update public.bounty_slots
    set catalog_version_id = v_version, updated_at = now()
    where cruise_config_id = v_cfg.id and state = 'current';

    -- Cocktail slots
    v_pool := array(
      select bo.id
      from public.cocktail_candidates cc
      join public.bar_offerings bo on bo.id = cc.offering_id
      join public.drink_concepts dc on dc.id = bo.drink_concept_id
      where cc.catalog_version_id = v_version
        and cc.eligible is true
        and dc.canonical_key <> all (public.catalog_publish_excluded_keys(v_cfg.id, 'cocktail'))
      order by md5(bo.id::text || v_version::text)
    );
    v_i := 0;
    for v_row in
      select s.id as slot_id, s.current_offer_id
      from public.bounty_slots s
      where s.cruise_config_id = v_cfg.id and s.category = 'cocktail' and s.state = 'scheduled'
      order by s.cruise_day, s.slot_index
    loop
      v_i := v_i + 1;
      if v_i > coalesce(cardinality(v_pool), 0) then
        raise exception 'REMAINING_POOL_SHORTAGE: cocktail' using errcode = 'P0001';
      end if;
      v_pick := v_pool[v_i];

      select bo.drink_concept_id, dc.canonical_key, cvdc.display_name,
             cc.tier::text, cc.points, b.canonical_key, cvb.name
      into v_concept, v_key, v_drink_name, v_tier, v_points, v_bar_key, v_bar_name
      from public.bar_offerings bo
      join public.drink_concepts dc on dc.id = bo.drink_concept_id
      join public.cocktail_candidates cc
        on cc.offering_id = bo.id and cc.catalog_version_id = v_version
      join public.bars b on b.id = bo.bar_id
      join public.catalog_version_drink_concepts cvdc
        on cvdc.catalog_version_id = v_version and cvdc.drink_concept_id = dc.id
      join public.catalog_version_bars cvb
        on cvb.catalog_version_id = v_version and cvb.bar_id = b.id
      where bo.id = v_pick;

      select coalesce(jsonb_agg(jsonb_build_object(
        'ingredient_key', i.canonical_key,
        'display_label', coalesce(coi.display_label, cvi.display_name)
      ) order by coalesce(coi.display_label, cvi.display_name)), '[]'::jsonb)
      into v_snap
      from public.catalog_offering_ingredients coi
      join public.ingredients i on i.id = coi.ingredient_id
      join public.catalog_version_ingredients cvi
        on cvi.catalog_version_id = v_version and cvi.ingredient_id = i.id
      where coi.catalog_version_id = v_version and coi.offering_id = v_pick;

      v_snap := jsonb_build_object(
        'drink_key', v_key,
        'drink_name', v_drink_name,
        'designated_bar_key', v_bar_key,
        'designated_bar_name', v_bar_name,
        'tier', v_tier,
        'points', v_points,
        'listed_ingredients', coalesce(v_snap, '[]'::jsonb)
      );

      update public.bounty_slot_offers
      set is_active = false,
          replaced_at_utc = clock_timestamp(),
          reason = case when reason = 'initial' then v_reason else reason || '+' || v_reason end
      where id = v_row.current_offer_id and is_active is true;

      insert into public.bounty_slot_offers (
        slot_id, catalog_version_id, canonical_key, cocktail_concept_id, cocktail_offering_id,
        tier, points, display_snapshot, is_active, reason
      ) values (
        v_row.slot_id, v_version, v_key, v_concept, v_pick,
        v_tier, v_points, v_snap, true, v_reason
      )
      returning id into v_new_offer;

      update public.bounty_slots
      set current_offer_id = v_new_offer, catalog_version_id = v_version, updated_at = now()
      where id = v_row.slot_id;
      v_re_c := v_re_c + 1;
    end loop;

    -- Ingredient slots
    v_pool := array(
      select ic.ingredient_id
      from public.ingredient_candidates ic
      join public.ingredients i on i.id = ic.ingredient_id
      where ic.catalog_version_id = v_version
        and ic.eligible is true
        and i.canonical_key <> all (public.catalog_publish_excluded_keys(v_cfg.id, 'ingredient'))
      order by md5(ic.ingredient_id::text || v_version::text || 'i')
    );
    v_i := 0;
    for v_row in
      select s.id as slot_id, s.current_offer_id
      from public.bounty_slots s
      where s.cruise_config_id = v_cfg.id and s.category = 'ingredient' and s.state = 'scheduled'
      order by s.cruise_day, s.slot_index
    loop
      v_i := v_i + 1;
      if v_i > coalesce(cardinality(v_pool), 0) then
        raise exception 'REMAINING_POOL_SHORTAGE: ingredient' using errcode = 'P0001';
      end if;
      v_pick := v_pool[v_i];

      select i.canonical_key, cvi.display_name, ic.tier::text, ic.points, ic.known_bar_count
      into v_key, v_ing_name, v_tier, v_points, v_bar_count
      from public.ingredients i
      join public.ingredient_candidates ic
        on ic.ingredient_id = i.id and ic.catalog_version_id = v_version
      join public.catalog_version_ingredients cvi
        on cvi.catalog_version_id = v_version and cvi.ingredient_id = i.id
      where i.id = v_pick;

      v_snap := jsonb_build_object(
        'ingredient_key', v_key,
        'display_name', v_ing_name,
        'tier', v_tier,
        'points', v_points,
        'known_bar_count', v_bar_count
      );

      update public.bounty_slot_offers
      set is_active = false,
          replaced_at_utc = clock_timestamp(),
          reason = case when reason = 'initial' then v_reason else reason || '+' || v_reason end
      where id = v_row.current_offer_id and is_active is true;

      insert into public.bounty_slot_offers (
        slot_id, catalog_version_id, canonical_key, ingredient_id,
        tier, points, display_snapshot, is_active, reason
      ) values (
        v_row.slot_id, v_version, v_key, v_pick,
        v_tier, v_points, v_snap, true, v_reason
      )
      returning id into v_new_offer;

      update public.bounty_slots
      set current_offer_id = v_new_offer, catalog_version_id = v_version, updated_at = now()
      where id = v_row.slot_id;
      v_re_i := v_re_i + 1;
    end loop;

    if v_re_c + v_re_i > 0 then
      insert into public.bounty_schedule_runs (
        cruise_config_id, catalog_version_id, cocktail_slots, ingredient_slots,
        seed_token, created_by, notes
      ) values (
        v_cfg.id, v_version, v_re_c, v_re_i, p_source_ref->>'client_request_id', p_actor_id,
        jsonb_build_object('source', 'catalog_' || p_source, 'previous_catalog_version_id', p_active_version_id)
      )
      on conflict (cruise_config_id, catalog_version_id) do nothing;
    end if;

    select coalesce(jsonb_object_agg(st, n), '{}'::jsonb) into v_preserved
    from (
      select state::text as st, count(*) as n
      from public.bounty_slots
      where cruise_config_id = v_cfg.id and state <> 'scheduled'
      group by state
    ) x;
  else
    v_preserved := '{}'::jsonb;
  end if;

  insert into public.catalog_source_notes (catalog_version_id, note_type, payload)
  values (
    v_version,
    p_source,
    coalesce(p_source_ref, '{}'::jsonb) || jsonb_build_object(
      'previous_catalog_version_id', p_active_version_id,
      'payload_hash', p_payload_hash
    )
  );

  return jsonb_build_object(
    'catalog_version_id', v_version,
    'catalog_id', p_payload->>'catalog_id',
    'previous_catalog_version_id', p_active_version_id,
    'payload_hash', p_payload_hash,
    'reassigned_slots', jsonb_build_object('cocktail', v_re_c, 'ingredient', v_re_i),
    'preserved_slots_by_state', v_preserved,
    'manual_offerings', jsonb_build_object(
      'carried_forward', v_n_carry,
      'redundant', v_n_redundant,
      'dropped', v_n_dropped
    ),
    'corrections_deactivated_redundant', v_n_corr
  );
end;
$$;

revoke all on function public.catalog_publish_apply(jsonb, text, uuid, text, jsonb, uuid) from public, anon, authenticated;

-- Ledger completion helper
create or replace function public.catalog_publish_finish_request(
  p_client_request_id uuid,
  p_status text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admin_catalog_publish_requests
  set status = p_status,
      result_json = p_result,
      completed_at_utc = clock_timestamp()
  where client_request_id = p_client_request_id;
  return p_result || jsonb_build_object('client_request_id', p_client_request_id, 'idempotent_replay', false);
end;
$$;

revoke all on function public.catalog_publish_finish_request(uuid, text, jsonb) from public, anon, authenticated;

-- Ledger begin: returns a replay / conflict jsonb, or null when the caller may proceed.
create or replace function public.catalog_publish_begin_request(
  p_client_request_id uuid,
  p_fingerprint text,
  p_action text,
  p_actor uuid,
  p_expected_active uuid,
  p_candidate uuid,
  p_target uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.admin_catalog_publish_requests%rowtype;
begin
  select * into v_existing
  from public.admin_catalog_publish_requests
  where client_request_id = p_client_request_id
  for update;

  if found then
    if v_existing.fingerprint is distinct from p_fingerprint then
      return jsonb_build_object('ok', false, 'code', 'REQUEST_ID_OPERATION_MISMATCH');
    end if;
    if v_existing.status = 'in_progress' and v_existing.lease_expires_at_utc > clock_timestamp() then
      return jsonb_build_object('ok', false, 'code', 'REQUEST_IN_PROGRESS', 'client_request_id', p_client_request_id);
    end if;
    if v_existing.status in ('completed', 'failed') then
      return coalesce(v_existing.result_json, '{}'::jsonb) || jsonb_build_object(
        'idempotent_replay', true,
        'client_request_id', p_client_request_id
      );
    end if;
    -- Expired lease: take over.
    update public.admin_catalog_publish_requests
    set lease_expires_at_utc = clock_timestamp() + interval '2 minutes'
    where client_request_id = p_client_request_id;
    return null;
  end if;

  insert into public.admin_catalog_publish_requests (
    client_request_id, fingerprint, action, actor_id, expected_active_version_id,
    candidate_id, target_catalog_version_id, payload_hash, status
  ) values (
    p_client_request_id, p_fingerprint, p_action, p_actor, p_expected_active,
    p_candidate, p_target, p_payload_hash, 'in_progress'
  );
  return null;
end;
$$;

revoke all on function public.catalog_publish_begin_request(uuid, text, text, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) RPC: stage
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

  if p_payload->>'schema_version' is distinct from '1.0' then
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

-- ---------------------------------------------------------------------------
-- 7) RPC: preview (READ-ONLY)
-- ---------------------------------------------------------------------------
create or replace function public.admin_preview_catalog_publish(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.require_admin();
  v_cand public.catalog_import_candidates%rowtype;
  v_active uuid := public.admin_active_catalog_id();
  v_eval jsonb;
  v_blockers jsonb;
begin
  select * into v_cand from public.catalog_import_candidates where id = p_candidate_id;
  if not found then
    return jsonb_build_object(
      'ok', false, 'code', 'CANDIDATE_NOT_FOUND',
      'read_only', true, 'mutated_database', false, 'safe_to_publish', false
    );
  end if;

  v_eval := public.catalog_publish_evaluate(v_cand.payload_json, v_active);
  v_blockers := v_eval->'blockers';

  if v_cand.status <> 'staged' then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'CANDIDATE_NOT_STAGED',
      'message', 'Candidate is not in staged status.',
      'status', v_cand.status
    ));
  end if;
  if public.catalog_payload_sha256(v_cand.payload_json) is distinct from v_cand.payload_hash then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'PAYLOAD_HASH_MISMATCH',
      'message', 'Stored payload no longer matches its staged hash.'
    ));
  end if;

  return jsonb_build_object(
    'ok', true,
    'read_only', true,
    'mutated_database', false,
    'candidate_id', v_cand.id,
    'catalog_id', v_cand.catalog_id,
    'base_catalog_id', v_cand.base_catalog_id,
    'payload_hash', v_cand.payload_hash,
    'candidate_status', v_cand.status,
    'active_catalog_version_id', v_active,
    'safe_to_publish', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'warnings', v_eval->'warnings',
    'diff', v_eval->'diff',
    'overlays', v_eval->'overlays',
    'schedule', v_eval->'schedule',
    'actor_id', v_actor
  );
end;
$$;

revoke all on function public.admin_preview_catalog_publish(uuid) from public;
grant execute on function public.admin_preview_catalog_publish(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) RPC: publish
-- ---------------------------------------------------------------------------
-- Old single-argument stub signature: kept so existing callers fail with an explicit code.
create or replace function public.admin_publish_catalog_import(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  raise exception 'CATALOG_PUBLISH_USE_CANDIDATE_FLOW'
    using errcode = 'P0001',
          hint = 'Stage with admin_stage_catalog_import, preview, then publish by candidate id.';
end;
$$;

revoke all on function public.admin_publish_catalog_import(jsonb) from public;
grant execute on function public.admin_publish_catalog_import(jsonb) to authenticated;

create or replace function public.admin_publish_catalog_import(
  p_client_request_id uuid,
  p_candidate_id uuid,
  p_expected_active_catalog_version_id uuid,
  p_expected_payload_hash text
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
  v_cand public.catalog_import_candidates%rowtype;
  v_active uuid;
  v_eval jsonb;
  v_applied jsonb;
  v_result jsonb;
begin
  if p_client_request_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_ID');
  end if;

  perform pg_advisory_xact_lock(hashtext('catalog_publish'));

  v_fp := md5(
    'publish|' || coalesce(p_candidate_id::text, '') || '|' ||
    coalesce(p_expected_active_catalog_version_id::text, '') || '|' ||
    coalesce(p_expected_payload_hash, '')
  );

  v_replay := public.catalog_publish_begin_request(
    p_client_request_id, v_fp, 'publish', v_actor,
    p_expected_active_catalog_version_id, p_candidate_id, null, p_expected_payload_hash
  );
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_cand
  from public.catalog_import_candidates
  where id = p_candidate_id
  for update;

  if not found then
    return public.catalog_publish_finish_request(
      p_client_request_id, 'failed',
      jsonb_build_object('ok', false, 'code', 'CANDIDATE_NOT_FOUND')
    );
  end if;
  if v_cand.status = 'published' then
    return public.catalog_publish_finish_request(
      p_client_request_id, 'failed',
      jsonb_build_object('ok', false, 'code', 'CANDIDATE_ALREADY_PUBLISHED',
        'catalog_version_id', v_cand.published_catalog_version_id)
    );
  end if;
  if v_cand.status <> 'staged' then
    return public.catalog_publish_finish_request(
      p_client_request_id, 'failed',
      jsonb_build_object('ok', false, 'code', 'CANDIDATE_NOT_STAGED', 'status', v_cand.status)
    );
  end if;
  if p_expected_payload_hash is distinct from v_cand.payload_hash
     or public.catalog_payload_sha256(v_cand.payload_json) is distinct from v_cand.payload_hash then
    return public.catalog_publish_finish_request(
      p_client_request_id, 'failed',
      jsonb_build_object('ok', false, 'code', 'PAYLOAD_HASH_MISMATCH')
    );
  end if;

  v_active := public.admin_active_catalog_id();
  if v_active is distinct from p_expected_active_catalog_version_id then
    return public.catalog_publish_finish_request(
      p_client_request_id, 'failed',
      jsonb_build_object(
        'ok', false, 'code', 'STALE_ACTIVE_VERSION',
        'message', 'The active catalog changed since preview. Preview again.',
        'active_catalog_version_id', v_active
      )
    );
  end if;

  v_eval := public.catalog_publish_evaluate(v_cand.payload_json, v_active);
  if jsonb_array_length(v_eval->'blockers') > 0 then
    return public.catalog_publish_finish_request(
      p_client_request_id, 'failed',
      jsonb_build_object(
        'ok', false, 'code', 'PUBLISH_BLOCKED',
        'blockers', v_eval->'blockers',
        'warnings', v_eval->'warnings'
      )
    );
  end if;

  v_applied := public.catalog_publish_apply(
    v_cand.payload_json, v_cand.payload_hash, v_actor, 'publish',
    jsonb_build_object('candidate_id', v_cand.id, 'client_request_id', p_client_request_id),
    v_active
  );

  update public.catalog_import_candidates
  set status = 'published',
      published_catalog_version_id = (v_applied->>'catalog_version_id')::uuid,
      published_at = now()
  where id = v_cand.id;

  update public.admin_catalog_publish_requests
  set candidate_id = v_cand.id
  where client_request_id = p_client_request_id;

  perform public.write_admin_audit(
    'catalog.publish_import', v_actor, 'catalog_versions', v_applied->>'catalog_version_id',
    jsonb_build_object('previous_catalog_version_id', v_active),
    v_applied || jsonb_build_object('candidate_id', v_cand.id)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'action', 'publish',
    'candidate_id', v_cand.id,
    'warnings', v_eval->'warnings'
  ) || v_applied;

  return public.catalog_publish_finish_request(p_client_request_id, 'completed', v_result);
end;
$$;

revoke all on function public.admin_publish_catalog_import(uuid, uuid, uuid, text) from public;
grant execute on function public.admin_publish_catalog_import(uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) RPC: rollback (new audited revision from a retired version's content)
-- ---------------------------------------------------------------------------
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
     or v_target.manifest_json->>'schema_version' is distinct from '1.0'
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

-- ---------------------------------------------------------------------------
-- 10) RPC: reconcile + list
-- ---------------------------------------------------------------------------
create or replace function public.admin_find_catalog_publish_request_by_id(
  p_client_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.admin_catalog_publish_requests%rowtype;
begin
  perform public.require_admin();
  if p_client_request_id is null then
    return null;
  end if;

  select * into v_row
  from public.admin_catalog_publish_requests
  where client_request_id = p_client_request_id;
  if not found then
    return null;
  end if;

  return coalesce(v_row.result_json, '{}'::jsonb) || jsonb_build_object(
    'idempotent_replay', true,
    'client_request_id', v_row.client_request_id,
    'request_status', v_row.status,
    'action', v_row.action,
    'candidate_id', v_row.candidate_id,
    'target_catalog_version_id', v_row.target_catalog_version_id,
    'received_at_utc', v_row.received_at_utc,
    'completed_at_utc', v_row.completed_at_utc
  );
end;
$$;

revoke all on function public.admin_find_catalog_publish_request_by_id(uuid) from public;
grant execute on function public.admin_find_catalog_publish_request_by_id(uuid) to authenticated;

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
        and cv.manifest_json->>'schema_version' = '1.0',
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

comment on function public.admin_publish_catalog_import(uuid, uuid, uuid, text) is
  'Phase 6B2: publish a staged candidate under advisory lock catalog_publish. Rebinds only scheduled never-shown slots; idempotent by client_request_id.';
comment on function public.admin_rollback_catalog(uuid, uuid, uuid) is
  'Phase 6B2: rollback publishes a retired version''s manifest as a NEW audited revision with the same safety checks as publish.';
comment on function public.admin_preview_catalog_publish(uuid) is
  'Phase 6B2: read-only publish plan (diff, overlays, blockers). Never mutates.';

-- ---------------------------------------------------------------------------
-- 11) Lock down EXECUTE (Supabase default ACLs grant anon/authenticated on new functions)
-- ---------------------------------------------------------------------------
-- Internal helpers are only reachable from the SECURITY DEFINER admin RPCs above.
revoke all on function public.catalog_payload_sha256(jsonb) from public, anon, authenticated;
revoke all on function public.catalog_payload_shape_ok(jsonb) from public, anon, authenticated;
revoke all on function public.catalog_payload_offerings(jsonb) from public, anon, authenticated;
revoke all on function public.catalog_payload_cocktail_pool(jsonb) from public, anon, authenticated;
revoke all on function public.catalog_payload_ingredient_pool(jsonb) from public, anon, authenticated;
revoke all on function public.catalog_payload_reference_errors(jsonb) from public, anon, authenticated;
revoke all on function public.catalog_publish_set_diff(text[], text[]) from public, anon, authenticated;

-- Admin RPCs: authenticated only (require_admin still enforces organizer access).
revoke execute on function public.admin_stage_catalog_import(uuid, jsonb, jsonb) from anon;
revoke execute on function public.admin_preview_catalog_publish(uuid) from anon;
revoke execute on function public.admin_publish_catalog_import(jsonb) from anon;
revoke execute on function public.admin_publish_catalog_import(uuid, uuid, uuid, text) from anon;
revoke execute on function public.admin_rollback_catalog(uuid, uuid, uuid) from anon;
revoke execute on function public.admin_find_catalog_publish_request_by_id(uuid) from anon;
revoke execute on function public.admin_list_catalog_versions() from anon;
