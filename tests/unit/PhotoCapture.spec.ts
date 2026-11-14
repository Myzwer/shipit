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
      framing: { zoom: 1, centerX: 0.5, centerY: 0.5 },
    },
  })),
  setPhotoFraming: vi.fn(async (_id: string, framing: unknown) => framing),
  abandonPhotoUpload: vi.fn(async () => undefined),
  StagePhotoError: class extends Error {
    code = 'UPLOAD_FAILED'
  },
}))

function framingEl(testId: string) {
  return document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null
}

async function selectAndUsePhoto(wrapper: ReturnType<typeof mount>) {
  const file = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' })
  const input = wrapper.find('[data-testid="photo-upload-input"]')
  Object.defineProperty((input.element as HTMLInputElement), 'files', {
    value: [file],
    configurable: true,
  })
  await input.trigger('change')
  await flushPromises()
  expect(framingEl('photo-framing-editor')).toBeTruthy()
  framingEl('photo-framing-use')?.click()
  await flushPromises()
}

describe('PhotoCapture', () => {
  it('exposes Take Photo (rear capture) and Upload Photo inputs', () => {
    const w = mount(PhotoCapture, {
      props: { game: 'drinkit', purpose: 'drink_log' },
      attachTo: document.body,
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
    w.unmount()
  })

  it('shows required hint when required and empty', () => {
    const w = mount(PhotoCapture, {
      props: { game: 'shipit', purpose: 'scavenger', required: true },
    })
    expect(w.find('[data-testid="photo-required-hint"]').exists()).toBe(true)
  })

  it('opens framing overlay, accepts default crop, then stages', async () => {
    const { stageProcessedPhoto } = await import('@/lib/media/stagePhoto')
    const w = mount(PhotoCapture, {
      props: { game: 'drinkit', purpose: 'drink_log', autoStage: true },
      attachTo: document.body,
    })

    await selectAndUsePhoto(w)

    expect(w.find('[data-testid="photo-preview"]').exists()).toBe(true)
    expect(w.find('[data-testid="framed-photo"]').exists()).toBe(true)
    expect(w.find('[data-testid="photo-preview-controls"]').attributes('style')).toContain(
      '--theme-gradient-cool',
    )
    expect(w.find('[data-testid="photo-staged-ready"]').exists()).toBe(true)
    expect(w.find('[data-testid="photo-staged-ready"]').classes()).toContain('sr-only')
    expect(w.find('[data-testid="photo-limits-hint"]').exists()).toBe(false)
    expect(w.find('[data-testid="photo-adjust"]').text()).toBe(copy.photo.adjustPhoto)
    expect(w.find('[data-testid="photo-adjust"]').classes()).toContain('photo-capture-action')
    expect(stageProcessedPhoto).toHaveBeenCalledTimes(1)
    expect(stageProcessedPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        framing: expect.objectContaining({ zoom: 1, centerX: 0.5, centerY: 0.5 }),
      }),
    )

    expect(w.find('[data-testid="photo-retake"]').exists()).toBe(true)
    expect(w.find('[data-testid="photo-replace"]').exists()).toBe(true)
    expect(w.find('[data-testid="photo-remove"]').text()).toBe(copy.photo.remove)
    expect(w.find('[data-testid="photo-remove"]').classes()).toContain('photo-capture-action--remove')

    await w.find('[data-testid="photo-remove"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="photo-preview"]').exists()).toBe(false)
    w.unmount()
  })

  it('restores an accepted photo when remounting with restore prop', async () => {
    const w = mount(PhotoCapture, {
      props: {
        game: 'drinkit',
        purpose: 'drink_log',
        restore: {
          previewUrl: 'blob:restored-preview',
          width: 200,
          height: 160,
          framing: { zoom: 1.4, centerX: 0.42, centerY: 0.58 },
          staged: {
            photoId: 'restored-1',
            bucket: 'game-photos',
            storagePath: 'a/drinkit/restored-1.jpg',
            status: 'staged' as const,
            mimeType: 'image/jpeg',
            width: 200,
            height: 160,
            byteSize: 40,
            framing: { zoom: 1.4, centerX: 0.42, centerY: 0.58 },
          },
        },
      },
      attachTo: document.body,
    })
    await flushPromises()

    expect(w.find('[data-testid="photo-preview"]').exists()).toBe(true)
    expect(w.find('[data-testid="framed-photo"]').exists()).toBe(true)
    expect(w.find('[data-testid="photo-adjust"]').exists()).toBe(true)
    expect(w.emitted('framing')?.at(-1)?.[0]).toEqual({
      zoom: 1.4,
      centerX: 0.42,
      centerY: 0.58,
    })
    w.unmount()
  })

  it('cancel on a new photo discards without accepting', async () => {
    const { stageProcessedPhoto } = await import('@/lib/media/stagePhoto')
    vi.mocked(stageProcessedPhoto).mockClear()
    const w = mount(PhotoCapture, {
      props: { game: 'drinkit', purpose: 'drink_log', autoStage: true },
      attachTo: document.body,
    })

    const file = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' })
    const input = w.find('[data-testid="photo-upload-input"]')
    Object.defineProperty((input.element as HTMLInputElement), 'files', {
      value: [file],
      configurable: true,
    })
    await input.trigger('change')
    await flushPromises()
    expect(framingEl('photo-framing-editor')).toBeTruthy()
    framingEl('photo-framing-cancel')?.click()
    await flushPromises()

    expect(w.find('[data-testid="photo-preview"]').exists()).toBe(false)
    expect(stageProcessedPhoto).not.toHaveBeenCalled()
    w.unmount()
  })
})
