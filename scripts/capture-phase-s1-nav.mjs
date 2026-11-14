/**
 * Phase S1 — compare Drink It! / Ship It! floating bottom nav geometry.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-phase-s1-nav.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  (await readFile(join(dirname(fileURLToPath(import.meta.url)), '../.local/runtime-qual-password.txt'), 'utf8')).trim()

if (!password || password.length < 12) {
  console.error('Set LOCAL_TEST_PASSWORD or .local/runtime-qual-password.txt')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const both =
  summary.identities.find((i) => i.key === 'both') ||
  summary.identities.find(
    (i) => Array.isArray(i.games) && i.games.includes('drinkit') && i.games.includes('shipit'),
  )
if (!both) {
  console.error('Need a dual-game identity (drinkit + shipit)')
  process.exit(1)
}
console.log(`Using identity ${both.key} (${both.display_name})`)

const outDir = join(root, 'docs/phase-s1-nav')
await mkdir(outDir, { recursive: true })

const viewports = [
  { name: '360', width: 360, height: 740 },
  { name: '390', width: 390, height: 844 },
  { name: '402', width: 402, height: 874 },
  { name: '430', width: 430, height: 932 },
]

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

async function measureNav(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label$="navigation"]')
    const pill = nav?.querySelector(':scope > div')
    const item = nav?.querySelector('[data-testid="nav-item"]')
    const active = nav?.querySelector('[data-testid="nav-item"][aria-current="page"]')
    const icon = item?.querySelector('svg, i, span')
    if (!nav || !pill || !item) return null
    const navRect = nav.getBoundingClientRect()
    const pillRect = pill.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    const activeRect = active?.getBoundingClientRect()
    const cs = getComputedStyle(pill)
    const itemCs = getComputedStyle(item)
    const activeCs = active ? getComputedStyle(active) : null
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      nav: {
        paddingBottom: getComputedStyle(nav).paddingBottom,
        paddingLeft: getComputedStyle(nav).paddingLeft,
        paddingRight: getComputedStyle(nav).paddingRight,
        bottomOffset: window.innerHeight - pillRect.bottom,
        height: navRect.height,
      },
      pill: {
        width: Math.round(pillRect.width * 100) / 100,
        height: Math.round(pillRect.height * 100) / 100,
        left: Math.round(pillRect.left * 100) / 100,
        borderRadius: cs.borderRadius,
        paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        paddingRight: cs.paddingRight,
        boxShadow: cs.boxShadow,
        background: cs.backgroundColor,
      },
      item: {
        width: Math.round(itemRect.width * 100) / 100,
        height: Math.round(itemRect.height * 100) / 100,
        borderRadius: itemCs.borderRadius,
      },
      active: active
        ? {
            width: Math.round(activeRect.width * 100) / 100,
            height: Math.round(activeRect.height * 100) / 100,
            borderRadius: activeCs.borderRadius,
            background: activeCs.backgroundColor,
          }
        : null,
      iconFontSize: icon ? getComputedStyle(icon).fontSize : null,
    }
  })
}

async function gotoGameHome(page, game) {
  if (game === 'drinkit') {
    const sel = await page.$('[data-testid="launch-drinkit"]')
    if (sel) {
      await sel.click()
    } else {
      await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
    }
    await page.waitForURL('**/drinkit', { timeout: 15000 })
  } else {
    const sel = await page.$('[data-testid="launch-shipit"]')
    if (sel) {
      await sel.click()
    } else {
      await page.goto(`${baseUrl}/shipit`, { waitUntil: 'networkidle' })
    }
    await page.waitForURL('**/shipit', { timeout: 15000 })
  }
  await page.waitForSelector('nav[aria-label$="navigation"]', { timeout: 15000 })
  await page.waitForTimeout(300)
}

const browser = await chromium.launch({ headless: true })
const report = { viewports: {}, screens: [] }

try {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    await login(page, both.display_name)
    await page.waitForSelector('[data-testid="game-selection"], nav[aria-label$="navigation"]', {
      timeout: 15000,
    })

    await gotoGameHome(page, 'drinkit')
    const drink = await measureNav(page)
    await page.screenshot({
      path: join(outDir, `${vp.name}-drinkit-home.png`),
      fullPage: false,
    })
    // Crop-ish full viewport nav focus already in full shot; also clip nav region
    const drinkPillBox = await page.locator('nav[aria-label$="navigation"] > div').boundingBox()
    if (drinkPillBox) {
      await page.screenshot({
        path: join(outDir, `${vp.name}-drinkit-nav-crop.png`),
        clip: {
          x: Math.max(0, drinkPillBox.x - 16),
          y: Math.max(0, drinkPillBox.y - 16),
          width: Math.min(vp.width, drinkPillBox.width + 32),
          height: drinkPillBox.height + 32 + 8,
        },
      })
    }

    await page.goto(`${baseUrl}/shipit`, { waitUntil: 'networkidle' })
    await page.waitForSelector('nav[aria-label$="navigation"]', { timeout: 15000 })
    await page.waitForTimeout(300)
    const ship = await measureNav(page)
    await page.screenshot({
      path: join(outDir, `${vp.name}-shipit-home.png`),
      fullPage: false,
    })
    const shipPillBox = await page.locator('nav[aria-label$="navigation"] > div').boundingBox()
    if (shipPillBox) {
      await page.screenshot({
        path: join(outDir, `${vp.name}-shipit-nav-crop.png`),
        clip: {
          x: Math.max(0, shipPillBox.x - 16),
          y: Math.max(0, shipPillBox.y - 16),
          width: Math.min(vp.width, shipPillBox.width + 32),
          height: shipPillBox.height + 32 + 8,
        },
      })
    }

    // Spot-check Ship It routes share the same nav geometry
    const routeChecks = {}
    for (const path of ['/shipit/challenges', '/shipit/gallery', '/shipit/achievements']) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('nav[aria-label$="navigation"]', { timeout: 15000 })
      await page.waitForTimeout(200)
      const m = await measureNav(page)
      routeChecks[path] = {
        pillWidth: m?.pill.width,
        pillHeight: m?.pill.height,
        itemWidth: m?.item.width,
        itemHeight: m?.item.height,
        borderRadius: m?.pill.borderRadius,
        background: m?.pill.background,
      }
    }

    report.viewports[vp.name] = {
      drink,
      ship,
      delta: drink && ship
        ? {
            pillWidth: Math.round((ship.pill.width - drink.pill.width) * 100) / 100,
            pillHeight: Math.round((ship.pill.height - drink.pill.height) * 100) / 100,
            itemWidth: Math.round((ship.item.width - drink.item.width) * 100) / 100,
            itemHeight: Math.round((ship.item.height - drink.item.height) * 100) / 100,
            bottomOffset: Math.round((ship.nav.bottomOffset - drink.nav.bottomOffset) * 100) / 100,
          }
        : null,
      shipRoutes: routeChecks,
    }

    console.log(
      `${vp.name}: drink ${drink?.pill.width}×${drink?.pill.height} ship ${ship?.pill.width}×${ship?.pill.height} Δw=${report.viewports[vp.name].delta?.pillWidth} Δh=${report.viewports[vp.name].delta?.pillHeight}`,
    )
    await context.close()
  }

  // Compose a simple side-by-side HTML contact sheet for 402
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Phase S1 Nav</title>
<style>
  body{font:14px/1.4 system-ui;background:#111;color:#eee;margin:24px}
  .row{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px}
  figure{margin:0;background:#1b1b1b;padding:12px;border-radius:12px}
  img{display:block;max-width:402px;width:100%;height:auto;border-radius:8px}
  pre{background:#000;padding:12px;border-radius:8px;overflow:auto}
</style></head><body>
<h1>Phase S1 — Bottom Nav</h1>
<div class="row">
  <figure><figcaption>Drink It! 402</figcaption><img src="402-drinkit-home.png"></figure>
  <figure><figcaption>Ship It! 402</figcaption><img src="402-shipit-home.png"></figure>
</div>
<div class="row">
  <figure><figcaption>Drink It! nav crop</figcaption><img src="402-drinkit-nav-crop.png"></figure>
  <figure><figcaption>Ship It! nav crop</figcaption><img src="402-shipit-nav-crop.png"></figure>
</div>
<pre>${JSON.stringify(report.viewports['402'], null, 2)}</pre>
</body></html>`
  await writeFile(join(outDir, 'compare-402.html'), html)
  await writeFile(join(outDir, 'measurements.json'), JSON.stringify(report, null, 2))
  console.log(`Wrote ${outDir}`)
} finally {
  await browser.close()
}
