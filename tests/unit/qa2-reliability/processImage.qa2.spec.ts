/**
 * QA-2 Agent 2 — processImage boundary / format reliability (mocked decode).
 */
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

function stubCanvas(blobBytes = 1500) {
  const toBlob = vi.fn((cb: BlobCallback) => {
    cb(new Blob([new Uint8Array(blobBytes)], { type: 'image/jpeg' }))
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
  return { toBlob, drawImage }
}

function stubDecodeOk(width: number, height: number) {
  const bitmap = mockBitmap(width, height)
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap),
  )
  return bitmap
}

function stubDecodeFail() {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      throw new Error('decode fail')
    }),
  )
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.())
      }
    },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('QA2 processImage formats and boundaries', () => {
  it('accepts JPEG and outputs jpeg under long-edge cap (portrait)', async () => {
    stubDecodeOk(1200, 3000)
    stubCanvas()
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'portrait.jpg', { type: 'image/jpeg' })
    const result = await processImageFile(file)
    expect(result.height).toBe(MEDIA.maxLongEdgePx)
    expect(result.width).toBe(800)
    expect(result.mimeType).toBe('image/jpeg')
    URL.revokeObjectURL(result.previewUrl)
  })

  it('accepts PNG input and still outputs JPEG', async () => {
    stubDecodeOk(800, 600)
    stubCanvas()
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'shot.png', { type: 'image/png' })
    const result = await processImageFile(file)
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.width).toBe(800)
    expect(result.height).toBe(600)
    URL.revokeObjectURL(result.previewUrl)
  })

  it('accepts WebP input', async () => {
    stubDecodeOk(640, 640)
    stubCanvas()
    const file = new File([new Uint8Array([9, 9, 9])], 'sq.webp', { type: 'image/webp' })
    const result = await processImageFile(file)
    expect(result.width).toBe(640)
    expect(result.height).toBe(640)
    URL.revokeObjectURL(result.previewUrl)
  })

  it('accepts HEIC when browser decode succeeds (Safari path)', async () => {
    stubDecodeOk(2000, 1500)
    stubCanvas()
    const file = new File([new Uint8Array([1, 2, 3])], 'IMG_0001.HEIC', { type: 'image/heic' })
    const result = await processImageFile(file)
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.originalFilename).toBe('IMG_0001.HEIC')
    URL.revokeObjectURL(result.previewUrl)
  })

  it('rejects HEIC when decode fails with iPhone-oriented guidance', async () => {
    stubDecodeFail()
    const file = new File([new Uint8Array([1, 2, 3])], 'IMG_0001.heic', { type: 'image/heic' })
    await expect(processImageFile(file)).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    })
    try {
      await processImageFile(file)
    } catch (err) {
      expect(err).toBeInstanceOf(MediaProcessError)
      expect((err as Error).message).toMatch(/Most Compatible|JPEG|HEIC/i)
    }
  })

  it('treats HEIF extension without mime as HEIC family', async () => {
    stubDecodeFail()
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.heif', { type: '' })
    await expect(processImageFile(file)).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
  })

  it('allows missing MIME when extension is jpeg (common mobile quirk)', async () => {
    stubDecodeOk(100, 100)
    stubCanvas()
    const file = new File([new Uint8Array([1, 2, 3])], 'from-camera.jpg', { type: '' })
    const result = await processImageFile(file)
    expect(result.mimeType).toBe('image/jpeg')
    URL.revokeObjectURL(result.previewUrl)
  })

  it('rejects GIF when mime is present', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'x.gif', { type: 'image/gif' })
    await expect(processImageFile(file)).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
  })

  it('rejects BMP and PDF mimes', async () => {
    await expect(
      processImageFile(new File([new Uint8Array([1])], 'x.bmp', { type: 'image/bmp' })),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
    await expect(
      processImageFile(new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
  })

  it('rejects empty files and files over maxInputBytes', async () => {
    await expect(
      processImageFile(new File([], 'empty.jpg', { type: 'image/jpeg' })),
    ).rejects.toMatchObject({ code: 'EMPTY_FILE' })
    const huge = new File([new Uint8Array(MEDIA.maxInputBytes + 1)], 'big.jpg', {
      type: 'image/jpeg',
    })
    await expect(processImageFile(huge)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  })

  it('accepts file exactly at maxInputBytes boundary when decode succeeds', async () => {
    stubDecodeOk(100, 100)
    stubCanvas()
    const file = new File([new Uint8Array(MEDIA.maxInputBytes)], 'edge.jpg', {
      type: 'image/jpeg',
    })
    const result = await processImageFile(file)
    expect(result.byteSize).toBeGreaterThan(0)
    URL.revokeObjectURL(result.previewUrl)
  })

  it('rejects corrupted decode with clear message', async () => {
    stubDecodeFail()
    const file = new File([new Uint8Array([0xff, 0xd8, 0x00])], 'trunc.jpg', {
      type: 'image/jpeg',
    })
    await expect(processImageFile(file)).rejects.toMatchObject({ code: 'DECODE_FAILED' })
  })

  it('preserves unusual unicode filenames on the processed result', async () => {
    stubDecodeOk(50, 50)
    stubCanvas()
    const name = '🍹 deck-14 “pool” (1).JPG'
    const file = new File([new Uint8Array([1, 2])], name, { type: 'image/jpeg' })
    const result = await processImageFile(file)
    expect(result.originalFilename).toBe(name)
    URL.revokeObjectURL(result.previewUrl)
  })

  it('scales square ultra-large dimensions to maxLongEdgePx', async () => {
    stubDecodeOk(8000, 8000)
    stubCanvas()
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'huge.jpg', { type: 'image/jpeg' })
    const result = await processImageFile(file)
    expect(result.width).toBe(MEDIA.maxLongEdgePx)
    expect(result.height).toBe(MEDIA.maxLongEdgePx)
    URL.revokeObjectURL(result.previewUrl)
  })

  it('throws OUTPUT_TOO_LARGE when encoded blob stays above storageMaxBytes', async () => {
    stubDecodeOk(2000, 2000)
    const toBlob = vi.fn((cb: BlobCallback) => {
      cb(new Blob([new Uint8Array(MEDIA.storageMaxBytes + 10)], { type: 'image/jpeg' }))
    })
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toBlob,
        } as unknown as HTMLCanvasElement
      }
      return document.createElement(tag)
    })
    const file = new File([new Uint8Array([1, 2, 3])], 'dense.jpg', { type: 'image/jpeg' })
    await expect(processImageFile(file)).rejects.toMatchObject({ code: 'OUTPUT_TOO_LARGE' })
  })

  /**
   * REL-006 / REP-MIME-001: empty MIME bypasses acceptedInputMime gate.
   * Expected product behavior: still refuse GIF even when type is blank.
   */
  it('rejects GIF with empty MIME type (mobile mislabel risk)', async () => {
    stubDecodeOk(100, 100)
    stubCanvas()
    const file = new File([new Uint8Array([1, 2, 3])], 'party.gif', { type: '' })
    await expect(processImageFile(file)).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
  })

  it('rejects GIF with generic application/octet-stream MIME', async () => {
    stubDecodeOk(100, 100)
    stubCanvas()
    const file = new File([new Uint8Array([1, 2, 3])], 'party.gif', {
      type: 'application/octet-stream',
    })
    await expect(processImageFile(file)).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
  })

  it('rejects BMP/PDF with empty MIME via extension denylist', async () => {
    await expect(
      processImageFile(new File([new Uint8Array([1])], 'x.bmp', { type: '' })),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
    await expect(
      processImageFile(new File([new Uint8Array([1])], 'x.pdf', { type: '' })),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
  })

  it('allows missing MIME when extension is png/webp (same mobile quirk as jpeg)', async () => {
    stubDecodeOk(80, 80)
    stubCanvas()
    for (const name of ['shot.png', 'tile.webp']) {
      const result = await processImageFile(
        new File([new Uint8Array([1, 2, 3])], name, { type: '' }),
      )
      expect(result.mimeType).toBe('image/jpeg')
      URL.revokeObjectURL(result.previewUrl)
    }
  })
})
