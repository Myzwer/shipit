/**
 * Prepare a reconstructed onboard-menu full_snapshot for Admin staging.
 * Always merges organizer-authorized exceptions and fails closed if any are missing.
 *
 *   node scripts/prepare-reconstructed-catalog.mjs path/to/reconstructed.json [out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeOrganizerAuthorizedExceptions } from './lib/mergeOrganizerAuthorizedExceptions.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node scripts/prepare-reconstructed-catalog.mjs <input.json> [output.json]')
  process.exit(1)
}
const outputPath = resolve(process.argv[3] || inputPath)
const doc = JSON.parse(readFileSync(resolve(inputPath), 'utf8'))
if (doc.mode !== 'full_snapshot') {
  console.error('Refusing: mode must be full_snapshot')
  process.exit(1)
}

mergeOrganizerAuthorizedExceptions(doc)

const registry = JSON.parse(
  readFileSync(join(root, 'content/catalogs/organizer-authorized-exceptions-v1.json'), 'utf8'),
)
const drinksByKey = new Map((doc.drinks || []).map((d) => [d.key, d]))
const missing = []
for (const entry of registry.registry || []) {
  for (const barKey of entry.bar_keys || []) {
    const drink = drinksByKey.get(entry.drink_key)
    const offering = drink?.bar_offerings?.find((o) => o.bar_key === barKey)
    if (!offering) {
      missing.push(`${entry.drink_key}@${barKey}`)
      continue
    }
    const tags = offering.classification_tags || []
    if (!tags.includes('collection-excluded') || !tags.includes('organizer-authorized-exception')) {
      missing.push(`${entry.drink_key}@${barKey} (tags)`)
    }
  }
}
if (missing.length) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: 'ORGANIZER_EXCEPTION_RETENTION_FAILED',
        missing,
      },
      null,
      2,
    ),
  )
  process.exit(1)
}

writeFileSync(outputPath, `${JSON.stringify(doc, null, 2)}\n`)
console.log(
  JSON.stringify(
    {
      ok: true,
      output: outputPath,
      organizer_authorized_exceptions:
        doc.source_notes.organizer_authorized_exceptions?.length ?? 0,
    },
    null,
    2,
  ),
)
