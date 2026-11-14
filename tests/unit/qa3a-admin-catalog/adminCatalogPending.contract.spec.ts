/**
 * QA3A — CatalogImportSection pending-state contract (source text).
 * No component mount, no backend.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

describe('CatalogImportSection pending contract (source)', () => {
  const vue = read('src/features/admin/CatalogImportSection.vue')

  function section(startMarker: string, endMarker: string): string {
    const start = vue.indexOf(startMarker)
    const end = vue.indexOf(endMarker, start + startMarker.length)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    return vue.slice(start, end)
  }

  // ADM-008 (intentional defect probe)
  it('A) previewPublish failure branch (after stage success) clears pending or offers Discard', () => {
    const afterPreviewCall = section(
      'await previewPublish(staged.candidateId)',
      'serverPreview.value = preview.preview',
    )
    expect(afterPreviewCall).toContain('if (preview.status')
    // Current code: sets feedback and returns, leaving the 'publish' pending locked. Defect.
    expect(afterPreviewCall).toContain('clearPendingAdminCatalogImport')
  })

  // ADM-009 (intentional defect probe)
  it('B) runPublish refuses to start when a pending write already exists', () => {
    const body = section('async function runPublish()', 'async function checkPendingStatus()')
    const firstLines = body.split('\n').slice(0, 4).join('\n')
    // Current guard: !candidateId || !payloadHash || busy only; no pending.value check. Defect.
    expect(firstLines).toMatch(/pending\.value/)
  })

  it('C) all catalog RPC names are present across src/lib/adminCatalogImport.ts', () => {
    const lib = read('src/lib/adminCatalogImport.ts')
    for (const name of [
      'admin_stage_catalog_import',
      'admin_publish_catalog_import',
      'admin_rollback_catalog',
      'admin_preview_catalog_publish',
      'admin_find_catalog_publish_request_by_id',
      'admin_list_catalog_versions',
    ]) {
      expect(lib).toContain(`'${name}'`)
    }
  })
})
