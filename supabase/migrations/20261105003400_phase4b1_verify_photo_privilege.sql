-- Phase 4B1 follow-up: verify_staged_photo_for_submit is service-role only.
-- Authenticated clients must not probe photo validity with arbitrary player ids.

revoke all on function public.verify_staged_photo_for_submit(
  uuid, uuid, public.game_id, public.photo_purpose, boolean
) from public, anon, authenticated;

grant execute on function public.verify_staged_photo_for_submit(
  uuid, uuid, public.game_id, public.photo_purpose, boolean
) to service_role;
