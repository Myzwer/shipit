-- Phase 4B2: extend gallery_event_kind for Ship It! scavenger posts.
-- Separate migration so the new enum value is committed before use.

alter type public.gallery_event_kind add value if not exists 'scavenger';
