-- Plan C: include per-player achievement counts on the Drink It! Wrapped
-- leaderboard so the Achievements toggle can rank without a second query.
-- Points ranking / ordering is unchanged. Achievements is display metadata.

create or replace function public.wrapped_drinkit_leaderboard(p_cruise_config_id uuid, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_row record;
begin
  for v_row in
    select
      r.player_id,
      r.display_name,
      r.points,
      r.bounty_claims,
      coalesce(m.achievements, 0) as achievements
    from public.drinkit_player_score_rows(p_cruise_config_id) r
    left join public.wrapped_di_player_metrics(p_cruise_config_id) m
      on m.player_id = r.player_id
  loop
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id', v_row.player_id,
      'name', v_row.display_name,
      'points', v_row.points,
      'metric_label', format('Bounties %s/28', least(v_row.bounty_claims, 28)),
      'bounty_claims', v_row.bounty_claims,
      'achievements', v_row.achievements,
      'is_me', v_row.player_id = p_viewer
    ));
  end loop;
  return public.wrapped_rank_rows(v_rows);
end;
$$;

revoke all on function public.wrapped_drinkit_leaderboard(uuid, uuid) from public;
grant execute on function public.wrapped_drinkit_leaderboard(uuid, uuid) to service_role;
