-- Phase 3A: Drink It! submission / claim foundation (schema only).
-- Authority: Technical Spec §4, §4.1–4.2, §7. Achievements/reactions deferred.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.submission_status as enum ('accepted', 'voided');
create type public.claim_status as enum ('active', 'voided');
create type public.drinkit_claim_category as enum ('cocktail', 'ingredient', 'bar', 'daily');
create type public.drink_log_mode as enum (
  'named_catalog',
  'generic_beer',
  'generic_wine',
  'generic_other',
  'unlisted_named'
);
create type public.gallery_event_kind as enum ('drink_log');

-- ---------------------------------------------------------------------------
-- submissions
-- ---------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  author_player_id uuid not null references public.players (id),
  idempotency_key uuid not null,
  game public.game_id not null default 'drinkit',
  kind text not null default 'drink_log',
  cruise_config_id uuid not null references public.cruise_config (id),
  received_at_utc timestamptz not null,
  ship_day integer not null,
  status public.submission_status not null default 'accepted',
  caption text,
  photo_storage_key text,
  request_payload_hash text not null,
  request_payload_json jsonb not null,
  result_json jsonb not null,
  display_snapshot_json jsonb not null default '{}'::jsonb,
  gallery_event_id uuid,
  created_at timestamptz not null default now(),
  constraint submissions_ship_day_check check (ship_day between 1 and 7),
  constraint submissions_kind_check check (kind in ('drink_log')),
  constraint submissions_author_idempotency_unique unique (author_player_id, idempotency_key)
);

create index submissions_author_received_idx
  on public.submissions (author_player_id, received_at_utc desc);
create index submissions_cruise_day_idx
  on public.submissions (cruise_config_id, ship_day);

comment on table public.submissions is
  'Immutable Drink It! submission parent. Idempotency is per author+key; payload hash rejects mismatched retries.';

-- ---------------------------------------------------------------------------
-- drink_logs + companions
-- ---------------------------------------------------------------------------
create table public.drink_logs (
  submission_id uuid primary key references public.submissions (id) on delete cascade,
  bar_id uuid not null references public.bars (id),
  bar_canonical_key text not null,
  bar_display_name text not null,
  catalog_version_id uuid references public.catalog_versions (id),
  offering_id uuid references public.bar_offerings (id),
  drink_concept_id uuid references public.drink_concepts (id),
  drink_mode public.drink_log_mode not null,
  drink_display_name text not null,
  custom_name text,
  generic_type text,
  ingredient_snapshot_json jsonb not null default '[]'::jsonb,
  constraint drink_logs_mode_check check (
    (
      drink_mode = 'named_catalog'
      and offering_id is not null
      and drink_concept_id is not null
      and custom_name is null
      and generic_type is null
    )
    or (
      drink_mode in ('generic_beer', 'generic_wine', 'generic_other')
      and offering_id is null
      and drink_concept_id is null
      and custom_name is null
      and generic_type in ('beer', 'wine', 'other_alcoholic')
    )
    or (
      drink_mode = 'unlisted_named'
      and offering_id is null
      and drink_concept_id is null
      and custom_name is not null
      and char_length(trim(custom_name)) > 0
    )
  )
);

create table public.drink_log_companions (
  submission_id uuid not null references public.submissions (id) on delete cascade,
  companion_player_id uuid not null references public.players (id),
  primary key (submission_id, companion_player_id),
  constraint drink_log_companions_not_self check (true) -- enforced in RPC vs author
);

create index drink_log_companions_player_idx
  on public.drink_log_companions (companion_player_id);

-- ---------------------------------------------------------------------------
-- bounty_claims
-- ---------------------------------------------------------------------------
create table public.bounty_claims (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  player_id uuid not null references public.players (id),
  cruise_config_id uuid not null references public.cruise_config (id),
  game_day integer not null,
  category public.drinkit_claim_category not null,
  slot_id uuid references public.bounty_slots (id),
  offer_id uuid references public.bounty_slot_offers (id),
  bar_assignment_id uuid references public.bar_bounties (id),
  points integer not null,
  status public.claim_status not null default 'active',
  offer_snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint bounty_claims_day_check check (game_day between 1 and 7),
  constraint bounty_claims_points_check check (points >= 0 and points <= 100),
  constraint bounty_claims_refs_check check (
    (
      category in ('cocktail', 'ingredient')
      and offer_id is not null
      and bar_assignment_id is null
    )
    or (
      category = 'bar'
      and bar_assignment_id is not null
      and offer_id is null
      and slot_id is null
    )
    or (
      category = 'daily'
      and offer_id is null
      and bar_assignment_id is null
    )
  )
);

create unique index bounty_claims_one_active_per_day_category
  on public.bounty_claims (player_id, cruise_config_id, game_day, category)
  where status = 'active';

create index bounty_claims_submission_idx on public.bounty_claims (submission_id);
create index bounty_claims_player_day_idx
  on public.bounty_claims (player_id, cruise_config_id, game_day);

comment on table public.bounty_claims is
  'Scored Drink It! claims. Partial unique active claim per player/day/category. Points are ledger truth — no mutable total score.';

-- ---------------------------------------------------------------------------
-- Minimal gallery_events (extension contract; no UI/reactions yet)
-- ---------------------------------------------------------------------------
create table public.gallery_events (
  id uuid primary key default gen_random_uuid(),
  game public.game_id not null,
  owner_player_id uuid references public.players (id),
  kind public.gallery_event_kind not null,
  submission_id uuid references public.submissions (id) on delete cascade,
  created_at_utc timestamptz not null default now(),
  active boolean not null default true
);

create index gallery_events_game_created_idx
  on public.gallery_events (game, created_at_utc desc);

alter table public.submissions
  add constraint submissions_gallery_event_fk
  foreign key (gallery_event_id) references public.gallery_events (id);

comment on table public.gallery_events is
  'Minimal Gallery event stub created atomically with drink submissions. Reactions/UI deferred to Phase 5.';

-- ---------------------------------------------------------------------------
-- RLS — players read own submissions; no direct writes to scoring tables
-- ---------------------------------------------------------------------------
alter table public.submissions enable row level security;
alter table public.drink_logs enable row level security;
alter table public.drink_log_companions enable row level security;
alter table public.bounty_claims enable row level security;
alter table public.gallery_events enable row level security;

alter table public.submissions force row level security;
alter table public.drink_logs force row level security;
alter table public.drink_log_companions force row level security;
alter table public.bounty_claims force row level security;
alter table public.gallery_events force row level security;

revoke all on table public.submissions from anon, authenticated;
revoke all on table public.drink_logs from anon, authenticated;
revoke all on table public.drink_log_companions from anon, authenticated;
revoke all on table public.bounty_claims from anon, authenticated;
revoke all on table public.gallery_events from anon, authenticated;

grant select on table public.submissions to authenticated;
grant select on table public.drink_logs to authenticated;
grant select on table public.drink_log_companions to authenticated;
grant select on table public.bounty_claims to authenticated;
grant select on table public.gallery_events to authenticated;

grant all on table public.submissions to service_role;
grant all on table public.drink_logs to service_role;
grant all on table public.drink_log_companions to service_role;
grant all on table public.bounty_claims to service_role;
grant all on table public.gallery_events to service_role;

create policy submissions_select_own
  on public.submissions for select to authenticated
  using (author_player_id = public.current_player_id() or public.is_admin());

create policy drink_logs_select_own
  on public.drink_logs for select to authenticated
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and (s.author_player_id = public.current_player_id() or public.is_admin())
    )
  );

create policy drink_log_companions_select_own
  on public.drink_log_companions for select to authenticated
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and (s.author_player_id = public.current_player_id() or public.is_admin())
    )
    or companion_player_id = public.current_player_id()
  );

create policy bounty_claims_select_own
  on public.bounty_claims for select to authenticated
  using (player_id = public.current_player_id() or public.is_admin());

create policy gallery_events_select_drinkit
  on public.gallery_events for select to authenticated
  using (
    game = 'drinkit'
    and active
    and (
      public.has_game('drinkit'::public.game_id)
      or public.is_admin()
    )
  );
