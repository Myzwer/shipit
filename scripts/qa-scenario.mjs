/**
 * QA scenario harness — inspect / snapshot / prepare / activate / restore.
 *
 * Development-only. Local Supabase only. No automatic switching.
 * Prefer verified snapshots (public schema + storage.objects metadata + Storage files)
 * over ordinary Ship Clock tweaks. Auth identities stay shared across local scenarios.
 *
 *   npm run qa:inspect
 *   npm run qa:snapshot -- save <name> --confirm-env=local-development-only
 *   npm run qa:snapshot -- restore <name> --confirm-env=local-development-only
 *   npm run qa:prepare -- <tuesday|precruise|wrapped> --confirm-env=local-development-only
 *   npm run qa:activate -- <tuesday|precruise|wrapped> --confirm-env=local-development-only
 *
 * prepare: builds/refreshes a named snapshot. For precruise/wrapped it temporarily
 * seeds that scenario, snapshots it, then restores the organizer Tuesday snapshot
 * so the active review environment is not left switched.
 *
 * activate: restores a prepared snapshot into the running local DB (explicit only).
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { execFileSync, execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ws from 'ws'
import {
  assertDevelopmentOnlyCruise,
  assertLocalSupabaseUrl,
  readSupabaseEnv,
} from './lib/demoLocalSafety.mjs'
import {
  QA_CONFIRM_ENV,
  QA_SCENARIO_NAMES,
  assertQaScenarioName,
  requireConfirmEnv,
} from './lib/qaScenarioSafety.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')
const slotsRoot = join(root, '.local/qa-scenarios')
const ORGANIZER_SLOT = 'tuesday'
const DB_CONTAINER = 'supabase_db_star-princess-local'
const STORAGE_VOLUME = 'supabase_storage_star-princess-local'

const DEMO_SEED_ALIAS = {
  tuesday: 'tuesday',
  precruise: 'precruise',
  wrapped: 'wrapped',
}

function usage(exitCode = 1) {
  console.error(`Usage:
  node scripts/qa-scenario.mjs inspect
  node scripts/qa-scenario.mjs snapshot save <name> --confirm-env=${QA_CONFIRM_ENV}
  node scripts/qa-scenario.mjs snapshot restore <name> --confirm-env=${QA_CONFIRM_ENV}
  node scripts/qa-scenario.mjs prepare <tuesday|precruise|wrapped> --confirm-env=${QA_CONFIRM_ENV}
  node scripts/qa-scenario.mjs activate <tuesday|precruise|wrapped> --confirm-env=${QA_CONFIRM_ENV}
  node scripts/qa-scenario.mjs list
`)
  process.exit(exitCode)
}

function dockerBin() {
  const candidates = [
    `${process.env.HOME}/.docker/bin`,
    '/Applications/Docker.app/Contents/Resources/bin',
    '/usr/local/bin',
  ]
  return [...candidates, process.env.PATH || ''].join(':')
}

function run(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dockerBin()}:${process.env.PATH || ''}` },
    stdio: opts.stdio ?? 'pipe',
    ...opts,
  })
}

function slotDir(name) {
  return join(slotsRoot, name)
}

function slotPaths(name) {
  const dir = slotDir(name)
  return {
    dir,
    manifest: join(dir, 'manifest.json'),
    dump: join(dir, 'postgres.dump'),
    storageObjects: join(dir, 'storage-objects.dump'),
    storage: join(dir, 'storage.tar.gz'),
    inspect: join(dir, 'inspect.json'),
  }
}

function assertCompleteSnapshot(paths, name) {
  const missing = []
  if (!existsSync(paths.manifest)) missing.push('manifest.json')
  if (!existsSync(paths.dump)) missing.push('postgres.dump')
  if (!existsSync(paths.storageObjects)) missing.push('storage-objects.dump')
  if (!existsSync(paths.storage)) missing.push('storage.tar.gz')
  if (missing.length) {
    throw new Error(
      `QA_SAFETY: incomplete snapshot for "${name}" (missing ${missing.join(', ')}). Re-run qa:prepare / qa:snapshot save.`,
    )
  }
}

function createService() {
  const sbEnv = readSupabaseEnv()
  const url = sbEnv.API_URL || sbEnv.SUPABASE_URL
  const serviceRole = sbEnv.SERVICE_ROLE_KEY || sbEnv.SUPABASE_SERVICE_ROLE_KEY
  assertLocalSupabaseUrl(url)
  if (!serviceRole) throw new Error('QA_SAFETY: missing local SERVICE_ROLE_KEY')
  const service = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  })
  return { service, sbEnv, url }
}

async function inspectEnvironment(service) {
  const cruise = await assertDevelopmentOnlyCruise(service)
  const { data: clock, error: clockErr } = await service.rpc('get_ship_clock_state')
  if (clockErr) throw clockErr

  const { count: players } = await service
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)
  const { data: memberships } = await service
    .from('game_memberships')
    .select('player_id, game, enabled')
    .eq('enabled', true)
  const { data: activePlayers } = await service.from('players').select('id').eq('active', true)
  const activeIds = new Set((activePlayers || []).map((p) => p.id))
  const drinkit = (memberships || []).filter((m) => m.game === 'drinkit' && activeIds.has(m.player_id))
    .length
  const shipit = (memberships || []).filter((m) => m.game === 'shipit' && activeIds.has(m.player_id))
    .length

  const { data: gc } = await service
    .from('game_control')
    .select('game, status, finalized_at_utc')
    .in('game', ['drinkit', 'shipit'])

  const { count: awards } = await service
    .from('achievement_awards')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  const { count: gallery } = await service
    .from('gallery_events')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)
  const { count: photos } = await service.from('photos').select('id', { count: 'exact', head: true })
  const { count: defs } = await service
    .from('achievement_definitions')
    .select('id', { count: 'exact', head: true })
    .eq('enabled', true)

  const games = Object.fromEntries((gc || []).map((r) => [r.game, r]))
  const inferred =
    clock?.finalized || games.drinkit?.status === 'final' || games.shipit?.status === 'final'
      ? 'wrapped'
      : clock?.lifecycle === 'pre_cruise'
        ? 'precruise'
        : clock?.cruise_day === 4 && clock?.lifecycle === 'active'
          ? 'tuesday'
          : 'unknown'

  return {
    captured_at: new Date().toISOString(),
    inferred_scenario: inferred,
    cruise: cruise
      ? {
          id: cruise.id,
          label: cruise.label,
          is_active: cruise.is_active,
        }
      : null,
    clock: {
      cruise_day: clock?.cruise_day ?? null,
      ship_date: clock?.ship_date ?? null,
      ship_local: clock?.ship_local ?? null,
      lifecycle: clock?.lifecycle ?? null,
      finalized: Boolean(clock?.finalized),
      accepting_submissions: Boolean(clock?.accepting_submissions),
      offset_minutes: clock?.offset_minutes ?? null,
      day1_ship_date: clock?.day1_ship_date ?? null,
      finale_at_utc: clock?.finale_at_utc ?? null,
    },
    game_control: games,
    counts: {
      active_players: players ?? 0,
      drinkit_members: drinkit,
      shipit_members: shipit,
      active_awards: awards ?? 0,
      gallery_events: gallery ?? 0,
      photos: photos ?? 0,
      enabled_achievements: defs ?? 0,
    },
  }
}

function fingerprintInspect(inspect) {
  const material = JSON.stringify({
    inferred_scenario: inspect.inferred_scenario,
    cruise_day: inspect.clock.cruise_day,
    lifecycle: inspect.clock.lifecycle,
    finalized: inspect.clock.finalized,
    day1: inspect.clock.day1_ship_date,
    offset: inspect.clock.offset_minutes,
    counts: inspect.counts,
    game_control: inspect.game_control,
  })
  return createHash('sha256').update(material).digest('hex').slice(0, 16)
}

function ensureDockerDb() {
  const names = run('docker ps --format "{{.Names}}"')
  if (!names.split('\n').includes(DB_CONTAINER)) {
    throw new Error(`QA_SAFETY: database container ${DB_CONTAINER} is not running`)
  }
}

function dumpPostgres(destFile) {
  ensureDockerDb()
  const remote = '/tmp/qa-scenario.dump'
  run(`docker exec ${DB_CONTAINER} rm -f ${remote}`)
  // Public schema: cruise/gameplay/roster/photo rows (incl. framing). Auth stays shared.
  run(
    `docker exec ${DB_CONTAINER} pg_dump -U postgres -Fc --no-owner --no-acl --schema=public -f ${remote} postgres`,
  )
  run(`docker cp ${DB_CONTAINER}:${remote} "${destFile}"`)
  run(`docker exec ${DB_CONTAINER} rm -f ${remote}`)
}

function dumpStorageObjects(destFile) {
  ensureDockerDb()
  const remote = '/tmp/qa-storage-objects.dump'
  run(`docker exec ${DB_CONTAINER} rm -f ${remote}`)
  // storage.objects is owned by supabase_storage_admin; dump as supabase_admin (superuser).
  // Signed URL creation requires these rows in addition to volume files.
  run(
    `docker exec ${DB_CONTAINER} pg_dump -U supabase_admin -Fc --data-only --table=storage.objects -f ${remote} postgres`,
  )
  run(`docker cp ${DB_CONTAINER}:${remote} "${destFile}"`)
  run(`docker exec ${DB_CONTAINER} rm -f ${remote}`)
}

function restorePostgres(dumpFile) {
  ensureDockerDb()
  if (!existsSync(dumpFile)) throw new Error(`Missing dump: ${dumpFile}`)
  const remote = '/tmp/qa-scenario-restore.dump'
  run(`docker cp "${dumpFile}" ${DB_CONTAINER}:${remote}`)
  // Storage policies reference public.photos, so --clean DROP fails.
  // Truncate public data, then load with triggers/FKs deferred as supabase_admin.
  try {
    run(
      `docker exec ${DB_CONTAINER} psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "SET session_replication_role = replica; DO \\$\\$ DECLARE stmts text; BEGIN SELECT 'TRUNCATE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' CASCADE' INTO stmts FROM pg_tables WHERE schemaname = 'public'; IF stmts IS NOT NULL THEN EXECUTE stmts; END IF; END \\$\\$; SET session_replication_role = DEFAULT;"`,
    )
    // --disable-triggers requires a superuser role (supabase_admin).
    run(
      `docker exec ${DB_CONTAINER} pg_restore -U supabase_admin --data-only --disable-triggers --no-owner --no-acl --schema=public -d postgres ${remote}`,
      { stdio: 'inherit' },
    )
  } catch (err) {
    run(`docker exec ${DB_CONTAINER} rm -f ${remote}`)
    throw new Error(
      `QA_SAFETY: public data restore failed (${err.status || err.message}). Refusing to continue with a partial public schema.`,
    )
  }
  run(`docker exec ${DB_CONTAINER} rm -f ${remote}`)
}

function restoreStorageObjects(dumpFile) {
  ensureDockerDb()
  if (!existsSync(dumpFile)) throw new Error(`Missing storage.objects dump: ${dumpFile}`)
  const remote = '/tmp/qa-storage-objects-restore.dump'
  run(`docker cp "${dumpFile}" ${DB_CONTAINER}:${remote}`)
  // storage.protect_delete blocks ordinary DELETE. Bypass as supabase_admin via
  // session_replication_role, then data-only insert from the snapshot dump.
  try {
    run(
      `docker exec ${DB_CONTAINER} psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "SET session_replication_role = replica; DELETE FROM storage.objects; SET session_replication_role = DEFAULT;"`,
    )
    run(
      `docker exec ${DB_CONTAINER} pg_restore -U supabase_admin --data-only --no-owner --no-acl -d postgres ${remote}`,
      { stdio: 'inherit' },
    )
  } catch (err) {
    run(`docker exec ${DB_CONTAINER} rm -f ${remote}`)
    throw new Error(
      `QA_SAFETY: storage.objects restore failed (${err.status || err.message}). Snapshot is not media-complete.`,
    )
  }
  run(`docker exec ${DB_CONTAINER} rm -f ${remote}`)
}

function dumpStorage(destFile) {
  run(
    `docker run --rm -v ${STORAGE_VOLUME}:/data -v "${dirname(destFile)}":/backup alpine tar czf /backup/${basenameSafe(destFile)} -C /data .`,
    { stdio: 'inherit' },
  )
}

function restoreStorage(archiveFile) {
  if (!existsSync(archiveFile)) throw new Error(`Missing storage archive: ${archiveFile}`)
  // Replace volume contents with snapshot files.
  run(
    `docker run --rm -v ${STORAGE_VOLUME}:/data -v "${dirname(archiveFile)}":/backup alpine sh -c "rm -rf /data/* /data/.[!.]* /data/..?* 2>/dev/null; tar xzf /backup/${basenameSafe(archiveFile)} -C /data"`,
    { stdio: 'inherit' },
  )
}

function basenameSafe(p) {
  return p.split(/[/\\]/).pop()
}

function fileMeta(path) {
  if (!existsSync(path)) return null
  const st = statSync(path)
  return { bytes: st.size, mtime: st.mtime.toISOString() }
}

async function saveSnapshot(name, { role = 'manual', seedScenario = null } = {}) {
  assertQaScenarioName(name)
  mkdirSync(slotsRoot, { recursive: true })
  const paths = slotPaths(name)
  mkdirSync(paths.dir, { recursive: true })

  const { service } = createService()
  await assertDevelopmentOnlyCruise(service)
  const inspect = await inspectEnvironment(service)
  writeFileSync(paths.inspect, JSON.stringify(inspect, null, 2))

  console.log(`Saving Postgres public dump → ${paths.dump}`)
  dumpPostgres(paths.dump)
  console.log(`Saving storage.objects metadata → ${paths.storageObjects}`)
  dumpStorageObjects(paths.storageObjects)
  console.log(`Saving Storage volume → ${paths.storage}`)
  dumpStorage(paths.storage)

  const manifest = {
    schema_version: 2,
    scenario: name,
    role,
    seed_scenario: seedScenario,
    created_at: new Date().toISOString(),
    confirm_env: QA_CONFIRM_ENV,
    includes: {
      postgres_public_schema: true,
      storage_objects_rows: true,
      storage_files: true,
      auth_schemas: false,
      auth_identities_shared_local: true,
      photo_framing_in_public_photos: true,
    },
    restore_replaces: [
      'Local Postgres public schema (cruise, clock, memberships, submissions, awards, gallery, photos rows + framing, catalogs, etc.)',
      'storage.objects rows (signed-URL metadata) via supabase_admin data-only replace',
      'Local Supabase Storage volume file contents for game-photos and related buckets',
    ],
    restore_does_not: [
      'Remote/production databases',
      'Auth schema rebuild (local QA scenarios share the provisioned Auth identities)',
      'storage.buckets / Storage schema DDL ownership',
      'Git working tree / Visual Fidelity uncommitted files',
      'Vite .env contents',
      'private/roster or private/photos source folders (only previously uploaded Storage objects)',
    ],
    fingerprint: fingerprintInspect(inspect),
    inspect_summary: {
      inferred_scenario: inspect.inferred_scenario,
      cruise_day: inspect.clock.cruise_day,
      lifecycle: inspect.clock.lifecycle,
      finalized: inspect.clock.finalized,
      counts: inspect.counts,
    },
    artifacts: {
      postgres: fileMeta(paths.dump),
      storage_objects: fileMeta(paths.storageObjects),
      storage: fileMeta(paths.storage),
      inspect: 'inspect.json',
    },
  }
  writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2))
  console.log(`Snapshot saved: ${name} (fingerprint ${manifest.fingerprint})`)
  return { manifest, inspect, paths }
}

async function restoreSnapshot(name, { expectScenario = null } = {}) {
  assertQaScenarioName(name)
  const paths = slotPaths(name)
  assertCompleteSnapshot(paths, name)
  const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8'))
  if (manifest.scenario !== name) {
    throw new Error(`QA_SAFETY: manifest scenario mismatch (${manifest.scenario} vs ${name})`)
  }
  if (expectScenario && manifest.inspect_summary?.inferred_scenario) {
    console.log(
      `Restoring ${name} (prepared inferred=${manifest.inspect_summary.inferred_scenario})`,
    )
  }

  console.log(`
=== QA SNAPSHOT RESTORE (${name}) ===
Replaces local public schema, storage.objects rows, and Storage volume files.
Auth identities are shared (not rebuilt). Requires --confirm-env=${QA_CONFIRM_ENV}.
=====================================
`)

  restorePostgres(paths.dump)
  restoreStorageObjects(paths.storageObjects)
  restoreStorage(paths.storage)

  const { service } = createService()
  const inspect = await inspectEnvironment(service)
  const fp = fingerprintInspect(inspect)
  const okLifecycle =
    name === 'tuesday'
      ? inspect.inferred_scenario === 'tuesday' ||
        (inspect.clock.cruise_day === 4 && inspect.clock.lifecycle === 'active' && !inspect.clock.finalized)
      : name === 'precruise'
        ? inspect.clock.lifecycle === 'pre_cruise' || inspect.inferred_scenario === 'precruise'
        : inspect.clock.finalized || inspect.inferred_scenario === 'wrapped'

  const result = {
    restored: name,
    fingerprint_now: fp,
    fingerprint_saved: manifest.fingerprint,
    fingerprint_match: fp === manifest.fingerprint,
    lifecycle_ok: Boolean(okLifecycle),
    ok: Boolean(okLifecycle),
    inspect,
  }
  writeFileSync(join(paths.dir, 'last-restore.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ ...result, inspect: result.inspect }, null, 2))
  if (!result.lifecycle_ok) {
    throw new Error(
      `QA_SAFETY: restore of "${name}" failed lifecycle verification (inferred=${inspect.inferred_scenario}, day=${inspect.clock.cruise_day}, lifecycle=${inspect.clock.lifecycle}, finalized=${inspect.clock.finalized}).`,
    )
  }
  if (!result.fingerprint_match) {
    console.warn(
      'QA WARNING: fingerprint drifted vs saved snapshot (counts/clock may differ if wall clock moved). Lifecycle still matched.',
    )
  }
  return result
}

function readPassword() {
  const fromEnv = process.env.LOCAL_TEST_PASSWORD || process.env.PRIVATE_ROSTER_PASSWORD
  if (fromEnv && fromEnv.length >= 12) return fromEnv
  const file = join(root, '.local/runtime-qual-password.txt')
  if (existsSync(file)) {
    const pw = readFileSync(file, 'utf8').trim()
    if (pw.length >= 12) return pw
  }
  throw new Error('Set LOCAL_TEST_PASSWORD (≥12) or provide .local/runtime-qual-password.txt')
}

function runDemoSeed(scenarioKey) {
  const password = readPassword()
  console.log(`Seeding demo scenario via demo-seed: ${scenarioKey}`)
  execFileSync('node', ['scripts/demo-seed.mjs', '--scenario', scenarioKey], {
    cwd: root,
    env: { ...process.env, LOCAL_TEST_PASSWORD: password },
    stdio: 'inherit',
  })
}

function looksLikeTuesdayMidgame(inspect) {
  return (
    inspect.inferred_scenario === 'tuesday' ||
    (inspect.clock.cruise_day === 4 &&
      inspect.clock.lifecycle === 'active' &&
      !inspect.clock.finalized)
  )
}

async function prepareScenario(name) {
  assertQaScenarioName(name)
  const forceReseed = process.argv.includes('--reseed')
  const { service } = createService()
  await assertDevelopmentOnlyCruise(service)

  // Always protect the organizer Tuesday slot before mutating away from it.
  const before = await inspectEnvironment(service)
  const tuesdayPaths = slotPaths(ORGANIZER_SLOT)
  let hasTuesdaySnapshot = false
  try {
    assertCompleteSnapshot(tuesdayPaths, ORGANIZER_SLOT)
    hasTuesdaySnapshot = true
  } catch {
    hasTuesdaySnapshot = false
  }

  // Tuesday preparation: snapshot the live organizer review environment by default.
  // Do NOT re-seed unless --reseed is explicit (preserves curated midgame content).
  if (name === ORGANIZER_SLOT) {
    if (!looksLikeTuesdayMidgame(before) && !forceReseed) {
      throw new Error(
        'QA_SAFETY: live environment is not Tuesday midgame. Refusing tuesday prepare without --reseed.',
      )
    }
    if (forceReseed) {
      console.warn('QA: --reseed will rebuild Tuesday via demo-seed (destructive to live preview DB).')
      runDemoSeed(DEMO_SEED_ALIAS.tuesday)
    } else {
      console.log(
        'Capturing live Tuesday organizer review environment (no reseed; preserves current midgame data).',
      )
    }
    await saveSnapshot(ORGANIZER_SLOT, {
      role: forceReseed ? 'prepared-fixture' : 'organizer-review-baseline',
      seedScenario: forceReseed ? 'tuesday' : null,
    })
    return
  }

  if (!hasTuesdaySnapshot) {
    if (looksLikeTuesdayMidgame(before)) {
      console.log('No tuesday snapshot yet — capturing organizer review environment first…')
      await saveSnapshot(ORGANIZER_SLOT, { role: 'organizer-review-baseline' })
    } else {
      throw new Error(
        'QA_SAFETY: refusing to prepare non-tuesday scenario without an existing tuesday snapshot while the live environment is not Tuesday midgame. Save tuesday first.',
      )
    }
  } else if (looksLikeTuesdayMidgame(before)) {
    console.log('Refreshing tuesday organizer snapshot before temporary switch…')
    await saveSnapshot(ORGANIZER_SLOT, { role: 'organizer-review-baseline' })
  }

  const seedKey = DEMO_SEED_ALIAS[name]
  runDemoSeed(seedKey)
  await saveSnapshot(name, { role: 'prepared-fixture', seedScenario: seedKey })

  console.log('Restoring organizer Tuesday snapshot (do not leave review env switched)…')
  await restoreSnapshot(ORGANIZER_SLOT)
  const after = await inspectEnvironment(createService().service)
  if (!looksLikeTuesdayMidgame(after)) {
    throw new Error(
      `QA_SAFETY: failed to restore Tuesday after preparing ${name}. inferred=${after.inferred_scenario} day=${after.clock.cruise_day} lifecycle=${after.clock.lifecycle}`,
    )
  }
  console.log('Tuesday organizer review environment restored.')
}

async function activateScenario(name) {
  assertQaScenarioName(name)
  const paths = slotPaths(name)
  if (!existsSync(paths.manifest)) {
    throw new Error(`No prepared snapshot for "${name}". Run: npm run qa:prepare -- ${name} --confirm-env=${QA_CONFIRM_ENV}`)
  }
  // Safety net: refresh tuesday snapshot if activating away from it and live looks like tuesday.
  if (name !== ORGANIZER_SLOT) {
    const { service } = createService()
    const live = await inspectEnvironment(service)
    if (
      live.inferred_scenario === 'tuesday' ||
      (live.clock.cruise_day === 4 && live.clock.lifecycle === 'active' && !live.clock.finalized)
    ) {
      console.log('Capturing pre-activate tuesday safety snapshot…')
      await saveSnapshot(ORGANIZER_SLOT, { role: 'pre-activate-safety' })
    }
  }
  return restoreSnapshot(name, { expectScenario: name })
}

function listSnapshots() {
  mkdirSync(slotsRoot, { recursive: true })
  const names = readdirSync(slotsRoot).filter((n) => existsSync(join(slotsRoot, n, 'manifest.json')))
  const rows = names.map((n) => {
    const m = JSON.parse(readFileSync(join(slotsRoot, n, 'manifest.json'), 'utf8'))
    return {
      name: n,
      created_at: m.created_at,
      inferred: m.inspect_summary?.inferred_scenario,
      fingerprint: m.fingerprint,
      postgres_bytes: m.artifacts?.postgres?.bytes ?? null,
      storage_bytes: m.artifacts?.storage?.bytes ?? null,
    }
  })
  console.log(JSON.stringify({ slots_root: slotsRoot, snapshots: rows }, null, 2))
}

// --- CLI ---
const [cmd, arg1, arg2] = process.argv.slice(2)
if (!cmd || cmd === 'help' || cmd === '--help') usage(0)

if (cmd === 'inspect') {
  const { service } = createService()
  const inspect = await inspectEnvironment(service)
  console.log(JSON.stringify(inspect, null, 2))
  process.exit(0)
}

if (cmd === 'list') {
  listSnapshots()
  process.exit(0)
}

if (cmd === 'snapshot') {
  requireConfirmEnv()
  if (arg1 === 'save') {
    if (!arg2) usage()
    await saveSnapshot(assertQaScenarioName(arg2), { role: 'manual' })
    process.exit(0)
  }
  if (arg1 === 'restore') {
    if (!arg2) usage()
    await restoreSnapshot(assertQaScenarioName(arg2))
    process.exit(0)
  }
  usage()
}

if (cmd === 'prepare') {
  requireConfirmEnv()
  if (!arg1) usage()
  await prepareScenario(assertQaScenarioName(arg1))
  process.exit(0)
}

if (cmd === 'activate') {
  requireConfirmEnv()
  if (!arg1) usage()
  console.warn(`
*** ACTIVATE changes the LIVE local review database to "${arg1}".
*** Organizer authorization required before leaving Pre-Cruise or Wrapped active.
*** Prefer prepare (which restores Tuesday) unless switching was explicitly approved.
`)
  await activateScenario(assertQaScenarioName(arg1))
  process.exit(0)
}

usage()
