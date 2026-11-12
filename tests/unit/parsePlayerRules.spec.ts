import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parsePlayerRulesMarkdown,
  ruleEmphasisRuns,
} from '@/lib/precruise/parsePlayerRules'

const rulesMd = readFileSync(
  resolve(process.cwd(), 'content/precruise/PC1_Player_Rules_Approved_Copy.md'),
  'utf8',
)

describe('parsePlayerRulesMarkdown', () => {
  const games = parsePlayerRulesMarkdown(rulesMd)

  it('parses both games with four selector categories', () => {
    expect(games.map((g) => g.game)).toEqual(['shipit', 'drinkit'])
    for (const game of games) {
      expect(game.categories.map((c) => c.key)).toEqual([
        'quick',
        'full',
        'strategy',
        'faq',
      ])
      expect(game.categories.map((c) => c.label)).toEqual([
        'Quick Rules',
        'Full Rules',
        'Strategy Guide',
        'FAQ',
      ])
      expect(game.intro.length).toBeGreaterThan(0)
    }
  })

  it('keeps Ship It! Quick Rules accordion titles and buddy photo emphasis', () => {
    const ship = games.find((g) => g.game === 'shipit')!
    const quick = ship.categories.find((c) => c.key === 'quick')!
    expect(quick.sections.map((s) => s.title)).toEqual([
      'The Basics',
      'How to Play',
      'How to Win',
      'When Can We Play?',
    ])
    const howToPlay = quick.sections.find((s) => s.title === 'How to Play')!
    const photoStep = howToPlay.blocks
      .flatMap((b) => (b.type === 'list' ? b.items ?? [] : [b.text ?? '']))
      .find((t) => t.includes('You must be in the photo'))
    expect(photoStep).toContain('**You must be in the photo!**')
  })

  it('keeps Drink It! buddy rule and All Hands wording', () => {
    const drink = games.find((g) => g.game === 'drinkit')!
    expect(drink.intro[0]).toContain('May the bravest player win')
    expect(drink.intro[1]).toContain('explore the ship')

    const full = drink.categories.find((c) => c.key === 'full')!
    expect(full.sections[0]?.title).toBe('The Buddy Rule — Every Bounty')
    const daily = full.sections.find((s) => s.title === 'Daily Challenges')!
    const joined = daily.blocks
      .flatMap((b) => (b.type === 'list' ? b.items ?? [] : [b.text ?? '']))
      .join('\n')
    expect(joined).toContain('All Hands')
    expect(joined).toContain('attend and participate at the announced time')
  })

  it('defaults FAQ accordion count for Ship It!', () => {
    const ship = games.find((g) => g.game === 'shipit')!
    const faq = ship.categories.find((c) => c.key === 'faq')!
    expect(faq.sections.length).toBe(10)
  })
})

describe('ruleEmphasisRuns', () => {
  it('splits bold markers', () => {
    expect(ruleEmphasisRuns('Hello **world** now')).toEqual([
      { text: 'Hello ', strong: false },
      { text: 'world', strong: true },
      { text: ' now', strong: false },
    ])
  })
})
