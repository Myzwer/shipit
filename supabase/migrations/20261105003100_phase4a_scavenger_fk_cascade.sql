-- Phase 4A follow-up: scavenger completion FKs cascade with cruise reset,
-- matching other cruise-scoped ledgers so development clock reseed stays clean.

alter table public.scavenger_completions
  drop constraint scavenger_completions_cruise_config_id_fkey;

alter table public.scavenger_completions
  add constraint scavenger_completions_cruise_config_id_fkey
  foreign key (cruise_config_id) references public.cruise_config (id) on delete cascade;
