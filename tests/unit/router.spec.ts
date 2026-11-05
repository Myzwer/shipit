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
})
