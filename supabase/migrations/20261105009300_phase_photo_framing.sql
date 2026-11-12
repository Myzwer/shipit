-- Photo framing: non-destructive crop zoom + center on staged photos.
-- Bound rows freeze framing via photos_protect_bound. Gallery reads framing
-- for square thumbs; Storage object remains the full original.

alter table public.photos
  add column if not exists crop_zoom numeric(8, 4) not null default 1,
  add column if not exists crop_center_x numeric(8, 4) not null default 0.5,
  add column if not exists crop_center_y numeric(8, 4) not null default 0.5;

alter table public.photos
  drop constraint if exists photos_crop_zoom_range,
  drop constraint if exists photos_crop_center_x_range,
  drop constraint if exists photos_crop_center_y_range;

alter table public.photos
  add constraint photos_crop_zoom_range check (crop_zoom >= 1 and crop_zoom <= 4),
  add constraint photos_crop_center_x_range check (crop_center_x >= 0 and crop_center_x <= 1),
  add constraint photos_crop_center_y_range check (crop_center_y >= 0 and crop_center_y <= 1);

comment on column public.photos.crop_zoom is
  'Zoom relative to cover-fit. 1 = crop side equals min(width,height). Frozen when bound.';
comment on column public.photos.crop_center_x is
  'Normalized crop center X in image space [0,1]. Default 0.5 = centered.';
comment on column public.photos.crop_center_y is
  'Normalized crop center Y in image space [0,1]. Default 0.5 = centered.';

-- Bound photos: also freeze framing metadata.
create or replace function public.photos_protect_bound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'bound' then
    if new.storage_path is distinct from old.storage_path
       or new.owner_player_id is distinct from old.owner_player_id
       or new.bucket_id is distinct from old.bucket_id
       or new.status is distinct from 'bound'
       or new.bound_submission_id is distinct from old.bound_submission_id
       or new.crop_zoom is distinct from old.crop_zoom
       or new.crop_center_x is distinct from old.crop_center_x
       or new.crop_center_y is distinct from old.crop_center_y then
      raise exception 'PHOTO_BOUND_IMMUTABLE' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.set_photo_framing(
  p_photo_id uuid,
  p_crop_zoom numeric,
  p_crop_center_x numeric,
  p_crop_center_y numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_photo public.photos%rowtype;
  v_zoom numeric(8, 4);
  v_cx numeric(8, 4);
  v_cy numeric(8, 4);
  v_short numeric;
  v_crop numeric;
  v_half_x numeric;
  v_half_y numeric;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found or v_photo.owner_player_id is distinct from v_player then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;

  if v_photo.status = 'bound' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_ALREADY_BOUND');
  end if;
  if v_photo.status = 'abandoned' then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_ABANDONED');
  end if;
  if v_photo.status not in ('pending_upload', 'staged') then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_EDITABLE');
  end if;

  if p_crop_zoom is null or p_crop_center_x is null or p_crop_center_y is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_FRAMING');
  end if;

  v_zoom := round(p_crop_zoom::numeric, 4);
  v_cx := round(p_crop_center_x::numeric, 4);
  v_cy := round(p_crop_center_y::numeric, 4);

  if v_zoom < 1 or v_zoom > 4 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_FRAMING', 'message', 'zoom out of range');
  end if;

  v_short := least(v_photo.width, v_photo.height)::numeric;
  v_crop := v_short / v_zoom;
  v_half_x := (v_crop / 2.0) / v_photo.width::numeric;
  v_half_y := (v_crop / 2.0) / v_photo.height::numeric;

  -- Snap centers into the valid pan window (tolerance for float noise).
  if v_cx < v_half_x then v_cx := round(v_half_x, 4); end if;
  if v_cx > 1 - v_half_x then v_cx := round(1 - v_half_x, 4); end if;
  if v_cy < v_half_y then v_cy := round(v_half_y, 4); end if;
  if v_cy > 1 - v_half_y then v_cy := round(1 - v_half_y, 4); end if;

  if v_cx < 0 or v_cx > 1 or v_cy < 0 or v_cy > 1 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_FRAMING', 'message', 'center out of range');
  end if;

  update public.photos
     set crop_zoom = v_zoom,
         crop_center_x = v_cx,
         crop_center_y = v_cy
   where id = v_photo.id;

  return jsonb_build_object(
    'ok', true,
    'photo_id', v_photo.id,
    'status', v_photo.status,
    'framing', jsonb_build_object(
      'zoom', v_zoom,
      'center_x', v_cx,
      'center_y', v_cy
    )
  );
end;
$$;

revoke all on function public.set_photo_framing(uuid, numeric, numeric, numeric) from public;
grant execute on function public.set_photo_framing(uuid, numeric, numeric, numeric) to authenticated;

comment on function public.set_photo_framing(uuid, numeric, numeric, numeric) is
  'Owner-only framing update for pending_upload/staged photos. Bound photos refuse.';

-- Include framing on owner photo reads (recovery / reconcile).
create or replace function public.get_my_photo(p_photo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_photo public.photos%rowtype;
  v_obj_exists boolean;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_photo from public.photos where id = p_photo_id;
  if not found or v_photo.owner_player_id is distinct from v_player then
    return jsonb_build_object('ok', false, 'code', 'PHOTO_NOT_FOUND');
  end if;

  select exists (
    select 1 from storage.objects o
    where o.bucket_id = v_photo.bucket_id and o.name = v_photo.storage_path
  ) into v_obj_exists;

  return jsonb_build_object(
    'ok', true,
    'photo_id', v_photo.id,
    'game', v_photo.game,
    'purpose', v_photo.purpose,
    'status', v_photo.status,
    'bucket', v_photo.bucket_id,
    'storage_path', v_photo.storage_path,
    'mime_type', v_photo.mime_type,
    'byte_size', v_photo.byte_size,
    'width', v_photo.width,
    'height', v_photo.height,
    'staged_at_utc', v_photo.staged_at_utc,
    'storage_object_present', v_obj_exists,
    'client_request_id', v_photo.client_request_id,
    'cleanup_status', v_photo.storage_cleanup_status,
    'framing', jsonb_build_object(
      'zoom', v_photo.crop_zoom,
      'center_x', v_photo.crop_center_x,
      'center_y', v_photo.crop_center_y
    )
  );
end;
$$;

revoke all on function public.get_my_photo(uuid) from public;
grant execute on function public.get_my_photo(uuid) to authenticated;

-- Gallery feed: return framing + dims so thumbs match the capture preview.
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

revoke all on function public.list_gallery_feed(public.game_id, text, integer, timestamptz, uuid) from public;
grant execute on function public.list_gallery_feed(public.game_id, text, integer, timestamptz, uuid) to authenticated;
