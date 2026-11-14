/**
 * Phase V5C — Daily Challenge Review visual fidelity screenshots.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-v5c-daily-review.mjs [baseUrl]
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'
import ws from 'ws'
import { acceptPhotoFraming } from './lib/acceptPhotoFraming.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'docs/v5c-daily-review')
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  readFileSync(join(root, '.local/runtime-qual-password.txt'), 'utf8').trim()
const baseUrl = process.argv[2] || 'http://localhost:5173'
const landscape = join(root, 'tests/fixtures/landscape.jpg')
const widths = [
  { name: '360', width: 360, height: 800 },
  { name: '402', width: 402, height: 874 },
  { name: '430', width: 430, height: 932 },
]

if (!password) {
  console.error('Set LOCAL_TEST_PASSWORD or .local/runtime-qual-password.txt')
  process.exit(1)
}

mkdirSync(join(outDir, 'before'), { recursive: true })
mkdirSync(join(outDir, 'after'), { recursive: true })

for (const [src, dest] of [
  ['docs/phase4b3-screenshots/phase4b3-LIVE-daily-review.png', 'before/daily-review-legacy.png'],
  ['docs/review-gallery-preview/02-review-with-photo.png', 'before/ordinary-drinkit-review-402.png'],
  ['docs/daily-visual-fixes/before/confirm-402.png', 'before/details-legacy-ref.png'],
]) {
  try {
    copyFileSync(join(root, src), join(outDir, dest))
  } catch {
    /* optional baseline */
  }
}

function readSupabaseEnv() {
  try {
    const envText = execSync('npx supabase status -o env', {
      encoding: 'utf8',
      env: { ...process.env, DO_NOT_TRACK: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return {
      apiUrl: envText.match(/^API_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, ''),
      serviceKey: envText.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, ''),
    }
  } catch {
    return {
      apiUrl: 'http://127.0.0.1:54321',
      serviceKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
    }
  }
}

const { apiUrl, serviceKey } = readSupabaseEnv()
const service = createClient(apiUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

const summary = JSON.parse(readFileSync(join(root, '.local/test-identities.json'), 'utf8'))
const player =
  summary.identities.find((i) => i.key === 'josh_forrester') ||
  summary.identities.find((i) => !i.is_admin && (i.games || []).includes('drinkit'))
if (!player) throw new Error('No Drink It! player')

async function alignDay(cruiseDay) {
  execSync(`node scripts/seed-local-bounty-now.mjs --day=${cruiseDay} --hour=13`, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, LOCAL_TEST_PASSWORD: password },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await service.rpc('dev_seed_daily_assignments')
  const check = await service.rpc('dev_get_current_daily_challenge_at', {
    p_at_utc: new Date().toISOString(),
  })
  if (check.error) throw check.error
  if (check.data?.cruise_day !== cruiseDay) {
    throw new Error(`alignDay(${cruiseDay}) got day ${check.data?.cruise_day}`)
  }
  return check.data
}

async function clearPlayerDailyClaim() {
  const { error } = await service
    .from('bounty_claims')
    .delete()
    .eq('player_id', player.player_id)
    .eq('category', 'daily')
  if (error) throw error
}

async function login(page, displayName) {
  await page.context().clearCookies()
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
  })
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-name', { timeout: 20000 })
  await page.selectOption('#login-name', { label: displayName })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
}

async function gotoDailyConfirm(page) {
  await page.goto(`${baseUrl}/drinkit/daily?ts=${Date.now()}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="daily-claim-page"]', { timeout: 20000 })
  await page.waitForSelector('[data-testid="daily-confirm-step"]', { timeout: 20000 })
}

async function reachReview(page, { caption = 'Cheers from the Lido' } = {}) {
  await gotoDailyConfirm(page)
  await page.click('[data-testid="daily-confirm-yes"]')
  await page.waitForSelector('[data-testid="daily-capture-step"]', { timeout: 15000 })
  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(landscape)
  await acceptPhotoFraming(page)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  if (caption) {
    await page.fill('[data-testid="daily-caption"]', caption)
  } else {
    await page.fill('[data-testid="daily-caption"]', '')
  }
  await page.click('[data-testid="daily-continue-review"]')
  await page.waitForSelector('[data-testid="daily-review-step"]', { timeout: 15000 })
  await page.waitForSelector('[data-testid="review-gallery-preview"]', { timeout: 10000 })
}

async function shot(page, rel, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.waitForTimeout(280)
  await page.screenshot({ path: join(outDir, rel), fullPage: false })
  console.log('wrote', rel)
}

async function inspectReview(page) {
  const body = await page.locator('[data-testid="daily-review-step"]').innerText()
  const titleCount = (body.match(/Tequila Shot/g) || []).length
  const points = (await page.locator('[data-testid="daily-review-points"]').textContent())?.trim()
  const challengeTitle = (
    await page.locator('[data-testid="daily-review-challenge-title"]').textContent()
  )?.trim()
  const hasPolaroid = (await page.locator('.gallery-polaroid').count()) > 0
  const hasPhotoImage = (await page.locator('[data-testid="review-photo-image"]').count()) > 0
  const hasEditPhoto = (await page.locator('[data-testid="review-edit-photo"]').count()) > 0
  const hasSubmit = (await page.locator('[data-testid="daily-submit"]').count()) > 0
  const hasOldDailyPanel = /DAILY CHALLENGE/i.test(body) && /PHOTO/i.test(body) && /POINTS/i.test(body)
  const hasSwitch = (await page.locator('[data-testid="switch-game"]').count()) > 0
  const hasShipTime = (await page.locator('[data-testid="ship-time-indicator"]').count()) > 0
  const submitBox = await page.locator('[data-testid="daily-submit"]').boundingBox()
  const navBox = await page.locator('.floating-bottom-nav').boundingBox().catch(() => null)
  const submitAboveNav =
    !!submitBox && !!navBox ? submitBox.y + submitBox.height <= navBox.y + 8 : null
  return {
    titleCount,
    points,
    challengeTitle,
    hasPolaroid,
    hasPhotoImage,
    hasEditPhoto,
    hasSubmit,
    hasOldDailyPanel,
    hasSwitch,
    hasShipTime,
    submitAboveNav,
    bodySnippet: body.replace(/\s+/g, ' ').trim().slice(0, 220),
  }
}

const report = { phase: 'V5C', player: player.key, cases: {} }

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  ...devices['iPhone 12'],
  viewport: { width: 402, height: 874 },
})
const page = await context.newPage()
await login(page, player.display_name)

await alignDay(1)
await clearPlayerDailyClaim()

// 1) Review with photo + caption
await reachReview(page, { caption: 'Cheers from the Lido' })
report.cases.withCaption = await inspectReview(page)
await shot(page, 'after/01-review-with-caption-402.png', widths[1])
for (const vp of [widths[0], widths[2]]) {
  await shot(page, `after/01-review-with-caption-${vp.name}.png`, vp)
}

// Full screen including submit + bottom nav
await page.setViewportSize({ width: 402, height: 874 })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(250)
await page.screenshot({ path: join(outDir, 'after/06-full-screen-submit-nav-402.png'), fullPage: false })
console.log('wrote after/06-full-screen-submit-nav-402.png')
report.cases.fullScreen = await inspectReview(page)

// 2) No caption
await clearPlayerDailyClaim()
await reachReview(page, { caption: '' })
const noCaptionAdd = (await page.locator('[data-testid="review-add-caption"]').count()) > 0
report.cases.noCaption = { ...(await inspectReview(page)), hasAddCaption: noCaptionAdd }
await shot(page, 'after/02-review-no-caption-402.png', widths[1])

// Caption edit pencil → capture focus
await page.click('[data-testid="review-add-caption"]')
await page.waitForSelector('[data-testid="daily-caption"]', { timeout: 10000 })
const captionFocused = await page.locator('[data-testid="daily-caption"]').evaluate(
  (el) => document.activeElement === el,
)
report.cases.captionEditFocus = { focused: captionFocused }
await shot(page, 'after/02b-caption-edit-focus-402.png', widths[1])
await page.fill('[data-testid="daily-caption"]', 'Back from caption edit')
await page.click('[data-testid="daily-continue-review"]')
await page.waitForSelector('[data-testid="daily-review-step"]')

// 3) Framing adjust
await page.click('[data-testid="review-edit-photo"]')
await page.waitForSelector('[data-testid="photo-framing-editor"]', { timeout: 10000 })
await shot(page, 'after/03-framing-editor-402.png', widths[1])
await page.click('[data-testid="photo-framing-use"]')
await page.waitForSelector('[data-testid="daily-review-step"]', { timeout: 10000 })
report.cases.afterFraming = await inspectReview(page)
await shot(page, 'after/03-review-after-framing-402.png', widths[1])

// 4) Long challenge title (day 2 often longer) + long caption
await clearPlayerDailyClaim()
await alignDay(2)
await clearPlayerDailyClaim()
const longCaption =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.'
await reachReview(page, { caption: longCaption })
const longTitle = (
  await page.locator('[data-testid="daily-review-challenge-title"]').textContent()
)?.trim()
const titleOccurrences = (
  (await page.locator('[data-testid="daily-review-step"]').innerText()).match(
    new RegExp(longTitle?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || '___', 'g'),
  ) || []
).length
report.cases.longTitle = {
  title: longTitle,
  titleOccurrences,
  ...(await inspectReview(page)),
}
await shot(page, 'after/04-review-long-title-402.png', widths[1])
for (const vp of [widths[0], widths[2]]) {
  await shot(page, `after/04-review-long-title-${vp.name}.png`, vp)
}

// 5) Long caption close-up already covered; dedicated shot
await shot(page, 'after/05-review-long-caption-402.png', widths[1])
for (const vp of [widths[0], widths[2]]) {
  await shot(page, `after/05-review-long-caption-${vp.name}.png`, vp)
}

// Ordinary Drink It! Review comparison at 402
await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="bar-list"]', { timeout: 20000 })
await page.locator('[data-testid^="bar-row-"]').first().click()
await page.waitForSelector('[data-testid="wizard-drink-step"]')
await page.click('[data-testid="drink-generic-beer"]')
await page.waitForSelector('[data-testid="wizard-friends-step"]')
await page.click('[data-testid="friends-continue"]')
await page.waitForSelector('[data-testid="wizard-photo-step"]')
await page.locator('[data-testid="photo-upload-input"]').setInputFiles(landscape)
await acceptPhotoFraming(page)
await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
await page.fill('[data-testid="caption-input"]', 'Ordinary review compare')
await page.click('[data-testid="photo-continue"]')
await page.waitForSelector('[data-testid="review-gallery-preview"]')
await shot(page, 'after/07-ordinary-drinkit-review-402.png', widths[1])
report.cases.ordinaryCompare = {
  hasPolaroid: (await page.locator('.gallery-polaroid').count()) > 0,
  hasEditPhoto: (await page.locator('[data-testid="review-edit-photo"]').count()) > 0,
}

await browser.close()
await alignDay(1)

writeFileSync(join(outDir, 'qa-report.json'), JSON.stringify(report, null, 2))
writeFileSync(
  join(outDir, 'README.md'),
  `# Phase V5C — Daily Challenge Review visual fidelity

Rebuilds Daily Challenge Review to match ordinary Drink It! Review + Gallery Polaroid preview.

## Structure
1. Review Your Challenge heading
2. Magenta points pill (dynamic)
3. Gallery-style Polaroid post preview (title once, venue, player, caption)
4. Submit Challenge CTA

## Shared components
- \`FramedPhoto\`
- \`PhotoFramingEditor\`
- \`gallery-polaroid\` / \`gallery-drink-post\` / review edit chips
- Magenta points pill treatment (same as Details)
- Teal \`ui-primary-btn\`

## Screenshots
See \`after/\` and \`before/\`. Compare \`01-review-with-caption-402.png\` with \`07-ordinary-drinkit-review-402.png\`.
`,
  'utf8',
)

console.log(JSON.stringify(report, null, 2))
console.log('PASS v5c-daily-review →', outDir)
