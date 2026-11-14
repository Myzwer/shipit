/**
 * Phase V6 — Drink It! Gallery companion attribution QA seed + captures.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-phase-v6-gallery-companions.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import ws from 'ws'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'docs/phase-v6-gallery-companions')
const baseUrl = process.argv[2] ?? 'http://localhost:5173'
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  (await readFile(join(root, '.local/runtime-qual-password.txt'), 'utf8')).trim()

if (!password || password.length < 12) {
  console.error('Set LOCAL_TEST_PASSWORD or .local/runtime-qual-password.txt')
  process.exit(1)
}

const envText = execSync('npx supabase status -o env', { encoding: 'utf8' })
const apiUrl = envText.match(/^API_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
const serviceKey = envText.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
const anonKey = envText.match(/^ANON_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))

const service = createClient(apiUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
})
const anon = createClient(apiUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
})

const author = summary.identities.find((i) => i.key === 'josh_forrester')
const pick = (name) => summary.identities.find((i) => i.display_name === name)

const { data: cruise } = await service
  .from('cruise_config')
  .select('*')
  .eq('is_active', true)
  .maybeSingle()
const day1 = cruise.day1_ship_date
const offsetMin = cruise.base_ship_offset_minutes
const noonDay4Local = new Date(`${day1}T12:00:00Z`)
noonDay4Local.setUTCDate(noonDay4Local.getUTCDate() + 3)
const atMs = noonDay4Local.getTime() - offsetMin * 60_000

const { data: logs } = await service.from('drink_logs').select('bar_canonical_key').limit(20)
const barKey = logs?.[0]?.bar_canonical_key || 'wake-view'

function payload(caption, companionIds) {
  return {
    idempotency_key: randomUUID(),
    bar_canonical_key: barKey,
    drink: { mode: 'generic_beer' },
    companion_player_ids: companionIds,
    bar_eligible_companion_ids: [],
    selected_claims: [],
    caption,
    photo_storage_key: null,
  }
}

const companionSets = {
  one: [pick('Aaron').player_id],
  three: [pick('Aaron').player_id, pick('Cindy').player_id, pick('David F.').player_id],
  many: ['Aaron', 'Cindy', 'David B.', 'David F.', 'Katie', 'Dan', 'Jordan', 'Jonathan', 'Mark', 'Lindsey'].map(
    (n) => pick(n).player_id,
  ),
}

const cases = [
  { caption: 'V6 solo — no companions recorded', companions: [] },
  { caption: 'V6 one companion check', companions: companionSets.one },
  {
    caption:
      "V6 three — Lol might be the second drink of the challenge but it's my fifth of the day! 😂",
    companions: companionSets.three,
  },
  {
    caption:
      'V6 long companion list wraps naturally across the polaroid meta without horizontal overflow',
    companions: companionSets.many,
  },
]

const submitResults = []
for (let i = 0; i < cases.length; i++) {
  const c = cases[i]
  const atI = new Date(atMs + (90 + i) * 60_000).toISOString()
  const res = await service.rpc('dev_submit_drink_at', {
    p_payload: payload(c.caption, c.companions),
    p_at_utc: atI,
    p_player_id: author.player_id,
  })
  submitResults.push({
    caption: c.caption.slice(0, 56),
    ok: res.data?.ok === true,
    code: res.data?.code ?? null,
    message: res.data?.message || res.error?.message || null,
    n: c.companions.length,
  })
}
console.log('submits', submitResults)

await anon.auth.signInWithPassword({ email: author.login_alias, password })
const { data: feed } = await anon.rpc('list_gallery_feed', {
  p_game: 'drinkit',
  p_filter: 'mine',
  p_limit: 20,
})
const v6Feed = (feed?.events || []).filter(
  (e) => e.kind === 'drink_log' && (e.caption || '').startsWith('V6'),
)
console.log(
  'v6 drink_log feed',
  v6Feed.map((e) => ({ companions: e.companion_names, caption: e.caption?.slice(0, 48) })),
)

await mkdir(join(outDir, 'before'), { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 402, height: 874 } })

async function login() {
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
  await page.selectOption('#login-name', { label: 'Josh' })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
}

async function openGallery(filter) {
  await page.goto(`${baseUrl}/drinkit/gallery`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="gallery-feed"]', { timeout: 20000 })
  if (filter === 'mine') {
    await page.locator('[data-testid="gallery-filter-mine"]').click()
    await page.waitForTimeout(900)
  }
  await page.waitForSelector('[data-testid="gallery-post"]', { timeout: 20000 })
  await page.waitForTimeout(600)
}

async function shotMatching(substr, file) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const all = page.locator('[data-testid="gallery-post"][data-kind="drink_log"]')
    const n = await all.count()
    for (let i = 0; i < n; i++) {
      const cap = await all
        .nth(i)
        .locator('[data-testid="gallery-post-caption"]')
        .textContent()
        .catch(() => '')
      if ((cap || '').includes(substr)) {
        await all.nth(i).scrollIntoViewIfNeeded()
        await page.waitForTimeout(250)
        await all.nth(i).screenshot({ path: join(outDir, file) })
        const companions = await all
          .nth(i)
          .locator('[data-testid="gallery-post-companions"]')
          .textContent()
          .catch(() => null)
        const overflow = await all.nth(i).evaluate((el) => el.scrollWidth > el.clientWidth + 1)
        const reactionAttached = await all.nth(i).locator('.gallery-react-row').count()
        return {
          companions,
          overflow,
          reactionAttached,
          caption: (cap || '').slice(0, 70),
        }
      }
    }
    // Infinite scroll / load-more
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5))
    await page.waitForTimeout(900)
    const more = page.getByRole('button', { name: /Load More|More/i })
    if (await more.count()) await more.click().catch(() => {})
  }
  return null
}

await login()
await openGallery('mine')
await page.addStyleTag({
  content: '[data-testid="gallery-post-companions"]{display:none !important}',
})
await page.screenshot({ path: join(outDir, 'before/mine-top-402.png'), fullPage: false })
await openGallery('mine')

const checks = {}
for (const [substr, file] of [
  ['V6 solo', 'after-solo-402.png'],
  ['V6 one companion', 'after-one-402.png'],
  ['V6 three', 'after-three-402.png'],
  ['V6 long', 'after-long-402.png'],
]) {
  checks[substr] = await shotMatching(substr, file)
}
console.log('checks', checks)

for (const vp of [
  { name: '360', width: 360, height: 740 },
  { name: '402', width: 402, height: 874 },
  { name: '430', width: 430, height: 932 },
]) {
  await page.setViewportSize(vp)
  await openGallery('everyone')
  await page.screenshot({ path: join(outDir, `everyone-top-${vp.name}.png`), fullPage: false })
  await openGallery('mine')
  await page.screenshot({ path: join(outDir, `mine-top-${vp.name}.png`), fullPage: false })
}

await page.setViewportSize({ width: 402, height: 874 })
await page.goto(`${baseUrl}/shipit/gallery`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="gallery-feed"]', { timeout: 20000 })
await page.waitForTimeout(700)
const shipCompanions = await page.locator('[data-testid="gallery-post-companions"]').count()
await page.screenshot({ path: join(outDir, 'shipit-preserved-402.png'), fullPage: false })

await openGallery('everyone')
const historical = await page.evaluate(() => {
  const posts = [...document.querySelectorAll('[data-testid="gallery-post"]')]
  for (const p of posts) {
    if (p.getAttribute('data-kind') !== 'drink_log') continue
    const companions = p.querySelector('[data-testid="gallery-post-companions"]')
    const caption = p.querySelector('[data-testid="gallery-post-caption"]')?.textContent || ''
    if (!companions && !caption.startsWith('V6')) {
      return { caption: caption.slice(0, 60), hasCompanions: false }
    }
  }
  return null
})

const summaryJson = {
  submitResults,
  checks,
  shipCompanions,
  historical,
  v6Feed: v6Feed.map((e) => ({
    owner: e.owner_player_name,
    companions: e.companion_names,
    caption: e.caption,
  })),
}

await writeFile(join(outDir, 'RESULTS.json'), JSON.stringify(summaryJson, null, 2))

const checkLines = Object.entries(checks)
  .map(([k, v]) =>
    v
      ? `- ${k}: companions="${v.companions}" overflow=${v.overflow} reactions=${v.reactionAttached}`
      : `- ${k}: NOT FOUND`,
  )
  .join('\n')
const feedLines = v6Feed
  .map(
    (e) =>
      `- **${e.owner_player_name}**: ${(e.companion_names || []).join(', ') || '(line omitted)'} — ${e.caption}`,
  )
  .join('\n')

await writeFile(
  join(outDir, 'RESULTS.md'),
  `# Phase V6 — Gallery Companion Attribution

## Contract
\`list_gallery_feed\` returns \`companion_names: string[]\` for drink_log events (authorized display names from recorded \`drink_log_companions\`). Empty when none / non-drink kinds.

## Feed samples
${feedLines || '_none_'}

## UI checks
${checkLines}

- Ship It! companion lines: ${shipCompanions}
- Historical non-V6 without companions still normal: ${JSON.stringify(historical)}
`,
)

await browser.close()
console.log('wrote', outDir)
