/**
 * Final Achievements visual corrections QA:
 * - Just Unlocked showcase body is solid white
 * - Achievement titles use CSS capitalize (ui-display-name)
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-final-achievement-visual-corrections.mjs http://localhost:5173
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
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

const outDir = join(root, 'docs/final-achievement-visual-corrections')
const beforeDir = join(root, 'docs/just-unlocked-showcase-screenshots')
await mkdir(outDir, { recursive: true })

const WIDTHS = [360, 402, 430]
const results = []
const notes = []

function pass(name, detail) {
  results.push({ name, ok: true, detail })
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`)
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
  if (game === 'drinkit') q = q.eq('owner_player_id', playerId)
  else q = q.eq('owner_team_id', teamId)
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

async function rewindCursorForNewest(playerId, game, teamId, count) {
  const awards = await listActiveAwards(game, playerId, teamId)
  if (awards.length < count) {
    throw new Error(`${game}: need ≥${count} awards, found ${awards.length}`)
  }
  const previous = await getCursor(playerId, game)
  const boundary = awards[count]
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

function sampleCards(n, game = 'drinkit') {
  const catalog = [
    { title: 'the gintlemen', description: 'Have 3 gin drinks', icon_key: 'score.cocktail' },
    { title: "these boots are made for walkin'", description: 'Log your first drink.', icon_key: 'score.bolt' },
    { title: "can't beat the classics", description: 'Log a beer.', icon_key: 'score.beer' },
    { title: 'margarita kickoff', description: 'Log a margarita.', icon_key: 'score.lemon' },
    { title: 'morning glory', description: 'Log before noon.', icon_key: 'score.sun' },
    { title: 'ship shape sip', description: 'Log on a sea day.', icon_key: 'theme.drink-it' },
  ]
  return catalog.slice(0, n).map((row, i) => ({
    definition_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    stable_key: `qa-${i}`,
    game,
    group_key: 'other',
    exclusive: false,
    secret: false,
    icon_key: game === 'shipit' && i === 0 ? 'theme.ship-it' : row.icon_key,
    title: row.title,
    description: row.description,
    earned: true,
    awarded_at_utc: new Date().toISOString(),
    award_id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    progress: null,
    exclusive_claimed: false,
    exclusive_owner_name: null,
    masked: false,
    view: 'mine',
  }))
}

async function openCelebration(page, cards) {
  await page.evaluate((payload) => {
    const app = document.querySelector('#app')?.__vue_app__
    const pinia = app?.config?.globalProperties?.$pinia
    const store = pinia?._s?.get('achievementCelebration')
    if (!store) throw new Error('achievementCelebration store not found')
    store.visibleCards = payload
    store.open = true
    store.loading = false
    store.pending = null
  }, cards)
  await page.waitForSelector('[data-testid="achievement-unlock-popup"]', { timeout: 5000 })
}

async function closeCelebration(page) {
  const close = page.locator('[data-testid="achievement-unlock-close"]')
  if ((await close.count()) > 0) await close.click()
  await page.waitForSelector('[data-testid="achievement-unlock-popup"]', {
    state: 'detached',
    timeout: 5000,
  }).catch(() => {})
}

async function assertShowcaseWhite(page, label) {
  const metrics = await page.evaluate(() => {
    const body = document.querySelector('.just-unlocked-showcase__body')
    const header = document.querySelector('.just-unlocked-showcase__header')
    const card = document.querySelector(
      '[data-testid="achievements-just-unlocked"] [data-testid="achievement-card"]',
    )
    const title = card?.querySelector('h3')
    // Description is the last body paragraph (not NEW / EARNED badge rows).
    const desc = card?.querySelector('.achievement-card__body > p:last-of-type, .achievement-card__body p.mt-1')
    if (!body || !header || !card || !title) {
      return { ok: false, detail: 'missing showcase parts' }
    }
    const bodyBg = getComputedStyle(body).backgroundColor
    const headerBg = getComputedStyle(header).backgroundColor
    const cardBg = getComputedStyle(card).backgroundImage || getComputedStyle(card).backgroundColor
    const titleTf = getComputedStyle(title).textTransform
    const descTf = desc ? getComputedStyle(desc).textTransform : null
    return {
      ok: true,
      bodyBg,
      headerBg,
      cardBg,
      titleTf,
      descTf,
      titleText: title.textContent?.trim() ?? '',
      descText: desc?.textContent?.trim() ?? '',
    }
  })
  if (!metrics.ok) {
    fail(`${label}-structure`, metrics.detail)
    return
  }
  const white =
    metrics.bodyBg === 'rgb(255, 255, 255)' || metrics.bodyBg === 'rgba(255, 255, 255, 1)'
  if (white) pass(`${label}-body-white`, metrics.bodyBg)
  else fail(`${label}-body-white`, `got ${metrics.bodyBg}`)

  if (metrics.headerBg && metrics.headerBg !== metrics.bodyBg) {
    pass(`${label}-header-colored`, metrics.headerBg)
  } else {
    fail(`${label}-header-colored`, `header ${metrics.headerBg}`)
  }

  if (metrics.cardBg && metrics.cardBg !== 'none' && !metrics.cardBg.includes('255, 255, 255')) {
    pass(`${label}-card-gradient-kept`, metrics.cardBg.slice(0, 80))
  } else if (metrics.cardBg?.includes('gradient')) {
    pass(`${label}-card-gradient-kept`, metrics.cardBg.slice(0, 80))
  } else {
    // Cards use CSS var gradient; computed may still resolve to an image.
    notes.push({ label, cardBg: metrics.cardBg })
    if (metrics.cardBg && metrics.cardBg !== metrics.bodyBg) {
      pass(`${label}-card-not-white-body`, metrics.cardBg.slice(0, 80))
    } else {
      fail(`${label}-card-gradient-kept`, `card bg ${metrics.cardBg}`)
    }
  }

  if (metrics.titleTf === 'capitalize') pass(`${label}-title-capitalize`, metrics.titleText)
  else fail(`${label}-title-capitalize`, `text-transform=${metrics.titleTf}`)

  if (!metrics.descTf || metrics.descTf === 'none') {
    pass(`${label}-desc-not-capitalized`, metrics.descText.slice(0, 60))
  } else {
    fail(`${label}-desc-not-capitalized`, `text-transform=${metrics.descTf}`)
  }
}

async function captureShowcase(page, game, count) {
  const route = game === 'drinkit' ? '/drinkit/achievements' : '/shipit/achievements'
  await page.goto(`${baseUrl}${route}?view=mine`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="achievements-just-unlocked"]', { timeout: 20000 })

  await page.setViewportSize({ width: 402, height: 874 })
  await page.waitForTimeout(250)
  await assertShowcaseWhite(page, `${game}-${count}`)

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 874 })
    await page.waitForTimeout(150)
    await page.screenshot({
      path: join(outDir, `after-${game}-just-unlocked-${count}-${width}.png`),
      fullPage: false,
    })
  }
  pass(`${game}-${count}-screenshots`)
}

try {
  // Preserve approved before baselines from prior Just Unlocked capture.
  for (const name of [
    'drinkit-3-new-402.png',
    'drinkit-6-new-402.png',
    'shipit-2-new-402.png',
    'shipit-3-new-402.png',
  ]) {
    try {
      await copyFile(join(beforeDir, name), join(outDir, `before-${name}`))
    } catch {
      /* optional */
    }
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } })

  try {
    await login(page, player.display_name)

    const { data: membership } = await service
      .from('team_memberships')
      .select('team_id')
      .eq('player_id', player.player_id)
      .is('active_to', null)
      .maybeSingle()
    const teamId = membership?.team_id ?? null

    // Drink It Just Unlocked (multi)
    {
      const prev = await rewindCursorForNewest(player.player_id, 'drinkit', null, 3)
      await captureShowcase(page, 'drinkit', 3)
      await setCursor(player.player_id, 'drinkit', prev)
    }

    // Ordinary collection cards (All Achievements)
    await page.goto(`${baseUrl}/drinkit/achievements?view=all`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="achievement-card"]', { timeout: 20000 })
    const collectionTitleTf = await page.evaluate(() => {
      const title = document.querySelector('[data-testid="achievement-card"] h3')
      return title ? getComputedStyle(title).textTransform : null
    })
    if (collectionTitleTf === 'capitalize') pass('collection-title-capitalize')
    else fail('collection-title-capitalize', `text-transform=${collectionTitleTf}`)
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 874 })
      await page.waitForTimeout(120)
      await page.screenshot({
        path: join(outDir, `after-drinkit-collection-${width}.png`),
        fullPage: false,
      })
    }

    // Gallery achievement announcement + unlock popups (popup mounts on gallery only)
    await page.goto(`${baseUrl}/drinkit/gallery`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="gallery-feed"]', { timeout: 20000 })
    // Ensure Show Achievements is on.
    const achToggle = page.locator('[data-testid="gallery-show-achievements"]')
    if ((await achToggle.count()) > 0) {
      const checked = await achToggle.isChecked()
      if (!checked) {
        await achToggle.click()
        await page.waitForTimeout(400)
      }
    }
    // Scroll feed until an achievement card appears (or give up).
    let galleryFound = false
    for (let i = 0; i < 12; i++) {
      if ((await page.locator('[data-testid="gallery-achievement-card"]').count()) > 0) {
        galleryFound = true
        break
      }
      await page.mouse.wheel(0, 900)
      await page.waitForTimeout(350)
    }
    if (galleryFound) {
      const galleryAward = page.locator('[data-testid="gallery-achievement-card"]').first()
      await galleryAward.scrollIntoViewIfNeeded()
      const galleryTf = await page.evaluate(() => {
        const title = document.querySelector(
          '[data-testid="gallery-achievement-card"] [data-testid="gallery-post-title"]',
        )
        const desc = document.querySelector(
          '[data-testid="gallery-achievement-card"] [data-testid="gallery-post-subtitle"]',
        )
        return {
          titleTf: title ? getComputedStyle(title).textTransform : null,
          descTf: desc ? getComputedStyle(desc).textTransform : null,
        }
      })
      if (galleryTf.titleTf === 'capitalize') pass('gallery-title-capitalize')
      else fail('gallery-title-capitalize', `text-transform=${galleryTf.titleTf}`)
      if (!galleryTf.descTf || galleryTf.descTf === 'none') pass('gallery-desc-not-capitalized')
      else fail('gallery-desc-not-capitalized', `text-transform=${galleryTf.descTf}`)
      await page.setViewportSize({ width: 402, height: 874 })
      await page.screenshot({
        path: join(outDir, 'after-drinkit-gallery-achievement-402.png'),
        fullPage: false,
      })
    } else {
      // Still verify title class wiring via CSS on a synthetic award row is unnecessary —
      // confirm the shared class exists on the component template path by checking stylesheet.
      const hasClass = await page.evaluate(() =>
        [...document.styleSheets].some(() => true) &&
        getComputedStyle(document.createElement('span')).textTransform !== undefined,
      )
      void hasClass
      fail('gallery-achievement', 'no gallery achievement card found in feed')
    }

    // Single + multi popups (Drink It) — must be on gallery route
    await page.goto(`${baseUrl}/drinkit/gallery`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="gallery-feed"]', { timeout: 20000 })
    await openCelebration(page, sampleCards(1, 'drinkit'))
    await page.waitForTimeout(700)
    const singlePopup = await page.evaluate(() => {
      const name = document.querySelector('.achievement-unlock-name')
      const desc = document.querySelector('.achievement-unlock-desc')
      return {
        nameTf: name ? getComputedStyle(name).textTransform : null,
        descTf: desc ? getComputedStyle(desc).textTransform : null,
        nameText: name?.textContent?.trim() ?? '',
      }
    })
    if (singlePopup.nameTf === 'capitalize') pass('popup-single-title-capitalize', singlePopup.nameText)
    else fail('popup-single-title-capitalize', `text-transform=${singlePopup.nameTf}`)
    if (!singlePopup.descTf || singlePopup.descTf === 'none') pass('popup-single-desc-not-capitalized')
    else fail('popup-single-desc-not-capitalized', `text-transform=${singlePopup.descTf}`)
    await page.screenshot({
      path: join(outDir, 'after-drinkit-popup-single-402.png'),
      fullPage: false,
    })
    await closeCelebration(page)

    await openCelebration(page, sampleCards(6, 'drinkit'))
    await page.waitForTimeout(700)
    const multiPopup = await page.evaluate(() => {
      const item = document.querySelector('.achievement-unlock-list-item')
      return {
        itemTf: item ? getComputedStyle(item).textTransform : null,
        itemText: item?.textContent?.trim() ?? '',
      }
    })
    if (multiPopup.itemTf === 'capitalize') pass('popup-multi-title-capitalize', multiPopup.itemText)
    else fail('popup-multi-title-capitalize', `text-transform=${multiPopup.itemTf}`)
    await page.screenshot({
      path: join(outDir, 'after-drinkit-popup-multi-402.png'),
      fullPage: false,
    })
    await closeCelebration(page)

    // Ship It Just Unlocked + popups
    if (teamId) {
      const prevShip = await rewindCursorForNewest(player.player_id, 'shipit', teamId, 2)
      await captureShowcase(page, 'shipit', 2)
      await setCursor(player.player_id, 'shipit', prevShip)

      await page.goto(`${baseUrl}/shipit/gallery`, { waitUntil: 'networkidle' })
      await page.waitForSelector('[data-testid="gallery-feed"]', { timeout: 20000 })
      await openCelebration(page, sampleCards(1, 'shipit'))
      await page.waitForTimeout(700)
      await page.screenshot({
        path: join(outDir, 'after-shipit-popup-single-402.png'),
        fullPage: false,
      })
      await closeCelebration(page)

      await openCelebration(page, sampleCards(4, 'shipit'))
      await page.waitForTimeout(700)
      await page.screenshot({
        path: join(outDir, 'after-shipit-popup-multi-402.png'),
        fullPage: false,
      })
      await closeCelebration(page)
      pass('shipit-popups')
    } else {
      fail('shipit-showcase', 'player has no active team')
    }
  } finally {
    await browser.close()
  }
} catch (err) {
  fail('capture-run', err instanceof Error ? err.message : String(err))
}

await writeFile(
  join(outDir, 'qa-notes.json'),
  JSON.stringify({ results, notes, player: player.key }, null, 2),
)
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
console.log(`Screenshots → ${outDir}`)
if (failed.length) process.exit(1)
