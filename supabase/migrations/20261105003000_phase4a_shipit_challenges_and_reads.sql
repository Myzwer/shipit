-- Phase 4A: Ship It! scavenger challenges, team completion ledger, secure reads.
-- Authority: Game Rules §4–4.1, UX §6.1–6.3, Tech Spec §4 / §16 Phase 4.
-- No player-facing submit / photo scoring in this phase.

-- ---------------------------------------------------------------------------
-- Enums / challenges catalog
-- ---------------------------------------------------------------------------
create type public.scavenger_category as enum (
  'classic_ship_landmarks',
  'food_and_drink_discoveries',
  'quirky_details_and_hidden_artifacts',
  'interactive_crew_and_activity',
  'creative_team_and_action_shots'
);

create table public.scavenger_challenges (
  id uuid primary key,
  canonical_key text not null,
  category public.scavenger_category not null,
  title text not null,
  instructions text not null,
  points integer not null,
  sort_order integer not null,
  enabled boolean not null default true,
  photo_required boolean not null default true,
  content_source text not null default 'development-only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scavenger_challenges_canonical_key_unique unique (canonical_key),
  constraint scavenger_challenges_canonical_key_nonempty check (char_length(trim(canonical_key)) > 0),
  constraint scavenger_challenges_title_nonempty check (char_length(trim(title)) > 0),
  constraint scavenger_challenges_instructions_nonempty check (char_length(trim(instructions)) > 0),
  constraint scavenger_challenges_points_check check (points in (100, 200, 300, 400, 500)),
  constraint scavenger_challenges_photo_required check (photo_required is true),
  constraint scavenger_challenges_category_points check (
    (category = 'classic_ship_landmarks' and points = 100)
    or (category = 'food_and_drink_discoveries' and points = 200)
    or (category = 'quirky_details_and_hidden_artifacts' and points = 300)
    or (category = 'interactive_crew_and_activity' and points = 400)
    or (category = 'creative_team_and_action_shots' and points = 500)
  ),
  constraint scavenger_challenges_sort_order_positive check (sort_order >= 1)
);

create unique index scavenger_challenges_sort_order_unique
  on public.scavenger_challenges (sort_order);

create index scavenger_challenges_category_enabled_idx
  on public.scavenger_challenges (category, enabled, sort_order);

comment on table public.scavenger_challenges is
  'Ship It! 50 photo scavenger tasks. Content may be replaced later without rewriting completion history (snapshots live on completions).';

-- ---------------------------------------------------------------------------
-- Expand submissions for future Ship It! / fixture parents
-- ---------------------------------------------------------------------------
alter table public.submissions
  drop constraint if exists submissions_kind_check;

alter table public.submissions
  add constraint submissions_kind_check check (
    kind in ('drink_log', 'scavenger_completion', 'scavenger_dev_fixture')
  );

alter table public.submissions
  add column if not exists team_id uuid references public.teams (id);

-- ---------------------------------------------------------------------------
-- Team completion ledger
-- ---------------------------------------------------------------------------
create table public.scavenger_completions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  challenge_id uuid not null references public.scavenger_challenges (id),
  submitting_player_id uuid not null references public.players (id),
  submission_id uuid references public.submissions (id) on delete set null,
  cruise_config_id uuid not null references public.cruise_config (id),
  points integer not null,
  status public.claim_status not null default 'active',
  challenge_canonical_key text not null,
  category public.scavenger_category not null,
  title_snapshot text not null,
  instructions_snapshot text not null,
  completed_at_utc timestamptz not null,
  created_at timestamptz not null default now(),
  voided_at_utc timestamptz,
  voided_by_player_id uuid references public.players (id),
  constraint scavenger_completions_points_check check (points in (100, 200, 300, 400, 500)),
  constraint scavenger_completions_title_nonempty check (char_length(trim(title_snapshot)) > 0),
  constraint scavenger_completions_instructions_nonempty check (char_length(trim(instructions_snapshot)) > 0),
  constraint scavenger_completions_void_fields check (
    (status = 'active' and voided_at_utc is null and voided_by_player_id is null)
    or (status = 'voided' and voided_at_utc is not null)
  )
);

create unique index scavenger_completions_one_active_per_team_challenge
  on public.scavenger_completions (team_id, challenge_id)
  where status = 'active';

create index scavenger_completions_team_status_idx
  on public.scavenger_completions (team_id, status);

create index scavenger_completions_challenge_status_idx
  on public.scavenger_completions (challenge_id, status);

create index scavenger_completions_cruise_idx
  on public.scavenger_completions (cruise_config_id);

comment on table public.scavenger_completions is
  'Team-scoped Ship It! completions. One active row per team+challenge; other teams may complete independently. Snapshots preserve history across content replacement.';

-- ---------------------------------------------------------------------------
-- RLS: no direct player writes; reads only via security-definer RPCs
-- ---------------------------------------------------------------------------
alter table public.scavenger_challenges enable row level security;
alter table public.scavenger_challenges force row level security;
alter table public.scavenger_completions enable row level security;
alter table public.scavenger_completions force row level security;

revoke all on table public.scavenger_challenges from anon, authenticated;
revoke all on table public.scavenger_completions from anon, authenticated;
grant select, insert, update, delete on table public.scavenger_challenges to service_role;
grant select, insert, update, delete on table public.scavenger_completions to service_role;

-- ---------------------------------------------------------------------------
-- Category helpers
-- ---------------------------------------------------------------------------
create or replace function public.scavenger_category_label(p_category public.scavenger_category)
returns text
language sql
immutable
as $$
  select case p_category
    when 'classic_ship_landmarks' then 'Classic Ship Landmarks'
    when 'food_and_drink_discoveries' then 'Food & Drink Discoveries'
    when 'quirky_details_and_hidden_artifacts' then 'Quirky Details & Hidden Artifacts'
    when 'interactive_crew_and_activity' then 'Interactive Crew & Activity Challenges'
    when 'creative_team_and_action_shots' then 'Creative Team & Action Shots'
  end;
$$;

create or replace function public.scavenger_category_points(p_category public.scavenger_category)
returns integer
language sql
immutable
as $$
  select case p_category
    when 'classic_ship_landmarks' then 100
    when 'food_and_drink_discoveries' then 200
    when 'quirky_details_and_hidden_artifacts' then 300
    when 'interactive_crew_and_activity' then 400
    when 'creative_team_and_action_shots' then 500
  end;
$$;

create or replace function public.scavenger_category_sort(p_category public.scavenger_category)
returns integer
language sql
immutable
as $$
  select case p_category
    when 'classic_ship_landmarks' then 1
    when 'food_and_drink_discoveries' then 2
    when 'quirky_details_and_hidden_artifacts' then 3
    when 'interactive_crew_and_activity' then 4
    when 'creative_team_and_action_shots' then 5
  end;
$$;

revoke all on function public.scavenger_category_label(public.scavenger_category) from public;
revoke all on function public.scavenger_category_points(public.scavenger_category) from public;
revoke all on function public.scavenger_category_sort(public.scavenger_category) from public;
grant execute on function public.scavenger_category_label(public.scavenger_category) to authenticated, service_role;
grant execute on function public.scavenger_category_points(public.scavenger_category) to authenticated, service_role;
grant execute on function public.scavenger_category_sort(public.scavenger_category) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lifecycle (Ship Clock governed; available before noon / while Drink It! paused)
-- ---------------------------------------------------------------------------
create or replace function public.shipit_lifecycle_at(p_at_utc timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_control public.game_control%rowtype;
  v_offset integer;
  v_ship timestamp;
  v_ship_date date;
  v_cruise_day integer;
  v_finale_utc timestamptz;
  v_status text;
  v_read_only boolean := false;
begin
  select * into v_config from public.cruise_config where is_active limit 1;
  if not found then
    return jsonb_build_object(
      'ok', true,
      'status', 'unconfigured',
      'read_only', true,
      'accepting_submissions', false,
      'reason', 'no_cruise_config'
    );
  end if;

  select * into v_control from public.game_control where game = 'shipit';
  v_offset := public.clock_offset_at(v_config.id, v_config.base_ship_offset_minutes, p_at_utc);
  v_ship := public.utc_to_ship_local(p_at_utc, v_offset);
  v_ship_date := v_ship::date;
  v_cruise_day := public.cruise_day_for_ship_date(v_config.day1_ship_date, v_ship_date, v_config.final_day);

  v_finale_utc := public.ship_local_to_utc(
    ((v_config.day1_ship_date + (v_config.final_day - 1)) + time '18:00')::timestamp,
    v_offset
  );

  if p_at_utc >= v_finale_utc or v_control.finalized_at_utc is not null then
    v_status := 'finale';
    v_read_only := true;
  elsif v_cruise_day is null then
    if v_ship_date < v_config.day1_ship_date then
      v_status := 'pre_cruise';
      v_read_only := true;
    else
      v_status := 'post_cruise';
      v_read_only := true;
    end if;
  else
    v_status := 'active';
    v_read_only := false;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'read_only', v_read_only,
    'accepting_submissions', (not v_read_only),
    'cruise_config_id', v_config.id,
    'cruise_day', v_cruise_day,
    'ship_date', v_ship_date,
    'ship_local', to_char(v_ship, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'finale_at_utc', v_finale_utc,
    'at_utc', p_at_utc
  );
end;
$$;

revoke all on function public.shipit_lifecycle_at(timestamptz) from public;
grant execute on function public.shipit_lifecycle_at(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Seed development-only challenges (exactly 50 / 10 per category)
-- ---------------------------------------------------------------------------
insert into public.scavenger_challenges (
  id, canonical_key, category, title, instructions, points, sort_order,
  enabled, photo_required, content_source
) values
  ('c4697e3e-7aa6-512b-9584-0369f4bf8742'::uuid, 'the-piazza-grandeur', 'classic_ship_landmarks'::public.scavenger_category, '[DEV] The Piazza Grandeur', 'A full team selfie on the sweeping central atrium staircase.', 100, 1, true, true, 'development-only'),
  ('acfaaa82-bd35-53b6-af3b-415906563aaf'::uuid, 'movies-under-the-stars', 'classic_ship_landmarks'::public.scavenger_category, '[DEV] Movies Under the Stars', 'A photo with the massive poolside outdoor movie screen perfectly framed in the background.', 100, 2, true, true, 'development-only'),
  ('03c68c0e-e60f-5e67-973f-ae7f5dda16bb'::uuid, 'under-the-dome', 'classic_ship_landmarks'::public.scavenger_category, '[DEV] Under The Dome', 'A high-angle group photo beneath the dramatic glass-domed top deck area.', 100, 3, true, true, 'development-only'),
  ('7e27b079-0f85-5607-a829-30724823b824'::uuid, 'miniature-masterpiece', 'classic_ship_landmarks'::public.scavenger_category, '[DEV] Miniature Masterpiece', 'Locate the detailed scale model of a Princess ship in its glass showcase.', 100, 4, true, true, 'development-only'),
  ('691307b2-46ec-5ccf-b2ac-a0047ad8b895'::uuid, 'lotus-spa-zen', 'classic_ship_landmarks'::public.scavenger_category, '[DEV] Lotus Spa Zen', 'A photo outside the spa doors with everyone striking their best over-the-top relaxed yoga pose.', 100, 5, true, true, 'development-only'),
  ('9d5a4e00-c76a-522b-baf6-10a33ae09db2'::uuid, 'front-row-center', 'classic_ship_landmarks'::public.scavenger_category, '[DEV] Front Row Center', 'Sit in the absolute front row of the completely empty Princess Theater.', 100, 6, true, true, 'development-only'),
  ('bd48a5da-851b-52c8-98d5-8256ae895800'::uuid, 'casino-neon', 'classic_ship_landmarks'::public.scavenger_category, '[DEV] Casino Neon', 'A team photo outside the casino doors featuring a bright or flashing sign.', 100, 7, true, true, 'development-only'),
  ('2b9210b1-b677-5b73-b51d-c3b39774a332'::uuid, 'art-critic', 'classic_ship_landmarks'::public.scavenger_category, '[DEV] Art Critic', 'Posing next to your absolute favorite (or most confusing) piece in the onboard art gallery.', 100, 8, true, true, 'development-only'),
  ('604df8ac-2cb6-5d34-a003-85fa39006a26'::uuid, 'gym-buffs', 'classic_ship_landmarks'::public.scavenger_category, '[DEV] Gym Buffs', 'A snapshot of a teammate looking comically exhausted while "running" on a treadmill.', 100, 9, true, true, 'development-only'),
  ('8e621e7f-25fd-519b-b395-f7e958e49593'::uuid, 'guest-services', 'classic_ship_landmarks'::public.scavenger_category, '[DEV] Guest Services', 'A photo with the main guest services desk clearly visible in the background.', 100, 10, true, true, 'development-only'),
  ('3ab91d74-17a8-58be-b3c9-9a06a24a9c92'::uuid, 'international-cafe', 'food_and_drink_discoveries'::public.scavenger_category, '[DEV] International Café', 'A photo highlighting a beautiful pastry display or a custom espresso drink cup.', 200, 11, true, true, 'development-only'),
  ('8f0a23eb-4b70-57f5-85d5-f5e5ac91b4c8'::uuid, 'omalleys-irish-pub', 'food_and_drink_discoveries'::public.scavenger_category, '[DEV] O''Malley''s Irish Pub', 'Capture the distinct green Irish pub decor or a classic pub menu board.', 200, 12, true, true, 'development-only'),
  ('dfa82318-ba59-548e-a4f5-1ce26ff6028f'::uuid, 'poolside-slice', 'food_and_drink_discoveries'::public.scavenger_category, '[DEV] Poolside Slice', 'A close-up photo of a fresh, steaming slice of pizza from the deck counter.', 200, 13, true, true, 'development-only'),
  ('21dc69dd-c367-5979-a8f0-909e1f8cd82e'::uuid, 'soft-serve-swirl', 'food_and_drink_discoveries'::public.scavenger_category, '[DEV] Soft Serve Swirl', 'A photo holding a perfectly balanced complimentary soft-serve ice cream cone near the pool.', 200, 14, true, true, 'development-only'),
  ('50c6a1e9-c0d9-53c4-8b23-151b8fc1152e'::uuid, 'buffet-multi-tasker', 'food_and_drink_discoveries'::public.scavenger_category, '[DEV] Buffet Multi-Tasker', 'A snapshot of a single plate featuring at least 5 completely mismatched types of food.', 200, 15, true, true, 'development-only'),
  ('46be8325-8381-5421-945f-d2bc59a1b2f9'::uuid, 'tropical-paradise', 'food_and_drink_discoveries'::public.scavenger_category, '[DEV] Tropical Paradise', 'Hold up a bright, colorful drink (cocktail or mocktail) complete with a fruit garnish or tiny umbrella.', 200, 16, true, true, 'development-only'),
  ('3b49150d-c56e-5041-815e-c8380c5bd2c6'::uuid, 'main-dining-elegance', 'food_and_drink_discoveries'::public.scavenger_category, '[DEV] Main Dining Elegance', 'Pose like royalty at an empty, fully-set dinner table before evening service begins.', 200, 17, true, true, 'development-only'),
  ('24b1ed0e-3a8f-5a94-a086-1d4e61cbdc8e'::uuid, 'sweet-treat', 'food_and_drink_discoveries'::public.scavenger_category, '[DEV] Sweet Treat', 'Find the most colorful, multi-layered cake slice at the buffet dessert station.', 200, 18, true, true, 'development-only'),
  ('ff2c17b8-ebc8-5993-9244-d29ded762d6b'::uuid, 'good-spirits-mixology', 'food_and_drink_discoveries'::public.scavenger_category, '[DEV] Good Spirits Mixology', 'Capture a photo of a unique drink menu or the bartender''s custom cocktail station.', 200, 19, true, true, 'development-only'),
  ('970c7644-a88b-53ef-b15b-3ad8cc1b6a4b'::uuid, 'room-service-delivery', 'food_and_drink_discoveries'::public.scavenger_category, '[DEV] Room Service Delivery', 'A photo of the classic hanging door menu or a fresh morning breakfast tray in your room.', 200, 20, true, true, 'development-only'),
  ('d2604f4c-cb09-53f7-8cbe-da9d71417151'::uuid, 'carpet-compass', 'quirky_details_and_hidden_artifacts'::public.scavenger_category, '[DEV] Carpet Compass', 'A photo pointing to the hallway carpet pattern that indicates which way is the front of the ship.', 300, 21, true, true, 'development-only'),
  ('3d6976cf-35aa-5709-9456-670dbf4bddb6'::uuid, 'stateroom-door-flair', 'quirky_details_and_hidden_artifacts'::public.scavenger_category, '[DEV] Stateroom Door Flair', 'Find and photograph the most uniquely or creatively decorated stateroom door in the halls.', 300, 22, true, true, 'development-only'),
  ('55410248-86e0-52cb-9c38-22dfafe99cb4'::uuid, 'elevator-map', 'quirky_details_and_hidden_artifacts'::public.scavenger_category, '[DEV] Elevator Map', 'A photo of the digital deck indicator screen changing numbers inside an elevator.', 300, 23, true, true, 'development-only'),
  ('0c88b6d9-9a7c-5d3c-a092-b1cd2abf42b0'::uuid, 'nautical-rose', 'quirky_details_and_hidden_artifacts'::public.scavenger_category, '[DEV] Nautical Rose', 'Locate a built-in compass rose design element embedded in the ship''s flooring or woodwork.', 300, 24, true, true, 'development-only'),
  ('cf5cfc00-aace-5b8b-9e6b-1b612f0df227'::uuid, 'safety-first', 'quirky_details_and_hidden_artifacts'::public.scavenger_category, '[DEV] Safety First', 'Stand side-by-side with an official, bright red "Star Princess" life ring buoy.', 300, 25, true, true, 'development-only'),
  ('6f86efc9-134d-539c-93c2-6ebdac094f07'::uuid, 'deck-13-mystery', 'quirky_details_and_hidden_artifacts'::public.scavenger_category, '[DEV] Deck 13 Mystery', 'A photo of the elevator button panel or stairwell sign confirming whether Deck 13 exists on the ship.', 300, 26, true, true, 'development-only'),
  ('250b573c-d286-5de9-acbd-18b6d3989958'::uuid, 'high-wind-warning', 'quirky_details_and_hidden_artifacts'::public.scavenger_category, '[DEV] High Wind Warning', 'Posing with a unique nautical safety sign (like a "Watch Your Step" or "High Wind Area" door notice).', 300, 27, true, true, 'development-only'),
  ('190aa75d-cdd2-5764-ae64-e3db4a947706'::uuid, 'towel-zoo', 'quirky_details_and_hidden_artifacts'::public.scavenger_category, '[DEV] Towel Zoo', 'A photo of a creative towel animal greeting you on your stateroom bed.', 300, 28, true, true, 'development-only'),
  ('d5d1b97c-40bf-54ca-8553-20506a09eb33'::uuid, 'lounge-spotlight', 'quirky_details_and_hidden_artifacts'::public.scavenger_category, '[DEV] Lounge Spotlight', 'Stand on an empty lounge stage while holding an imaginary microphone.', 300, 29, true, true, 'development-only'),
  ('95ef28d3-340c-5ec2-8a28-9614f6508908'::uuid, 'ocean-wake', 'quirky_details_and_hidden_artifacts'::public.scavenger_category, '[DEV] Ocean Wake', 'A snapshot from the absolute back of the ship looking directly down at the white churning water trail.', 300, 30, true, true, 'development-only'),
  ('81110e99-ce63-50ef-b259-242caed36fe4'::uuid, 'the-cruise-guide', 'interactive_crew_and_activity'::public.scavenger_category, '[DEV] The Cruise Guide', 'A photo showcasing the official daily printed activity schedule or the digital app guide.', 400, 31, true, true, 'development-only'),
  ('d5ba833f-b8d8-5e76-985a-cd98b8cef9ca'::uuid, 'crew-high-five', 'interactive_crew_and_activity'::public.scavenger_category, '[DEV] Crew High-Five', 'An active high-five photo mid-action with an onboard crew member.', 400, 32, true, true, 'development-only'),
  ('451718b9-717a-5a58-9cd5-5e1c4877669d'::uuid, 'captains-portrait', 'interactive_crew_and_activity'::public.scavenger_category, '[DEV] Captain''s Portrait', 'Locate and pose next to the official portrait photo of the ship''s captain.', 400, 33, true, true, 'development-only'),
  ('1ffe39ca-6b03-5bf7-905a-bd4618f15528'::uuid, 'trivia-masters', 'interactive_crew_and_activity'::public.scavenger_category, '[DEV] Trivia Masters', 'Hold up your official team answer sheet during an onboard trivia event.', 400, 34, true, true, 'development-only'),
  ('13c24b2c-4aa4-50ae-a198-021e2fa54e80'::uuid, 'live-music-backdrop', 'interactive_crew_and_activity'::public.scavenger_category, '[DEV] Live Music Backdrop', 'A snapshot with a live singer or band performing in one of the lounges behind you.', 400, 35, true, true, 'development-only'),
  ('83f00175-57d3-5a8f-8bd9-a93e3f420a21'::uuid, 'ocean-lookout', 'interactive_crew_and_activity'::public.scavenger_category, '[DEV] Ocean Lookout', 'A photo of a teammate pretending to look through professional binoculars on the open deck.', 400, 36, true, true, 'development-only'),
  ('216d3ad2-dc31-5e7f-b260-48e02f311d30'::uuid, 'deck-dance-move', 'interactive_crew_and_activity'::public.scavenger_category, '[DEV] Deck Dance Move', 'A photo participating in a pool-deck line dance or an organized fitness class.', 400, 37, true, true, 'development-only'),
  ('314479ba-ea6f-5a3f-a727-7c4b5dc75ebb'::uuid, 'bingo-champion', 'interactive_crew_and_activity'::public.scavenger_category, '[DEV] Bingo Champion', 'Hold an official, un-punched Bingo card or a guest raffle ticket.', 400, 38, true, true, 'development-only'),
  ('805a6457-d5d7-50b8-bfa0-2aa0d2886e50'::uuid, 'souvenir-selection', 'interactive_crew_and_activity'::public.scavenger_category, '[DEV] Souvenir Selection', 'A photo holding the most unique, funny, or oversized Princess Cruises item in the gift shop.', 400, 39, true, true, 'development-only'),
  ('cc204ca4-c39d-551a-9e84-c573ab062e40'::uuid, 'the-youth-club-entry', 'interactive_crew_and_activity'::public.scavenger_category, '[DEV] The Youth Club Entry', 'A quick group pose right outside the entrance sign for the kids'' clubs or the arcade.', 400, 40, true, true, 'development-only'),
  ('8e7c1370-2ba1-5d1f-bb19-d08825d7a109'::uuid, 'wind-tunnel', 'creative_team_and_action_shots'::public.scavenger_category, '[DEV] Wind Tunnel', 'An open-deck photo with everyone''s hair blowing completely wild in the ocean sea breeze.', 500, 41, true, true, 'development-only'),
  ('abd3399b-193d-59a5-9732-d9c6dfcd51de'::uuid, 'sunset-silhouette', 'creative_team_and_action_shots'::public.scavenger_category, '[DEV] Sunset Silhouette', 'A beautifully framed group photo where everyone is silhouetted against the ocean horizon.', 500, 42, true, true, 'development-only'),
  ('13396a2a-7e67-5d4e-b12c-207cec10c581'::uuid, 'king-of-the-world', 'creative_team_and_action_shots'::public.scavenger_category, '[DEV] King of the World', 'Two teammates recreating the iconic "Titanic" arms-wide pose at an open deck railing.', 500, 43, true, true, 'development-only'),
  ('18e4343f-bc5c-56ec-92b8-7efad9619b9b'::uuid, 'triple-match', 'creative_team_and_action_shots'::public.scavenger_category, '[DEV] Triple Match', 'A photo where all 3 team members are wearing matching colors or coordinated cruise outfits.', 500, 44, true, true, 'development-only'),
  ('1e72973a-6bda-50fd-abbe-2e67046b45f2'::uuid, 'mid-air-jump', 'creative_team_and_action_shots'::public.scavenger_category, '[DEV] Mid-Air Jump', 'Catching all 3 team members frozen mid-air at the exact same time on the sports deck.', 500, 45, true, true, 'development-only'),
  ('609c4769-c04b-593b-8db1-29b2b352b54a'::uuid, 'chair-squeeze', 'creative_team_and_action_shots'::public.scavenger_category, '[DEV] Chair Squeeze', 'All 3 teammates crammed into a single poolside lounge chair at the same time.', 500, 46, true, true, 'development-only'),
  ('7c4c6001-7d0a-5b61-8df5-3fd9c7b49429'::uuid, 'shadow-art', 'creative_team_and_action_shots'::public.scavenger_category, '[DEV] Shadow Art', 'A clear photo of your 3 distinct shadows stretched out long across the outdoor running track.', 500, 47, true, true, 'development-only'),
  ('f755b814-6dab-576e-b106-3f8e0cfb7ed9'::uuid, 'comically-lost', 'creative_team_and_action_shots'::public.scavenger_category, '[DEV] Comically Lost', 'A photo of the team comically staring upside-down or looking completely baffled at a ship directory map.', 500, 48, true, true, 'development-only'),
  ('b1bf5c49-9303-5702-aa6b-320788e808d2'::uuid, 'bridge-wing-peek', 'creative_team_and_action_shots'::public.scavenger_category, '[DEV] Bridge Wing Peek', 'A photo attempting to spot the officer on watch up on the bridge wing from a public forward deck.', 500, 49, true, true, 'development-only'),
  ('c0187b80-f6f5-5187-a0d9-5af52dd433b4'::uuid, 'victory-dance', 'creative_team_and_action_shots'::public.scavenger_category, '[DEV] Victory Dance', 'A hilarious action photo celebrating the completion of your 50th hunt item!', 500, 50, true, true, 'development-only');

-- Guard: exactly 50 enabled, 10 per category, points total capacity 15000
do $$
declare
  v_total integer;
  v_bad integer;
begin
  select count(*) into v_total from public.scavenger_challenges where enabled;
  if v_total <> 50 then
    raise exception 'SHIPIT_SEED_COUNT: expected 50 enabled challenges, got %', v_total;
  end if;
  select count(*) into v_bad
  from (
    select category, count(*) as n, max(points) as pts
    from public.scavenger_challenges
    where enabled
    group by category
  ) s
  where s.n <> 10;
  if v_bad <> 0 then
    raise exception 'SHIPIT_SEED_CATEGORY: each category must have exactly 10 enabled challenges';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Player identity helpers for Ship It! reads
-- ---------------------------------------------------------------------------
create or replace function public.require_shipit_player()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_player uuid;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.has_game('shipit') then
    raise exception 'SHIPIT_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;
  return v_player;
end;
$$;

revoke all on function public.require_shipit_player() from public;
grant execute on function public.require_shipit_player() to authenticated, service_role;

create or replace function public.require_shipit_team_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team uuid;
begin
  perform public.require_shipit_player();
  v_team := public.current_team_id();
  if v_team is null then
    raise exception 'SHIPIT_TEAM_REQUIRED' using errcode = '42501';
  end if;
  return v_team;
end;
$$;

revoke all on function public.require_shipit_team_id() from public;
grant execute on function public.require_shipit_team_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Aggregation helpers
-- ---------------------------------------------------------------------------
create or replace function public.shipit_team_score_rows(p_cruise_config_id uuid)
returns table (
  team_id uuid,
  team_name text,
  completed_count integer,
  points integer,
  first_completion_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id as team_id,
    t.name as team_name,
    coalesce(agg.completed_count, 0)::integer as completed_count,
    coalesce(agg.points, 0)::integer as points,
    agg.first_completion_at
  from public.teams t
  left join lateral (
    select
      count(*)::integer as completed_count,
      coalesce(sum(sc.points), 0)::integer as points,
      min(sc.completed_at_utc) as first_completion_at
    from public.scavenger_completions sc
    where sc.team_id = t.id
      and sc.status = 'active'
      and sc.cruise_config_id = p_cruise_config_id
  ) agg on true
  where exists (
    select 1 from public.team_memberships tm
    where tm.team_id = t.id and tm.active_to is null
  )
  order by coalesce(agg.points, 0) desc,
           coalesce(agg.first_completion_at, 'infinity'::timestamptz) asc,
           lower(t.name) asc,
           t.id asc;
$$;

revoke all on function public.shipit_team_score_rows(uuid) from public;
grant execute on function public.shipit_team_score_rows(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Player reads (zero team-id params for auth)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_shipit_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_team uuid;
  v_team_name text;
  v_life jsonb;
  v_cruise uuid;
  v_categories jsonb := '[]'::jsonb;
  v_cat public.scavenger_category;
  v_completed integer;
  v_points integer;
  v_overall_completed integer := 0;
  v_overall_points integer := 0;
  v_leaderboard jsonb := '[]'::jsonb;
  v_rank integer;
  v_prev_points integer;
  v_display_rank integer;
  v_row record;
  v_members text[];
  v_my_completed integer := 0;
  v_my_points integer := 0;
begin
  v_player := public.require_shipit_player();
  v_team := public.require_shipit_team_id();
  select name into v_team_name from public.teams where id = v_team;

  perform public.ensure_finale_latched(now());
  v_life := public.shipit_lifecycle_at(now());

  if (v_life->>'status') = 'unconfigured' then
    return jsonb_build_object(
      'ok', true,
      'lifecycle', v_life,
      'team', jsonb_build_object('id', v_team, 'name', v_team_name),
      'overall', jsonb_build_object('completed', 0, 'total', 50, 'points', 0),
      'categories', '[]'::jsonb,
      'leaderboard', '[]'::jsonb
    );
  end if;

  v_cruise := (v_life->>'cruise_config_id')::uuid;

  foreach v_cat in array array[
    'classic_ship_landmarks'::public.scavenger_category,
    'food_and_drink_discoveries'::public.scavenger_category,
    'quirky_details_and_hidden_artifacts'::public.scavenger_category,
    'interactive_crew_and_activity'::public.scavenger_category,
    'creative_team_and_action_shots'::public.scavenger_category
  ]
  loop
    select count(*)::integer, coalesce(sum(sc.points), 0)::integer
    into v_completed, v_points
    from public.scavenger_completions sc
    join public.scavenger_challenges ch on ch.id = sc.challenge_id
    where sc.team_id = v_team
      and sc.status = 'active'
      and sc.cruise_config_id = v_cruise
      and ch.category = v_cat
      and ch.enabled is true;

    v_overall_completed := v_overall_completed + v_completed;
    v_overall_points := v_overall_points + v_points;

    v_categories := v_categories || jsonb_build_array(jsonb_build_object(
      'category', v_cat,
      'label', public.scavenger_category_label(v_cat),
      'points_per_challenge', public.scavenger_category_points(v_cat),
      'completed', v_completed,
      'total', 10,
      'points', v_points,
      'sort_order', public.scavenger_category_sort(v_cat)
    ));
  end loop;

  v_my_completed := v_overall_completed;
  v_my_points := v_overall_points;

  v_rank := 0;
  v_prev_points := null;
  v_display_rank := 0;
  for v_row in
    select * from public.shipit_team_score_rows(v_cruise)
  loop
    v_rank := v_rank + 1;
    if v_prev_points is null or v_row.points is distinct from v_prev_points then
      v_display_rank := v_rank;
    end if;
    v_prev_points := v_row.points;

    select coalesce(array_agg(p.display_name order by lower(p.display_name), p.id), '{}'::text[])
    into v_members
    from public.team_memberships tm
    join public.players p on p.id = tm.player_id
    where tm.team_id = v_row.team_id
      and tm.active_to is null
      and p.active is true;

    v_leaderboard := v_leaderboard || jsonb_build_array(jsonb_build_object(
      'team_id', v_row.team_id,
      'team_name', v_row.team_name,
      'members', to_jsonb(v_members),
      'completed', v_row.completed_count,
      'total', 50,
      'points', v_row.points,
      'rank', v_display_rank,
      'is_my_team', v_row.team_id = v_team
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'lifecycle', v_life,
    'team', jsonb_build_object(
      'id', v_team,
      'name', v_team_name,
      'completed', v_my_completed,
      'points', v_my_points
    ),
    'overall', jsonb_build_object(
      'completed', v_my_completed,
      'total', 50,
      'points', v_my_points
    ),
    'categories', v_categories,
    'leaderboard', v_leaderboard
  );
end;
$$;

revoke all on function public.get_my_shipit_home() from public;
grant execute on function public.get_my_shipit_home() to authenticated;

create or replace function public.get_my_shipit_challenges(p_category text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_team_name text;
  v_life jsonb;
  v_cruise uuid;
  v_filter public.scavenger_category;
  v_items jsonb := '[]'::jsonb;
  v_sections jsonb := '[]'::jsonb;
  v_cat public.scavenger_category;
  v_cat_completed integer;
  v_cat_points integer;
  v_row record;
  v_completed boolean;
begin
  v_team := public.require_shipit_team_id();
  select name into v_team_name from public.teams where id = v_team;
  perform public.ensure_finale_latched(now());
  v_life := public.shipit_lifecycle_at(now());

  if p_category is not null and nullif(trim(p_category), '') is not null and lower(trim(p_category)) <> 'all' then
    begin
      v_filter := trim(p_category)::public.scavenger_category;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'INVALID_CATEGORY', 'message', 'Unknown challenge category.');
    end;
  end if;

  if (v_life->>'status') = 'unconfigured' then
    return jsonb_build_object(
      'ok', true,
      'lifecycle', v_life,
      'team', jsonb_build_object('id', v_team, 'name', v_team_name),
      'filter', coalesce(v_filter::text, 'all'),
      'sections', '[]'::jsonb,
      'submission_available', false
    );
  end if;

  v_cruise := (v_life->>'cruise_config_id')::uuid;

  foreach v_cat in array array[
    'classic_ship_landmarks'::public.scavenger_category,
    'food_and_drink_discoveries'::public.scavenger_category,
    'quirky_details_and_hidden_artifacts'::public.scavenger_category,
    'interactive_crew_and_activity'::public.scavenger_category,
    'creative_team_and_action_shots'::public.scavenger_category
  ]
  loop
    if v_filter is not null and v_cat is distinct from v_filter then
      continue;
    end if;

    v_items := '[]'::jsonb;
    v_cat_completed := 0;
    v_cat_points := 0;

    for v_row in
      select ch.*
      from public.scavenger_challenges ch
      where ch.enabled is true
        and ch.category = v_cat
      order by ch.sort_order
    loop
      select exists (
        select 1 from public.scavenger_completions sc
        where sc.team_id = v_team
          and sc.challenge_id = v_row.id
          and sc.status = 'active'
          and sc.cruise_config_id = v_cruise
      ) into v_completed;

      if v_completed then
        v_cat_completed := v_cat_completed + 1;
        v_cat_points := v_cat_points + v_row.points;
      end if;

      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'id', v_row.id,
        'canonical_key', v_row.canonical_key,
        'category', v_row.category,
        'title', v_row.title,
        'instructions', v_row.instructions,
        'points', v_row.points,
        'sort_order', v_row.sort_order,
        'photo_required', v_row.photo_required,
        'completed', v_completed,
        'actionable', (not v_completed) and coalesce((v_life->>'accepting_submissions')::boolean, false),
        -- Phase 4A: photo pipeline not ready — preserve final contract shape.
        'submission_ready', false
      ));
    end loop;

    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'category', v_cat,
      'label', public.scavenger_category_label(v_cat),
      'points_per_challenge', public.scavenger_category_points(v_cat),
      'completed', v_cat_completed,
      'total', 10,
      'points', v_cat_points,
      'challenges', v_items
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'lifecycle', v_life,
    'team', jsonb_build_object('id', v_team, 'name', v_team_name),
    'filter', coalesce(v_filter::text, 'all'),
    'sections', v_sections,
    'submission_available', false,
    'submission_blocked_reason', 'photo_pipeline_pending'
  );
end;
$$;

revoke all on function public.get_my_shipit_challenges(text) from public;
grant execute on function public.get_my_shipit_challenges(text) to authenticated;

-- Timed service-role variants for tests
create or replace function public.dev_get_shipit_home_at(p_at_utc timestamptz, p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_team_name text;
  v_life jsonb;
  v_cruise uuid;
  v_categories jsonb := '[]'::jsonb;
  v_cat public.scavenger_category;
  v_completed integer;
  v_points integer;
  v_overall_completed integer := 0;
  v_overall_points integer := 0;
  v_leaderboard jsonb := '[]'::jsonb;
  v_rank integer := 0;
  v_prev_points integer;
  v_display_rank integer := 0;
  v_row record;
  v_members text[];
begin
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    raise exception 'DEV_ONLY';
  end if;

  select tm.team_id into v_team
  from public.team_memberships tm
  where tm.player_id = p_player_id and tm.active_to is null
  limit 1;
  if v_team is null then
    return jsonb_build_object('ok', false, 'code', 'SHIPIT_TEAM_REQUIRED');
  end if;
  select name into v_team_name from public.teams where id = v_team;

  v_life := public.shipit_lifecycle_at(p_at_utc);
  if (v_life->>'status') = 'unconfigured' then
    return jsonb_build_object('ok', true, 'lifecycle', v_life, 'team', jsonb_build_object('id', v_team, 'name', v_team_name));
  end if;
  v_cruise := (v_life->>'cruise_config_id')::uuid;

  foreach v_cat in array array[
    'classic_ship_landmarks'::public.scavenger_category,
    'food_and_drink_discoveries'::public.scavenger_category,
    'quirky_details_and_hidden_artifacts'::public.scavenger_category,
    'interactive_crew_and_activity'::public.scavenger_category,
    'creative_team_and_action_shots'::public.scavenger_category
  ]
  loop
    select count(*)::integer, coalesce(sum(sc.points), 0)::integer
    into v_completed, v_points
    from public.scavenger_completions sc
    join public.scavenger_challenges ch on ch.id = sc.challenge_id
    where sc.team_id = v_team
      and sc.status = 'active'
      and sc.cruise_config_id = v_cruise
      and ch.category = v_cat
      and ch.enabled is true;
    v_overall_completed := v_overall_completed + v_completed;
    v_overall_points := v_overall_points + v_points;
    v_categories := v_categories || jsonb_build_array(jsonb_build_object(
      'category', v_cat,
      'label', public.scavenger_category_label(v_cat),
      'completed', v_completed,
      'total', 10,
      'points', v_points
    ));
  end loop;

  for v_row in select * from public.shipit_team_score_rows(v_cruise)
  loop
    v_rank := v_rank + 1;
    if v_prev_points is null or v_row.points is distinct from v_prev_points then
      v_display_rank := v_rank;
    end if;
    v_prev_points := v_row.points;
    select coalesce(array_agg(p.display_name order by lower(p.display_name), p.id), '{}'::text[])
    into v_members
    from public.team_memberships tm
    join public.players p on p.id = tm.player_id
    where tm.team_id = v_row.team_id and tm.active_to is null and p.active is true;

    v_leaderboard := v_leaderboard || jsonb_build_array(jsonb_build_object(
      'team_id', v_row.team_id,
      'team_name', v_row.team_name,
      'members', to_jsonb(v_members),
      'completed', v_row.completed_count,
      'points', v_row.points,
      'rank', v_display_rank
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'lifecycle', v_life,
    'team', jsonb_build_object('id', v_team, 'name', v_team_name, 'completed', v_overall_completed, 'points', v_overall_points),
    'overall', jsonb_build_object('completed', v_overall_completed, 'total', 50, 'points', v_overall_points),
    'categories', v_categories,
    'leaderboard', v_leaderboard
  );
end;
$$;

revoke all on function public.dev_get_shipit_home_at(timestamptz, uuid) from public;
grant execute on function public.dev_get_shipit_home_at(timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Development-only fixture completions (never a player write path)
-- ---------------------------------------------------------------------------
create or replace function public.dev_fixture_scavenger_completion(
  p_team_id uuid,
  p_challenge_canonical_key text,
  p_submitting_player_id uuid,
  p_completed_at_utc timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.cruise_config%rowtype;
  v_challenge public.scavenger_challenges%rowtype;
  v_submission_id uuid;
  v_completion_id uuid;
  v_key uuid := gen_random_uuid();
begin
  if not exists (
    select 1 from public.cruise_config where is_active and label = 'development-only'
  ) then
    return jsonb_build_object('ok', false, 'code', 'DEV_ONLY');
  end if;

  select * into v_config from public.cruise_config where is_active limit 1;
  select * into v_challenge
  from public.scavenger_challenges
  where canonical_key = p_challenge_canonical_key and enabled is true;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'CHALLENGE_NOT_FOUND');
  end if;

  if exists (
    select 1 from public.scavenger_completions
    where team_id = p_team_id and challenge_id = v_challenge.id and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_COMPLETED');
  end if;

  insert into public.submissions (
    author_player_id, idempotency_key, game, kind, team_id, cruise_config_id,
    received_at_utc, ship_day, status, caption, photo_storage_key,
    request_payload_hash, request_payload_json, result_json, display_snapshot_json
  ) values (
    p_submitting_player_id,
    v_key,
    'shipit',
    'scavenger_dev_fixture',
    p_team_id,
    v_config.id,
    p_completed_at_utc,
    greatest(1, least(7, coalesce(
      public.cruise_day_for_ship_date(
        v_config.day1_ship_date,
        public.utc_to_ship_local(
          p_completed_at_utc,
          public.clock_offset_at(v_config.id, v_config.base_ship_offset_minutes, p_completed_at_utc)
        )::date,
        v_config.final_day
      ), 1))),
    'accepted',
    null,
    'development-only/fixture-photo',
    'dev-fixture',
    jsonb_build_object(
      'source', 'development-only',
      'challenge_canonical_key', p_challenge_canonical_key
    ),
    jsonb_build_object('ok', true, 'source', 'development-only'),
    jsonb_build_object(
      'challenge_title', v_challenge.title,
      'team_id', p_team_id,
      'points', v_challenge.points
    )
  )
  returning id into v_submission_id;

  insert into public.scavenger_completions (
    team_id, challenge_id, submitting_player_id, submission_id, cruise_config_id,
    points, status, challenge_canonical_key, category, title_snapshot,
    instructions_snapshot, completed_at_utc
  ) values (
    p_team_id, v_challenge.id, p_submitting_player_id, v_submission_id, v_config.id,
    v_challenge.points, 'active', v_challenge.canonical_key, v_challenge.category,
    v_challenge.title, v_challenge.instructions, p_completed_at_utc
  )
  returning id into v_completion_id;

  return jsonb_build_object(
    'ok', true,
    'completion_id', v_completion_id,
    'submission_id', v_submission_id,
    'points', v_challenge.points,
    'source', 'development-only'
  );
end;
$$;

revoke all on function public.dev_fixture_scavenger_completion(uuid, text, uuid, timestamptz) from public;
grant execute on function public.dev_fixture_scavenger_completion(uuid, text, uuid, timestamptz) to service_role;

comment on function public.get_my_shipit_home() is
  'Ship It! Home: category progress, overall totals, and team leaderboard for the caller''s membership team.';
comment on function public.get_my_shipit_challenges(text) is
  'Ship It! challenge list with team completion flags. Optional category filter. No player submit in Phase 4A.';
comment on function public.dev_fixture_scavenger_completion(uuid, text, uuid, timestamptz) is
  'Development-only service-role fixture completions using labeled fixture photo key — not a player write path.';
