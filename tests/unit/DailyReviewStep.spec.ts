import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DailyReviewStep from '@/features/drinkit/DailyReviewStep.vue'
import { copy } from '@/ui/copy'

function mountReview(overrides: Record<string, unknown> = {}) {
  return mount(DailyReviewStep, {
    props: {
      challengeTitle: 'Tequila Shot',
      locationName: 'Lido Bar',
      points: 50,
      playerName: 'Josh LastName',
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

describe('DailyReviewStep gallery preview', () => {
  it('shows heading, magenta points pill, and Add Caption without summary panels', () => {
    const w = mountReview({
      photoPreviewUrl: 'blob:mock',
      photoPreviewWidth: 100,
      photoPreviewHeight: 100,
      photoStaged: true,
      canSubmit: true,
    })
    expect(w.find('[data-testid="daily-review-title"]').text()).toBe(copy.daily.reviewTitle)
    expect(w.find('[data-testid="daily-review-points"]').text()).toBe('50 Points')
    expect(w.find('[data-testid="daily-review-challenge-title"]').text()).toBe('Tequila Shot')
    expect(w.find('[data-testid="daily-review-location"]').text()).toBe('Lido Bar')
    expect(w.find('[data-testid="daily-review-player"]').text()).toBe('Josh LastName')
    expect(w.find('[data-testid="review-add-caption"]').text()).toBe(copy.wizard.addCaptionAction)
    expect(w.text()).not.toContain(copy.bounty.daily.toUpperCase())
    expect(w.text()).not.toMatch(/\bPHOTO\b/)
    expect(w.find('[data-testid="daily-submit"]').text()).toContain(copy.daily.submit)
    expect(w.find('[data-testid="daily-attest-ack"]').text()).toBe(copy.daily.attestBringFriend)
    w.unmount()
  })

  it('shows All Hands acknowledgment above Submit', () => {
    const w = mountReview({
      participationMode: 'all_hands',
      photoPreviewUrl: 'blob:mock',
      photoPreviewWidth: 100,
      photoPreviewHeight: 100,
      photoStaged: true,
      canSubmit: true,
    })
    expect(w.find('[data-testid="daily-attest-ack"]').text()).toBe(copy.daily.attestAllHands)
    const ackIndex = w.html().indexOf('data-testid="daily-attest-ack"')
    const submitIndex = w.html().indexOf('data-testid="daily-submit"')
    expect(ackIndex).toBeGreaterThan(-1)
    expect(submitIndex).toBeGreaterThan(ackIndex)
    w.unmount()
  })

  it('shows Bring a Friend acknowledgment above Submit', () => {
    const w = mountReview({
      participationMode: 'bring_a_friend',
      canSubmit: true,
    })
    expect(w.find('[data-testid="daily-attest-ack"]').text()).toBe(copy.daily.attestBringFriend)
    w.unmount()
  })

  it('renders framed photo and caption edit actions', async () => {
    const w = mountReview({
      caption: 'Cheers from the Lido',
      photoPreviewUrl: 'blob:mock',
      photoPreviewWidth: 1200,
      photoPreviewHeight: 675,
      photoFraming: { zoom: 1.2, centerX: 0.4, centerY: 0.5 },
      photoStaged: true,
      canSubmit: true,
    })
    expect(w.find('[data-testid="review-photo-image"]').exists()).toBe(true)
    expect(w.find('[data-testid="review-caption"]').text()).toBe('Cheers from the Lido')
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

  it('shows challenge title only once and uses dynamic points', () => {
    const w = mountReview({
      challengeTitle: 'A Very Long Daily Challenge Title For Layout',
      points: 75,
      photoPreviewUrl: 'blob:mock',
      photoPreviewWidth: 100,
      photoPreviewHeight: 100,
      photoStaged: true,
      canSubmit: true,
    })
    const titleMatches = w.text().match(/A Very Long Daily Challenge Title For Layout/g) ?? []
    expect(titleMatches).toHaveLength(1)
    expect(w.find('[data-testid="daily-review-points"]').text()).toBe('75 Points')
    w.unmount()
  })

  it('keeps submit disabled without a staged photo', () => {
    const w = mountReview({ canSubmit: false })
    expect(w.find('[data-testid="daily-submit"]').attributes('disabled')).toBeDefined()
    w.unmount()
  })
})
