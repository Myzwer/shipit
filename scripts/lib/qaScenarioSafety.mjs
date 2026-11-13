/**
 * QA scenario harness safety — local development-only only.
 * No production bypass. Destructive ops require explicit env confirmation.
 */
import {
  assertDevelopmentOnlyCruise,
  assertLocalSupabaseUrl,
  readSupabaseEnv,
} from './demoLocalSafety.mjs'

export const QA_CONFIRM_ENV = 'local-development-only'
/** Core review slots + safety copy of the organizer's live Scenario C Wrapped DB. */
export const QA_SCENARIO_NAMES = ['tuesday', 'precruise', 'wrapped', 'wrapped-scenario-c']
/** Slots that demo-seed can prepare (excludes safety-only copies). */
export const QA_SEEDABLE_SCENARIOS = ['tuesday', 'precruise', 'wrapped']

export function requireConfirmEnv(argv = process.argv) {
  const flag = argv.find((a) => a.startsWith('--confirm-env='))
  const value = flag?.slice('--confirm-env='.length)
  if (value !== QA_CONFIRM_ENV) {
    throw new Error(
      `QA_SAFETY: refusing destructive/scenario operation without --confirm-env=${QA_CONFIRM_ENV}`,
    )
  }
}

export function assertQaScenarioName(name) {
  if (!QA_SCENARIO_NAMES.includes(name)) {
    throw new Error(
      `QA_SAFETY: unknown scenario "${name}". Expected one of: ${QA_SCENARIO_NAMES.join(', ')}`,
    )
  }
  return name
}

export async function assertLocalDevelopmentTarget(service) {
  const sbEnv = readSupabaseEnv()
  const url = sbEnv.API_URL || sbEnv.SUPABASE_URL
  assertLocalSupabaseUrl(url)
  const cruise = await assertDevelopmentOnlyCruise(service)
  if (!cruise) {
    throw new Error('QA_SAFETY: no active development-only cruise_config')
  }
  return { sbEnv, url, cruise }
}

export function assertNotProductionLabel(label) {
  if (!label || label === 'production' || label === 'prod') {
    throw new Error(`QA_SAFETY: refusing operation for cruise label "${label}"`)
  }
  if (label !== 'development-only') {
    throw new Error(`QA_SAFETY: cruise label must be development-only (got "${label}")`)
  }
}
