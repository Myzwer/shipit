/**
 * Phase 6B2 — Admin catalog import: stage → preview → publish / rollback client helpers.
 *
 * - Import is `full_snapshot` schema 1.0 (NOT the Export Current Game Data shape).
 * - Pure TS validation is DB-blind; the server adds database safety checks.
 * - Every write carries a client request id; unknown outcomes reconcile via findPublishRequest.
 * - No UI copy here: messages are neutral fallbacks for the Admin screens to replace.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { copy } from '@/ui/copy'
import {
  buildStageValidation,
  isReadyToStage,
  previewCatalogImport,
  type CatalogPreviewResult,
  type CatalogStageValidation,
} from '@/lib/catalog'

export type CatalogImportErrorCode =
  | 'unavailable'
  | 'error'
  | 'forbidden'
  | 'mismatch'
  | 'not_ready'
  | 'invalid_payload'
  | 'pool_shortage'
  | 'catalog_exists'
  | 'stale_active'
  | 'blocked'
  | 'candidate_not_found'
  | 'candidate_not_staged'
  | 'hash_mismatch'
  | 'in_progress'
  | 'rollback_unavailable'

export class AdminCatalogImportError extends Error {
  code: CatalogImportErrorCode

  constructor(message: string, code: CatalogImportErrorCode = 'error') {
    super(message)
    this.name = 'AdminCatalogImportError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogBlocker {
  code: string
  message?: string
  [key: string]: unknown
}

export interface CatalogSetDiff {
  added: string[]
  added_count: number
  removed: string[]
  removed_count: number
  unchanged_count: number
}

export interface PublishPreview {
  ok: true
  read_only: true
  mutated_database: false
  candidate_id: string
  catalog_id: string
  base_catalog_id: string | null
  payload_hash: string
  candidate_status: string
  active_catalog_version_id: string | null
  safe_to_publish: boolean
  blockers: CatalogBlocker[]
  warnings: CatalogBlocker[]
  diff: {
    bars: CatalogSetDiff
    offerings: CatalogSetDiff
    ingredients: CatalogSetDiff
    cocktail_candidates: CatalogSetDiff
    ingredient_candidates: CatalogSetDiff
  }
  overlays: {
    manual_offerings: {
      carry_forward: Array<Record<string, unknown>>
      redundant: Array<Record<string, unknown>>
      dropped: Array<Record<string, unknown>>
    }
    corrections: {
      redundant_count: number
      orphaned_count: number
      admin_suppressed_in_catalog: Array<Record<string, unknown>>
    }
  }
  schedule: {
    cruise_config_id: string | null
    scheduled_slots: { cocktail: number; ingredient: number }
    available_pool: { cocktail: number; ingredient: number }
    protected_offers: Array<Record<string, unknown>>
  }
  [key: string]: unknown
}

export interface StageResult {
  ok: boolean
  code?: string
  candidate_id?: string
  catalog_id?: string
  payload_hash?: string
  status?: string
  idempotent_replay?: boolean
  [key: string]: unknown
}

export interface PublishResult {
  ok: boolean
  code?: string
  action?: 'publish' | 'rollback'
  catalog_version_id?: string
  catalog_id?: string
  previous_catalog_version_id?: string | null
  payload_hash?: string
  idempotent_replay?: boolean
  blockers?: CatalogBlocker[]
  warnings?: CatalogBlocker[]
  reassigned_slots?: { cocktail: number; ingredient: number }
  [key: string]: unknown
}

export interface CatalogVersionSummary {
  id: string
  catalog_id: string
  base_catalog_id: string | null
  status: 'draft' | 'validated' | 'active' | 'retired'
  is_active: boolean
  payload_hash: string
  imported_at: string | null
  activated_at: string | null
  created_at: string
  rollback_eligible: boolean
  origin: 'fixture' | 'publish' | 'rollback' | string
}

export type StageOutcome =
  | {
      status: 'ok'
      candidateId: string
      payloadHash: string
      result: StageResult
      clientRequestId: string
    }
  | {
      status: 'failed'
      code: CatalogImportErrorCode
      serverCode?: string
      message: string
      clientRequestId: string
      preview?: CatalogPreviewResult
    }
  | { status: 'unknown'; message: string; clientRequestId: string }

export type PreviewOutcome =
  | { status: 'ok'; preview: PublishPreview }
  | { status: 'failed'; code: CatalogImportErrorCode; serverCode?: string; message: string }

export type ApplyOutcome =
  | { status: 'ok'; result: PublishResult; clientRequestId: string }
  | {
      status: 'failed'
      code: CatalogImportErrorCode
      serverCode?: string
      message: string
      blockers: CatalogBlocker[]
      clientRequestId: string
    }
  | { status: 'unknown'; message: string; clientRequestId: string }

export interface PublishInput {
  clientRequestId: string
  candidateId: string
  expectedActiveCatalogVersionId: string | null
  expectedPayloadHash: string
}

export interface RollbackInput {
  clientRequestId: string
  targetCatalogVersionId: string
  expectedActiveCatalogVersionId: string | null
}

// ---------------------------------------------------------------------------
// Payload hash (must equal server catalog_payload_sha256 = sha256(jsonb::text))
// ---------------------------------------------------------------------------

const utf8 = new TextEncoder()

/** Postgres jsonb orders object keys by byte length, then bytewise. */
function jsonbKeyCompare(a: string, b: string): number {
  const ea = utf8.encode(a)
  const eb = utf8.encode(b)
  if (ea.length !== eb.length) return ea.length - eb.length
  for (let i = 0; i < ea.length; i += 1) {
    const d = ea[i]! - eb[i]!
    if (d !== 0) return d
  }
  return 0
}

/** Expand JS exponent notation to the plain decimal Postgres numeric prints. */
function plainNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new AdminCatalogImportError('Catalog payload contains a non-finite number.', 'invalid_payload')
  }
  const s = String(n)
  const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(s)
  if (!m) return s === '-0' ? '0' : s
  const sign = m[1] ?? ''
  const int = m[2] ?? ''
  const frac = m[3] ?? ''
  const exp = Number(m[4])
  const digits = int + frac
  const pointAt = int.length + exp
  if (pointAt <= 0) return `${sign}0.${'0'.repeat(-pointAt)}${digits}`
  if (pointAt >= digits.length) return `${sign}${digits}${'0'.repeat(pointAt - digits.length)}`
  return `${sign}${digits.slice(0, pointAt)}.${digits.slice(pointAt)}`
}

/**
 * Reproduce Postgres `jsonb::text` for a JSON-compatible value:
 * keys sorted (length, bytes), `": "` and `", "` separators, strings escaped like JSON.
 */
export function canonicalJsonbText(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      return plainNumber(value)
    case 'string':
      return JSON.stringify(value)
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalJsonbText(v === undefined ? null : v)).join(', ')}]`
      }
      const obj = value as Record<string, unknown>
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort(jsonbKeyCompare)
      return `{${keys.map((k) => `${JSON.stringify(k)}: ${canonicalJsonbText(obj[k])}`).join(', ')}}`
    }
    default:
      throw new AdminCatalogImportError('Catalog payload is not JSON-compatible.', 'invalid_payload')
  }
}

/** sha256 hex of the canonical jsonb text — equals the server `payload_hash`. */
export async function hashPayload(payload: unknown): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new AdminCatalogImportError('Web Crypto is unavailable for payload hashing.', 'unavailable')
  }
  const digest = await subtle.digest('SHA-256', utf8.encode(canonicalJsonbText(payload)))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

export function newCatalogImportRequestId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`.slice(0, 36)
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new AdminCatalogImportError('Supabase is not configured.', 'unavailable')
  }
  return supabase
}

async function rpc(fn: string, args?: Record<string, unknown>) {
  return client().rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

function isAdminRequired(message: string | undefined): boolean {
  return /ADMIN_REQUIRED|NOT_AUTHENTICATED/i.test(message ?? '')
}

function safeMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

/** Map a server failure code to a client error code. ADMIN_REQUIRED → forbidden. */
export function mapCatalogImportFailCode(code?: string): CatalogImportErrorCode {
  switch (code) {
    case 'ADMIN_REQUIRED':
    case 'NOT_AUTHENTICATED':
      return 'forbidden'
    case 'REQUEST_ID_OPERATION_MISMATCH':
      return 'mismatch'
    case 'REQUEST_IN_PROGRESS':
      return 'in_progress'
    case 'VALIDATION_NOT_READY':
    case 'VALIDATION_ERRORS':
    case 'VALIDATION_REQUIRED':
      return 'not_ready'
    case 'SCHEMA_VERSION':
    case 'MODE':
    case 'CATALOG_ID_INVALID':
    case 'BASE_CATALOG_INVALID':
    case 'BASE_CATALOG_SELF':
    case 'PAYLOAD_REQUIRED':
    case 'PAYLOAD_SHAPE':
    case 'PAYLOAD_REFERENCE_ERROR':
      return 'invalid_payload'
    case 'POOL_SHORTAGE':
      return 'pool_shortage'
    case 'CATALOG_ID_EXISTS':
      return 'catalog_exists'
    case 'STALE_ACTIVE_VERSION':
      return 'stale_active'
    case 'PUBLISH_BLOCKED':
    case 'ROLLBACK_BLOCKED':
      return 'blocked'
    case 'CANDIDATE_NOT_FOUND':
      return 'candidate_not_found'
    case 'CANDIDATE_NOT_STAGED':
    case 'CANDIDATE_ALREADY_PUBLISHED':
      return 'candidate_not_staged'
    case 'PAYLOAD_HASH_MISMATCH':
      return 'hash_mismatch'
    case 'ROLLBACK_TARGET_NOT_FOUND':
    case 'ROLLBACK_TARGET_ACTIVE':
    case 'ROLLBACK_TARGET_NOT_RETIRED':
    case 'ROLLBACK_TARGET_NOT_RESTORABLE':
      return 'rollback_unavailable'
    default:
      return 'error'
  }
}

function failMessage(code: CatalogImportErrorCode, serverCode: string | undefined, fallback: string) {
  if (code === 'forbidden') return copy.admin.forbiddenBody
  return serverCode ? `${fallback} (${serverCode})` : fallback
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

/**
 * Validate locally, then stage on the server. Never stages a payload that is not
 * `ready_for_scheduling` in the pure TS preview.
 */
export async function stageImport(
  payload: unknown,
  clientRequestId: string = newCatalogImportRequestId(),
): Promise<StageOutcome> {
  const preview = previewCatalogImport(payload)
  if (!isReadyToStage(preview)) {
    return {
      status: 'failed',
      code: 'not_ready',
      serverCode: 'VALIDATION_NOT_READY',
      message: 'Catalog is not ready for scheduling.',
      clientRequestId,
      preview,
    }
  }

  try {
    const payloadHash = await hashPayload(payload)
    const validation: CatalogStageValidation = buildStageValidation(preview, payloadHash)
    const { data, error } = await rpc('admin_stage_catalog_import', {
      p_client_request_id: clientRequestId,
      p_payload: payload,
      p_validation: validation,
    })
    if (error) {
      if (isAdminRequired(error.message)) {
        return {
          status: 'failed',
          code: 'forbidden',
          message: copy.admin.forbiddenBody,
          clientRequestId,
        }
      }
      return { status: 'unknown', message: error.message || 'Staging outcome unknown.', clientRequestId }
    }
    const result = data as StageResult | null
    if (result?.ok && result.candidate_id) {
      return {
        status: 'ok',
        candidateId: result.candidate_id,
        payloadHash: result.payload_hash ?? payloadHash,
        result,
        clientRequestId,
      }
    }
    if (result && result.ok === false) {
      const code = mapCatalogImportFailCode(result.code)
      return {
        status: 'failed',
        code,
        serverCode: result.code,
        message: failMessage(code, result.code, 'Catalog staging failed.'),
        clientRequestId,
        preview,
      }
    }
    return { status: 'unknown', message: 'Staging outcome unknown.', clientRequestId }
  } catch (err) {
    if (err instanceof AdminCatalogImportError && err.code === 'unavailable') {
      return { status: 'failed', code: 'unavailable', message: err.message, clientRequestId }
    }
    return { status: 'unknown', message: safeMessage(err, 'Staging outcome unknown.'), clientRequestId }
  }
}

// ---------------------------------------------------------------------------
// Preview (read-only)
// ---------------------------------------------------------------------------

export async function previewPublish(candidateId: string): Promise<PreviewOutcome> {
  try {
    const { data, error } = await rpc('admin_preview_catalog_publish', {
      p_candidate_id: candidateId,
    })
    if (error) {
      const code: CatalogImportErrorCode = isAdminRequired(error.message) ? 'forbidden' : 'error'
      return {
        status: 'failed',
        code,
        message: failMessage(code, undefined, error.message || 'Catalog preview failed.'),
      }
    }
    const result = data as (PublishPreview & { code?: string }) | null
    if (result?.ok) return { status: 'ok', preview: result }
    const serverCode = (result as { code?: string } | null)?.code
    const code = mapCatalogImportFailCode(serverCode)
    return {
      status: 'failed',
      code,
      serverCode,
      message: failMessage(code, serverCode, 'Catalog preview failed.'),
    }
  } catch (err) {
    const code: CatalogImportErrorCode = err instanceof AdminCatalogImportError ? err.code : 'error'
    return { status: 'failed', code, message: safeMessage(err, 'Catalog preview failed.') }
  }
}

// ---------------------------------------------------------------------------
// Publish / rollback / reconcile
// ---------------------------------------------------------------------------

function asApplyFailed(result: PublishResult, clientRequestId: string): ApplyOutcome {
  const code = mapCatalogImportFailCode(result.code)
  return {
    status: 'failed',
    code,
    serverCode: result.code,
    message: failMessage(code, result.code, 'Catalog change failed.'),
    blockers: Array.isArray(result.blockers) ? result.blockers : [],
    clientRequestId,
  }
}

function classifyApply(data: unknown, clientRequestId: string): ApplyOutcome {
  const result = data as PublishResult | null
  if (result?.ok) return { status: 'ok', result, clientRequestId }
  if (result && result.ok === false) return asApplyFailed(result, clientRequestId)
  return { status: 'unknown', message: 'Catalog change outcome unknown.', clientRequestId }
}

async function runApply(
  fn: string,
  args: Record<string, unknown>,
  clientRequestId: string,
): Promise<ApplyOutcome> {
  try {
    const { data, error } = await rpc(fn, args)
    if (error) {
      if (isAdminRequired(error.message)) {
        return {
          status: 'failed',
          code: 'forbidden',
          message: copy.admin.forbiddenBody,
          blockers: [],
          clientRequestId,
        }
      }
      // Transport/server error: outcome not confirmed. Reconcile by request id.
      return {
        status: 'unknown',
        message: error.message || 'Catalog change outcome unknown.',
        clientRequestId,
      }
    }
    return classifyApply(data, clientRequestId)
  } catch (err) {
    if (err instanceof AdminCatalogImportError && err.code === 'unavailable') {
      return {
        status: 'failed',
        code: 'unavailable',
        message: err.message,
        blockers: [],
        clientRequestId,
      }
    }
    return {
      status: 'unknown',
      message: safeMessage(err, 'Catalog change outcome unknown.'),
      clientRequestId,
    }
  }
}

export function publishImport(input: PublishInput): Promise<ApplyOutcome> {
  return runApply(
    'admin_publish_catalog_import',
    {
      p_client_request_id: input.clientRequestId,
      p_candidate_id: input.candidateId,
      p_expected_active_catalog_version_id: input.expectedActiveCatalogVersionId,
      p_expected_payload_hash: input.expectedPayloadHash,
    },
    input.clientRequestId,
  )
}

export function rollbackCatalog(input: RollbackInput): Promise<ApplyOutcome> {
  return runApply(
    'admin_rollback_catalog',
    {
      p_client_request_id: input.clientRequestId,
      p_target_catalog_version_id: input.targetCatalogVersionId,
      p_expected_active_catalog_version_id: input.expectedActiveCatalogVersionId,
    },
    input.clientRequestId,
  )
}

/**
 * Look up a prior publish/rollback request. A missing ledger row stays `unknown`
 * so the caller may retry the same request id.
 */
export async function findPublishRequest(clientRequestId: string): Promise<ApplyOutcome> {
  try {
    const { data, error } = await rpc('admin_find_catalog_publish_request_by_id', {
      p_client_request_id: clientRequestId,
    })
    if (error) {
      if (isAdminRequired(error.message)) {
        return {
          status: 'failed',
          code: 'forbidden',
          message: copy.admin.forbiddenBody,
          blockers: [],
          clientRequestId,
        }
      }
      return {
        status: 'unknown',
        message: error.message || 'Catalog change outcome unknown.',
        clientRequestId,
      }
    }
    if (data && typeof data === 'object') {
      const row = data as PublishResult & { request_status?: string }
      if (row.request_status === 'in_progress') {
        return { status: 'unknown', message: 'Catalog change is still in progress.', clientRequestId }
      }
      return classifyApply(row, clientRequestId)
    }
    return { status: 'unknown', message: 'No record of that catalog change.', clientRequestId }
  } catch (err) {
    return {
      status: 'unknown',
      message: safeMessage(err, 'Catalog change outcome unknown.'),
      clientRequestId,
    }
  }
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export async function listCatalogVersions(): Promise<CatalogVersionSummary[]> {
  const { data, error } = await rpc('admin_list_catalog_versions')
  if (error) {
    if (isAdminRequired(error.message)) {
      throw new AdminCatalogImportError(copy.admin.forbiddenBody, 'forbidden')
    }
    throw new AdminCatalogImportError(error.message || 'Could not load catalog versions.', 'error')
  }
  return (Array.isArray(data) ? data : []) as unknown as CatalogVersionSummary[]
}
