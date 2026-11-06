-- Phase 5A: list_gallery_feed, reactions, unread cursors, same-game photo access.

create or replace function public.gallery_require_game(p_game public.game_id)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if public.is_admin() then
    return v_me;
  end if;
  if not public.has_game(p_game) then
    raise exception 'GAME_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

revoke all on function public.gallery_require_game(public.game_id) from public;
grant execute on function public.gallery_require_game(public.game_id) to service_role;

create or replace function public.gallery_reaction_counts(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'heart', coalesce((select count(*)::int from public.gallery_reactions r where r.event_id = p_event_id and r.emoji = 'heart'), 0),
    'laugh', coalesce((select count(*)::int from public.gallery_reactions r where r.event_id = p_event_id and r.emoji = 'laugh'), 0),
    'hang_loose', coalesce((select count(*)::int from public.gallery_reactions r where r.event_id = p_event_id and r.emoji = 'hang_loose'), 0)
  );
$$;

revoke all on function public.gallery_reaction_counts(uuid) from public;
grant execute on function public.gallery_reaction_counts(uuid) to service_role;

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

revoke all on function public.list_gallery_feed(public.game_id, text, integer, timestamptz, uuid) from public;
grant execute on function public.list_gallery_feed(public.game_id, text, integer, timestamptz, uuid) to authenticated;

create or replace function public.set_gallery_reaction(
  p_event_id uuid,
  p_emoji text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_event public.gallery_events%rowtype;
  v_emoji public.gallery_reaction_emoji;
  v_existing public.gallery_reactions%rowtype;
begin
  if p_event_id is null then
    return jsonb_build_object('ok', false, 'code', 'EVENT_REQUIRED');
  end if;

  select * into v_event from public.gallery_events where id = p_event_id for update;
  if not found or not v_event.active then
    return jsonb_build_object('ok', false, 'code', 'EVENT_NOT_FOUND');
  end if;

  v_me := public.gallery_require_game(v_event.game);

  if nullif(trim(coalesce(p_emoji, '')), '') is null then
    delete from public.gallery_reactions
    where event_id = p_event_id and player_id = v_me;
    return jsonb_build_object(
      'ok', true,
      'event_id', p_event_id,
      'my_reaction', null,
      'reactions', public.gallery_reaction_counts(p_event_id)
    );
  end if;

  begin
    v_emoji := lower(trim(p_emoji))::public.gallery_reaction_emoji;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REACTION');
  end;

  select * into v_existing
  from public.gallery_reactions
  where event_id = p_event_id and player_id = v_me
  for update;

  if found then
    if v_existing.emoji = v_emoji then
      delete from public.gallery_reactions
      where event_id = p_event_id and player_id = v_me;
      return jsonb_build_object(
        'ok', true,
        'event_id', p_event_id,
        'my_reaction', null,
        'reactions', public.gallery_reaction_counts(p_event_id)
      );
    end if;
    update public.gallery_reactions
    set emoji = v_emoji, updated_at_utc = clock_timestamp()
    where event_id = p_event_id and player_id = v_me;
  else
    insert into public.gallery_reactions (event_id, player_id, emoji)
    values (p_event_id, v_me, v_emoji);
  end if;

  return jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'my_reaction', v_emoji::text,
    'reactions', public.gallery_reaction_counts(p_event_id)
  );
end;
$$;

revoke all on function public.set_gallery_reaction(uuid, text) from public;
grant execute on function public.set_gallery_reaction(uuid, text) to authenticated;

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
    and ge.kind in ('drink_log', 'daily', 'scavenger')
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

revoke all on function public.get_gallery_unread(public.game_id) from public;
grant execute on function public.get_gallery_unread(public.game_id) to authenticated;

create or replace function public.mark_gallery_seen(
  p_game public.game_id,
  p_event_id uuid,
  p_created_at_utc timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_event public.gallery_events%rowtype;
  v_cursor public.read_cursors%rowtype;
begin
  v_me := public.gallery_require_game(p_game);
  if p_event_id is null or p_created_at_utc is null then
    return jsonb_build_object('ok', false, 'code', 'CURSOR_REQUIRED');
  end if;

  select * into v_event
  from public.gallery_events
  where id = p_event_id
    and game = p_game
    and active;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'EVENT_NOT_FOUND');
  end if;
  -- Mark only a delivered event timestamp (must match row).
  if v_event.created_at_utc is distinct from p_created_at_utc then
    return jsonb_build_object('ok', false, 'code', 'CURSOR_MISMATCH');
  end if;

  select * into v_cursor
  from public.read_cursors
  where player_id = v_me
    and game = p_game
    and scope = 'gallery_everyone'
  for update;

  if not found then
    insert into public.read_cursors (
      player_id, game, scope, last_seen_event_id, last_seen_at_utc
    ) values (
      v_me, p_game, 'gallery_everyone', p_event_id, p_created_at_utc
    );
  elsif v_cursor.last_seen_event_id is null
     or (p_created_at_utc, p_event_id)
        > (coalesce(v_cursor.last_seen_at_utc, '-infinity'::timestamptz), v_cursor.last_seen_event_id)
  then
    update public.read_cursors
    set last_seen_event_id = p_event_id,
        last_seen_at_utc = p_created_at_utc,
        updated_at_utc = clock_timestamp()
    where player_id = v_me
      and game = p_game
      and scope = 'gallery_everyone';
  end if;

  return jsonb_build_object(
    'ok', true,
    'game', p_game,
    'last_seen_event_id', p_event_id,
    'last_seen_at_utc', p_created_at_utc
  );
end;
$$;

revoke all on function public.mark_gallery_seen(public.game_id, uuid, timestamptz) from public;
grant execute on function public.mark_gallery_seen(public.game_id, uuid, timestamptz) to authenticated;

-- Same-game bound photo authorization (Everyone Gallery visibility).
create or replace function public.create_drinkit_photo_signed_url(
  p_photo_id uuid,
  p_expires_seconds integer default 3600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_photo public.photos%rowtype;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game('drinkit') and not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;
  if p_photo_id is null then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_REQUIRED');
  end if;

  select * into v_photo from public.photos where id = p_photo_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;
  if v_photo.game is distinct from 'drinkit' or v_photo.status is distinct from 'bound' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_AVAILABLE');
  end if;
  if v_photo.storage_path like 'development-only/%' then
    return jsonb_build_object('ok', false, 'code', 'FIXTURE_PHOTO_REJECTED');
  end if;

  return jsonb_build_object(
    'ok', true,
    'bucket', v_photo.bucket_id,
    'storage_path', v_photo.storage_path,
    'expires_in', greatest(60, least(coalesce(p_expires_seconds, 3600), 86400))
  );
end;
$$;

create or replace function public.create_shipit_photo_signed_url(
  p_photo_id uuid,
  p_expires_seconds integer default 3600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_player_id();
  v_photo public.photos%rowtype;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game('shipit') and not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'GAME_MEMBERSHIP_REQUIRED');
  end if;
  if p_photo_id is null then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_REQUIRED');
  end if;

  select * into v_photo from public.photos where id = p_photo_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;
  if v_photo.game is distinct from 'shipit' or v_photo.status is distinct from 'bound' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_AVAILABLE');
  end if;
  if v_photo.storage_path like 'development-only/%' then
    return jsonb_build_object('ok', false, 'code', 'FIXTURE_PHOTO_REJECTED');
  end if;

  return jsonb_build_object(
    'ok', true,
    'bucket', v_photo.bucket_id,
    'storage_path', v_photo.storage_path,
    'expires_in', greatest(60, least(coalesce(p_expires_seconds, 3600), 86400))
  );
end;
$$;

-- Storage: Drink It! members may read bound drinkit objects; Ship It! members all bound shipit.
create or replace function public.storage_can_read_drinkit_bound_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.storage_current_player_id() is not null
    and public.has_game('drinkit')
    and exists (
      select 1
      from public.photos p
      where p.storage_path = p_storage_path
        and p.status = 'bound'
        and p.game = 'drinkit'
    );
$$;

revoke all on function public.storage_can_read_drinkit_bound_object(text) from public;
grant execute on function public.storage_can_read_drinkit_bound_object(text) to authenticated;

create or replace function public.storage_can_read_shipit_bound_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.storage_current_player_id() is not null
    and public.has_game('shipit')
    and exists (
      select 1
      from public.photos p
      where p.storage_path = p_storage_path
        and p.status = 'bound'
        and p.game = 'shipit'
    );
$$;

revoke all on function public.storage_can_read_shipit_bound_object(text) from public;
grant execute on function public.storage_can_read_shipit_bound_object(text) to authenticated;

drop policy if exists game_photos_select_drinkit_member_bound on storage.objects;
create policy game_photos_select_drinkit_member_bound
  on storage.objects for select to authenticated
  using (
    bucket_id = 'game-photos'
    and public.storage_can_read_drinkit_bound_object(name)
  );

drop policy if exists game_photos_select_shipit_teammate_bound on storage.objects;
create policy game_photos_select_shipit_member_bound
  on storage.objects for select to authenticated
  using (
    bucket_id = 'game-photos'
    and public.storage_can_read_shipit_bound_object(name)
  );

-- Keep scavenger gallery_events.owner_team_id filled on accept (patch insert path lightly).
create or replace function public.gallery_events_fill_team_from_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.submission_id is not null and new.owner_team_id is null then
    select s.team_id into new.owner_team_id
    from public.submissions s
    where s.id = new.submission_id;
  end if;
  return new;
end;
$$;

drop trigger if exists gallery_events_fill_team on public.gallery_events;
create trigger gallery_events_fill_team
  before insert or update of submission_id on public.gallery_events
  for each row
  execute function public.gallery_events_fill_team_from_submission();
