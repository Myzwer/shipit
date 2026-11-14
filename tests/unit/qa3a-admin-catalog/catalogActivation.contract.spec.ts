/**
 * QA3A — STATIC source contracts for Admin catalog activation.
 *
 * These tests read source text only (fs). They are NOT integration tests and they do NOT
 * verify that DB activation is transactional, that the pointer flip is atomic, that RPCs
 * authorize admins, or that rollback works. Transactional DB activation is NOT verified by
 * these unit tests — see tests/integration/admin.phase6b2.catalog_publish.test.ts (needs a
 * disposable local Supabase).
 *
 * Tests tagged "DEFECT" intentionally encode the CORRECT behavior and are expected to FAIL
 * until the app is fixed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../../..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|vue|js|mjs)$/.test(name)) out.push(full)
  }
  return out
}

const SFC = read('src/features/admin/CatalogImportSection.vue')
const CLIENT = read('src/lib/adminCatalogImport.ts')

/** Slice of runStageAndPreview() source (up to the next top-level function). */
function runStageAndPreviewBody(): string {
  const start = SFC.indexOf('async function runStageAndPreview')
  expect(start).toBeGreaterThanOrEqual(0)
  const end = SFC.indexOf('async function runPublish', start)
  expect(end).toBeGreaterThan(start)
  return SFC.slice(start, end)
}

describe('Admin catalog activation — stage → preview → publish → rollback RPC contract (static)', () => {
  it('adminCatalogImport.ts calls all four admin catalog RPCs by name', () => {
    for (const rpcName of [
      'admin_stage_catalog_import',
      'admin_preview_catalog_publish',
      'admin_publish_catalog_import',
      'admin_rollback_catalog',
    ]) {
      expect(CLIENT).toContain(`'${rpcName}'`)
    }
  })

  it('CatalogImportSection.vue drives the flow only through the typed client wrappers', () => {
    for (const fn of ['stageImport', 'previewPublish', 'publishImport', 'rollbackCatalog']) {
      expect(SFC).toMatch(new RegExp(`\\b${fn}\\b`))
    }
    expect(SFC).toContain("from '@/lib/adminCatalogImport'")
    // The SFC must not talk to Supabase/RPC directly, bypassing the wrappers.
    expect(SFC).not.toMatch(/\.rpc\(/)
    expect(SFC).not.toMatch(/from '@\/lib\/supabase'/)
    for (const rpcName of [
      'admin_stage_catalog_import',
      'admin_preview_catalog_publish',
      'admin_publish_catalog_import',
      'admin_rollback_catalog',
    ]) {
      expect(SFC).not.toContain(rpcName)
    }
  })

  it('stages first, then previews, and only then offers publish (call order in source)', () => {
    const body = runStageAndPreviewBody()
    const stageAt = body.indexOf('await stageImport(')
    const previewAt = body.indexOf('await previewPublish(')
    expect(stageAt).toBeGreaterThanOrEqual(0)
    expect(previewAt).toBeGreaterThan(stageAt)
    // Publish is a separate, user-confirmed function — never invoked from stage/preview.
    expect(body).not.toContain('publishImport(')
    expect(body).not.toContain('runPublish(')
    expect(SFC).toContain('data-testid="catalog-publish-confirm-yes"')
    expect(SFC).toMatch(/:disabled="!canPublish"/)
    expect(SFC).toMatch(/serverPreview\.value\?\.safe_to_publish/)
  })

  it('stage is gated on the local isReadyToStage preview', () => {
    expect(SFC).toMatch(/isReadyToStage\(localPreview\.value!?\)/)
    expect(SFC).toMatch(/:disabled="!canStage \|\| Boolean\(pending\)"/)
  })

  it('runPublish and runRollback pass expected active version / payload hash guards', () => {
    expect(SFC).toMatch(/expectedPayloadHash: payloadHash\.value/)
    expect(SFC).toMatch(/expectedActiveCatalogVersionId: activeVersion\.value\?\.id \?\? null/)
    expect(SFC).toMatch(/targetCatalogVersionId: confirmRollbackId\.value/)
  })
})

describe('Admin catalog activation — no redeploy required (static)', () => {
  it('no runtime src file imports a content/catalogs launch/active catalog snapshot', () => {
    const offenders: string[] = []
    for (const file of walk(join(root, 'src'))) {
      const text = readFileSync(file, 'utf8')
      if (/content\/catalogs\//.test(text) || /launch-candidate-v1|development-preview-v1/.test(text)) {
        offenders.push(relative(root, file))
      }
    }
    // The only allowed reference is the organizer-exceptions registry used by the VALIDATOR
    // (not the active-catalog source). Active catalog data must come from the database.
    expect(offenders).toEqual(['src/lib/catalog/organizerAuthorizedExceptions.ts'])
  })

  it('stores never import content/catalogs or catalog JSON snapshots', () => {
    for (const file of walk(join(root, 'src/stores'))) {
      const text = readFileSync(file, 'utf8')
      expect(text, relative(root, file)).not.toMatch(/content\/catalogs/)
      expect(text, relative(root, file)).not.toMatch(/\.json['"]/)
    }
  })

  it('no runtime src code uses import.meta.glob / fetch against catalog snapshots', () => {
    for (const file of walk(join(root, 'src'))) {
      const text = readFileSync(file, 'utf8')
      expect(text, relative(root, file)).not.toMatch(/import\.meta\.glob\([^)]*catalog/i)
      expect(text, relative(root, file)).not.toMatch(/fetch\([^)]*catalogs?\//i)
    }
  })

  it('activation is a database pointer flip in the publish migration, not a build artifact', () => {
    const migration = read('supabase/migrations/20261105006800_phase6b2_catalog_import_publish_rollback.sql')
    expect(migration).toMatch(/update public\.active_catalog_pointer\s+set catalog_version_id = v_version/)
    expect(migration).toMatch(/create or replace function public\.admin_publish_catalog_import\(/)
    expect(migration).toMatch(/create or replace function public\.admin_rollback_catalog\(/)
    const docs = read('docs/CATALOG.md')
    expect(docs).toMatch(/pointer flip/)
    expect(docs).toContain('admin_publish_catalog_import')
    expect(docs).toContain('admin_rollback_catalog')
  })

  it('the client exposes catalog versions via RPC list, not a bundled file', () => {
    expect(CLIENT).toContain('admin_list_catalog_versions')
  })
})

describe('CatalogImportSection.runStageAndPreview — pending-state ordering (static)', () => {
  it('writes a stage pending marker BEFORE calling stageImport', () => {
    const body = runStageAndPreviewBody()
    const writeStage = body.search(/writePendingAdminCatalogImport\(\{\s*action: 'stage'/)
    const stageCall = body.indexOf('await stageImport(')
    expect(writeStage).toBeGreaterThanOrEqual(0)
    expect(stageCall).toBeGreaterThan(writeStage)
  })

  it('after a successful stage, clears the stage pending lock BEFORE previewPublish (no publish rewrite)', () => {
    const body = runStageAndPreviewBody()
    const stageCall = body.indexOf('await stageImport(')
    const stageOk = body.indexOf("if (staged.status !== 'ok')", stageCall)
    const afterStageOk = body.slice(body.indexOf('candidateId.value = staged.candidateId', stageOk))
    const previewCall = afterStageOk.indexOf('await previewPublish(')
    const beforePreview = afterStageOk.slice(0, previewCall)
    // Stage succeeded — clear local lock. Do not mint a publish pending with the stage request id.
    expect(beforePreview).toContain('clearPendingAdminCatalogImport()')
    expect(beforePreview).toContain('pending.value = null')
    expect(beforePreview).not.toMatch(/writePendingAdminCatalogImport\(\{\s*action: 'publish'/)
    expect(previewCall).toBeGreaterThan(-1)
  })

  it('clears pending when staging fails (control: this branch is handled)', () => {
    const body = runStageAndPreviewBody()
    const failBranch = body.slice(
      body.indexOf("if (staged.status !== 'ok')"),
      body.indexOf('candidateId.value = staged.candidateId'),
    )
    expect(failBranch).toContain('clearPendingAdminCatalogImport()')
    expect(failBranch).toContain('pending.value = null')
  })

  it('clears pending when the preview succeeds (control)', () => {
    const body = runStageAndPreviewBody()
    const afterOk = body.slice(body.indexOf('serverPreview.value = preview.preview'))
    expect(afterOk).toContain('clearPendingAdminCatalogImport()')
  })

  it('locks the stage button, file input and paste box while a pending marker exists', () => {
    expect(SFC).toMatch(/data-testid="catalog-stage-preview"[\s\S]{0,120}Boolean\(pending\)/)
    expect(SFC).toMatch(/data-testid="catalog-import-file"[\s\S]{0,200}Boolean\(pending\)/)
    expect(SFC).toMatch(/data-testid="catalog-import-paste"[\s\S]{0,200}Boolean\(pending\)/)
  })
})

describe('CatalogImportSection.runStageAndPreview — preview failure recovery (DEFECT CAT/ADM)', () => {
  // The 'publish' pending marker is persisted before previewPublish. If previewPublish
  // fails (status !== 'ok'), the branch only sets feedback and returns — the marker stays
  // in localStorage (it survives refresh) and `pending` stays set, which disables the
  // file input, paste box and Stage button. The only escape is "Check status", which looks
  // up a publish ledger row that was never created. Admin is soft-locked from re-staging.
  // The correct behavior is to clear the pending marker (a read-only preview failure has no
  // unresolved server outcome to reconcile) or to offer an explicit discard path.

  function previewFailureBranch(): string {
    const body = runStageAndPreviewBody()
    const start = body.indexOf('await previewPublish(')
    const guard = body.indexOf("if (preview.status !== 'ok')", start)
    const end = body.indexOf('serverPreview.value = preview.preview', guard)
    expect(guard).toBeGreaterThan(start)
    expect(end).toBeGreaterThan(guard)
    return body.slice(guard, end)
  }

  it('DEFECT: preview-failure branch calls clearPendingAdminCatalogImport()', () => {
    expect(previewFailureBranch()).toContain('clearPendingAdminCatalogImport()')
  })

  it('DEFECT: preview-failure branch resets the in-memory pending ref (pending.value = null)', () => {
    expect(previewFailureBranch()).toContain('pending.value = null')
  })

  it('DEFECT: the section offers some way to discard a stuck pending marker', () => {
    // Acceptable fixes: clear on preview failure (above) OR an explicit discard handler that
    // clears the marker and is wired to a button. Today clearPending is only reachable after
    // an apply/reconcile outcome, never after a failed read-only preview.
    const clearCalls = SFC.match(/clearPendingAdminCatalogImport\(\)/g) ?? []
    const hasDiscardHandler = /function\s+(discard|dismiss|cancel)Pending\w*\(/i.test(SFC)
    expect(hasDiscardHandler || previewFailureBranch().includes('clearPendingAdminCatalogImport()')).toBe(true)
    // Sanity on the current shape so this test documents where clears happen today.
    expect(clearCalls.length).toBeGreaterThan(0)
  })
})
