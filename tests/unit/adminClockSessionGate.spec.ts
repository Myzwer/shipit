/**
 * Admin Ship Clock RPCs must not run as anon.
 * Missing session → clear auth error (not opaque Postgres permission denied).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const getSession = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
  },
}))

describe('adminClock session gate', () => {
  beforeEach(() => {
    rpc.mockReset()
    getSession.mockReset()
    vi.resetModules()
  })

  it('refuses diagnostics when no access token is present', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { fetchAdminClockDiagnostics, AdminClockError } = await import('@/lib/adminClock')
    await expect(fetchAdminClockDiagnostics()).rejects.toBeInstanceOf(AdminClockError)
    await expect(fetchAdminClockDiagnostics()).rejects.toMatchObject({ kind: 'auth' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls rpc only after a signed-in session is confirmed', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    })
    rpc.mockResolvedValue({
      data: { actor_id: 'a', state: { configured: false }, plan: [], events: [] },
      error: null,
    })
    const { fetchAdminClockDiagnostics } = await import('@/lib/adminClock')
    const diag = await fetchAdminClockDiagnostics()
    expect(getSession).toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('admin_get_clock_diagnostics', undefined)
    expect(diag.state.configured).toBe(false)
  })
})
