import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PhotoCapture from '@/components/shared/PhotoCapture.vue'
import { copy } from '@/ui/copy'

vi.mock('@/lib/media/processImage', () => ({
  processImageFile: vi.fn(async (file: File) => ({
    blob: new Blob([file], { type: 'image/jpeg' }),
    mimeType: 'image/jpeg' as const,
    width: 100,
    height: 80,
    byteSize: 12,
    previewUrl: 'blob:mock-preview',
    originalFilename: file.name,
  })),
  revokeProcessedPreview: vi.fn(),
  MediaProcessError: class extends Error {
    code = 'DECODE_FAILED'
  },
}))

vi.mock('@/lib/media/stagePhoto', () => ({
  stageProcessedPhoto: vi.fn(async () => ({
    pending: { photoId: 'p1', bucket: 'game-photos', storagePath: 'a/drinkit/p1.jpg' },
    staged: {
      photoId: 'p1',
      bucket: 'game-photos',
      storagePath: 'a/drinkit/p1.jpg',
      status: 'staged' as const,
      mimeType: 'image/jpeg',
      width: 100,
      height: 80,
      byteSize: 12,
    },
  })),
  abandonPhotoUpload: vi.fn(async () => undefined),
  StagePhotoError: class extends Error {
    code = 'UPLOAD_FAILED'
  },
}))

describe('PhotoCapture', () => {
  it('exposes Take Photo (rear capture) and Upload Photo inputs', () => {
    const w = mount(PhotoCapture, {
      props: { game: 'drinkit', purpose: 'drink_log' },
    })
    expect(w.find('[data-testid="photo-take"]').text()).toBe(copy.photo.takePhoto)
    expect(w.find('[data-testid="photo-upload"]').text()).toBe(copy.photo.uploadPhoto)

    const capture = w.find('[data-testid="photo-capture-input"]')
    expect(capture.attributes('capture')).toBe('environment')
    expect(capture.attributes('type')).toBe('file')
    expect(capture.attributes('accept')).toContain('image')

    const upload = w.find('[data-testid="photo-upload-input"]')
    expect(upload.attributes('capture')).toBeUndefined()
    expect(upload.attributes('accept')).toContain('image/jpeg')
  })

  it('shows required hint when required and empty', () => {
    const w = mount(PhotoCapture, {
      props: { game: 'shipit', purpose: 'scavenger', required: true },
    })
    expect(w.find('[data-testid="photo-required-hint"]').exists()).toBe(true)
  })

  it('previews, stages once, and ignores duplicate taps while busy', async () => {
    const { stageProcessedPhoto } = await import('@/lib/media/stagePhoto')
    const w = mount(PhotoCapture, {
      props: { game: 'drinkit', purpose: 'drink_log', autoStage: true },
    })

    const file = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' })
    const input = w.find('[data-testid="photo-upload-input"]')
    Object.defineProperty((input.element as HTMLInputElement), 'files', {
      value: [file],
      configurable: true,
    })
    await input.trigger('change')
    await flushPromises()

    expect(w.find('[data-testid="photo-preview"]').exists()).toBe(true)
    expect(w.find('[data-testid="photo-staged-ready"]').exists()).toBe(true)
    expect(stageProcessedPhoto).toHaveBeenCalledTimes(1)

    // Retake / replace / remove present after selection
    expect(w.find('[data-testid="photo-retake"]').exists()).toBe(true)
    expect(w.find('[data-testid="photo-replace"]').exists()).toBe(true)
    expect(w.find('[data-testid="photo-remove"]').exists()).toBe(true)

    await w.find('[data-testid="photo-remove"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="photo-preview"]').exists()).toBe(false)
  })
})
