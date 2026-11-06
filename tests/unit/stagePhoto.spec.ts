import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const upload = vi.fn()
const remove = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => upload(...args),
        remove: (...args: unknown[]) => remove(...args),
      }),
    },
  },
}))

import { abandonPhotoUpload, stageProcessedPhoto } from '@/lib/media/stagePhoto'
import type { ProcessedImage } from '@/types/media'

const image: ProcessedImage = {
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
  mimeType: 'image/jpeg',
  width: 10,
  height: 10,
  byteSize: 3,
  previewUrl: 'blob:x',
  originalFilename: 'a.jpg',
}

describe('stageProcessedPhoto Gate B', () => {
  beforeEach(() => {
    rpc.mockReset()
    upload.mockReset()
    remove.mockReset()
    upload.mockResolvedValue({ error: null })
    remove.mockResolvedValue({ error: null })
  })

  it('emits pending as soon as begin succeeds, before upload', async () => {
    const pendingEvents: unknown[] = []
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'begin_photo_upload') {
        return {
          data: {
            ok: true,
            photo_id: 'p1',
            bucket: 'game-photos',
            storage_path: 'a/shipit/p1.jpg',
            status: 'pending_upload',
          },
          error: null,
        }
      }
      if (fn === 'confirm_photo_upload') {
        return { data: { ok: true, status: 'staged' }, error: null }
      }
      return { data: null, error: null }
    })

    let uploadStarted = false
    upload.mockImplementation(async () => {
      uploadStarted = true
      expect(pendingEvents.length).toBeGreaterThan(0)
      return { error: null }
    })

    await stageProcessedPhoto({
      image,
      game: 'shipit',
      purpose: 'scavenger',
      beginRequestId: '11111111-1111-1111-1111-111111111111',
      onPending: (p) => pendingEvents.push(p),
    })
    expect(uploadStarted).toBe(true)
    expect(pendingEvents[0]).toMatchObject({ photoId: 'p1' })
  })

  it('reuses staged reservation without re-upload', async () => {
    const result = await stageProcessedPhoto({
      image,
      game: 'shipit',
      purpose: 'scavenger',
      existing: {
        photoId: 'p9',
        bucket: 'game-photos',
        storagePath: 'a/shipit/p9.jpg',
        status: 'staged',
        mimeType: 'image/jpeg',
        width: 10,
        height: 10,
        byteSize: 3,
      },
    })
    expect(result.staged.photoId).toBe('p9')
    expect(rpc).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it('reconciles pending when object already present (lost confirm)', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_my_photo') {
        return {
          data: {
            ok: true,
            status: 'pending_upload',
            storage_object_present: true,
            bucket: 'game-photos',
            storage_path: 'a/shipit/p2.jpg',
          },
          error: null,
        }
      }
      if (fn === 'confirm_photo_upload') {
        return { data: { ok: true, status: 'staged', idempotent_replay: false }, error: null }
      }
      return { data: null, error: null }
    })
    const result = await stageProcessedPhoto({
      image,
      game: 'shipit',
      purpose: 'scavenger',
      pending: {
        photoId: 'p2',
        bucket: 'game-photos',
        storagePath: 'a/shipit/p2.jpg',
        clientRequestId: '22222222-2222-2222-2222-222222222222',
      },
    })
    expect(result.staged.photoId).toBe('p2')
    expect(upload).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('confirm_photo_upload', { p_photo_id: 'p2' })
  })
})

describe('abandonPhotoUpload Gate A', () => {
  beforeEach(() => {
    rpc.mockReset()
    remove.mockReset()
    remove.mockResolvedValue({ error: null })
  })

  it('removes via Storage API then marks cleaned', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'abandon_photo_upload') {
        return {
          data: {
            ok: true,
            bucket: 'game-photos',
            storage_path: 'a/x.jpg',
            cleanup_status: 'pending',
          },
          error: null,
        }
      }
      if (fn === 'mark_photo_storage_cleaned') {
        return { data: { ok: true, cleanup_status: 'completed' }, error: null }
      }
      return { data: null, error: null }
    })
    await abandonPhotoUpload('p1')
    expect(remove).toHaveBeenCalledWith(['a/x.jpg'])
    expect(rpc).toHaveBeenCalledWith('mark_photo_storage_cleaned', { p_photo_id: 'p1' })
  })
})
