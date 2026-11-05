import { MEDIA } from '@/lib/media/constants'
import { supabase } from '@/lib/supabase'
import type {
  BeginPhotoUploadResult,
  ConfirmPhotoUploadResult,
  PhotoGame,
  PhotoPurpose,
  ProcessedImage,
  StagedPhotoRef,
} from '@/types/media'

export class StagePhotoError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'StagePhotoError'
    this.code = code
  }
}

function requireClient() {
  if (!supabase) throw new StagePhotoError('NO_CLIENT', 'Supabase is not configured')
  return supabase
}

/** Untyped RPC — photo functions are not yet in generated Database types. */
async function rpc(fn: string, args?: Record<string, unknown>) {
  const client = requireClient()
  return client.rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export interface StagePhotoProgress {
  phase: 'begin' | 'upload' | 'confirm'
  message: string
}

export interface PendingUploadSlot {
  photoId: string
  bucket: string
  storagePath: string
}

/**
 * Stage an optimized image into private Storage.
 * Safe retry: if `existing` is already staged, returns it without re-upload.
 * If `pending` exists from a prior begin+failed upload, reuses that path (upsert).
 */
export async function stageProcessedPhoto(options: {
  image: ProcessedImage
  game: PhotoGame
  purpose: PhotoPurpose
  existing?: StagedPhotoRef | null
  pending?: PendingUploadSlot | null
  onProgress?: (p: StagePhotoProgress) => void
  signal?: AbortSignal
}): Promise<{ staged: StagedPhotoRef; pending: PendingUploadSlot }> {
  const { image, game, purpose, existing, onProgress, signal } = options
  let pending = options.pending ?? null

  if (existing?.status === 'staged' && existing.photoId) {
    return {
      staged: existing,
      pending: {
        photoId: existing.photoId,
        bucket: existing.bucket,
        storagePath: existing.storagePath,
      },
    }
  }

  if (offline()) {
    throw new StagePhotoError(
      'OFFLINE',
      'You appear to be offline. Keep this photo and try again when the connection returns.',
    )
  }

  if (signal?.aborted) {
    throw new StagePhotoError('ABORTED', 'Upload cancelled.')
  }

  if (!pending) {
    onProgress?.({ phase: 'begin', message: 'Preparing upload…' })
    const { data, error } = await rpc('begin_photo_upload', {
      p_game: game,
      p_purpose: purpose,
      p_mime_type: image.mimeType,
      p_byte_size: image.byteSize,
      p_width: image.width,
      p_height: image.height,
      p_original_filename: image.originalFilename,
    })
    if (error) throw new StagePhotoError('RPC_ERROR', error.message)
    const begin = (data ?? { ok: false, code: 'EMPTY' }) as BeginPhotoUploadResult
    if (!begin.ok || !begin.photo_id || !begin.storage_path || !begin.bucket) {
      throw new StagePhotoError(
        begin.code ?? 'BEGIN_FAILED',
        begin.message ?? 'Could not start photo upload.',
      )
    }
    pending = {
      photoId: begin.photo_id,
      bucket: begin.bucket,
      storagePath: begin.storage_path,
    }
  }

  if (signal?.aborted) {
    throw new StagePhotoError('ABORTED', 'Upload cancelled.')
  }

  onProgress?.({ phase: 'upload', message: 'Uploading photo…' })

  const client = requireClient()
  const { error: uploadError } = await client.storage
    .from(pending.bucket)
    .upload(pending.storagePath, image.blob, {
      contentType: image.mimeType,
      // Allow retry onto the same pending path; policies reject bound/staged overwrite.
      upsert: true,
      cacheControl: '3600',
    })

  if (uploadError) {
    const msg = uploadError.message || 'Upload failed'
    if (/network|fetch|Failed to fetch/i.test(msg) || offline()) {
      throw new StagePhotoError(
        'NETWORK',
        'Upload interrupted. Your photo is still here — tap Retry when the connection is stable.',
      )
    }
    throw new StagePhotoError('UPLOAD_FAILED', msg)
  }

  onProgress?.({ phase: 'confirm', message: 'Confirming upload…' })

  const { data: confirmData, error: confirmError } = await rpc('confirm_photo_upload', {
    p_photo_id: pending.photoId,
  })
  if (confirmError) throw new StagePhotoError('RPC_ERROR', confirmError.message)
  const confirm = (confirmData ?? { ok: false, code: 'EMPTY' }) as ConfirmPhotoUploadResult
  if (!confirm.ok) {
    throw new StagePhotoError(
      confirm.code ?? 'CONFIRM_FAILED',
      confirm.message ??
        'Upload could not be verified. Tap Retry — we will not pretend it succeeded.',
    )
  }

  return {
    pending,
    staged: {
      photoId: pending.photoId,
      bucket: pending.bucket ?? MEDIA.bucket,
      storagePath: pending.storagePath,
      status: 'staged',
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      byteSize: image.byteSize,
    },
  }
}

export async function abandonPhotoUpload(photoId: string): Promise<void> {
  const { error } = await rpc('abandon_photo_upload', { p_photo_id: photoId })
  if (error) throw new StagePhotoError('RPC_ERROR', error.message)
}

/**
 * Build the typed contract future submit RPCs will consume.
 * stagedPhotoId alone is not proof — submit must call verify_staged_photo_for_submit server-side.
 */
export function buildPhotoSubmitContract(options: {
  purpose: PhotoPurpose
  game: PhotoGame
  required: boolean
  staged: StagedPhotoRef | null
  previewUrl: string | null
}): import('@/types/media').PhotoSubmitContract {
  return {
    purpose: options.purpose,
    game: options.game,
    required: options.required,
    stagedPhotoId: options.staged?.photoId ?? null,
    previewUrl: options.previewUrl,
  }
}
