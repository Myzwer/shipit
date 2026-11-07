/**
 * Category B approved offering identities + recipe fingerprints.
 * A new drink at an authorized bar cannot inherit Category B by copying approval_id alone.
 * Materially changed recipes fail fingerprint match against the approved source.
 *
 * Fingerprints are precomputed in content/approvals/filtered-source-offerings-v1.json
 * (sha256 over drink_key, bar_key, normalized printed recipe). No Node crypto in the
 * browser bundle — validation is allowlist membership only.
 */
import {
  FILTERED_SOURCE_OFFERING_BY_IDENTITY,
  FILTERED_SOURCE_OFFERING_COUNT,
  FILTERED_SOURCE_OFFERING_SET_SHA256,
} from './filteredSourceOfferingData'

export {
  FILTERED_SOURCE_OFFERING_COUNT,
  FILTERED_SOURCE_OFFERING_SET_SHA256,
}

export interface ApprovedFilteredOffering {
  drink_key: string
  bar_key: string
  recipe_fingerprint: string
}

export function approvedFilteredOfferingKey(drinkKey: string, barKey: string): string {
  return `${drinkKey}@${barKey}`
}

export function getApprovedFilteredOffering(
  drinkKey: string,
  barKey: string,
): ApprovedFilteredOffering | null {
  return FILTERED_SOURCE_OFFERING_BY_IDENTITY[approvedFilteredOfferingKey(drinkKey, barKey)] ?? null
}

export function isApprovedFilteredOfferingIdentity(
  drinkKey: string,
  barKey: string,
  recipeFingerprint: string | null | undefined,
): boolean {
  if (!recipeFingerprint) return false
  const row = getApprovedFilteredOffering(drinkKey, barKey)
  if (!row) return false
  return row.recipe_fingerprint === recipeFingerprint
}
