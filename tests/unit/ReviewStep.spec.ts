import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ReviewStep from '@/features/drinkit/log/ReviewStep.vue'
import { copy } from '@/ui/copy'

function mountReview(overrides: Record<string, unknown> = {}) {
  return mount(ReviewStep, {
    props: {
      drinkName: 'Beer',
      barName: "Bellini's Cocktail Bar",
      companionNames: [],
      playerName: 'Josh',
      caption: '',
      photoPreviewUrl: null,
      photoPreviewWidth: null,
      photoPreviewHeight: null,
      photoFraming: null,
      photoStaged: false,
      preview: { ok: true, categories: {} },
      previewStatus: 'ready',
      selectedClaims: [],
      submitting: false,
      showIngredientMismatchLink: false,
      ...overrides,
    },
    attachTo: document.body,
  })
}

describe('ReviewStep gallery preview', () => {
  it('shows no-photo placeholder with Add a photo and Add Caption', () => {
    const w = mountReview()
    expect(w.find('[data-testid="review-gallery-preview"]').exists()).toBe(true)
    expect(w.find('[data-testid="review-photo-placeholder"]').exists()).toBe(true)
    expect(w.find('[data-testid="review-add-photo"]').text()).toBe(copy.wizard.addPhotoAction)
    expect(w.find('[data-testid="review-add-caption"]').text()).toBe(copy.wizard.addCaptionAction)
    expect(w.find('[data-testid="review-edit-photo"]').exists()).toBe(false)
    w.unmount()
  })

  it('renders framed photo preview and edit chips when photo is present', async () => {
    const w = mountReview({
      caption: 'Hello deck',
      photoPreviewUrl: 'blob:mock',
      photoPreviewWidth: 1200,
      photoPreviewHeight: 675,
      photoFraming: { zoom: 1.2, centerX: 0.4, centerY: 0.5 },
      photoStaged: true,
    })
    expect(w.find('[data-testid="review-photo-image"]').exists()).toBe(true)
    expect(w.find('[data-testid="review-caption"]').text()).toBe('Hello deck')
    expect(w.find('[data-testid="review-preview-player"]').text()).toBe('Josh')
    expect(w.find('[data-testid="review-edit-photo"]').attributes('aria-label')).toBe(
      copy.wizard.editPhotoFraming,
    )
    expect(w.find('[data-testid="review-edit-caption"]').attributes('aria-label')).toBe(
      copy.wizard.editCaption,
    )

    await w.find('[data-testid="review-edit-caption"]').trigger('click')
    expect(w.emitted('editCaption')).toBeTruthy()

    await w.find('[data-testid="review-edit-photo"]').trigger('click')
    expect(document.querySelector('[data-testid="photo-framing-editor"]')).toBeTruthy()
    w.unmount()
  })

  it('keeps bounties and submit accessible', () => {
    const w = mountReview({
      photoPreviewUrl: 'blob:mock',
      photoPreviewWidth: 100,
      photoPreviewHeight: 100,
      photoStaged: true,
    })
    expect(w.find('[data-testid="review-bounties"]').exists()).toBe(true)
    expect(w.find('[data-testid="submit-drink"]').exists()).toBe(true)
    w.unmount()
  })
})
