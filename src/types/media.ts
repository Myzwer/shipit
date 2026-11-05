export type PhotoPurpose = 'drink_log' | 'daily' | 'scavenger'
export type PhotoGame = 'drinkit' | 'shipit'
export type PhotoRequirement = 'optional' | 'required'

export type StagedPhotoStatus =
  | 'empty'
  | 'processing'
  | 'ready_local'
  | 'uploading'
  | 'staged'
  | 'error'

export interface ProcessedImage {
  blob: Blob
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  width: number
  height: number
  byteSize: number
  previewUrl: string
  originalFilename: string | null
}

export interface StagedPhotoRef {
  photoId: string
  bucket: string
  storagePath: string
  status: 'staged'
  mimeType: string
  width: number
  height: number
  byteSize: number
}

export interface BeginPhotoUploadResult {
  ok: boolean
  code?: string
  photo_id?: string
  bucket?: string
  storage_path?: string
  status?: string
  message?: string
}

export interface ConfirmPhotoUploadResult {
  ok: boolean
  code?: string
  photo_id?: string
  bucket?: string
  storage_path?: string
  status?: string
  idempotent_replay?: boolean
  message?: string
}

/** Contract for future submit RPCs — photo may be staged but not yet bound. */
export interface PhotoSubmitContract {
  purpose: PhotoPurpose
  game: PhotoGame
  required: boolean
  /** Present only after successful confirm_photo_upload. */
  stagedPhotoId: string | null
  /** Local preview URL for Review UI; not a security proof. */
  previewUrl: string | null
}
