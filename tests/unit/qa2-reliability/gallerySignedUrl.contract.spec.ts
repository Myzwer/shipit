/**
 * QA-2 Agent 2 — gallery signed URL refresh / expiry contracts.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MEDIA } from '@/lib/media/constants'

const ROOT = resolve(import.meta.dirname, '../../..')

describe('QA2 gallery signed URL lifecycle', () => {
  it('requests one-hour signed URLs from gallery API', () => {
    const api = readFileSync(resolve(ROOT, 'src/lib/gallery/api.ts'), 'utf8')
    // Default TTL remains 3600s (optional override only for short-lived tests).
    expect(api).toMatch(/p_expires_seconds:\s*(?:options\?\.expiresSeconds\s*\?\?\s*)?3600/)
    expect(api).toMatch(/createSignedUrl/)
  })

  it('GalleryPostCard refreshes signed URL before expiry or on image error', () => {
    const card = readFileSync(
      resolve(ROOT, 'src/features/gallery/GalleryPostCard.vue'),
      'utf8',
    )
    // Expected reliability: refresh timer OR explicit img error → reload handler.
    const hasRefreshTimer =
      /setInterval\s*\(/.test(card) && /fetchGalleryPhotoSignedUrl/.test(card)
    const hasImgErrorReload =
      /@error\s*=/.test(card) || /onPhotoError|handlePhotoError/.test(card)
    expect(hasRefreshTimer || hasImgErrorReload).toBe(true)
  })

  it('PhotoCapture upload accept list includes HEIC for iPhone library picks', () => {
    const capture = readFileSync(
      resolve(ROOT, 'src/components/shared/PhotoCapture.vue'),
      'utf8',
    )
    expect(capture).toMatch(/accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif/)
    expect(capture).toMatch(/capture="environment"/)
  })

  it('client never uploads HEIC bytes to storage (always JPEG output)', () => {
    expect(MEDIA.outputMime).toBe('image/jpeg')
    const processSrc = readFileSync(resolve(ROOT, 'src/lib/media/processImage.ts'), 'utf8')
    expect(processSrc).toMatch(/mimeType:\s*'image\/jpeg'/)
    expect(processSrc).toMatch(/toBlob[\s\S]*image\/jpeg/)
  })
})
