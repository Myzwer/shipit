/**
 * QA-2A disposable-only environment loader.
 * Hard-refuses organizer :54321 and QA_ALLOW_ORGANIZER_MUTATION=1.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
export const ROOT = root
export const DISPOSABLE_WORKDIR =
  process.env.QA_DISPOSABLE_WORKDIR ||
  '/Users/josh/Documents/Web Projects/Vue/Ship-It-disposable-mo'
export const EVIDENCE_DIR = join(root, 'docs/qa/campaign/qa2a-browser-e2e/evidence')
export const REPORT_DIR = join(root, 'docs/qa/campaign/qa2a-browser-e2e')

async function loadEnvFile(path) {
  const env = {}
  try {
    const raw = await readFile(path, 'utf8')
    for (const line of raw.split('\n')) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
      env[line.slice(0, i)] = line.slice(i + 1)
    }
  } catch {
    /* optional */
  }
  return env
}

export async function loadQa2aEnv() {
  if (process.env.QA_ALLOW_ORGANIZER_MUTATION === '1') {
    throw new Error('REFUSE: QA_ALLOW_ORGANIZER_MUTATION must not be set for QA-2A')
  }

  const fileEnv = await loadEnvFile(join(root, '.local/qa2a-disposable.env'))
  const url = fileEnv.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = fileEnv.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = fileEnv.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const password = fileEnv.LOCAL_TEST_PASSWORD || process.env.LOCAL_TEST_PASSWORD
  // Prefer in-repo relative default so paths with spaces cannot be mangled by
  // an unquoted shell export of QA_E2E_IDENTITIES.
  const identitiesPath = join(root, '.local/qa2a-identities.json')
  void fileEnv.QA_E2E_IDENTITIES
  void process.env.QA_E2E_IDENTITIES

  if (!url || !anonKey || !serviceKey || !password) {
    throw new Error('Missing disposable VITE_SUPABASE_URL / anon / service / password')
  }
  if (!url.includes(':55321') || url.includes(':54321')) {
    throw new Error(`REFUSE: QA-2A requires disposable :55321 (got ${url})`)
  }

  const status = spawnSync('npx', ['supabase', 'status', '-o', 'env'], {
    cwd: DISPOSABLE_WORKDIR,
    encoding: 'utf8',
  })
  const statusUrl = status.stdout.match(/^API_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
  if (statusUrl !== url) {
    throw new Error(`REFUSE: disposable status mismatch status=${statusUrl} env=${url}`)
  }

  const summary = JSON.parse(await readFile(identitiesPath, 'utf8'))
  if (!String(summary.supabase_url).includes(':55321')) {
    throw new Error(`REFUSE: identities not disposable (${summary.supabase_url})`)
  }

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  })
  const { data: cruise, error: cruiseErr } = await service
    .from('cruise_config')
    .select('id, label, is_active')
    .eq('is_active', true)
    .maybeSingle()
  if (cruiseErr) throw cruiseErr
  if (!cruise || cruise.label !== 'development-only') {
    throw new Error(`REFUSE: active cruise must be development-only (got ${cruise?.label})`)
  }
  if (cruise.id === '48fa40c6-e7cd-4f8f-8b81-e3e48d10eb13') {
    throw new Error('REFUSE: organizer cruise id detected')
  }

  const { data: clock, error: clockErr } = await service.rpc('get_ship_clock_state')
  if (clockErr) throw clockErr

  return {
    url,
    anonKey,
    serviceKey,
    password,
    summary,
    service,
    cruise,
    clock,
    identitiesPath,
    baseUrl: process.env.QA_E2E_BASE_URL || 'http://127.0.0.1:5177',
  }
}

export function identity(summary, key) {
  const row = summary.identities.find((i) => i.key === key)
  if (!row) throw new Error(`missing identity ${key}`)
  return row
}

export const VIEWPORTS = [
  { id: 'w360', width: 360, height: 800 },
  { id: 'w390', width: 390, height: 844 },
  { id: 'w402', width: 402, height: 874 },
  { id: 'w430', width: 430, height: 932 },
]
