import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import ChallengeListView from '@/features/shipit/ChallengeListView.vue'
import type { ShipItChallengesPayload } from '@/types/shipit'

const fetchShipItChallenges = vi.fn()

vi.mock('@/lib/shipit/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shipit/api')>('@/lib/shipit/api')
  return {
    ...actual,
    fetchShipItChallenges: (...args: unknown[]) => fetchShipItChallenges(...args),
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}))

vi.mock('@/stores/session', () => ({
  useSessionStore: () => ({
    isDualGame: false,
    setCurrentGame: vi.fn(),
    init: vi.fn(),
  }),
}))

function payload(partial?: Partial<ShipItChallengesPayload>): ShipItChallengesPayload {
  return {
    ok: true,
    lifecycle: {
      ok: true,
      status: 'active',
      read_only: false,
      accepting_submissions: true,
    },
    team: { id: 't1', name: 'Demo Team Alpha' },
    filter: 'all',
    submission_available: false,
    submission_blocked_reason: 'photo_pipeline_pending',
    sections: [
      {
        category: 'classic_ship_landmarks',
        label: 'Classic Ship Landmarks',
        points_per_challenge: 100,
        completed: 1,
        total: 10,
        points: 100,
        challenges: [
          {
            id: '1',
            canonical_key: 'the-piazza-grandeur',
            category: 'classic_ship_landmarks',
            title: '[DEV] The Piazza Grandeur',
            instructions: 'A full team selfie on the sweeping central atrium staircase.',
            points: 100,
            sort_order: 1,
            photo_required: true,
            completed: true,
            actionable: false,
            submission_ready: false,
          },
          {
            id: '2',
            canonical_key: 'movies-under-the-stars',
            category: 'classic_ship_landmarks',
            title: '[DEV] Movies Under the Stars',
            instructions: 'A photo with the massive poolside outdoor movie screen.',
            points: 100,
            sort_order: 2,
            photo_required: true,
            completed: false,
            actionable: true,
            submission_ready: false,
          },
        ],
      },
    ],
    ...partial,
  }
}

async function mountList(query: Record<string, string> = {}) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/shipit/challenges', name: 'shipit-challenges', component: ChallengeListView },
      { path: '/shipit', name: 'shipit-home', component: { template: '<div />' } },
    ],
  })
  await router.push({ name: 'shipit-challenges', query })
  await router.isReady()
  const wrapper = mount(ChallengeListView, {
    global: {
      plugins: [router],
      stubs: {
        GameShell: { template: '<div><slot /></div>' },
        AppIcon: true,
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('ChallengeListView', () => {
  beforeEach(() => {
    fetchShipItChallenges.mockReset()
    fetchShipItChallenges.mockResolvedValue(payload())
  })

  it('renders completed and incomplete card states without fake completion', async () => {
    const wrapper = await mountList()
    const completed = wrapper.get('[data-testid="shipit-challenge-the-piazza-grandeur"]')
    const open = wrapper.get('[data-testid="shipit-challenge-movies-under-the-stars"]')
    expect(completed.attributes('data-completed')).toBe('true')
    expect(open.attributes('data-completed')).toBe('false')
    expect(wrapper.text()).toContain('Classic Ship Landmarks — 1/10')
    expect(wrapper.text()).toContain('100 Points')

    await open.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="shipit-submission-unavailable"]').exists()).toBe(true)
  })

  it('loads with category filter from query', async () => {
    await mountList({ category: 'classic_ship_landmarks' })
    expect(fetchShipItChallenges).toHaveBeenCalledWith('classic_ship_landmarks')
  })
})
