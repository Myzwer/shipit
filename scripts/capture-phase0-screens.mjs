/**
 * Capture Phase 0 mobile screenshots at an exact 390×844 CSS viewport (DPR 2 → 780×1688 PNGs).
 * Usage: node scripts/capture-phase0-screens.mjs [baseUrl]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const outDir = join(dirname(fileURLToPath(import.meta.url)), '../docs/phase0-screenshots')

const shots = [
  { path: '/', file: 'phase0-game-selection.png' },
  { path: '/drinkit', file: 'phase0-drinkit-home.png' },
  { path: '/shipit', file: 'phase0-shipit-home.png' },
]

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
})
const page = await context.newPage()

for (const shot of shots) {
  await page.goto(`${baseUrl}${shot.path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const buffer = await page.screenshot({ type: 'png', fullPage: false })
  const target = join(outDir, shot.file)
  await writeFile(target, buffer)
  console.log(`wrote ${shot.file} (${buffer.length} bytes)`)
}

await browser.close()
console.log(
  JSON.stringify({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    expectedPngPixels: { width: 780, height: 1688 },
    outDir,
  }),
)
