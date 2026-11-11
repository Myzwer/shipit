-- QA-ACH-GALLERY-001 / final achievement rules:
-- Unearned secrets stay masked on the Achievements catalog.
-- Gallery achievement cards only exist for active (earned) awards, so they must
-- show real title/description/icon — not generic "Achievement unlocked" —
-- including when the definition is secret and finale is not latched.
-- Revoked awards remain excluded via aa.status = 'active'.
-- Does not change the 174 achievement definitions.

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
      'photo_width', ph.width,
      'photo_height', ph.height,
      'photo_framing', case
        when ph.id is null then null
        else jsonb_build_object(
          'zoom', ph.crop_zoom,
          'center_x', ph.crop_center_x,
          'center_y', ph.crop_center_y
        )
      end,
      'companion_names', case
        when ge.kind = 'drink_log' and ge.submission_id is not null then (
          select coalesce(
            jsonb_agg(sub.display_name order by lower(sub.display_name), sub.id),
            '[]'::jsonb
          )
          from (
            select distinct p2.id, p2.display_name
            from public.drink_log_companions dlc
            join public.players p2 on p2.id = dlc.companion_player_id
            where dlc.submission_id = ge.submission_id
              and dlc.companion_player_id is distinct from ge.owner_player_id
              and nullif(trim(p2.display_name), '') is not null
          ) sub
        )
        else '[]'::jsonb
      end,
      'display', case
        when ge.kind = 'achievement' then
          -- Active award join ⇒ earned. Reveal stored gallery metadata even for secrets.
          jsonb_build_object(
            'title', coalesce(nullif(trim(aa.evidence_json->>'gallery_title'), ''), 'Achievement'),
            'description', aa.evidence_json->>'gallery_description',
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

comment on function public.list_gallery_feed(public.game_id, text, integer, timestamptz, uuid) is
  'Gallery feed. Achievement cards reveal earned award metadata (including secrets). Unearned secrets stay masked on list_achievements only.';

revoke all on function public.list_gallery_feed(public.game_id, text, integer, timestamptz, uuid) from public;
grant execute on function public.list_gallery_feed(public.game_id, text, integer, timestamptz, uuid) to authenticated;
