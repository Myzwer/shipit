/**
 * QA-2 Agent 2 — media limit / format contracts (non-mutating).
 * Confirms client constants align with Storage bucket + photos table constraints.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MEDIA } from '@/lib/media/constants'

const ROOT = resolve(import.meta.dirname, '../../..')

describe('QA2 media limit contracts', () => {
  it('documents client engineering ceilings from MEDIA constants', () => {
    expect(MEDIA.maxInputBytes).toBe(25 * 1024 * 1024)
    expect(MEDIA.maxOptimizedBytes).toBe(4 * 1024 * 1024)
    expect(MEDIA.storageMaxBytes).toBe(5 * 1024 * 1024)
    expect(MEDIA.maxLongEdgePx).toBe(2000)
    expect(MEDIA.jpegQuality).toBe(0.82)
    expect(MEDIA.bucket).toBe('game-photos')
    expect(MEDIA.outputMime).toBe('image/jpeg')
    expect([...MEDIA.acceptedInputMime]).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ])
  })

  it('aligns storageMaxBytes with photos table check and bucket file_size_limit (5 MiB)', () => {
    const migration = readFileSync(
      resolve(ROOT, 'supabase/migrations/20261105003300_phase4b1_photo_storage.sql'),
      'utf8',
    )
    expect(migration).toMatch(/byte_size <= 5242880/)
    expect(migration).toMatch(/5242880/)
    expect(MEDIA.storageMaxBytes).toBe(5_242_880)
  })

  it('bucket allows only jpeg/png/webp (HEIC must be client-converted before upload)', () => {
    const migration = readFileSync(
      resolve(ROOT, 'supabase/migrations/20261105003300_phase4b1_photo_storage.sql'),
      'utf8',
    )
    expect(migration).toMatch(
      /allowed_mime_types[\s\S]*image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/,
    )
    expect(migration).not.toMatch(/image\/heic/)
  })

  it('global supabase storage ceiling is higher than per-bucket game-photos limit', () => {
    const config = readFileSync(resolve(ROOT, 'supabase/config.toml'), 'utf8')
    expect(config).toMatch(/file_size_limit\s*=\s*"50MiB"/)
    expect(MEDIA.storageMaxBytes).toBeLessThan(50 * 1024 * 1024)
  })

  it('optimized upload target stays under storage hard limit', () => {
    expect(MEDIA.maxOptimizedBytes).toBeLessThan(MEDIA.storageMaxBytes)
  })
})
