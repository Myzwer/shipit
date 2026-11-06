-- Phase 6A Gate: serialize ingredient correction source invalidation with persist.
-- Fixes TOCTOU where invalidate counted valid sources without locking the
-- correction row, allowing a concurrent persist to leave active=false while
-- valid sources remained (or flip-flop lost updates).
-- Authority: Phase 6A brief — FIRST GATE; do not redesign correction schema.

create or replace function public.drinkit_invalidate_correction_sources(
  p_submission_id uuid,
  p_actor_id uuid default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_deactivated uuid[] := array[]::uuid[];
  v_corr uuid;
  v_cause text;
  v_locked public.ingredient_corrections%rowtype;
begin
  if p_submission_id is null then
    return v_deactivated;
  end if;

  -- Drop this submission's support first. Persist holds the correction row
  -- FOR UPDATE while inserting sources, so the subsequent lock below serializes.
  update public.ingredient_correction_sources
  set valid = false,
      invalidated_at_utc = v_now
  where submission_id = p_submission_id
    and valid is true;

  for v_corr in
    select distinct correction_id
    from public.ingredient_correction_sources
    where submission_id = p_submission_id
  loop
    -- Row lock: wait for any in-flight persist on this correction.
    select * into v_locked
    from public.ingredient_corrections
    where id = v_corr
    for update;

    if not found then
      continue;
    end if;

    v_cause := v_locked.inactive_cause;
    if coalesce(v_cause, '') = 'admin' then
      continue; -- leave admin-suppressed alone
    end if;

    -- Deactivate only when no valid sources remain *under the same lock*.
    -- NOT EXISTS is defense-in-depth against a stale count.
    update public.ingredient_corrections
    set active = false,
        deactivated_at_utc = v_now,
        deactivated_by_player_id = null,
        deactivation_note = 'no_valid_sources',
        inactive_cause = 'no_valid_sources'
    where id = v_corr
      and active is true
      and coalesce(inactive_cause, '') is distinct from 'admin'
      and not exists (
        select 1
        from public.ingredient_correction_sources ics
        where ics.correction_id = v_corr
          and ics.valid is true
      );

    if found then
      v_deactivated := array_append(v_deactivated, v_corr);
    end if;
  end loop;

  return v_deactivated;
end;
$$;

revoke all on function public.drinkit_invalidate_correction_sources(uuid, uuid) from public;
grant execute on function public.drinkit_invalidate_correction_sources(uuid, uuid) to service_role;

comment on function public.drinkit_invalidate_correction_sources(uuid, uuid) is
  'Phase 6A: invalidate submission provenance under FOR UPDATE on the correction row; never clear admin suppression; deactivate only when zero valid sources remain.';
