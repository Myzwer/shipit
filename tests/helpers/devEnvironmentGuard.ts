import { execSync } from 'node:child_process'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LocalFixtures } from './localSupabase'

export type DisposableDevEnvironment = {
  supabase_url: string
  cruise_label: string
  cruise_id: string
}

/**
 * Fail closed before any destructive achievement/catalog integration work.
 * Requires a local API URL and an active development-only cruise.
 */
export async function assertDisposableDevEnvironment(
  fixtures: Pick<LocalFixtures, 'available' | 'summary' | 'serviceRoleKey'>,
  service: SupabaseClient,
): Promise<DisposableDevEnvironment> {
  if (!fixtures.available || !fixtures.summary || !fixtures.serviceRoleKey) {
    throw new Error('DISPOSABLE_DEV_REQUIRED: local fixtures unavailable')
  }

  const url = fixtures.summary.supabase_url
  if (!isLocalSupabaseUrl(url)) {
    throw new Error(`DISPOSABLE_DEV_REQUIRED: refusing non-local Supabase URL (${url})`)
  }

  let statusUrl = ''
  try {
    const envText = execSync('npx supabase status -o env', { encoding: 'utf8' })
    statusUrl = envText.match(/^API_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '') ?? ''
  } catch {
    throw new Error('DISPOSABLE_DEV_REQUIRED: could not read local `supabase status`')
  }
  if (!statusUrl || statusUrl !== url) {
    throw new Error(
      `DISPOSABLE_DEV_REQUIRED: fixture URL ${url} does not match local status ${statusUrl || '(missing)'}`,
    )
  }

  const { data: cruise, error } = await service
    .from('cruise_config')
    .select('id, label, is_active')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  if (!cruise || cruise.label !== 'development-only') {
    throw new Error(
      `DISPOSABLE_DEV_REQUIRED: active cruise must be development-only (got ${cruise?.label ?? 'none'})`,
    )
  }

  return {
    supabase_url: url,
    cruise_label: cruise.label,
    cruise_id: cruise.id as string,
  }
}

export function isLocalSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      (parsed.port === '54321' || parsed.port === '')
    )
  } catch {
    return false
  }
}
