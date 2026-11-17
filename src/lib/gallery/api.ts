import { supabase } from '@/lib/supabase'
import {
  normalizeReactionAuthorGroups,
  type GalleryReactionAuthorsResult,
} from '@/lib/gallery/reactionAuthors'
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
  if (!eventId) {
    throw Object.assign(new Error('EVENT_REQUIRED'), { code: 'EVENT_REQUIRED' })
  }
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
  if (!row?.ok) {
    throw Object.assign(new Error(row?.message ?? row?.code ?? 'Reaction failed'), {
      code: row?.code ?? 'REACTION_FAILED',
    })
  }
  return {
    my_reaction: row.my_reaction ?? null,
    reactions: row.reactions ?? { heart: 0, laugh: 0, hang_loose: 0 },
  }
}

/**
 * Fetch reaction authors for one gallery post (on modal open only).
 * Server enforces auth + same-game membership; returns display names only.
 */
export async function fetchGalleryReactionAuthors(
  eventId: string,
): Promise<GalleryReactionAuthorsResult> {
  if (!eventId) {
    throw Object.assign(new Error('EVENT_REQUIRED'), { code: 'EVENT_REQUIRED' })
  }
  const { data, error } = await rpc('get_gallery_reaction_authors', {
    p_event_id: eventId,
  })
  if (error) throw error
  const row = data as {
    ok?: boolean
    event_id?: string
    game?: string
    groups?: unknown
    code?: string
    message?: string
  }
  if (!row?.ok) {
    throw Object.assign(new Error(row?.message ?? row?.code ?? 'Reaction authors unavailable'), {
      code: row?.code ?? 'REACTION_AUTHORS_FAILED',
    })
  }
  return {
    ok: true,
    event_id: row.event_id ?? eventId,
    game: row.game,
    groups: normalizeReactionAuthorGroups(row.groups),
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

export type GallerySignedUrlResult =
  | { ok: true; url: string; expiresIn: number }
  | { ok: false; permanent: boolean; code: string | null }

/**
 * Authorize + mint a Storage signed URL for a gallery-bound photo.
 * Never logs the URL. Callers must not print private image URLs into evidence.
 */
export async function requestGalleryPhotoSignedUrl(
  game: GameId,
  photoId: string,
  options?: { expiresSeconds?: number },
): Promise<GallerySignedUrlResult> {
  const client = requireClient()
  const rpcName =
    game === 'drinkit' ? 'create_drinkit_photo_signed_url' : 'create_shipit_photo_signed_url'
  const expiresSeconds = options?.expiresSeconds ?? 3600
  const { data, error } = await rpc(rpcName, {
    p_photo_id: photoId,
    // Default one-hour TTL; callers may pass a shorter window for tests only.
    p_expires_seconds: options?.expiresSeconds ?? 3600,
  })
  if (error) {
    const msg = error.message ?? ''
    const permanent = /NOT_AUTHENTICATED|JWT|permission|42501/i.test(msg)
    return { ok: false, permanent, code: permanent ? 'NOT_AUTHENTICATED' : 'NETWORK' }
  }
  const row = data as {
    ok?: boolean
    code?: string
    bucket?: string
    storage_path?: string
    expires_in?: number
  }
  if (!row?.ok || !row.bucket || !row.storage_path) {
    return { ok: false, permanent: true, code: row?.code ?? 'UNAVAILABLE' }
  }
  const ttl = row.expires_in ?? expiresSeconds
  const signed = await client.storage.from(row.bucket).createSignedUrl(row.storage_path, ttl)
  if (signed.error || !signed.data?.signedUrl) {
    return { ok: false, permanent: false, code: 'SIGN_FAILED' }
  }
  return { ok: true, url: signed.data.signedUrl, expiresIn: ttl }
}

export async function fetchGalleryPhotoSignedUrl(
  game: GameId,
  photoId: string,
  options?: { expiresSeconds?: number },
): Promise<string | null> {
  const result = await requestGalleryPhotoSignedUrl(game, photoId, options)
  return result.ok ? result.url : null
}
