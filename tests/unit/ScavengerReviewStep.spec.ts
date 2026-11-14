import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ScavengerReviewStep from '@/features/shipit/ScavengerReviewStep.vue'
import { copy } from '@/ui/copy'
import type { ShipItChallengeCard } from '@/types/shipit'

const challenge: ShipItChallengeCard = {
  id: 'c1',
  canonical_key: 'the-piazza-grandeur',
  category: 'classic_ship_landmarks',
  title: 'Find the Atrium',
  instructions: 'Take a photo of the atrium fountain.',
  points: 100,
  sort_order: 1,
  photo_required: true,
  completed: false,
  actionable: true,
  submission_ready: true,
}

function mountReview(overrides: Record<string, unknown> = {}) {
  return mount(ScavengerReviewStep, {
    props: {
      challenge,
      playerName: 'Josh LastName',
      teamName: 'Deck Hands',
      caption: '',
      photoPreviewUrl: null,
      photoPreviewWidth: null,
      photoPreviewHeight: null,
      photoFraming: null,
      photoStaged: false,
      submitting: false,
      canSubmit: false,
      ...overrides,
    },
    attachTo: document.body,
  })
}

describe('ScavengerReviewStep', () => {
  it('shows selected challenge card and team-wide note', () => {
    const w = mountReview({
      photoPreviewUrl: 'blob:mock',
      photoPreviewWidth: 100,
      photoPreviewHeight: 100,
      photoStaged: true,
      canSubmit: true,
    })
    expect(w.find('[data-testid="selected-challenge-heading"]').text()).toBe(
      copy.shipit.selectedChallenge,
    )
    expect(w.find('[data-testid="selected-challenge-card"]').text()).toContain('Find the Atrium')
    expect(w.find('[data-testid="selected-challenge-card"]').text()).toContain(
      'Take a photo of the atrium fountain.',
    )
    expect(w.find('[data-testid="scavenger-review-points"]').text()).toContain('100')
    expect(w.find('[data-testid="team-wide-completion-note"]').text()).toBe(
      copy.shipit.teamWideCompletion,
    )
    expect(w.find('[data-testid="scavenger-submit"]').text()).toContain(copy.shipit.submit)
    w.unmount()
  })

  it('renders gallery-style preview with framing and caption edit actions', async () => {
    const w = mountReview({
      caption: 'Hello atrium',
      photoPreviewUrl: 'blob:mock',
      photoPreviewWidth: 1200,
      photoPreviewHeight: 675,
      photoFraming: { zoom: 1.2, centerX: 0.4, centerY: 0.5 },
      photoStaged: true,
      canSubmit: true,
    })
    expect(w.find('[data-testid="review-gallery-preview"]').exists()).toBe(true)
    expect(w.find('[data-testid="review-photo-image"]').exists()).toBe(true)
    expect(w.find('[data-testid="review-caption"]').text()).toBe('Hello atrium')
    expect(w.find('[data-testid="scavenger-review-team"]').text()).toContain('Josh LastName')

    await w.find('[data-testid="review-edit-caption"]').trigger('click')
    expect(w.emitted('editCaption')).toBeTruthy()

    await w.find('[data-testid="review-edit-photo"]').trigger('click')
    expect(document.querySelector('[data-testid="photo-framing-editor"]')).toBeTruthy()
    w.unmount()
  })

  it('keeps submit disabled without a staged photo', () => {
    const w = mountReview({ canSubmit: false })
    expect(w.find('[data-testid="scavenger-submit"]').attributes('disabled')).toBeDefined()
    w.unmount()
  })
})
