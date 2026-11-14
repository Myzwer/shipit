-- R7: Align collection covered_count with location-bound log_counts (11000).
-- Awarding already uses achievement_collection_covered_ids → log_counts_for_collection
-- (bar_id match + exclude virtual). Live progress covered_count still matched by
-- offering_id only, which could inflate UI progress for Mobile Order logs.
-- Migration 11300 reserved for R6 Wrapped work — use 11400 for R7.
-- Combined R6/R7 migration testing must occur after both land on an integration branch.

create or replace function public.achievement_collection_covered_count(
  p_offering_ids uuid[],
  p_owner uuid,
  p_as_of_utc timestamptz default null,
  p_as_of_id uuid default null
) returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(distinct d.offering_id), 0)::int
  from public.submissions s
  join public.drink_logs d on d.submission_id = s.id
  join public.bar_offerings bo on bo.id = d.offering_id
  join public.bars b on b.id = d.bar_id and b.is_virtual is false
  join public.catalog_version_offerings cvo
    on cvo.catalog_version_id = d.catalog_version_id
   and cvo.offering_id = d.offering_id
  join public.catalog_version_drink_concepts dc
    on dc.catalog_version_id = d.catalog_version_id
   and dc.drink_concept_id = bo.drink_concept_id
  where s.status = 'accepted'
    and s.kind = 'drink_log'
    and d.drink_mode = 'named_catalog'
    and d.offering_id = any (coalesce(p_offering_ids, '{}'::uuid[]))
    and d.bar_id = bo.bar_id
    and public.achievement_as_of_ok(s.received_at_utc, s.id, p_as_of_utc, p_as_of_id)
    and (p_owner is null or s.author_player_id = p_owner)
    and dc.kind not in ('beer', 'wine')
    and public.achievement_offering_collection_price_ok(cvo.price_status)
    and not exists (
      select 1
      from public.admin_manual_offerings amo
      where amo.catalog_version_id = d.catalog_version_id
        and amo.offering_id = d.offering_id
        and amo.active
    )
    and not exists (
      select 1
      from public.catalog_version_offering_tags t
      where t.catalog_version_id = d.catalog_version_id
        and t.offering_id = d.offering_id
        and t.tag = 'collection-excluded'
    );
$$;

revoke all on function public.achievement_collection_covered_count(uuid[], uuid, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.achievement_collection_covered_count(uuid[], uuid, timestamptz, uuid)
  to service_role;

comment on function public.achievement_collection_covered_count(uuid[], uuid, timestamptz, uuid) is
  'Count distinct eligible offerings covered for a collection; requires log at the offering physical bar (excludes Mobile Order).';
