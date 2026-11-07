/**
 * Narrow, source-controlled allowlist for Category B price evidence.
 *
 * Category B = organizer-approved filtered-source evidence supporting
 * within-limit ($15 ceiling) bounty eligibility when exact printed dollars
 * were not retained. Distinct from Category A (exact verified price).
 *
 * A client cannot invent B eligibility by forging evidence_reference,
 * source_notes text, or ready_for_scheduling — the approval_id must match
 * this allowlist and the offering bar must be authorized.
 */

export const PRINCESS_PLUS_PRICE_LIMIT_USD = 15

/** Category A — exact printed dollar verified ≤ $15. */
export const PRICE_EVIDENCE_EXACT_VERIFIED = 'exact_verified_within_limit' as const
/** Category B — organizer-approved filtered source; exact $ absent. */
export const PRICE_EVIDENCE_APPROVED_FILTERED = 'approved_filtered_within_limit' as const
/** Category C — unknown / unresolved. */
export const PRICE_EVIDENCE_UNKNOWN = 'unknown_unresolved' as const
/** Category D — explicitly over $15. */
export const PRICE_EVIDENCE_OVER_LIMIT = 'verified_over_limit' as const

export type PriceEvidenceCategory =
  | typeof PRICE_EVIDENCE_EXACT_VERIFIED
  | typeof PRICE_EVIDENCE_APPROVED_FILTERED
  | typeof PRICE_EVIDENCE_UNKNOWN
  | typeof PRICE_EVIDENCE_OVER_LIMIT

/**
 * Sole Phase 10B approval authorizing Category B for Star Princess
 * research menus whose venue PDFs were filtered to exclude known >$15 drinks.
 * Good Spirits is intentionally excluded (prices unknown).
 */
export const FILTERED_SOURCE_APPROVAL_ID = 'star-princess-filtered-source-2026-11-07' as const

export const FILTERED_SOURCE_AUTHORIZED_BAR_KEYS = [
  'omalleys-irish-pub',
  'princess-live',
  'bellinis-cocktail-bar',
  'wheelhouse-bar',
  'crooners',
  'wake-view-bar',
  'promenade-bars',
  'sea-view-bar',
  'cascade-bar',
  'lido-bar',
  'the-mix',
  'star-bar',
] as const

export interface PriceEvidenceApproval {
  approval_id: string
  kind: 'filtered_source_within_limit'
  source_path: string
  authorized_bar_keys: readonly string[]
  /** Exact printed dollars are NOT claimed. */
  invents_price_usd: false
  notes: string
}

export const PRICE_EVIDENCE_APPROVALS: Readonly<Record<string, PriceEvidenceApproval>> = {
  [FILTERED_SOURCE_APPROVAL_ID]: {
    approval_id: FILTERED_SOURCE_APPROVAL_ID,
    kind: 'filtered_source_within_limit',
    source_path: 'handoff/data/menus/Star-Princess-Beverage-Source-Unmodified.md',
    authorized_bar_keys: FILTERED_SOURCE_AUTHORIZED_BAR_KEYS,
    invents_price_usd: false,
    notes:
      'Organizer Phase 10B approval: previously filtered venue menus (known >$15 omitted) are sufficient Category B bounty-eligibility evidence. Exact printed prices were not retained — never write or display $15 as the menu price.',
  },
}

export function getPriceEvidenceApproval(approvalId: string | null | undefined): PriceEvidenceApproval | null {
  if (!approvalId) return null
  return PRICE_EVIDENCE_APPROVALS[approvalId] ?? null
}

export function isAuthorizedFilteredBar(approvalId: string, barKey: string): boolean {
  const approval = getPriceEvidenceApproval(approvalId)
  if (!approval) return false
  return (approval.authorized_bar_keys as readonly string[]).includes(barKey)
}

/** Offering fields used for Princess Plus bounty attainability (not ordinary logging). */
export interface PriceEvidenceOfferingSlice {
  bar_key: string
  price_usd?: number | null
  price_status: string
  price_evidence_approval_id?: string | null
}

/**
 * Whether an offering corroborates Princess Plus bounty eligibility.
 * Ordinary logging is separate and may succeed for over-limit / unknown prices.
 */
export function offeringSupportsBountyEligibility(offering: PriceEvidenceOfferingSlice): boolean {
  if (offering.price_status === 'verified_within_limit') {
    return (
      offering.price_usd != null &&
      Number.isFinite(offering.price_usd) &&
      offering.price_usd <= PRINCESS_PLUS_PRICE_LIMIT_USD
    )
  }
  if (offering.price_status === 'approved_filtered_within_limit') {
    if (offering.price_usd != null) return false
    const approvalId = offering.price_evidence_approval_id ?? null
    return isAuthorizedFilteredBar(approvalId ?? '', offering.bar_key)
  }
  return false
}

export function classifyOfferingPriceEvidence(
  offering: PriceEvidenceOfferingSlice,
): PriceEvidenceCategory {
  if (offering.price_status === 'verified_over_limit') return PRICE_EVIDENCE_OVER_LIMIT
  if (offering.price_status === 'verified_within_limit') return PRICE_EVIDENCE_EXACT_VERIFIED
  if (offering.price_status === 'approved_filtered_within_limit') {
    return PRICE_EVIDENCE_APPROVED_FILTERED
  }
  return PRICE_EVIDENCE_UNKNOWN
}
