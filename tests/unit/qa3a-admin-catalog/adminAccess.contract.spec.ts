/**
 * QA3A — Admin route access contract (source text of router.ts + AdminView.vue).
 * No runtime router, no backend.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

describe('admin access contract (router.ts source)', () => {
  const router = read('src/app/router.ts')

  it("A) /admin route declares requiresAuth + requiresAdmin", () => {
    const m = router.match(/path:\s*'\/admin'[\s\S]*?meta:\s*\{([^}]*)\}/)
    expect(m).not.toBeNull()
    expect(m![1]).toMatch(/requiresAuth:\s*true/)
    expect(m![1]).toMatch(/requiresAdmin:\s*true/)
  })

  // ADM-007 (intentional defect probe: self-lockout when admin has zero enabled games)
  it('B) admin is not locked out by the empty-enabledGames redirect', () => {
    const emptyIdx = router.indexOf('session.enabledGames.length === 0')
    const adminIdx = router.indexOf('to.meta.requiresAdmin && !session.isAdmin')
    expect(emptyIdx).toBeGreaterThan(-1)
    expect(adminIdx).toBeGreaterThan(-1)

    // Isolate the empty-games `if (...) { ... }` block.
    const blockStart = router.indexOf('{', emptyIdx)
    const blockEnd = router.indexOf('\n  }', blockStart)
    const emptyBlockHeader = router.slice(emptyIdx - 4, blockStart)
    const emptyBlock = router.slice(blockStart, blockEnd)

    const adminCheckedFirst = adminIdx < emptyIdx
    const emptyGamesExemptsAdmin =
      /requiresAdmin|isAdmin/.test(emptyBlockHeader) || /requiresAdmin|isAdmin/.test(emptyBlock)

    // Current order: empty-games redirect (-> /unavailable) runs before any admin allowance. Defect.
    expect(adminCheckedFirst || emptyGamesExemptsAdmin).toBe(true)
  })
})

describe('AdminView sections (source contract)', () => {
  const view = read('src/features/admin/AdminView.vue')

  it('C) lists overview, players, drinkit, shipclock, catalog', () => {
    const union = view.match(/export type AdminSectionKey =([\s\S]*?)\n\nconst/)
    expect(union).not.toBeNull()
    for (const key of ['overview', 'players', 'drinkit', 'shipclock', 'catalog']) {
      expect(union![1]).toContain(`'${key}'`)
      expect(view).toMatch(new RegExp(`key:\\s*'${key}'`))
    }
  })
})
