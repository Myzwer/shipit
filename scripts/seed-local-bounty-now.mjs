/**
 * Align local development-only cruise so wall-clock now() is mid-open bounty hours.
 * Delegates to Vitest helper (catalog builders stay TypeScript).
 *
 *   node scripts/seed-local-bounty-now.mjs [--hour=13] [--day=1] [--paused]
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const hourArg = process.argv.find((a) => a.startsWith('--hour='))
const dayArg = process.argv.find((a) => a.startsWith('--day='))
const targetHour = hourArg?.split('=')[1] ?? '13'
const cruiseDay = dayArg?.split('=')[1] ?? '1'
const paused = process.argv.includes('--paused') ? '1' : '0'

const result = spawnSync(
  'npx',
  ['vitest', 'run', '--fileParallelism=false', 'tests/helpers/runSeedNowAligned.spec.ts'],
  {
    cwd: root,
    env: {
      ...process.env,
      SEED_HOUR: targetHour,
      SEED_DAY: cruiseDay,
      SEED_PAUSED: paused,
      SEED_CLI: '1',
    },
    stdio: 'inherit',
  },
)

process.exit(result.status ?? 1)
