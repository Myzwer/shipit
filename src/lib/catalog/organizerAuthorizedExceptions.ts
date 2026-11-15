/**
 * Organizer-authorized loggable exceptions registry contract.
 * Source of truth: content/catalogs/organizer-authorized-exceptions-v1.json
 *
 * Other Drinks (permanent ordinary-log options) are application-owned and
 * catalog-independent. New photographed catalogs are NOT required to embed
 * these rows. When a catalog still carries legacy exception offerings
 * (e.g. February fallback), validate their integrity in place.
 */
import registryDoc from '../../../content/catalogs/organizer-authorized-exceptions-v1.json'
import type { CatalogImportDocument } from './types'

export interface OrganizerAuthorizedExceptionEntry {
  drink_key: string
  name: string
  kind?: string
  bar_keys: string[]
  provisional_ingredient_notes?: string[]
}

export interface OrganizerAuthorizedExceptionsDoc {
  version: string
  registry: OrganizerAuthorizedExceptionEntry[]
  offering_classification_tags: string[]
  price_status: string
  price_usd: null
  evidence_reference: string
}

export const ORGANIZER_AUTHORIZED_EXCEPTIONS =
  registryDoc as OrganizerAuthorizedExceptionsDoc

export function expectedOrganizerExceptionOfferings(
  exceptions: OrganizerAuthorizedExceptionsDoc = ORGANIZER_AUTHORIZED_EXCEPTIONS,
): Array<{ drink_key: string; bar_key: string; name: string }> {
  const rows: Array<{ drink_key: string; bar_key: string; name: string }> = []
  for (const entry of exceptions.registry) {
    for (const bar_key of entry.bar_keys) {
      rows.push({ drink_key: entry.drink_key, bar_key, name: entry.name })
    }
  }
  return rows
}

export interface OrganizerExceptionRetentionIssue {
  code: string
  message: string
  drink_key?: string
  bar_key?: string
}

/**
 * @deprecated Other Drinks are catalog-independent. Kept for callers that still
 * distinguish launch/reconstructed snapshots; no longer gates missing rows.
 */
export function catalogRequiresOrganizerExceptions(doc: CatalogImportDocument): boolean {
  if (Array.isArray(doc.source_notes?.organizer_authorized_exceptions)) return true
  const summary = doc.source_notes?.evidence_summary || ''
  if (summary.includes('organizer-authorized exceptions')) return true
  const id = doc.catalog_id || ''
  if (/^star-princess-/i.test(id) || /^reconstructed-/i.test(id)) return true
  return false
}

/**
 * Validate organizer-exception integrity for rows that ARE present.
 * Does not require permanent Other Drinks / registry rows to appear in new catalogs.
 */
export function findMissingOrganizerAuthorizedExceptions(
  doc: CatalogImportDocument,
  exceptions: OrganizerAuthorizedExceptionsDoc = ORGANIZER_AUTHORIZED_EXCEPTIONS,
): OrganizerExceptionRetentionIssue[] {
  const issues: OrganizerExceptionRetentionIssue[] = []
  const drinksByKey = new Map(doc.drinks.map((d) => [d.key, d]))
  const registryKeys = new Set(exceptions.registry.map((e) => e.drink_key))

  for (const expected of expectedOrganizerExceptionOfferings(exceptions)) {
    const drink = drinksByKey.get(expected.drink_key)
    if (!drink) {
      // Catalog-independent: absence is allowed (served via Other Drinks).
      continue
    }
    const offering = drink.bar_offerings.find((o) => o.bar_key === expected.bar_key)
    if (!offering) {
      // Drink present without this bar offering — still allowed; Other Drinks covers all bars.
      continue
    }
    const tags = offering.classification_tags ?? []
    if (!tags.includes('organizer-authorized-exception') || !tags.includes('collection-excluded')) {
      issues.push({
        code: 'ORGANIZER_EXCEPTION_TAGS_MISSING',
        message: `${expected.drink_key}@${expected.bar_key} must keep collection-excluded + organizer-authorized-exception.`,
        drink_key: expected.drink_key,
        bar_key: expected.bar_key,
      })
    }
    if (offering.price_status !== 'unverified' || offering.price_usd != null) {
      issues.push({
        code: 'ORGANIZER_EXCEPTION_PRICE_CORRUPTED',
        message: `${expected.drink_key}@${expected.bar_key} must remain unverified with null price_usd.`,
        drink_key: expected.drink_key,
        bar_key: expected.bar_key,
      })
    }
    if (
      offering.price_evidence_approval_id ||
      offering.price_evidence_recipe_fingerprint
    ) {
      issues.push({
        code: 'ORGANIZER_EXCEPTION_FORGED_EVIDENCE',
        message: `${expected.drink_key}@${expected.bar_key} must not carry Category A/B fingerprints.`,
        drink_key: expected.drink_key,
        bar_key: expected.bar_key,
      })
    }
    if ((offering.ingredient_keys?.length ?? 0) > 0) {
      issues.push({
        code: 'ORGANIZER_EXCEPTION_INVENTS_INGREDIENTS',
        message: `${expected.drink_key}@${offering.bar_key} must not invent ingredient_keys from provisional notes.`,
        drink_key: expected.drink_key,
        bar_key: offering.bar_key,
      })
    }
  }

  for (const entry of exceptions.registry) {
    if (doc.cocktail_candidates.some((c) => c.drink_key === entry.drink_key)) {
      issues.push({
        code: 'ORGANIZER_EXCEPTION_IN_COCKTAIL_CANDIDATES',
        message: `Organizer exception "${entry.drink_key}" must not appear in cocktail_candidates.`,
        drink_key: entry.drink_key,
      })
    }
  }

  // Any drink tagged as organizer-authorized-exception (even outside registry) must stay non-bounty.
  for (const drink of doc.drinks) {
    if (!registryKeys.has(drink.key)) continue
    for (const offering of drink.bar_offerings) {
      const tags = offering.classification_tags ?? []
      if (!tags.includes('organizer-authorized-exception')) continue
      if (offering.price_status === 'approved_unpriced_menu_within_limit') {
        issues.push({
          code: 'ORGANIZER_EXCEPTION_FORGED_CATEGORY_U',
          message: `${drink.key}@${offering.bar_key} log-only exception must not use Category U.`,
          drink_key: drink.key,
          bar_key: offering.bar_key,
        })
      }
    }
  }

  return issues
}
