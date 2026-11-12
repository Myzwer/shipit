/**
 * Parse PC1 approved player-rules Markdown into dropdown + accordion data.
 * Preserves wording; only structures headings / lists / bold markers.
 */

export type RulesCategoryKey = 'quick' | 'full' | 'strategy' | 'faq'

export interface RulesContentBlock {
  type: 'paragraph' | 'list'
  /** Paragraph text or list items; may include `**bold**` markers. */
  text?: string
  ordered?: boolean
  items?: string[]
}

export interface RulesAccordionSection {
  title: string
  blocks: RulesContentBlock[]
}

export interface RulesCategory {
  key: RulesCategoryKey
  label: string
  sections: RulesAccordionSection[]
}

export interface GameRulesContent {
  game: 'drinkit' | 'shipit'
  title: string
  intro: string[]
  categories: RulesCategory[]
}

const CATEGORY_META: { match: RegExp; key: RulesCategoryKey; label: string }[] = [
  { match: /^1\.\s*QUICK RULES$/i, key: 'quick', label: 'Quick Rules' },
  { match: /^2\.\s*FULL RULES$/i, key: 'full', label: 'Full Rules' },
  { match: /^3\.\s*STRATEGY GUIDE$/i, key: 'strategy', label: 'Strategy Guide' },
  { match: /^4\.\s*FAQ$/i, key: 'faq', label: 'FAQ' },
]

const GAME_HEADERS: { match: RegExp; game: 'drinkit' | 'shipit'; title: string }[] = [
  { match: /^#\s*SHIP IT!\s*$/i, game: 'shipit', title: 'SHIP IT!' },
  { match: /^#\s*DRINK IT!\s*$/i, game: 'drinkit', title: 'DRINK IT!' },
]

function stripHtmlComment(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, '').trim()
}

function parseBlocks(body: string): RulesContentBlock[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const blocks: RulesContentBlock[] = []
  let paragraph: string[] = []
  let listItems: string[] = []
  let listOrdered: boolean | null = null

  function flushParagraph() {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim()
    paragraph = []
    if (text) blocks.push({ type: 'paragraph', text })
  }

  function flushList() {
    if (listItems.length === 0) return
    blocks.push({
      type: 'list',
      ordered: Boolean(listOrdered),
      items: [...listItems],
    })
    listItems = []
    listOrdered = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = line.trim()
    if (!trimmed || trimmed === '---') {
      flushParagraph()
      flushList()
      continue
    }

    const ul = trimmed.match(/^[-*]\s+(.+)$/)
    const ol = trimmed.match(/^\d+\.\s+(.+)$/)
    if (ul || ol) {
      flushParagraph()
      const ordered = Boolean(ol)
      if (listOrdered !== null && listOrdered !== ordered) flushList()
      listOrdered = ordered
      listItems.push((ul?.[1] ?? ol?.[1] ?? '').trim())
      continue
    }

    flushList()
    paragraph.push(trimmed)
  }

  flushParagraph()
  flushList()
  return blocks
}

function parseGameBody(body: string): { intro: string[]; categories: RulesCategory[] } {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const intro: string[] = []
  const categories: RulesCategory[] = []

  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i]!.trim()
    if (!trimmed || trimmed === '---') {
      i += 1
      continue
    }
    if (trimmed.startsWith('## ')) break

    if (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**')) {
      intro.push(trimmed.slice(1, -1).trim())
      i += 1
      continue
    }

    // Non-italic intro sentences (Drink It! has a plain paragraph after the italic).
    const chunk: string[] = [trimmed]
    i += 1
    while (i < lines.length) {
      const next = lines[i]!.trim()
      if (!next || next === '---' || next.startsWith('## ') || next.startsWith('#')) break
      if (next.startsWith('*') && next.endsWith('*') && !next.startsWith('**')) break
      chunk.push(next)
      i += 1
    }
    intro.push(chunk.join(' ').replace(/\s+/g, ' ').trim())
  }

  while (i < lines.length) {
    const trimmed = lines[i]!.trim()
    if (!trimmed.startsWith('## ')) {
      i += 1
      continue
    }

    const heading = trimmed.replace(/^##\s+/, '').trim()
    const meta = CATEGORY_META.find((c) => c.match.test(heading))
    i += 1
    if (!meta) continue

    const sectionChunks: { title: string; body: string }[] = []
    let currentTitle: string | null = null
    let currentBody: string[] = []

    const flushSection = () => {
      if (!currentTitle) return
      sectionChunks.push({ title: currentTitle, body: currentBody.join('\n') })
      currentTitle = null
      currentBody = []
    }

    while (i < lines.length) {
      const line = lines[i]!
      const t = line.trim()
      if (t.startsWith('## ')) break
      if (t.startsWith('# ') && !t.startsWith('## ') && !t.startsWith('### ')) break

      if (t.startsWith('### ')) {
        flushSection()
        currentTitle = t.replace(/^###\s+/, '').trim()
        i += 1
        continue
      }

      if (currentTitle) currentBody.push(line)
      i += 1
    }
    flushSection()

    categories.push({
      key: meta.key,
      label: meta.label,
      sections: sectionChunks.map((s) => ({
        title: s.title,
        blocks: parseBlocks(s.body),
      })),
    })
  }

  return { intro, categories }
}

/** Split the approved rules Markdown into Drink It! / Ship It! page models. */
export function parsePlayerRulesMarkdown(md: string): GameRulesContent[] {
  const cleaned = stripHtmlComment(md)
  const lines = cleaned.replace(/\r\n/g, '\n').split('\n')
  const games: GameRulesContent[] = []

  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i]!.trim()
    const header = GAME_HEADERS.find((h) => h.match.test(trimmed))
    if (!header) {
      i += 1
      continue
    }

    i += 1
    const bodyLines: string[] = []
    while (i < lines.length) {
      const next = lines[i]!.trim()
      if (GAME_HEADERS.some((h) => h.match.test(next))) break
      bodyLines.push(lines[i]!)
      i += 1
    }

    const { intro, categories } = parseGameBody(bodyLines.join('\n'))
    games.push({
      game: header.game,
      title: header.title,
      intro,
      categories,
    })
  }

  return games
}

/** Split `**bold**` markers into render runs. */
export function ruleEmphasisRuns(text: string): { text: string; strong: boolean }[] {
  return text.split('**').map((part, index) => ({ text: part, strong: index % 2 === 1 }))
}
