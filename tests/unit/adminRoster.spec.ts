import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const invoke = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}))

import {
  applyPlayerAccess,
  buildCreatePlayerBody,
  createPlayer,
  mapRosterFailCode,
  newRosterRequestId,
  reconcileAuthRequest,
  redactRosterBody,
  resetPassword,
} from '@/lib/adminRoster'
import {
  PENDING_ADMIN_ROSTER_AUTH_KEY,
  readPendingRosterAuth,
  writePendingRosterAuth,
} from '@/lib/pendingAdminRoster'

const REQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

describe('adminRoster helpers', () => {
  beforeEach(() => {
    rpc.mockReset()
    invoke.mockReset()
  })

  it('newRosterRequestId returns a unique uuid-shaped id', () => {
    const a = newRosterRequestId()
    const b = newRosterRequestId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })

  it('maps server codes to client codes', () => {
    expect(mapRosterFailCode('STALE_ROSTER_STATE')).toBe('stale')
    expect(mapRosterFailCode('TEAM_HISTORY_LOCKED')).toBe('team_locked')
    expect(mapRosterFailCode('ADMIN_REQUIRED')).toBe('forbidden')
    expect(mapRosterFailCode('LOGIN_ALIAS_TAKEN')).toBe('name_taken')
    expect(mapRosterFailCode('SOMETHING_ELSE')).toBe('error')
  })

  it('redacted summary never contains the password', () => {
    const body = buildCreatePlayerBody({
      clientRequestId: REQ,
      displayName: '  John LastName ',
      password: 'super-secret-value',
      drinkitEnabled: true,
      shipitEnabled: false,
      teamId: null,
    })
    expect(body.display_name).toBe('John LastName')
    const redacted = redactRosterBody(body)
    expect(JSON.stringify(redacted)).not.toContain('super-secret-value')
    expect(redacted.password).toBe('[redacted]')
  })

  it('pending auth record never persists a password', () => {
    const storage = memoryStorage()
    writePendingRosterAuth(
      {
        kind: 'create_player',
        clientRequestId: REQ,
        displayName: 'John LastName',
        // @ts-expect-error — stray field must be dropped
        password: 'super-secret-value',
      },
      storage,
    )
    expect(storage.getItem(PENDING_ADMIN_ROSTER_AUTH_KEY)).not.toContain('super-secret-value')
    expect(readPendingRosterAuth(storage)?.clientRequestId).toBe(REQ)
  })

  it('access RPC transport loss is unknown, not failed', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    const outcome = await applyPlayerAccess({
      clientRequestId: REQ,
      playerId: 'p1',
      active: true,
      drinkitEnabled: true,
      shipitEnabled: false,
      teamId: null,
      expectedFingerprint: 'fp',
    })
    expect(outcome.status).toBe('unknown')
  })

  it('access RPC stale result is failed/stale', async () => {
    rpc.mockResolvedValue({ data: { ok: false, code: 'STALE_ROSTER_STATE' }, error: null })
    const outcome = await applyPlayerAccess({
      clientRequestId: REQ,
      playerId: 'p1',
      active: true,
      drinkitEnabled: true,
      shipitEnabled: false,
      teamId: null,
      expectedFingerprint: 'fp',
    })
    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') expect(outcome.code).toBe('stale')
  })

  it('reconcile with no ledger row stays unknown', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const outcome = await reconcileAuthRequest(REQ)
    expect(outcome.status).toBe('unknown')
  })

  it('createPlayer maps edge function success and sends password only in body', async () => {
    invoke.mockResolvedValue({ data: { ok: true, player_id: 'p1' }, error: null })
    const outcome = await createPlayer({
      clientRequestId: REQ,
      displayName: 'John LastName',
      password: 'super-secret-value',
      drinkitEnabled: true,
      shipitEnabled: false,
      teamId: null,
    })
    expect(outcome.status).toBe('ok')
    expect(invoke).toHaveBeenCalledWith('admin-roster', {
      body: expect.objectContaining({ action: 'create_player', client_request_id: REQ }),
    })
  })

  it('resetPassword 4xx body is failed; transport loss is unknown', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'non-2xx',
        context: { status: 400, json: async () => ({ ok: false, code: 'PASSWORD_TOO_SHORT' }) },
      },
    })
    const failed = await resetPassword({
      clientRequestId: REQ,
      playerId: 'p1',
      password: 'short',
    })
    expect(failed.status).toBe('failed')

    invoke.mockResolvedValueOnce({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'Failed to fetch' },
    })
    const unknown = await resetPassword({
      clientRequestId: REQ,
      playerId: 'p1',
      password: 'long-enough-password',
    })
    expect(unknown.status).toBe('unknown')
    if (unknown.status === 'unknown') {
      expect(unknown.message).not.toContain('long-enough-password')
    }
  })
})
