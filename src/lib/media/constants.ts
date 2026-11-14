/**
 * Engineering defaults from Tech Spec §9 — tune after real-device cruise Wi-Fi tests.
 * Not player-visible product promises.
 */
export const MEDIA = {
  /** Longest edge after optimize. */
  maxLongEdgePx: 2000,
  /** Reject originals larger than this before processing. */
  maxInputBytes: 25 * 1024 * 1024,
  /** Optimized upload ceiling (JPEG/WebP). */
  maxOptimizedBytes: 4 * 1024 * 1024,
  /** Storage / RPC hard limit. */
  storageMaxBytes: 5 * 1024 * 1024,
  jpegQuality: 0.82,
  bucket: 'game-photos',
  acceptedInputMime: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ] as const,
  /**
   * MIME values that are treated as unreliable (common mobile picker quirk).
   * When present, fall back to filename extension gates instead of trusting type.
   */
  unreliableInputMime: ['', 'application/octet-stream', 'binary/octet-stream'] as const,
  /**
   * Extensions refused when MIME is empty/generic (REL-006).
   * Kept out of the accepted decode path even if the browser can rasterize them.
   */
  rejectedInputExtensions: [
    '.gif',
    '.bmp',
    '.tif',
    '.tiff',
    '.pdf',
    '.svg',
    '.ico',
    '.avif',
  ] as const,
  outputMime: 'image/jpeg' as const,
} as const
