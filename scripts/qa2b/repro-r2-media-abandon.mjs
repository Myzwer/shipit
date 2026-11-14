/**
 * R2 / REP-MEDIA-001 — real Storage abandon proof on disposable :55321.
 * Stages a Ship It photo, discards via Exit, asserts ledger status=abandoned
 * and Storage object removed (or cleanup_pending). Never mutates :54321/:56321.
 */
import { join } from 'node:path'
import { chromium } from 'playwright'
import { loadQa2aEnv, identity, ROOT } from '../qa2a/lib/env.mjs'
import { acceptPhotoFraming, loginAs, mobileContextOptions } from '../qa2a/lib/browser.mjs'

if (process.env.QA_ALLOW_ORGANIZER_MUTATION === '1') {
  throw new Error('REFUSE: QA_ALLOW_ORGANIZER_MUTATION must not be set')
}

const env = await loadQa2aEnv()
const both = identity(env.summary, 'both')
const fixture = join(ROOT, 'tests/fixtures/tiny.jpg')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext(mobileContextOptions())
const page = await context.newPage()

const report = {
  at: new Date().toISOString(),
  url: env.url,
  cruise: env.cruise?.id,
  baseUrl: env.baseUrl,
  steps: [],
}

function step(name, ok, detail) {
  report.steps.push({ name, ok, detail })
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '')
}

try {
  await loginAs(page, {
    baseUrl: env.baseUrl,
    password: env.password,
    displayName: both.display_name,
  })

  await page.goto(`${env.baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
  const open = page.locator('[data-testid^="shipit-challenge-"][data-completed="false"]').first()
  if (!(await open.count())) {
    step('open-challenge', false, 'no incomplete challenge available')
    throw new Error('blocked: challenge exhaustion')
  }
  await open.click()
  await page.waitForSelector('[data-testid="scavenger-submit-page"]')

  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixture)
  await acceptPhotoFraming(page)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 45000 })
  step('stage-photo', true, 'photo-staged-ready visible')

  const stagedId = await page.evaluate(async () => {
    // Read from Vue if exposed; else probe via last staged preview path is unavailable —
    // fall through to service-side newest staged row for this player after discard.
    return null
  })
  void stagedId

  const { data: beforeRows, error: beforeErr } = await env.service
    .from('photos')
    .select('id, status, storage_path, owner_player_id, bucket_id, created_at')
    .eq('status', 'staged')
    .order('created_at', { ascending: false })
    .limit(5)
  if (beforeErr) throw new Error(`photos query: ${JSON.stringify(beforeErr)}`)
  const stagedBefore = beforeRows?.length ?? 0
  step('staged-rows-before-discard', stagedBefore > 0, `stagedCount=${stagedBefore}`)

  const newestStaged = beforeRows?.[0]
  if (!newestStaged?.id) throw new Error('no staged photo row found after UI ready')

  await page.locator('[data-testid="wizard-exit"]').click()
  await page.waitForSelector('[data-testid="modal-exit"]', { timeout: 10000 })
  await page.locator('[data-testid="modal-exit"] [data-testid="modal-primary"]').click()
  // Allow abandon RPC + Storage remove to settle
  await page.waitForTimeout(2500)

  const { data: afterRow, error: afterErr } = await env.service
    .from('photos')
    .select('id, status, storage_path, bucket_id, abandoned_at_utc')
    .eq('id', newestStaged.id)
    .maybeSingle()
  if (afterErr) throw new Error(`photos after: ${JSON.stringify(afterErr)}`)

  const abandoned = afterRow?.status === 'abandoned'
  step(
    'ledger-abandoned',
    abandoned,
    `status=${afterRow?.status} abandoned_at=${afterRow?.abandoned_at_utc}`,
  )

  let storageGone = false
  const bucket = afterRow?.bucket_id
  if (bucket && afterRow?.storage_path) {
    const folder = afterRow.storage_path.split('/').slice(0, -1).join('/')
    const name = afterRow.storage_path.split('/').pop()
    const { data: listed } = await env.service.storage.from(bucket).list(folder, { search: name })
    storageGone = !listed?.some((o) => o.name === name)
  }
  step(
    'storage-cleanup',
    abandoned && storageGone,
    `storageGone=${storageGone} path=${afterRow?.storage_path}`,
  )

  const { count: stillStaged } = await env.service
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('id', newestStaged.id)
    .eq('status', 'staged')
  step('not-still-staged', (stillStaged ?? 0) === 0, `stillStaged=${stillStaged}`)
} catch (e) {
  const detail = e instanceof Error ? e.stack || e.message : JSON.stringify(e)
  step('fatal', false, detail)
  report.error = detail
} finally {
  await browser.close()
}

const failed = report.steps.some((s) => !s.ok)
console.log(JSON.stringify(report, null, 2))
process.exit(failed ? 1 : 0)
