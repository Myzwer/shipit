-- Stage A2: organizer-authorized loggable drink exceptions.
-- Adds offering tag vocabulary + sorts authorized exceptions to the end of bar drink lists.
-- Does not load catalog rows; content lands via launch-candidate merge.

create or replace function public.catalog_approved_offering_classification_tags()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'frozen',
    'margarita',
    'mixed-spirits',
    'collection-excluded',
    'organizer-authorized-exception'
  ]::text[];
$$;

comment on function public.catalog_approved_offering_classification_tags() is
  'Approved offering classification tags. collection-excluded keeps a loggable offering out of drink collections. organizer-authorized-exception marks permanent organizer loggable exceptions (not Category A/B menu evidence).';

create or replace function public.list_drinkit_bar_drinks(p_bar_canonical_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_bar_canonical_key, '')));
  v_catalog uuid;
  v_bar_id uuid;
  v_out jsonb;
begin
  if public.current_player_id() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.has_game('drinkit'::public.game_id) then
    raise exception 'DRINKIT_REQUIRED' using errcode = '42501';
  end if;
  if v_key = '' then
    return '[]'::jsonb;
  end if;

  select catalog_version_id into v_catalog from public.active_catalog_pointer where id = 1;
  if v_catalog is null then
    return '[]'::jsonb;
  end if;

  select b.id into v_bar_id
  from public.bars b
  join public.catalog_version_bars cvb
    on cvb.bar_id = b.id and cvb.catalog_version_id = v_catalog and cvb.active is true
  where b.canonical_key = v_key
  limit 1;
  if v_bar_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'offering_id', bo.id,
      'drink_concept_id', dc.id,
      'canonical_key', dc.canonical_key,
      'display_name', cvd.display_name,
      'kind', cvd.kind
    )
    order by
      case
        when exists (
          select 1
          from public.catalog_version_offering_tags t
          where t.catalog_version_id = v_catalog
            and t.offering_id = bo.id
            and t.tag = 'organizer-authorized-exception'
        ) then 1
        else 0
      end,
      lower(cvd.display_name),
      dc.canonical_key
  ), '[]'::jsonb)
    into v_out
  from public.bar_offerings bo
  join public.catalog_version_offerings cvo
    on cvo.offering_id = bo.id and cvo.catalog_version_id = v_catalog
  join public.drink_concepts dc on dc.id = bo.drink_concept_id
  join public.catalog_version_drink_concepts cvd
    on cvd.catalog_version_id = v_catalog and cvd.drink_concept_id = dc.id
  where bo.bar_id = v_bar_id
    and cvd.kind in ('named_cocktail', 'beer', 'wine', 'other_alcoholic');

  return v_out;
end;
$$;

comment on function public.list_drinkit_bar_drinks(text) is
  'Phase 3B/A2: alcoholic named offerings at one bar. Organizer-authorized exceptions sort after ordinary menu drinks. No ingredients, no candidate pools.';

revoke all on function public.list_drinkit_bar_drinks(text) from public;
grant execute on function public.list_drinkit_bar_drinks(text) to authenticated;
