/**
 * Capture Just Unlocked featured-showcase screenshots at phone widths.
 *
 * Uses local fixtures only: temporarily rewinds achievements_mine cursor so the
 * newest N awards appear unread, then restores the prior cursor.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-just-unlocked-showcase.mjs http://localhost:5173
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import ws from 'ws'

const baseUrl = process.argv[2] ?? 'http://localhost:5173'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  (await readFile(join(root, '.local/runtime-qual-password.txt'), 'utf8')).trim()

const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const player =
  summary.identities.find((i) => i.key === 'david_forrester') ||
  summary.identities.find((i) => i.key === 'josh_forrester') ||
  summary.identities.find((i) => !i.is_admin)
if (!player) {
  console.error('Need a test identity with achievements')
  process.exit(1)
}

const envText = execSync('npx supabase status -o env', { encoding: 'utf8', cwd: root })
const apiUrl = envText.match(/^API_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
const serviceKey = envText.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
if (!apiUrl || !serviceKey) {
  console.error('Could not read local Supabase env')
  process.exit(1)
}

const service = createClient(apiUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
})

const outDir = join(root, 'docs/just-unlocked-showcase-screenshots')
await mkdir(outDir, { recursive: true })

const WIDTHS = [360, 402, 430]
const results = []

function pass(name) {
  results.push({ name, ok: true })
  console.log(`PASS ${name}`)
}
function fail(name, detail) {
  results.push({ name, ok: false, detail })
  console.error(`FAIL ${name}: ${detail}`)
}

async function listActiveAwards(game, playerId, teamId) {
  let q = service
    .from('achievement_awards')
    .select('id, awarded_at_utc, definition_id, owner_player_id, owner_team_id, status')
    .eq('status', 'active')
    .order('awarded_at_utc', { ascending: false })
    .order('id', { ascending: false })
  if (game === 'drinkit') {
    q = q.eq('owner_player_id', playerId)
  } else {
    q = q.eq('owner_team_id', teamId)
  }
  const { data, error } = await q
  if (error) throw error
  const defs = await service
    .from('achievement_definitions')
    .select('id, game, enabled')
    .in(
      'id',
      (data ?? []).map((a) => a.definition_id),
    )
  const defMap = new Map((defs.data ?? []).map((d) => [d.id, d]))
  return (data ?? []).filter((a) => {
    const d = defMap.get(a.definition_id)
    return d && d.game === game && d.enabled
  })
}

async function getCursor(playerId, game) {
  const { data, error } = await service
    .from('read_cursors')
    .select('last_seen_event_id, last_seen_at_utc')
    .eq('player_id', playerId)
    .eq('game', game)
    .eq('scope', 'achievements_mine')
    .maybeSingle()
  if (error) throw error
  return data
}

async function setCursor(playerId, game, cursor) {
  if (!cursor) {
    await service
      .from('read_cursors')
      .delete()
      .eq('player_id', playerId)
      .eq('game', game)
      .eq('scope', 'achievements_mine')
    return
  }
  const { error } = await service.from('read_cursors').upsert({
    player_id: playerId,
    game,
    scope: 'achievements_mine',
    last_seen_event_id: cursor.last_seen_event_id,
    last_seen_at_utc: cursor.last_seen_at_utc,
    updated_at_utc: new Date().toISOString(),
  })
  if (error) throw error
}

/** Place cursor just before the newest `count` awards so those are unread. */
async function rewindCursorForNewest(playerId, game, teamId, count) {
  const awards = await listActiveAwards(game, playerId, teamId)
  if (awards.length < count) {
    throw new Error(`${game}: need ≥${count} awards, found ${awards.length}`)
  }
  const previous = await getCursor(playerId, game)
  const boundary = awards[count] // first award that should remain "seen"
  if (boundary) {
    await setCursor(playerId, game, {
      last_seen_event_id: boundary.id,
      last_seen_at_utc: boundary.awarded_at_utc,
    })
  } else {
    await setCursor(playerId, game, null)
  }
  return previous
}

async function login(page, displayName) {
  await page.context().clearCookies()
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
  })
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#login-name', { timeout: 15000 })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
}

async function captureShowcase(page, game, count, previousCursor, teamId) {
  const route = game === 'drinkit' ? '/drinkit/achievements' : '/shipit/achievements'
  await page.goto(`${baseUrl}${route}?view=mine`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="achievements-just-unlocked"]', { timeout: 20000 })
  const countText = await page.locator('[data-testid="achievements-just-unlocked-count"]').innerText()
  const expected = count === 1 ? '1 New' : `${count} New`
  if (countText.trim() !== expected) {
    throw new Error(`Expected count "${expected}", got "${countText.trim()}"`)
  }
  const cards = page.locator('[data-testid="achievements-just-unlocked"] [data-testid="achievement-card"]')
  const n = await cards.count()
  if (n !== count) throw new Error(`Expected ${count} showcase cards, got ${n}`)

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(outDir, `${game}-${count}-new-${width}.png`),
      fullPage: true,
    })
    // Viewport shot emphasizing showcase → first category transition.
    await page.screenshot({
      path: join(outDir, `${game}-${count}-transition-${width}.png`),
      fullPage: false,
    })
  }

  // Dot should clear after successful My Achievements load; showcase remains.
  const dot = page.locator('[data-testid="achievements-unread-dot"]')
  const dotVisible = (await dot.count()) > 0 && (await dot.first().isVisible())
  if (dotVisible) {
    fail(`${game}-${count}-dot-cleared`, 'unread dot still visible after My Achievements load')
  } else {
    pass(`${game}-${count}-dot-cleared`)
  }

  const showcaseStill = await page.locator('[data-testid="achievements-just-unlocked"]').count()
  if (showcaseStill !== 1) {
    fail(`${game}-${count}-showcase-persists`, 'Just Unlocked missing after mark-seen')
  } else {
    pass(`${game}-${count}-showcase-persists`)
  }

  // Leave and return — showcase should be gone.
  await page.goto(`${baseUrl}/${game === 'drinkit' ? 'drinkit' : 'shipit'}`, {
    waitUntil: 'networkidle',
  })
  await page.goto(`${baseUrl}${route}?view=mine`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="achievements-view"]', { timeout: 20000 })
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-testid="achievements-view"]')
      if (!root) return false
      if (document.querySelector('[data-testid="achievements-loading"]')) return false
      return true
    },
    { timeout: 20000 },
  )
  const afterReturn = await page.locator('[data-testid="achievements-just-unlocked"]').count()
  if (afterReturn !== 0) {
    fail(`${game}-${count}-return-clears`, 'Just Unlocked still present after leave/return')
  } else {
    pass(`${game}-${count}-return-clears`)
  }

  // Restore prior cursor for isolation (return already advanced it; put back for next scenario).
  await setCursor(player.player_id, game, previousCursor)
  void teamId
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 402, height: 844 } })

try {
  await login(page, player.display_name)

  const { data: membership } = await service
    .from('team_memberships')
    .select('team_id')
    .eq('player_id', player.player_id)
    .is('active_to', null)
    .maybeSingle()
  const teamId = membership?.team_id ?? null

  for (const count of [2, 6]) {
    const prev = await rewindCursorForNewest(player.player_id, 'drinkit', null, count)
    await captureShowcase(page, 'drinkit', count, prev, null)
    pass(`drinkit-${count}-screenshots`)
  }

  // Normal page with no unread / no Just Unlocked section.
  {
    const awards = await listActiveAwards('drinkit', player.player_id, null)
    const newest = awards[0]
    const prevEmpty = await getCursor(player.player_id, 'drinkit')
    if (newest) {
      await setCursor(player.player_id, 'drinkit', {
        last_seen_event_id: newest.id,
        last_seen_at_utc: newest.awarded_at_utc,
      })
    }
    await page.goto(`${baseUrl}/drinkit/achievements?view=mine`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="achievements-view"]', { timeout: 20000 })
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="achievements-loading"]'),
      { timeout: 20000 },
    )
    const none = await page.locator('[data-testid="achievements-just-unlocked"]').count()
    if (none !== 0) {
      fail('drinkit-none-showcase', 'Just Unlocked present when no unread awards')
    } else {
      pass('drinkit-none-showcase')
    }
    await page.setViewportSize({ width: 402, height: 844 })
    await page.screenshot({
      path: join(outDir, 'drinkit-none-402.png'),
      fullPage: true,
    })
    await setCursor(player.player_id, 'drinkit', prevEmpty)
  }

  if (teamId) {
    try {
      const prevShip = await rewindCursorForNewest(player.player_id, 'shipit', teamId, 2)
      await captureShowcase(page, 'shipit', 2, prevShip, teamId)
      pass('shipit-2-screenshots')
    } catch (err) {
      fail('shipit-2-screenshots', err instanceof Error ? err.message : String(err))
    }
  } else {
    fail('shipit-2-screenshots', 'player has no active team')
  }

  // Popup See All → My Achievements with showcase
  const prevPopup = await rewindCursorForNewest(player.player_id, 'drinkit', null, 2)
  await page.goto(`${baseUrl}/drinkit/gallery`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const pinia = app?.config?.globalProperties?.$pinia
    const store = pinia?._s?.get('achievementCelebration')
    if (!store) throw new Error('achievementCelebration store not found')
    store.visibleCards = [
      {
        definition_id: 'x',
        stable_key: 'x',
        game: 'drinkit',
        group_key: 'milestones',
        exclusive: false,
        secret: false,
        icon_key: 'theme.drink-it',
        title: 'Popup Seed',
        description: 'd',
        earned: true,
        awarded_at_utc: new Date().toISOString(),
        award_id: '00000000-0000-4000-8000-000000000099',
        progress: null,
        exclusive_claimed: false,
        exclusive_owner_name: null,
        masked: false,
        view: 'mine',
      },
      {
        definition_id: 'y',
        stable_key: 'y',
        game: 'drinkit',
        group_key: 'milestones',
        exclusive: false,
        secret: false,
        icon_key: 'score.cocktail',
        title: 'Popup Seed 2',
        description: 'd',
        earned: true,
        awarded_at_utc: new Date().toISOString(),
        award_id: '00000000-0000-4000-8000-000000000098',
        progress: null,
        exclusive_claimed: false,
        exclusive_owner_name: null,
        masked: false,
        view: 'mine',
      },
      {
        definition_id: 'z',
        stable_key: 'z',
        game: 'drinkit',
        group_key: 'milestones',
        exclusive: false,
        secret: false,
        icon_key: 'score.beer',
        title: 'Popup Seed 3',
        description: 'd',
        earned: true,
        awarded_at_utc: new Date().toISOString(),
        award_id: '00000000-0000-4000-8000-000000000097',
        progress: null,
        exclusive_claimed: false,
        exclusive_owner_name: null,
        masked: false,
        view: 'mine',
      },
    ]
    store.open = true
    store.loading = false
    store.pending = null
  })
  await page.waitForSelector('[data-testid="achievement-unlock-popup"]', { timeout: 5000 })
  await page.click('[data-testid="achievement-unlock-cta"]')
  await page.waitForURL((url) => url.pathname.includes('/drinkit/achievements'), { timeout: 15000 })
  await page.waitForSelector('[data-testid="achievements-just-unlocked"]', { timeout: 20000 })
  pass('popup-see-all-navigates-to-showcase')
  await setCursor(player.player_id, 'drinkit', prevPopup)
} catch (err) {
  fail('capture-run', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

await writeFile(join(outDir, 'qa-notes.json'), JSON.stringify({ results, player: player.key }, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) process.exit(1)
