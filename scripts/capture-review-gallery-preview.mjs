/**
 * Drink It! Review gallery-preview screenshots.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-review-gallery-preview.mjs
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
const player = summary.identities.find((i) => i.key === 'josh_forrester')
const landscape = join(root, 'tests/fixtures/landscape.jpg')
const outDir = join(root, 'docs/review-gallery-preview')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })

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

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.locator('#login-name').selectOption({ label: player.display_name })
  await page.locator('#login-password').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !new URL(u).pathname.endsWith('/login'), { timeout: 20000 })
}

async function toPhoto(page) {
  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bar-list"]')
  await page.locator('[data-testid^="bar-row-"]').first().click()
  await page.waitForSelector('[data-testid="wizard-drink-step"]')
  await page.click('[data-testid="drink-generic-beer"]')
  await page.waitForSelector('[data-testid="wizard-friends-step"]')
  await page.click('[data-testid="friends-continue"]')
  await page.waitForSelector('[data-testid="wizard-photo-step"]')
}

await withWidth(402, async (page) => {
  await login(page)
  await toPhoto(page)
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="wizard-review-step"]')
  await page.screenshot({ path: join(outDir, '01-review-no-photo.png'), fullPage: false })
  console.log('wrote 01-review-no-photo.png')

  await page.click('[data-testid="review-add-photo"]')
  await page.waitForSelector('[data-testid="wizard-photo-step"]')
  await page.locator('[data-testid="photo-upload-input"]').setInputFiles(landscape)
  await acceptPhotoFraming(page)
  await page.waitForSelector('[data-testid="photo-preview"]', { timeout: 20000 })
  await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
  await page.fill('[data-testid="caption-input"]', 'Gallery preview check')
  await page.click('[data-testid="photo-continue"]')
  await page.waitForSelector('[data-testid="review-gallery-preview"]')
  await page.screenshot({ path: join(outDir, '02-review-with-photo.png'), fullPage: false })
  console.log('wrote 02-review-with-photo.png')

  await page.click('[data-testid="review-edit-photo"]')
  await page.waitForSelector('[data-testid="photo-framing-editor"]')
  await page.screenshot({ path: join(outDir, '03-review-edit-framing.png'), fullPage: false })
  console.log('wrote 03-review-edit-framing.png')
  await page.click('[data-testid="photo-framing-cancel"]')
  await page.waitForSelector('[data-testid="review-gallery-preview"]')

  await page.click('[data-testid="review-edit-caption"]')
  await page.waitForSelector('[data-testid="caption-input"]')
  const focused = await page.locator('[data-testid="caption-input"]').evaluate(
    (el) => document.activeElement === el,
  )
  console.log('caption-focused', focused)
  await page.screenshot({ path: join(outDir, '04-review-edit-caption-focus.png'), fullPage: false })
  console.log('wrote 04-review-edit-caption-focus.png')
})

for (const width of [360, 430]) {
  await withWidth(width, async (page) => {
    await login(page)
    await toPhoto(page)
    await page.locator('[data-testid="photo-upload-input"]').setInputFiles(landscape)
    await acceptPhotoFraming(page)
    await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 })
    await page.fill('[data-testid="caption-input"]', 'Width check')
    await page.click('[data-testid="photo-continue"]')
    await page.waitForSelector('[data-testid="review-gallery-preview"]')
    await page.screenshot({
      path: join(outDir, `05-review-${width}.png`),
      fullPage: false,
    })
    console.log('wrote', `05-review-${width}.png`)
  })
}

await writeFile(
  join(outDir, 'RESULTS.md'),
  `# Drink It! Review — Gallery post preview

- Polaroid-style preview with framed photo, drink, bar, player, caption
- Pencil opens existing framing editor / caption field on Photo step
- No-photo uses branded placeholder + Add a photo
`,
  'utf8',
)

await browser.close()
console.log('done', outDir)
