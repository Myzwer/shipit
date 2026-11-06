import { supabase } from '@/lib/supabase'
import type { GameId } from '@/types/game'
import type {
  GalleryCursor,
  GalleryFeedPage,
  GalleryFilter,
  GalleryReactionEmoji,
  GalleryReactionCounts,
  GalleryUnreadState,
} from '@/types/gallery'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

async function rpc(fn: string, args?: Record<string, unknown>) {
  const client = requireClient()
  return client.rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

export async function listGalleryFeed(input: {
  game: GameId
  filter: GalleryFilter
  limit?: number
  before?: GalleryCursor | null
}): Promise<GalleryFeedPage> {
  const { data, error } = await rpc('list_gallery_feed', {
    p_game: input.game,
    p_filter: input.filter,
    p_limit: input.limit ?? 5,
    p_before_created_at: input.before?.created_at_utc ?? null,
    p_before_id: input.before?.id ?? null,
  })
  if (error) throw error
  const row = data as GalleryFeedPage
  if (!row?.ok) {
    throw new Error(row?.message ?? row?.code ?? 'Gallery unavailable')
  }
  return {
    ...row,
    events: Array.isArray(row.events) ? row.events : [],
  }
}

export async function setGalleryReaction(
  eventId: string,
  emoji: GalleryReactionEmoji | null,
): Promise<{ my_reaction: GalleryReactionEmoji | null; reactions: GalleryReactionCounts }> {
  const { data, error } = await rpc('set_gallery_reaction', {
    p_event_id: eventId,
    p_emoji: emoji,
  })
  if (error) throw error
  const row = data as {
    ok?: boolean
    my_reaction?: GalleryReactionEmoji | null
    reactions?: GalleryReactionCounts
    code?: string
    message?: string
  }
  if (!row?.ok) throw new Error(row?.message ?? row?.code ?? 'Reaction failed')
  return {
    my_reaction: row.my_reaction ?? null,
    reactions: row.reactions ?? { heart: 0, laugh: 0, hang_loose: 0 },
  }
}

export async function fetchGalleryUnread(game: GameId): Promise<GalleryUnreadState> {
  const { data, error } = await rpc('get_gallery_unread', { p_game: game })
  if (error) throw error
  return data as GalleryUnreadState
}

export async function markGallerySeen(game: GameId, cursor: GalleryCursor): Promise<void> {
  const { data, error } = await rpc('mark_gallery_seen', {
    p_game: game,
    p_event_id: cursor.id,
    p_created_at_utc: cursor.created_at_utc,
  })
  if (error) throw error
  const row = data as { ok?: boolean; code?: string }
  if (!row?.ok) throw new Error(row?.code ?? 'Could not mark seen')
}

export async function fetchGalleryPhotoSignedUrl(
  game: GameId,
  photoId: string,
): Promise<string | null> {
  const client = requireClient()
  const rpcName =
    game === 'drinkit' ? 'create_drinkit_photo_signed_url' : 'create_shipit_photo_signed_url'
  const { data, error } = await rpc(rpcName, {
    p_photo_id: photoId,
    p_expires_seconds: 3600,
  })
  if (error) return null
  const row = data as { ok?: boolean; bucket?: string; storage_path?: string; expires_in?: number }
  if (!row?.ok || !row.bucket || !row.storage_path) return null
  const signed = await client.storage
    .from(row.bucket)
    .createSignedUrl(row.storage_path, row.expires_in ?? 3600)
  return signed.data?.signedUrl ?? null
}
