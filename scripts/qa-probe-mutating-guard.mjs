/**
 * Read-only safety probe: assertDisposableDevEnvironment must refuse the
 * current cwd Supabase target when it is the organizer Wrapped/final fixture
 * or primary :54321 without QA_ALLOW_ORGANIZER_MUTATION=1.
 *
 * Does not seed clock, activate scenarios, or write gameplay rows.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { assertDisposableDevEnvironment } from '../tests/helpers/devEnvironmentGuard.ts'

const password =
  process.env.LOCAL_TEST_PASSWORD ||
  (() => {
    try {
      return readFileSync('.local/runtime-qual-password.txt', 'utf8').trim()
    } catch {
      return ''
    }
  })()

if (!password) {
  console.log(JSON.stringify({ ok: false, reason: 'missing_LOCAL_TEST_PASSWORD' }))
  process.exit(1)
}

const summary = JSON.parse(readFileSync('.local/test-identities.json', 'utf8'))
const envText = await new Promise((resolve, reject) => {
  import('node:child_process').then(({ execSync }) => {
    try {
      resolve(execSync('npx supabase status -o env', { encoding: 'utf8' }))
    } catch (e) {
      reject(e)
    }
  })
})
const anon = envText.match(/^ANON_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
const serviceKey = envText.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')

const fixtures = {
  available: true,
  password,
  summary,
  anonKey: anon,
  serviceRoleKey: serviceKey,
}
const service = createClient(summary.supabase_url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

try {
  const env = await assertDisposableDevEnvironment(fixtures, service)
  console.log(
    JSON.stringify({
      ok: false,
      reason: 'guard_allowed_mutation_target',
      env,
    }),
  )
  process.exit(2)
} catch (e) {
  console.log(
    JSON.stringify({
      ok: true,
      blocked: true,
      message: String(e?.message || e).slice(0, 400),
      supabase_url: summary.supabase_url,
    }),
  )
}
