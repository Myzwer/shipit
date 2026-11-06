-- Phase 4B3: attach Daily Challenge assignment to bounty_claims.

alter table public.bounty_claims
  add column if not exists daily_challenge_id uuid references public.daily_challenges (id);

alter table public.bounty_claims
  drop constraint if exists bounty_claims_refs_check;

alter table public.bounty_claims
  add constraint bounty_claims_refs_check check (
    (
      category in ('cocktail', 'ingredient')
      and offer_id is not null
      and bar_assignment_id is null
      and daily_challenge_id is null
    )
    or (
      category = 'bar'
      and bar_assignment_id is not null
      and offer_id is null
      and slot_id is null
      and daily_challenge_id is null
    )
    or (
      category = 'daily'
      and offer_id is null
      and bar_assignment_id is null
      and slot_id is null
      and daily_challenge_id is not null
    )
  );

create index if not exists bounty_claims_daily_challenge_idx
  on public.bounty_claims (daily_challenge_id)
  where daily_challenge_id is not null;
