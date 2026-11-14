/**
 * LOCAL-ONLY cleanup of disposable synthetic player rows that lack Auth linkage.
 *
 * These accumulate when integration fixtures insert players (b2-synth / b4-synth /
 * crew-fill / synthetic-*) and teardown fails on FK blockers such as achievement_awards.
 *
 * Never run against hosted/production. Refuses non-local Supabase URLs.
 *
 * Usage:
 *   node scripts/cleanup-local-synthetic-players.mjs           # dry-run
 *   node scripts/cleanup-local-synthetic-players.mjs --apply   # mutate
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const APPLY = process.argv.includes('--apply')

function isLocalUrl(url) {
  try {
    const u = new URL(url)
    return (
      u.hostname === '127.0.0.1' ||
      u.hostname === 'localhost' ||
      u.hostname === '0.0.0.0' ||
      u.hostname.endsWith('.local')
    )
  } catch {
    return false
  }
}

function loadEnv() {
  const envText = execSync('npx supabase status -o env', { encoding: 'utf8' })
  const apiUrl = envText.match(/^API_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
  const serviceKey = envText.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
  const dbUrl = envText.match(/^DB_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
  if (!apiUrl || !serviceKey || !dbUrl) throw new Error('missing local supabase env')
  if (!isLocalUrl(apiUrl) || !isLocalUrl(dbUrl.replace(/^postgresql:/, 'http:'))) {
    throw new Error(`refusing non-local supabase url: ${apiUrl}`)
  }
  return { apiUrl, serviceKey, dbUrl }
}

const SYNTH_ALIAS =
  /^(b2-synth-|b4-synth-|crew-fill-|crew-synth-|synthetic-|roster\.create\.|roster\.reset\.)/i
const SYNTH_NAME =
  /^(B2 Synth |B4 Synth |Crew Fill |Crew Synth |Synthetic |Roster Create |Roster Reset )/

async function main() {
  const { apiUrl, serviceKey } = loadEnv()
  const service = createClient(apiUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  })

  const summaryPath = join(process.cwd(), '.local', 'test-identities.json')
  const { readFileSync } = await import('node:fs')
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
  const rosterIds = new Set(summary.identities.map((i) => i.player_id))
  const rosterAliases = new Set(
    summary.identities.map((i) => String(i.login_alias || '').toLowerCase()),
  )

  const { count: authLinkedBefore } = await service
    .from('players')
    .select('*', { count: 'exact', head: true })
    .not('auth_user_id', 'is', null)
  const { count: playersBefore } = await service
    .from('players')
    .select('*', { count: 'exact', head: true })

  const { data: candidates, error } = await service
    .from('players')
    .select('id,display_name,login_alias,auth_user_id,active')
    .is('auth_user_id', null)
  if (error) throw error

  const disposable = []
  const ambiguous = []
  for (const row of candidates ?? []) {
    if (rosterIds.has(row.id) || rosterAliases.has(String(row.login_alias || '').toLowerCase())) {
      ambiguous.push({ ...row, reason: 'matches_private_roster' })
      continue
    }
    const alias = String(row.login_alias || '')
    const name = String(row.display_name || '')
    if (SYNTH_ALIAS.test(alias) || SYNTH_NAME.test(name)) {
      disposable.push(row)
    } else {
      ambiguous.push({ ...row, reason: 'unrecognized_orphan' })
    }
  }

  const ids = disposable.map((r) => r.id)
  let awardCount = 0
  let crewMemberCount = 0
  for (let i = 0; i < ids.length; i += 150) {
    const batch = ids.slice(i, i + 150)
    const awards = await service
      .from('achievement_awards')
      .select('*', { count: 'exact', head: true })
      .in('owner_player_id', batch)
    awardCount += awards.count || 0
    const crews = await service
      .from('bar_bounty_crew_members')
      .select('*', { count: 'exact', head: true })
      .in('player_id', batch)
    crewMemberCount += crews.count || 0
  }

  const { data: synthTeams } = await service
    .from('teams')
    .select('id,name')
    .like('name', 'Crew Synth%')

  const report = {
    mode: APPLY ? 'apply' : 'dry-run',
    apiUrl,
    before: {
      players: playersBefore,
      auth_linked_players: authLinkedBefore,
      private_roster: summary.identities.length,
    },
    disposable_players: disposable.length,
    ambiguous_players: ambiguous.length,
    disposable_achievement_awards: awardCount,
    disposable_crew_members: crewMemberCount,
    crew_synth_teams: (synthTeams ?? []).map((t) => t.name),
    ambiguous_sample: ambiguous.slice(0, 20),
    disposable_alias_prefixes: Object.fromEntries(
      Object.entries(
        disposable.reduce((acc, row) => {
          const alias = String(row.login_alias || '')
          const prefix = alias.split('-').slice(0, 2).join('-') || '(none)'
          acc[prefix] = (acc[prefix] || 0) + 1
          return acc
        }, {}),
      ).sort((a, b) => b[1] - a[1]),
    ),
  }

  await mkdir(join(process.cwd(), '.local'), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(process.cwd(), '.local', `synthetic-cleanup-backup-${stamp}.json`)
  await writeFile(
    backupPath,
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        disposable,
        ambiguous,
        synthTeams,
      },
      null,
      2,
    ),
  )
  report.backup = backupPath

  console.log(JSON.stringify(report, null, 2))

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to delete disposable rows.')
    return
  }

  if (ambiguous.length) {
    console.log(`Leaving ${ambiguous.length} ambiguous orphan(s) untouched.`)
  }
  if (!ids.length) {
    console.log('Nothing to delete.')
    return
  }

  // Delete dependents then players in batches (service role).
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const a = await service.from('achievement_awards').delete().in('owner_player_id', batch)
    if (a.error) throw a.error
    const c = await service.from('bar_bounty_crew_members').delete().in('player_id', batch)
    if (c.error) throw c.error
    const g = await service.from('game_memberships').delete().in('player_id', batch)
    if (g.error) throw g.error
    const t = await service.from('team_memberships').delete().in('player_id', batch)
    if (t.error) throw t.error
    const access = await service.from('admin_roster_access_requests').delete().in('player_id', batch)
    if (access.error) throw access.error
    const authReq = await service.from('admin_roster_auth_requests').delete().in('player_id', batch)
    if (authReq.error) throw authReq.error
    const p = await service.from('players').delete().in('id', batch)
    if (p.error) throw p.error
  }

  // Remove empty Crew Synth teams only (never Team 1–6 or Demo teams with history).
  for (const team of synthTeams ?? []) {
    const { count } = await service
      .from('team_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id)
    if ((count || 0) === 0) {
      const del = await service.from('teams').delete().eq('id', team.id)
      if (del.error) {
        // Team may still be referenced by historical rows; leave it.
        console.warn('team delete skipped', team.name, del.error.message)
      }
    }
  }

  const { count: playersAfter } = await service
    .from('players')
    .select('*', { count: 'exact', head: true })
  const { count: authLinkedAfter } = await service
    .from('players')
    .select('*', { count: 'exact', head: true })
    .not('auth_user_id', 'is', null)

  // Integrity: every private roster id still present
  const { data: stillThere, error: checkErr } = await service
    .from('players')
    .select('id')
    .in('id', [...rosterIds])
  if (checkErr) throw checkErr
  if ((stillThere ?? []).length !== rosterIds.size) {
    throw new Error('INTEGRITY FAILURE: private roster player missing after cleanup')
  }

  console.log(
    JSON.stringify(
      {
        after: {
          players: playersAfter,
          auth_linked_players: authLinkedAfter,
          private_roster_present: stillThere.length,
          deleted_players: ids.length,
        },
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
