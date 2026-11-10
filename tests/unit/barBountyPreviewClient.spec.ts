import { describe, expect, it, vi } from 'vitest'
import { createBarBountyPreviewClient } from '@/lib/bounty/barBountyPreviewClient'

describe('createBarBountyPreviewClient', () => {
  it('ignores stale responses after a newer schedule', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    const previewFn = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve)
        }),
    )

    const client = createBarBountyPreviewClient({ debounceMs: 5, previewFn: previewFn as never })
    const first = client.previewNow({
      barCanonicalKey: 'lido-bar',
      companionIds: ['a'],
    })
    await Promise.resolve()
    expect(resolvers.length).toBe(1)

    const second = client.previewNow({
      barCanonicalKey: 'lido-bar',
      companionIds: ['a', 'b'],
    })
    await Promise.resolve()
    expect(resolvers.length).toBe(2)

    resolvers[0]!({
      ok: true,
      points: 20,
      claimable: true,
      awards_points: false,
      creates_claim: false,
    })
    resolvers[1]!({
      ok: true,
      points: 40,
      claimable: true,
      awards_points: false,
      creates_claim: false,
    })

    expect(await first).toBeNull()
    expect(await second).toMatchObject({ points: 40 })
  })

  it('cancel bumps generation so in-flight results are dropped', async () => {
    let resolvePreview!: (v: unknown) => void
    const previewFn = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve
        }),
    )
    const client = createBarBountyPreviewClient({ debounceMs: 0, previewFn: previewFn as never })
    const pending = client.previewNow({
      barCanonicalKey: 'lido-bar',
      companionIds: [],
    })
    client.cancel()
    resolvePreview({ ok: true, points: 20, claimable: true, awards_points: false, creates_claim: false })
    expect(await pending).toBeNull()
  })
})
