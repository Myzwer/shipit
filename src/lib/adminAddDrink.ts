/**
 * Phase 6B1 — Admin Add Drink + Export Current Game Data client helpers.
 * Manual offerings are overlays: they never enter cocktail rotation, and this client never
 * invents rotation data. All writes go through admin RPCs with an idempotent request id.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { copy } from '@/ui/copy'

export type AddDrinkErrorCode =
  | 'unavailable'
  | 'error'
  | 'forbidden'
  | 'mismatch'
  | 'invalid_name'
  | 'invalid_kind'
  | 'bars_required'
  | 'bar_not_found'
  | 'invalid_ingredient'
  | 'no_catalog'
  | 'not_manual'

export class AdminAddDrinkError extends Error {
  code: AddDrinkErrorCode

  constructor(message: string, code: AddDrinkErrorCode = 'error') {
    super(message)
    this.name = 'AdminAddDrinkError'
    this.code = code
  }
}

export type DrinkKind = 'named_cocktail' | 'beer' | 'wine' | 'other_alcoholic'

export interface AddDrinkInput {
  displayName: string
  barKeys: string[]
  ingredientKeys: string[]
  kind?: DrinkKind
}

export interface ApplyAddDrinkInput extends AddDrinkInput {
  clientRequestId: string
}

export interface AddDrinkPreviewBar {
  bar_id: string
  canonical_key: string
  name: string | null
}

export interface AddDrinkPreviewIngredient {
  ingredient_id: string | null
  canonical_key: string
  display_name: string | null
  will_create: boolean
}

export interface AddDrinkPreview {
  ok: true
  catalog_version_id: string
  display_name: string
  drink_canonical_key: string
  kind: DrinkKind
  bars: AddDrinkPreviewBar[]
  ingredients: AddDrinkPreviewIngredient[]
  enters_cocktail_rotation: boolean
  [key: string]: unknown
}

export interface AddDrinkResult {
  ok: boolean
  code?: string
  client_request_id?: string
  display_name?: string
  drink_canonical_key?: string
  idempotent_replay?: boolean
  enters_cocktail_rotation?: boolean
  [key: string]: unknown
}

export type AddDrinkPreviewOutcome =
  | { status: 'ok'; preview: AddDrinkPreview }
  | { status: 'failed'; code: AddDrinkErrorCode; message: string }

export type AddDrinkApplyOutcome =
  | { status: 'ok'; result: AddDrinkResult; clientRequestId: string }
  | { status: 'failed'; code: AddDrinkErrorCode; message: string; clientRequestId: string }
  | { status: 'unknown'; message: string; clientRequestId: string }

export interface ManualOfferingIngredient {
  canonical_key: string
  display_name: string | null
}

export interface ManualOffering {
  offering_id: string
  display_name: string
  drink_canonical_key: string
  bar_canonical_key: string
  bar_name: string | null
  kind: DrinkKind
  active: boolean
  created_at_utc: string | null
  ingredients: ManualOfferingIngredient[]
}

export type DeactivateOutcome =
  | { status: 'ok'; offeringId: string }
  | { status: 'failed'; code: AddDrinkErrorCode; message: string }

export interface ExportBar {
  bar_id: string
  canonical_key: string
  name: string
  deck?: string | number | null
  active: boolean
}

export interface ExportIngredient {
  ingredient_id: string
  canonical_key: string
  display_name: string
  family?: string | null
}

export interface ExportPayload {
  ok: true
  export_schema_version: string
  exported_at_utc: string
  bars: ExportBar[]
  ingredients: ExportIngredient[]
  [key: string]: unknown
}

export interface AddDrinkOptions {
  bars: ExportBar[]
  ingredients: ExportIngredient[]
}

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

export function newAddDrinkRequestId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`.slice(0, 36)
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new AdminAddDrinkError('Supabase is not configured.', 'unavailable')
  }
  return supabase
}

async function rpc(fn: string, args?: Record<string, unknown>) {
  return client().rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

/** Map a server failure code to a client error code. ADMIN_REQUIRED → forbidden. */
export function mapAddDrinkFailCode(code?: string): AddDrinkErrorCode {
  switch (code) {
    case 'ADMIN_REQUIRED':
    case 'NOT_AUTHENTICATED':
      return 'forbidden'
    case 'REQUEST_ID_OPERATION_MISMATCH':
      return 'mismatch'
    case 'INVALID_DISPLAY_NAME':
      return 'invalid_name'
    case 'INVALID_KIND':
      return 'invalid_kind'
    case 'BARS_REQUIRED':
      return 'bars_required'
    case 'BAR_NOT_FOUND':
      return 'bar_not_found'
    case 'INVALID_INGREDIENT':
      return 'invalid_ingredient'
    case 'NO_ACTIVE_CATALOG':
      return 'no_catalog'
    case 'NOT_MANUAL_OFFERING':
    case 'INVALID_ARGUMENT':
      return 'not_manual'
    default:
      return 'error'
  }
}

export function addDrinkFailMessage(code: AddDrinkErrorCode, fallback: string): string {
  switch (code) {
    case 'forbidden':
      return copy.admin.forbiddenBody
    case 'invalid_name':
      return copy.admin.addDrinkNameInvalid
    case 'bars_required':
      return copy.admin.addDrinkBarsRequired
    case 'bar_not_found':
      return copy.admin.addDrinkBarNotFound
    case 'invalid_ingredient':
      return copy.admin.addDrinkIngredientInvalid
    case 'no_catalog':
      return copy.admin.addDrinkNoCatalog
    case 'mismatch':
      return copy.admin.addDrinkMismatch
    case 'not_manual':
      return copy.admin.removeAddedDrinkNotFound
    default:
      return fallback
  }
}

function isAdminRequired(message: string | undefined): boolean {
  return /ADMIN_REQUIRED|NOT_AUTHENTICATED/i.test(message ?? '')
}

function safeMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

function normalizeKeys(keys: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of keys) {
    const k = String(raw ?? '').trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

function addDrinkArgs(input: AddDrinkInput): Record<string, unknown> {
  return {
    p_display_name: input.displayName.trim(),
    p_bar_canonical_keys: normalizeKeys(input.barKeys),
    p_ingredient_canonical_keys: normalizeKeys(input.ingredientKeys),
    p_kind: input.kind ?? 'named_cocktail',
  }
}

// ---------------------------------------------------------------------------
// Preview / apply / reconcile
// ---------------------------------------------------------------------------

export async function previewAddDrink(input: AddDrinkInput): Promise<AddDrinkPreviewOutcome> {
  try {
    const { data, error } = await rpc('admin_preview_add_drink', addDrinkArgs(input))
    if (error) {
      const code: AddDrinkErrorCode = isAdminRequired(error.message) ? 'forbidden' : 'error'
      return {
        status: 'failed',
        code,
        message: addDrinkFailMessage(code, error.message || copy.admin.addDrinkPreviewError),
      }
    }
    const result = data as AddDrinkResult | null
    if (result?.ok) return { status: 'ok', preview: result as unknown as AddDrinkPreview }
    const code = mapAddDrinkFailCode(result?.code)
    return {
      status: 'failed',
      code,
      message: addDrinkFailMessage(code, copy.admin.addDrinkPreviewError),
    }
  } catch (err) {
    const code: AddDrinkErrorCode =
      err instanceof AdminAddDrinkError ? err.code : 'error'
    return {
      status: 'failed',
      code,
      message: safeMessage(err, copy.admin.addDrinkPreviewError),
    }
  }
}

function asFailed(
  result: AddDrinkResult | null | undefined,
  clientRequestId: string,
): AddDrinkApplyOutcome {
  const code = mapAddDrinkFailCode(result?.code)
  return {
    status: 'failed',
    code,
    message: addDrinkFailMessage(code, copy.admin.addDrinkFailureBody),
    clientRequestId,
  }
}

export async function applyAddDrink(input: ApplyAddDrinkInput): Promise<AddDrinkApplyOutcome> {
  const { clientRequestId } = input
  try {
    const { data, error } = await rpc('admin_add_drink', {
      p_client_request_id: clientRequestId,
      ...addDrinkArgs(input),
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
      // Transport/server error: outcome not confirmed. Reconcile by request id.
      return {
        status: 'unknown',
        message: error.message || copy.admin.addDrinkUnknownBody,
        clientRequestId,
      }
    }
    const result = data as AddDrinkResult | null
    if (result?.ok) return { status: 'ok', result, clientRequestId }
    if (result && result.ok === false) return asFailed(result, clientRequestId)
    return { status: 'unknown', message: copy.admin.addDrinkUnknownBody, clientRequestId }
  } catch (err) {
    if (err instanceof AdminAddDrinkError && err.code === 'unavailable') {
      return { status: 'failed', code: 'unavailable', message: err.message, clientRequestId }
    }
    return {
      status: 'unknown',
      message: safeMessage(err, copy.admin.addDrinkUnknownBody),
      clientRequestId,
    }
  }
}

/**
 * Look up a prior add-drink request by id. A missing ledger row is NOT a failure —
 * it stays `unknown` so the caller can retry the same request id.
 */
export async function reconcileAddDrink(clientRequestId: string): Promise<AddDrinkApplyOutcome> {
  try {
    const { data, error } = await rpc('admin_find_add_drink_request_by_id', {
      p_client_request_id: clientRequestId,
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
      return {
        status: 'unknown',
        message: error.message || copy.admin.addDrinkUnknownBody,
        clientRequestId,
      }
    }
    if (data && typeof data === 'object') {
      const result = data as AddDrinkResult
      if (result.ok) return { status: 'ok', result, clientRequestId }
      return asFailed(result, clientRequestId)
    }
    return { status: 'unknown', message: copy.admin.notRecordedBody, clientRequestId }
  } catch (err) {
    return {
      status: 'unknown',
      message: safeMessage(err, copy.admin.addDrinkUnknownBody),
      clientRequestId,
    }
  }
}

// ---------------------------------------------------------------------------
// Manual offerings
// ---------------------------------------------------------------------------

export async function listManualOfferings(): Promise<ManualOffering[]> {
  const { data, error } = await rpc('admin_list_manual_offerings')
  if (error) {
    if (isAdminRequired(error.message)) {
      throw new AdminAddDrinkError(copy.admin.forbiddenBody, 'forbidden')
    }
    throw new AdminAddDrinkError(error.message || copy.admin.addDrinkLoadError, 'error')
  }
  return (Array.isArray(data) ? data : []) as unknown as ManualOffering[]
}

export async function deactivateManualOffering(
  offeringId: string,
  note?: string,
): Promise<DeactivateOutcome> {
  try {
    const trimmed = note?.trim()
    const { data, error } = await rpc('admin_deactivate_manual_offering', {
      p_offering_id: offeringId,
      p_note: trimmed ? trimmed : null,
    })
    if (error) {
      const code: AddDrinkErrorCode = isAdminRequired(error.message) ? 'forbidden' : 'error'
      return {
        status: 'failed',
        code,
        message: addDrinkFailMessage(code, copy.admin.removeAddedDrinkFailure),
      }
    }
    const result = data as AddDrinkResult | null
    if (result?.ok) return { status: 'ok', offeringId }
    const code = mapAddDrinkFailCode(result?.code)
    return {
      status: 'failed',
      code,
      message: addDrinkFailMessage(code, copy.admin.removeAddedDrinkFailure),
    }
  } catch (err) {
    return {
      status: 'failed',
      code: err instanceof AdminAddDrinkError ? err.code : 'error',
      message: safeMessage(err, copy.admin.removeAddedDrinkFailure),
    }
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportCurrentGameData(): Promise<ExportPayload> {
  const { data, error } = await rpc('admin_export_current_game_data')
  if (error) {
    if (isAdminRequired(error.message)) {
      throw new AdminAddDrinkError(copy.admin.forbiddenBody, 'forbidden')
    }
    throw new AdminAddDrinkError(error.message || copy.admin.exportFailureBody, 'error')
  }
  const payload = data as (ExportPayload & { code?: string }) | null
  if (!payload || typeof payload !== 'object' || payload.ok !== true) {
    const code = mapAddDrinkFailCode((payload as { code?: string } | null)?.code)
    throw new AdminAddDrinkError(addDrinkFailMessage(code, copy.admin.exportFailureBody), code)
  }
  return payload
}

/** Bars (active only) and ingredients for the Add Drink pickers, from one export call. */
export async function loadAddDrinkOptions(): Promise<AddDrinkOptions> {
  const payload = await exportCurrentGameData()
  const bars = (Array.isArray(payload.bars) ? payload.bars : []).filter((b) => b.active)
  const ingredients = Array.isArray(payload.ingredients) ? payload.ingredients : []
  return { bars, ingredients }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** `star-princess-game-data-YYYYMMDD.json` using the given date (defaults to now, local time). */
export function exportFilename(date: Date = new Date()): string {
  const ymd = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
  return `star-princess-game-data-${ymd}.json`
}

/** Trigger a browser download of the export payload as a JSON file. Returns the filename. */
export function downloadExportJson(payload: unknown, date: Date = new Date()): string {
  const filename = exportFilename(date)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return filename
}
