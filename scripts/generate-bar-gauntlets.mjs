/**
 * Generate content/achievements/barGauntlets.json from the launch-candidate catalog.
 *
 *   node scripts/generate-bar-gauntlets.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBarGauntletDefinitions } from './lib/buildBarGauntletDefinitions.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')
const catalog = JSON.parse(
  readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8'),
)
const { definitions, report } = buildBarGauntletDefinitions(catalog)
const out = {
  schema_comment:
    'Generated Bar Gauntlet definitions from launch-candidate eligible cocktail offerings. Regenerate after catalog changes. Engine denominators remain live/catalog-driven.',
  generated_from_catalog_id: catalog.catalog_id,
  report,
  definitions,
}
const outPath = join(root, 'content/achievements/barGauntlets.json')
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`)
console.log(
  JSON.stringify(
    {
      out: outPath,
      definitions: definitions.length,
      bars_included: report.filter((r) => r.included).length,
      bars_skipped_empty: report.filter((r) => !r.included).map((r) => r.bar_key),
      targets: Object.fromEntries(report.map((r) => [r.bar_key, r.eligible_count])),
    },
    null,
    2,
  ),
)
