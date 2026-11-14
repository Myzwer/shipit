import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { copy } from '@/ui/copy'

const adminListBarBountyCrews = vi.fn()

vi.mock('@/lib/bounty/barBountyApi', () => ({
  adminListBarBountyCrews: (...args: unknown[]) => adminListBarBountyCrews(...args),
}))

import BarBountyCrewsSection from '@/features/admin/BarBountyCrewsSection.vue'

describe('BarBountyCrewsSection (REP-CRW-001)', () => {
  beforeEach(() => {
    adminListBarBountyCrews.mockReset()
    adminListBarBountyCrews.mockResolvedValue({
      ok: true,
      cruise_day: 1,
      roster_size: 8,
      crews: [
        {
          crew_id: 'c1',
          crew_index: 1,
          size: 4,
          members: [
            { player_id: 'p1', display_name: 'Alex' },
            { player_id: 'p2', display_name: 'Blair' },
          ],
        },
      ],
    })
  })

  it('does not call admin_list on mount (avoids accidental day lock)', async () => {
    const wrapper = mount(BarBountyCrewsSection)
    await flushPromises()
    expect(adminListBarBountyCrews).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="bar-crews-idle"]').text()).toContain(
      copy.admin.barCrewsIdle.slice(0, 24),
    )
  })

  it('requires confirm before the first generate/load', async () => {
    const wrapper = mount(BarBountyCrewsSection)
    await flushPromises()
    await wrapper.get('[data-testid="bar-crews-refresh"]').trigger('click')
    await flushPromises()
    expect(adminListBarBountyCrews).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="bar-crews-confirm"]').exists()).toBe(true)

    await wrapper.get('[data-testid="bar-crews-confirm-apply"]').trigger('click')
    await flushPromises()
    expect(adminListBarBountyCrews).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="bar-crews-day"]').exists()).toBe(true)
  })
})
