-- Phase 4B3: enum / kind extensions for Daily Challenge submissions.
-- Separate migration so new enum values commit before use.

alter type public.gallery_event_kind add value if not exists 'daily';

alter table public.submissions
  drop constraint if exists submissions_kind_check;

alter table public.submissions
  add constraint submissions_kind_check check (
    kind in (
      'drink_log',
      'scavenger_completion',
      'scavenger_dev_fixture',
      'daily_completion'
    )
  );
