/**
 * Daily Challenge step scroll-reset QA.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/qa-daily-step-scroll.mjs [baseUrl]
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'
import ws from 'ws'
import { acceptPhotoFraming } from './lib/acceptPhotoFraming.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'docs/daily-step-scroll')
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

mkdirSync(outDir, { recursive: true })

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

async function alignDay(cruiseDay) {
  execSync(`node scripts/seed-local-bounty-now.mjs --day=${cruiseDay} --hour=13`, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, LOCAL_TEST_PASSWORD: password },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await service.rpc('dev_seed_daily_assignments')
}

async function clearClaim() {
  await service.from('bounty_claims').delete().eq('player_id', player.player_id).eq('category', 'daily')
}

async function login(page) {
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
  await page.selectOption('#login-name', { label: player.display_name })
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
}

async function pageScrollY(page) {
  return page.evaluate(() => {
    const se = document.scrollingElement || document.documentElement
    return {
      scrollingElement: se?.scrollTop ?? -1,
      documentElement: document.documentElement.scrollTop,
      body: document.body.scrollTop,
      windowY: window.scrollY,
    }
  })
}

function nearTop(scroll) {
  return (
    scroll.scrollingElement <= 2 &&
    scroll.documentElement <= 2 &&
    scroll.body <= 2 &&
    scroll.windowY <= 2
  )
}

async function headingVisible(page, testId) {
  return page.locator(`[data-testid="${testId}"]`).evaluate((el) => {
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.top < window.innerHeight * 0.55 && r.bottom > 0
  })
}

const report = { phase: 'daily-step-scroll', cases: {} }
const browser = await chromium.launch({ headless: true })

for (const vp of widths) {
  await clearClaim()
  await alignDay(1)
  const context = await browser.newContext({
    ...devices['iPhone 12'],
    viewport: { width: vp.width, height: vp.height },
  })
  const page = await context.newPage()
  await login(page)

  await page.goto(`${baseUrl}/drinkit/daily?ts=${Date.now()}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="daily-confirm-step"]', { timeout: 20000 })

  // Details → Photo: should land at top
  await page.click('[data-testid="daily-confirm-yes"]')
  await page.waitForSelector('[data-testid="daily-capture-step"]')
  await page.waitForTimeout(120)
  const afterDetailsToPhoto = await pageScrollY(page)
  const photoHeadingVisible = await headingVisible(page, 'daily-photo-title')

  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(landscape)
  await acceptPhotoFraming(page)
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })

  // Force scrollable Photo height (fixture photo is tiny), then scroll down.
  await page.evaluate(() => {
    const step = document.querySelector('[data-testid="daily-capture-step"]')
    if (step instanceof HTMLElement) step.style.minHeight = '1600px'
  })
  await page.locator('[data-testid="daily-caption"]').scrollIntoViewIfNeeded()
  await page.evaluate(() => {
    const se = document.scrollingElement || document.documentElement
    se.scrollTop = 520
    window.scrollTo(0, 520)
  })
  await page.fill('[data-testid="daily-caption"]', `Scroll QA ${vp.name}`)
  await page.waitForTimeout(80)
  const scrolledOnPhoto = await pageScrollY(page)

  // Photo → Review: must reset to top
  await page.click('[data-testid="daily-continue-review"]')
  await page.waitForSelector('[data-testid="daily-review-step"]')
  await page.waitForTimeout(150)
  const afterPhotoToReview = await pageScrollY(page)
  const reviewHeadingVisible = await headingVisible(page, 'daily-review-title')
  const previewVisible = await headingVisible(page, 'review-gallery-preview')
  await page.screenshot({
    path: join(outDir, `01-photo-to-review-top-${vp.name}.png`),
    fullPage: false,
  })

  // Review → Edit Caption: focus caption (may scroll to field)
  await page.click('[data-testid="review-edit-caption"]')
  await page.waitForSelector('[data-testid="daily-caption"]')
  await page.waitForTimeout(150)
  const captionFocused = await page.locator('[data-testid="daily-caption"]').evaluate(
    (el) => document.activeElement === el,
  )
  const captionInView = await page.locator('[data-testid="daily-caption"]').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return r.top < window.innerHeight && r.bottom > 0
  })
  await page.screenshot({
    path: join(outDir, `02-edit-caption-focus-${vp.name}.png`),
    fullPage: false,
  })

  // Caption → Review again: top
  await page.fill('[data-testid="daily-caption"]', `After edit ${vp.name}`)
  await page.click('[data-testid="daily-continue-review"]')
  await page.waitForSelector('[data-testid="daily-review-step"]')
  await page.waitForTimeout(150)
  const afterCaptionToReview = await pageScrollY(page)
  const reviewHeadingVisible2 = await headingVisible(page, 'daily-review-title')

  // Review → Photo (via Add Caption path already tested); use Exit? instead go via edit photo framing cancel stays.
  // Backward: from Review open framing cancel stays on review. Use edit caption then... we need confirm←capture.
  // Daily has no explicit back from capture to confirm in UI easily; Exit is home.
  // Simulate Review → Photo without caption focus by clicking edit photo? That opens editor overlay.
  // Use evaluate to set step? Better: click Add Caption was caption focus. For non-focus photo return:
  // Go edit caption, then we already tested. For "start at top unless edit caption":
  // Navigate by clicking photo pencil cancel stays. Skip dedicated back-without-focus if no control.
  // Use daily-exit is home - not step back.

  // Ordinary Drink It! wizard still resets Photo → Review
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
  await page.locator('[data-testid="caption-input"]').scrollIntoViewIfNeeded()
  await page.fill('[data-testid="caption-input"]', 'Wizard scroll check')
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="wizard-review-step"]')
  await page.waitForTimeout(150)
  const wizardReviewScroll = await pageScrollY(page)
  const wizardReviewHeadingVisible = await headingVisible(page, 'wizard-review-step')

  report.cases[vp.name] = {
    afterDetailsToPhoto: { ...afterDetailsToPhoto, nearTop: nearTop(afterDetailsToPhoto), photoHeadingVisible },
    scrolledOnPhoto: { ...scrolledOnPhoto, wasScrolled: scrolledOnPhoto.windowY > 40 || scrolledOnPhoto.scrollingElement > 40 },
    afterPhotoToReview: {
      ...afterPhotoToReview,
      nearTop: nearTop(afterPhotoToReview),
      reviewHeadingVisible,
      previewVisible,
    },
    editCaption: { captionFocused, captionInView },
    afterCaptionToReview: {
      ...afterCaptionToReview,
      nearTop: nearTop(afterCaptionToReview),
      reviewHeadingVisible: reviewHeadingVisible2,
    },
    ordinaryWizard: {
      ...wizardReviewScroll,
      nearTop: nearTop(wizardReviewScroll),
      headingVisible: wizardReviewHeadingVisible,
    },
  }

  const ok =
    nearTop(afterDetailsToPhoto) &&
    photoHeadingVisible &&
    (scrolledOnPhoto.windowY > 40 || scrolledOnPhoto.scrollingElement > 40) &&
    nearTop(afterPhotoToReview) &&
    reviewHeadingVisible &&
    previewVisible &&
    captionFocused &&
    captionInView &&
    nearTop(afterCaptionToReview) &&
    reviewHeadingVisible2 &&
    nearTop(wizardReviewScroll) &&
    wizardReviewHeadingVisible

  report.cases[vp.name].pass = ok
  console.log(vp.name, ok ? 'PASS' : 'FAIL', JSON.stringify(report.cases[vp.name], null, 2))
  await context.close()
}

await browser.close()
writeFileSync(join(outDir, 'qa-report.json'), JSON.stringify(report, null, 2))
const allPass = Object.values(report.cases).every((c) => c.pass)
console.log(allPass ? 'PASS daily-step-scroll' : 'FAIL daily-step-scroll', outDir)
process.exit(allPass ? 0 : 1)
