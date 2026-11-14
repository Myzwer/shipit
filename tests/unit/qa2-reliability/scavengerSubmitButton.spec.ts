/**
 * QA-2 Agent 2 — scavenger review submit button disable / retry wiring.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ScavengerReviewStep from '@/features/shipit/ScavengerReviewStep.vue'
import type { ShipItChallengeCard } from '@/types/shipit'

const challenge: ShipItChallengeCard = {
  id: 'c1',
  canonical_key: 'find-something',
  title: 'Find Something',
  instructions: 'Take a photo',
  category: 'explore',
  points: 25,
  completed: false,
  actionable: true,
  submission_ready: true,
} as ShipItChallengeCard

describe('QA2 scavenger submit button states', () => {
  it('disables submit while submitting is true', () => {
    const w = mount(ScavengerReviewStep, {
      props: {
        challenge,
        playerName: 'Josh',
        teamName: 'Team A',
        caption: '',
        photoPreviewUrl: 'blob:x',
        photoPreviewWidth: 100,
        photoPreviewHeight: 100,
        photoStaged: true,
        submitting: true,
        canSubmit: false,
      },
    })
    expect(w.find('[data-testid="scavenger-submit"]').attributes('disabled')).toBeDefined()
  })

  it('emits retry (not submit) when unknown pending', async () => {
    const w = mount(ScavengerReviewStep, {
      props: {
        challenge,
        playerName: 'Josh',
        teamName: 'Team A',
        caption: 'hi',
        photoPreviewUrl: 'blob:x',
        photoPreviewWidth: 100,
        photoPreviewHeight: 100,
        photoStaged: true,
        submitting: false,
        locked: true,
        submitError: 'unknown',
        canSubmit: true,
      },
    })
    expect(w.find('[data-testid="scavenger-unknown"]').exists()).toBe(true)
    await w.find('[data-testid="scavenger-submit"]').trigger('click')
    expect(w.emitted('retry')).toBeTruthy()
    expect(w.emitted('submit')).toBeFalsy()
  })

  it('emits submit when canSubmit and not unknown', async () => {
    const w = mount(ScavengerReviewStep, {
      props: {
        challenge,
        playerName: 'Josh',
        teamName: 'Team A',
        caption: '',
        photoPreviewUrl: 'blob:x',
        photoPreviewWidth: 100,
        photoPreviewHeight: 100,
        photoStaged: true,
        submitting: false,
        canSubmit: true,
      },
    })
    await w.find('[data-testid="scavenger-submit"]').trigger('click')
    expect(w.emitted('submit')).toBeTruthy()
  })
})
