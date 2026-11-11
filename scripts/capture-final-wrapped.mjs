/**
 * Capture Cruise Wrapped screenshots without destroying the Tuesday demo.
 * Temporarily latches finale, captures Drink It! + Ship It! Wrapped, then restores.
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-final-wrapped.mjs [baseUrl]
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import ws from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'docs/final-wrapped-screenshots')
mkdirSync(outDir, { recursive: true })

const baseUrl = process.argv[2] || 'http://localhost:5173'
const password =
  process.env.LOCAL_TEST_PASSWORD ||
  readFileSync(join(root, '.local/runtime-qual-password.txt'), 'utf8').trim()
if (!password) {
  console.error('LOCAL_TEST_PASSWORD required')
  process.exit(1)
}

const envText = execSync('npx supabase status -o env', { encoding: 'utf8' })
const apiUrl = envText.match(/^API_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
const serviceKey = envText.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
const service = createClient(apiUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

const summary = JSON.parse(readFileSync(join(root, '.local/test-identities.json'), 'utf8'))
const josh = summary.identities.find((i) => i.key === 'josh_forrester')

const { data: prior } = await service.from('game_control').select('game, finalized_at_utc, status')
const finaleAt = new Date().toISOString()

async function setControl(patch) {
  for (const game of ['drinkit', 'shipit']) {
    const { error } = await service.from('game_control').update(patch).eq('game', game)
    if (error) throw error
  }
}

async function restore() {
  for (const row of prior ?? []) {
    await service
      .from('game_control')
      .update({ finalized_at_utc: row.finalized_at_utc, status: row.status })
      .eq('game', row.game)
  }
}

async function login(page, displayName) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#login-name, [data-testid="login-name-trigger"]', {
    timeout: 20000,
  })
  if (await page.locator('#login-name').count()) {
    await page.selectOption('#login-name', { label: displayName })
  } else {
    await page.getByTestId('login-name-trigger').click()
    await page.getByRole('option', { name: displayName }).click()
  }
  await page.fill('#login-password', password)
  await page.getByTestId('login-submit').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
}

await setControl({ finalized_at_utc: finaleAt, status: 'final' })
console.log('Finale latched for capture')

const browser = await chromium.launch({ headless: true })
const results = []

try {
  for (const width of [360, 390, 402, 430]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    await login(page, josh.display_name)

    for (const game of ['drinkit', 'shipit']) {
      await page.goto(`${baseUrl}/${game}/wrapped`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1200)

      const notAvailable = page.getByTestId('wrapped-not-available')
      if (await notAvailable.count()) {
        throw new Error(`${game} Wrapped still not_available after latch at ${width}px`)
      }

      const start = page.getByTestId('wrapped-start')
      if (await start.count()) {
        await start.click()
      }
      await page.waitForSelector('[data-testid="wrapped-results"]', { timeout: 20000 })

      const path = join(outDir, `${game}-${width}-viewport.png`)
      await page.screenshot({ path, fullPage: false })
      results.push({ game, width, path, kind: 'viewport' })

      if (width === 402) {
        const full = join(outDir, `${game}-402-fullpage.png`)
        await page.screenshot({ path: full, fullPage: true })
        results.push({ game, width, path: full, kind: 'fullpage' })

        const awards = page.getByTestId('wrapped-awards-list')
        if (await awards.count()) {
          await awards.scrollIntoViewIfNeeded()
          const awardsPath = join(outDir, `${game}-402-global-awards.png`)
          await page.screenshot({ path: awardsPath, fullPage: false })
          results.push({ game, width, path: awardsPath, kind: 'awards' })
        }

        const collective = page.getByTestId('wrapped-collective-list')
        if (await collective.count()) {
          await collective.scrollIntoViewIfNeeded()
          const collectivePath = join(outDir, `${game}-402-collective.png`)
          await page.screenshot({ path: collectivePath, fullPage: false })
          results.push({ game, width, path: collectivePath, kind: 'collective' })
        }
      }
    }
    await context.close()
  }
} catch (err) {
  console.error(err)
  await restore()
  process.exitCode = 1
} finally {
  await browser.close()
  await restore()
  console.log('Finale latch restored.')
}

writeFileSync(
  join(outDir, 'RESULTS.json'),
  JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2),
)
console.log(`Captured ${results.length} screenshots to ${outDir}`)
