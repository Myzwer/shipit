-- Phase 2A: Ship Clock schema + game lifecycle tables
-- Authority: handoff/03-Technical-Spec.md §4–5

-- ---------------------------------------------------------------------------
-- cruise_config: one active sailing configuration
-- ---------------------------------------------------------------------------
create table public.cruise_config (
  id uuid primary key default gen_random_uuid(),
  -- Ship-local calendar date for Day 1 (Saturday). Not production sailing dates.
  day1_ship_date date not null,
  -- ship_local_wall = utc_instant + offset_minutes
  base_ship_offset_minutes integer not null,
  final_day integer not null default 7,
  final_hour integer not null default 18,
  final_minute integer not null default 0,
  -- Explicit environment label; production must not use 'development-only'
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cruise_config_final_day_check check (final_day = 7),
  constraint cruise_config_final_hour_check check (final_hour >= 0 and final_hour <= 23),
  constraint cruise_config_final_minute_check check (final_minute >= 0 and final_minute <= 59),
  constraint cruise_config_label_nonempty check (char_length(trim(label)) > 0)
);

-- At most one active cruise config
create unique index cruise_config_one_active
  on public.cruise_config ((is_active))
  where is_active;

comment on table public.cruise_config is
  'Active sailing configuration. day1_ship_date is ship-local Saturday. Production dates are unset until Phase 6.';

-- ---------------------------------------------------------------------------
-- ship_clock_plan: optional seven daily deltas at 3:00 AM ship-local
-- ---------------------------------------------------------------------------
create table public.ship_clock_plan (
  cruise_config_id uuid not null references public.cruise_config (id) on delete cascade,
  day_number integer not null,
  delta_minutes integer not null default 0,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (cruise_config_id, day_number),
  constraint ship_clock_plan_day_check check (day_number between 1 and 7),
  constraint ship_clock_plan_delta_check check (
    delta_minutes in (-120, -60, 0, 60, 120)
  )
);

comment on table public.ship_clock_plan is
  'Optional daily offset deltas. Each enabled non-zero delta applies once at 3:00 AM ship-local on that cruise day.';

-- ---------------------------------------------------------------------------
-- ship_clock_events: immutable applied timeline segments
-- ---------------------------------------------------------------------------
create type public.ship_clock_event_source as enum (
  'scheduled',
  'manual_delta',
  'manual_set'
);

create table public.ship_clock_events (
  id uuid primary key default gen_random_uuid(),
  cruise_config_id uuid not null references public.cruise_config (id) on delete cascade,
  effective_at_utc timestamptz not null,
  -- Incremental change applied at this instant (minutes added to prior offset)
  delta_minutes integer not null,
  -- Absolute offset after this event (base + all deltas up to and including this)
  offset_minutes integer not null,
  source public.ship_clock_event_source not null,
  -- Stable idempotency key for scheduled changes: 'plan:day:{n}'
  schedule_key text,
  actor_id uuid references public.players (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  constraint ship_clock_events_schedule_key_format check (
    schedule_key is null or schedule_key ~ '^plan:day:[1-7]$'
  )
);

create unique index ship_clock_events_schedule_key_unique
  on public.ship_clock_events (cruise_config_id, schedule_key)
  where schedule_key is not null;

create index ship_clock_events_effective_idx
  on public.ship_clock_events (cruise_config_id, effective_at_utc);

comment on table public.ship_clock_events is
  'Applied clock timeline. Historical rows with effective_at_utc in the past are immutable.';

-- ---------------------------------------------------------------------------
-- game_control: per-game lifecycle (pause columns prepared; ops deferred)
-- ---------------------------------------------------------------------------
create type public.game_lifecycle_status as enum (
  'pre_cruise',
  'active',
  'paused',
  'finalizing',
  'final'
);

create table public.game_control (
  game public.game_id primary key,
  status public.game_lifecycle_status not null default 'pre_cruise',
  paused_at_utc timestamptz,
  paused_by uuid references public.players (id) on delete set null,
  -- Monotonic finale latch — once set, never cleared by clock corrections
  finalized_at_utc timestamptz,
  updated_at timestamptz not null default now(),
  constraint game_control_pause_consistency check (
    (status = 'paused' and paused_at_utc is not null)
    or (status <> 'paused')
  )
);

comment on table public.game_control is
  'Per-game lifecycle. finalized_at_utc is a monotonic latch. Pause/Resume player ops arrive in a later phase.';

insert into public.game_control (game, status)
values
  ('drinkit', 'pre_cruise'),
  ('shipit', 'pre_cruise');

-- ---------------------------------------------------------------------------
-- admin_audit_log
-- ---------------------------------------------------------------------------
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_id uuid references public.players (id) on delete set null,
  target_type text,
  target_id text,
  before_json jsonb,
  after_json jsonb,
  at_utc timestamptz not null default now(),
  constraint admin_audit_log_action_nonempty check (char_length(trim(action)) > 0)
);

create index admin_audit_log_at_idx on public.admin_audit_log (at_utc desc);
create index admin_audit_log_actor_idx on public.admin_audit_log (actor_id);

comment on table public.admin_audit_log is
  'Privileged admin mutation audit trail.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.cruise_config enable row level security;
alter table public.ship_clock_plan enable row level security;
alter table public.ship_clock_events enable row level security;
alter table public.game_control enable row level security;
alter table public.admin_audit_log enable row level security;

alter table public.cruise_config force row level security;
alter table public.ship_clock_plan force row level security;
alter table public.ship_clock_events force row level security;
alter table public.game_control force row level security;
alter table public.admin_audit_log force row level security;

revoke all on table public.cruise_config from anon, authenticated;
revoke all on table public.ship_clock_plan from anon, authenticated;
revoke all on table public.ship_clock_events from anon, authenticated;
revoke all on table public.game_control from anon, authenticated;
revoke all on table public.admin_audit_log from anon, authenticated;

-- Authenticated players may read active clock diagnostics via table SELECT;
-- mutations go through SECURITY DEFINER RPCs only.
grant select on table public.cruise_config to authenticated;
grant select on table public.ship_clock_plan to authenticated;
grant select on table public.ship_clock_events to authenticated;
grant select on table public.game_control to authenticated;

create policy cruise_config_select_authenticated
  on public.cruise_config for select to authenticated
  using (true);

create policy ship_clock_plan_select_authenticated
  on public.ship_clock_plan for select to authenticated
  using (true);

create policy ship_clock_events_select_authenticated
  on public.ship_clock_events for select to authenticated
  using (true);

create policy game_control_select_authenticated
  on public.game_control for select to authenticated
  using (true);

-- Audit log: admin-only SELECT
grant select on table public.admin_audit_log to authenticated;

create policy admin_audit_log_select_admin
  on public.admin_audit_log for select to authenticated
  using (public.is_admin());
