import { MEDIA } from '@/lib/media/constants'
import type { ProcessedImage } from '@/types/media'

export class MediaProcessError extends Error {
  code:
    | 'UNSUPPORTED_FORMAT'
    | 'FILE_TOO_LARGE'
    | 'DECODE_FAILED'
    | 'OUTPUT_TOO_LARGE'
    | 'EMPTY_FILE'

  constructor(
    code: MediaProcessError['code'],
    message: string,
  ) {
    super(message)
    this.name = 'MediaProcessError'
    this.code = code
  }
}

function revokeLater(url: string) {
  // Caller owns previewUrl lifetime; helper for failed paths.
  try {
    URL.revokeObjectURL(url)
  } catch {
    /* ignore */
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    // createImageBitmap honors EXIF orientation in modern browsers when available.
    return await createImageBitmap(file, {
      imageOrientation: 'from-image',
    } as ImageBitmapOptions)
  } catch {
    // Fallback: HTMLImageElement (orientation may vary by browser).
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('img decode failed'))
        el.src = url
      })
      return await createImageBitmap(img)
    } finally {
      revokeLater(url)
    }
  }
}

function scaleSize(width: number, height: number, maxLong: number) {
  const long = Math.max(width, height)
  if (long <= maxLong) return { width, height }
  const scale = maxLong / long
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
  })
  if (!blob) throw new MediaProcessError('DECODE_FAILED', 'Could not encode the photo.')
  return blob
}

/**
 * Optimize a user-selected image for cruise Wi-Fi upload.
 * Preserves aspect ratio; redraw strips GPS EXIF by producing a new JPEG.
 * HEIC/HEIF: attempted via browser decode; failure → clear unsupported error.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  if (!file || file.size < 1) {
    throw new MediaProcessError('EMPTY_FILE', 'Choose a photo to continue.')
  }
  if (file.size > MEDIA.maxInputBytes) {
    throw new MediaProcessError(
      'FILE_TOO_LARGE',
      'That photo is too large to process on this device. Try a smaller image.',
    )
  }

  const mime = (file.type || '').toLowerCase()
  const name = file.name || ''
  const looksHeic =
    mime === 'image/heic' ||
    mime === 'image/heif' ||
    /\.heic$/i.test(name) ||
    /\.heif$/i.test(name)

  if (
    mime &&
    !MEDIA.acceptedInputMime.includes(mime as (typeof MEDIA.acceptedInputMime)[number]) &&
    !looksHeic
  ) {
    throw new MediaProcessError(
      'UNSUPPORTED_FORMAT',
      'Use a JPEG, PNG, or WebP photo. This format is not supported.',
    )
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await loadBitmap(file)
  } catch {
    if (looksHeic) {
      throw new MediaProcessError(
        'UNSUPPORTED_FORMAT',
        'This iPhone HEIC photo could not be converted in this browser. Try “Most Compatible” (JPEG) in Camera settings, or choose a JPEG/PNG.',
      )
    }
    throw new MediaProcessError(
      'DECODE_FAILED',
      'We could not read that photo. Try another image or take a new one.',
    )
  }

  try {
    const sized = scaleSize(bitmap.width, bitmap.height, MEDIA.maxLongEdgePx)
    const canvas = document.createElement('canvas')
    canvas.width = sized.width
    canvas.height = sized.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new MediaProcessError('DECODE_FAILED', 'Could not process the photo.')
    }
    ctx.drawImage(bitmap, 0, 0, sized.width, sized.height)

    let quality = MEDIA.jpegQuality
    let blob = await canvasToJpegBlob(canvas, quality)
    // Step down quality if still oversized for cruise Wi-Fi.
    while (blob.size > MEDIA.maxOptimizedBytes && quality > 0.5) {
      quality -= 0.08
      blob = await canvasToJpegBlob(canvas, quality)
    }
    if (blob.size > MEDIA.storageMaxBytes) {
      throw new MediaProcessError(
        'OUTPUT_TOO_LARGE',
        'That photo is still too large after optimizing. Try a simpler shot or a smaller image.',
      )
    }

    const previewUrl = URL.createObjectURL(blob)
    return {
      blob,
      mimeType: 'image/jpeg',
      width: sized.width,
      height: sized.height,
      byteSize: blob.size,
      previewUrl,
      originalFilename: file.name || null,
    }
  } finally {
    bitmap.close()
  }
}

export function revokeProcessedPreview(image: ProcessedImage | null | undefined) {
  if (image?.previewUrl) revokeLater(image.previewUrl)
}
