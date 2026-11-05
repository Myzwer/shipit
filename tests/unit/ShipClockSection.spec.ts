import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { copy } from '@/ui/copy'
import {
  PENDING_CLOCK_CORRECTION_KEY,
  clearPendingClockCorrection,
  readPendingClockCorrection,
} from '@/lib/pendingClockCorrection'

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
  newClientRequestId: () => '11111111-1111-4111-8111-111111111111',
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

describe('ShipClockSection unknown safety', () => {
  beforeEach(() => {
    localStorage.clear()
    clearPendingClockCorrection()
    fetchAdminClockDiagnostics.mockReset()
    previewManualDelta.mockReset()
    applyManualCorrection.mockReset()
    saveShipClockPlan.mockReset()
    reconcileManualCorrection.mockReset()
    fetchAdminClockDiagnostics.mockResolvedValue(baseDiagnostics)
    reconcileManualCorrection.mockResolvedValue({
      status: 'unknown',
      message: copy.admin.unknownBody,
      intent: { kind: 'plus_1h', deltaMinutes: 60 },
      before: baseDiagnostics.state,
      clientRequestId: 'persisted-req',
      diagnostics: baseDiagnostics,
    })
  })

  it('renders Current Ship Time and approved control labels', async () => {
    const wrapper = mount(ShipClockSection)
    await flushPromises()
    expect(wrapper.text()).toContain(copy.admin.clockSection)
    expect(wrapper.get('[data-testid="clock-overview"]').text()).toContain('8:00 AM')
  })

  it('UNKNOWN has no dismiss control that unlocks corrections', async () => {
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

    const wrapper = mount(ShipClockSection)
    await flushPromises()
    await wrapper.get('[data-testid="plus-1h"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="confirm-apply"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="dismiss-unknown"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="plus-1h"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="retry-same-change"]').exists()).toBe(true)
    expect(readPendingClockCorrection()?.clientRequestId).toBeTruthy()
  })

  it('failed reconciliation keeps controls locked', async () => {
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
      clientRequestId: 'unknown-req-2',
      diagnostics: baseDiagnostics,
    })
    reconcileManualCorrection.mockResolvedValue({
      status: 'unknown',
      message: copy.admin.unknownBody,
      intent: { kind: 'plus_1h', deltaMinutes: 60 },
      before: baseDiagnostics.state,
      clientRequestId: 'unknown-req-2',
    })

    const wrapper = mount(ShipClockSection)
    await flushPromises()
    await wrapper.get('[data-testid="plus-1h"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="confirm-apply"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="refresh-unknown"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="plus-1h"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="set-ship-time"]').attributes('disabled')).toBeDefined()
    expect(localStorage.getItem(PENDING_CLOCK_CORRECTION_KEY)).toBeTruthy()
  })

  it('restores pending unknown after remount (navigation/refresh)', async () => {
    localStorage.setItem(
      PENDING_CLOCK_CORRECTION_KEY,
      JSON.stringify({
        version: 1,
        clientRequestId: 'persisted-req',
        intent: { kind: 'minus_1h', deltaMinutes: -60 },
        beforeSnapshot: { at_utc: '2026-01-01T00:00:00Z', offset_minutes: -240 },
        createdAt: new Date().toISOString(),
      }),
    )
    reconcileManualCorrection.mockResolvedValue({
      status: 'unknown',
      message: copy.admin.unknownBody,
      intent: { kind: 'minus_1h', deltaMinutes: -60 },
      before: baseDiagnostics.state,
      clientRequestId: 'persisted-req',
      diagnostics: baseDiagnostics,
    })

    const wrapper = mount(ShipClockSection)
    await flushPromises()

    expect(reconcileManualCorrection).toHaveBeenCalled()
    expect(wrapper.get('[data-testid="clock-feedback"]').text()).toContain(copy.admin.unknownTitle)
    expect(wrapper.get('[data-testid="plus-1h"]').attributes('disabled')).toBeDefined()
  })

  it('successful request-id reconciliation confirms without a new apply', async () => {
    localStorage.setItem(
      PENDING_CLOCK_CORRECTION_KEY,
      JSON.stringify({
        version: 1,
        clientRequestId: 'persisted-ok',
        intent: { kind: 'plus_1h', deltaMinutes: 60 },
        createdAt: new Date().toISOString(),
      }),
    )
    reconcileManualCorrection.mockResolvedValue({
      status: 'ok',
      after: { ...baseDiagnostics.state, offset_minutes: -180 },
      diagnostics: {
        ...baseDiagnostics,
        state: { ...baseDiagnostics.state, offset_minutes: -180 },
      },
      clientRequestId: 'persisted-ok',
    })

    const wrapper = mount(ShipClockSection)
    await flushPromises()

    expect(applyManualCorrection).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="clock-feedback"]').text()).toContain(copy.admin.successApplied)
    expect(readPendingClockCorrection()).toBeNull()
    expect(wrapper.get('[data-testid="plus-1h"]').attributes('disabled')).toBeUndefined()
  })

  it('Set Ship Time unknown follows the same lock and persistence rules', async () => {
    applyManualCorrection.mockResolvedValue({
      status: 'unknown',
      message: copy.admin.unknownBody,
      intent: { kind: 'set_time', targetShipLocal: '2099-01-03T14:00:00' },
      before: baseDiagnostics.state,
      clientRequestId: 'set-time-req',
      diagnostics: baseDiagnostics,
    })

    const wrapper = mount(ShipClockSection)
    await flushPromises()
    await wrapper.get('[data-testid="set-time-input"]').setValue('2099-01-03T14:00')
    await wrapper.get('[data-testid="set-ship-time"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="confirm-apply"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="dismiss-unknown"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="plus-1h"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="set-ship-time"]').attributes('disabled')).toBeDefined()
    expect(readPendingClockCorrection()?.intent.kind).toBe('set_time')
  })

  it('Retry Same Change reuses the pending request id', async () => {
    const reqId = '11111111-1111-4111-8111-111111111111'
    previewManualDelta.mockResolvedValue({
      before: baseDiagnostics.state,
      after_offset_minutes: -180,
      after_ship_local: '2099-01-03T09:00:00',
      delta_minutes: 60,
    })
    applyManualCorrection
      .mockResolvedValueOnce({
        status: 'unknown',
        message: copy.admin.unknownBody,
        intent: { kind: 'plus_1h', deltaMinutes: 60 },
        before: baseDiagnostics.state,
        clientRequestId: reqId,
        diagnostics: baseDiagnostics,
      })
      .mockResolvedValueOnce({
        status: 'ok',
        after: { ...baseDiagnostics.state, offset_minutes: -180 },
        diagnostics: {
          ...baseDiagnostics,
          state: { ...baseDiagnostics.state, offset_minutes: -180 },
        },
        clientRequestId: reqId,
      })

    const wrapper = mount(ShipClockSection)
    await flushPromises()
    await wrapper.get('[data-testid="plus-1h"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="confirm-apply"]').trigger('click')
    await flushPromises()

    const firstId = applyManualCorrection.mock.calls[0][1]?.clientRequestId
    expect(firstId).toBe(reqId)
    await wrapper.get('[data-testid="retry-same-change"]').trigger('click')
    await flushPromises()
    expect(applyManualCorrection.mock.calls[1][1]?.clientRequestId).toBe(firstId)
    expect(readPendingClockCorrection()).toBeNull()
  })
})
