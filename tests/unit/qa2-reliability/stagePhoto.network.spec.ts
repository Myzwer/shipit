/**
 * QA-2 Agent 2 — stagePhoto network / recovery paths (fully mocked Supabase).
 */
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

import { stageProcessedPhoto, StagePhotoError } from '@/lib/media/stagePhoto'
import type { ProcessedImage } from '@/types/media'

const image: ProcessedImage = {
  blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }),
  mimeType: 'image/jpeg',
  width: 100,
  height: 80,
  byteSize: 4,
  previewUrl: 'blob:qa2',
  originalFilename: 'a.jpg',
}

function mockHappyBeginConfirm() {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'begin_photo_upload') {
      return {
        data: {
          ok: true,
          photo_id: 'p-net',
          bucket: 'game-photos',
          storage_path: 'player/drinkit/p-net.jpg',
          status: 'pending_upload',
        },
        error: null,
      }
    }
    if (fn === 'confirm_photo_upload') {
      return { data: { ok: true, status: 'staged' }, error: null }
    }
    if (fn === 'set_photo_framing') {
      return {
        data: { ok: true, framing: { zoom: 1, center_x: 0.5, center_y: 0.5 } },
        error: null,
      }
    }
    return { data: null, error: null }
  })
}

describe('QA2 stagePhoto network resilience', () => {
  beforeEach(() => {
    rpc.mockReset()
    upload.mockReset()
    remove.mockReset()
    upload.mockResolvedValue({ error: null })
    vi.stubGlobal('navigator', { onLine: true })
  })

  it('refuses to begin when navigator reports offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await expect(
      stageProcessedPhoto({
        image,
        game: 'drinkit',
        purpose: 'drink_log',
        beginRequestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps fetch/network upload failures to NETWORK with retry guidance', async () => {
    mockHappyBeginConfirm()
    upload.mockResolvedValue({ error: { message: 'Failed to fetch' } })
    await expect(
      stageProcessedPhoto({
        image,
        game: 'drinkit',
        purpose: 'drink_log',
        beginRequestId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      }),
    ).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('does not pretend success when confirm_photo_upload returns ok:false', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'begin_photo_upload') {
        return {
          data: {
            ok: true,
            photo_id: 'p-fail',
            bucket: 'game-photos',
            storage_path: 'player/drinkit/p-fail.jpg',
            status: 'pending_upload',
          },
          error: null,
        }
      }
      if (fn === 'confirm_photo_upload') {
        return {
          data: { ok: false, code: 'OBJECT_MISSING', message: 'Object missing' },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    await expect(
      stageProcessedPhoto({
        image,
        game: 'shipit',
        purpose: 'scavenger',
        beginRequestId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      }),
    ).rejects.toBeInstanceOf(StagePhotoError)
  })

  it('emits pending reservation before upload so retries can reuse the slot', async () => {
    mockHappyBeginConfirm()
    const pendingEvents: unknown[] = []
    let sawPendingBeforeUpload = false
    upload.mockImplementation(async () => {
      sawPendingBeforeUpload = pendingEvents.length > 0
      return { error: null }
    })
    await stageProcessedPhoto({
      image,
      game: 'drinkit',
      purpose: 'daily',
      beginRequestId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      onPending: (p) => pendingEvents.push(p),
    })
    expect(sawPendingBeforeUpload).toBe(true)
    expect(pendingEvents[0]).toMatchObject({ photoId: 'p-net' })
  })

  it('treats storage already-exists as recoverable and continues to confirm', async () => {
    mockHappyBeginConfirm()
    upload.mockResolvedValue({ error: { message: 'The resource already exists' } })
    const result = await stageProcessedPhoto({
      image,
      game: 'drinkit',
      purpose: 'drink_log',
      beginRequestId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    })
    expect(result.staged.status).toBe('staged')
    expect(rpc).toHaveBeenCalledWith('confirm_photo_upload', { p_photo_id: 'p-net' })
  })

  it('honors AbortSignal before upload begins', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      stageProcessedPhoto({
        image,
        game: 'drinkit',
        purpose: 'drink_log',
        beginRequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' })
  })

  it('passes AbortSignal through to storage.upload so mid-flight cancel works', async () => {
    mockHappyBeginConfirm()
    const controller = new AbortController()
    upload.mockImplementation(async (_path: string, _blob: Blob, opts: { signal?: AbortSignal }) => {
      expect(opts?.signal).toBe(controller.signal)
      return { error: null }
    })
    await stageProcessedPhoto({
      image,
      game: 'drinkit',
      purpose: 'drink_log',
      beginRequestId: '11111111-1111-4111-8111-111111111111',
      signal: controller.signal,
    })
  })

  it('surfaces BEGIN_REQUEST_CONSUMED without inventing a new photo id', async () => {
    rpc.mockResolvedValue({
      data: {
        ok: false,
        code: 'BEGIN_REQUEST_CONSUMED',
        message: 'Choose the photo again to start a new upload.',
      },
      error: null,
    })
    await expect(
      stageProcessedPhoto({
        image,
        game: 'shipit',
        purpose: 'scavenger',
        beginRequestId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toMatchObject({ code: 'BEGIN_REQUEST_CONSUMED' })
    expect(upload).not.toHaveBeenCalled()
  })

  it('reconcile path confirms when pending_upload object already present', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_my_photo') {
        return {
          data: {
            ok: true,
            status: 'pending_upload',
            storage_object_present: true,
            bucket: 'game-photos',
            storage_path: 'player/shipit/p2.jpg',
          },
          error: null,
        }
      }
      if (fn === 'confirm_photo_upload') {
        return { data: { ok: true, status: 'staged' }, error: null }
      }
      if (fn === 'set_photo_framing') {
        return {
          data: { ok: true, framing: { zoom: 1.2, center_x: 0.4, center_y: 0.6 } },
          error: null,
        }
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
        storagePath: 'player/shipit/p2.jpg',
        clientRequestId: '33333333-3333-4333-8333-333333333333',
      },
    })
    expect(result.staged.photoId).toBe('p2')
    expect(upload).not.toHaveBeenCalled()
  })
})
