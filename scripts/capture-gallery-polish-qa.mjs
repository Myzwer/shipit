/**
 * Visual QA capture for Tuesday Gallery caption polish + Read More behavior.
 * Writes under .local/gallery-polish/screenshots (gitignored; may include real names).
 *
 *   LOCAL_TEST_PASSWORD='…' node scripts/capture-gallery-polish-qa.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')
const outDir = join(root, '.local/gallery-polish/screenshots')
mkdirSync(outDir, { recursive: true })

const password =
  process.env.LOCAL_TEST_PASSWORD ||
  readFileSync(join(root, '.local/runtime-qual-password.txt'), 'utf8').trim()
const baseUrl = process.env.APP_URL || 'http://localhost:5173'
const reportPath = join(root, '.local/gallery-polish/REPORT.json')
const polish = JSON.parse(readFileSync(reportPath, 'utf8'))

const widths = [
  { name: '360', width: 360, height: 780 },
  { name: '390', width: 390, height: 844 },
  { name: '402', width: 402, height: 874 },
  { name: '430', width: 430, height: 932 },
  { name: 'desktop', width: 1280, height: 900 },
]

const drinkLongIds = (polish.after.drinkit.long || []).map((r) => r.event_id)
const shipLongIds = (
  polish.shipit_long_repositioned?.applied ||
  polish.after.shipit.long ||
  []
).map((r) => r.event_id)

const results = {
  captured_at: new Date().toISOString(),
  baseUrl,
  drinkLongIds,
  shipLongIds,
  checks: {},
  defects: [],
}

async function login(page, redirect) {
  await page.goto(`${baseUrl}/login?redirect=${encodeURIComponent(redirect)}`, {
    waitUntil: 'networkidle',
  })
  await page.selectOption('#login-name', { label: 'Josh' })
  await page.fill('#login-password', password)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 })
}

async function ensureFeed(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="gallery-feed"]', { timeout: 25000 })
  await page.waitForSelector('[data-testid="gallery-post"]', { timeout: 25000 })
}

async function loadUntilEvent(page, eventId, { maxScrolls = 40 } = {}) {
  for (let i = 0; i < maxScrolls; i++) {
    const loc = page.locator(`[data-testid="gallery-post"][data-event-id="${eventId}"]`)
    if ((await loc.count()) > 0) {
      await loc.first().scrollIntoViewIfNeeded()
      await page.waitForTimeout(200)
      return loc.first()
    }
    const sentinel = page.locator('[data-testid="gallery-sentinel"]')
    if ((await sentinel.count()) > 0) {
      await sentinel.scrollIntoViewIfNeeded()
    } else {
      await page.mouse.wheel(0, 2200)
    }
    await page.waitForTimeout(450)
  }
  return null
}

async function findPost(page, eventId) {
  const loc = page.locator(`[data-testid="gallery-post"][data-event-id="${eventId}"]`)
  if ((await loc.count()) === 0) return null
  return loc.first()
}

async function measureCaption(post) {
  return post.evaluate((el) => {
    const caption = el.querySelector('[data-testid="gallery-post-caption"]')
    const toggle = el.querySelector('[data-testid="gallery-caption-toggle"]')
    if (!caption) {
      return { hasCaption: false }
    }
    const cs = getComputedStyle(caption)
    return {
      hasCaption: true,
      textLen: (caption.textContent || '').trim().length,
      clientHeight: caption.clientHeight,
      scrollHeight: caption.scrollHeight,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      bodyOverflowX: document.body.scrollWidth > document.body.clientWidth,
      whiteSpace: cs.whiteSpace,
      clamped: caption.classList.contains('is-clamped'),
      toggleText: toggle?.textContent?.trim() || null,
      toggleExpanded: toggle?.getAttribute('aria-expanded') || null,
      hasToggle: Boolean(toggle),
    }
  })
}

async function reactionUsable(post) {
  const btn = post.locator('[data-testid="gallery-reactions"] button').first()
  if ((await btn.count()) === 0) return false
  return btn.isEnabled()
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 402, height: 874 } })

await login(page, '/drinkit/gallery')

// ---- Drink It! across widths ----
for (const vp of widths) {
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await ensureFeed(page, '/drinkit/gallery')
  await page.screenshot({
    path: join(outDir, `drinkit-feed-${vp.name}.png`),
    fullPage: false,
  })

  const extremeId = drinkLongIds.find((id) => {
    // prefer longest
    const row = polish.after.drinkit.long.find((r) => r.event_id === id)
    return row && row.len >= 1000
  }) || drinkLongIds[drinkLongIds.length - 1]

  const post = (await loadUntilEvent(page, extremeId)) || (await findPost(page, extremeId))
  const check = { viewport: vp.name, eventId: extremeId, found: Boolean(post) }
  if (post) {
    await post.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    const before = await measureCaption(post)
    check.collapsed = before
    await page.screenshot({
      path: join(outDir, `drinkit-long-collapsed-${vp.name}.png`),
      fullPage: false,
    })

    if (before.hasToggle) {
      await post.locator('[data-testid="gallery-caption-toggle"]').click()
      await page.waitForTimeout(250)
      const expanded = await measureCaption(post)
      check.expanded = expanded
      await page.screenshot({
        path: join(outDir, `drinkit-long-expanded-${vp.name}.png`),
        fullPage: false,
      })
      check.reactionsUsableExpanded = await reactionUsable(post)

      await post.locator('[data-testid="gallery-caption-toggle"]').click()
      await page.waitForTimeout(250)
      const reco = await measureCaption(post)
      check.recollapsed = reco
      check.reactionsUsableCollapsed = await reactionUsable(post)
    } else {
      check.defect = 'No Read More toggle on overflowing Drink It! caption'
    }
  }
  results.checks[`drinkit_${vp.name}`] = check
}

// Independent expand of two long posts at 402
await page.setViewportSize({ width: 402, height: 874 })
await ensureFeed(page, '/drinkit/gallery')
const multi = { independent: true, posts: [] }
for (const id of drinkLongIds.slice(0, 2)) {
  const post = await findPost(page, id)
  if (!post) {
    multi.posts.push({ id, found: false })
    continue
  }
  await post.scrollIntoViewIfNeeded()
  const before = await measureCaption(post)
  if (before.hasToggle) {
    await post.locator('[data-testid="gallery-caption-toggle"]').click()
    await page.waitForTimeout(200)
  }
  const after = await measureCaption(post)
  multi.posts.push({ id, before, after })
}
await page.screenshot({ path: join(outDir, 'drinkit-two-expanded-402.png'), fullPage: false })
// Expand state should remain independent (both can be expanded)
multi.bothExpanded = multi.posts.every((p) => p.after?.toggleExpanded === 'true' || !p.before?.hasToggle)
results.checks.drinkit_independent_expand = multi

// Reaction stability: expand shouldn't wipe reaction counts in DOM
{
  const id = drinkLongIds[0]
  const post = await findPost(page, id)
  if (post) {
    const countsBefore = await post.locator('[data-testid="gallery-reactions"]').innerText()
    const toggle = post.locator('[data-testid="gallery-caption-toggle"]')
    if (await toggle.count()) {
      // ensure collapsed then expand
      if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click()
      await toggle.click()
      await page.waitForTimeout(200)
      const countsAfter = await post.locator('[data-testid="gallery-reactions"]').innerText()
      results.checks.drinkit_reaction_stable = {
        ok: countsBefore === countsAfter,
        countsBefore,
        countsAfter,
      }
    }
  }
}

// ---- Ship It! ----
for (const vp of widths) {
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await ensureFeed(page, '/shipit/gallery')
  await page.screenshot({
    path: join(outDir, `shipit-feed-${vp.name}.png`),
    fullPage: false,
  })

  // Prefer extreme stress-test caption; fall back through long set.
  const preferred =
    (polish.shipit_long_repositioned?.applied || []).find((r) => r.key === 'extreme')?.event_id ||
    shipLongIds[shipLongIds.length - 1]

  const post = await loadUntilEvent(page, preferred)
  const check = { viewport: vp.name, eventId: preferred, found: Boolean(post) }
  if (post) {
    await post.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    const measured = await measureCaption(post)
    check.caption = measured
    // "collapsed" shot — full text today if no toggle exists
    await page.screenshot({
      path: join(outDir, `shipit-long-collapsed-${vp.name}.png`),
      fullPage: false,
    })
    if (measured.hasToggle) {
      await post.locator('[data-testid="gallery-caption-toggle"]').click()
      await page.waitForTimeout(250)
      check.expanded = await measureCaption(post)
      await page.screenshot({
        path: join(outDir, `shipit-long-expanded-${vp.name}.png`),
        fullPage: false,
      })
      await post.locator('[data-testid="gallery-caption-toggle"]').click()
      await page.waitForTimeout(200)
    } else {
      // Still capture a second scroll-focused shot for organizer review of full long caption.
      await page.screenshot({
        path: join(outDir, `shipit-long-expanded-${vp.name}.png`),
        fullPage: false,
      })
      check.readMorePresent = false
    }
    check.reactionsUsable = await reactionUsable(post)
  }
  results.checks[`shipit_${vp.name}`] = check
}

// Detect Ship It! Read More absence as Visual QA defect (once)
{
  const sample = results.checks.shipit_402
  if (sample?.found && sample?.caption?.hasCaption && !sample.caption.hasToggle) {
    results.defects.push({
      id: 'QA-GALLERY-READMORE-SHIPIT',
      severity: 'visual_qa',
      summary:
        'Ship It! Gallery scavenger posts render full captions without Read More / Show less clamp-toggle. Drink It! drink_log social cards have the behavior; Ship It! does not.',
      evidence: sample,
    })
  } else if (!sample?.found) {
    results.defects.push({
      id: 'QA-GALLERY-READMORE-SHIPIT-UNVERIFIED',
      severity: 'visual_qa',
      summary: 'Could not locate Ship It! long caption post in the loaded Gallery feed for Read More verification.',
      evidence: sample,
    })
  }
}

// Drink It! checklist rollup at 402
{
  const c = results.checks.drinkit_402
  results.drinkit_readmore_checklist = {
    truncatedPreview: Boolean(c?.collapsed?.clamped && c?.collapsed?.hasToggle),
    readMoreOnlyWhenOverflow: Boolean(c?.collapsed?.hasToggle),
    expandRevealsFull: c?.expanded?.toggleExpanded === 'true' && c?.expanded?.clamped === false,
    collapseWorks: c?.recollapsed?.toggleExpanded === 'false' || c?.recollapsed?.clamped === true,
    noHorizontalScroll: !(c?.collapsed?.overflowX || c?.expanded?.overflowX),
    reactionsUsable: Boolean(c?.reactionsUsableExpanded && c?.reactionsUsableCollapsed),
    independentExpand: Boolean(results.checks.drinkit_independent_expand?.bothExpanded),
    reactionsStableOnToggle: Boolean(results.checks.drinkit_reaction_stable?.ok),
  }
}

writeFileSync(join(outDir, 'QA-RESULTS.json'), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
await browser.close()
