/**
 * Photo framing deliverable screenshots.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-photo-framing.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { acceptPhotoFraming } from './lib/acceptPhotoFraming.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  (await readFile(join(root, '.local/runtime-qual-password.txt'), 'utf8')).trim()

const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const player =
  summary.identities.find((i) => i.key === 'josh_forrester') ||
  summary.identities.find((i) => (i.games || []).includes('drinkit'))

if (!player?.login_alias || !password) {
  console.error('Need Josh identity + LOCAL_TEST_PASSWORD')
  process.exit(1)
}

const outDir = join(root, 'docs/photo-framing')
await mkdir(outDir, { recursive: true })

const fixtureJpg = join(root, 'tests/fixtures/tiny.jpg')
// Prefer a landscape fixture if present for clearer pan demos.
const landscape = join(root, 'tests/fixtures/landscape.jpg')
const portrait = join(root, 'tests/fixtures/portrait.jpg')
const { access } = await import('node:fs/promises')
async function pick(path, fallback) {
  try {
    await access(path)
    return path
  } catch {
    return fallback
  }
}
const landscapeFile = await pick(landscape, fixtureJpg)
const portraitFile = await pick(portrait, fixtureJpg)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()

async function login() {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  })
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  const name = page.locator('#login-name, [data-testid="login-name"]')
  await name.selectOption({ label: player.display_name })
  await page.locator('#login-password, [data-testid="login-password"]').fill(password)
  await page.locator('button[type="submit"], [data-testid="login-submit"]').first().click()
  await page.waitForURL((url) => !new URL(url).pathname.endsWith('/login'), { timeout: 20000 })
}

async function openDrinkLogPhoto() {
  await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="log-wizard"]')
  await page.waitForSelector('[data-testid="bar-list"]')
  await page.locator('[data-testid^="bar-row-"]').first().click()
  await page.waitForSelector('[data-testid="wizard-drink-step"]')
  await page.click('[data-testid="drink-generic-beer"]')
  await page.waitForSelector('[data-testid="wizard-friends-step"]')
  await page.click('[data-testid="friends-continue"]')
  await page.waitForSelector('[data-testid="wizard-photo-step"]')
}

await login()
await openDrinkLogPhoto()

// Default framing overlay
await page.locator('[data-testid="photo-upload-input"]').setInputFiles(landscapeFile)
await page.waitForSelector('[data-testid="photo-framing-editor"]', { timeout: 15000 })
await page.screenshot({
  path: join(outDir, '01-editor-default.png'),
  fullPage: false,
})
console.log('wrote 01-editor-default.png')

// Adjusted framing: drag then zoom via wheel
const stage = page.locator('[data-testid="photo-framing-stage"]')
const box = await stage.boundingBox()
if (box) {
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.55, { steps: 12 })
  await page.mouse.up()
  await page.mouse.wheel(0, -400)
  await page.mouse.wheel(0, -400)
}
await page.screenshot({
  path: join(outDir, '02-editor-adjusted.png'),
  fullPage: false,
})
console.log('wrote 02-editor-adjusted.png')

await page.locator('[data-testid="photo-framing-use"]').click()
await page.waitForSelector('[data-testid="photo-preview"]', { timeout: 20000 })
await page.waitForSelector('[data-testid="photo-staged-ready"]', { timeout: 30000 }).catch(() => {})
await page.screenshot({
  path: join(outDir, '03-capture-preview-framed.png'),
  fullPage: false,
})
console.log('wrote 03-capture-preview-framed.png')

// Cancel preserves prior: open adjust, cancel
if (await page.locator('[data-testid="photo-adjust"]').count()) {
  await page.locator('[data-testid="photo-adjust"]').click()
  await page.waitForSelector('[data-testid="photo-framing-editor"]')
  await page.locator('[data-testid="photo-framing-cancel"]').click()
  await page.waitForSelector('[data-testid="photo-preview"]')
}

// Continue to review if possible
const continueBtn = page.locator('[data-testid="photo-continue"]')
if (await continueBtn.count()) {
  await continueBtn.click()
  await page.waitForTimeout(800)
  if (await page.locator('[data-testid="review-photo-preview"]').count()) {
    await page.screenshot({
      path: join(outDir, '04-review-framed.png'),
      fullPage: false,
    })
    console.log('wrote 04-review-framed.png')
  }
}

// Portrait upload path sanity
await page.goto(`${baseUrl}/drinkit/log`, { waitUntil: 'networkidle' })
await openDrinkLogPhoto()
await page.locator('[data-testid="photo-upload-input"]').setInputFiles(portraitFile)
await page.waitForSelector('[data-testid="photo-framing-editor"]', { timeout: 15000 })
await page.screenshot({
  path: join(outDir, '05-editor-portrait-default.png'),
  fullPage: false,
})
console.log('wrote 05-editor-portrait-default.png')
await acceptPhotoFraming(page)

await writeFile(
  join(outDir, 'RESULTS.md'),
  `# Photo framing captures

Generated against local Vite + Supabase.

- \`01-editor-default.png\` — default centered crop (Use Photo ready)
- \`02-editor-adjusted.png\` — after drag + wheel zoom
- \`03-capture-preview-framed.png\` — accepted square preview
- \`04-review-framed.png\` — Review (when wizard could advance)
- \`05-editor-portrait-default.png\` — portrait default framing

Original Storage object remains uncropped; Gallery thumbs use saved framing metadata.
`,
  'utf8',
)

await browser.close()
console.log('done', outDir)
