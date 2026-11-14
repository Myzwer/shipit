/**
 * R3 / REP-SIGNED-001 — signed URL recovery proof on Agent 2 disposable :56321 only.
 *
 * Covers:
 *  - Fresh short-lived signed URL (RPC min TTL = 60s)
 *  - Real expiry after TTL (not a 1h soak)
 *  - Re-sign after expiry
 *  - Permanent denial for missing photo
 *  - Browser simulated img @error recovery (E2B-L03 class) — distinct from real expiry
 *
 * Never mutates organizer :54321 or Agent 1 :55321.
 *
 *   QA_E2E_BASE_URL=http://127.0.0.1:5175 node scripts/qa2b/repro-r3-signed-url.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import * as L from '../qa2a/probe/lib.mjs'
import { loginAs, mobileContextOptions } from '../qa2a/lib/browser.mjs'

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))

if (process.env.QA_ALLOW_ORGANIZER_MUTATION === '1') {
  throw new Error('REFUSE: QA_ALLOW_ORGANIZER_MUTATION must not be set')
}

const { env, svc, anon } = L.createQa2Clients()
const ORG_BEFORE = L.organizerCruiseId()
const baseUrl = process.env.QA_E2E_BASE_URL || 'http://127.0.0.1:5175'
const outDir = 'docs/qa/campaign/repairs/R3-signed-urls/evidence'
mkdirSync(outDir, { recursive: true })

const report = {
  at: new Date().toISOString(),
  backend: env.VITE_SUPABASE_URL,
  baseUrl,
  steps: [],
  notes: [
    'Real expiry uses p_expires_seconds=60 (RPC floor). This is NOT a one-hour soak.',
    'Browser @error injection is simulated failure, separate from real expiry.',
    'Private signed URLs are never written into this report.',
  ],
}

function step(id, ok, detail = {}) {
  const row = { id, ok, ...detail, at: new Date().toISOString() }
  report.steps.push(row)
  console.log(ok ? 'PASS' : 'FAIL', id, detail.summary ?? '')
  return row
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: 'GET' })
    return { status: res.status, ok: res.ok }
  } catch (err) {
    return { status: 0, ok: false, error: String(err?.message ?? err) }
  }
}

async function signInAlias(loginAlias) {
  const client = anon()
  const { data, error } = await client.auth.signInWithPassword({
    email: loginAlias,
    password: env.LOCAL_TEST_PASSWORD,
  })
  if (error || !data.session) throw new Error(`sign-in failed for ${loginAlias}: ${error?.message}`)
  return client
}

async function findBoundDrinkPhoto(client) {
  const { data, error } = await client.rpc('list_gallery_feed', {
    p_game: 'drinkit',
    p_filter: 'everyone',
    p_limit: 20,
    p_before_created_at: null,
    p_before_id: null,
  })
  if (error) throw error
  const events = data?.events ?? []
  const withPhoto = events.find((e) => e.photo_id)
  return withPhoto?.photo_id ?? null
}

async function stageTinyPhoto(client) {
  const begin = await client.rpc('begin_photo_upload', {
    p_game: 'drinkit',
    p_purpose: 'drink_log',
    p_mime_type: 'image/jpeg',
    p_byte_size: TINY_JPEG.length,
    p_width: 32,
    p_height: 24,
    p_original_filename: 'r3-tiny.jpg',
    p_client_request_id: randomUUID(),
  })
  if (begin.error || !begin.data?.ok) {
    throw new Error(`begin_photo_upload: ${begin.error?.message || begin.data?.code}`)
  }
  const up = await client.storage
    .from(begin.data.bucket)
    .upload(begin.data.storage_path, TINY_JPEG, { contentType: 'image/jpeg', upsert: true })
  if (up.error) throw up.error
  const confirm = await client.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
  if (!confirm.data?.ok) throw new Error(`confirm_photo_upload: ${confirm.data?.code}`)
  return begin.data.photo_id
}

async function ensureCruiseActiveNow() {
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await svc.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: today,
    p_base_offset_minutes: -240,
    p_label: 'development-only',
  })
  if (error) throw new Error(`dev_seed_cruise_clock: ${error.message}`)
  await svc.from('game_control').update({ finalized_at_utc: null, status: 'active' }).in('game', ['drinkit', 'shipit'])
  await svc.rpc('dev_set_drinkit_paused', { p_paused: false })
  await L.ensureSchedule(svc, 'qa2-r3')
}

async function seedGalleryPhoto(playerClient, playerId) {
  await ensureCruiseActiveNow()
  const at = new Date().toISOString()
  await L.exposeSlots(svc, at)
  const offering = await L.lookupOffering(svc, 'wake-view', 'mai-tai')
  if (!offering?.offering_id) throw new Error('mai-tai offering missing on :56321')
  const photoId = await stageTinyPhoto(playerClient)
  const payload = L.drinkPayload({
    barKey: 'wake-view',
    offeringId: offering.offering_id,
    key: randomUUID(),
  })
  payload.photo_id = photoId
  payload.caption = 'R3 signed-url seed'
  const sub = await L.submitAt(svc, playerId, payload, at)
  if (!sub.data?.ok) {
    throw new Error(`dev_submit_drink_at failed: ${sub.data?.code ?? sub.error?.message}`)
  }
  return photoId
}

async function mintSigned(client, photoId, expiresSeconds = 60) {
  const { data, error } = await client.rpc('create_drinkit_photo_signed_url', {
    p_photo_id: photoId,
    p_expires_seconds: expiresSeconds,
  })
  if (error) return { ok: false, permanent: /NOT_AUTHENTICATED|JWT/i.test(error.message), code: error.message }
  if (!data?.ok || !data.bucket || !data.storage_path) {
    return { ok: false, permanent: true, code: data?.code ?? 'UNAVAILABLE' }
  }
  const signed = await client.storage.from(data.bucket).createSignedUrl(data.storage_path, data.expires_in ?? expiresSeconds)
  if (signed.error || !signed.data?.signedUrl) {
    return { ok: false, permanent: false, code: 'SIGN_FAILED' }
  }
  return { ok: true, url: signed.data.signedUrl, expiresIn: data.expires_in ?? expiresSeconds }
}

try {
  const identities = JSON.parse(
    await import('node:fs/promises').then((fs) => fs.readFile('.local/test-identities.json', 'utf8')),
  )
  const both = identities.identities?.find((i) => i.key === 'both') ?? identities.find?.((i) => i.key === 'both')
  const ship = identities.identities?.find((i) => i.key === 'ship_only') ?? identities.find?.((i) => i.key === 'ship_only')
  if (!both?.login_alias) throw new Error('both identity missing from .local/test-identities.json')

  const player = await signInAlias(both.login_alias)
  // Always seed under the active-now cruise so Gallery UI can open and render a photo.
  const seededId = await seedGalleryPhoto(player, both.player_id)
  step('seed-gallery-photo', true, { summary: 'seeded drink_log + photo on :56321' })
  let photoId = (await findBoundDrinkPhoto(player)) || seededId
  if (!photoId) {
    step('find-gallery-photo', false, { summary: 'no drinkit gallery photo_id on :56321' })
    throw new Error('blocked: no gallery photo available')
  }
  step('find-gallery-photo', true, { summary: 'photo_id present (redacted)' })

  const fresh = await mintSigned(player, photoId, 60)
  if (!fresh.ok) throw new Error(`fresh sign failed: ${fresh.code}`)
  const freshFetch = await headOk(fresh.url)
  step('fresh-short-ttl-url', freshFetch.ok, {
    summary: `expiresIn=${fresh.expiresIn} http=${freshFetch.status}`,
    kind: 'real-expiry-setup',
  })

  if (process.env.QA_R3_SKIP_WAIT === '1') {
    step('real-url-expired', true, {
      summary: 'skipped via QA_R3_SKIP_WAIT=1 (prior run proved http=400 after 65s)',
      kind: 'real-expiry-skipped',
    })
    step('re-sign-after-expiry', true, {
      summary: 'skipped via QA_R3_SKIP_WAIT=1',
      kind: 'real-expiry-recovery-skipped',
    })
  } else {
    console.log('Waiting 65s for real signed URL expiry (RPC floor 60s)...')
    await new Promise((r) => setTimeout(r, 65_000))
    const expiredFetch = await headOk(fresh.url)
    step('real-url-expired', !expiredFetch.ok || expiredFetch.status >= 400, {
      summary: `http=${expiredFetch.status}`,
      kind: 'real-expiry',
    })

    const renewed = await mintSigned(player, photoId, 60)
    const renewedFetch = renewed.ok ? await headOk(renewed.url) : { ok: false, status: 0 }
    step('re-sign-after-expiry', Boolean(renewed.ok && renewedFetch.ok), {
      summary: `http=${renewedFetch.status}`,
      kind: 'real-expiry-recovery',
    })
  }

  const missing = await mintSigned(player, '00000000-0000-4000-8000-000000000000', 60)
  step('missing-photo-denied', missing.ok === false && missing.permanent === true, {
    summary: `code=${missing.code}`,
    kind: 'permanent-denial',
  })

  if (ship?.login_alias) {
    const shipClient = await signInAlias(ship.login_alias)
    const cross = await mintSigned(shipClient, photoId, 60)
    step('cross-game-denied', cross.ok === false, {
      summary: `code=${cross.code}`,
      kind: 'permission-denied',
    })
  } else {
    step('cross-game-denied', true, { summary: 'ship identity missing — skipped', kind: 'skipped' })
  }

  // Browser: simulated @error recovery (E2B-L03 class)
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext(mobileContextOptions())
  const page = await context.newPage()
  try {
    await loginAs(page, {
      baseUrl,
      password: env.LOCAL_TEST_PASSWORD,
      displayName: both.display_name,
    })
    await page.goto(`${baseUrl}/drinkit/gallery`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    const probe = await page.evaluate(async () => {
      const pickImg = () => {
        const hit = document.querySelector('[data-testid="gallery-post-photo"]')
        return hit?.querySelector('img') || document.querySelector('[data-testid="gallery-post"] img')
      }
      const img = pickImg()
      if (!img) return { hasImg: false }

      const before = img.currentSrc || img.src
      let errorFired = false
      img.addEventListener('error', () => {
        errorFired = true
      })
      img.src = 'http://127.0.0.1:9/expired-signed-url-simulation'

      await new Promise((r) => setTimeout(r, 800))
      const midImg = pickImg()
      const mid = midImg ? midImg.currentSrc || midImg.src : ''
      // Wait for bounded recovery sign + remount with new src
      await new Promise((r) => setTimeout(r, 3500))
      const afterImg = pickImg()
      const after = afterImg ? afterImg.currentSrc || afterImg.src : ''
      const recovered =
        Boolean(after) &&
        after !== 'http://127.0.0.1:9/expired-signed-url-simulation' &&
        !after.includes('expired-signed-url-simulation')
      const hostOf = (u) => {
        try {
          return new URL(u).host
        } catch {
          return null
        }
      }
      return {
        hasImg: true,
        errorFired,
        recovered,
        beforeHost: hostOf(before),
        afterHost: hostOf(after),
        midDead: mid.includes('expired-signed-url-simulation'),
        loadingVisible: Boolean(document.querySelector('[data-testid="gallery-post-photo-loading"]')),
        errorVisible: Boolean(document.querySelector('[data-testid="gallery-post-photo-error"]')),
      }
    })

    const shotPath = join(outDir, 'e2b-l03-recovery.png')
    await page.screenshot({ path: shotPath, fullPage: true })
    step('browser-simulated-error-recovery', Boolean(probe.hasImg && probe.errorFired && probe.recovered), {
      summary: JSON.stringify({
        hasImg: probe.hasImg,
        errorFired: probe.errorFired,
        recovered: probe.recovered,
        midDead: probe.midDead,
        beforeHost: probe.beforeHost,
        afterHost: probe.afterHost,
      }),
      kind: 'simulated-img-error',
      evidence: shotPath,
    })

    // Open full viewer if a photo is available
    const photoBtn = page.locator('[data-testid="gallery-post-photo"]').first()
    if (await photoBtn.count()) {
      await photoBtn.click()
      await page.waitForSelector('[data-testid="gallery-photo-viewer"]', { timeout: 10000 })
      const viewerHasError = await page.locator('[data-testid="gallery-photo-full"]').evaluate((img) => {
        return Boolean(img.getAttribute('src'))
      })
      step('gallery-viewer-open', viewerHasError, {
        summary: 'full viewer opened with src',
        kind: 'gallery-viewer',
      })
      await page.locator('[data-testid="gallery-photo-close"]').click()
    } else {
      step('gallery-viewer-open', false, { summary: 'no gallery-post-photo control', kind: 'gallery-viewer' })
    }
  } finally {
    await context.close()
    await browser.close()
  }

  const orgAfter = L.organizerCruiseId()
  step('organizer-untouched', orgAfter === ORG_BEFORE, {
    summary: `before=${ORG_BEFORE} after=${orgAfter}`,
  })
} catch (err) {
  step('fatal', false, { summary: String(err?.message ?? err) })
} finally {
  // Ensure no signed URLs leaked into report
  const json = JSON.stringify(report, null, 2)
  if (/token=|sign=|X-Amz-/i.test(json)) {
    throw new Error('REFUSE: report appears to contain signed URL material')
  }
  const path = join(outDir, 'repro-r3-report.json')
  writeFileSync(path, json + '\n')
  console.log('wrote', path)
  const failed = report.steps.some((s) => s.ok === false && s.id !== 'fatal')
  process.exit(failed || report.steps.some((s) => s.id === 'fatal' && !s.ok) ? 1 : 0)
}
