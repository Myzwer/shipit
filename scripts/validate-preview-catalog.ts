import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { previewCatalogImport } from '../src/lib/catalog/validateCatalog'

const path = join(process.cwd(), 'content/catalogs/launch-candidate-v1.json')
const doc = JSON.parse(readFileSync(path, 'utf8'))
const r = previewCatalogImport(doc)

const eligibleCocktail = (doc.cocktail_candidates ?? []).filter(
  (c: { eligible?: boolean }) => c.eligible !== false,
).length
const pendingGs = (doc.cocktail_candidates ?? []).filter(
  (c: { eligible?: boolean }) => c.eligible === false,
).length

const summary = {
  catalog_id: doc.catalog_id,
  readiness: r.readiness,
  safeToPublish: r.safeToPublish,
  cocktailEligible: r.counts.cocktailEligible,
  ingredientEligible: r.counts.ingredientEligible,
  shortages: r.shortages,
  candidateRows: {
    cocktailTotal: doc.cocktail_candidates?.length ?? 0,
    cocktailEligibleFlag: eligibleCocktail,
    cocktailPendingGoodSpirits: pendingGs,
    ingredientCandidates: doc.ingredient_candidates?.length ?? 0,
  },
  errorCount:
    r.schemaErrors.length + r.crossReferenceErrors.length + r.businessRuleErrors.length,
  warningCount: r.warnings.length,
  schemaErrors: r.schemaErrors.slice(0, 10).map((e) => `${e.code}: ${e.message}`),
  crossReferenceErrors: r.crossReferenceErrors.slice(0, 10).map((e) => `${e.code}: ${e.message}`),
  businessRuleErrors: r.businessRuleErrors.slice(0, 15).map((e) => `${e.code}: ${e.message}`),
  warnings: r.warnings.slice(0, 8).map((w) => `${w.code}: ${w.message}`),
  note:
    'Category B (approved_filtered_within_limit) counts toward bounty eligibility with allowlisted approval_id. Category A remains exact verified $. safeToPublish stays false in TS preview.',
}
console.log(JSON.stringify(summary, null, 2))

if (r.safeToPublish !== false) process.exitCode = 1
else if (r.readiness === 'invalid') process.exitCode = 1
else if (r.counts.cocktailEligible < 72 || r.counts.ingredientEligible < 39) {
  console.error('Launch-candidate pool shortage vs 72/39 slot targets')
  process.exitCode = 2
} else if (r.readiness !== 'ready_for_scheduling') {
  console.error('Expected ready_for_scheduling for launch-candidate Category B pools')
  process.exitCode = 2
} else {
  process.exitCode = 0
}
