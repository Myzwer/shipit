-- Phase 2C.13B: authorized gallery reaction author details (read-only).
-- Returns display names only for reactions on gallery posts the caller may view.
-- Does not alter reaction writes, counts, RLS policies, or public grants.

create or replace function public.get_gallery_reaction_authors(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_event public.gallery_events%rowtype;
  v_cruise public.cruise_config%rowtype;
  v_groups jsonb := '[]'::jsonb;
  v_emoji public.gallery_reaction_emoji;
  v_names jsonb;
  v_order public.gallery_reaction_emoji[] := array[
    'heart'::public.gallery_reaction_emoji,
    'laugh'::public.gallery_reaction_emoji,
    'hang_loose'::public.gallery_reaction_emoji
  ];
begin
  if p_event_id is null then
    return jsonb_build_object('ok', false, 'code', 'EVENT_REQUIRED');
  end if;

  select * into v_cruise from public.active_cruise_config();
  if not found or v_cruise.id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'UNAVAILABLE',
      'message', 'No active cruise'
    );
  end if;

  select * into v_event
  from public.gallery_events
  where id = p_event_id;

  if not found or not v_event.active then
    return jsonb_build_object('ok', false, 'code', 'EVENT_NOT_FOUND');
  end if;

  -- Same membership gate as set_gallery_reaction / list_gallery_feed.
  -- gallery_require_game uses errcode 42501 for both auth and membership failures.
  begin
    v_me := public.gallery_require_game(v_event.game);
  exception
    when others then
      if sqlerrm like 'NOT_AUTHENTICATED%' then
        return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
      elsif sqlerrm like 'GAME_MEMBERSHIP_REQUIRED%' then
        return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
      end if;
      raise;
  end;

  foreach v_emoji in array v_order loop
    select coalesce(
      jsonb_agg(to_jsonb(sub.display_name) order by lower(sub.display_name), sub.player_id),
      '[]'::jsonb
    )
    into v_names
    from (
      select distinct
        r.player_id,
        coalesce(nullif(trim(p.display_name), ''), 'Former player') as display_name
      from public.gallery_reactions r
      left join public.players p on p.id = r.player_id
      where r.event_id = p_event_id
        and r.emoji = v_emoji
    ) sub;

    v_groups := v_groups || jsonb_build_array(
      jsonb_build_object(
        'emoji', v_emoji::text,
        'authors', coalesce(v_names, '[]'::jsonb)
      )
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'game', v_event.game,
    'groups', v_groups
  );
end;
$$;

comment on function public.get_gallery_reaction_authors(uuid) is
  'Phase 2C.13B: authenticated same-game reaction authors (display names only) for one gallery event.';

revoke all on function public.get_gallery_reaction_authors(uuid) from public;
grant execute on function public.get_gallery_reaction_authors(uuid) to authenticated;
