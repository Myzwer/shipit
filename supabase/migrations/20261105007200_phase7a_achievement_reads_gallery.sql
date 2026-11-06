-- Phase 7A: Achievement list/unread RPCs + Gallery achievement cards.

-- Cruise reseed deletes gallery_events; awards must not block that cascade.
alter table public.achievement_awards
  drop constraint if exists achievement_awards_gallery_fk;
alter table public.achievement_awards
  add constraint achievement_awards_gallery_fk
  foreign key (gallery_event_id) references public.gallery_events (id) on delete set null;

-- Development helper: wipe awards/defs so local clock reseed stays unblocked.
create or replace function public.dev_clear_test_achievements()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allowed when no active cruise, or active cruise is development-only.
  if exists (
    select 1 from public.cruise_config where is_active and label is distinct from 'development-only'
  ) then
    raise exception 'DEV_ONLY' using errcode = 'P0001';
  end if;

  update public.gallery_events ge
  set achievement_award_id = null
  where achievement_award_id is not null;

  update public.achievement_awards set gallery_event_id = null;

  delete from public.gallery_events where kind = 'achievement';
  delete from public.achievement_awards;
  delete from public.achievement_definitions where test_only;
  delete from public.ingredient_tags;
  delete from public.drink_concept_tags;
end;
$$;

revoke all on function public.dev_clear_test_achievements() from public;
grant execute on function public.dev_clear_test_achievements() to service_role;

-- ---------------------------------------------------------------------------
-- Progress helpers (public numeric counters only when safe)
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
begin
  -- Only expose unexplained X/Y for simple numeric thresholds.
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
  -- Public unearned: mask funny title before finale; still show requirement.
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

  -- Progress: secret only when numeric truly supported; never invent.
  if not v_earned then
    v_progress := public.achievement_progress_for_owner(p_def, p_owner_player, p_owner_team);
    if v_mask_secret and v_progress is null then
      v_progress := null;
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

create or replace function public.list_achievements(
  p_game public.game_id,
  p_view text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_view text := lower(trim(coalesce(p_view, 'all')));
  v_team uuid;
  v_finale boolean;
  v_include_test boolean;
  v_rows jsonb := '[]'::jsonb;
  v_owner_player uuid;
  v_owner_team uuid;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game(p_game) and not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;
  if v_view not in ('all', 'mine') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_VIEW');
  end if;

  v_finale := public.achievement_is_finale(clock_timestamp());
  v_include_test := public.achievement_dev_cruise_active();
  if p_game = 'shipit' then
    v_team := public.current_team_id();
  end if;

  v_owner_player := case when p_game = 'drinkit' then v_me else null end;
  v_owner_team := case when p_game = 'shipit' then v_team else null end;

  select coalesce(
    jsonb_agg(card order by
      case when v_view = 'mine' then (card->>'awarded_at_utc') end desc nulls last,
      card->>'group_key',
      card->>'stable_key'
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select public.achievement_card_payload(
      d,
      a,
      v_owner_player,
      v_owner_team,
      v_me,
      v_finale,
      v_view
    ) as card
    from public.achievement_definitions d
    left join lateral (
      select aw.*
      from public.achievement_awards aw
      where aw.definition_id = d.id
        and aw.status = 'active'
        and (
          (p_game = 'drinkit' and aw.owner_player_id = v_me)
          or (p_game = 'shipit' and v_team is not null and aw.owner_team_id = v_team)
          or (
            d.exclusive
            and aw.exclusive_slot
            and v_view = 'all'
            and not exists (
              select 1 from public.achievement_awards mine
              where mine.definition_id = d.id
                and mine.status = 'active'
                and (
                  (p_game = 'drinkit' and mine.owner_player_id = v_me)
                  or (p_game = 'shipit' and mine.owner_team_id = v_team)
                )
            )
          )
        )
      order by aw.awarded_at_utc desc
      limit 1
    ) a on true
    where d.enabled
      and d.game = p_game
      and (not d.test_only or v_include_test)
      and (
        v_view = 'all'
        or (v_view = 'mine' and a.id is not null and a.status = 'active')
      )
  ) q
  where (v_view = 'all') or (card->>'earned')::boolean;

  return jsonb_build_object(
    'ok', true,
    'game', p_game,
    'view', v_view,
    'finale_revealed', v_finale,
    'achievements', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_achievements(public.game_id, text) from public;
grant execute on function public.list_achievements(public.game_id, text) to authenticated;

create or replace function public.get_achievements_unread(p_game public.game_id)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_cursor public.read_cursors%rowtype;
  v_has boolean := false;
  v_has_cursor boolean := false;
  v_latest_id uuid;
  v_latest_at timestamptz;
  v_team uuid;
begin
  v_me := public.current_player_id();
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game(p_game) and not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;

  if p_game = 'shipit' then
    v_team := public.current_team_id();
  end if;

  select * into v_cursor
  from public.read_cursors
  where player_id = v_me and game = p_game and scope = 'achievements_mine';
  v_has_cursor := found;

  select a.id, a.awarded_at_utc
    into v_latest_id, v_latest_at
  from public.achievement_awards a
  join public.achievement_definitions d on d.id = a.definition_id
  where a.status = 'active'
    and d.game = p_game
    and d.enabled
    and (
      (p_game = 'drinkit' and a.owner_player_id = v_me)
      or (p_game = 'shipit' and v_team is not null and a.owner_team_id = v_team)
    )
  order by a.awarded_at_utc desc, a.id desc
  limit 1;

  if found then
    if not v_has_cursor or v_cursor.last_seen_event_id is null then
      v_has := true;
    elsif (v_latest_at, v_latest_id)
          > (coalesce(v_cursor.last_seen_at_utc, '-infinity'::timestamptz), v_cursor.last_seen_event_id)
    then
      v_has := true;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'game', p_game,
    'has_unread', v_has,
    'latest_award_id', v_latest_id,
    'latest_awarded_at_utc', v_latest_at
  );
end;
$$;

revoke all on function public.get_achievements_unread(public.game_id) from public;
grant execute on function public.get_achievements_unread(public.game_id) to authenticated;

create or replace function public.mark_achievements_seen(
  p_game public.game_id,
  p_award_id uuid,
  p_awarded_at_utc timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_award public.achievement_awards%rowtype;
  v_cursor public.read_cursors%rowtype;
  v_team uuid;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game(p_game) and not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;
  if p_award_id is null or p_awarded_at_utc is null then
    return jsonb_build_object('ok', false, 'code', 'CURSOR_REQUIRED');
  end if;

  if p_game = 'shipit' then
    v_team := public.current_team_id();
  end if;

  select * into v_award
  from public.achievement_awards
  where id = p_award_id and status = 'active';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'AWARD_NOT_FOUND');
  end if;
  if v_award.awarded_at_utc is distinct from p_awarded_at_utc then
    return jsonb_build_object('ok', false, 'code', 'CURSOR_MISMATCH');
  end if;
  if p_game = 'drinkit' and v_award.owner_player_id is distinct from v_me then
    return jsonb_build_object('ok', false, 'code', 'NOT_OWNER');
  end if;
  if p_game = 'shipit' and (v_team is null or v_award.owner_team_id is distinct from v_team) then
    return jsonb_build_object('ok', false, 'code', 'NOT_OWNER');
  end if;

  select * into v_cursor
  from public.read_cursors
  where player_id = v_me and game = p_game and scope = 'achievements_mine'
  for update;

  if not found then
    insert into public.read_cursors (
      player_id, game, scope, last_seen_event_id, last_seen_at_utc
    ) values (
      v_me, p_game, 'achievements_mine', p_award_id, p_awarded_at_utc
    );
  elsif v_cursor.last_seen_event_id is null
     or (p_awarded_at_utc, p_award_id)
        > (coalesce(v_cursor.last_seen_at_utc, '-infinity'::timestamptz), v_cursor.last_seen_event_id)
  then
    update public.read_cursors
    set last_seen_event_id = p_award_id,
        last_seen_at_utc = p_awarded_at_utc,
        updated_at_utc = clock_timestamp()
    where player_id = v_me and game = p_game and scope = 'achievements_mine';
  end if;

  return jsonb_build_object(
    'ok', true,
    'game', p_game,
    'last_seen_award_id', p_award_id,
    'last_seen_at_utc', p_awarded_at_utc
  );
end;
$$;

revoke all on function public.mark_achievements_seen(public.game_id, uuid, timestamptz) from public;
grant execute on function public.mark_achievements_seen(public.game_id, uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Gallery feed: include compact achievement cards (no secret leak of unearned)
-- ---------------------------------------------------------------------------
create or replace function public.list_gallery_feed(
  p_game public.game_id,
  p_filter text default 'everyone',
  p_limit integer default 5,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_filter text := lower(trim(coalesce(p_filter, 'everyone')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 20));
  v_team uuid;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_created timestamptz;
  v_next_id uuid;
  v_newest_created timestamptz;
  v_newest_id uuid;
  v_finale boolean;
begin
  v_me := public.gallery_require_game(p_game);
  v_finale := public.achievement_is_finale(clock_timestamp());

  if v_filter not in ('everyone', 'mine', 'team') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_FILTER');
  end if;
  if p_game = 'drinkit' and v_filter = 'team' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_FILTER', 'message', 'Use mine for Drink It!');
  end if;
  if p_game = 'shipit' and v_filter = 'mine' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_FILTER', 'message', 'Use team for Ship It!');
  end if;

  if p_game = 'shipit' then
    v_team := public.current_team_id();
  end if;

  select ge.created_at_utc, ge.id
    into v_newest_created, v_newest_id
  from public.gallery_events ge
  where ge.game = p_game
    and ge.active
    and ge.kind in ('drink_log', 'daily', 'scavenger', 'achievement')
  order by ge.created_at_utc desc, ge.id desc
  limit 1;

  select count(*) > v_limit into v_has_more
  from (
    select ge.id
    from public.gallery_events ge
    left join public.submissions s
      on s.id = ge.submission_id and s.status = 'accepted'
    left join public.achievement_awards aa
      on aa.id = ge.achievement_award_id and aa.status = 'active'
    where ge.game = p_game
      and ge.active
      and ge.kind in ('drink_log', 'daily', 'scavenger', 'achievement')
      and (
        (ge.kind = 'achievement' and aa.id is not null)
        or (ge.kind <> 'achievement' and s.id is not null)
      )
      and (
        v_filter = 'everyone'
        or (v_filter = 'mine' and ge.owner_player_id = v_me)
        or (
          v_filter = 'team'
          and v_team is not null
          and coalesce(ge.owner_team_id, s.team_id, aa.owner_team_id) = v_team
        )
      )
      and (
        p_before_created_at is null
        or (ge.created_at_utc, ge.id) < (p_before_created_at, p_before_id)
      )
    order by ge.created_at_utc desc, ge.id desc
    limit v_limit + 1
  ) probe;

  select coalesce(
    jsonb_agg(row_json order by (row_json->>'created_at_utc')::timestamptz desc, (row_json->>'event_id')::uuid desc),
    '[]'::jsonb
  )
  into v_rows
  from (
    select jsonb_build_object(
      'event_id', ge.id,
      'kind', ge.kind,
      'created_at_utc', ge.created_at_utc,
      'created_ship_local', to_char(
        public.utc_to_ship_local(
          ge.created_at_utc,
          public.clock_offset_at(
            coalesce(s.cruise_config_id, (select id from public.cruise_config where is_active limit 1)),
            cc.base_ship_offset_minutes,
            ge.created_at_utc
          )
        ),
        'YYYY-MM-DD"T"HH24:MI:SS'
      ),
      'owner_player_id', ge.owner_player_id,
      'owner_player_name', p.display_name,
      'owner_team_id', coalesce(ge.owner_team_id, s.team_id, aa.owner_team_id),
      'owner_team_name', t.name,
      'submission_id', ge.submission_id,
      'achievement_award_id', ge.achievement_award_id,
      'caption', s.caption,
      'photo_id', ph.id,
      'display', case
        when ge.kind = 'achievement' then
          jsonb_build_object(
            'title', case
              when coalesce((aa.evidence_json->>'secret')::boolean, false) and not v_finale
                then 'Achievement unlocked'
              else coalesce(aa.evidence_json->>'gallery_title', 'Achievement')
            end,
            'description', case
              when coalesce((aa.evidence_json->>'secret')::boolean, false) and not v_finale
                then null
              else aa.evidence_json->>'gallery_description'
            end,
            'secret', coalesce((aa.evidence_json->>'secret')::boolean, false),
            'icon_key', aa.evidence_json->>'icon_key',
            'group_key', aa.evidence_json->>'group_key'
          )
        else coalesce(s.display_snapshot_json, '{}'::jsonb)
      end,
      'reactions', public.gallery_reaction_counts(ge.id),
      'my_reaction', (
        select r.emoji::text
        from public.gallery_reactions r
        where r.event_id = ge.id and r.player_id = v_me
      )
    ) as row_json
    from public.gallery_events ge
    left join public.submissions s
      on s.id = ge.submission_id and s.status = 'accepted'
    left join public.achievement_awards aa
      on aa.id = ge.achievement_award_id and aa.status = 'active'
    left join public.cruise_config cc on cc.id = coalesce(
      s.cruise_config_id,
      (select id from public.cruise_config where is_active limit 1)
    )
    left join public.players p on p.id = ge.owner_player_id
    left join public.teams t on t.id = coalesce(ge.owner_team_id, s.team_id, aa.owner_team_id)
    left join public.photos ph
      on ph.bound_submission_id = s.id and ph.status = 'bound' and ge.kind <> 'achievement'
    where ge.game = p_game
      and ge.active
      and ge.kind in ('drink_log', 'daily', 'scavenger', 'achievement')
      and (
        (ge.kind = 'achievement' and aa.id is not null)
        or (ge.kind <> 'achievement' and s.id is not null)
      )
      and (
        v_filter = 'everyone'
        or (v_filter = 'mine' and ge.owner_player_id = v_me)
        or (
          v_filter = 'team'
          and v_team is not null
          and coalesce(ge.owner_team_id, s.team_id, aa.owner_team_id) = v_team
        )
      )
      and (
        p_before_created_at is null
        or (ge.created_at_utc, ge.id) < (p_before_created_at, p_before_id)
      )
    order by ge.created_at_utc desc, ge.id desc
    limit v_limit
  ) page;

  if coalesce(v_has_more, false) and jsonb_array_length(coalesce(v_rows, '[]'::jsonb)) > 0 then
    v_next_created := (v_rows->-1->>'created_at_utc')::timestamptz;
    v_next_id := (v_rows->-1->>'event_id')::uuid;
  end if;

  return jsonb_build_object(
    'ok', true,
    'game', p_game,
    'filter', v_filter,
    'page_size', v_limit,
    'has_more', coalesce(v_has_more, false),
    'events', coalesce(v_rows, '[]'::jsonb),
    'next_cursor', case
      when coalesce(v_has_more, false) and v_next_id is not null then
        jsonb_build_object('created_at_utc', v_next_created, 'id', v_next_id)
      else null
    end,
    'newest_event', case
      when v_newest_id is not null then
        jsonb_build_object('created_at_utc', v_newest_created, 'id', v_newest_id)
      else null
    end
  );
end;
$$;

-- Gallery unread: other owners' posts AND achievement announcements (not own).
create or replace function public.get_gallery_unread(p_game public.game_id)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_cursor public.read_cursors%rowtype;
  v_latest public.gallery_events%rowtype;
  v_has boolean := false;
  v_has_cursor boolean := false;
begin
  v_me := public.gallery_require_game(p_game);

  select * into v_cursor
  from public.read_cursors
  where player_id = v_me
    and game = p_game
    and scope = 'gallery_everyone';
  v_has_cursor := found;

  select ge.* into v_latest
  from public.gallery_events ge
  where ge.game = p_game
    and ge.active
    and ge.kind in ('drink_log', 'daily', 'scavenger', 'achievement')
    and ge.owner_player_id is distinct from v_me
  order by ge.created_at_utc desc, ge.id desc
  limit 1;

  if found then
    if not v_has_cursor or v_cursor.last_seen_event_id is null then
      v_has := true;
    elsif (v_latest.created_at_utc, v_latest.id)
          > (coalesce(v_cursor.last_seen_at_utc, '-infinity'::timestamptz), v_cursor.last_seen_event_id)
    then
      v_has := true;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'game', p_game,
    'has_unread', v_has,
    'latest_other_event_id', v_latest.id,
    'latest_other_created_at_utc', v_latest.created_at_utc
  );
end;
$$;
