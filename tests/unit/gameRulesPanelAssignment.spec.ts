import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GameRulesPanel from '@/features/shared/GameRulesPanel.vue'
import type { ShipItHomePayload } from '@/types/shipit'

const fetchShipItHome = vi.fn()
const sessionState = {
  teamName: 'Team 5' as string | null,
  displayName: 'Josh LastName',
}

vi.mock('@/lib/shipit/api', () => ({
  fetchShipItHome: (...args: unknown[]) => fetchShipItHome(...args),
}))

vi.mock('@/stores/session', () => ({
  useSessionStore: () => sessionState,
}))

function homePayload(): ShipItHomePayload {
  return {
    ok: true,
    lifecycle: {
      ok: true,
      status: 'pre_cruise',
      read_only: true,
      accepting_submissions: false,
    },
    team: { id: 't5', name: 'Team 5' },
    overall: { completed: 0, total: 50, points: 0 },
    categories: [],
    leaderboard: [
      {
        team_id: 't5',
        team_name: 'Team 5',
        members: ['David Forrester', 'Josh LastName', 'Judah Forrester'],
        completed: 0,
        points: 0,
        rank: 1,
        is_my_team: true,
      },
    ],
  }
}

describe('GameRulesPanel Ship It! assignment', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchShipItHome.mockReset()
    sessionState.teamName = 'Team 5'
    sessionState.displayName = 'Josh LastName'
    fetchShipItHome.mockResolvedValue(homePayload())
  })

  it('renders team and crew below intro and above rules nav', async () => {
    const wrapper = mount(GameRulesPanel, { props: { game: 'shipit' } })
    await flushPromises()

    const assignment = wrapper.get('[data-testid="shipit-assignment"]')
    expect(assignment.get('[data-testid="shipit-assignment-team"]').text()).toBe('Team 5')
    expect(assignment.get('[data-testid="shipit-assignment-crew"]').text()).toBe(
      'David Forrester, Judah Forrester',
    )

    const html = wrapper.html()
    const introIdx = html.indexOf('ultimate cruise scavenger hunt')
    const assignIdx = html.indexOf('data-testid="shipit-assignment"')
    const navIdx = html.indexOf('data-testid="rules-nav"')
    expect(introIdx).toBeGreaterThan(-1)
    expect(assignIdx).toBeGreaterThan(introIdx)
    expect(navIdx).toBeGreaterThan(assignIdx)
  })

  it('omits the assignment section when the player has no Ship It! team', async () => {
    sessionState.teamName = null
    const wrapper = mount(GameRulesPanel, { props: { game: 'shipit' } })
    await flushPromises()
    expect(wrapper.find('[data-testid="shipit-assignment"]').exists()).toBe(false)
    expect(fetchShipItHome).not.toHaveBeenCalled()
  })

  it('does not render assignment on Drink It! rules', async () => {
    const wrapper = mount(GameRulesPanel, { props: { game: 'drinkit' } })
    await flushPromises()
    expect(wrapper.find('[data-testid="shipit-assignment"]').exists()).toBe(false)
    expect(fetchShipItHome).not.toHaveBeenCalled()
  })
})
