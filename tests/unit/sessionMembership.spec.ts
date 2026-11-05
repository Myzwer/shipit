import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session'
import type { SessionProfile } from '@/types/database'
import * as supabaseLib from '@/lib/supabase'

function stubProfile(partial: Partial<SessionProfile>): SessionProfile {
  return {
    player_id: 'p1',
    display_name: 'Demo',
    login_alias: 'demo@local',
    is_admin: false,
    games: [],
    team: null,
    ...partial,
  }
}

describe('session membership helpers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('routes single-game members to their home', () => {
    const session = useSessionStore()
    session.profile = stubProfile({
      games: [{ game: 'drinkit', enabled: true }],
    })
    expect(session.homePathForMembership()).toBe('/drinkit')
    expect(session.isDualGame).toBe(false)
  })

  it('routes dual-game members to the chooser', () => {
    const session = useSessionStore()
    session.profile = stubProfile({
      games: [
        { game: 'drinkit', enabled: true },
        { game: 'shipit', enabled: true },
      ],
    })
    expect(session.homePathForMembership()).toBe('/')
    expect(session.isDualGame).toBe(true)
  })

  it('routes no-game members to unavailable', () => {
    const session = useSessionStore()
    session.profile = stubProfile({ games: [] })
    expect(session.homePathForMembership()).toBe('/unavailable')
  })

  it('keeps the prior profile on temporary network failure', async () => {
    const session = useSessionStore()
    const prior = stubProfile({
      display_name: 'Demo Both Games',
      games: [
        { game: 'drinkit', enabled: true },
        { game: 'shipit', enabled: true },
      ],
    })
    session.profile = prior
    session.status = 'authenticated'
    session.authSession = { access_token: 'x' } as never

    vi.spyOn(supabaseLib, 'fetchMySessionProfile').mockRejectedValue(new Error('Failed to fetch'))

    await session.refreshProfile()

    expect(session.profile?.display_name).toBe('Demo Both Games')
    expect(session.profileNetworkError).toBe(true)
    expect(session.status).toBe('authenticated')
  })
})
