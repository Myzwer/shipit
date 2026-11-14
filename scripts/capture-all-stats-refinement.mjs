/**
 * Visual check for Drink It! All Stats card refinement (fixture dump, no QA switch).
 *
 *   node scripts/capture-all-stats-refinement.mjs [baseUrl]
 */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'docs/qa/wrapped-all-stats-refinement')
mkdirSync(outDir, { recursive: true })

const baseUrl = process.argv[2] || 'http://127.0.0.1:5173'

async function capture(page, width, mode) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`${baseUrl}/all-stats-preview.html`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('[data-testid="wrapped-all-stats"]', { timeout: 20000 })
  await page.getByRole('button', { name: String(width) }).click()
  await page.waitForTimeout(200)

  const tab = mode === 'mine' ? 'wrapped-stats-mine' : 'wrapped-stats-ours'
  await page.getByTestId(tab).click()
  await page.waitForTimeout(250)

  const section = page.getByTestId('wrapped-all-stats')
  const rows = section.getByTestId('wrapped-stats-row')
  const rowCount = await rows.count()
  const sample = []
  for (let i = 0; i < Math.min(rowCount, 8); i += 1) {
    const row = rows.nth(i)
    sample.push({
      specId: await row.getAttribute('data-spec-id'),
      label: (await row.locator('.stats__label').textContent())?.trim() ?? '',
      value: (await row.locator('.stats__value').textContent())?.trim() ?? '',
      detail: (await row.locator('.stats__detail').count())
        ? ((await row.locator('.stats__detail').textContent())?.trim() ?? '')
        : null,
      iconFontSize: await row.locator('.stats__icon-glyph').evaluate((el) => getComputedStyle(el).fontSize),
      valueFontSize: await row.locator('.stats__value').evaluate((el) => getComputedStyle(el).fontSize),
      labelFontSize: await row.locator('.stats__label').evaluate((el) => getComputedStyle(el).fontSize),
      detailFontSize: (await row.locator('.stats__detail').count())
        ? await row.locator('.stats__detail').evaluate((el) => getComputedStyle(el).fontSize)
        : null,
      expandFontSize: (await row.locator('.stats__expand-btn').count())
        ? await row.locator('.stats__expand-btn').evaluate((el) => getComputedStyle(el).fontSize)
        : null,
      iconPanelWidth: await row.locator('.stats__icon').evaluate((el) => getComputedStyle(el).width),
    })
  }

  const file = join(outDir, `drinkit-${mode}-${width}.png`)
  await section.screenshot({ path: file })
  return { width, mode, rowCount, sample, file }
}

async function captureFooter(page, width) {
  await page.setViewportSize({ width, height: 1100 })
  await page.goto(`${baseUrl}/all-stats-preview.html`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.getByRole('button', { name: String(width) }).click()
  await page.waitForTimeout(200)

  const ending = page.getByTestId('wrapped-ending')
  const account = page.getByTestId('wrapped-account-preview')
  await ending.scrollIntoViewIfNeeded()

  const endingBg = await ending.evaluate((el) => getComputedStyle(el).backgroundImage)
  const accountBg = await account.evaluate((el) => getComputedStyle(el).backgroundImage)
  const file = join(outDir, `drinkit-footer-${width}.png`)
  const clip = await page.evaluate(() => {
    const end = document.querySelector('[data-testid="wrapped-ending"]')
    const acc = document.querySelector('[data-testid="wrapped-account-utility"]')
    if (!(end instanceof HTMLElement) || !(acc instanceof HTMLElement)) return null
    const a = end.getBoundingClientRect()
    const b = acc.getBoundingClientRect()
    return {
      x: Math.min(a.left, b.left) - 8,
      y: a.top - 8,
      width: Math.max(a.width, b.width) + 16,
      height: b.bottom - a.top + 16,
    }
  })
  if (clip) {
    await page.screenshot({
      path: file,
      clip: {
        x: Math.max(0, clip.x),
        y: Math.max(0, clip.y),
        width: Math.min(width, clip.width),
        height: clip.height,
      },
    })
  }
  return {
    width,
    endingBg,
    accountBg,
    coolOk:
      /rgb\(\s*183\s*,\s*230\s*,\s*225\s*\)/.test(endingBg) &&
      /rgb\(\s*224\s*,\s*245\s*,\s*238\s*\)/.test(endingBg) &&
      /rgb\(\s*183\s*,\s*230\s*,\s*225\s*\)/.test(accountBg) &&
      /rgb\(\s*224\s*,\s*245\s*,\s*238\s*\)/.test(accountBg),
    file: file.replace(`${root}/`, ''),
  }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const results = []
const footers = []
try {
  for (const width of [360, 402]) {
    for (const mode of ['mine', 'ours']) {
      results.push(await capture(page, width, mode))
    }
    footers.push(await captureFooter(page, width))
  }
} finally {
  await browser.close()
}

const report = {
  captured_at: new Date().toISOString(),
  baseUrl,
  footerCoolGradientToken: 'var(--theme-gradient-cool) → #b7e6e1 to #e0f5ee',
  footers,
  results: results.map((r) => ({
    ...r,
    file: r.file.replace(`${root}/`, ''),
  })),
}
writeFileSync(join(outDir, 'REPORT.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
