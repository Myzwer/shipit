import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PhotoStep from '@/features/drinkit/log/PhotoStep.vue'
import { copy } from '@/ui/copy'

vi.mock('@/components/shared/PhotoCapture.vue', () => ({
  default: {
    name: 'PhotoCapture',
    props: ['game', 'purpose', 'required', 'autoStage'],
    emits: ['staged', 'localReady', 'busy'],
    template: '<div data-testid="photo-capture-stub" />',
  },
}))

describe('PhotoStep', () => {
  it('wires shared capture and keeps optional skip / caption', async () => {
    const w = mount(PhotoStep, {
      props: { caption: 'Hello' },
    })
    expect(w.find('[data-testid="photo-capture-stub"]').exists()).toBe(true)
    expect(w.find('[data-testid="photo-unavailable"]').exists()).toBe(false)
    expect(w.find('[data-testid="photo-optional-skip"]').exists()).toBe(true)
    expect(w.find('[data-testid="caption-input"]').element).toHaveProperty('value', 'Hello')
    expect(w.find('[data-testid="photo-continue"]').text()).toBe(copy.wizard.photoContinue)

    await w.find('[data-testid="photo-continue"]').trigger('click')
    expect(w.emitted('continue')).toBeTruthy()
  })
})
