import { describe, expect, it } from 'vitest'
import router from '@/app/router'

describe('router scaffold', () => {
  it('registers Phase 0 routes', () => {
    const paths = router.getRoutes().map((route) => route.path)
    expect(paths).toEqual(expect.arrayContaining(['/', '/drinkit', '/shipit']))
  })
})
