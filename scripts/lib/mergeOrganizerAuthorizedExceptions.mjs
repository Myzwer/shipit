/**
 * Merge Stage A2 organizer-authorized loggable exceptions into a full_snapshot catalog.
 * Idempotent. Never invents prices, fingerprints, or cocktail_candidates.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '../..')
const EXCEPTIONS_PATH = join(root, 'content/catalogs/organizer-authorized-exceptions-v1.json')

export function loadOrganizerAuthorizedExceptions() {
  return JSON.parse(readFileSync(EXCEPTIONS_PATH, 'utf8'))
}

export function mergeOrganizerAuthorizedExceptions(doc, exceptions = loadOrganizerAuthorizedExceptions()) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('mergeOrganizerAuthorizedExceptions requires a catalog document')
  }
  if (!Array.isArray(doc.drinks)) doc.drinks = []
  if (!Array.isArray(doc.cocktail_candidates)) doc.cocktail_candidates = []
  if (!doc.source_notes || typeof doc.source_notes !== 'object') {
    throw new Error('catalog source_notes required before merging exceptions')
  }

  const tags = [...(exceptions.offering_classification_tags || [])]
  if (!tags.includes('collection-excluded')) tags.push('collection-excluded')
  if (!tags.includes('organizer-authorized-exception')) {
    tags.push('organizer-authorized-exception')
  }

  const registryRows = []
  const barKeys = new Set((doc.bars || []).map((b) => b.key))

  for (const entry of exceptions.registry || []) {
    for (const barKey of entry.bar_keys || []) {
      if (!barKeys.has(barKey)) {
        throw new Error(`organizer exception bar missing from catalog: ${entry.drink_key}@${barKey}`)
      }
      registryRows.push({
        drink_key: entry.drink_key,
        bar_key: barKey,
        name: entry.name,
      })
    }

    // Never enter randomized Cocktail Bounty pools.
    doc.cocktail_candidates = doc.cocktail_candidates.filter((c) => c.drink_key !== entry.drink_key)

    let drink = doc.drinks.find((d) => d.key === entry.drink_key)
    if (!drink) {
      drink = {
        key: entry.drink_key,
        name: entry.name,
        kind: entry.kind || 'other_alcoholic',
        bar_offerings: [],
      }
      doc.drinks.push(drink)
    } else {
      drink.name = entry.name
      drink.kind = entry.kind || drink.kind || 'other_alcoholic'
    }

    const wantedBars = new Set(entry.bar_keys || [])
    drink.bar_offerings = (drink.bar_offerings || []).filter((o) => wantedBars.has(o.bar_key))

    for (const barKey of wantedBars) {
      let offering = drink.bar_offerings.find((o) => o.bar_key === barKey)
      if (!offering) {
        offering = {
          bar_key: barKey,
          ingredient_keys: [],
          display_ingredients: [],
          price_usd: null,
          price_status: exceptions.price_status || 'unverified',
          evidence_reference: exceptions.evidence_reference,
          classification_tags: [...tags],
        }
        drink.bar_offerings.push(offering)
      } else {
        offering.price_usd = null
        offering.price_status = exceptions.price_status || 'unverified'
        delete offering.price_evidence_approval_id
        delete offering.price_evidence_recipe_fingerprint
        offering.evidence_reference = exceptions.evidence_reference
        offering.classification_tags = [
          ...new Set([...(offering.classification_tags || []), ...tags]),
        ]
        // Never promote provisional organizer notes into bounty ingredient keys.
        offering.ingredient_keys = []
        offering.display_ingredients = []
      }
    }
  }

  doc.source_notes.organizer_authorized_exceptions = registryRows

  const flagCode = 'ORGANIZER_AUTHORIZED_LOGGABLE_EXCEPTION'
  const flags = Array.isArray(doc.source_notes.uncertainty_flags)
    ? doc.source_notes.uncertainty_flags.filter((f) => f.code !== flagCode)
    : []
  for (const row of registryRows) {
    flags.push({
      code: flagCode,
      message:
        `${row.name} at ${row.bar_key} is an organizer-authorized loggable exception. ` +
        'Retain on menu replacement with collection-excluded + organizer-authorized-exception; ' +
        'do not invent Category A/B prices or cocktail_candidates.',
      drink_key: row.drink_key,
      bar_key: row.bar_key,
    })
  }
  doc.source_notes.uncertainty_flags = flags

  const summary = doc.source_notes.evidence_summary || ''
  const marker = 'Stage A2 organizer-authorized exceptions retained'
  if (!summary.includes(marker)) {
    doc.source_notes.evidence_summary = summary
      ? `${summary} ${marker} via content/catalogs/organizer-authorized-exceptions-v1.json.`
      : `${marker} via content/catalogs/organizer-authorized-exceptions-v1.json.`
  }

  return doc
}
