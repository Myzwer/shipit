/**
 * QA-3A — Launch configuration contracts (static / content).
 * Does NOT invent missing organizer values. Does NOT mutate cruise_config.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { previewCatalogImport, isReadyToStage } from '@/lib/catalog'

const ROOT = join(__dirname, '../../..')

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

describe('Launch configuration — catalog content (verified in-repo)', () => {
  it('launch-candidate catalog exists and is client-ready to stage', () => {
    const path = join(ROOT, 'content/catalogs/launch-candidate-v1.json')
    expect(existsSync(path)).toBe(true)
    const doc = JSON.parse(readFileSync(path, 'utf8'))
    const preview = previewCatalogImport(doc)
    expect(preview.schemaErrors).toEqual([])
    expect(isReadyToStage(preview)).toBe(true)
    expect(doc.catalog_id).toBe('star-princess-launch-candidate-v1')
    expect(doc.schema_version).toBe('1.1')
  })

  it('launch candidate excludes Mobile Order virtual bar from catalog bars', () => {
    const doc = JSON.parse(read('content/catalogs/launch-candidate-v1.json'))
    const keys = (doc.bars as Array<{ key: string }>).map((b) => b.key)
    expect(keys).not.toContain('mobile-order')
    expect(keys).toHaveLength(13)
  })

  it('organizer-authorized exceptions registry is present for retention gates', () => {
    expect(existsSync(join(ROOT, 'content/catalogs/organizer-authorized-exceptions-v1.json'))).toBe(
      true,
    )
  })
})

describe('Launch configuration — Admin surface gaps (inspected, not filled)', () => {
  it('no Admin UI writes cruise_config day1 / base offset (ops must seed out-of-band)', () => {
    const adminDir = join(ROOT, 'src/features/admin')
    const files = readdirSync(adminDir).filter((f) => f.endsWith('.vue'))
    const blob = files.map((f) => readFileSync(join(adminDir, f), 'utf8')).join('\n')
    expect(blob).not.toMatch(/admin_.*cruise_config|dev_seed_cruise_clock/)
    expect(blob.includes('day1_ship_date')).toBe(false)
  })

  it('Roster can assign teams but has no team create/rename RPC in Admin libs', () => {
    const roster = read('src/lib/adminRoster.ts')
    expect(roster).toContain('admin_list_teams')
    expect(roster).not.toMatch(/admin_create_team|admin_upsert_team|admin_rename_team/)
    const section = read('src/features/admin/RosterSection.vue')
    expect(section).toContain('listTeams')
    expect(section).not.toMatch(/createTeam|addTeamName|renameTeam/)
  })

  it('Daily announcement Admin edits free-text only — no meeting time/location editors', () => {
    const lib = read('src/lib/admin/dailyChallengeAnnouncements.ts')
    expect(lib).toContain('admin_set_daily_challenge_announcement')
    const section = read('src/features/admin/DailyAnnouncementsSection.vue')
    // location_name may render read-only; there must be no editable meeting_time control
    expect(section).not.toMatch(/meeting_time_ship_local|v-model=\"[^\"]*meeting/)
    expect(section).toMatch(/daily-announce-input|textarea/)
  })

  it('first bounty schedule generation remains DEV_SCHEDULE / service_role gated in migrations', () => {
    const mig = readdirSync(join(ROOT, 'supabase/migrations')).find((f) =>
      f.includes('generate_and_resolve'),
    )
    expect(mig).toBeTruthy()
    const sql = read(`supabase/migrations/${mig}`)
    expect(sql).toMatch(/dev_generate_bounty_schedule/)
    expect(sql).toMatch(/DEV_SCHEDULE_FORBIDDEN|development-only|service_role/)
  })
})

describe('Launch configuration — ambiguity register still open', () => {
  it('campaign AMBIGUITIES_AND_GAPS still lists production voyage dates as organizer input', () => {
    const gaps = read('docs/qa/campaign/AMBIGUITIES_AND_GAPS.md')
    expect(gaps).toMatch(/Production voyage dates/i)
    expect(gaps).toMatch(/Ship It! decorative team names/i)
    expect(gaps).toMatch(/All Hands meetup announcement/i)
  })
})
