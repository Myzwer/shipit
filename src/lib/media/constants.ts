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
  outputMime: 'image/jpeg' as const,
} as const
