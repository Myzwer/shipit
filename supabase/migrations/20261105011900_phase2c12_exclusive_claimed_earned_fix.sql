-- Phase 2C.12: First-to-Find / exclusive All-view earned attribution
--
-- list_achievements(all) joins another owner's exclusive award so the card can
-- disclose "Claimed by …". achievement_card_payload previously treated any
-- attached active award as earned for the viewer, so non-winning teams saw
-- exclusive First-to-Find cards as earned.
--
-- Fix: earned only when the attached award belongs to the viewer owner
-- (player for Drink It!, team for Ship It!). Award identity fields are only
-- exposed when truly earned. Claimed-by disclosure still uses the exclusive
-- lookup path when not earned.
--
-- Does not change award grant/revoke rules, challenge completion, or scoring.

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
  v_earned boolean;
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
  -- Viewer ownership only. An exclusive winner's award may be joined for All-view
  -- disclosure; that must not mark the non-winning viewer as earned.
  v_earned :=
    p_award.id is not null
    and p_award.status = 'active'
    and (
      (p_owner_player is not null and p_award.owner_player_id is not distinct from p_owner_player)
      or (p_owner_team is not null and p_award.owner_team_id is not distinct from p_owner_team)
    );

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
    v_pin := case when v_earned then p_award.evidence_json->'collection_pin' else null end;
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
    'awarded_at_utc', case when v_earned then p_award.awarded_at_utc else null end,
    'awarded_at_ship_local', v_ship_local,
    'award_id', case when v_earned then p_award.id else null end,
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

comment on function public.achievement_card_payload(
  public.achievement_definitions, public.achievement_awards, uuid, uuid, uuid, boolean, text
) is
  'Achievement card JSON. earned requires viewer-owner match; exclusive All-view joins do not false-earn.';
