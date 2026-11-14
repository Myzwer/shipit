/**
 * Phase S5 — Ship It! two-step submission wizard visual QA.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-phase-s5-shipit-submit.mjs [baseUrl]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { acceptPhotoFraming } from './lib/acceptPhotoFraming.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')
const baseUrl = process.argv[2] ?? 'http://localhost:5173'
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  (await readFile(join(root, '.local/runtime-qual-password.txt'), 'utf8')).trim()
const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const player =
  summary.identities.find((i) => i.key === 'josh_forrester') ||
  summary.identities.find(
    (i) => (i.games || []).includes('drinkit') && (i.games || []).includes('shipit'),
  )

const outDir = join(root, 'docs/phase-s5-shipit-submit')
await mkdir(outDir, { recursive: true })
const landscape = join(root, 'tests/fixtures/landscape.jpg')
const results = []

function pass(name, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail) {
  results.push({ name, ok: false, detail })
  console.error(`FAIL ${name}: ${detail}`)
}

const browser = await chromium.launch({ headless: true })

async function shot(page, name, fullPage = false) {
  const path = join(outDir, name)
  await page.screenshot({ path, fullPage })
  console.log('wrote', name)
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.locator('#login-name').selectOption({ label: player.display_name })
  await page.locator('#login-password').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !new URL(u).pathname.endsWith('/login'), { timeout: 20000 })
}

async function openShipSubmit(page) {
  await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="shipit-challenge-list"]', { timeout: 20000 })
  const openChallenge = page
    .locator('[data-testid^="shipit-challenge-"][data-actionable="true"]')
    .first()
  await openChallenge.waitFor({ state: 'visible', timeout: 20000 })
  await openChallenge.click()
  await page.waitForSelector('[data-testid="scavenger-submit-page"]', { timeout: 20000 })
  await page.waitForSelector('[data-testid="scavenger-capture-step"]', { timeout: 20000 })
}

async function drinkPhotoStep(page) {
  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bar-list"]')
  await page.locator('[data-testid^="bar-row-"]').first().click()
  await page.waitForSelector('[data-testid="wizard-drink-step"]')
  await page.click('[data-testid="drink-generic-beer"]')
  await page.waitForSelector('[data-testid="wizard-friends-step"]')
  await page.click('[data-testid="friends-continue"]')
  await page.waitForSelector('[data-testid="wizard-photo-step"]')
}

async function withWidth(width, run) {
  const context = await browser.newContext({
    viewport: { width, height: 874 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  try {
    await run(page, width)
  } finally {
    await context.close()
  }
}

const widths = [360, 390, 402, 430]

try {
  // Primary visual pass at 402, plus width sweep for empty upload
  await withWidth(402, async (page) => {
    await login(page)
    await openShipSubmit(page)

    // 1. Upload without photo
    await shot(page, '01-upload-empty-402.png')
    const cont = page.locator('[data-testid="scavenger-continue-review"]')
    if (await cont.isEnabled()) throw new Error('Continue enabled without photo')
    pass('photo-required-continue-disabled')
    const requiredHint = page.locator('[data-testid="photo-required-hint"]')
    if (!(await requiredHint.count())) throw new Error('missing photo-required-hint')
    pass('photo-required-hint')

    // Progress: two segments
    const progress = page.locator('[data-testid="wizard-progress"]')
    if (!(await progress.count())) throw new Error('missing wizard progress')
    const photoSeg = page.locator('[data-testid="wizard-step-photo"]')
    const reviewSeg = page.locator('[data-testid="wizard-step-review"]')
    if ((await photoSeg.getAttribute('data-active')) !== 'true') {
      throw new Error('photo step not active')
    }
    if (await reviewSeg.isEnabled()) throw new Error('review step should be disabled without photo')
    pass('progress-two-segments')

    // No ship time row
    if (await page.locator('[data-testid="ship-time-indicator"]').count()) {
      throw new Error('ship time indicator still visible')
    }
    pass('no-ship-time-row')

    // 2. Framing overlay
    await page.locator('[data-testid="photo-upload-input"]').setInputFiles(landscape)
    await page.waitForSelector('[data-testid="photo-framing-editor"]', { timeout: 20000 })
    await shot(page, '02-framing-overlay-402.png')
    await acceptPhotoFraming(page)
    await page.waitForSelector('[data-testid="photo-preview"]', { timeout: 20000 })
    await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
    pass('framing-accept')

    // 3. Accepted photo controls
    await shot(page, '03-accepted-photo-402.png')
    for (const id of ['photo-adjust', 'photo-retake', 'photo-replace', 'photo-remove']) {
      if (!(await page.locator(`[data-testid="${id}"]`).count())) {
        throw new Error(`missing ${id}`)
      }
    }
    pass('accepted-photo-controls')

    // 4. Caption entered
    await page.fill('[data-testid="scavenger-caption"]', "What's the story behind this one? Deck find.")
    await shot(page, '04-caption-filled-402.png')
    pass('caption-entered')

    // Continue to review
    await cont.click()
    await page.waitForSelector('[data-testid="scavenger-review-step"]', { timeout: 10000 })
    if ((await reviewSeg.getAttribute('data-active')) !== 'true') {
      throw new Error('review step not active')
    }
    pass('review-step-reached')

    // 5. Gallery-style preview
    await shot(page, '05-review-preview-402.png')
    if (!(await page.locator('[data-testid="review-gallery-preview"]').count())) {
      throw new Error('missing gallery preview')
    }
    pass('review-gallery-preview')

    // 6. Selected challenge + team note
    await page.locator('[data-testid="selected-challenge-card"]').scrollIntoViewIfNeeded()
    await shot(page, '06-review-selected-challenge-402.png', true)
    const note = await page.locator('[data-testid="team-wide-completion-note"]').textContent()
    if (note?.trim() !== copyExactTeamNote()) {
      throw new Error(`team note mismatch: ${note}`)
    }
    pass('selected-challenge-and-team-note')

    // 7. Edit framing from review
    await page.locator('[data-testid="review-edit-photo"]').click()
    await page.waitForSelector('[data-testid="photo-framing-editor"]', { timeout: 10000 })
    await acceptPhotoFraming(page)
    await page.waitForSelector('[data-testid="scavenger-review-step"]')
    await shot(page, '07-review-after-framing-edit-402.png')
    pass('review-framing-edit')

    // Caption edit returns to upload + focuses
    await page.locator('[data-testid="review-edit-caption"]').click()
    await page.waitForSelector('[data-testid="scavenger-capture-step"]')
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') === 'scavenger-caption',
    )
    if (!focused) throw new Error('caption field not focused after edit caption')
    pass('caption-edit-focus')

    // Return to review via progress
    await page.locator('[data-testid="wizard-step-review"]').click()
    await page.waitForSelector('[data-testid="scavenger-review-step"]')
    pass('progress-tap-review')

    // Exit discard completes navigation
    await page.locator('[data-testid="wizard-exit"]').click()
    await page.waitForSelector('[data-testid="modal-exit"]')
    await page.locator('[data-testid="modal-primary"]').click()
    await page.waitForURL(/\/shipit\/challenges/, { timeout: 10000 })
    pass('exit-discard-navigates')
  })

  // Drink It! comparison shots
  await withWidth(402, async (page) => {
    await login(page)
    await drinkPhotoStep(page)
    await shot(page, 'compare-drinkit-photo-empty-402.png')
    await page.locator('[data-testid="photo-upload-input"]').setInputFiles(landscape)
    await acceptPhotoFraming(page)
    await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
    await page.fill('[data-testid="caption-input"]', 'Compare caption')
    await page.click('[data-testid="photo-continue"]')
    await page.waitForSelector('[data-testid="wizard-review-step"]')
    await shot(page, 'compare-drinkit-review-402.png', true)
    pass('drinkit-compare-shots')
  })

  for (const width of widths) {
    await withWidth(width, async (page) => {
      await login(page)
      await openShipSubmit(page)
      await shot(page, `upload-empty-${width}.png`)
      await page.locator('[data-testid="photo-upload-input"]').setInputFiles(landscape)
      await acceptPhotoFraming(page)
      await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
      await page.click('[data-testid="scavenger-continue-review"]')
      await page.waitForSelector('[data-testid="scavenger-review-step"]')
      await shot(page, `review-${width}.png`, true)
      pass(`width-${width}`)
    })
  }
} catch (err) {
  fail('capture-run', err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}

function copyExactTeamNote() {
  return 'Completing this challenge will complete it for your entire team.'
}

await writeFile(
  join(outDir, 'RESULTS.md'),
  [
    '# Phase S5 — Ship It! Submission Wizard',
    '',
    `Captured: ${new Date().toISOString()}`,
    '',
    '## Checks',
    ...results.map((r) => `- ${r.ok ? 'PASS' : 'FAIL'} **${r.name}**${r.detail ? `: ${r.detail}` : ''}`),
    '',
  ].join('\n'),
)

const failed = results.filter((r) => !r.ok)
if (failed.length) {
  console.error('FAILED', failed)
  process.exit(1)
}
console.log('All Phase S5 capture checks passed')
