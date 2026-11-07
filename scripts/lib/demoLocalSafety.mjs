/**
 * Development-only demo safety: refuse non-local Supabase targets.
 * No --force-production bypass exists.
 */
import { execSync } from 'node:child_process'

export function readSupabaseEnv() {
  const raw = execSync('npx supabase status -o env', { encoding: 'utf8' })
  const env = {}
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  return env
}

export function assertLocalSupabaseUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('DEMO_SAFETY: missing Supabase URL')
  }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`DEMO_SAFETY: unparseable Supabase URL: ${url}`)
  }
  const host = parsed.hostname
  const local =
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local')
  if (!local) {
    throw new Error(
      `DEMO_SAFETY: refusing demo seed against non-local host "${host}". Only local Supabase is allowed.`,
    )
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`DEMO_SAFETY: unexpected protocol ${parsed.protocol}`)
  }
  return parsed
}

export async function assertDevelopmentOnlyCruise(service) {
  const { data, error } = await service
    .from('cruise_config')
    .select('id, label, is_active')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  if (data.label !== 'development-only') {
    throw new Error(
      `DEMO_SAFETY: active cruise label is "${data.label}", not development-only. Aborting.`,
    )
  }
  return data
}

export function printResetImpact(scenario) {
  console.log(`
=== DEMO SEED IMPACT (${scenario}) ===
This command may RESET local preview game state on the local Supabase instance:
  - development-only cruise clock / schedule
  - active catalog (authentic development preview)
  - Drink It! / Ship It! submissions for the preview cruise
  - Gallery / reactions / achievement awards for the preview cruise
It will NEVER target a remote/production database (no bypass flag).
=====================================
`)
}
