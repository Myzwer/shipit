-- Phase 3A: allow development cruise reseed to replace cruise_config safely.
alter table public.submissions
  drop constraint if exists submissions_cruise_config_id_fkey;
alter table public.submissions
  add constraint submissions_cruise_config_id_fkey
  foreign key (cruise_config_id) references public.cruise_config (id) on delete cascade;

alter table public.bounty_claims
  drop constraint if exists bounty_claims_cruise_config_id_fkey;
alter table public.bounty_claims
  add constraint bounty_claims_cruise_config_id_fkey
  foreign key (cruise_config_id) references public.cruise_config (id) on delete cascade;
