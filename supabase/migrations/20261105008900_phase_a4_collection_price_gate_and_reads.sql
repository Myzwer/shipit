-- Stage A4: within-$15 price gate for collection eligibility + achievement read models.
-- Append-only. Preserves awards/pins; incomplete denominators follow the active catalog.

-- ---------------------------------------------------------------------------
-- Collection eligibility: Category A or B price evidence required
-- ---------------------------------------------------------------------------
create or replace function public.achievement_offering_collection_price_ok(
  p_price_status public.price_verification_status
) returns boolean
language sql
immutable
as $$
  select p_price_status in (
    'verified_within_limit'::public.price_verification_status,
    'approved_filtered_within_limit'::public.price_verification_status
  );
$$;

comment on function public.achievement_offering_collection_price_ok(public.price_verification_status) is
  'Gauntlet/collection required offerings need Category A or B within-$15 evidence. Unverified remains loggable but not mandatory.';

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
      and public.achievement_offering_collection_price_ok(cvo.price_status)
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
    and public.achievement_offering_collection_price_ok(cvo.price_status)
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

-- ---------------------------------------------------------------------------
-- Progress: offering_collection exposes live X/Y; same_log stays binary (null)
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
    v_status := public.achievement_collection_status(p_def.id, p_owner_player);
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
-- Card payload: collection metadata for A5 without full checklists
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
  v_status jsonb;
  v_pin jsonb;
  v_pin_target int;
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
  v_mask_public_title := (not p_def.secret) and not v_earned and not p_finale;

  if v_mask_secret then
    v_title := '?????';
    v_desc := 'Secret Achievement';
  elsif v_mask_public_title then
    v_title := 'Achievement';
    v_desc := p_def.display_description;
  else
    v_title := p_def.title;
    v_desc := p_def.display_description;
  end if;

  if not v_earned then
    v_progress := public.achievement_progress_for_owner(p_def, p_owner_player, p_owner_team);
    if v_mask_secret and v_progress is null then
      v_progress := null;
    end if;
  end if;

  if p_def.condition_type = 'offering_collection' and not v_mask_secret then
    v_scope := coalesce(v_cfg->>'scope', 'personal');
    v_bar_key := nullif(v_cfg->>'bar_key', '');
    v_status := public.achievement_collection_status(p_def.id, p_owner_player);
    v_pin := p_award.evidence_json->'collection_pin';
    if v_pin is not null and jsonb_typeof(v_pin->'offering_ids') = 'array' then
      v_pin_target := jsonb_array_length(v_pin->'offering_ids');
    end if;
    if coalesce(v_status->>'ok', 'false') = 'true' then
      v_collection := jsonb_build_object(
        'scope', v_scope,
        'bar_key', v_bar_key,
        'live_current', coalesce((v_status->>'live_current')::int, 0),
        'live_target', coalesce((v_status->>'live_target')::int, 0),
        'badge_earned', v_earned,
        'pin_target', v_pin_target,
        'current_menu_complete',
          coalesce((v_status->>'live_target')::int, 0) > 0
          and coalesce((v_status->>'live_current')::int, 0)
            >= coalesce((v_status->>'live_target')::int, 0)
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
-- Bar gauntlet summaries (lightweight list for All / I Need / We Need shells)
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
      select public.achievement_collection_status(pdef.id, v_me) as s
    ) ps on true
    left join lateral (
      select public.achievement_collection_status(cdef.id, v_me) as s
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

revoke all on function public.list_drinkit_bar_gauntlet_summaries() from public;
grant execute on function public.list_drinkit_bar_gauntlet_summaries() to authenticated;

-- ---------------------------------------------------------------------------
-- Shared collection checklist detail (opened gauntlet). No per-person identities.
-- ---------------------------------------------------------------------------
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

  -- Prefer personal status items (same required set as collective for a bar).
  if coalesce(v_pstat->>'ok', 'false') = 'true' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'offering_id', item->>'offering_id',
        'concept_key', item->>'concept_key',
        'display_name', item->>'display_name',
        'mine', coalesce((item->>'mine')::boolean, false),
        'everyone', coalesce((item->>'covered')::boolean, false)
      )
      order by item->>'concept_key'
    ), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(v_pstat->'items', '[]'::jsonb)) item;
  elsif coalesce(v_cstat->>'ok', 'false') = 'true' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'offering_id', item->>'offering_id',
        'concept_key', item->>'concept_key',
        'display_name', item->>'display_name',
        'mine', coalesce((item->>'mine')::boolean, false),
        'everyone', coalesce((item->>'covered')::boolean, false)
      )
      order by item->>'concept_key'
    ), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(v_cstat->'items', '[]'::jsonb)) item;
  end if;

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

revoke all on function public.get_drinkit_collection_checklist(text) from public;
grant execute on function public.get_drinkit_collection_checklist(text) to authenticated;

comment on function public.list_drinkit_bar_gauntlet_summaries() is
  'A4 lightweight bar gauntlet summaries. Excludes bars with zero eligible (within-limit) offerings.';
comment on function public.get_drinkit_collection_checklist(text) is
  'A4 shared personal/collective checklist for one bar. Returns mine/everyone flags only — never per-player identities.';
