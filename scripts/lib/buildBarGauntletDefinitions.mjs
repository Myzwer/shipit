/**
 * Build personal + collective Bar Gauntlet working-catalog rows from a catalog doc.
 * Skips bars with zero eligible cocktail offerings (never creates empty 0/0 awards).
 *
 * Eligibility (must match achievement_collection_required_ids):
 * - not beer/wine
 * - price_status is verified_within_limit OR approved_filtered_within_limit
 * - not collection-excluded
 * - not active manual overlays (runtime-only; not represented in static JSON)
 */
export function offeringSupportsCollectionEligibility(offering) {
  if (!offering) return false
  if (offering.price_status === 'verified_over_limit') return false
  if (offering.price_status === 'unverified') return false
  if (
    offering.price_status !== 'verified_within_limit' &&
    offering.price_status !== 'approved_filtered_within_limit'
  ) {
    return false
  }
  const tags = offering.classification_tags || []
  if (tags.includes('collection-excluded')) return false
  return true
}

export function eligibleGauntletOfferingsForBar(doc, barKey) {
  const rows = []
  for (const drink of doc.drinks || []) {
    if (drink.kind === 'beer' || drink.kind === 'wine') continue
    for (const offering of drink.bar_offerings || []) {
      if (offering.bar_key !== barKey) continue
      if (!offeringSupportsCollectionEligibility(offering)) continue
      rows.push({
        drink_key: drink.key,
        kind: drink.kind,
        bar_key: barKey,
        price_status: offering.price_status,
      })
    }
  }
  return rows
}

/**
 * Build personal + collective Bar Gauntlet rows.
 * Bars with zero price-verified offerings are still included when
 * `includeUnverified` is true (FINAL Good Spirits definitions), marked
 * verification_required so the evaluator never auto-completes an empty set.
 */
export function buildBarGauntletDefinitions(doc, opts = {}) {
  const includeUnverified = opts.includeUnverified === true
  const bars = (doc.bars || []).filter((b) => b.active !== false)
  const definitions = []
  const report = []

  for (const bar of bars) {
    const eligible = eligibleGauntletOfferingsForBar(doc, bar.key)
    const target = eligible.length
    const verificationRequired = target < 1
    report.push({
      bar_key: bar.key,
      bar_name: bar.name || bar.key,
      eligible_count: target,
      included: target > 0 || includeUnverified,
      skip_reason:
        target > 0
          ? null
          : includeUnverified
            ? 'verification_required_included'
            : 'no_within_limit_price_evidence',
    })
    if (target < 1 && !includeUnverified) continue

    const barName = bar.name || bar.key
    definitions.push({
      snapshotRef: `A3-BG-P-${bar.key}`,
      stableKey: `working-drinkit-gauntlet-personal-${bar.key}`,
      game: 'drinkit',
      ownerType: 'player',
      groupKey: 'bar_gauntlets',
      title: `${barName} Gauntlet`,
      displayDescription: `Log every eligible distinct cocktail offering at ${barName}.`,
      secret: false,
      exclusive: false,
      readiness: 'enabled',
      conditionType: 'offering_collection',
      conditionConfig: {
        bar_key: bar.key,
        scope: 'personal',
        mode: 'full_menu',
        ...(verificationRequired ? { verification_required: true } : {}),
      },
      dependencies: [],
      blockers: [],
      enabledInDev: true,
      testOnly: true,
      visibilityNote: verificationRequired
        ? 'FINAL — verification pending'
        : 'FINAL — public',
      iconKey: 'score.bar',
    })
    definitions.push({
      snapshotRef: `A3-BG-C-${bar.key}`,
      stableKey: `working-drinkit-gauntlet-collective-${bar.key}`,
      game: 'drinkit',
      ownerType: 'player',
      groupKey: 'bar_gauntlets',
      title: `${barName} Collective Gauntlet`,
      displayDescription: `As a Drink It! roster, log every eligible distinct cocktail offering at ${barName}. All eligible participants receive the award.`,
      secret: false,
      exclusive: false,
      readiness: 'enabled',
      conditionType: 'offering_collection',
      conditionConfig: {
        bar_key: bar.key,
        scope: 'collective',
        mode: 'full_menu',
        ...(verificationRequired ? { verification_required: true } : {}),
      },
      dependencies: [],
      blockers: [],
      enabledInDev: true,
      testOnly: true,
      visibilityNote: verificationRequired
        ? 'FINAL — verification pending'
        : 'FINAL — public',
      iconKey: 'score.team',
    })
  }

  return { definitions, report }
}
