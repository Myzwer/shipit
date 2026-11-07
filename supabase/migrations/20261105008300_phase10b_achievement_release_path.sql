-- Phase 10B: guarded path to upsert launch-candidate achievement definitions
-- without test_only. Does NOT activate a cruise. Requires explicit confirm flag.
-- Companion UUID mappings and blocked organizer decisions remain out-of-band.

create or replace function public.admin_upsert_launch_achievement_definition(
  p_row jsonb,
  p_confirm_non_test_only boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.require_admin();
  v_id uuid;
  v_test_only boolean;
begin
  -- Explicit future activation only — refuse accidental non-test writes.
  if not coalesce(p_confirm_non_test_only, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'CONFIRM_REQUIRED',
      'message', 'Pass p_confirm_non_test_only=true only during explicit cruise achievement activation.'
    );
  end if;

  if p_row->>'stable_key' is null or p_row->>'stable_key' not like 'working-%' then
    return jsonb_build_object('ok', false, 'code', 'STABLE_KEY_INVALID');
  end if;

  v_test_only := false;

  insert into public.achievement_definitions (
    stable_key, game, owner_type, group_key, title, display_description,
    secret, exclusive, icon_key, enabled, condition_type, condition_config, test_only
  ) values (
    p_row->>'stable_key',
    (p_row->>'game')::public.game_id,
    (p_row->>'owner_type')::public.achievement_owner_type,
    coalesce((p_row->>'group_key')::public.achievement_group, 'other'),
    p_row->>'title',
    p_row->>'display_description',
    coalesce((p_row->>'secret')::boolean, false),
    coalesce((p_row->>'exclusive')::boolean, false),
    nullif(p_row->>'icon_key', ''),
    coalesce((p_row->>'enabled')::boolean, false),
    p_row->>'condition_type',
    coalesce(p_row->'condition_config', '{}'::jsonb),
    v_test_only
  )
  on conflict (stable_key) do update set
    game = excluded.game,
    owner_type = excluded.owner_type,
    group_key = excluded.group_key,
    title = excluded.title,
    display_description = excluded.display_description,
    secret = excluded.secret,
    exclusive = excluded.exclusive,
    icon_key = excluded.icon_key,
    enabled = excluded.enabled,
    condition_type = excluded.condition_type,
    condition_config = excluded.condition_config,
    test_only = excluded.test_only,
    updated_at = now()
  returning id into v_id;

  perform public.write_admin_audit(
    'achievement.launch_upsert', v_actor, 'achievement_definitions', v_id::text,
    null,
    jsonb_build_object('stable_key', p_row->>'stable_key', 'test_only', v_test_only)
  );

  return jsonb_build_object('ok', true, 'id', v_id, 'stable_key', p_row->>'stable_key', 'test_only', v_test_only);
end;
$$;

revoke all on function public.admin_upsert_launch_achievement_definition(jsonb, boolean) from public;
grant execute on function public.admin_upsert_launch_achievement_definition(jsonb, boolean) to authenticated;
revoke execute on function public.admin_upsert_launch_achievement_definition(jsonb, boolean) from anon;

comment on function public.admin_upsert_launch_achievement_definition(jsonb, boolean) is
  'Phase 10B guarded launch-candidate achievement upsert (test_only=false). Requires p_confirm_non_test_only=true. Do not call during ordinary development loads.';
