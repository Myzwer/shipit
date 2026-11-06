/** Re-export workingCatalog.ts → workingCatalog.json (parse TS array literal). */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const tsPath = join(__dir, '../content/achievements/workingCatalog.ts')
const outPath = join(__dir, '../content/achievements/workingCatalog.json')
const text = readFileSync(tsPath, 'utf8')
const m = text.match(
  /WORKING_ACHIEVEMENT_CATALOG: WorkingAchievementDefinition\[\] =\s*(\[[\s\S]*\])\s*\nexport function workingCatalogSummary/,
)
if (!m) {
  console.error('Could not parse WORKING_ACHIEVEMENT_CATALOG array')
  process.exit(1)
}
const data = JSON.parse(m[1])
writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n')
const by = { enabled: 0, blocked_metadata: 0, blocked_organizer: 0, missing_capability: 0 }
for (const r of data) by[r.readiness]++
console.log(JSON.stringify({ total: data.length, ...by }))
