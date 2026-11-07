/**
 * Phase 10B — deterministic demo scenarios using the launch-candidate catalog.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario embarkation
 *   LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario tuesday
 *   LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario wrapped
 *
 * Local Supabase + development-only cruise only. No production bypass.
 *
 * Catalog: content/catalogs/launch-candidate-v1.json (identical twin:
 * development-preview-v1.json). Category B filtered-source eligibility.
 * Uses private/roster/roster.local.json when present (local preview guests).
 * Falls back to synthetic Demo/Gate fixtures only when that file is absent.
 * Private Gallery photos: private/photos/ when present (Phase 10F); else tiny fixture JPEG.
 * Never production Auth/media. Set FORCE_SYNTHETIC_ROSTER=1 to force fixtures.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ws from 'ws'
import {
  assertDevelopmentOnlyCruise,
  assertLocalSupabaseUrl,
  printResetImpact,
  readSupabaseEnv,
} from './lib/demoLocalSafety.mjs'
import { createPhotoPicker, loadPrivateDemoPhotos } from './lib/demoPrivatePhotos.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

const SCENARIOS = {
  embarkation: { cruiseDay: 1, hour: 12, minute: 30, label: 'Embarkation — Saturday Day 1' },
  tuesday: { cruiseDay: 4, hour: 14, minute: 0, label: 'Mid-cruise — Tuesday Day 4' },
  wrapped: { cruiseDay: 7, hour: 19, minute: 0, label: 'Wrapped — Friday Day 7 after 6 PM' },
}

const scenarioArg = process.argv.find((a) => a.startsWith('--scenario='))?.split('=')[1]
const scenarioKey = scenarioArg || process.argv[process.argv.indexOf('--scenario') + 1]
if (!scenarioKey || !SCENARIOS[scenarioKey]) {
  console.error('Usage: npm run demo:seed -- --scenario embarkation|tuesday|wrapped')
  process.exit(1)
}
const scenario = SCENARIOS[scenarioKey]

const password = process.env.LOCAL_TEST_PASSWORD || process.env.PRIVATE_ROSTER_PASSWORD
if (!password || password.length < 12) {
  console.error('Set LOCAL_TEST_PASSWORD (≥12 chars). Passwords are never read from roster files.')
  process.exit(1)
}

printResetImpact(scenarioKey)

const sbEnv = readSupabaseEnv()
const url = sbEnv.API_URL || sbEnv.SUPABASE_URL
const serviceRole = sbEnv.SERVICE_ROLE_KEY || sbEnv.SUPABASE_SERVICE_ROLE_KEY
const anonKey = sbEnv.ANON_KEY || sbEnv.SUPABASE_ANON_KEY
assertLocalSupabaseUrl(url)
if (!serviceRole || !anonKey) {
  console.error('Could not read local service/anon keys from supabase status.')
  process.exit(1)
}

const service = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

const TINY_JPEG = readFileSync(join(root, 'tests/fixtures/tiny.jpg'))
const CATALOG = JSON.parse(
  readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8'),
)

const privatePhotoLoad = loadPrivateDemoPhotos(root)
const photoPicker = createPhotoPicker(privatePhotoLoad.photos, `phase10f-${scenarioKey}`)
if (privatePhotoLoad.errors.length) {
  for (const err of privatePhotoLoad.errors) console.warn(`  photo: ${err}`)
}
if (photoPicker.available) {
  console.log(
    `Private demo photos: ${photoPicker.count} usable (${privatePhotoLoad.source}) under private/photos/`,
  )
} else {
  console.log('No usable private/photos — Gallery media falls back to development placeholder JPEG.')
}

const clientCache = new Map()
const photoStats = { drink_with_photo: 0, scavenger_with_photo: 0, placeholder_used: 0, private_used: 0 }

function dayDate(day1, dayNumber) {
  const d = new Date(`${day1}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (dayNumber - 1))
  return d.toISOString().slice(0, 10)
}

function shipLocalToUtcIso(shipDate, time, offsetMinutes) {
  const ship = new Date(`${shipDate}T${time}Z`)
  return new Date(ship.getTime() - offsetMinutes * 60_000).toISOString()
}

function computeNowAligned({ cruiseDay, hour, minute }) {
  const now = Date.now()
  const provisional = new Date(now)
  const y = provisional.getUTCFullYear()
  const mo = String(provisional.getUTCMonth() + 1).padStart(2, '0')
  const da = String(provisional.getUTCDate()).padStart(2, '0')
  const shipDateOnDay = `${y}-${mo}-${da}`
  const day1Date = new Date(`${shipDateOnDay}T12:00:00Z`)
  day1Date.setUTCDate(day1Date.getUTCDate() - (cruiseDay - 1))
  const day1 = day1Date.toISOString().slice(0, 10)
  const targetShipWall = Date.parse(
    `${shipDateOnDay}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  )
  const offsetMinutes = Math.round((targetShipWall - now) / 60_000)
  return { day1, offsetMinutes, shipDateOnDay }
}

function detUuid(seed) {
  const h = createHash('sha256').update(seed).digest()
  const bytes = Buffer.from(h.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function provisionRoster() {
  const rosterPath = join(root, 'private/roster/roster.local.json')
  if (existsSync(rosterPath) && process.env.FORCE_SYNTHETIC_ROSTER !== '1') {
    console.log('Private roster present — demo scenarios will use real local preview identities.')
  } else if (!existsSync(rosterPath)) {
    console.log('No private roster — falling back to synthetic demo identities.')
  }
  console.log('Provisioning identities (db:provision)…')
  execSync('node scripts/provision-local-identities.mjs', {
    cwd: root,
    env: { ...process.env, LOCAL_TEST_PASSWORD: password },
    stdio: 'inherit',
  })
  return JSON.parse(readFileSync(join(root, '.local/test-identities.json'), 'utf8'))
}

/**
 * Resolve actors for simulated scenario activity.
 * Synthetic keys (drink_only/both/admin/ship_only) when fixtures are used;
 * otherwise pick from the private roster by membership role.
 */
function resolveDemoCast(identitySummary) {
  const ids = identitySummary.identities || []
  const byKey = Object.fromEntries(ids.map((i) => [i.key, i]))
  if (byKey.drink_only && byKey.both && byKey.admin && byKey.ship_only) {
    return {
      mode: 'synthetic',
      drinkOnly: byKey.drink_only,
      both: byKey.both,
      admin: byKey.admin,
      shipOnly: byKey.ship_only,
    }
  }

  const admin = ids.find((i) => i.is_admin)
  const drinkit = ids.filter((i) => (i.games || []).includes('drinkit'))
  const shipOnly =
    byKey.debbie_forrester ||
    ids.find((i) => (i.games || []).includes('shipit') && !(i.games || []).includes('drinkit'))
  const both =
    drinkit.find((i) => (i.games || []).includes('shipit') && !i.is_admin) ||
    drinkit.find((i) => !i.is_admin) ||
    drinkit[0]
  const drinkOnly =
    drinkit.find((i) => i !== both && i !== admin) ||
    drinkit.find((i) => i !== both) ||
    both

  if (!admin || !both || !shipOnly || !drinkOnly) {
    throw new Error(
      'Private roster is missing required demo cast roles (admin, Drink It! players, Ship It!-only).',
    )
  }
  if (!(drinkOnly.games || []).includes('drinkit') || !(both.games || []).includes('drinkit')) {
    throw new Error('Demo drink activity cast must be Drink It! enrolled.')
  }

  console.log(
    `Demo cast (private): drink=${drinkOnly.display_name}, both=${both.display_name}, admin=${admin.display_name}, ship_only=${shipOnly.display_name}`,
  )
  return { mode: 'private', drinkOnly, both, admin, shipOnly }
}

async function loadWorkingAchievements() {
  console.log('Loading working achievements…')
  execSync('node scripts/load-working-achievements.mjs', {
    cwd: root,
    env: { ...process.env },
    stdio: 'inherit',
  })
}

async function signIn(loginAlias) {
  if (clientCache.has(loginAlias)) return clientCache.get(loginAlias)
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  })
  const { error } = await client.auth.signInWithPassword({ email: loginAlias, password })
  if (error) throw error
  clientCache.set(loginAlias, client)
  return client
}

function pickPhotoAsset(seedKey, { preferPrivate = true } = {}) {
  if (preferPrivate && photoPicker.available) {
    const asset = photoPicker.next(seedKey)
    if (asset) return { ...asset, source: 'private' }
  }
  return {
    key: 'fixture:tiny.jpg',
    bytes: TINY_JPEG,
    mime: 'image/jpeg',
    width: 32,
    height: 24,
    filename: 'demo-dev.jpg',
    source: 'placeholder',
  }
}

function notePhotoSource(asset) {
  if (asset.source === 'private') photoStats.private_used += 1
  else photoStats.placeholder_used += 1
}

/**
 * Stage via begin → Storage upload → confirm. On deterministic reseed,
 * begin may idempotently replay a staged/bound photo — never re-upload in
 * those cases (Storage RLS only allows insert while status is pending_upload).
 */
async function stagePhoto(client, game, purpose, seedKey, { preferPrivate = true } = {}) {
  const asset = pickPhotoAsset(seedKey, { preferPrivate })
  const begin = await client.rpc('begin_photo_upload', {
    p_game: game,
    p_purpose: purpose,
    p_mime_type: asset.mime,
    p_byte_size: asset.bytes.length,
    p_width: asset.width,
    p_height: asset.height,
    p_original_filename: asset.filename,
    p_client_request_id: detUuid(`photo-begin:${scenarioKey}:${seedKey}`),
  })

  // Prior successful bind for this deterministic request id.
  if (!begin.data?.ok && begin.data?.code === 'BEGIN_REQUEST_CONSUMED' && begin.data.photo_id) {
    notePhotoSource(asset)
    return { photoId: begin.data.photo_id, assetKey: asset.key }
  }

  if (begin.error || !begin.data?.ok) {
    throw new Error(
      `begin_photo_upload failed: ${begin.error?.message || begin.data?.code || JSON.stringify(begin.data)}`,
    )
  }

  const photoId = begin.data.photo_id
  const status = begin.data.status

  // Already uploaded+confirmed (idempotent replay) — ready to bind.
  if (status === 'staged' || status === 'bound') {
    notePhotoSource(asset)
    return { photoId, assetKey: asset.key }
  }

  if (status !== 'pending_upload') {
    throw new Error(`begin_photo_upload unexpected status: ${status}`)
  }

  const up = await client.storage
    .from(begin.data.bucket)
    .upload(begin.data.storage_path, asset.bytes, { contentType: asset.mime, upsert: true })
  if (up.error) throw up.error
  const confirm = await client.rpc('confirm_photo_upload', { p_photo_id: photoId })
  if (!confirm.data?.ok) throw new Error(`confirm_photo_upload failed: ${confirm.data?.code}`)
  notePhotoSource(asset)
  return { photoId, assetKey: asset.key }
}

async function lookupOffering(barKey, drinkKey) {
  const { data: bar } = await service.from('bars').select('id').eq('canonical_key', barKey).single()
  const { data: concept } = await service
    .from('drink_concepts')
    .select('id')
    .eq('canonical_key', drinkKey)
    .single()
  const { data: offering } = await service
    .from('bar_offerings')
    .select('id')
    .eq('bar_id', bar.id)
    .eq('drink_concept_id', concept.id)
    .single()
  return offering.id
}

async function claimAt(
  player,
  barKey,
  offeringId,
  atUtc,
  seed,
  companions = [],
  selectBounties = true,
  { withPhoto = false } = {},
) {
  const playerId = player.player_id
  await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: atUtc })
  await service.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: atUtc })
  const preview = await service.rpc('dev_preview_drink_claims_at', {
    p_player_id: playerId,
    p_at_utc: atUtc,
    p_payload: {
      idempotency_key: detUuid(`prev:${seed}`),
      bar_canonical_key: barKey,
      drink: { mode: 'named_catalog', offering_id: offeringId },
      companion_player_ids: companions,
      bar_eligible_companion_ids: companions,
      selected_claims: [],
      caption: null,
      photo_storage_key: null,
    },
  })
  const selected = []
  if (selectBounties && preview.data?.preview?.categories) {
    const cats = preview.data.preview.categories
    if (cats.cocktail?.status === 'eligible' && cats.cocktail.options?.[0]) {
      selected.push({ category: 'cocktail', offer_id: cats.cocktail.options[0].offer_id })
    }
    if (cats.ingredient?.status === 'eligible' && cats.ingredient.options?.[0]) {
      selected.push({ category: 'ingredient', offer_id: cats.ingredient.options[0].offer_id })
    }
    if (cats.bar?.status === 'eligible' && cats.bar.options?.[0]) {
      selected.push({ category: 'bar', assignment_id: cats.bar.options[0].assignment_id })
    }
  }

  let photoId = null
  if (withPhoto) {
    const client = await signIn(player.login_alias)
    const staged = await stagePhoto(client, 'drinkit', 'drink_log', `drink-${seed}`, {
      preferPrivate: scenarioKey !== 'embarkation',
    })
    photoId = staged.photoId
    photoStats.drink_with_photo += 1
  }

  const payload = {
    idempotency_key: detUuid(`drink:${seed}`),
    bar_canonical_key: barKey,
    drink: { mode: 'named_catalog', offering_id: offeringId },
    companion_player_ids: companions,
    bar_eligible_companion_ids: companions,
    selected_claims: selected,
    caption: selectBounties ? `Demo ${seed}` : `Ordinary log ${seed}`,
    photo_storage_key: null,
  }
  if (photoId) payload.photo_id = photoId

  const res = await service.rpc('dev_submit_drink_at', {
    p_player_id: playerId,
    p_at_utc: atUtc,
    p_payload: payload,
  })
  if (res.error) throw res.error
  if (!res.data?.ok) {
    console.warn(`  drink submit ${seed}: ${res.data?.code || 'failed'}`)
  }
  return res.data
}

async function ordinaryBeer(player, barKey, atUtc, seed, { withPhoto = false } = {}) {
  let photoId = null
  if (withPhoto) {
    const client = await signIn(player.login_alias)
    const staged = await stagePhoto(client, 'drinkit', 'drink_log', `beer-${seed}`, {
      preferPrivate: scenarioKey !== 'embarkation',
    })
    photoId = staged.photoId
    photoStats.drink_with_photo += 1
  }
  const payload = {
    idempotency_key: detUuid(`beer:${seed}`),
    bar_canonical_key: barKey,
    drink: { mode: 'generic_beer' },
    companion_player_ids: [],
    bar_eligible_companion_ids: [],
    selected_claims: [],
    caption: `Ordinary beer ${seed}`,
    photo_storage_key: null,
  }
  if (photoId) payload.photo_id = photoId
  const res = await service.rpc('dev_submit_drink_at', {
    p_player_id: player.player_id,
    p_at_utc: atUtc,
    p_payload: payload,
  })
  if (!res.data?.ok) console.warn(`  beer ${seed}: ${res.data?.code}`)
  return res.data
}

async function scavengerComplete(client, playerId, challengeKey, atUtc, seed) {
  const { data: ch } = await service
    .from('scavenger_challenges')
    .select('id, title, points')
    .eq('canonical_key', challengeKey)
    .single()
  const staged = await stagePhoto(client, 'shipit', 'scavenger', seed, {
    preferPrivate: scenarioKey !== 'embarkation',
  })
  photoStats.scavenger_with_photo += 1
  const res = await service.rpc('dev_submit_scavenger_at', {
    p_player_id: playerId,
    p_at_utc: atUtc,
    p_payload: {
      idempotency_key: detUuid(`scav:${seed}`),
      challenge_id: ch.id,
      photo_id: staged.photoId,
      caption: `Demo ${ch.title}`,
    },
  })
  if (!res.data?.ok) console.warn(`  scavenger ${challengeKey}: ${res.data?.code}`)
  return res.data
}

/**
 * Wrapped aligns wall-clock to Day 7 ~7 PM. Any clock read at now() (including a
 * running Vite preview) latches finale; after that, historical timed submits all
 * return GAME_ENDED because finalized_at_utc is sticky. Clear before seeding
 * past-day activity; latchFinale() re-applies at the end of Wrapped only.
 */
async function clearFinaleLatchForHistoricalSeed() {
  const { error } = await service
    .from('game_control')
    .update({
      status: 'active',
      finalized_at_utc: null,
      paused_at_utc: null,
      paused_by: null,
      updated_at: new Date().toISOString(),
    })
    .in('game', ['drinkit', 'shipit'])
  if (error) throw error
}

async function seedBase(aligned) {
  // Clear bound scavenger state that blocks reseed.
  await service.rpc('dev_reset_scavenger_test_data')

  const { error: clockErr } = await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: aligned.day1,
    p_base_offset_minutes: aligned.offsetMinutes,
    p_label: 'development-only',
  })
  if (clockErr) throw clockErr

  const cruise = await assertDevelopmentOnlyCruise(service)
  if (!cruise) throw new Error('No active development-only cruise after seed')

  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  if (scenarioKey === 'tuesday' || scenarioKey === 'wrapped') {
    await clearFinaleLatchForHistoricalSeed()
  }

  const { data: activated, error: actErr } = await service.rpc('dev_activate_catalog_fixture', {
    p_payload: CATALOG,
  })
  if (actErr) throw actErr
  console.log('Catalog activated:', activated?.catalog_id || CATALOG.catalog_id)

  const { error: schedErr } = await service.rpc('dev_generate_bounty_schedule', {
    p_seed: `phase10a-${scenarioKey}`,
  })
  if (schedErr) throw schedErr

  const { error: dailyErr } = await service.rpc('dev_seed_daily_assignments')
  if (dailyErr) throw dailyErr

  await loadWorkingAchievements()
  return cruise
}

async function seedTuesdayActivity(identities, aligned) {
  const { drinkOnly, both, admin, shipOnly } = resolveDemoCast(identities)

  const bothClient = await signIn(both.login_alias)
  const adminClient = await signIn(admin.login_alias)
  const shipClient = await signIn(shipOnly.login_alias)

  // Resolve a few authentic offerings
  const pairs = [
    ['omalleys-irish-pub', 'passion-of-the-irish'],
    ['princess-live', 'cosmopolitan'],
    ['wake-view-bar', 'sand-meets-the-sea'],
    ['cascade-bar', 'amazonia'],
    ['crooners', 'figs-and-honey'],
    ['bellinis-cocktail-bar', 'almond-italia'],
    ['sea-view-bar', 'the-original-carajillo'],
    ['promenade-bars', 'jungle-bird'],
  ]
  const offerings = []
  for (const [bar, drink] of pairs) {
    try {
      offerings.push({ bar, drink, id: await lookupOffering(bar, drink) })
    } catch {
      console.warn(`  skip missing offering ${drink}@${bar}`)
    }
  }
  if (offerings.length < 4) throw new Error('Not enough authentic offerings for tuesday seed')

  const activity = []
  // Day 1–4 plausible sparse activity. Photos attach arbitrarily for visual demo density.
  const attachPhotos = scenarioKey === 'tuesday' || scenarioKey === 'wrapped'
  const plan = [
    { day: 1, hour: '13:00:00', player: drinkOnly, offer: offerings[0], companions: [both.player_id], claim: true, photo: true },
    { day: 1, hour: '15:00:00', player: both, offer: offerings[1], companions: [drinkOnly.player_id], claim: true, photo: true },
    { day: 1, hour: '17:00:00', player: admin, offer: offerings[2], companions: [], claim: false, photo: false },
    { day: 2, hour: '12:00:00', player: drinkOnly, offer: offerings[3], companions: [admin.player_id], claim: true, photo: true },
    { day: 2, hour: '14:00:00', player: both, offer: offerings[4], companions: [], claim: true, photo: true },
    { day: 2, hour: '16:00:00', player: admin, offer: offerings[5], companions: [both.player_id], claim: true, photo: true },
    { day: 3, hour: '13:00:00', player: drinkOnly, offer: offerings[6] || offerings[0], companions: [], claim: true, photo: true },
    { day: 3, hour: '15:00:00', player: both, offer: offerings[1], companions: [drinkOnly.player_id], claim: false, photo: false },
    { day: 3, hour: '18:00:00', player: admin, offer: offerings[2], companions: [], claim: true, photo: true },
    { day: 4, hour: '12:00:00', player: drinkOnly, offer: offerings[3], companions: [both.player_id], claim: true, photo: true },
    { day: 4, hour: '13:00:00', player: both, offer: offerings[4], companions: [], claim: true, photo: true },
  ]

  for (const [i, step] of plan.entries()) {
    if (scenarioKey === 'wrapped') await clearFinaleLatchForHistoricalSeed()
    const at = shipLocalToUtcIso(dayDate(aligned.day1, step.day), step.hour, aligned.offsetMinutes)
    const data = await claimAt(
      step.player,
      step.offer.bar,
      step.offer.id,
      at,
      `d${step.day}-${i}`,
      step.companions,
      step.claim,
      { withPhoto: attachPhotos && step.photo },
    )
    activity.push({
      type: 'drink',
      day: step.day,
      player: step.player.key,
      ok: data?.ok,
      points: data?.awarded_points,
      photo: Boolean(attachPhotos && step.photo),
    })
  }

  // Non-scoring ordinary beers (one with photo for Gallery variety)
  for (const [i, p] of [drinkOnly, both].entries()) {
    if (scenarioKey === 'wrapped') await clearFinaleLatchForHistoricalSeed()
    const at = shipLocalToUtcIso(dayDate(aligned.day1, 2 + i), '19:00:00', aligned.offsetMinutes)
    await ordinaryBeer(p, 'promenade-bars', at, `beer-${i}`, {
      withPhoto: attachPhotos && i === 0,
    })
  }

  // Ship It! completions — Alpha (both+ship) and Bravo (admin) intentionally tied at 400:
  // Alpha: 100+100+200; Bravo: 200+200. Drink It! scores stay unequal for a clear individual winner.
  const scavPlan = [
    { key: 'the-piazza-grandeur', player: both, client: bothClient, day: 1, hour: '11:00:00' },
    { key: 'movies-under-the-stars', player: both, client: bothClient, day: 1, hour: '16:00:00' },
    { key: 'soft-serve-swirl', player: shipOnly, client: shipClient, day: 3, hour: '12:00:00' },
    { key: 'international-cafe', player: admin, client: adminClient, day: 2, hour: '11:30:00' },
    { key: 'omalleys-irish-pub', player: admin, client: adminClient, day: 2, hour: '14:00:00' },
    // Extra incomplete-looking activity: Bravo also has a 100 left available (not completed)
  ]
  for (const [i, s] of scavPlan.entries()) {
    if (scenarioKey === 'wrapped') await clearFinaleLatchForHistoricalSeed()
    const at = shipLocalToUtcIso(dayDate(aligned.day1, s.day), s.hour, aligned.offsetMinutes)
    const data = await scavengerComplete(s.client, s.player.player_id, s.key, at, `scav-${i}`)
    activity.push({ type: 'scavenger', key: s.key, player: s.player.key, ok: data?.ok, points: data?.awarded_points })
  }

  // Gallery reactions from another member
  const { data: events } = await service
    .from('gallery_events')
    .select('id, game')
    .order('created_at', { ascending: true })
    .limit(8)
  if (events?.length) {
    const drinkClient = await signIn(drinkOnly.login_alias)
    for (const [i, ev] of events.slice(0, 3).entries()) {
      if (ev.game !== 'drinkit' && ev.game !== 'shipit') continue
      const reactor = ev.game === 'drinkit' ? drinkClient : bothClient
      await reactor.rpc('set_gallery_reaction', { p_event_id: ev.id, p_emoji: i % 2 ? 'laugh' : 'heart' })
    }
  }

  return activity
}

async function latchFinale(aligned) {
  const day7 = dayDate(aligned.day1, 7)
  const finaleUtc = shipLocalToUtcIso(day7, '18:00:00', aligned.offsetMinutes)
  const { error } = await service.rpc('dev_get_ship_clock_state_at', {
    p_at_utc: finaleUtc,
    p_apply_lifecycle_side_effects: true,
  })
  if (error) throw error
  // Clear reveals so Wrapped intro shows for viewers
  await service.from('wrapped_reveals').delete().neq('player_id', '00000000-0000-0000-0000-000000000000')
  return finaleUtc
}

async function scoreSnapshot() {
  const { data: cruise } = await service
    .from('cruise_config')
    .select('id')
    .eq('is_active', true)
    .single()
  const drink = await service.rpc('drinkit_player_score_rows', { p_cruise_config_id: cruise.id })
  const ship = await service.rpc('shipit_team_score_rows', { p_cruise_config_id: cruise.id })
  return { drinkit: drink.data, shipit: ship.data }
}

// --- main ---
const aligned = computeNowAligned(scenario)
console.log(`Scenario: ${scenario.label}`)
console.log(`Aligned day1=${aligned.day1} offset=${aligned.offsetMinutes} (wall clock ≈ Day ${scenario.cruiseDay} ${scenario.hour}:${String(scenario.minute).padStart(2, '0')})`)

const identities = await provisionRoster()
await seedBase(aligned)

let activity = []
if (scenarioKey === 'tuesday' || scenarioKey === 'wrapped') {
  activity = await seedTuesdayActivity(identities, aligned)
}
if (scenarioKey === 'wrapped') {
  // Extra day 5–7 activity for a fuller cruise Gallery, then finale
  const cast = resolveDemoCast(identities)
  const latePairs = [
    ['crooners', 'rum-brulee'],
    ['lido-bar', 'lychee-vodka-mojito'],
    ['sea-view-bar', 'strawberries-and-cream'],
    ['omalleys-irish-pub', 'passion-of-the-irish'],
  ]
  const lateOfferings = []
  for (const [bar, drink] of latePairs) {
    try {
      lateOfferings.push({ bar, id: await lookupOffering(bar, drink) })
    } catch {
      console.warn(`  late skip ${drink}@${bar}`)
    }
  }
  for (const [di, day] of [5, 6, 7].entries()) {
    const offer = lateOfferings[di % Math.max(lateOfferings.length, 1)]
    if (!offer) continue
    const at = shipLocalToUtcIso(dayDate(aligned.day1, day), '14:00:00', aligned.offsetMinutes)
    const at2 = shipLocalToUtcIso(dayDate(aligned.day1, day), '16:30:00', aligned.offsetMinutes)
    try {
      await clearFinaleLatchForHistoricalSeed()
      await claimAt(cast.drinkOnly, offer.bar, offer.id, at, `late-${day}-a`, [cast.both.player_id], true, {
        withPhoto: true,
      })
      await clearFinaleLatchForHistoricalSeed()
      await claimAt(cast.both, offer.bar, offer.id, at2, `late-${day}-b`, [], true, { withPhoto: true })
      await clearFinaleLatchForHistoricalSeed()
      await claimAt(cast.admin, offer.bar, offer.id, at, `late-${day}-c`, [], true, {
        withPhoto: day !== 7,
      })
    } catch (e) {
      console.warn(`late-cruise drinks day ${day} skipped`, e.message)
    }
  }

  // Challenges not used in the Tuesday mid-cruise block (avoid TEAM_CHALLENGE_DONE).
  const lateScav = [
    { key: 'under-the-dome', player: cast.shipOnly, day: 5, hour: '11:00:00' },
    { key: 'lotus-spa-zen', player: cast.both, day: 5, hour: '15:00:00' },
    { key: 'poolside-slice', player: cast.admin, day: 6, hour: '12:00:00' },
    { key: 'art-critic', player: cast.shipOnly, day: 6, hour: '17:00:00' },
    { key: 'casino-neon', player: cast.both, day: 7, hour: '10:30:00' },
  ]
  for (const [i, s] of lateScav.entries()) {
    try {
      await clearFinaleLatchForHistoricalSeed()
      const client = await signIn(s.player.login_alias)
      const at = shipLocalToUtcIso(dayDate(aligned.day1, s.day), s.hour, aligned.offsetMinutes)
      const data = await scavengerComplete(client, s.player.player_id, s.key, at, `late-scav-${i}`)
      activity.push({
        type: 'scavenger',
        key: s.key,
        player: s.player.key,
        ok: data?.ok,
        points: data?.awarded_points,
        photo: true,
      })
    } catch (e) {
      console.warn(`late scavenger ${s.key}: ${e.message}`)
    }
  }

  const finaleUtc = await latchFinale(aligned)
  console.log('Finale latched at', finaleUtc)
}

const scores = await scoreSnapshot()

// Bound photos linked to accepted submissions that still have an active Gallery event
const { data: boundPhotos } = await service
  .from('photos')
  .select('id, game, purpose, status, bound_submission_id')
  .eq('status', 'bound')
const boundIds = new Set((boundPhotos || []).map((p) => p.bound_submission_id).filter(Boolean))
const { data: galleryEvents } = await service
  .from('gallery_events')
  .select('id, game, submission_id, kind')
  .eq('active', true)
  .in('kind', ['drink_log', 'daily', 'scavenger'])
const galleryPhotoRows = (galleryEvents || []).filter((e) => boundIds.has(e.submission_id))
const galleryPhotoCounts = {
  drinkit: galleryPhotoRows.filter((r) => r.game === 'drinkit').length,
  shipit: galleryPhotoRows.filter((r) => r.game === 'shipit').length,
  total: galleryPhotoRows.length,
  bound_photos: (boundPhotos || []).length,
}

const out = {
  scenario: scenarioKey,
  label: scenario.label,
  day1: aligned.day1,
  offsetMinutes: aligned.offsetMinutes,
  catalog_id: CATALOG.catalog_id,
  activity_count: activity.length,
  private_photos_available: photoPicker.count,
  photo_upload_stats: photoStats,
  gallery_photo_posts: galleryPhotoCounts,
  scores,
  identities: identities.identities.map((i) => ({
    key: i.key,
    display_name: i.display_name,
    login_alias: i.login_alias,
    games: i.games,
    team: i.team,
  })),
}
console.log(JSON.stringify(out, null, 2))
console.log(`\nDemo scenario "${scenarioKey}" ready. Login with LOCAL_TEST_PASSWORD and the aliases above.`)
