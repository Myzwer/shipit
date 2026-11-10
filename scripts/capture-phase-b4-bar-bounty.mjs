/**
 * Phase B4 — Bar Bounty crew + Friends preview captures.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-phase-b3-bar-bounty.mjs [baseUrl]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  (
    await readFile(
      join(dirname(fileURLToPath(import.meta.url)), '../.local/runtime-qual-password.txt'),
      'utf8',
    )
  ).trim()

if (!password || password.length < 12) {
  console.error('Set LOCAL_TEST_PASSWORD or .local/runtime-qual-password.txt')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const summary = JSON.parse(await readFile(join(root, '.local/test-identities.json'), 'utf8'))
const drinkPlayer =
  summary.identities.find((i) => i.key === 'josh_forrester') ||
  summary.identities.find((i) => Array.isArray(i.games) && i.games.includes('drinkit')) ||
  summary.identities[0]
const adminPlayer = summary.identities.find((i) => i.is_admin) || drinkPlayer

const outDir = join(root, 'docs/phase-b4-bar-bounty')
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

async function gotoDrinkHome(page) {
  const launch = await page.$('[data-testid="launch-drinkit"]')
  if (launch) await launch.click()
  else await page.goto(`${baseUrl}/drinkit`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bounty-carousel"]', { timeout: 20000 })
  await page.waitForTimeout(600)
}

async function openBarWizard(page) {
  // Prefer deep-link to featured bar from home card claim prefill query.
  const barKey = await page
    .locator('[data-testid="bounty-card-bar"]')
    .getAttribute('data-bar-key')
    .catch(() => null)
  const href = barKey
    ? `${baseUrl}/drinkit/log?from=bar&bar=${encodeURIComponent(barKey)}`
    : `${baseUrl}/drinkit/log?from=plus`
  await page.goto(href, { waitUntil: 'networkidle' })
  await page.waitForSelector(
    '[data-testid="wizard-friends-step"], [data-testid="wizard-bar-step"], [data-testid="wizard-drink-step"]',
    { timeout: 20000 },
  )
}

async function safeClick(locator) {
  try {
    await locator.click({ timeout: 8000 })
    return true
  } catch {
    try {
      await locator.click({ force: true, timeout: 5000 })
      return true
    } catch {
      return false
    }
  }
}

async function reachFriendsStep(page) {
  for (let i = 0; i < 12; i++) {
    if (await page.locator('[data-testid="wizard-friends-step"]').count()) return true
    if (await page.locator('[data-testid="wizard-bar-step"]').count()) {
      await page.waitForSelector('[data-testid^="bar-row-"]', { timeout: 15000 }).catch(() => null)
      const firstBar = page.locator('[data-testid^="bar-row-"]').first()
      if (!(await firstBar.count())) {
        await page.waitForTimeout(400)
        continue
      }
      if (!(await safeClick(firstBar))) await page.waitForTimeout(400)
      await page.waitForTimeout(500)
      continue
    }
    if (await page.locator('[data-testid="wizard-drink-step"]').count()) {
      await page
        .waitForSelector('[data-testid="drink-generic-beer"], [data-testid^="drink-row-"]', {
          timeout: 15000,
        })
        .catch(() => null)
      const beer = page.locator('[data-testid="drink-generic-beer"]')
      if (await beer.count()) {
        if (!(await safeClick(beer))) await page.waitForTimeout(400)
      } else {
        const named = page.locator('[data-testid^="drink-row-"]').first()
        if (!(await named.count())) {
          await page.waitForTimeout(400)
          continue
        }
        if (!(await safeClick(named))) await page.waitForTimeout(400)
      }
      await page.waitForTimeout(700)
      continue
    }
    await page.waitForTimeout(400)
  }
  return (await page.locator('[data-testid="wizard-friends-step"]').count()) > 0
}

const results = []
const browser = await chromium.launch({ headless: true })

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
  await login(page, drinkPlayer.display_name)
  await gotoDrinkHome(page)

  const barCard = page.locator('[data-testid="bounty-card-bar"]')
  await barCard.scrollIntoViewIfNeeded()
  await page.waitForTimeout(350)
  const cardPath = join(outDir, `bar-card-${vp.name}.png`)
  await barCard.screenshot({ path: cardPath })
  const crewText = await page.locator('[data-testid="bar-bounty-crew"]').textContent().catch(() => null)
  results.push({ viewport: vp.name, shot: `bar-card-${vp.name}.png`, crewText })
  console.log(`PASS bar-card-${vp.name} crew=${crewText?.slice(0, 80) ?? 'n/a'}`)

  if (vp.name === '402') {
    await openBarWizard(page)
    const reached = await reachFriendsStep(page)
    if (!reached) {
      const body = (await page.locator('body').innerText()).slice(0, 400)
      console.log('SKIP friends captures — wizard body:', body.replace(/\s+/g, ' '))
    } else {
      await page.screenshot({ path: join(outDir, 'friends-empty-402.png'), fullPage: false })
      console.log('PASS friends-empty-402')

      const crewRow = page.locator('[data-crew-mate="true"]').first()
      if (await crewRow.count()) {
        await crewRow.click()
        await page.waitForTimeout(700)
        await page.screenshot({ path: join(outDir, 'friends-one-crewmate-402.png'), fullPage: false })
        const preview = await page.locator('[data-testid="bar-bounty-points-preview"]').textContent()
        results.push({ shot: 'friends-one-crewmate-402.png', preview })
        console.log('PASS friends-one-crewmate-402', preview?.trim())

        const second = page.locator('[data-crew-mate="true"]').nth(1)
        if (await second.count()) {
          await second.click()
          await page.waitForTimeout(700)
          await page.screenshot({ path: join(outDir, 'friends-full-crew-402.png'), fullPage: false })
          const preview2 = await page
            .locator('[data-testid="bar-bounty-points-preview"]')
            .textContent()
          results.push({ shot: 'friends-full-crew-402.png', preview: preview2 })
          console.log('PASS friends-full-crew-402', preview2?.trim())
        }
      } else {
        console.log('SKIP friends crew rows (no assigned crew visible)')
      }
    }
  }

  await page.close()
}

{
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } })
  await login(page, adminPlayer.display_name)
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="bar-bounty-crews-section"]', { timeout: 20000 })
  const section = page.locator('[data-testid="bar-bounty-crews-section"]')
  await section.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await section.screenshot({ path: join(outDir, 'admin-crews-402.png') })
  console.log('PASS admin-crews-402')
  await page.close()
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await login(page, drinkPlayer.display_name)
  await gotoDrinkHome(page)
  await page.locator('[data-testid="bounty-card-bar"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(outDir, 'bar-card-desktop.png'), fullPage: false })
  console.log('PASS bar-card-desktop')
  await page.close()
}

await browser.close()
await writeFile(join(outDir, 'capture-summary.json'), JSON.stringify(results, null, 2))
console.log(`Wrote captures to ${outDir}`)
