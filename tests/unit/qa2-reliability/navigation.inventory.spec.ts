/**
 * QA-2 Agent 2 — player route inventory + lifecycle gate contracts (unit / static).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import router from '@/app/router'

const ROOT = resolve(import.meta.dirname, '../../..')

const PLAYER_ROUTE_NAMES = [
  'login',
  'game-selection',
  'drinkit-home',
  'drinkit-rules',
  'drinkit-wrapped',
  'drinkit-log',
  'drinkit-daily',
  'drinkit-gallery',
  'drinkit-achievements',
  'shipit-home',
  'shipit-rules',
  'shipit-wrapped',
  'shipit-challenges',
  'shipit-submit',
  'shipit-gallery',
  'shipit-achievements',
  'unavailable',
  'access-denied',
] as const

describe('QA2 player navigation inventory', () => {
  it('registers all player-facing route names', () => {
    const names = router.getRoutes().map((r) => r.name).filter(Boolean)
    for (const name of PLAYER_ROUTE_NAMES) {
      expect(names).toContain(name)
    }
  })

  it('marks login public and gameplay routes as requiresAuth', () => {
    const login = router.getRoutes().find((r) => r.name === 'login')
    expect(login?.meta.public).toBe(true)
    for (const name of ['drinkit-log', 'shipit-submit', 'drinkit-gallery'] as const) {
      const route = router.getRoutes().find((r) => r.name === name)
      expect(route?.meta.requiresAuth).toBe(true)
    }
  })

  it('scrollBehavior always resets to top (mobile deep-link reload contract)', () => {
    const body = readFileSync(resolve(ROOT, 'src/app/router.ts'), 'utf8')
    expect(body).toMatch(/scrollBehavior\(\)\s*\{\s*return \{ top: 0 \}/)
  })

  it('blocks pre-cruise gameplay homes, submissions, galleries, wrapped', () => {
    const body = readFileSync(resolve(ROOT, 'src/app/router.ts'), 'utf8')
    expect(body).toMatch(/PRECRUISE_BLOCKED_NAMES/)
    for (const name of [
      'drinkit-home',
      'shipit-home',
      'drinkit-log',
      'drinkit-daily',
      'shipit-submit',
      'drinkit-gallery',
      'shipit-gallery',
      'drinkit-wrapped',
      'shipit-wrapped',
    ]) {
      expect(body).toContain(`'${name}'`)
    }
  })

  it('allows rules + game-selection during pre-cruise', () => {
    const body = readFileSync(resolve(ROOT, 'src/app/router.ts'), 'utf8')
    expect(body).toMatch(/PRECRUISE_ALLOWED_NAMES/)
    expect(body).toContain("'drinkit-rules'")
    expect(body).toContain("'shipit-rules'")
    expect(body).toContain("'game-selection'")
  })

  it('remaps active homes and submission routes to Wrapped in awards mode', () => {
    const body = readFileSync(resolve(ROOT, 'src/app/router.ts'), 'utf8')
    expect(body).toMatch(/isAwardsMode/)
    expect(body).toMatch(/ACTIVE_HOME_NAMES/)
    expect(body).toMatch(/SUBMISSION_ROUTE_NAMES/)
    expect(body).toMatch(/wrappedName/)
  })

  it('preserves redirect query when sending unauthenticated users to login', () => {
    const body = readFileSync(resolve(ROOT, 'src/app/router.ts'), 'utf8')
    expect(body).toMatch(/redirect:\s*to\.fullPath/)
  })
})
