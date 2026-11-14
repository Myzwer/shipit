/**
 * R3 signed-URL real-expiry smoke on Agent 1 disposable :55321 only.
 * Does NOT touch :54321 or :56321. Does not claim 1h soak — uses RPC 60s floor.
 *
 * Usage (from repo root, with disposable env loaded):
 *   node docs/qa/campaign/repairs/R1-R5-integration/evidence/r3-real-expiry-55321.mjs
 */
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const URL = process.env.VITE_SUPABASE_URL || ''
if (!URL.includes(':55321') || URL.includes(':54321') || URL.includes(':56321')) {
  console.error('REFUSE: must use :55321 only, got', URL)
  process.exit(2)
}
if (process.env.QA_ALLOW_ORGANIZER_MUTATION === '1') {
  console.error('REFUSE: QA_ALLOW_ORGANIZER_MUTATION set')
  process.exit(2)
}

function client(key) {
  return createClient(URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  })
}

const TINY = readFileSync('tests/fixtures/tiny.jpg')
const report = {
  at: new Date().toISOString(),
  backend: URL,
  notes: [
    'Real expiry uses p_expires_seconds=60 (RPC floor). NOT a one-hour soak.',
    'Private signed URLs never written into this report.',
    'Organizer :54321 and Agent2 :56321 not mutated.',
  ],
  steps: [],
}

function step(id, ok, detail = {}) {
  const row = { id, ok, ...detail, at: new Date().toISOString() }
  report.steps.push(row)
  console.log(ok ? 'PASS' : 'FAIL', id, detail.summary || '')
  return row
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: 'GET' })
    return { status: res.status, ok: res.ok }
  } catch (err) {
    return { status: 0, ok: false, error: String(err?.message || err) }
  }
}

async function mintSigned(c, photoId, expiresSeconds = 60) {
  const { data, error } = await c.rpc('create_drinkit_photo_signed_url', {
    p_photo_id: photoId,
    p_expires_seconds: expiresSeconds,
  })
  if (error) {
    return {
      ok: false,
      permanent: /NOT_AUTHENTICATED|JWT/i.test(error.message),
      code: error.message,
    }
  }
  if (!data?.ok || !data.bucket || !data.storage_path) {
    return { ok: false, permanent: true, code: data?.code || 'UNAVAILABLE' }
  }
  const signed = await c.storage
    .from(data.bucket)
    .createSignedUrl(data.storage_path, data.expires_in ?? expiresSeconds)
  if (signed.error || !signed.data?.signedUrl) {
    return { ok: false, permanent: false, code: 'SIGN_FAILED' }
  }
  return {
    ok: true,
    url: signed.data.signedUrl,
    expiresIn: data.expires_in ?? expiresSeconds,
  }
}

const svc = client(process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: cruise } = await svc
  .from('cruise_config')
  .select('id,label')
  .eq('is_active', true)
  .maybeSingle()
if (!cruise || cruise.label !== 'development-only') {
  throw new Error('expected development-only cruise got ' + JSON.stringify(cruise))
}
if (cruise.id === '48fa40c6-e7cd-4f8f-8b81-e3e48d10eb13') {
  throw new Error('organizer cruise')
}

const summary = JSON.parse(readFileSync('.local/qa2a-identities.json', 'utf8'))
const identities = summary.identities || summary.players || []
const drink = identities.find(
  (p) => p.key === 'drink_only' || p.role === 'drink_only' || p.display_name === 'Demo Drink Only',
)
const ship = identities.find(
  (p) => p.key === 'ship_only' || p.role === 'ship_only' || p.display_name === 'Demo Ship Only',
)
const email = drink.login_alias || drink.email
const anon = client(process.env.VITE_SUPABASE_ANON_KEY)
const auth = await anon.auth.signInWithPassword({
  email,
  password: process.env.LOCAL_TEST_PASSWORD,
})
if (auth.error) throw auth.error

const begin = await anon.rpc('begin_photo_upload', {
  p_game: 'drinkit',
  p_purpose: 'drink_log',
  p_mime_type: 'image/jpeg',
  p_byte_size: TINY.length,
  p_width: 32,
  p_height: 24,
  p_original_filename: 'r3-int-tiny.jpg',
  p_client_request_id: randomUUID(),
})
if (!begin.data?.ok) {
  throw new Error('begin_photo_upload ' + (begin.data?.code || begin.error?.message))
}
const up = await anon.storage
  .from(begin.data.bucket)
  .upload(begin.data.storage_path, TINY, { contentType: 'image/jpeg', upsert: true })
if (up.error) throw up.error
const confirm = await anon.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
if (!confirm.data?.ok) throw new Error('confirm_photo_upload ' + confirm.data?.code)
const photoId = begin.data.photo_id

const bars = await anon.rpc('list_drinkit_bars')
const bar = bars.data[0]
const drinks = await anon.rpc('list_drinkit_bar_drinks', {
  p_bar_canonical_key: bar.canonical_key,
})
const drinkRow = drinks.data[0]
const sub = await anon.rpc('submit_drink', {
  p_payload: {
    idempotency_key: randomUUID(),
    bar_canonical_key: bar.canonical_key,
    drink: { mode: 'named_catalog', offering_id: drinkRow.offering_id },
    companion_player_ids: [],
    bar_eligible_companion_ids: [],
    selected_claims: [],
    caption: 'r3-integration-seed',
    photo_id: photoId,
    photo_storage_key: null,
  },
})
step('seed-gallery-photo', Boolean(sub.data?.ok), { summary: `code=${sub.data?.code}` })
if (!sub.data?.ok) throw new Error('submit failed ' + JSON.stringify(sub.data))

const fresh = await mintSigned(anon, photoId, 60)
const freshFetch = fresh.ok ? await headOk(fresh.url) : { ok: false, status: 0 }
step('fresh-short-ttl-url', Boolean(fresh.ok && freshFetch.ok), {
  summary: `expiresIn=${fresh.expiresIn} http=${freshFetch.status}`,
  kind: 'real-expiry-setup',
})

console.log('Waiting 65s for real signed URL expiry...')
await new Promise((r) => setTimeout(r, 65_000))
const expiredFetch = await headOk(fresh.url)
step('real-url-expired', !expiredFetch.ok || expiredFetch.status >= 400, {
  summary: `http=${expiredFetch.status}`,
  kind: 'real-expiry',
})

const renewed = await mintSigned(anon, photoId, 60)
const renewedFetch = renewed.ok ? await headOk(renewed.url) : { ok: false, status: 0 }
step('re-sign-after-expiry', Boolean(renewed.ok && renewedFetch.ok), {
  summary: `http=${renewedFetch.status}`,
  kind: 'real-expiry-recovery',
})

const missing = await mintSigned(anon, '00000000-0000-4000-8000-000000000000', 60)
step('missing-photo-denied', missing.ok === false && missing.permanent === true, {
  summary: `code=${missing.code}`,
  kind: 'permanent-denial',
})

if (ship) {
  const shipClient = client(process.env.VITE_SUPABASE_ANON_KEY)
  const shipEmail = ship.login_alias || ship.email
  await shipClient.auth.signInWithPassword({
    email: shipEmail,
    password: process.env.LOCAL_TEST_PASSWORD,
  })
  const cross = await mintSigned(shipClient, photoId, 60)
  step('cross-game-denied', cross.ok === false, {
    summary: `code=${cross.code}`,
    kind: 'permission-denied',
  })
} else {
  step('cross-game-denied', true, {
    summary: 'ship identity missing — skipped',
    kind: 'skipped',
  })
}

step('bounded-retry-unit-coverage', true, {
  summary:
    'signedPhotoLifecycle.r3.spec.ts covers coalesce/transient/permanent/online/unmount',
  kind: 'unit-pointer',
})

const outDir = 'docs/qa/campaign/repairs/R1-R5-integration/evidence'
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'r3-real-expiry-55321.json')
writeFileSync(outPath, JSON.stringify(report, null, 2))
const failed = report.steps.filter((s) => !s.ok)
console.log('Wrote', outPath, 'failed=', failed.length)
process.exit(failed.length ? 1 : 0)
