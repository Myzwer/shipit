/**
 * Drink It! photo preview refine — square crop + mint controls screenshots.
 *
 *   node scripts/capture-drinkit-photo-preview-refine.mjs
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

if (!password || password.length < 12) {
  console.error('Set LOCAL_TEST_PASSWORD or .local/runtime-qual-password.txt')
  process.exit(1)
}

const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const player =
  summary.identities.find((i) => i.key === 'josh_forrester') ||
  summary.identities.find((i) => Array.isArray(i.games) && i.games.includes('drinkit'))
if (!player) {
  console.error('Need a drinkit identity')
  process.exit(1)
}

const fixtureDir = join(root, '.local/visual-qa/photo-preview-refine/fixtures')
const outDir = join(root, 'docs/drinkit-photo-preview-refine')
await mkdir(outDir, { recursive: true })

const fixtures = [
  { key: 'portrait', file: join(fixtureDir, 'portrait.jpg') },
  { key: 'landscape', file: join(fixtureDir, 'landscape.jpg') },
  { key: 'square', file: join(fixtureDir, 'square.jpg') },
  { key: 'edge-people', file: join(fixtureDir, 'edge-people.jpg') },
]

const viewports = [
  { name: '360', width: 360, height: 780 },
  { name: '402', width: 402, height: 874 },
  { name: '430', width: 430, height: 932 },
]

const browser = await chromium.launch({ headless: true })
const results = []

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

async function wizardToPhoto(page) {
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

async function measurePreview(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('[data-testid="photo-preview-wrap"]')
    const img = document.querySelector('[data-testid="photo-preview"]')
    const controls = document.querySelector('[data-testid="photo-preview-controls"]')
    if (!wrap || !img || !controls) return null
    const wrapRect = wrap.getBoundingClientRect()
    const imgRect = img.getBoundingClientRect()
    const imgCs = getComputedStyle(img)
    const controlsCs = getComputedStyle(controls)
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      wrap: { w: wrapRect.width, h: wrapRect.height },
      img: {
        w: imgRect.width,
        h: imgRect.height,
        aspect: Number((imgRect.width / imgRect.height).toFixed(3)),
        objectFit: imgCs.objectFit,
        borderRadius: imgCs.borderRadius,
        classes: img.className,
      },
      controls: {
        backgroundImage: controlsCs.backgroundImage,
      },
    }
  })
}

try {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    await login(page, player.display_name)

    for (const fixture of fixtures) {
      await wizardToPhoto(page)
      await page.locator('[data-testid="photo-upload-input"]').setInputFiles(fixture.file)
  await acceptPhotoFraming(page)
      await page.waitForSelector('[data-testid="photo-preview"]', { timeout: 30000 })
      // Staging may take a moment; preview should exist immediately after process.
      await page.waitForTimeout(400)
      const metrics = await measurePreview(page)
      results.push({ viewport: vp.name, fixture: fixture.key, metrics })

      const shotName = `preview-${fixture.key}-${vp.name}.png`
      await page.locator('[data-testid="wizard-photo-step"]').screenshot({
        path: join(outDir, shotName),
      })
      console.log(`shot ${shotName}`, metrics?.img)

      if (fixture.key === 'landscape' && vp.name === '402') {
        await page.click('[data-testid="photo-continue"]')
        await page.waitForSelector('[data-testid="review-photo-preview"]', { timeout: 20000 })
        await page.waitForTimeout(300)
        await page.locator('[data-testid="wizard-review-step"]').screenshot({
          path: join(outDir, `review-landscape-${vp.name}.png`),
        })
        const reviewMetrics = await page.evaluate(() => {
          const img = document.querySelector('[data-testid="review-photo-image"]')
          if (!img) return null
          const r = img.getBoundingClientRect()
          const cs = getComputedStyle(img)
          return {
            w: r.width,
            h: r.height,
            aspect: Number((r.width / r.height).toFixed(3)),
            objectFit: cs.objectFit,
            classes: img.className,
          }
        })
        results.push({ viewport: vp.name, fixture: 'review-landscape', metrics: reviewMetrics })
        console.log('review metrics', reviewMetrics)

        // Submit once so Gallery can be compared for the same framing.
        await page.click('[data-testid="submit-drink"]')
        const unclaimed = page.locator('[data-testid="modal-unclaimed"]')
        if (await unclaimed.isVisible().catch(() => false)) {
          await page.click('[data-testid="modal-primary"]')
        }
        await page.waitForURL(/\/drinkit\/gallery/, { timeout: 45000 })
        await page.waitForSelector('[data-testid="gallery-post-photo"], [data-testid="gallery-post-placeholder"]', {
          timeout: 30000,
        })
        await page.waitForTimeout(800)
        const galleryPhoto = page.locator('[data-testid="gallery-post-photo"] img, .gallery-polaroid-photo').first()
        if (await galleryPhoto.count()) {
          await page.locator('[data-testid="gallery-post"]').first().screenshot({
            path: join(outDir, `gallery-landscape-${vp.name}.png`),
          })
          const galleryMetrics = await page.evaluate(() => {
            const img = document.querySelector('.gallery-polaroid-photo')
            if (!img) return null
            const r = img.getBoundingClientRect()
            const cs = getComputedStyle(img)
            return {
              w: r.width,
              h: r.height,
              aspect: Number((r.width / r.height).toFixed(3)),
              objectFit: cs.objectFit,
              objectPosition: cs.objectPosition,
              classes: img.className,
            }
          })
          results.push({ viewport: vp.name, fixture: 'gallery-landscape', metrics: galleryMetrics })
          console.log('gallery metrics', galleryMetrics)
        }
      }
    }

    await context.close()
  }

  await writeFile(join(outDir, 'RESULTS.json'), JSON.stringify(results, null, 2))
  console.log(`Wrote ${results.length} metric rows to ${outDir}`)
} finally {
  await browser.close()
}
