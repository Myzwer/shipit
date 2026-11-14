/**
 * QA3A — Admin pending localStorage keys vs session.signOut (source contract).
 * Reads source as text; no runtime mocks, no backend.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const LIB = resolve(ROOT, 'src/lib')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

function pendingKeyInventory(): Array<{ file: string; constant: string; key: string }> {
  const out: Array<{ file: string; constant: string; key: string }> = []
  for (const f of readdirSync(LIB).filter((n) => /^pending.*\.ts$/.test(n)).sort()) {
    const text = readFileSync(resolve(LIB, f), 'utf8')
    for (const m of text.matchAll(/export const (PENDING_[A-Z0-9_]+)\s*=\s*'([^']+)'/g)) {
      out.push({ file: f, constant: m[1], key: m[2] })
    }
  }
  return out
}

function signOutBody(): string {
  const src = read('src/stores/session.ts')
  const start = src.indexOf('async function signOut()')
  const end = src.indexOf('async function refreshProfile()', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('session.signOut vs admin pending keys (source contract)', () => {
  const admin = pendingKeyInventory().filter((e) => e.key.startsWith('star-princess.admin.'))

  it('inventory sanity: admin pending keys were discovered', () => {
    expect(admin.length).toBeGreaterThanOrEqual(7)
  })

  // ADM-006 (intentional defect probe)
  it.each([
    ['pendingClockCorrection', 'clearPendingClockCorrection'],
    ['pendingAdminCatalogImport', 'clearPendingAdminCatalogImport'],
    ['pendingAdminRoster', 'clearPendingRosterAccess'],
    ['pendingAdminRoster', 'clearPendingRosterAuth'],
  ])('A) signOut clears admin pending via @/lib/%s (%s)', (mod, fn) => {
    const body = signOutBody()
    // Current code only clears Drink / Daily / Scavenger player submit pendings. Defect.
    expect(body).toContain(`@/lib/${mod}`)
    expect(body).toContain(fn)
  })

  // ADM-006 (aggregate)
  it('A) signOut references every admin pending module', () => {
    const body = signOutBody()
    const missing = [...new Set(admin.map((e) => e.file.replace(/\.ts$/, '')))].filter(
      (mod) => !body.includes(`@/lib/${mod}`),
    )
    expect(missing).toEqual([])
  })
})

describe('pending key inventory (report snapshot)', () => {
  it('B) PENDING_* key constants across src/lib/pending*.ts', () => {
    const inv = pendingKeyInventory().map((e) => `${e.file}:${e.constant}=${e.key}`)
    expect(inv).toEqual([
      'pendingAdminAddDrink.ts:PENDING_ADMIN_ADD_DRINK_KEY=star-princess.admin.pendingAddDrink.v1',
      'pendingAdminCatalogImport.ts:PENDING_ADMIN_CATALOG_IMPORT_KEY=star-princess.admin.pendingCatalogImport.v1',
      'pendingAdminRoster.ts:PENDING_ADMIN_ROSTER_ACCESS_KEY=star-princess.admin.pendingRosterAccess.v1',
      'pendingAdminRoster.ts:PENDING_ADMIN_ROSTER_AUTH_KEY=star-princess.admin.pendingRosterAuth.v1',
      'pendingAdminVoid.ts:PENDING_ADMIN_VOID_KEY=star-princess.admin.pendingVoid.v1',
      'pendingBountySkip.ts:PENDING_BOUNTY_SKIP_KEY=star-princess.admin.pendingBountySkip.v1',
      'pendingClockCorrection.ts:PENDING_CLOCK_CORRECTION_KEY=star-princess.admin.pendingClockCorrection.v1',
      'pendingDailySubmit.ts:PENDING_DAILY_SUBMIT_KEY=star-princess.drinkit.pendingDailySubmit.v1',
      'pendingDrinkItPause.ts:PENDING_DRINKIT_PAUSE_KEY=star-princess.admin.pendingDrinkItPause.v1',
      'pendingDrinkSubmit.ts:PENDING_DRINK_SUBMIT_KEY=star-princess.drinkit.pendingDrinkSubmit.v1',
      'pendingScavengerSubmit.ts:PENDING_SCAVENGER_SUBMIT_KEY=star-princess.shipit.pendingScavengerSubmit.v1',
    ])
  })

  it('B) pendingDailyAnnouncement uses an un-namespaced private key (not star-princess.admin.*)', () => {
    // Note for report: admin-adjacent pending also not cleared by signOut.
    const src = read('src/lib/pendingDailyAnnouncement.ts')
    expect(src).toContain("'star-princess:pending-daily-announcement:v1'")
  })
})
