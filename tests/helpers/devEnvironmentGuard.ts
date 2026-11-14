import { execSync } from 'node:child_process'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LocalFixtures } from './localSupabase'

export type DisposableDevEnvironment = {
  supabase_url: string
  cruise_label: string
  cruise_id: string
  api_port: string
  lifecycle: string | null
  finalized: boolean
}

/** Local disposable stacks: primary 54321 or isolated alternate 55321. */
const LOCAL_API_PORTS = new Set(['', '54321', '55321'])

/** Alternate disposable API port used by Ship-It-disposable-mo worktree. */
export const DISPOSABLE_ALT_API_PORT = '55321'

/**
 * Fail closed before any destructive achievement/catalog/clock integration work.
 * Requires a local API URL and an active development-only cruise.
 *
 * Safety (QA campaign):
 * - Always refuse finalized / lifecycle=final fixtures (protects Plan C Wrapped).
 * - Primary stack port 54321 requires explicit QA_ALLOW_ORGANIZER_MUTATION=1.
 *   Prefer the isolated 55321 disposable stack for mutating suites.
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

  const apiPort = apiPortFromUrl(url)

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

  const clock = await readLifecycleSnapshot(service)
  if (clock.finalized || clock.lifecycle === 'final') {
    throw new Error(
      'PROTECTED_QA_FIXTURE: refusing mutating tests against finalized/final lifecycle ' +
        `(lifecycle=${clock.lifecycle}, finalized=${clock.finalized}). ` +
        'Use the disposable 55321 stack; do not mutate the organizer Wrapped fixture.',
    )
  }

  if (apiPort === '54321' || apiPort === '') {
    const allowOrganizer = process.env.QA_ALLOW_ORGANIZER_MUTATION === '1'
    if (!allowOrganizer) {
      throw new Error(
        'DISPOSABLE_DEV_REQUIRED: primary stack :54321 blocked for mutating tests. ' +
          `Point fixtures at :${DISPOSABLE_ALT_API_PORT} (Ship-It-disposable-mo) ` +
          'or set QA_ALLOW_ORGANIZER_MUTATION=1 only with an explicit restore plan.',
      )
    }
  }

  return {
    supabase_url: url,
    cruise_label: cruise.label,
    cruise_id: cruise.id as string,
    api_port: apiPort || '54321',
    lifecycle: clock.lifecycle,
    finalized: clock.finalized,
  }
}

export function isLocalSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      LOCAL_API_PORTS.has(parsed.port)
    )
  } catch {
    return false
  }
}

export function apiPortFromUrl(url: string): string {
  try {
    return new URL(url).port
  } catch {
    return ''
  }
}

/** Pure helpers for unit tests — half-open grace window contract from bounty_resolve_at. */
export function isWithinPrivateGrace(args: {
  atUtcMs: number
  prevEndUtcMs: number
  graceMinutes?: number
}): boolean {
  const graceMs = (args.graceMinutes ?? 15) * 60_000
  return args.prevEndUtcMs <= args.atUtcMs && args.prevEndUtcMs > args.atUtcMs - graceMs
}

async function readLifecycleSnapshot(service: SupabaseClient): Promise<{
  lifecycle: string | null
  finalized: boolean
}> {
  const { data, error } = await service.rpc('get_ship_clock_state')
  if (error) {
    // Fall back to game_control if the player/service RPC shape differs.
    const { data: controls, error: ctrlErr } = await service
      .from('game_control')
      .select('status, finalized_at_utc')
    if (ctrlErr) throw error
    const rows = controls ?? []
    const finalized = rows.some((r) => r.finalized_at_utc != null || r.status === 'final')
    const lifecycle = finalized ? 'final' : (rows[0]?.status as string | null) ?? null
    return { lifecycle, finalized }
  }
  const row = data as {
    lifecycle?: string
    finalized?: boolean
    accepting_submissions?: boolean
  } | null
  return {
    lifecycle: row?.lifecycle ?? null,
    finalized: Boolean(row?.finalized),
  }
}
