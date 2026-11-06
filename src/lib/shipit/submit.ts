import { supabase } from '@/lib/supabase'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

async function rpc(fn: string, args?: Record<string, unknown>) {
  const client = requireClient()
  return client.rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

export interface ScavengerSubmitPayload {
  idempotency_key: string
  challenge_id: string
  photo_id: string
  caption: string | null
}

export interface ScavengerSubmitResult {
  ok: boolean
  code?: string
  message?: string
  submission_id?: string
  completion_id?: string
  gallery_event_id?: string
  awarded_points?: number
  team_id?: string
  team_name?: string
  challenge_id?: string
  challenge_canonical_key?: string
  photo_id?: string
  idempotent_replay?: boolean
  [key: string]: unknown
}

export async function submitScavenger(
  payload: ScavengerSubmitPayload,
): Promise<ScavengerSubmitResult> {
  const { data, error } = await rpc('submit_scavenger', { p_payload: payload })
  if (error) throw error
  return (data ?? { ok: false, code: 'EMPTY' }) as ScavengerSubmitResult
}

export async function fetchShipItSubmission(submissionId: string) {
  const { data, error } = await rpc('get_my_shipit_submission', {
    p_submission_id: submissionId,
  })
  if (error) throw error
  return data as Record<string, unknown> | null
}

/** Authorize then create a short-lived signed URL for a bound team photo. */
export async function fetchShipItPhotoSignedUrl(photoId: string): Promise<string | null> {
  const client = requireClient()
  const { data, error } = await rpc('create_shipit_photo_signed_url', {
    p_photo_id: photoId,
    p_expires_seconds: 3600,
  })
  if (error) throw error
  const body = data as {
    ok?: boolean
    bucket?: string
    storage_path?: string
    expires_in?: number
  } | null
  if (!body?.ok || !body.bucket || !body.storage_path) return null
  const signed = await client.storage
    .from(body.bucket)
    .createSignedUrl(body.storage_path, body.expires_in ?? 3600)
  if (signed.error || !signed.data?.signedUrl) return null
  return signed.data.signedUrl
}
