import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const password = process.env.LOCAL_TEST_PASSWORD
if (!password) { console.error('Need LOCAL_TEST_PASSWORD'); process.exit(1) }
const summary = JSON.parse(await readFile(join(process.cwd(), '.local/test-identities.json'), 'utf8'))
const drink = summary.identities.find((i) => (i.games || []).includes('drinkit'))
if (!drink) { console.error('No drinkit identity'); process.exit(1) }
const shotDir = join(process.cwd(), 'docs/a5-achievements-screenshots')
await mkdir(shotDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()
await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
await page.selectOption('#login-name', { label: drink.display_name })
await page.fill('#login-password', password)
await page.click('button[type="submit"]')
await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
await page.goto(`${baseUrl}/drinkit/achievements`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="achievements-view"]', { timeout: 20000 })
await page.waitForTimeout(700)
await page.screenshot({ path: join(shotDir, 'before-mine-402.png'), fullPage: true })
await page.click('[data-testid="achievements-tab-all"]')
await page.waitForTimeout(900)
await page.screenshot({ path: join(shotDir, 'before-all-402.png'), fullPage: true })
console.log('BEFORE_OK', drink.display_name, shotDir)
await browser.close()
