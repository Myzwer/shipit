import { MEDIA } from '@/lib/media/constants'
import {
  DEFAULT_PHOTO_FRAMING,
  cloneFraming,
  framingToWire,
  type PhotoFraming,
} from '@/lib/media/framing'
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

/** Untyped RPC — photo functions are not fully in generated Database types. */
async function rpc(fn: string, args?: Record<string, unknown>) {
  const client = requireClient()
  return client.rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export interface StagePhotoProgress {
  phase: 'begin' | 'upload' | 'confirm' | 'reconcile'
  message: string
}

export interface PendingUploadSlot {
  photoId: string
  bucket: string
  storagePath: string
  /** Idempotent begin key — preserved across lost responses. */
  clientRequestId: string | null
}

export type PendingSlotListener = (pending: PendingUploadSlot | null) => void

/**
 * Stage an optimized image into private Storage.
 * Emits `onPending` as soon as begin succeeds so lost upload/confirm responses
 * can Retry the same reservation.
 */
function withFraming(staged: StagedPhotoRef, framing?: PhotoFraming | null): StagedPhotoRef {
  return {
    ...staged,
    framing: cloneFraming(framing ?? staged.framing ?? DEFAULT_PHOTO_FRAMING),
  }
}

export async function stageProcessedPhoto(options: {
  image: ProcessedImage
  game: PhotoGame
  purpose: PhotoPurpose
  existing?: StagedPhotoRef | null
  pending?: PendingUploadSlot | null
  /** Accepted framing to persist after confirm. */
  framing?: PhotoFraming | null
  /** Stable UUID for begin idempotency; mint once per selection attempt. */
  beginRequestId?: string | null
  onPending?: PendingSlotListener
  onProgress?: (p: StagePhotoProgress) => void
  signal?: AbortSignal
}): Promise<{ staged: StagedPhotoRef; pending: PendingUploadSlot }> {
  const { image, game, purpose, existing, onProgress, onPending, signal } = options
  const framing = cloneFraming(options.framing ?? existing?.framing ?? DEFAULT_PHOTO_FRAMING)
  let pending = options.pending ?? null
  const beginRequestId = options.beginRequestId ?? pending?.clientRequestId ?? crypto.randomUUID()

  if (existing?.status === 'staged' && existing.photoId) {
    const slot: PendingUploadSlot = {
      photoId: existing.photoId,
      bucket: existing.bucket,
      storagePath: existing.storagePath,
      clientRequestId: pending?.clientRequestId ?? beginRequestId,
    }
    onPending?.(slot)
    // Persist framing on an already-staged photo (e.g. Adjust Photo).
    await setPhotoFraming(existing.photoId, framing)
    return { staged: withFraming(existing, framing), pending: slot }
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

  // Reconcile server status when we already have a reservation (lost response recovery).
  if (pending?.photoId) {
    onProgress?.({ phase: 'reconcile', message: 'Checking upload…' })
    const reconciled = await reconcilePendingSlot(pending, image)
    if (reconciled) {
      onPending?.(reconciled.pending)
      const saved = await setPhotoFraming(reconciled.staged.photoId, framing)
      return {
        pending: reconciled.pending,
        staged: withFraming(reconciled.staged, saved),
      }
    }
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
      p_client_request_id: beginRequestId,
    })
    if (error) throw new StagePhotoError('RPC_ERROR', error.message)
    const begin = (data ?? { ok: false, code: 'EMPTY' }) as BeginPhotoUploadResult & {
      status?: string
      idempotent_replay?: boolean
    }
    if (!begin.ok || !begin.photo_id || !begin.storage_path || !begin.bucket) {
      if (begin.code === 'BEGIN_REQUEST_CONSUMED') {
        throw new StagePhotoError(
          'BEGIN_REQUEST_CONSUMED',
          begin.message ?? 'Choose the photo again to start a new upload.',
        )
      }
      throw new StagePhotoError(
        begin.code ?? 'BEGIN_FAILED',
        begin.message ?? 'Could not start photo upload.',
      )
    }
    pending = {
      photoId: begin.photo_id,
      bucket: begin.bucket,
      storagePath: begin.storage_path,
      clientRequestId: beginRequestId,
    }
    // Gate B: surface reservation immediately — before upload/confirm.
    onPending?.(pending)

    if (begin.status === 'staged') {
      await setPhotoFraming(pending.photoId, framing)
      return {
        pending,
        staged: withFraming(
          {
            photoId: pending.photoId,
            bucket: pending.bucket,
            storagePath: pending.storagePath,
            status: 'staged',
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            byteSize: image.byteSize,
          },
          framing,
        ),
      }
    }
  } else {
    onPending?.(pending)
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
      upsert: true,
      cacheControl: '3600',
    })

  if (uploadError) {
    const msg = uploadError.message || 'Upload failed'
    // Object may already exist from a prior lost-response attempt — try confirm.
    if (!/already exists|Duplicate|409/i.test(msg)) {
      if (/network|fetch|Failed to fetch/i.test(msg) || offline()) {
        throw new StagePhotoError(
          'NETWORK',
          'Upload interrupted. Your photo is still here — tap Retry when the connection is stable.',
        )
      }
      throw new StagePhotoError('UPLOAD_FAILED', msg)
    }
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

  await setPhotoFraming(pending.photoId, framing)

  return {
    pending,
    staged: withFraming(
      {
        photoId: pending.photoId,
        bucket: pending.bucket ?? MEDIA.bucket,
        storagePath: pending.storagePath,
        status: 'staged',
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        byteSize: image.byteSize,
      },
      framing,
    ),
  }
}

async function reconcilePendingSlot(
  pending: PendingUploadSlot,
  image: ProcessedImage,
): Promise<{ staged: StagedPhotoRef; pending: PendingUploadSlot } | null> {
  const { data, error } = await rpc('get_my_photo', { p_photo_id: pending.photoId })
  if (error || !data || (data as { ok?: boolean }).ok !== true) return null
  const row = data as {
    status?: string
    storage_object_present?: boolean
    bucket?: string
    storage_path?: string
  }
  if (row.status === 'staged') {
    return {
      pending,
      staged: withFraming({
        photoId: pending.photoId,
        bucket: row.bucket ?? pending.bucket,
        storagePath: row.storage_path ?? pending.storagePath,
        status: 'staged',
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        byteSize: image.byteSize,
      }),
    }
  }
  if (row.status === 'bound' || row.status === 'abandoned') {
    throw new StagePhotoError(
      row.status === 'bound' ? 'PHOTO_ALREADY_BOUND' : 'PHOTO_ABANDONED',
      'This photo reservation is no longer available. Choose the photo again.',
    )
  }
  // pending_upload: if object already present, confirm only; else fall through to upload.
  if (row.status === 'pending_upload' && row.storage_object_present) {
    const { data: confirmData, error: confirmError } = await rpc('confirm_photo_upload', {
      p_photo_id: pending.photoId,
    })
    if (confirmError) throw new StagePhotoError('RPC_ERROR', confirmError.message)
    const confirm = (confirmData ?? { ok: false }) as ConfirmPhotoUploadResult
    if (confirm.ok) {
      return {
        pending,
        staged: withFraming({
          photoId: pending.photoId,
          bucket: pending.bucket,
          storagePath: pending.storagePath,
          status: 'staged',
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          byteSize: image.byteSize,
        }),
      }
    }
  }
  return null
}

/**
 * Persist non-destructive framing on a pending_upload or staged photo.
 * Bound photos refuse (PHOTO_ALREADY_BOUND).
 */
export async function setPhotoFraming(
  photoId: string,
  framing: PhotoFraming,
): Promise<PhotoFraming> {
  const wire = framingToWire(framing)
  const { data, error } = await rpc('set_photo_framing', {
    p_photo_id: photoId,
    p_crop_zoom: wire.zoom,
    p_crop_center_x: wire.center_x,
    p_crop_center_y: wire.center_y,
  })
  if (error) throw new StagePhotoError('RPC_ERROR', error.message)
  const body = (data ?? {}) as {
    ok?: boolean
    code?: string
    message?: string
    framing?: { zoom?: number; center_x?: number; center_y?: number }
  }
  if (!body.ok) {
    throw new StagePhotoError(
      body.code ?? 'FRAMING_FAILED',
      body.message ?? 'Could not save photo framing.',
    )
  }
  if (body.framing) {
    return {
      zoom: Number(body.framing.zoom) || framing.zoom,
      centerX: Number(body.framing.center_x) || framing.centerX,
      centerY: Number(body.framing.center_y) || framing.centerY,
    }
  }
  return cloneFraming(framing)
}

/**
 * Abandon ledger row, then remove via Storage API (never pretend SQL deleted the file).
 */
export async function abandonPhotoUpload(photoId: string): Promise<void> {
  const { data, error } = await rpc('abandon_photo_upload', { p_photo_id: photoId })
  if (error) throw new StagePhotoError('RPC_ERROR', error.message)
  const body = (data ?? {}) as {
    ok?: boolean
    code?: string
    bucket?: string
    storage_path?: string
    cleanup_status?: string
  }
  if (!body.ok) {
    if (body.code === 'PHOTO_ALREADY_BOUND') {
      throw new StagePhotoError('PHOTO_ALREADY_BOUND', 'This photo is already submitted.')
    }
    throw new StagePhotoError(body.code ?? 'ABANDON_FAILED', 'Could not remove photo.')
  }
  if (body.cleanup_status === 'completed' || !body.storage_path || !body.bucket) {
    return
  }

  const client = requireClient()
  const { error: removeError } = await client.storage.from(body.bucket).remove([body.storage_path])
  if (removeError) {
    await rpc('mark_photo_storage_cleanup_failed', {
      p_photo_id: photoId,
      p_detail: removeError.message,
    })
    return
  }
  await rpc('mark_photo_storage_cleaned', { p_photo_id: photoId })
}

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
