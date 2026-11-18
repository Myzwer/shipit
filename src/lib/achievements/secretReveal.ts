/**
 * Post-finale secret achievement disclosure helpers.
 * Authoritative masking comes from list_achievements (`masked` / finale latch).
 * Do not invent client-side clock checks for secret content.
 */

export type SecretRevealCard = {
  secret: boolean
  earned: boolean
  masked: boolean
  description: string
}

/** True while an unearned secret must stay fully concealed (pre-finale). */
export function isSecretAchievementMasked(card: SecretRevealCard): boolean {
  return card.secret && !card.earned && card.masked
}

/**
 * Description line for achievement cards.
 * Pre-finale unearned secret → generic label.
 * Post-finale unearned secret → `Secret: {canonical requirement}`.
 * Earned / ordinary → canonical description unchanged.
 */
export function achievementCardDescription(
  card: SecretRevealCard,
  labels: { secretLabel: string; secretRequirement: string },
): string {
  if (isSecretAchievementMasked(card)) return labels.secretLabel
  if (card.secret && !card.earned && !card.masked) {
    return labels.secretRequirement.replaceAll('{requirement}', card.description)
  }
  return card.description
}
