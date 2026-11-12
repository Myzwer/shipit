import { describe, expect, it } from 'vitest'
import router from '@/app/router'

describe('router scaffold', () => {
  it('registers Phase 1B auth and game routes', () => {
    const paths = router.getRoutes().map((route) => route.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        '/login',
        '/',
        '/drinkit',
        '/drinkit/log',
        '/drinkit/gallery',
        '/shipit',
        '/shipit/challenges',
        '/admin',
        '/unavailable',
        '/access-denied',
      ]),
    )
  })

  it('registers pre-cruise rules routes as allowAnyMember', () => {
    const drinkRules = router.getRoutes().find((r) => r.name === 'drinkit-rules')
    const shipRules = router.getRoutes().find((r) => r.name === 'shipit-rules')
    expect(drinkRules?.path).toBe('/drinkit/rules')
    expect(shipRules?.path).toBe('/shipit/rules')
    expect(drinkRules?.meta.allowAnyMember).toBe(true)
    expect(shipRules?.meta.allowAnyMember).toBe(true)
    expect(drinkRules?.meta.requiresAuth).toBe(true)
    expect(shipRules?.meta.requiresAuth).toBe(true)
  })
})
