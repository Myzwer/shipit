import { describe, expect, it } from 'vitest'
import { assertLocalSupabaseUrl } from '../../scripts/lib/demoLocalSafety.mjs'
import {
  QA_CONFIRM_ENV,
  assertQaScenarioName,
  requireConfirmEnv,
} from '../../scripts/lib/qaScenarioSafety.mjs'

describe('QA scenario harness safety', () => {
  it('hard-blocks non-local Supabase hosts', () => {
    expect(() => assertLocalSupabaseUrl('https://xyzcompany.supabase.co')).toThrow(/DEMO_SAFETY/)
    expect(() => assertLocalSupabaseUrl('http://127.0.0.1:54321')).not.toThrow()
  })

  it('requires explicit confirm-env for destructive commands', () => {
    expect(() => requireConfirmEnv(['node', 'scripts/qa-scenario.mjs', 'prepare', 'tuesday'])).toThrow(
      /confirm-env/,
    )
    expect(() =>
      requireConfirmEnv([
        'node',
        'scripts/qa-scenario.mjs',
        'prepare',
        'tuesday',
        `--confirm-env=${QA_CONFIRM_ENV}`,
      ]),
    ).not.toThrow()
  })

  it('only allows named QA scenarios', () => {
    expect(assertQaScenarioName('tuesday')).toBe('tuesday')
    expect(assertQaScenarioName('precruise')).toBe('precruise')
    expect(assertQaScenarioName('wrapped')).toBe('wrapped')
    expect(assertQaScenarioName('wrapped-scenario-c')).toBe('wrapped-scenario-c')
    expect(() => assertQaScenarioName('embarkation')).toThrow(/unknown scenario/)
  })
})
