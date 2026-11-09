-- Stage A5: ship-local earned timestamps + disclosure tweaks for card states.
-- - awarded_at_ship_local is server-authoritative (never client TZ conversion)
-- - Public locked titles use ????? to match visual refs
-- - Exclusive claimed-by-other reveals the permitted title

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
  v_ship_local text := null;
  v_cruise_id uuid;
  v_base_offset int;
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
  -- Public funny titles stay masked until earned/finale, except when another
  -- player already claimed an exclusive First (title is then permitted).
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

  if not v_earned then
    v_progress := public.achievement_progress_for_owner(p_def, p_owner_player, p_owner_team);
    if v_mask_secret then
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
