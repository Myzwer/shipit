/**
 * Map Supabase Auth / network failures to approved login copy keys.
 */
export type LoginFailureKind =
  | 'invalid_credentials'
  | 'network'
  | 'missing_name'
  | 'missing_password'
  | 'unknown'

export function classifyLoginError(error: unknown): LoginFailureKind {
  if (!error || typeof error !== 'object') return 'unknown'
  const err = error as { message?: string; status?: number; name?: string }

  const message = (err.message ?? '').toLowerCase()
  if (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('fetch') ||
    err.name === 'TypeError'
  ) {
    return 'network'
  }

  if (
    message.includes('invalid login') ||
    message.includes('invalid credentials') ||
    message.includes("didn't match") ||
    message.includes('email logins are disabled') ||
    err.status === 400
  ) {
    return 'invalid_credentials'
  }

  return 'unknown'
}
