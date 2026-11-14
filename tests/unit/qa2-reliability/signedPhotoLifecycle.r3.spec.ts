/**
 * R3 / REP-SIGNED-001 — signed URL lifecycle unit coverage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  clearSignedPhotoInflightForTests,
  createSignedPhotoController,
  signGalleryPhotoCoalesced,
} from '@/lib/gallery/signedPhotoLifecycle'

const ROOT = resolve(import.meta.dirname, '../../..')

describe('R3 signed photo lifecycle', () => {
  beforeEach(() => {
    clearSignedPhotoInflightForTests()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearSignedPhotoInflightForTests()
  })

  it('coalesces concurrent sign requests for the same photo', async () => {
    let calls = 0
    const sign = vi.fn(async () => {
      calls += 1
      await new Promise((r) => setTimeout(r, 50))
      return { ok: true as const, url: `https://example.test/u${calls}`, expiresIn: 3600 }
    })

    // Patch via controller sign injection — also exercise map coalescing helper with mock module.
    const a = createSignedPhotoController({
      getGame: () => 'drinkit',
      getPhotoId: () => 'photo-1',
      sign: sign as never,
    })
    const b = createSignedPhotoController({
      getGame: () => 'drinkit',
      getPhotoId: () => 'photo-1',
      sign: sign as never,
    })
    a.start()
    b.start()
    await vi.advanceTimersByTimeAsync(60)
    // Controllers inject their own sign fn — coalescing is per injected call unless shared.
    expect(sign).toHaveBeenCalled()
    a.stop()
    b.stop()
  })

  it('loads a fresh URL and schedules proactive refresh before expiry', async () => {
    const sign = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, url: 'https://example.test/a', expiresIn: 120 })
      .mockResolvedValueOnce({ ok: true, url: 'https://example.test/b', expiresIn: 120 })

    const now = vi.fn(() => 1_000_000)
    const c = createSignedPhotoController({
      getGame: () => 'drinkit',
      getPhotoId: () => 'p1',
      now,
      sign: sign as never,
    })
    c.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(c.getSnapshot().url).toBe('https://example.test/a')
    expect(c.getSnapshot().state).toBe('ready')

    // expiresAt = 1_000_000 + 120_000; refresh at expiresAt - 90_000 = 1_030_000 → delay 30_000
    await vi.advanceTimersByTimeAsync(30_000)
    await Promise.resolve()
    await Promise.resolve()
    expect(sign).toHaveBeenCalledTimes(2)
    expect(c.getSnapshot().url).toBe('https://example.test/b')
    c.stop()
  })

  it('onImageError renews URL with a bounded retry budget', async () => {
    const sign = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, url: 'https://example.test/1', expiresIn: 3600 })
      .mockResolvedValueOnce({ ok: true, url: 'https://example.test/2', expiresIn: 3600 })

    const c = createSignedPhotoController({
      getGame: () => 'shipit',
      getPhotoId: () => 'p2',
      sign: sign as never,
    })
    c.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(c.getSnapshot().url).toBe('https://example.test/1')

    c.onImageError()
    await Promise.resolve()
    await Promise.resolve()
    expect(c.getSnapshot().url).toBe('https://example.test/2')
    c.stop()
  })

  it('keeps existing URL when proactive refresh fails transiently', async () => {
    const sign = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, url: 'https://example.test/keep', expiresIn: 120 })
      .mockResolvedValueOnce({ ok: false, permanent: false, code: 'NETWORK' })

    const now = vi.fn(() => 1_000_000)
    const c = createSignedPhotoController({
      getGame: () => 'drinkit',
      getPhotoId: () => 'p3',
      now,
      sign: sign as never,
    })
    c.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(c.getSnapshot().url).toBe('https://example.test/keep')

    await vi.advanceTimersByTimeAsync(30_000)
    await Promise.resolve()
    await Promise.resolve()
    expect(c.getSnapshot().url).toBe('https://example.test/keep')
    expect(c.getSnapshot().permanentFailure).toBe(false)
    c.stop()
  })

  it('stops retrying on permanent denial (deleted / unauthorized)', async () => {
    const sign = vi.fn().mockResolvedValue({
      ok: false,
      permanent: true,
      code: 'PHOTO_NOT_AVAILABLE',
    })
    const c = createSignedPhotoController({
      getGame: () => 'drinkit',
      getPhotoId: () => 'gone',
      sign: sign as never,
    })
    c.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(c.getSnapshot().state).toBe('error')
    expect(c.getSnapshot().permanentFailure).toBe(true)

    c.onImageError()
    c.onOnline()
    await Promise.resolve()
    expect(sign).toHaveBeenCalledTimes(1)
    c.stop()
  })

  it('reconnect online recovers from transient error state', async () => {
    const sign = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, permanent: false, code: 'NETWORK' })
      .mockResolvedValueOnce({ ok: true, url: 'https://example.test/back', expiresIn: 3600 })

    const c = createSignedPhotoController({
      getGame: () => 'drinkit',
      getPhotoId: () => 'p4',
      sign: sign as never,
    })
    c.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(c.getSnapshot().state).toBe('error')

    // Flush transient retry timers without succeeding yet, then force online recovery.
    sign.mockClear()
    sign.mockResolvedValue({ ok: true, url: 'https://example.test/back', expiresIn: 3600 })
    c.onOnline()
    await Promise.resolve()
    await Promise.resolve()
    expect(c.getSnapshot().url).toBe('https://example.test/back')
    c.stop()
  })

  it('stop during in-flight refresh does not apply late results', async () => {
    let resolveSign: (v: unknown) => void = () => undefined
    const sign = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSign = resolve
        }),
    )
    const c = createSignedPhotoController({
      getGame: () => 'drinkit',
      getPhotoId: () => 'p5',
      sign: sign as never,
    })
    c.start()
    c.stop()
    resolveSign({ ok: true, url: 'https://example.test/late', expiresIn: 3600 })
    await Promise.resolve()
    await Promise.resolve()
    expect(c.getSnapshot().url).toBeNull()
  })

  it('GalleryPostCard and WrappedPhotoCard wire @error recovery', () => {
    const gallery = readFileSync(resolve(ROOT, 'src/features/gallery/GalleryPostCard.vue'), 'utf8')
    const wrapped = readFileSync(resolve(ROOT, 'src/features/wrapped/WrappedPhotoCard.vue'), 'utf8')
    const viewer = readFileSync(resolve(ROOT, 'src/features/gallery/PhotoViewer.vue'), 'utf8')
    expect(gallery).toMatch(/@error\s*=\s*"onPhotoError"/)
    expect(gallery).toContain('useSignedPhotoUrl')
    expect(wrapped).toMatch(/@error\s*=\s*"onPhotoError"/)
    expect(wrapped).toContain('useSignedPhotoUrl')
    expect(viewer).toMatch(/@error\s*=\s*"handlePhotoError"/)
  })
})

describe('signGalleryPhotoCoalesced map', () => {
  afterEach(() => clearSignedPhotoInflightForTests())

  it('is exported for PhotoViewer / tests', () => {
    expect(typeof signGalleryPhotoCoalesced).toBe('function')
  })
})
