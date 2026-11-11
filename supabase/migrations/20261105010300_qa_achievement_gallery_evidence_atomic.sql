-- QA-ACH-GALLERY-001 hardening:
-- Persist gallery announcement metadata on the initial award INSERT so a feed
-- read cannot observe an award row between gallery_event insert and the old
-- follow-up evidence_json UPDATE (incomplete title/icon/secret).
-- Does not change achievement definitions, secret masking rules, or feed UI.

create or replace function public.achievement_grant_award(
  p_def public.achievement_definitions,
  p_owner_player uuid,
  p_owner_team uuid,
  p_source_submission uuid,
  p_actor_player uuid,
  p_awarded_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_award_id uuid;
  v_gallery_id uuid;
  v_title text;
  v_desc text;
  v_existing uuid;
begin
  -- Shared: one active per owner. Exclusive: one active globally.
  if p_def.exclusive then
    select id into v_existing
    from public.achievement_awards
    where definition_id = p_def.id and status = 'active' and exclusive_slot
    for update;
    if v_existing is not null then
      return null;
    end if;
  else
    select id into v_existing
    from public.achievement_awards
    where definition_id = p_def.id
      and status = 'active'
      and (
        (p_owner_player is not null and owner_player_id = p_owner_player)
        or (p_owner_team is not null and owner_team_id = p_owner_team)
      )
    for update;
    if v_existing is not null then
      return null;
    end if;
  end if;

  v_title := p_def.title;
  v_desc := p_def.display_description;

  insert into public.achievement_awards (
    definition_id, owner_player_id, owner_team_id, status,
    source_submission_id, awarded_at_utc, evidence_json, exclusive_slot
  ) values (
    p_def.id,
    p_owner_player,
    p_owner_team,
    'active',
    p_source_submission,
    p_awarded_at,
    jsonb_build_object(
      'definition_stable_key', p_def.stable_key,
      'source_submission_id', p_source_submission,
      'actor_player_id', p_actor_player,
      'gallery_title', v_title,
      'gallery_description', v_desc,
      'secret', p_def.secret,
      'group_key', p_def.group_key,
      'icon_key', p_def.icon_key
    ),
    p_def.exclusive
  )
  returning id into v_award_id;

  insert into public.gallery_events (
    game, owner_player_id, owner_team_id, kind, submission_id,
    achievement_award_id, created_at_utc, active
  ) values (
    p_def.game,
    coalesce(p_owner_player, p_actor_player),
    p_owner_team,
    'achievement',
    p_source_submission,
    v_award_id,
    p_awarded_at,
    true
  )
  returning id into v_gallery_id;

  update public.achievement_awards
  set gallery_event_id = v_gallery_id
  where id = v_award_id;

  return v_award_id;
exception
  when unique_violation then
    return null;
end;
$$;
