/**
 * Patch the current launch-candidate / development-preview artifacts in place
 * without rebuilding the whole filtered-source catalog.
 *
 *   node scripts/apply-organizer-authorized-exceptions.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeOrganizerAuthorizedExceptions } from './lib/mergeOrganizerAuthorizedExceptions.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')
const paths = [
  join(root, 'content/catalogs/launch-candidate-v1.json'),
  join(root, 'content/catalogs/development-preview-v1.json'),
]

const launch = JSON.parse(readFileSync(paths[0], 'utf8'))
mergeOrganizerAuthorizedExceptions(launch)
const text = `${JSON.stringify(launch, null, 2)}\n`
for (const path of paths) writeFileSync(path, text)

const count = launch.source_notes.organizer_authorized_exceptions?.length ?? 0
console.log(`Merged organizer-authorized exceptions (${count} offerings) into:`)
for (const path of paths) console.log(`  ${path}`)
