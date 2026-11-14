/**
 * QA-2A authenticated browser E2E against disposable Supabase :55321.
 *
 * Prerequisites:
 *   1. Disposable stack listening on :55321 (Ship-It-disposable-mo)
 *   2. .local/qa2a-disposable.env present (gitignored)
 *   3. node scripts/qa2a/setup-synthetics.mjs
 *   4. Seed active schedule from disposable worktree:
 *        LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now -- --hour=14 --day=3
 *   5. Vite serving main app with disposable env on :5177 (see README in report dir)
 *
 *   node scripts/qa2a/run.mjs [--suite=auth|drinkit|shipit|media|network|lifecycle|all]
 *
 * Never sets QA_ALLOW_ORGANIZER_MUTATION. Never targets :54321.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { loadQa2aEnv, REPORT_DIR, EVIDENCE_DIR } from './lib/env.mjs'
import { createRegistry } from './lib/registry.mjs'
import { ensureEvidenceDir } from './lib/browser.mjs'
import { runAuthNavSuite } from './suites/auth-nav.mjs'
import { runDrinkItSuite } from './suites/drinkit.mjs'
import { runShipItSuite } from './suites/shipit.mjs'
import { runMediaSuite } from './suites/media.mjs'
import { runNetworkSuite } from './suites/network.mjs'
import { runLifecycleSuite } from './suites/lifecycle.mjs'

const suiteArg = process.argv.find((a) => a.startsWith('--suite='))?.split('=')[1] || 'all'

async function main() {
  if (process.env.QA_ALLOW_ORGANIZER_MUTATION === '1') {
    throw new Error('REFUSE: unset QA_ALLOW_ORGANIZER_MUTATION')
  }

  const env = await loadQa2aEnv()
  console.log(
    JSON.stringify(
      {
        url: env.url,
        cruise_id: env.cruise.id,
        lifecycle: env.clock?.lifecycle,
        accepting: env.clock?.accepting_submissions,
        baseUrl: env.baseUrl,
        suite: suiteArg,
      },
      null,
      2,
    ),
  )

  // Preflight: base URL reachable
  const ping = await fetch(env.baseUrl).catch((e) => e)
  if (ping instanceof Error || !ping.ok && ping.status >= 500) {
    throw new Error(
      `Vite app not reachable at ${env.baseUrl}. Start with disposable env on 5177 first.`,
    )
  }

  await mkdir(REPORT_DIR, { recursive: true })
  await ensureEvidenceDir()

  const registry = createRegistry()
  const browser = await chromium.launch({ headless: true })

  const runners = {
    auth: runAuthNavSuite,
    drinkit: runDrinkItSuite,
    shipit: runShipItSuite,
    media: runMediaSuite,
    network: runNetworkSuite,
    lifecycle: runLifecycleSuite,
  }

  try {
    const order =
      suiteArg === 'all'
        ? ['auth', 'drinkit', 'shipit', 'media', 'network', 'lifecycle']
        : [suiteArg]
    for (const name of order) {
      const fn = runners[name]
      if (!fn) throw new Error(`Unknown suite ${name}`)
      console.log(`\n=== SUITE ${name} ===`)
      await fn({ browser, env, registry })
    }
  } finally {
    await browser.close()
  }

  const totals = registry.totals()
  const payload = {
    generated_at: new Date().toISOString(),
    env: {
      supabase_url: env.url,
      cruise_id: env.cruise.id,
      base_url: env.baseUrl,
      emulation: 'Chromium mobile — not physical iPhone Safari / Android Chrome',
    },
    totals,
    defects: registry.defects,
    cases: registry.cases,
  }
  await writeFile(join(REPORT_DIR, 'TEST_REGISTRY.json'), JSON.stringify(payload, null, 2))
  await writeFile(
    join(EVIDENCE_DIR, 'run-meta.json'),
    JSON.stringify(
      {
        generated_at: payload.generated_at,
        totals,
        note: 'Screenshots may include synthetic Demo* names only when possible; keep evidence/ gitignored',
      },
      null,
      2,
    ),
  )

  console.log('\n=== TOTALS ===')
  console.log(JSON.stringify(totals, null, 2))
  console.log(`Registry: ${join(REPORT_DIR, 'TEST_REGISTRY.json')}`)
  if (totals.failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
