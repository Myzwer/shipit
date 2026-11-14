/**
 * R2 unit-backed proof: empty-blob refuse + AbortSignal reach upload opts.
 * Runs vitest contracts; prints summary for REGRESSION_RESULTS.
 */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const files = [
  'tests/unit/qa2-reliability/stagePhoto.network.spec.ts',
  'tests/unit/qa2-reliability/PhotoCapture.restore.spec.ts',
  'tests/unit/stagePhoto.spec.ts',
]

const r = spawnSync(
  'npx',
  ['vitest', 'run', ...files],
  { cwd: root, encoding: 'utf8', env: { ...process.env } },
)
console.log(r.stdout)
if (r.stderr) console.error(r.stderr)
process.exit(r.status ?? 1)
