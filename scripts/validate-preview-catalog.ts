import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { previewCatalogImport } from '../src/lib/catalog/validateCatalog'

const path = join(process.cwd(), 'content/catalogs/development-preview-v1.json')
const doc = JSON.parse(readFileSync(path, 'utf8'))
const r = previewCatalogImport(doc)

const provisionalCocktail = Array.isArray(doc.cocktail_candidates) ? doc.cocktail_candidates.length : 0
const provisionalIngredient = Array.isArray(doc.ingredient_candidates)
  ? doc.ingredient_candidates.length
  : 0

const summary = {
  readiness: r.readiness,
  safeToPublish: r.safeToPublish,
  strictCocktailEligible: r.counts.cocktailEligible,
  strictIngredientEligible: r.counts.ingredientEligible,
  shortages: r.shortages,
  provisionalCocktailCandidates: provisionalCocktail,
  provisionalIngredientCandidates: provisionalIngredient,
  errorCount:
    r.schemaErrors.length + r.crossReferenceErrors.length + r.businessRuleErrors.length,
  warningCount: r.warnings.length,
  schemaErrors: r.schemaErrors.slice(0, 10).map((e) => `${e.code}: ${e.message}`),
  crossReferenceErrors: r.crossReferenceErrors.slice(0, 10).map((e) => `${e.code}: ${e.message}`),
  businessRuleErrors: r.businessRuleErrors.slice(0, 15).map((e) => `${e.code}: ${e.message}`),
  warnings: r.warnings.slice(0, 10).map((w) => `${w.code}: ${w.message}`),
  note:
    'Strict Princess Plus eligibility requires verified_within_limit + numeric price. Category-2 filter evidence stays unverified. Provisional pools are for development-only demo seeding only.',
}
console.log(JSON.stringify(summary, null, 2))

// Expected for this provisional catalog: not ready for production scheduling.
if (r.safeToPublish !== false) process.exitCode = 1
else if (r.readiness === 'ready_for_scheduling' && r.counts.cocktailEligible >= 72) {
  // Unexpected if we still have unverified offerings — fail loud.
  console.error('Unexpected ready_for_scheduling with unverified category-2 offerings')
  process.exitCode = 1
} else if (r.readiness === 'invalid') {
  process.exitCode = 1
} else {
  // valid_not_ready (or structurally_valid) is the expected closeout state.
  process.exitCode = 0
}
