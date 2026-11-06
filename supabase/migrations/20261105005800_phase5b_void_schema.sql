-- Phase 5B: Admin Void schema — soft-void columns + durable request ledger.
-- Does not delete submissions, claims, completions, photos, or gallery rows.

-- ---------------------------------------------------------------------------
-- submissions: audit fields for organizer void
-- ---------------------------------------------------------------------------
alter table public.submissions
  add column if not exists voided_at_utc timestamptz,
  add column if not exists voided_by_player_id uuid references public.players (id),
  add column if not exists void_reason text;

alter table public.submissions
  drop constraint if exists submissions_void_fields;

alter table public.submissions
  add constraint submissions_void_fields check (
    (
      status = 'accepted'
      and voided_at_utc is null
      and voided_by_player_id is null
      and void_reason is null
    )
    or (
      status = 'voided'
      and voided_at_utc is not null
    )
  );

comment on column public.submissions.voided_at_utc is
  'Server receipt time when an organizer voided this accepted submission (audit).';

-- ---------------------------------------------------------------------------
-- bounty_claims: void audit (status already supports voided)
-- ---------------------------------------------------------------------------
alter table public.bounty_claims
  add column if not exists voided_at_utc timestamptz,
  add column if not exists voided_by_player_id uuid references public.players (id);

alter table public.bounty_claims
  drop constraint if exists bounty_claims_void_fields;

alter table public.bounty_claims
  add constraint bounty_claims_void_fields check (
    (
      status = 'active'
      and voided_at_utc is null
      and voided_by_player_id is null
    )
    or (
      status = 'voided'
      and voided_at_utc is not null
    )
  );

-- ---------------------------------------------------------------------------
-- Durable Admin Void request ledger (Pause/Skip pattern)
-- ---------------------------------------------------------------------------
create table public.admin_void_requests (
  client_request_id uuid primary key,
  fingerprint text not null,
  -- Client-provided target id (may not exist); no FK so NOT_FOUND rejects can still ledger.
  submission_id uuid not null,
  expected_status text not null,
  reason text,
  actor_id uuid references public.players (id) on delete set null,
  cruise_config_id uuid references public.cruise_config (id) on delete set null,
  result_json jsonb not null,
  received_at_utc timestamptz not null,
  completed_at_utc timestamptz not null default clock_timestamp(),
  constraint admin_void_requests_fp_nonempty check (char_length(trim(fingerprint)) > 0),
  constraint admin_void_requests_expected_nonempty check (char_length(trim(expected_status)) > 0)
);

comment on table public.admin_void_requests is
  'Idempotent Admin Void ledger keyed by client_request_id + fingerprint. Lost-response reconcile source of truth.';

create index admin_void_requests_created_idx
  on public.admin_void_requests (completed_at_utc desc);

create index admin_void_requests_submission_idx
  on public.admin_void_requests (submission_id);

alter table public.admin_void_requests enable row level security;
alter table public.admin_void_requests force row level security;

revoke all on table public.admin_void_requests from anon, authenticated;
grant select on table public.admin_void_requests to authenticated;

create policy admin_void_requests_select_admin
  on public.admin_void_requests for select to authenticated
  using (public.is_admin());

create or replace function public.admin_void_fingerprint(
  p_submission_id uuid,
  p_expected_status text
)
returns text
language sql
immutable
as $$
  select 'void_submission:' || p_submission_id::text || ':' || lower(trim(p_expected_status));
$$;

revoke all on function public.admin_void_fingerprint(uuid, text) from public;
grant execute on function public.admin_void_fingerprint(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Future achievement integration boundary (no-op until achievements phase)
-- ---------------------------------------------------------------------------
create or replace function public.achievement_on_void_submission(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- FUTURE ACHIEVEMENT INTEGRATION BOUNDARY (must complete before achievements launch):
  -- 1. A voided source must not satisfy any achievement.
  -- 2. Dependent awards must be recalculated transactionally inside the void txn.
  -- 3. Exclusive Firsts may pass to the next valid owner; never two exclusive winners.
  -- 4. Revoked award Gallery events must be suppressed (active=false).
  -- 5. No award or result revision after Friday 6 PM finale latch.
  -- Do NOT invent achievement catalog, counters, icons, titles, or awards here.
  if p_submission_id is null then
    return;
  end if;
  return;
end;
$$;

revoke all on function public.achievement_on_void_submission(uuid) from public;
grant execute on function public.achievement_on_void_submission(uuid) to service_role;

comment on function public.achievement_on_void_submission(uuid) is
  'Phase 5B boundary stub. Achievements phase must replace this with transactional recompute before launch.';
