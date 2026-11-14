/**
 * Photo upload UX simplification screenshots (402px).
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-photo-ux-simplify.mjs
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
  summary.identities.find((i) => (i.games || []).includes('drinkit') && (i.games || []).includes('shipit'))

const outDir = join(root, 'docs/photo-ux-simplify')
await mkdir(outDir, { recursive: true })
const landscape = join(root, 'tests/fixtures/landscape.jpg')

const browser = await chromium.launch({ headless: true })

async function shot(page, name) {
  const path = join(outDir, name)
  await page.screenshot({ path, fullPage: false })
  console.log('wrote', name)
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.locator('#login-name').selectOption({ label: player.display_name })
  await page.locator('#login-password').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !new URL(u).pathname.endsWith('/login'), { timeout: 20000 })
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
    await run(page)
  } finally {
    await context.close()
  }
}

await withWidth(402, async (page) => {
  await login(page)
  await drinkPhotoStep(page)
  await shot(page, '01-drinkit-empty.png')

  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(landscape)
  await acceptPhotoFraming(page)
  await page.waitForSelector('[data-testid="photo-preview"]', { timeout: 20000 })
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  await shot(page, '02-drinkit-accepted.png')

  await page.fill('[data-testid="caption-input"]', 'Sunset beer with the crew')
  await shot(page, '03-drinkit-caption-filled.png')

  // Adjust cancel preserves photo
  await page.click('[data-testid="photo-adjust"]')
  await page.waitForSelector('[data-testid="photo-framing-editor"]')
  await page.click('[data-testid="photo-framing-cancel"]')
  await page.waitForSelector('[data-testid="photo-preview"]')
  if (!(await page.locator('[data-testid="photo-preview"]').count())) {
    throw new Error('Adjust Cancel discarded accepted photo')
  }
  console.log('ok adjust-cancel-preserves')
})

await withWidth(402, async (page) => {
  await login(page)
  await page.goto(`${baseUrl}/shipit/challenges`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="shipit-challenge-list"]', { timeout: 20000 })
  const openChallenge = page.locator('[data-testid^="shipit-challenge-"][data-actionable="true"]').first()
  await openChallenge.waitFor({ state: 'visible', timeout: 20000 })
  await openChallenge.click()
  await page.waitForURL(/\/shipit\/challenges\/.+\/submit/, { timeout: 20000 })
  await page.waitForSelector('[data-testid="photo-capture"]', { timeout: 20000 })
  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(landscape)
  await acceptPhotoFraming(page)
  await page.waitForSelector('[data-testid="photo-preview"]', { timeout: 20000 })
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  await shot(page, '04-shipit-accepted.png')
})

// Quick layout smoke at 360 / 430
for (const width of [360, 430]) {
  await withWidth(width, async (page) => {
    await login(page)
    await drinkPhotoStep(page)
    await page.locator('[data-testid="photo-upload-input"]').setInputFiles(landscape)
    await acceptPhotoFraming(page)
    await page.waitForSelector('[data-testid="photo-preview"]', { timeout: 20000 })
    await shot(page, `05-drinkit-accepted-${width}.png`)
  })
}

await writeFile(
  join(outDir, 'RESULTS.md'),
  `# Photo upload UX simplification

- Text link actions: Adjust · Retake · Replace / Remove photo
- No standing “Photo uploaded securely” or format/resizing instructions
- Caption: **Add a Caption — Optional** with new placeholder

Screens at 402px; layout smoke at 360/430.
`,
  'utf8',
)

await browser.close()
console.log('done', outDir)
