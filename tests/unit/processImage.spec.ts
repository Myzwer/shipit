import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaProcessError, processImageFile } from '@/lib/media/processImage'
import { MEDIA } from '@/lib/media/constants'

function mockBitmap(width: number, height: number) {
  return {
    width,
    height,
    close: vi.fn(),
  } as unknown as ImageBitmap
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('processImageFile', () => {
  it('rejects empty files', async () => {
    const file = new File([], 'empty.jpg', { type: 'image/jpeg' })
    await expect(processImageFile(file)).rejects.toMatchObject({ code: 'EMPTY_FILE' })
  })

  it('rejects oversized inputs before decode', async () => {
    const huge = new File([new Uint8Array(MEDIA.maxInputBytes + 1)], 'big.jpg', {
      type: 'image/jpeg',
    })
    await expect(processImageFile(huge)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  })

  it('rejects unsupported mime types', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'x.gif', { type: 'image/gif' })
    await expect(processImageFile(file)).rejects.toBeInstanceOf(MediaProcessError)
    await expect(processImageFile(file)).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
  })

  it('scales long edge and outputs jpeg preserving aspect ratio', async () => {
    const bitmap = mockBitmap(4000, 2000)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap),
    )

    const toBlob = vi.fn((cb: BlobCallback) => {
      cb(new Blob([new Uint8Array(1200)], { type: 'image/jpeg' }))
    })
    const drawImage = vi.fn()
    const getContext = vi.fn(() => ({ drawImage }))
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext,
          toBlob,
        } as unknown as HTMLCanvasElement
      }
      return document.createElement(tag)
    })

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'wide.jpg', { type: 'image/jpeg' })
    const result = await processImageFile(file)
    expect(result.width).toBe(MEDIA.maxLongEdgePx)
    expect(result.height).toBe(MEDIA.maxLongEdgePx / 2)
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.previewUrl.startsWith('blob:')).toBe(true)
    expect(bitmap.close).toHaveBeenCalled()
    URL.revokeObjectURL(result.previewUrl)
  })

  it('surfaces HEIC decode failure as unsupported', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode fail')
      }),
    )
    // Fallback Image path also fails
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_v: string) {
          queue.microtask(() => this.onerror?.())
        }
      },
    )

    const file = new File([new Uint8Array([1, 2, 3])], 'shot.heic', { type: 'image/heic' })
    await expect(processImageFile(file)).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
  })
})
