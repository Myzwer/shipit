import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { copy } from '@/ui/copy'

const fetchAdminClockDiagnostics = vi.fn()
const previewManualDelta = vi.fn()
const applyManualCorrection = vi.fn()
const saveShipClockPlan = vi.fn()
const reconcileManualCorrection = vi.fn()

vi.mock('@/lib/adminClock', () => ({
  fetchAdminClockDiagnostics: (...args: unknown[]) => fetchAdminClockDiagnostics(...args),
  previewManualDelta: (...args: unknown[]) => previewManualDelta(...args),
  applyManualCorrection: (...args: unknown[]) => applyManualCorrection(...args),
  saveShipClockPlan: (...args: unknown[]) => saveShipClockPlan(...args),
  reconcileManualCorrection: (...args: unknown[]) => reconcileManualCorrection(...args),
}))

import ShipClockSection from '@/features/admin/ShipClockSection.vue'

const baseDiagnostics = {
  actor_id: 'admin',
  state: {
    configured: true,
    at_utc: '2026-11-05T12:00:00Z',
    offset_minutes: -240,
    ship_local: '2099-01-03T08:00:00',
    ship_date: '2099-01-03',
    cruise_day: null,
    lifecycle: 'pre_cruise',
    games: {
      drinkit: { status: 'pre_cruise', paused: false, finalized_at_utc: null },
      shipit: { status: 'pre_cruise', paused: false, finalized_at_utc: null },
    },
    config_label: 'development-only',
  },
  plan: [1, 2, 3, 4, 5, 6, 7].map((day_number) => ({
    day_number,
    delta_minutes: 0,
    enabled: true,
  })),
  events: [],
}

describe('ShipClockSection', () => {
  beforeEach(() => {
    fetchAdminClockDiagnostics.mockReset()
    previewManualDelta.mockReset()
    applyManualCorrection.mockReset()
    saveShipClockPlan.mockReset()
    reconcileManualCorrection.mockReset()
    fetchAdminClockDiagnostics.mockResolvedValue(baseDiagnostics)
  })

  it('renders Current Ship Time and approved control labels', async () => {
    const wrapper = mount(ShipClockSection)
    await flushPromises()
    expect(wrapper.text()).toContain(copy.admin.clockSection)
    expect(wrapper.text()).toContain(copy.admin.currentShipTime)
    expect(wrapper.text()).toContain(copy.admin.minus1Hour)
    expect(wrapper.text()).toContain(copy.admin.plus1Hour)
    expect(wrapper.text()).toContain(copy.admin.setShipTime)
    expect(wrapper.text()).toContain(copy.admin.plannedHeading)
    expect(wrapper.text()).toContain(copy.admin.planDisabled)
    expect(wrapper.get('[data-testid="clock-overview"]').text()).toContain('8:00 AM')
  })

  it('shows preview confirmation before applying +1 Hour', async () => {
    previewManualDelta.mockResolvedValue({
      before: baseDiagnostics.state,
      after_offset_minutes: -180,
      after_ship_local: '2099-01-03T09:00:00',
      delta_minutes: 60,
    })
    applyManualCorrection.mockResolvedValue({
      status: 'ok',
      after: { ...baseDiagnostics.state, offset_minutes: -180, ship_local: '2099-01-03T09:00:00' },
      diagnostics: {
        ...baseDiagnostics,
        state: { ...baseDiagnostics.state, offset_minutes: -180, ship_local: '2099-01-03T09:00:00' },
      },
      clientRequestId: 'req',
    })

    const wrapper = mount(ShipClockSection)
    await flushPromises()
    await wrapper.get('[data-testid="plus-1h"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="confirm-dialog"]').text()).toContain(
      copy.admin.confirmAdjustTitle,
    )
    expect(wrapper.text()).toContain(copy.admin.confirmAdjustBody)
    await wrapper.get('[data-testid="confirm-apply"]').trigger('click')
    await flushPromises()
    expect(applyManualCorrection).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="clock-feedback"]').text()).toContain(copy.admin.successApplied)
  })

  it('blocks re-apply controls on UNKNOWN and offers refresh only', async () => {
    previewManualDelta.mockResolvedValue({
      before: baseDiagnostics.state,
      after_offset_minutes: -180,
      after_ship_local: '2099-01-03T09:00:00',
      delta_minutes: 60,
    })
    applyManualCorrection.mockResolvedValue({
      status: 'unknown',
      message: copy.admin.unknownBody,
      intent: { kind: 'plus_1h', deltaMinutes: 60 },
      before: baseDiagnostics.state,
      clientRequestId: 'unknown-req',
      diagnostics: baseDiagnostics,
    })
    reconcileManualCorrection.mockResolvedValue({
      status: 'ok',
      after: { ...baseDiagnostics.state, offset_minutes: -180 },
      diagnostics: {
        ...baseDiagnostics,
        state: { ...baseDiagnostics.state, offset_minutes: -180 },
      },
      clientRequestId: 'unknown-req',
    })

    const wrapper = mount(ShipClockSection)
    await flushPromises()
    await wrapper.get('[data-testid="plus-1h"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="confirm-apply"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="clock-feedback"]').text()).toContain(copy.admin.unknownTitle)
    expect(wrapper.get('[data-testid="plus-1h"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain(copy.admin.failureTitle)

    await wrapper.get('[data-testid="refresh-unknown"]').trigger('click')
    await flushPromises()
    expect(reconcileManualCorrection).toHaveBeenCalledTimes(1)
    expect(applyManualCorrection).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="clock-feedback"]').text()).toContain(copy.admin.successApplied)
  })
})
