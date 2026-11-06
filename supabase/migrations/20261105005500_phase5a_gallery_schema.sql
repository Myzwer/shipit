-- Phase 5A: Gallery reactions, read cursors, and keyset feed indexes.

create type public.gallery_reaction_emoji as enum ('heart', 'laugh', 'hang_loose');

create type public.read_cursor_scope as enum (
  'gallery_everyone',
  'achievements_mine'
);

alter table public.gallery_events
  add column if not exists owner_team_id uuid references public.teams (id);

comment on column public.gallery_events.owner_team_id is
  'Optional team owner for Ship It! / future team achievements. Drink It! stays player-owned.';

-- Backfill scavenger team ownership from linked submissions.
update public.gallery_events ge
set owner_team_id = s.team_id
from public.submissions s
where ge.submission_id = s.id
  and ge.game = 'shipit'
  and ge.owner_team_id is null
  and s.team_id is not null;

create index if not exists gallery_events_feed_keyset_idx
  on public.gallery_events (game, active, created_at_utc desc, id desc);

create index if not exists gallery_events_owner_player_idx
  on public.gallery_events (game, owner_player_id, created_at_utc desc)
  where active;

create index if not exists gallery_events_owner_team_idx
  on public.gallery_events (game, owner_team_id, created_at_utc desc)
  where active and owner_team_id is not null;

create table public.gallery_reactions (
  event_id uuid not null references public.gallery_events (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  emoji public.gallery_reaction_emoji not null,
  updated_at_utc timestamptz not null default now(),
  primary key (event_id, player_id)
);

create index gallery_reactions_event_idx on public.gallery_reactions (event_id);

comment on table public.gallery_reactions is
  'One reaction per player per Gallery event. Never affects scoring or unread dots.';

alter table public.gallery_reactions enable row level security;
alter table public.gallery_reactions force row level security;
revoke all on table public.gallery_reactions from anon, authenticated;
grant select on table public.gallery_reactions to authenticated;
grant all on table public.gallery_reactions to service_role;

-- Direct SELECT is denied; feeds go through security-definer RPCs.
create policy gallery_reactions_no_direct_select
  on public.gallery_reactions for select to authenticated
  using (false);

create table public.read_cursors (
  player_id uuid not null references public.players (id) on delete cascade,
  game public.game_id not null,
  scope public.read_cursor_scope not null,
  last_seen_event_id uuid,
  last_seen_at_utc timestamptz,
  updated_at_utc timestamptz not null default now(),
  primary key (player_id, game, scope)
);

comment on table public.read_cursors is
  'Delivered-event cursors for Gallery Everyone unread and future Achievements unread.';

alter table public.read_cursors enable row level security;
alter table public.read_cursors force row level security;
revoke all on table public.read_cursors from anon, authenticated;
grant select on table public.read_cursors to authenticated;
grant all on table public.read_cursors to service_role;

create policy read_cursors_select_own
  on public.read_cursors for select to authenticated
  using (player_id = public.current_player_id() or public.is_admin());

-- Ship It! Gallery events readable by Ship It! members (feed still via RPC for snapshots).
drop policy if exists gallery_events_select_shipit on public.gallery_events;
create policy gallery_events_select_shipit
  on public.gallery_events for select to authenticated
  using (
    game = 'shipit'
    and active
    and (
      public.has_game('shipit'::public.game_id)
      or public.is_admin()
    )
  );
