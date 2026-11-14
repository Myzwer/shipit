/**
 * QA-2 Agent 2 — PhotoCapture remount restore / empty-blob re-stage risk.
 */
import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PhotoCapture from '@/components/shared/PhotoCapture.vue'

const stageProcessedPhoto = vi.fn()

vi.mock('@/lib/media/processImage', () => ({
  processImageFile: vi.fn(),
  revokeProcessedPreview: vi.fn(),
  MediaProcessError: class extends Error {
    code = 'DECODE_FAILED'
  },
}))

vi.mock('@/lib/media/stagePhoto', () => ({
  stageProcessedPhoto: (...args: unknown[]) => stageProcessedPhoto(...args),
  setPhotoFraming: vi.fn(async (_id: string, framing: unknown) => framing),
  abandonPhotoUpload: vi.fn(async () => undefined),
  StagePhotoError: class extends Error {
    code = 'UPLOAD_FAILED'
  },
}))

describe('QA2 PhotoCapture restore reliability', () => {
  it('restores staged snapshot without re-uploading empty blob', async () => {
    stageProcessedPhoto.mockClear()
    const w = mount(PhotoCapture, {
      props: {
        game: 'drinkit',
        purpose: 'drink_log',
        autoStage: true,
        restore: {
          previewUrl: 'blob:restored',
          width: 200,
          height: 150,
          framing: { zoom: 1.5, centerX: 0.4, centerY: 0.6 },
          staged: {
            photoId: 'staged-1',
            bucket: 'game-photos',
            storagePath: 'p/drinkit/staged-1.jpg',
            status: 'staged',
            mimeType: 'image/jpeg',
            width: 200,
            height: 150,
            byteSize: 1234,
            framing: { zoom: 1.5, centerX: 0.4, centerY: 0.6 },
          },
        },
      },
      attachTo: document.body,
    })
    await flushPromises()
    expect(w.find('[data-testid="photo-preview"]').exists()).toBe(true)
    expect(w.vm.status).toBe('staged')
    // Adjust/framing-only path may call setPhotoFraming, but must not upload empty blob.
    expect(stageProcessedPhoto).not.toHaveBeenCalled()
    w.unmount()
  })

  it('does not auto-stage an empty blob when restore has preview but no staged ref', async () => {
    stageProcessedPhoto.mockClear()
    const w = mount(PhotoCapture, {
      props: {
        game: 'shipit',
        purpose: 'scavenger',
        autoStage: true,
        restore: {
          previewUrl: 'blob:local-only',
          width: 100,
          height: 100,
          framing: { zoom: 1, centerX: 0.5, centerY: 0.5 },
          staged: null,
        },
      },
      attachTo: document.body,
    })
    await flushPromises()
    expect(w.vm.status).toBe('ready_local')
    // Critical: retry must not upload the placeholder empty Blob from restore.
    w.vm.retryUpload()
    await flushPromises()
    if (stageProcessedPhoto.mock.calls.length > 0) {
      const arg = stageProcessedPhoto.mock.calls[0]![0] as { image: { byteSize: number; blob: Blob } }
      expect(arg.image.blob.size).toBeGreaterThan(0)
      expect(arg.image.byteSize).toBeGreaterThan(0)
    }
    w.unmount()
  })
})
