import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}))

import {
  AdminCatalogImportError,
  canonicalJsonbText,
  findPublishRequest,
  hashPayload,
  listCatalogVersions,
  mapCatalogImportFailCode,
  previewPublish,
  publishImport,
  rollbackCatalog,
  stageImport,
} from '@/lib/adminCatalogImport'
import {
  PENDING_ADMIN_CATALOG_IMPORT_KEY,
  clearPendingAdminCatalogImport,
  readPendingAdminCatalogImport,
  writePendingAdminCatalogImport,
} from '@/lib/pendingAdminCatalogImport'
import { buildScheduleReadyCatalog } from '../fixtures/catalog/builders'

const REQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

beforeEach(() => {
  rpc.mockReset()
})

describe('canonicalJsonbText / hashPayload (must match Postgres jsonb::text)', () => {
  it('orders keys by length then bytes and escapes like jsonb', () => {
    // Expected string captured from Postgres: '{...}'::jsonb::text
    const value = {
      b: 1,
      a: [1, 2.5, { zz: null, y: true }],
      ccc: 'q"\\\n\t\u0001é/<',
      é: 0.0000001,
      e: 1e21,
      neg: -0.5,
    }
    expect(canonicalJsonbText(value)).toBe(
      '{"a": [1, 2.5, {"y": true, "zz": null}], "b": 1, "e": 1000000000000000000000, "é": 0.0000001, "ccc": "q\\"\\\\\\n\\t\\u0001é/<", "neg": -0.5}',
    )
  })

  it('hashes the canonical text with sha256 hex', async () => {
    // sha256('{"a": 1}') as computed by Postgres encode(sha256(convert_to(..., 'UTF8')), 'hex')
    expect(await hashPayload({ a: 1 })).toBe(
      'f9d86028c6e0d64e225186f96acb69338b2c59764df79162107f5c4bb34d1310',
    )
    expect(await hashPayload({ b: 2, a: 1 })).toBe(await hashPayload({ a: 1, b: 2 }))
  })

  it('rejects non-finite numbers', () => {
    expect(() => canonicalJsonbText({ n: Number.NaN })).toThrow(AdminCatalogImportError)
  })
})

describe('stageImport', () => {
  it('does not call the server when the catalog is not ready for scheduling', async () => {
    const short = buildScheduleReadyCatalog(70, 39)
    const out = await stageImport(short, REQ)
    expect(out.status).toBe('failed')
    if (out.status === 'failed') {
      expect(out.code).toBe('not_ready')
      expect(out.preview?.safeToPublish).toBe(false)
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends payload, request id, and a validation summary with the payload hash', async () => {
    const doc = buildScheduleReadyCatalog(72, 39)
    rpc.mockResolvedValue({
      data: { ok: true, candidate_id: 'cand-1', payload_hash: await hashPayload(doc) },
      error: null,
    })
    const out = await stageImport(doc, REQ)
    expect(out.status).toBe('ok')
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(fn).toBe('admin_stage_catalog_import')
    expect(args.p_client_request_id).toBe(REQ)
    expect(args.p_payload).toBe(doc)
    const validation = args.p_validation as Record<string, unknown>
    expect(validation.readiness).toBe('ready_for_scheduling')
    expect(validation.error_count).toBe(0)
    expect(validation.payload_hash).toBe(await hashPayload(doc))
  })

  it('maps ADMIN_REQUIRED to forbidden and transport errors to unknown', async () => {
    const doc = buildScheduleReadyCatalog(72, 39)
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'ADMIN_REQUIRED' } })
    const forbidden = await stageImport(doc, REQ)
    expect(forbidden.status).toBe('failed')
    if (forbidden.status === 'failed') expect(forbidden.code).toBe('forbidden')

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'network down' } })
    const unknown = await stageImport(doc, REQ)
    expect(unknown.status).toBe('unknown')
  })
})

describe('preview / publish / rollback / reconcile / list', () => {
  it('previewPublish returns the plan or a mapped failure', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, safe_to_publish: true, blockers: [] }, error: null })
    const ok = await previewPublish('cand-1')
    expect(ok.status).toBe('ok')

    rpc.mockResolvedValueOnce({ data: { ok: false, code: 'CANDIDATE_NOT_FOUND' }, error: null })
    const missing = await previewPublish('cand-2')
    expect(missing).toMatchObject({ status: 'failed', code: 'candidate_not_found' })
  })

  it('publishImport passes expectations and surfaces blockers', async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: false, code: 'PUBLISH_BLOCKED', blockers: [{ code: 'CURRENT_OFFER_MISSING' }] },
      error: null,
    })
    const out = await publishImport({
      clientRequestId: REQ,
      candidateId: 'cand-1',
      expectedActiveCatalogVersionId: 'v1',
      expectedPayloadHash: 'abc',
    })
    expect(rpc).toHaveBeenCalledWith('admin_publish_catalog_import', {
      p_client_request_id: REQ,
      p_candidate_id: 'cand-1',
      p_expected_active_catalog_version_id: 'v1',
      p_expected_payload_hash: 'abc',
    })
    expect(out).toMatchObject({ status: 'failed', code: 'blocked' })
    if (out.status === 'failed') expect(out.blockers[0]?.code).toBe('CURRENT_OFFER_MISSING')
  })

  it('transport errors during publish/rollback are unknown, not failed', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } })
    const pub = await publishImport({
      clientRequestId: REQ,
      candidateId: 'c',
      expectedActiveCatalogVersionId: null,
      expectedPayloadHash: 'h',
    })
    expect(pub.status).toBe('unknown')
    const rb = await rollbackCatalog({
      clientRequestId: REQ,
      targetCatalogVersionId: 't',
      expectedActiveCatalogVersionId: 'a',
    })
    expect(rb.status).toBe('unknown')
  })

  it('findPublishRequest keeps a missing ledger row unknown and in_progress unknown', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect((await findPublishRequest(REQ)).status).toBe('unknown')

    rpc.mockResolvedValueOnce({ data: { ok: true, request_status: 'in_progress' }, error: null })
    expect((await findPublishRequest(REQ)).status).toBe('unknown')

    rpc.mockResolvedValueOnce({
      data: { ok: true, request_status: 'completed', catalog_version_id: 'v2' },
      error: null,
    })
    const done = await findPublishRequest(REQ)
    expect(done.status).toBe('ok')
  })

  it('listCatalogVersions throws forbidden for non-admins', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'ADMIN_REQUIRED' } })
    await expect(listCatalogVersions()).rejects.toMatchObject({ code: 'forbidden' })
    rpc.mockResolvedValueOnce({ data: [{ id: 'v1' }], error: null })
    expect(await listCatalogVersions()).toHaveLength(1)
  })

  it('maps server codes', () => {
    expect(mapCatalogImportFailCode('ADMIN_REQUIRED')).toBe('forbidden')
    expect(mapCatalogImportFailCode('STALE_ACTIVE_VERSION')).toBe('stale_active')
    expect(mapCatalogImportFailCode('ROLLBACK_BLOCKED')).toBe('blocked')
    expect(mapCatalogImportFailCode('POOL_SHORTAGE')).toBe('pool_shortage')
    expect(mapCatalogImportFailCode('SOMETHING_NEW')).toBe('error')
  })
})

describe('pending catalog import storage', () => {
  it('round-trips ids and expectations only (no payload)', () => {
    const storage = memoryStorage()
    writePendingAdminCatalogImport(
      {
        action: 'publish',
        clientRequestId: REQ,
        candidateId: 'cand-1',
        expectedActiveCatalogVersionId: 'v1',
        expectedPayloadHash: 'abc',
        // @ts-expect-error extra fields must never be persisted
        payload: { secret: true },
      },
      storage,
    )
    const raw = storage.getItem(PENDING_ADMIN_CATALOG_IMPORT_KEY)!
    expect(raw).not.toContain('secret')
    const read = readPendingAdminCatalogImport(storage)
    expect(read).toMatchObject({ action: 'publish', clientRequestId: REQ, candidateId: 'cand-1' })
    clearPendingAdminCatalogImport(storage)
    expect(readPendingAdminCatalogImport(storage)).toBeNull()
  })

  it('ignores malformed storage', () => {
    const storage = memoryStorage()
    storage.setItem(PENDING_ADMIN_CATALOG_IMPORT_KEY, '{bad')
    expect(readPendingAdminCatalogImport(storage)).toBeNull()
    storage.setItem(PENDING_ADMIN_CATALOG_IMPORT_KEY, JSON.stringify({ version: 1, action: 'nope', clientRequestId: REQ }))
    expect(readPendingAdminCatalogImport(storage)).toBeNull()
  })
})
