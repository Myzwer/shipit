/**
 * EXPLICIT future activation only — load working achievements with test_only=false.
 *
 * Phase 10B does NOT run this. Refuses unless both gates are set:
 *   CONFIRM_PRODUCTION_ACHIEVEMENT_LOAD=I_UNDERSTAND_NON_TEST_ONLY
 *   --confirm-non-test-only
 *
 * Does not provision guests, invent companion UUIDs, or enable blocked_organizer rows.
 * Companion mappings (D-086–D-093) must be supplied privately before those rows enable.
 *
 *   CONFIRM_PRODUCTION_ACHIEVEMENT_LOAD=I_UNDERSTAND_NON_TEST_ONLY \
 *     node scripts/load-production-achievements.mjs --confirm-non-test-only
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))

const confirmedEnv = process.env.CONFIRM_PRODUCTION_ACHIEVEMENT_LOAD === 'I_UNDERSTAND_NON_TEST_ONLY'
const confirmedArg = process.argv.includes('--confirm-non-test-only')

if (!confirmedEnv || !confirmedArg) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: 'REFUSED',
        message:
          'Production achievement load is gated. Set CONFIRM_PRODUCTION_ACHIEVEMENT_LOAD=I_UNDERSTAND_NON_TEST_ONLY and pass --confirm-non-test-only. Phase 10B does not activate this path.',
      },
      null,
      2,
    ),
  )
  process.exit(2)
}

function readSupabaseEnv() {
  const raw = execSync('npx supabase status -o env', { encoding: 'utf8' })
  const env = {}
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  return env
}

const mapping = JSON.parse(
  readFileSync(join(__dir, '../content/achievements/productionReleaseMapping.json'), 'utf8'),
)
const catalog = JSON.parse(
  readFileSync(join(__dir, '../content/achievements/workingCatalog.json'), 'utf8'),
)

const sb = readSupabaseEnv()
const url = sb.API_URL || sb.SUPABASE_URL
const serviceRole = sb.SERVICE_ROLE_KEY || sb.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRole) {
  console.error('Could not read Supabase URL/service role.')
  process.exit(1)
}

// Prefer service role calling as admin is not available; this script documents the
// activation contract. Actual cruise activation should use an admin JWT session.
console.error(
  JSON.stringify(
    {
      ok: false,
      code: 'ACTIVATION_NOT_EXECUTED',
      message:
        'Mapping and RPC admin_upsert_launch_achievement_definition are ready. Wire an admin-authenticated runner at cruise activation time. Refusing to auto-write from this service-role helper in Phase 10B.',
      mapping_id: mapping.mapping_id,
      release_enabled: mapping.summary.release_enabled,
      blocked_organizer: mapping.summary.blocked_organizer,
      blocked_metadata: mapping.summary.blocked_metadata,
      catalog_rows: catalog.length,
    },
    null,
    2,
  ),
)
process.exit(3)
