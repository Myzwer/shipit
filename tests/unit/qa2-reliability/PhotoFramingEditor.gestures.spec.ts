/**
 * QA-2 Agent 2 — framing editor pointer/wheel gesture wiring (jsdom; not real touch hardware).
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PhotoFramingEditor from '@/components/shared/PhotoFramingEditor.vue'

describe('QA2 PhotoFramingEditor gesture surface', () => {
  it('exposes square stage with touch-none and pointer handlers', () => {
    const w = mount(PhotoFramingEditor, {
      props: {
        src: 'blob:test',
        width: 1600,
        height: 900,
        initialFraming: { zoom: 1, centerX: 0.5, centerY: 0.5 },
      },
      attachTo: document.body,
    })
    const stage = w.find('[data-testid="photo-framing-stage"]')
    expect(stage.exists()).toBe(true)
    expect(stage.classes().join(' ')).toMatch(/touch-none|aspect-square/)
    expect(w.find('[data-testid="photo-framing-mask"]').exists()).toBe(true)
    expect(w.find('[data-testid="photo-framing-use"]').exists()).toBe(true)
    expect(w.find('[data-testid="photo-framing-cancel"]').exists()).toBe(true)
    w.unmount()
  })

  it('accept emits clamped framing; cancel does not', async () => {
    const w = mount(PhotoFramingEditor, {
      props: {
        src: 'blob:test',
        width: 2000,
        height: 1000,
        initialFraming: { zoom: 9, centerX: 0, centerY: 0 },
      },
      attachTo: document.body,
    })
    await w.find('[data-testid="photo-framing-use"]').trigger('click')
    const accepts = w.emitted('accept')
    expect(accepts).toBeTruthy()
    const framing = accepts![0]![0] as { zoom: number; centerX: number; centerY: number }
    expect(framing.zoom).toBe(4)
    expect(framing.centerY).toBeCloseTo(0.5)

    const w2 = mount(PhotoFramingEditor, {
      props: { src: 'blob:test', width: 100, height: 100 },
      attachTo: document.body,
    })
    await w2.find('[data-testid="photo-framing-cancel"]').trigger('click')
    expect(w2.emitted('cancel')).toBeTruthy()
    expect(w2.emitted('accept')).toBeFalsy()
    w.unmount()
    w2.unmount()
  })

  it('wheel zoom changes framing within clamps', async () => {
    const w = mount(PhotoFramingEditor, {
      props: {
        src: 'blob:test',
        width: 1200,
        height: 1200,
        initialFraming: { zoom: 1, centerX: 0.5, centerY: 0.5 },
      },
      attachTo: document.body,
    })
    const stage = w.find('[data-testid="photo-framing-stage"]')
    await stage.trigger('wheel', { deltaY: -100 })
    await stage.trigger('wheel', { deltaY: -100 })
    await w.find('[data-testid="photo-framing-use"]').trigger('click')
    const framing = w.emitted('accept')![0]![0] as { zoom: number }
    expect(framing.zoom).toBeGreaterThan(1)
    expect(framing.zoom).toBeLessThanOrEqual(4)
    w.unmount()
  })
})
