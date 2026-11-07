/**
 * @deprecated Phase 10B — development preview is the launch-candidate artifact.
 * Delegates to scripts/build-launch-candidate-catalog.mjs.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
console.warn(
  'catalog:build-preview now builds the launch-candidate catalog (Category B price evidence).',
)
const r = spawnSync(process.execPath, [join(root, 'scripts/build-launch-candidate-catalog.mjs')], {
  cwd: root,
  stdio: 'inherit',
})
process.exit(r.status ?? 1)
