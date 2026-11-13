/**
 * Plan C Wrapped slide coverage verifier.
 *
 * Uses production carousel builders (buildDrinkItFeatureSlides /
 * buildShipItFeatureSlides) against live get_my_wrapped + gallery feeds.
 *
 *   npm run qa:wrapped-plan-c-coverage
 *   npm run qa:wrapped-plan-c-coverage -- --player-di=david_forrester --player-si=katie_forrester
 *
 * Development-only. Local Supabase. Read-only (sign-in + wrapped/gallery RPCs).
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import ws from 'ws'

// Node 20 + Vite SSR: supabase realtime requires a WebSocket constructor.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = ws
}
import {
  assertDevelopmentOnlyCruise,
  assertLocalSupabaseUrl,
  readSupabaseEnv,
} from './lib/demoLocalSafety.mjs'
import { PLAN_C_QA } from './lib/wrappedPlanCFullSeed.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

function argValue(flag, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`))
  if (hit) return hit.slice(flag.length + 1)
  const idx = process.argv.indexOf(flag)
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('-')) {
    return process.argv[idx + 1]
  }
  return fallback
}

function readPassword() {
  const fromEnv = process.env.LOCAL_TEST_PASSWORD || process.env.PRIVATE_ROSTER_PASSWORD
  if (fromEnv && fromEnv.length >= 12) return fromEnv
  const file = join(root, '.local/runtime-qual-password.txt')
  if (existsSync(file)) {
    const pw = readFileSync(file, 'utf8').trim()
    if (pw.length >= 12) return pw
  }
  throw new Error('Set LOCAL_TEST_PASSWORD or .local/runtime-qual-password.txt')
}

function loadIdentities() {
  const path = join(root, '.local/test-identities.json')
  if (!existsSync(path)) throw new Error('Missing .local/test-identities.json — run db:provision')
  return JSON.parse(readFileSync(path, 'utf8'))
}

async function signIn(url, anonKey, password, loginAlias) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  })
  const { error } = await client.auth.signInWithPassword({ email: loginAlias, password })
  if (error) throw error
  return client
}

function slideReport(candidates, included) {
  const byId = new Map(included.map((s) => [s.id, s]))
  return candidates.map((id) => {
    const slide = byId.get(id)
    if (!slide) {
      return {
        id,
        included: false,
        exclusion_reason: 'eligibility_or_photo_collision',
        source: null,
        displayed: null,
      }
    }
    const displayed =
      slide.type === 'double'
        ? slide.heroes?.map((h) => h.value).join(' | ')
        : slide.type === 'photo'
          ? `photo:${slide.photo?.photo_id?.slice(0, 8) || '?'}`
          : slide.heroValue
    return {
      id,
      included: true,
      exclusion_reason: null,
      source:
        slide.type === 'photo'
          ? { photo_id: slide.photo?.photo_id, event_id: slide.eventId, caption: slide.caption }
          : { eyebrow: slide.eyebrow, headline: slide.headline },
      displayed,
      eyebrow: slide.eyebrow,
    }
  })
}

const DI_IDS = Array.from({ length: 15 }, (_, i) => `DI-${String(i + 1).padStart(2, '0')}`)
const SI_IDS = Array.from({ length: 12 }, (_, i) => `SI-${String(i + 1).padStart(2, '0')}`)

async function main() {
  const sbEnv = readSupabaseEnv()
  const url = sbEnv.API_URL || sbEnv.SUPABASE_URL
  const anonKey = sbEnv.ANON_KEY || sbEnv.SUPABASE_ANON_KEY
  const serviceRole = sbEnv.SERVICE_ROLE_KEY || sbEnv.SUPABASE_SERVICE_ROLE_KEY
  assertLocalSupabaseUrl(url)
  if (!anonKey || !serviceRole) throw new Error('Missing local anon/service keys')

  const service = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  })
  await assertDevelopmentOnlyCruise(service)

  const identities = loadIdentities()
  const byKey = Object.fromEntries((identities.identities || []).map((i) => [i.key, i]))
  const diKey = argValue('--player-di', PLAN_C_QA.drinkItPlayerKey)
  const siKey = argValue('--player-si', PLAN_C_QA.shipItPlayerKey)
  const diPlayer = byKey[diKey]
  const siPlayer = byKey[siKey]
  if (!diPlayer) throw new Error(`Unknown Drink It! player key ${diKey}`)
  if (!siPlayer) throw new Error(`Unknown Ship It! player key ${siKey}`)

  const password = readPassword()

  // Load app modules through Vite so TS path aliases resolve.
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const { buildDrinkItFeatureSlides, buildShipItFeatureSlides } = await vite.ssrLoadModule(
      '/src/lib/wrapped/buildFeatureSlides.ts',
    )

    const diClient = await signIn(url, anonKey, password, diPlayer.login_alias)
    const siClient = await signIn(url, anonKey, password, siPlayer.login_alias)

    const diWrapped = await diClient.rpc('get_my_wrapped', { p_game: 'drinkit' })
    if (diWrapped.error) throw diWrapped.error
    const siWrapped = await siClient.rpc('get_my_wrapped', { p_game: 'shipit' })
    if (siWrapped.error) throw siWrapped.error

    // Gallery feed requires auth context matching the module's supabase client.
    // Prefer direct RPC paging equivalent to fetchPhotoHighlights.
    async function loadHighlights(client, game) {
      const events = []
      let beforeCreated = null
      let beforeId = null
      let truncated = false
      for (;;) {
        const { data, error } = await client.rpc('list_gallery_feed', {
          p_game: game,
          p_filter: 'everyone',
          p_limit: 20,
          p_before_created_at: beforeCreated,
          p_before_id: beforeId,
        })
        if (error) throw error
        if (data?.ok === false) {
          throw new Error(data?.message || data?.code || 'list_gallery_feed failed')
        }
        const feedEvents = Array.isArray(data?.events) ? data.events : []
        events.push(...feedEvents)
        const hasMore = Boolean(data?.has_more)
        const cursor = data?.next_cursor
        if (!hasMore || !cursor) break
        if (events.length >= 200) {
          truncated = true
          break
        }
        beforeCreated = cursor.created_at_utc ?? null
        beforeId = cursor.id ?? null
      }
      return { events: events.slice(0, 200), truncated }
    }

    const { buildPhotoHighlights } = await vite.ssrLoadModule('/src/lib/wrapped/photoHighlights.ts')

    const diFeed = await loadHighlights(diClient, 'drinkit')
    const siFeed = await loadHighlights(siClient, 'shipit')
    const diPhotos = buildPhotoHighlights(diFeed.events)
    const siPhotos = buildPhotoHighlights(siFeed.events)

    const diSections = diWrapped.data?.sections
    const siSections = siWrapped.data?.sections
    if (!diSections || !siSections) {
      throw new Error('get_my_wrapped missing sections — is finale latched and membership valid?')
    }

    const diSlides = buildDrinkItFeatureSlides(diSections, diPhotos, {
      photoPoolComplete: !diFeed.truncated,
    })
    const siSlides = buildShipItFeatureSlides(siSections, siPhotos, {
      photoPoolComplete: !siFeed.truncated,
    })

    const diReport = slideReport(DI_IDS, diSlides)
    const siReport = slideReport(SI_IDS, siSlides)
    const diIncluded = diReport.filter((r) => r.included).map((r) => r.id)
    const siIncluded = siReport.filter((r) => r.included).map((r) => r.id)

    const diPhotoIds = diSlides.filter((s) => s.type === 'photo').map((s) => s.photo?.photo_id)
    const siPhotoIds = siSlides.filter((s) => s.type === 'photo').map((s) => s.photo?.photo_id)
    const diDup = diPhotoIds.filter((id, i) => id && diPhotoIds.indexOf(id) !== i)
    const siDup = siPhotoIds.filter((id, i) => id && siPhotoIds.indexOf(id) !== i)

    // Signed URL smoke for featured photos
    const allPhotoIds = [...new Set([...diPhotoIds, ...siPhotoIds].filter(Boolean))]
    const photoUrlChecks = []
    for (const photoId of allPhotoIds) {
      const { data: photo } = await service.from('photos').select('id, storage_path, status').eq('id', photoId).maybeSingle()
      if (!photo?.storage_path) {
        photoUrlChecks.push({ photo_id: photoId, ok: false, reason: 'missing_storage_path' })
        continue
      }
      const signed = await service.storage.from('game-photos').createSignedUrl(photo.storage_path, 60)
      photoUrlChecks.push({
        photo_id: photoId,
        ok: Boolean(signed.data?.signedUrl) && !signed.error,
        status: photo.status,
        reason: signed.error?.message || null,
      })
    }

    const diOk = diIncluded.length === 15 && diDup.length === 0
    const siOk = siIncluded.length === 12 && siDup.length === 0
    const photosOk = photoUrlChecks.every((p) => p.ok)

    const report = {
      captured_at: new Date().toISOString(),
      target: {
        url,
        cruise_label: 'development-only',
        drinkit_player: { key: diKey, name: diPlayer.display_name },
        shipit_player: { key: siKey, name: siPlayer.display_name, team: siPlayer.team },
      },
      drinkit: {
        included_count: diIncluded.length,
        expected: 15,
        ok: diOk,
        included_ids: diIncluded,
        skipped_ids: diReport.filter((r) => !r.included).map((r) => r.id),
        slides: diReport,
        duplicate_photos: diDup,
        gallery_photos: diPhotos.length,
        gallery_truncated: diFeed.truncated,
      },
      shipit: {
        included_count: siIncluded.length,
        expected: 12,
        ok: siOk,
        included_ids: siIncluded,
        skipped_ids: siReport.filter((r) => !r.included).map((r) => r.id),
        slides: siReport,
        duplicate_photos: siDup,
        gallery_photos: siPhotos.length,
        gallery_truncated: siFeed.truncated,
      },
      photo_urls: photoUrlChecks,
      photo_urls_ok: photosOk,
      ok: diOk && siOk && photosOk,
    }

    const outDir = join(root, 'docs/qa/wrapped-plan-c-full')
    mkdirSync(outDir, { recursive: true })
    const outPath = join(outDir, 'coverage-report.json')
    writeFileSync(outPath, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
    console.log(`\nWrote ${outPath}`)
    if (!report.ok) {
      console.error(
        `\nCOVERAGE FAILED: DI ${diIncluded.length}/15, SI ${siIncluded.length}/12, photos_ok=${photosOk}`,
      )
      process.exit(1)
    }
    console.log('\nCOVERAGE OK: Drink It! 15/15, Ship It! 12/12, photo URLs valid.')
  } finally {
    await vite.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
