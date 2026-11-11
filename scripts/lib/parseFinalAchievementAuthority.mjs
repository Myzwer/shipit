/**
 * Parse STAR_PRINCESS_ACHIEVEMENTS_FINAL_STANDALONE.md into structured rows.
 * The markdown tables are the sole content authority.
 */
import { readFileSync } from 'node:fs'

export function parseFinalAchievementAuthority(mdPath) {
  const md = readFileSync(mdPath, 'utf8')
  const rows = []
  const categories = []
  let game = null
  let category = null
  let categoryExpected = null

  for (const line of md.split('\n')) {
    if (line.startsWith('## 5. Drink It!')) {
      game = 'drinkit'
      continue
    }
    if (line.startsWith('## 6. Ship It!')) {
      game = 'shipit'
      continue
    }
    if (line.startsWith('## 7.')) break

    const cat = line.match(/^### (.+) — (\d+)\s*$/)
    if (cat && game) {
      category = cat[1]
      categoryExpected = Number(cat[2])
      categories.push({ game, name: category, expected: categoryExpected })
      continue
    }

    if (!line.startsWith('|') || !game || !category) continue
    if (line.includes('---') || line.includes('Name |')) continue

    const cells = line
      .split('|')
      .map((s) => s.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
    if (cells.length < 4) continue
    const [name, trigger, iconRaw, secretRaw] = cells
    if (name === 'Name') continue
    rows.push({
      game,
      category,
      name,
      trigger,
      iconClass: iconRaw.replace(/`/g, '').trim(),
      secret: secretRaw.trim() === 'Y',
    })
  }

  const drinkit = rows.filter((r) => r.game === 'drinkit')
  const shipit = rows.filter((r) => r.game === 'shipit')
  if (drinkit.length !== 126 || shipit.length !== 48) {
    throw new Error(
      `Final authority parse count mismatch: drinkit=${drinkit.length} shipit=${shipit.length}`,
    )
  }
  for (const c of categories) {
    const n = rows.filter((r) => r.game === c.game && r.category === c.name).length
    if (n !== c.expected) {
      throw new Error(`Category count mismatch: ${c.game}/${c.name} got ${n} expected ${c.expected}`)
    }
  }

  return { rows, categories, drinkit, shipit }
}
