import { describe, expect, it } from 'vitest'
import {
  achievementCardDescription,
  isSecretAchievementMasked,
} from '@/lib/achievements/secretReveal'
import { copy } from '@/ui/copy'

const labels = {
  secretLabel: copy.achievements.secretLabel,
  secretRequirement: copy.achievements.secretRequirement,
}

const REQUIREMENT = 'Drink 2 drinks'

describe('secretReveal', () => {
  it('keeps pre-finale unearned secrets fully masked', () => {
    const card = {
      secret: true,
      earned: false,
      masked: true,
      description: 'Secret Achievement',
    }
    expect(isSecretAchievementMasked(card)).toBe(true)
    expect(achievementCardDescription(card, labels)).toBe('Secret Achievement')
  })

  it('reveals post-finale unearned secret requirements with Secret: prefix', () => {
    const card = {
      secret: true,
      earned: false,
      masked: false,
      description: REQUIREMENT,
    }
    expect(isSecretAchievementMasked(card)).toBe(false)
    expect(achievementCardDescription(card, labels)).toBe(`Secret: ${REQUIREMENT}`)
  })

  it('does not prefix earned secret descriptions', () => {
    const card = {
      secret: true,
      earned: true,
      masked: false,
      description: REQUIREMENT,
    }
    expect(isSecretAchievementMasked(card)).toBe(false)
    expect(achievementCardDescription(card, labels)).toBe(REQUIREMENT)
  })

  it('leaves ordinary achievements unchanged', () => {
    const card = {
      secret: false,
      earned: false,
      masked: true,
      description: 'Log any drink.',
    }
    expect(isSecretAchievementMasked(card)).toBe(false)
    expect(achievementCardDescription(card, labels)).toBe('Log any drink.')
  })

  it('uses the canonical description text without rewriting it', () => {
    const canonical = 'Complete a challenge on the final cruise day before the game ends.'
    expect(
      achievementCardDescription(
        { secret: true, earned: false, masked: false, description: canonical },
        labels,
      ),
    ).toBe(`Secret: ${canonical}`)
  })
})
