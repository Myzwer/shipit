import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import ShipItHomeView from '@/features/shipit/ShipItHomeView.vue'
import type { ShipItHomePayload } from '@/types/shipit'

const fetchShipItHome = vi.fn()

vi.mock('@/lib/shipit/api', () => ({
  fetchShipItHome: (...args: unknown[]) => fetchShipItHome(...args),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}))

vi.mock('@/stores/session', () => ({
  useSessionStore: () => ({
    isDualGame: false,
    teamName: 'Demo Team Alpha',
    setCurrentGame: vi.fn(),
    init: vi.fn(),
  }),
}))

function homePayload(): ShipItHomePayload {
  return {
    ok: true,
    lifecycle: {
      ok: true,
      status: 'active',
      read_only: false,
      accepting_submissions: true,
    },
    team: { id: 't1', name: 'Demo Team Alpha', completed: 1, points: 100 },
    overall: { completed: 1, total: 50, points: 100 },
    categories: [
      {
        category: 'classic_ship_landmarks',
        label: 'Classic Ship Landmarks',
        completed: 1,
        total: 10,
        points: 100,
        sort_order: 1,
      },
      {
        category: 'food_and_drink_discoveries',
        label: 'Food & Drink Discoveries',
        completed: 0,
        total: 10,
        points: 0,
        sort_order: 2,
      },
      {
        category: 'quirky_details_and_hidden_artifacts',
        label: 'Quirky Details & Hidden Artifacts',
        completed: 0,
        total: 10,
        points: 0,
        sort_order: 3,
      },
      {
        category: 'interactive_crew_and_activity',
        label: 'Interactive Crew & Activity Challenges',
        completed: 0,
        total: 10,
        points: 0,
        sort_order: 4,
      },
      {
        category: 'creative_team_and_action_shots',
        label: 'Creative Team & Action Shots',
        completed: 0,
        total: 10,
        points: 0,
        sort_order: 5,
      },
    ],
    leaderboard: [
      {
        team_id: 't1',
        team_name: 'Demo Team Alpha',
        members: ['Demo Both Games', 'Demo Ship Only'],
        completed: 1,
        points: 100,
        rank: 1,
        is_my_team: true,
      },
      {
        team_id: 't2',
        team_name: 'Demo Team Bravo',
        members: ['Demo Organizer'],
        completed: 0,
        points: 0,
        rank: 2,
      },
    ],
  }
}

describe('ShipItHomeView', () => {
  beforeEach(() => {
    fetchShipItHome.mockReset()
    fetchShipItHome.mockResolvedValue(homePayload())
  })

  it('renders five category rows, overall, and leaderboard; category opens list', async () => {
    setActivePinia(createPinia())
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/shipit', name: 'shipit-home', component: ShipItHomeView },
        { path: '/shipit/challenges', name: 'shipit-challenges', component: { template: '<div />' } },
      ],
    })
    await router.push('/shipit')
    await router.isReady()
    const push = vi.spyOn(router, 'push')

    const wrapper = mount(ShipItHomeView, {
      global: {
        plugins: [router],
        stubs: {
          GameShell: { template: '<div><slot /></div>' },
          AccountSection: true,
          LeaderboardList: {
            props: ['rows', 'showMembers'],
            template:
              '<div data-testid="lb">{{ rows.map(r => r.name + ":" + r.points).join("|") }}</div>',
          },
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="shipit-progress"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="shipit-progress-classic_ship_landmarks"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="shipit-progress-all"]').exists()).toBe(true)
    expect(wrapper.text()).toContain("Demo Team Alpha's Progress")
    expect(wrapper.text()).toContain('Classic Ship Landmarks — 1/10')
    expect(wrapper.text()).toContain('All Challenges — 1/50')
    expect(wrapper.get('[data-testid="lb"]').text()).toContain('Demo Team Alpha:100')

    await wrapper.get('[data-testid="shipit-progress-classic_ship_landmarks"]').trigger('click')
    expect(push).toHaveBeenCalledWith({
      name: 'shipit-challenges',
      query: { category: 'classic_ship_landmarks' },
    })
  })
})
