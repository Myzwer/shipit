/**
 * Writes two schedule-ready catalog JSON files for Phase 6B2 E2E.
 * Run via: npx vite-node scripts/write-e2e-6b2-catalogs.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { buildScheduleReadyCatalog } from '../tests/fixtures/catalog/builders'

const __dir = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dir, '../.local')
await mkdir(outDir, { recursive: true })

const base = buildScheduleReadyCatalog(72, 39)
base.catalog_id = `e2e-6b2-base-${randomUUID().slice(0, 8)}`

const next = buildScheduleReadyCatalog(72, 39)
next.catalog_id = `e2e-6b2-pub-${randomUUID().slice(0, 8)}`
next.base_catalog_id = base.catalog_id

await writeFile(join(outDir, 'e2e-6b2-base-catalog.json'), JSON.stringify(base))
await writeFile(join(outDir, 'e2e-6b2-publish-catalog.json'), JSON.stringify(next))
console.log(JSON.stringify({ base: base.catalog_id, next: next.catalog_id }))
