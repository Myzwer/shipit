-- Phase 5B Gate A: historical Ship Time on Gallery feed rows.
-- created_ship_local is computed from the event's absolute UTC + the
-- cruise clock offset applicable at that instant (immutable for display).

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
begin
  v_me := public.gallery_require_game(p_game);

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
    and ge.kind in ('drink_log', 'daily', 'scavenger')
  order by ge.created_at_utc desc, ge.id desc
  limit 1;

  select count(*) > v_limit into v_has_more
  from (
    select ge.id
    from public.gallery_events ge
    join public.submissions s
      on s.id = ge.submission_id and s.status = 'accepted'
    where ge.game = p_game
      and ge.active
      and ge.kind in ('drink_log', 'daily', 'scavenger')
      and (
        v_filter = 'everyone'
        or (v_filter = 'mine' and ge.owner_player_id = v_me)
        or (
          v_filter = 'team'
          and v_team is not null
          and coalesce(ge.owner_team_id, s.team_id) = v_team
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
            s.cruise_config_id,
            cc.base_ship_offset_minutes,
            ge.created_at_utc
          )
        ),
        'YYYY-MM-DD"T"HH24:MI:SS'
      ),
      'owner_player_id', ge.owner_player_id,
      'owner_player_name', p.display_name,
      'owner_team_id', coalesce(ge.owner_team_id, s.team_id),
      'owner_team_name', t.name,
      'submission_id', ge.submission_id,
      'caption', s.caption,
      'photo_id', ph.id,
      'display', coalesce(s.display_snapshot_json, '{}'::jsonb),
      'reactions', public.gallery_reaction_counts(ge.id),
      'my_reaction', (
        select r.emoji::text
        from public.gallery_reactions r
        where r.event_id = ge.id and r.player_id = v_me
      )
    ) as row_json
    from public.gallery_events ge
    join public.submissions s
      on s.id = ge.submission_id and s.status = 'accepted'
    join public.cruise_config cc on cc.id = s.cruise_config_id
    left join public.players p on p.id = ge.owner_player_id
    left join public.teams t on t.id = coalesce(ge.owner_team_id, s.team_id)
    left join public.photos ph
      on ph.bound_submission_id = s.id and ph.status = 'bound'
    where ge.game = p_game
      and ge.active
      and ge.kind in ('drink_log', 'daily', 'scavenger')
      and (
        v_filter = 'everyone'
        or (v_filter = 'mine' and ge.owner_player_id = v_me)
        or (
          v_filter = 'team'
          and v_team is not null
          and coalesce(ge.owner_team_id, s.team_id) = v_team
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

comment on function public.list_gallery_feed(public.game_id, text, integer, timestamptz, uuid) is
  'Phase 5B: Gallery keyset feed with historical created_ship_local from clock_offset_at at event UTC.';
