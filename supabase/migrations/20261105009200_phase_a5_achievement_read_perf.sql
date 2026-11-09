-- Achievements read-path performance:
-- - Lightweight collection live counts (no checklist items)
-- - Avoid double full-status work in card payloads / progress
-- - Gauntlet summaries use live counts only
-- Full checklist still uses achievement_collection_status / get_drinkit_collection_checklist.

-- ---------------------------------------------------------------------------
-- Set-based covered offering count (replaces per-offering EXISTS loops for reads)
-- ---------------------------------------------------------------------------
create or replace function public.achievement_collection_covered_count(
  p_offering_ids uuid[],
  p_owner uuid,
  p_as_of_utc timestamptz default null,
  p_as_of_id uuid default null
) returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(distinct d.offering_id), 0)::int
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
    and d.offering_id = any (coalesce(p_offering_ids, '{}'::uuid[]))
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
    );
$$;

revoke all on function public.achievement_collection_covered_count(uuid[], uuid, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.achievement_collection_covered_count(uuid[], uuid, timestamptz, uuid)
  to service_role;

comment on function public.achievement_collection_covered_count(uuid[], uuid, timestamptz, uuid) is
  'Count distinct eligible offerings covered for a collection without building checklist items.';

-- ---------------------------------------------------------------------------
-- Lightweight live progress for one collection definition
-- ---------------------------------------------------------------------------
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
    'catalog_version_id', v_resolved->>'catalog_version_id',
    'live_target', v_target,
    'live_current', least(v_current, greatest(v_target, 0))
  );
end;
$$;

revoke all on function public.achievement_collection_live_progress(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.achievement_collection_live_progress(uuid, uuid)
  to service_role;

comment on function public.achievement_collection_live_progress(uuid, uuid) is
  'Collection live_current/live_target without checklist items. For list cards and gauntlet summaries.';

-- ---------------------------------------------------------------------------
-- Progress helper: collections use live progress (not full status/items)
-- ---------------------------------------------------------------------------
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
-- Card payload: one live-progress call for collections (no full checklist)
-- Preserves A5 ship-local + disclosure rules from 090.
-- ---------------------------------------------------------------------------
create or replace function public.achievement_card_payload(
  p_def public.achievement_definitions,
  p_award public.achievement_awards,
  p_owner_player uuid,
  p_owner_team uuid,
  p_viewer uuid,
  p_finale boolean,
  p_view text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_earned boolean := p_award.id is not null and p_award.status = 'active';
  v_claimed_other boolean := false;
  v_title text;
  v_desc text;
  v_progress jsonb;
  v_exclusive_owner_name text;
  v_mask_secret boolean;
  v_mask_public_title boolean;
  v_cfg jsonb := public.achievement_cfg(p_def);
  v_scope text;
  v_bar_key text;
  v_collection jsonb := null;
  v_live jsonb;
  v_pin jsonb;
  v_pin_target int;
  v_ship_local text := null;
  v_cruise_id uuid;
  v_base_offset int;
  v_live_current int;
  v_live_target int;
begin
  if p_def.exclusive and not v_earned then
    select exists (
      select 1 from public.achievement_awards a
      where a.definition_id = p_def.id and a.status = 'active' and a.exclusive_slot
    ) into v_claimed_other;
    if v_claimed_other then
      select coalesce(pl.display_name, tm.name)
      into v_exclusive_owner_name
      from public.achievement_awards a
      left join public.players pl on pl.id = a.owner_player_id
      left join public.teams tm on tm.id = a.owner_team_id
      where a.definition_id = p_def.id and a.status = 'active' and a.exclusive_slot
      limit 1;
    end if;
  end if;

  v_mask_secret := p_def.secret and not v_earned and not p_finale;
  v_mask_public_title :=
    (not p_def.secret)
    and not v_earned
    and not p_finale
    and not v_claimed_other;

  if v_mask_secret then
    v_title := '?????';
    v_desc := 'Secret Achievement';
  elsif v_mask_public_title then
    v_title := '?????';
    v_desc := p_def.display_description;
  else
    v_title := p_def.title;
    v_desc := p_def.display_description;
  end if;

  if p_def.condition_type = 'offering_collection' and not v_mask_secret then
    v_scope := coalesce(v_cfg->>'scope', 'personal');
    v_bar_key := nullif(v_cfg->>'bar_key', '');
    v_live := public.achievement_collection_live_progress(p_def.id, p_owner_player);
    v_pin := p_award.evidence_json->'collection_pin';
    if v_pin is not null and jsonb_typeof(v_pin->'offering_ids') = 'array' then
      v_pin_target := jsonb_array_length(v_pin->'offering_ids');
    end if;
    if coalesce(v_live->>'ok', 'false') = 'true' then
      v_live_current := coalesce((v_live->>'live_current')::int, 0);
      v_live_target := coalesce((v_live->>'live_target')::int, 0);
      v_collection := jsonb_build_object(
        'scope', v_scope,
        'bar_key', v_bar_key,
        'live_current', v_live_current,
        'live_target', v_live_target,
        'badge_earned', v_earned,
        'pin_target', v_pin_target,
        'current_menu_complete',
          v_live_target > 0 and v_live_current >= v_live_target
      );
      if not v_earned and v_live_target > 0 then
        v_progress := jsonb_build_object(
          'current', least(v_live_current, v_live_target),
          'target', v_live_target,
          'kind', 'collection'
        );
      end if;
    end if;
  elsif not v_earned then
    v_progress := public.achievement_progress_for_owner(p_def, p_owner_player, p_owner_team);
    if v_mask_secret then
      v_progress := null;
    end if;
  end if;

  if v_earned and p_award.awarded_at_utc is not null then
    select cc.id, cc.base_ship_offset_minutes
      into v_cruise_id, v_base_offset
    from public.cruise_config cc
    where cc.is_active
    limit 1;
    if v_cruise_id is not null then
      v_ship_local := to_char(
        public.utc_to_ship_local(
          p_award.awarded_at_utc,
          public.clock_offset_at(v_cruise_id, v_base_offset, p_award.awarded_at_utc)
        ),
        'YYYY-MM-DD"T"HH24:MI:SS'
      );
    end if;
  end if;

  return jsonb_build_object(
    'definition_id', p_def.id,
    'stable_key', p_def.stable_key,
    'game', p_def.game,
    'group_key', p_def.group_key,
    'exclusive', p_def.exclusive,
    'secret', p_def.secret,
    'icon_key', case when v_mask_secret then null else p_def.icon_key end,
    'title', v_title,
    'description', v_desc,
    'earned', v_earned,
    'awarded_at_utc', p_award.awarded_at_utc,
    'awarded_at_ship_local', v_ship_local,
    'award_id', p_award.id,
    'progress', v_progress,
    'collection', v_collection,
    'exclusive_claimed', v_claimed_other or (p_def.exclusive and v_earned),
    'exclusive_owner_name', case
      when v_earned and p_def.exclusive then
        coalesce(
          (select display_name from public.players where id = p_award.owner_player_id),
          (select name from public.teams where id = p_award.owner_team_id)
        )
      when v_claimed_other then v_exclusive_owner_name
      else null
    end,
    'masked', v_mask_secret or v_mask_public_title,
    'view', p_view
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Gauntlet summaries: live counts only (no checklist item construction)
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
      and coalesce((pstat->>'live_target')::int, 0) > 0
  ) q;

  return jsonb_build_object('ok', true, 'bars', coalesce(v_rows, '[]'::jsonb));
end;
$$;

comment on function public.list_drinkit_bar_gauntlet_summaries() is
  'Lightweight bar gauntlet progress for Achievements shells. Checklist details load on expand.';

-- Helpful indexes for achievement drink-log reads (safe if already present).
create index if not exists drink_logs_offering_id_idx
  on public.drink_logs (offering_id)
  where offering_id is not null;

create index if not exists submissions_author_accepted_drink_idx
  on public.submissions (author_player_id, received_at_utc desc)
  where status = 'accepted' and kind = 'drink_log';
