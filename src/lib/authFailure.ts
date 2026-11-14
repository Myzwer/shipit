/**
 * Detect auth/player-mapping failures from Supabase RPC / PostgREST errors.
 * A valid JWT can still fail current_player_id() after a local seed/reset.
 */
export function isNotAuthenticatedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as {
    message?: string
    code?: string | number
    status?: number
    details?: string
    hint?: string
  }
  if (err.status === 401) return true
  const blob = [err.message, err.code, err.details, err.hint]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
  return (
    blob.includes('NOT_AUTHENTICATED') ||
    blob.includes('JWT EXPIRED') ||
    blob.includes('INVALID JWT')
  )
}
